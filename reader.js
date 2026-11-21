"use strict";

/* =========================================
   MY COZY SHELF — READER
   TXT, PDF, EPUB and DOCX
   ========================================= */

const DB_NAME = "MyCozyShelfReaderDB";
const DB_VERSION = 1;
const STORE_NAME = "readerData";

let db = null;
let bookData = null;
let currentBookKey = null;
let readerPages = [];
let currentPageIndex = 0;
let librarySelection = null;
let readingSessionId = makeID();
let visitedPages = new Set();

let originalText = "";
let personalText = "";

let bookmarks = [];
let notes = [];
let journalEntries = [];
let highlights = [];

let savedPosition = 0;
let currentHighlightColor = "yellow";
let saveTimer = null;

const $ = id => document.getElementById(id);

const uploadForm = $("reader-upload-form");
const fileInput = $("reader-file");
const fileMessage = $("reader-file-message");

const bookTitle = $("reader-book-title");
const bookAuthor = $("reader-book-author");
const bookContent = $("reader-book-content");

const progressBar = $("reader-progress-bar");
const progressText = $("reader-progress-text");
const positionText = $("reader-position-text");

const settingsButton = $("reader-settings-btn");
const settingsPanel = $("reader-settings-panel");

const fontSelect = $("reader-font");
const fontSizeInput = $("reader-font-size");
const fontSizeValue = $("reader-font-size-value");
const lineSpacingSelect = $("reader-line-spacing");
const themeSelect = $("reader-theme");

const saveButton = $("save-reader-btn");

const yellowButton = $("highlight-yellow-btn");
const pinkButton = $("highlight-pink-btn");
const removeHighlightButton = $("remove-highlight-btn");

const editButton = $("edit-book-text-btn");
const editPanel = $("reader-edit-panel");
const editTextarea = $("reader-edit-text");
const saveEditButton = $("save-book-edit-btn");
const cancelEditButton = $("cancel-book-edit-btn");
const editMessage = $("reader-edit-message");

const addBookmarkButton = $("add-bookmark-btn");
const bookmarksList = $("reader-bookmarks-list");

const noteForm = $("reader-note-form");
const noteTitleInput = $("reader-note-title");
const noteContentInput = $("reader-note-content");
const notesList = $("reader-notes-list");

const journalForm = $("reader-journal-form");
const journalInput = $("reader-journal-entry");
const journalList = $("reader-journal-list");

const highlightsList = $("reader-highlights-list");
const prevPageButton = $("reader-prev-page");
const nextPageButton = $("reader-next-page");
const pageLabel = $("reader-page-label");


/* =========================================
   1. HELPERS
   ========================================= */

function showMessage(element, text) {
    if (element) element.textContent = text;
}

function showToast(text) {
    let toast = $("reader-toast");

    if (!toast) {
        toast = document.createElement("div");
        toast.id = "reader-toast";

        toast.style.cssText = `
            position:fixed;
            right:20px;
            bottom:20px;
            z-index:9999;
            padding:14px 20px;
            background:#684b55;
            color:white;
            border-radius:14px;
            box-shadow:0 5px 20px #0002;
            font-family:Arial,sans-serif;
        `;

        document.body.appendChild(toast);
    }

    toast.textContent = text;

    clearTimeout(toast._timer);

    toast._timer = setTimeout(() => {
        toast.remove();
    }, 2500);
}

function makeID() {
    return crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now()) + Math.random().toString(16).slice(2);
}

function getExtension(file) {
    const name = file.name.toLowerCase();
    return name.slice(name.lastIndexOf("."));
}

function addEmptyItem(list, text) {
    if (!list) return;

    list.replaceChildren();

    const li = document.createElement("li");
    li.className = "reader-empty-item";
    li.textContent = text;

    list.appendChild(li);
}


/* =========================================
   2. INDEXEDDB
   ========================================= */

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const database = request.result;

            if (!database.objectStoreNames.contains(STORE_NAME)) {
                database.createObjectStore(STORE_NAME, {
                    keyPath: "id"
                });
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function databaseAction(mode, action) {
    return new Promise((resolve, reject) => {
        if (!db) {
            reject(new Error("Database is not ready."));
            return;
        }

        const transaction = db.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);

        let request;

        try {
            request = action(store);
        } catch (error) {
            reject(error);
            return;
        }

        transaction.oncomplete = () => resolve(request?.result);

        transaction.onerror = () => {
            reject(transaction.error || new Error("Database error."));
        };

        transaction.onabort = () => {
            reject(new Error("Database operation was cancelled."));
        };
    });
}

async function getBook(id) {
    return databaseAction("readonly", store => store.get(id));
}

async function saveBook() {
    if (!db || !bookData || !currentBookKey) return;

    bookData.originalText = originalText;
    bookData.personalText = personalText;
    bookData.bookmarks = bookmarks;
    bookData.notes = notes;
    bookData.journalEntries = journalEntries;
    bookData.highlights = highlights;
    bookData.position = savedPosition;
    bookData.currentPageIndex = currentPageIndex;
    bookData.updatedAt = new Date().toISOString();

    bookData.settings = {
        font: fontSelect.value,
        fontSize: fontSizeInput.value,
        lineSpacing: lineSpacingSelect.value,
        theme: themeSelect.value
    };

    await databaseAction("readwrite", store => store.put(bookData));
}

async function fingerprint(file, text) {
    const input = new TextEncoder().encode(
        file.name + "\n" + file.size + "\n" + text
    );

    if (crypto.subtle) {
        const digest = await crypto.subtle.digest("SHA-256", input);

        return [...new Uint8Array(digest)]
            .map(byte => byte.toString(16).padStart(2, "0"))
            .join("");
    }

    let hash = 0;

    for (const character of text) {
        hash = (hash * 31 + character.charCodeAt(0)) | 0;
    }

    return file.name + "-" + Math.abs(hash);
}


/* =========================================
   3. FILE EXTRACTION
   ========================================= */

async function extractBookText(file) {
    const extension = getExtension(file);

    if (extension === ".txt") {
        return await file.text();
    }

    if (extension === ".pdf") {
        if (!window.pdfjsLib) {
            throw new Error(
                "PDF library failed to load. Check your internet connection."
            );
        }

        pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

        const pdf = await pdfjsLib.getDocument({
            data: await file.arrayBuffer()
        }).promise;

        const pages = [];

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
            showMessage(
                fileMessage,
                `Extracting PDF page ${pageNumber} of ${pdf.numPages}...`
            );

            const page = await pdf.getPage(pageNumber);
            const content = await page.getTextContent();

            pages.push(
                content.items
                    .map(item => item.str || "")
                    .join(" ")
            );
        }

        return pages.join("\n\n");
    }

    if (extension === ".docx") {
        if (!window.mammoth) {
            throw new Error(
                "DOCX library failed to load. Check your internet connection."
            );
        }

        const result = await mammoth.extractRawText({
            arrayBuffer: await file.arrayBuffer()
        });

        return result.value || "";
    }

    if (extension === ".epub") {
        if (!window.JSZip) {
            throw new Error(
                "EPUB library failed to load. Check your internet connection."
            );
        }

        return await extractEPUB(file);
    }

    throw new Error("Unsupported format. Choose TXT, PDF, EPUB or DOCX.");
}

async function extractEPUB(file) {
    const zip = await JSZip.loadAsync(await file.arrayBuffer());

    const container = zip.file("META-INF/container.xml");

    if (!container) {
        throw new Error("Invalid EPUB: container file is missing.");
    }

    const containerXML = new DOMParser().parseFromString(
        await container.async("text"),
        "application/xml"
    );

    const packagePath = containerXML
        .getElementsByTagName("rootfile")[0]
        ?.getAttribute("full-path");

    if (!packagePath) {
        throw new Error("Could not locate EPUB contents.");
    }

    const packageFile = zip.file(packagePath);

    if (!packageFile) {
        throw new Error("EPUB package could not be read.");
    }

    const packageXML = new DOMParser().parseFromString(
        await packageFile.async("text"),
        "application/xml"
    );

    const manifest = new Map();

    packageXML.querySelectorAll("manifest item").forEach(item => {
        manifest.set(
            item.getAttribute("id"),
            item.getAttribute("href")
        );
    });

    const spine = [
        ...packageXML.querySelectorAll("spine itemref")
    ].map(item => item.getAttribute("idref"));

    const directory = packagePath.includes("/")
        ? packagePath.slice(0, packagePath.lastIndexOf("/") + 1)
        : "";

    const chapters = [];

    for (const id of spine) {
        const href = manifest.get(id);

        if (!href) continue;

        let path;

        try {
            path = decodeURIComponent(href.split("#")[0]);
        } catch {
            path = href.split("#")[0];
        }

        const fullPath = normalizeZipPath(directory + path);
        const chapter = zip.file(fullPath);

        if (!chapter) continue;

        const html = await chapter.async("text");

        const parsed = new DOMParser().parseFromString(
            html,
            "text/html"
        );

        parsed.querySelectorAll(
            "script,style,nav,svg"
        ).forEach(element => element.remove());

        const text = (
            parsed.body?.innerText ||
            parsed.body?.textContent ||
            ""
        ).trim();

        if (text) chapters.push(text);
    }

    return chapters.join("\n\n");
}

function normalizeZipPath(path) {
    const parts = [];

    for (const part of path.replace(/\\/g, "/").split("/")) {
        if (!part || part === ".") continue;

        if (part === "..") {
            parts.pop();
        } else {
            parts.push(part);
        }
    }

    return parts.join("/");
}


/* =========================================
   4. UPLOAD AND OPEN
   ========================================= */

uploadForm.addEventListener("submit", async event => {
    event.preventDefault();
    readingSessionId = makeID();

    const file = fileInput.files[0];

    if (!file) {
        showMessage(fileMessage, "Please select a book first.");
        return;
    }

    const allowed = [".txt", ".pdf", ".epub", ".docx"];

    if (!allowed.includes(getExtension(file))) {
        showMessage(
            fileMessage,
            "Please select a TXT, PDF, EPUB or DOCX file."
        );
        return;
    }

    try {
        showMessage(fileMessage, "Opening your book... 📚");

        const text = await extractBookText(file);

        if (!text.trim()) {
            throw new Error(
                "No readable text found. Scanned PDFs may require OCR."
            );
        }

        const id = "book-" + await fingerprint(file, text);
        const saved = await getBook(id);

        if (saved) {
            bookData = saved;

            originalText = saved.originalText ?? text;
            personalText = saved.personalText ?? text;

            bookmarks = saved.bookmarks || [];
            notes = saved.notes || [];
            journalEntries = saved.journalEntries || [];
            highlights = saved.highlights || [];

            savedPosition = saved.position || 0;
            currentPageIndex = saved.currentPageIndex || 0;

            restoreSettings(saved.settings || {});
        } else {
            originalText = text;
            personalText = text;

            bookmarks = [];
            notes = [];
            journalEntries = [];
            highlights = [];

            savedPosition = 0;
            currentPageIndex = 0;

            bookData = {
                id,
                title: file.name.replace(/\.[^.]+$/, ""),
                author: "Your reading collection",
                fileType: getExtension(file).slice(1),
                originalText: text,
                personalText: text,
                bookmarks: [],
                notes: [],
                journalEntries: [],
                highlights: [],
                position: 0,
                settings: {
                    font: "serif",
                    fontSize: "18",
                    lineSpacing: "1.8",
                    theme: "light"
                }
            };

            restoreSettings(bookData.settings);
        }

        currentBookKey = id;
        try { librarySelection = JSON.parse(localStorage.getItem("myCozyShelfCurrentBook") || "null"); } catch { librarySelection = null; }

        bookTitle.textContent = bookData.title;

        bookAuthor.textContent =
            `${bookData.author} · ${bookData.fileType.toUpperCase()}`;

        renderBook();
        renderBookmarks();
        renderNotes();
        renderJournal();
        renderHighlights();

        await saveBook();

        restorePosition();
        visitedPages = new Set([currentPageIndex]);
        await recordLibraryPage();

        showMessage(fileMessage, "Your book is ready to read! 💗");
        showToast("Welcome to your reading nook! ☕");

    } catch (error) {
        console.error(error);

        showMessage(
            fileMessage,
            "Could not open book: " + error.message
        );
    }
});


/* =========================================
   5. RENDER BOOK AND PROGRESS
   ========================================= */

function buildReaderPages(text) {
    const pages = [];
    let page = [];
    let wordCount = 0;
    text.split(/\r?\n/).forEach((value, index) => {
        const words = value.trim().split(/\s+/).filter(Boolean);
        if (words.length > 320) {
            if (page.length) { pages.push(page); page = []; wordCount = 0; }
            for (let offset = 0; offset < words.length; offset += 320) {
                pages.push([{ text: words.slice(offset, offset + 320).join(" "), index }]);
            }
            return;
        }
        if (page.length && wordCount + words.length > 320) {
            pages.push(page); page = []; wordCount = 0;
        }
        page.push({ text: value, index });
        wordCount += words.length;
    });
    if (page.length || !pages.length) pages.push(page);
    return pages;
}

function renderBook() {
    readerPages = buildReaderPages(personalText);
    currentPageIndex = Math.min(Math.max(0, currentPageIndex), readerPages.length - 1);
    bookContent.replaceChildren();
    (readerPages[currentPageIndex] || []).forEach(item => {
        const paragraph = document.createElement("p");
        paragraph.dataset.paragraph = String(item.index);
        paragraph.textContent = item.text || "\u00A0";
        bookContent.appendChild(paragraph);
    });
    restoreHighlights();
    updateProgress();
}

function getPosition() {
    return readerPages.length <= 1 ? 0 : currentPageIndex / (readerPages.length - 1);
}

function updateProgress() {
    const percentage = readerPages.length ? Math.round((currentPageIndex + 1) / readerPages.length * 100) : 0;
    progressBar.value = percentage;
    progressText.textContent = percentage + "% completed";
    positionText.textContent = readerPages.length ? `Page ${currentPageIndex + 1} of ${readerPages.length}` : "Start reading to track your progress.";
    if (pageLabel) pageLabel.textContent = `Page ${readerPages.length ? currentPageIndex + 1 : 0} of ${readerPages.length}`;
    if (prevPageButton) prevPageButton.disabled = !currentBookKey || currentPageIndex <= 0;
    if (nextPageButton) nextPageButton.disabled = !currentBookKey || currentPageIndex >= readerPages.length - 1;
}

function restorePosition() {
    currentPageIndex = Number.isInteger(bookData?.currentPageIndex)
        ? Math.min(bookData.currentPageIndex, Math.max(0, readerPages.length - 1))
        : Math.round(savedPosition * Math.max(0, readerPages.length - 1));
    renderBook();
}

async function recordLibraryPage() {
    if (!librarySelection?.id) return;
    try {
        const library = JSON.parse(localStorage.getItem("myCozyShelfBooks") || "[]");
        const book = library.find(item => String(item.id) === String(librarySelection.id))
            || library.find(item => librarySelection.localFileId && item.localFileId === librarySelection.localFileId)
            || library.find(item => item.title === librarySelection.title && !item.source);
        if (!book) return;
        const now = new Date().toISOString();
        if (!Array.isArray(book.readHistory)) book.readHistory = [];
        const last = book.readHistory[book.readHistory.length - 1];
        if (!last || last.readerSession !== readingSessionId) {
            book.readHistory.push({ date: now, sessionPages: 1, totalPages: Number(book.pagesRead || 0) + 1, readerSession: readingSessionId });
        } else {
            last.sessionPages = visitedPages.size || 1;
            last.totalPages = Math.max(Number(book.pagesRead) || 0, currentPageIndex + 1);
            last.date = now;
        }
        book.pagesRead = Math.max(Number(book.pagesRead) || 0, currentPageIndex + 1);
        book.currentPage = currentPageIndex + 1;
        book.status = "Reading";
        localStorage.setItem("myCozyShelfBooks", JSON.stringify(library));
    } catch (error) { console.warn("Could not update library reading history", error); }
}

async function goToPage(index) {
    if (!readerPages.length) return;
    const next = Math.max(0, Math.min(readerPages.length - 1, index));
    if (next === currentPageIndex) return;
    currentPageIndex = next;
    visitedPages.add(currentPageIndex);
    savedPosition = getPosition();
    renderBook();
    await saveBook();
    await recordLibraryPage();
    bookContent.focus({ preventScroll: true });
}

prevPageButton?.addEventListener("click", () => goToPage(currentPageIndex - 1));
nextPageButton?.addEventListener("click", () => goToPage(currentPageIndex + 1));
bookContent.addEventListener("keydown", event => {
    if (event.key === "ArrowLeft") goToPage(currentPageIndex - 1);
    if (event.key === "ArrowRight" || event.key === "PageDown") goToPage(currentPageIndex + 1);
});


/* =========================================
   6. SETTINGS
   ========================================= */

settingsButton.addEventListener("click", () => {
    settingsPanel.hidden = !settingsPanel.hidden;
});

function restoreSettings(settings) {
    fontSelect.value = settings.font || "serif";
    fontSizeInput.value = settings.fontSize || "18";
    lineSpacingSelect.value = settings.lineSpacing || "1.8";
    themeSelect.value = settings.theme || "light";

    applySettings();
}

function applySettings() {
    bookContent.style.fontFamily = {
        serif: "Georgia, serif",
        "sans-serif": "Arial, sans-serif",
        monospace: "monospace"
    }[fontSelect.value];

    bookContent.style.fontSize = fontSizeInput.value + "px";
    bookContent.style.lineHeight = lineSpacingSelect.value;

    bookContent.classList.remove(
        "theme-light",
        "theme-sepia",
        "theme-dark"
    );

    bookContent.classList.add("theme-" + themeSelect.value);

    fontSizeValue.textContent = fontSizeInput.value + "px";
}

[
    fontSelect,
    fontSizeInput,
    lineSpacingSelect,
    themeSelect
].forEach(control => {
    control.addEventListener("input", () => {
        applySettings();

        if (currentBookKey) {
            saveBook().catch(console.error);
        }
    });
});


/* =========================================
   7. SAVE BUTTON
   ========================================= */

saveButton.addEventListener("click", async () => {
    try {
        await saveBook();

        showMessage(fileMessage, "Reading data saved successfully! 💗");
        showToast("Your progress has been saved.");
    } catch (error) {
        showMessage(fileMessage, error.message);
    }
});


/* =========================================
   8. PERSONAL COPY EDITOR
   ========================================= */

editButton.addEventListener("click", () => {
    if (!currentBookKey) {
        showToast("Open a book before editing.");
        return;
    }

    editTextarea.value = personalText;
    editPanel.hidden = false;

    editPanel.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
});

saveEditButton.addEventListener("click", async () => {
    if (!currentBookKey) return;

    if (!confirm("Save changes to your personal copy?")) return;

    personalText = editTextarea.value;

    try {
        await saveBook();

        renderBook();
        editPanel.hidden = true;

        showMessage(editMessage, "Your personal copy has been saved.");
        showToast("Personal copy updated! ✨");
    } catch (error) {
        showMessage(editMessage, error.message);
    }
});

cancelEditButton.addEventListener("click", () => {
    editPanel.hidden = true;
    editTextarea.value = "";
});


/* =========================================
   9. BOOKMARKS
   ========================================= */

addBookmarkButton.addEventListener("click", async () => {
    if (!currentBookKey) {
        showToast("Open a book before adding a bookmark.");
        return;
    }

    const name = prompt("Name this bookmark:", "My Favourite Page");

    if (!name || !name.trim()) return;

    bookmarks.push({
        id: makeID(),
        name: name.trim(),
        position: getPosition(),
        createdAt: new Date().toISOString()
    });

    await saveBook();

    renderBookmarks();
    showToast("Bookmark added! 🔖");
});

function renderBookmarks() {
    bookmarksList.replaceChildren();

    if (!bookmarks.length) {
        addEmptyItem(bookmarksList, "No bookmarks yet.");
        return;
    }

    bookmarks.forEach(bookmark => {
        const li = document.createElement("li");

        const open = document.createElement("button");
        open.type = "button";
        open.textContent =
            `${bookmark.name} (${Math.round(bookmark.position * 100)}%)`;

        open.addEventListener("click", () => {
            const max =
                bookContent.scrollHeight - bookContent.clientHeight;

            bookContent.scrollTop =
                bookmark.position * Math.max(0, max);

            updateProgress();
        });

        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Delete";

        remove.addEventListener("click", async () => {
            bookmarks = bookmarks.filter(item => item.id !== bookmark.id);

            await saveBook();
            renderBookmarks();
        });

        li.append(open, remove);
        bookmarksList.appendChild(li);
    });
}


/* =========================================
   10. NOTES
   ========================================= */

noteForm.addEventListener("submit", async event => {
    event.preventDefault();

    if (!currentBookKey) {
        showToast("Open a book before saving notes.");
        return;
    }

    const title = noteTitleInput.value.trim();
    const content = noteContentInput.value.trim();

    if (!content) return;

    notes.push({
        id: makeID(),
        title: title || "My Note",
        content,
        createdAt: new Date().toISOString()
    });

    await saveBook();

    noteForm.reset();
    renderNotes();

    showToast("Note saved! 📝");
});

function renderNotes() {
    notesList.replaceChildren();

    if (!notes.length) {
        const p = document.createElement("p");
        p.className = "reader-empty-item";
        p.textContent = "Your notes will appear here.";

        notesList.appendChild(p);
        return;
    }

    notes.forEach(note => {
        const card = document.createElement("article");

        const heading = document.createElement("h3");
        heading.textContent = note.title;

        const content = document.createElement("p");
        content.textContent = note.content;

        const edit = document.createElement("button");
        edit.type = "button";
        edit.textContent = "Edit";

        edit.addEventListener("click", async () => {
            const title = prompt("Edit title:", note.title);
            if (title === null) return;

            const text = prompt("Edit note:", note.content);
            if (text === null) return;

            note.title = title.trim() || "My Note";
            note.content = text.trim();

            await saveBook();
            renderNotes();
        });

        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Delete";

        remove.addEventListener("click", async () => {
            notes = notes.filter(item => item.id !== note.id);

            await saveBook();
            renderNotes();
        });

        card.append(heading, content, edit, remove);
        notesList.appendChild(card);
    });
}


/* =========================================
   11. READING JOURNAL
   ========================================= */

journalForm.addEventListener("submit", async event => {
    event.preventDefault();

    if (!currentBookKey) {
        showToast("Open a book before writing in your journal.");
        return;
    }

    const content = journalInput.value.trim();

    if (!content) return;

    journalEntries.push({
        id: makeID(),
        content,
        createdAt: new Date().toISOString()
    });

    await saveBook();

    journalForm.reset();
    renderJournal();

    showToast("Journal entry saved! 🌷");
});

function renderJournal() {
    journalList.replaceChildren();

    if (!journalEntries.length) {
        const p = document.createElement("p");
        p.className = "reader-empty-item";
        p.textContent = "Your journal is empty.";

        journalList.appendChild(p);
        return;
    }

    journalEntries.forEach(entry => {
        const card = document.createElement("article");

        const text = document.createElement("p");
        text.textContent = entry.content;

        const date = document.createElement("small");
        date.textContent = new Date(entry.createdAt).toLocaleString();

        const edit = document.createElement("button");
        edit.type = "button";
        edit.textContent = "Edit";

        edit.addEventListener("click", async () => {
            const updated = prompt("Edit journal entry:", entry.content);

            if (updated === null) return;

            entry.content = updated.trim();

            await saveBook();
            renderJournal();
        });

        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Delete";

        remove.addEventListener("click", async () => {
            journalEntries = journalEntries.filter(
                item => item.id !== entry.id
            );

            await saveBook();
            renderJournal();
        });

        card.append(text, date, edit, remove);
        journalList.appendChild(card);
    });
}


/* =========================================
   12. TEXT HIGHLIGHTS
   ========================================= */

yellowButton.addEventListener("click", () => {
    currentHighlightColor = "yellow";
    highlightSelection();
});

pinkButton.addEventListener("click", () => {
    currentHighlightColor = "pink";
    highlightSelection();
});

function textOffset(paragraph, targetNode, targetOffset) {
    const walker = document.createTreeWalker(
        paragraph,
        NodeFilter.SHOW_TEXT
    );

    let offset = 0;
    let node;

    while ((node = walker.nextNode())) {
        if (node === targetNode) {
            return offset + targetOffset;
        }

        offset += node.textContent.length;
    }

    return -1;
}

function highlightSelection() {
    if (!currentBookKey) {
        showToast("Open a book before highlighting.");
        return;
    }

    const selection = window.getSelection();

    if (!selection || selection.isCollapsed) {
        showToast("Select some text first.");
        return;
    }

    const range = selection.getRangeAt(0);

    if (
        !bookContent.contains(range.startContainer) ||
        !bookContent.contains(range.endContainer)
    ) {
        showToast("Select text inside the book.");
        return;
    }

    const startP = range.startContainer.parentElement.closest("p");
    const endP = range.endContainer.parentElement.closest("p");

    if (!startP || startP !== endP) {
        showToast("Select text within one paragraph at a time.");
        return;
    }

    const start = textOffset(
        startP,
        range.startContainer,
        range.startOffset
    );

    const end = textOffset(
        startP,
        range.endContainer,
        range.endOffset
    );

    if (start < 0 || end <= start) return;

    highlights.push({
        id: makeID(),
        paragraphIndex: Number(startP.dataset.paragraph),
        startOffset: start,
        endOffset: end,
        text: selection.toString(),
        color: currentHighlightColor
    });

    selection.removeAllRanges();

    saveBook()
        .then(() => {
            renderBook();
            renderHighlights();
            showToast("Passage highlighted! ✨");
        })
        .catch(error => {
            showMessage(fileMessage, error.message);
        });
}

function restoreHighlights() {
    const grouped = new Map();

    highlights.forEach(highlight => {
        if (!grouped.has(highlight.paragraphIndex)) {
            grouped.set(highlight.paragraphIndex, []);
        }

        grouped.get(highlight.paragraphIndex).push(highlight);
    });

    grouped.forEach((items, index) => {
        const paragraph = bookContent.querySelector(
            `p[data-paragraph="${index}"]`
        );

        if (!paragraph) return;

        // Work backwards so earlier offsets remain valid.
        items.sort((a, b) => b.startOffset - a.startOffset);

        items.forEach(highlight => {
            let text = paragraph.textContent;
            let start = highlight.startOffset;
            let end = highlight.endOffset;

            // Fallback validation: if text shifted, search for the exact snippet
            if (text.slice(start, end) !== highlight.text) {
                const foundIndex = text.indexOf(highlight.text);
                if (foundIndex !== -1) {
                    start = foundIndex;
                    end = foundIndex + highlight.text.length;
                } else {
                    return; // Skip if snippet can no longer be found
                }
            }

            const before = text.slice(0, start);
            const selected = text.slice(start, end);
            const after = text.slice(end);

            paragraph.replaceChildren();

            if (before) {
                paragraph.appendChild(document.createTextNode(before));
            }

            const mark = document.createElement("mark");
            mark.textContent = selected;

            mark.style.background =
                highlight.color === "pink" ? "#f7c9d7" : "#fff0a6";

            mark.style.borderRadius = "4px";

            paragraph.appendChild(mark);

            if (after) {
                paragraph.appendChild(document.createTextNode(after));
            }
        });
    });
}

function renderHighlights() {
    highlightsList.replaceChildren();

    if (!highlights.length) {
        addEmptyItem(highlightsList, "No highlights yet.");
        return;
    }

    highlights.forEach(highlight => {
        const li = document.createElement("li");

        const text = document.createElement("span");
        text.textContent = highlight.text;

        const remove = document.createElement("button");
        remove.type = "button";
        remove.textContent = "Remove";

        remove.addEventListener("click", async () => {
            highlights = highlights.filter(
                item => item.id !== highlight.id
            );

            await saveBook();

            renderBook();
            renderHighlights();
        });

        li.append(text, remove);
        highlightsList.appendChild(li);
    });
}

removeHighlightButton.addEventListener("click", async () => {
    const selection = window.getSelection();

    if (!selection || selection.isCollapsed) {
        showToast("Select highlighted text first.");
        return;
    }

    const selectedText = selection.toString();

    const index = highlights.findIndex(
        highlight => highlight.text === selectedText
    );

    if (index < 0) {
        showToast("No matching saved highlight found.");
        return;
    }

    highlights.splice(index, 1);

    await saveBook();

    renderBook();
    renderHighlights();

    selection.removeAllRanges();
});


/* =========================================
   13. START APPLICATION
   ========================================= */

async function loadOnlineBook(selection) {
    if (!selection?.source) return;
    readingSessionId = makeID();
    showMessage(fileMessage, "Loading this book from its online source...");
    try {
        const response = await fetch(selection.source);
        if (!response.ok) throw new Error(`The book source returned ${response.status}.`);
        const markup = await response.text();
        const parsed = new DOMParser().parseFromString(markup, "text/html");
        selection.title = parsed.querySelector("title")?.textContent?.trim() || selection.title;
        try {
            const libraryBooks = JSON.parse(localStorage.getItem("myCozyShelfBooks") || "[]");
            const libraryBook = libraryBooks.find(book => String(book.id) === String(selection.id));
            if (libraryBook) { libraryBook.title = selection.title; localStorage.setItem("myCozyShelfBooks", JSON.stringify(libraryBooks)); }
        } catch { /* Ignore malformed optional library metadata. */ }
        parsed.querySelectorAll("script, style, nav, header, footer").forEach(node => node.remove());
        const text = (parsed.body?.innerText || parsed.body?.textContent || "").trim();
        if (!text) throw new Error("The source did not contain readable text.");
        const id = "online-" + selection.id;
        const saved = await getBook(id);
        if (saved) {
            bookData = saved;
            originalText = saved.originalText ?? text;
            personalText = saved.personalText ?? text;
            bookmarks = saved.bookmarks || [];
            notes = saved.notes || [];
            journalEntries = saved.journalEntries || [];
            highlights = saved.highlights || [];
            savedPosition = saved.position || 0;
            currentPageIndex = saved.currentPageIndex || 0;
            restoreSettings(saved.settings || {});
        } else {
            originalText = text; personalText = text;
            bookmarks = []; notes = []; journalEntries = []; highlights = []; savedPosition = 0;
            currentPageIndex = 0;
            bookData = { id, title: selection.title, author: selection.author || "Unknown author", fileType: "online book", originalText: text, personalText: text, bookmarks, notes, journalEntries, highlights, position: 0, settings: { font: "serif", fontSize: "18", lineSpacing: "1.8", theme: "light" } };
            restoreSettings(bookData.settings);
        }
        currentBookKey = id;
        librarySelection = selection;
        bookTitle.textContent = parsed.querySelector("title")?.textContent?.trim() || selection.title;
        bookAuthor.textContent = `${selection.author || "Unknown author"} · Online book`;
        renderBook(); renderBookmarks(); renderNotes(); renderJournal(); renderHighlights();
        await saveBook(); restorePosition(); visitedPages = new Set([currentPageIndex]); await recordLibraryPage();
        showMessage(fileMessage, "Your book is ready to read!");
    } catch (error) {
        console.error(error);
        bookContent.replaceChildren();
        const frame = document.createElement("iframe");
        frame.src = selection.source;
        frame.title = `Read ${selection.title} online`;
        frame.style.cssText = "width:100%; min-height:70vh; border:0; border-radius:12px; background:#fff;";
        const fallback = document.createElement("p");
        fallback.textContent = "If the book does not display here, open its source directly: ";
        const link = document.createElement("a");
        link.href = selection.source;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = selection.title || "online book";
        fallback.appendChild(link);
        bookContent.append(frame, fallback);
        showMessage(fileMessage, "This source does not allow text import, so the reader is showing its online page instead.");
    }
}

async function resolveOnlineBook(selection) {
    showMessage(fileMessage, `Searching free online copies of “${selection.title}”…`);
    try {
        const query = [selection.title, selection.author].filter(Boolean).join(" ");
        const response = await fetch(`https://gutendex.com/books/?${new URLSearchParams({ search: query, languages: "en", mime_type: "text/" })}`);
        if (!response.ok) throw new Error("Online book search is unavailable.");
        const data = await response.json();
        const results = data.results || [];
        const normalized = value => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        const exact = results.find(item => normalized(item.title) === normalized(selection.title));
        const match = exact || results[0];
        const formats = match?.formats || {};
        const source = formats["text/html"] || Object.entries(formats).find(([type]) => type.startsWith("text/plain"))?.[1];
        if (!source) throw new Error("No freely readable online copy was found for this book.");
        selection.id = match.id;
        selection.title = match.title;
        selection.author = match.authors?.map(author => author.name).join(", ") || selection.author;
        selection.source = source;
        await loadOnlineBook(selection);
    } catch (error) {
        showMessage(fileMessage, `${error.message} Use Add Book → online book to choose a readable copy, or upload a local file.`);
    }
}
async function startReader() {
    try {
        db = await openDatabase();
        applySettings();
        let selection = null;
        try { selection = JSON.parse(localStorage.getItem("myCozyShelfCurrentBook") || "null"); }
        catch { selection = null; }
        if (selection?.localFileId) {
            const staged = await getBook(selection.localFileId);
            if (!staged?.file) throw new Error("The selected local book is no longer available. Please choose it again.");
            const localFile = new File([staged.file], staged.fileName || `${selection.title}.txt`, { type: staged.file.type || "application/octet-stream" });
            const transfer = new DataTransfer();
            transfer.items.add(localFile);
            fileInput.files = transfer.files;
            uploadForm.requestSubmit();
        } else if (selection?.source) await loadOnlineBook(selection);
        else if (selection?.title) await resolveOnlineBook(selection);
    } catch (error) {
        showMessage(fileMessage, "Reader storage could not start: " + error.message);
    }
}

startReader();