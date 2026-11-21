'use strict';

const DRAFTS_KEY = 'myCozyShelfStoryDrafts';
const CURRENT_KEY = 'myCozyShelfCurrentDraft';
const titleInput = document.getElementById('story-title');
const bodyInput = document.getElementById('story-body');
const status = document.getElementById('save-status');
const list = document.getElementById('draft-list');
let drafts = readDrafts();
let activeId = localStorage.getItem(CURRENT_KEY) || '';
let saveTimer;

function readDrafts() { try { const value = JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]'); return Array.isArray(value) ? value : []; } catch { return []; } }
function updateWords() { const count = bodyInput.value.trim().split(/\s+/).filter(Boolean).length; document.getElementById('word-count').textContent = `${count} ${count === 1 ? 'word' : 'words'}`; }
function persist() { localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts)); }
function saveDraft(announce = true) {
    if (!activeId) activeId = crypto.randomUUID ? crypto.randomUUID() : `story-${Date.now()}`;
    const draft = { id: activeId, title: titleInput.value.trim() || 'Untitled story', content: bodyInput.value, updatedAt: new Date().toISOString() };
    const index = drafts.findIndex(item => item.id === activeId);
    if (index < 0) drafts.unshift(draft); else drafts[index] = draft;
    localStorage.setItem(CURRENT_KEY, activeId); persist(); renderDrafts();
    status.textContent = announce ? 'Draft saved on this device' : 'Saved automatically';
}
function renderDrafts() {
    list.replaceChildren();
    if (!drafts.length) { const li = document.createElement('li'); li.textContent = 'Your first story is waiting…'; list.append(li); return; }
    drafts.slice().sort((a,b) => new Date(b.updatedAt) - new Date(a.updatedAt)).forEach(draft => {
        const li = document.createElement('li');
        const open = document.createElement('button'); open.type = 'button'; open.className = 'draft-open'; open.textContent = draft.title || 'Untitled story';
        open.addEventListener('click', () => loadDraft(draft.id));
        const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'draft-delete'; remove.textContent = 'Delete'; remove.setAttribute('aria-label', `Delete ${draft.title || 'draft'}`);
        remove.addEventListener('click', () => { drafts = drafts.filter(item => item.id !== draft.id); persist(); if (activeId === draft.id) newStory(); renderDrafts(); });
        li.append(open, remove); list.append(li);
    });
}
function loadDraft(id) { const draft = drafts.find(item => item.id === id); if (!draft) return; activeId = id; localStorage.setItem(CURRENT_KEY, id); titleInput.value = draft.title === 'Untitled story' ? '' : draft.title; bodyInput.value = draft.content || ''; updateWords(); status.textContent = `Opened · ${new Date(draft.updatedAt).toLocaleString()}`; }
function newStory() { activeId = ''; localStorage.removeItem(CURRENT_KEY); titleInput.value = ''; bodyInput.value = ''; updateWords(); status.textContent = 'New story'; titleInput.focus(); }
function scheduleSave() { status.textContent = 'Saving…'; clearTimeout(saveTimer); saveTimer = setTimeout(() => saveDraft(false), 700); updateWords(); }
titleInput.addEventListener('input', scheduleSave); bodyInput.addEventListener('input', scheduleSave);
document.getElementById('save-story').addEventListener('click', () => saveDraft(true));
document.getElementById('new-story').addEventListener('click', () => { if (titleInput.value || bodyInput.value) saveDraft(false); newStory(); });
document.getElementById('download-story').addEventListener('click', () => {
    const text = `${titleInput.value.trim() || 'Untitled story'}\n\n${bodyInput.value}`;
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `${(titleInput.value.trim() || 'my-story').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 80)}.txt`; anchor.click(); URL.revokeObjectURL(url);
});
renderDrafts();
const lastDraft = drafts.find(item => item.id === activeId) || drafts[0];
if (lastDraft) loadDraft(lastDraft.id); else updateWords();
window.addEventListener('beforeunload', () => { clearTimeout(saveTimer); if (titleInput.value || bodyInput.value) saveDraft(false); });