'use strict';

const STORAGE_KEY = 'myCozyShelfBooks';
const READER_BOOK_KEY = 'myCozyShelfCurrentBook';
const RESET_FLAG_KEY = 'myCozyShelfLibraryResetV3';
if (!localStorage.getItem(RESET_FLAG_KEY)) {
  for (const key of Object.keys(localStorage)) if (key.startsWith(STORAGE_KEY)) localStorage.removeItem(key);
  localStorage.removeItem(READER_BOOK_KEY);
  localStorage.setItem(RESET_FLAG_KEY, 'done');
}
const discoverBooks = [
  { id: 'pride-prejudice', title: 'Pride and Prejudice', author: 'Jane Austen', description: 'A classic story of love, family, and first impressions.', genre: 'Fiction', source: 'https://www.gutenberg.org/ebooks/1342' },
  { id: 'alice-wonderland', title: "Alice's Adventures in Wonderland", author: 'Lewis Carroll', description: 'Follow Alice into a wonderfully strange world.', genre: 'Fantasy', source: 'https://www.gutenberg.org/ebooks/11' },
  { id: 'sherlock-holmes', title: 'The Adventures of Sherlock Holmes', author: 'Arthur Conan Doyle', description: "Discover the famous detective's mysterious cases.", genre: 'Mystery', source: 'https://www.gutenberg.org/ebooks/1661' },
  { id: 'little-women', title: 'Little Women', author: 'Louisa May Alcott', description: 'Follow the lives and dreams of the March sisters.', genre: 'Fiction', source: 'https://www.gutenberg.org/ebooks/514' }
];
let books = loadBooks();
let activeGenre = 'All';
let onlineResults = [];

function loadBooks() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(saved)) return [];
    return saved.map(book => ({
      ...book,
      status: ({ 'Want to Read': 'Wishlist', 'Currently Reading': 'Reading', Completed: 'Finished' }[book.status] || book.status || 'Wishlist'),
      pages: Number(book.pages || book.totalPages) || 0,
      currentPage: Number(book.currentPage) || 0
    }));
  } catch { return []; }
}
function saveBooks() { localStorage.setItem(STORAGE_KEY, JSON.stringify(books)); }
function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}
function getBook(id) { return books.find(book => String(book.id) === String(id)); }
function setMessage(id, text) { const el = document.getElementById(id); if (el) el.textContent = text; }
function renderDiscoverBooks() {
  const container = document.getElementById('discover-books');
  if (!container) return;
  const query = (document.getElementById('book-search')?.value || '').trim().toLowerCase();
  const allBooks = [...onlineResults, ...discoverBooks.filter(book => !onlineResults.some(result => String(result.id) === String(book.id)))];
  const matches = allBooks.filter(book => (activeGenre === 'All' || book.genre === activeGenre) && `${book.title} ${book.author} ${book.genre}`.toLowerCase().includes(query));
  container.innerHTML = matches.length ? matches.map(book => bookCard(book, false)).join('') : '<p class="loading-message">No books match your search.</p>';
}
function renderLibrary() {
  const container = document.getElementById('library-books');
  if (!container) return;
  const status = document.getElementById('library-filter')?.value || 'All';
  const matches = books.filter(book => status === 'All' || book.status === status);
  container.innerHTML = matches.length ? matches.map(book => bookCard(book, true)).join('') : '<div class="empty-state library-empty"><div class="empty-icon">📚</div><h3>Your shelf is waiting for stories!</h3><p>Add a book to begin building your personal collection.</p><button class="btn btn-primary" type="button" onclick="openAddBookDialog()">+ Add Your First Book</button></div>';
}
function bookCard(book, inLibrary) {
  const cover = book.cover ? `<img src="${escapeHTML(book.cover)}" alt="${escapeHTML(book.title)} cover" loading="lazy">` : '<div class="book-cover-placeholder">📖</div>';
  if (!inLibrary) return `<article class="book-card"><div class="book-cover">${cover}</div><div class="book-info"><h3>${escapeHTML(book.title)}</h3><p class="book-author">${escapeHTML(book.author)}</p><p class="book-description">${escapeHTML(book.description || '')}</p><button class="btn btn-primary" type="button" onclick="openOnlineBook('${escapeHTML(book.id)}')">Read Online</button><button class="btn btn-outline" type="button" onclick="addDiscoverBook('${escapeHTML(book.id)}')">Add to My Library</button></div></article>`;
  const pagesRead = Number(book.pagesRead ?? book.currentPage) || 0;
  const history = Array.isArray(book.readHistory) ? [...book.readHistory].reverse() : [];
  const historyMarkup = history.length
    ? `<details><summary>Read history (${history.length})</summary><ul>${history.map(entry => `<li>${escapeHTML(new Date(entry.date).toLocaleString())} — ${Number(entry.sessionPages) || 0} pages this session; ${Number(entry.totalPages) || 0} total</li>`).join('')}</ul></details>`
    : '<p class="progress-label">No reading sessions saved yet.</p>';
  return `<article class="book-card"><div class="book-cover">${cover}</div><div class="book-info"><h3>${escapeHTML(book.title)}</h3><p class="book-author">${escapeHTML(book.author || 'Unknown author')}</p><p class="book-status">Status: ${escapeHTML(book.status || 'Wishlist')}</p><p class="progress-label">Total pages read: ${pagesRead}</p>${historyMarkup}${book.source ? `<a class="text-link" href="${escapeHTML(book.source)}" target="_blank" rel="noopener noreferrer">Saved online link ↗</a>` : '<p>Local file saved on this browser</p>'}<div class="book-actions">${book.source ? `<button type="button" onclick="openOnlineBook('${escapeHTML(book.id)}')">Read Online</button>` : `<button type="button" onclick="openBook('${escapeHTML(book.id)}')">Open Book</button>`}<button type="button" onclick="updateReadingProgress('${escapeHTML(book.id)}')">Save Reading Session</button><button type="button" onclick="removeBook('${escapeHTML(book.id)}')">Remove</button></div></div></article>`;
}
function genreForBook(book) {
  const subjects = (book.subjects || []).join(' ').toLowerCase();
  if (/fantasy|fairy|magic/.test(subjects)) return 'Fantasy';
  if (/mystery|detective|crime/.test(subjects)) return 'Mystery';
  if (/self.help|psychology|success/.test(subjects)) return 'Self-Help';
  return 'Fiction';
}
async function searchOnlineBooks(query = '') {
  const container = document.getElementById('discover-books');
  if (container) container.innerHTML = '<p class="loading-message">Searching free online books…</p>';
  setMessage('search-message', '');
  try {
    const params = new URLSearchParams({ languages: 'en', mime_type: 'text/' });
    if (query.trim()) params.set('search', query.trim());
    const response = await fetch(`https://gutendex.com/books/?${params}`);
    if (!response.ok) throw new Error(`Book catalogue returned ${response.status}.`);
    const data = await response.json();
    onlineResults = (data.results || []).map(item => {
      const formats = item.formats || {};
      const source = Object.entries(formats).find(([type]) => type.startsWith('text/html'))?.[1] || Object.entries(formats).find(([type]) => type.startsWith('text/plain'))?.[1];
      if (!source) return null;
      return { id: `gutenberg-${item.id}`, title: item.title, author: item.authors?.map(author => author.name).join(', ') || 'Unknown author', description: (item.subjects || []).slice(0, 2).join(' · ') || 'Free online book', genre: genreForBook(item), source: `https://www.gutenberg.org/ebooks/${item.id}`, cover: `https://www.gutenberg.org/cache/epub/${item.id}/pg${item.id}.cover.medium.jpg`, provider: 'Project Gutenberg' };
    }).filter(Boolean);
    renderDiscoverBooks();
    setMessage('search-message', onlineResults.length ? `${onlineResults.length} free online books found. Select Read Book to open one.` : 'No readable online books found for that search.');
  } catch (error) {
    onlineResults = [];
    renderDiscoverBooks();
    setMessage('search-message', `Online search is unavailable right now: ${error.message}`);
  }
}
function renderAll() {
  renderDiscoverBooks(); renderLibrary(); updateStatistics(); renderContinueReading();
}
function updateStatistics() {
  const set = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  set('total-books', books.length);
  set('reading-books', books.filter(b => b.status === 'Reading').length);
  set('finished-books', books.filter(b => b.status === 'Finished').length);
  set('wishlist-books', books.filter(b => b.status === 'Wishlist').length);
}
function renderContinueReading() {
  const container = document.getElementById('continue-reading');
  if (!container) return;
  const current = books.filter(book => book.status === 'Reading');
  container.innerHTML = current.length ? `<div class="section-heading"><div><p class="eyebrow">PICK UP WHERE YOU LEFT OFF</p><h2>Continue Reading 📖</h2></div><a href="#library" class="text-link">View My Library →</a></div><div class="book-grid">${current.map(book => `<article class="book-card"><div class="book-info"><h3>${escapeHTML(book.title)}</h3><p>${escapeHTML(book.author)}</p><button class="btn btn-primary" onclick="openBook('${escapeHTML(book.id)}')">Continue Reading</button></div></article>`).join('')}</div>` : `<div class="section-heading"><div><p class="eyebrow">PICK UP WHERE YOU LEFT OFF</p><h2>Continue Reading 📖</h2></div><a href="#library" class="text-link">View My Library →</a></div><div class="empty-state"><div class="empty-icon">🌷</div><h3>Your next chapter awaits!</h3><p>Books you start reading will appear here so you can easily continue where you stopped.</p><a href="#discover" class="btn btn-primary">Find a Book</a></div>`;
}
function addDiscoverBook(id) {
  const source = [...onlineResults, ...discoverBooks].find(book => String(book.id) === String(id));
  if (!source) return;
  if (getBook(id)) { alert('This book is already in your library!'); return; }
  books.push({ ...source, status: 'Wishlist', currentPage: 0, pages: 0, notes: '' });
  saveBooks(); renderAll(); setMessage('search-message', `${source.title} was added to your library.`);
}
function openBook(id) {
  const book = getBook(id);
  if (!book) return;
  if (book.source) { openOnlineBook(id); return; }
  localStorage.setItem(READER_BOOK_KEY, JSON.stringify({ id: book.id, title: book.title, author: book.author || '', localFileId: book.localFileId || '' }));
  window.location.href = 'reader.html';
}
function openOnlineBook(id) {
  const book = getBook(id) || [...onlineResults, ...discoverBooks].find(item => String(item.id) === String(id));
  if (!book?.source) return;
  if (!getBook(id)) books.push({ ...book, status: 'Reading', pagesRead: 0 });
  const saved = getBook(id);
  saved.status = 'Reading';
  saveBooks();
  renderAll();
  window.open(saved.source, '_blank', 'noopener,noreferrer');
}
function updateReadingProgress(id) {
  const book = getBook(id); if (!book) return;
  const value = prompt(`How many pages did you read in this session for “${book.title}”?`, '1');
  if (value === null) return;
  const sessionPages = Number(value);
  if (!Number.isInteger(sessionPages) || sessionPages < 1) { alert('Enter the number of pages you read (at least 1).'); return; }
  book.pagesRead = (Number(book.pagesRead ?? book.currentPage) || 0) + sessionPages;
  book.currentPage = book.pagesRead;
  book.status = 'Reading';
  if (!Array.isArray(book.readHistory)) book.readHistory = [];
  book.readHistory.push({ date: new Date().toISOString(), sessionPages, totalPages: book.pagesRead });
  saveBooks(); renderAll();
}
function updateBookStatus(id, status) { const book = getBook(id); if (!book) return; book.status = status; if (status === 'Finished' && book.pages) book.currentPage = book.pages; saveBooks(); renderAll(); }
function removeBook(id) { const book = getBook(id); if (!book || !confirm(`Remove “${book.title}” from your library?`)) return; books = books.filter(item => String(item.id) !== String(id)); saveBooks(); renderAll(); }
function stageLocalBook(id, file, title) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('MyCozyShelfReaderDB', 1);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains('readerData')) request.result.createObjectStore('readerData', { keyPath: 'id' }); };
    request.onerror = () => reject(request.error || new Error('Could not open reader storage.'));
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction('readerData', 'readwrite');
      transaction.objectStore('readerData').put({ id, file, title, fileName: file.name });
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onerror = () => { db.close(); reject(transaction.error || new Error('Could not save this file.')); };
    };
  });
}
function openAddBookDialog() { const options = document.getElementById('add-book-options'); const online = document.getElementById('online-book-form'); const url = document.getElementById('online-book-url'); if (options) options.hidden = false; if (online) online.hidden = true; if (url) url.value = ''; setMessage('form-message', ''); document.getElementById('add-book-dialog')?.showModal(); }
function closeAddBookDialog() { document.getElementById('add-book-dialog')?.close(); }

document.addEventListener('DOMContentLoaded', () => {
  renderAll();
  searchOnlineBooks('');
  document.getElementById('current-year').textContent = new Date().getFullYear();
  document.getElementById('book-search-form')?.addEventListener('submit', event => { event.preventDefault(); searchOnlineBooks(document.getElementById('book-search').value); });
  document.getElementById('book-search')?.addEventListener('input', renderDiscoverBooks);
  document.getElementById('library-filter')?.addEventListener('change', renderLibrary);
  document.querySelectorAll('[data-genre]').forEach(button => button.addEventListener('click', () => { activeGenre = button.dataset.genre; document.querySelectorAll('[data-genre]').forEach(item => item.classList.toggle('active', item === button)); renderDiscoverBooks(); }));
  document.getElementById('add-book-btn')?.addEventListener('click', openAddBookDialog);
  document.getElementById('empty-add-book-btn')?.addEventListener('click', openAddBookDialog);
  document.getElementById('close-dialog-btn')?.addEventListener('click', closeAddBookDialog);
  document.getElementById('cancel-book-btn')?.addEventListener('click', closeAddBookDialog);
  const options = document.getElementById('add-book-options');
  const onlineForm = document.getElementById('online-book-form');
  const localInput = document.getElementById('local-book-file');
  document.getElementById('choose-online-book')?.addEventListener('click', () => { options.hidden = true; onlineForm.hidden = false; });
  document.getElementById('back-add-options')?.addEventListener('click', () => { onlineForm.hidden = true; options.hidden = false; });
  document.getElementById('choose-local-book')?.addEventListener('click', () => localInput.click());
  onlineForm?.addEventListener('submit', event => {
    event.preventDefault();
    const source = document.getElementById('online-book-url').value.trim();
    try {
      const url = new URL(source);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Use an http or https book URL.');
      const title = decodeURIComponent(url.pathname.split('/').filter(Boolean).pop() || url.hostname).replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const id = `online-${Date.now()}`;
      const book = { id, title: title || 'Online book', author: url.hostname, description: 'Added from an online book URL.', genre: 'Other', source: url.href, status: 'Reading', currentPage: 0, pages: 0 };
      books.push(book); saveBooks(); closeAddBookDialog(); localStorage.setItem(READER_BOOK_KEY, JSON.stringify({ id, title: book.title, author: book.author, source: book.source })); openOnlineBook(id);
    } catch (error) { setMessage('form-message', error.message || 'Please enter a valid URL.'); }
  });
  localInput?.addEventListener('change', async () => {
    const file = localInput.files?.[0]; if (!file) return;
    const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!['.txt', '.pdf', '.epub', '.docx'].includes(extension)) { setMessage('form-message', 'Choose a TXT, PDF, EPUB or DOCX file.'); localInput.value = ''; return; }
    const id = `local-${Date.now()}`;
    const book = { id, title: file.name.replace(/\.[^.]+$/, ''), author: 'Local book', description: 'Book from this device.', genre: 'Other', status: 'Reading', currentPage: 0, pages: 0, localFileId: `local-file-${id}` };
    try {
      await stageLocalBook(book.localFileId, file, book.title);
      books.push(book); saveBooks(); localStorage.setItem(READER_BOOK_KEY, JSON.stringify({ id, title: book.title, author: book.author, localFileId: book.localFileId })); window.location.href = 'reader.html';
    } catch (error) { setMessage('form-message', `Could not add file: ${error.message}`); }
  });
});

// The reader updates localStorage in this tab. A storage event does not fire
// in the page that opened it, and browsers may restore this page from the
// back/forward cache, so refresh the shelf when it becomes visible again.
function refreshLibraryFromStorage() {
  books = loadBooks();
  renderAll();
}
window.addEventListener('pageshow', refreshLibraryFromStorage);
window.addEventListener('focus', refreshLibraryFromStorage);
window.addEventListener('storage', event => {
  if (event.key === STORAGE_KEY) refreshLibraryFromStorage();
});