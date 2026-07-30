const $ = document.querySelector.bind(document);

const esc = s => s.replace(/\\/g, '\\\\').replace(/{/g, '\\{').replace(/}/g, '\\}').replace(/[\r\n]+\s*/g, '');

function getStyles(el) {
  const s = getComputedStyle(el);
  let a = '', z = '';
  if (s.fontWeight === '700' || s.fontWeight === 'bold' || Number(s.fontWeight) >= 600) { a += '\\b '; z = '\\b0 ' + z; }
  if (s.fontStyle === 'italic') { a += '\\i '; z = '\\i0 ' + z; }
  if (s.textDecorationLine && s.textDecorationLine.includes('underline')) { a += '\\ul '; z = '\\ul0 ' + z; }
  if (s.textDecorationLine && s.textDecorationLine.includes('line-through')) { a += '\\strike '; z = '\\strike0 ' + z; }
  return { a, z };
}

function toRtf(n) {
  if (n.nodeType === Node.TEXT_NODE) return esc(n.nodeValue || '');
  if (n.nodeType !== Node.ELEMENT_NODE) return '';
  
  const t = n.tagName.toLowerCase();
  if (['div', 'p', 'li'].includes(t) && !n.textContent.trim()) return '\\par ';
  if (t === 'br') return '\\par ';
  
  let x = [...n.childNodes].map(toRtf).join('');
  let { a, z } = getStyles(n);
  
  if ((t === 'b' || t === 'strong') && !a.includes('\\b ')) { a += '\\b '; z = '\\b0 ' + z; }
  if ((t === 'i' || t === 'em') && !a.includes('\\i ')) { a += '\\i '; z = '\\i0 ' + z; }
  if (t === 'u' && !a.includes('\\ul ')) { a += '\\ul '; z = '\\ul0 ' + z; }
  if (['s', 'strike', 'del'].includes(t) && !a.includes('\\strike ')) { a += '\\strike '; z = '\\strike0 ' + z; }

  return a + x + z + (['div', 'p', 'li'].includes(t) ? '\\par ' : '');
}

const serialize = () => {
  const body = [...$('#editor').childNodes].map(toRtf).join('');
  return body.trim();
};

function fromRtf(r) {
  let x = r.replace(/^{\\rtf1\s*/, '').replace(/}$/, '');
  x = x.replace(/\\'([0-9a-fA-F]{2})/g, (m, p1) => String.fromCharCode(parseInt(p1, 16)))
       .replace(/(?<!\\)\\par[d]?(?![a-zA-Z0-9])\s?/g, '\n')
       .replace(/(?<!\\)\\line(?![a-zA-Z0-9])\s?/g, '\n')
       .replace(/(?<!\\)\\b0(?![a-zA-Z0-9])\s?/g, '</strong>')
       .replace(/(?<!\\)\\b(?![a-zA-Z0-9])\s?/g, '<strong>')
       .replace(/(?<!\\)\\i0(?![a-zA-Z0-9])\s?/g, '</em>')
       .replace(/(?<!\\)\\i(?![a-zA-Z0-9])\s?/g, '<em>')
       .replace(/(?<!\\)\\ul0(?![a-zA-Z0-9])\s?/g, '</u>')
       .replace(/(?<!\\)\\ul(?![a-zA-Z0-9])\s?/g, '<u>')
       .replace(/(?<!\\)\\strike0(?![a-zA-Z0-9])\s?/g, '</s>')
       .replace(/(?<!\\)\\strike(?![a-zA-Z0-9])\s?/g, '<s>')
       .replace(/(?<!\\)\\[a-zA-Z]+-?\d*\s?/g, '')
       .replace(/\\\{/g, '{')
       .replace(/\\\}/g, '}')
       .replace(/\\\\/g, '\\')
       .replace(/[{}]/g, '');
  return x.split('\n').map(l => l.trim() ? `<p>${l}</p>` : '<p><br></p>').join('') || '<p><br></p>';
}

const STORAGE_KEY = 'ashipad-docs';
let docs = [];
let currentDocId = null;
let saveTimer = null;
let dirty = false;

const editor = $('#editor');
const source = $('#source');
const titleInput = $('#docTitle');
const saveState = $('#saveState');
const docSelector = $('#docSelector');
const newBtn = $('#newBtn');
const deleteBtn = $('#deleteBtn');
const toggleRtfBtn = $('#toggleRtfBtn');
const copyRtfBtn = $('#copyRtfBtn');
let isRtfView = false;

const deleteModal = $('#deleteModal');
const deleteCancel = $('#deleteCancel');
const deleteConfirmBtn = $('#deleteConfirmBtn');

function uuid() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function init() {
  chrome.storage.local.get([STORAGE_KEY], (result) => {
    docs = result[STORAGE_KEY] || [];
    if (docs.length === 0) {
      createNewDoc();
    } else {
      docs.sort((a, b) => b.updatedAt - a.updatedAt);
      renderSelector();
      switchDoc(docs[0].id);
    }
  });

  editor.addEventListener('input', () => {
    source.value = serialize();
    markChanged('Saving...');
  });
  
  source.addEventListener('input', () => {
    editor.innerHTML = fromRtf(source.value);
    markChanged('Editing RTF...');
  });
  
  toggleRtfBtn.onclick = () => {
    isRtfView = !isRtfView;
    if (isRtfView) {
      source.value = serialize();
      editor.classList.add('hidden');
      source.classList.remove('hidden');
      copyRtfBtn.classList.remove('hidden');
      toggleRtfBtn.textContent = 'Visual View';
    } else {
      editor.classList.remove('hidden');
      source.classList.add('hidden');
      copyRtfBtn.classList.add('hidden');
      toggleRtfBtn.textContent = 'RTF View';
    }
  };
  
  copyRtfBtn.onclick = () => {
    navigator.clipboard.writeText(source.value).then(() => {
      copyRtfBtn.textContent = 'Copied!';
      setTimeout(() => copyRtfBtn.textContent = 'Copy RTF', 2000);
    });
  };

  titleInput.addEventListener('input', () => {
    markChanged('Saving...');
    updateSelectorTitle();
  });
  
  newBtn.onclick = () => {
    if (dirty) saveLocal();
    createNewDoc();
  };
  
  deleteBtn.onclick = () => {
    deleteModal.classList.remove('hidden');
  };
  
  deleteCancel.onclick = () => {
    deleteModal.classList.add('hidden');
  };
  
  deleteConfirmBtn.onclick = () => {
    deleteModal.classList.add('hidden');
    docs = docs.filter(d => d.id !== currentDocId);
    if (docs.length === 0) {
      createNewDoc();
    } else {
      chrome.storage.local.set({ [STORAGE_KEY]: docs }, () => {
        renderSelector();
        switchDoc(docs[0].id);
      });
    }
  };
  
  docSelector.onchange = (e) => {
    if (dirty) saveLocal();
    switchDoc(e.target.value);
  };
}

function createNewDoc() {
  const newDoc = {
    id: uuid(),
    title: 'Untitled Note',
    content: '',
    updatedAt: Date.now()
  };
  docs.unshift(newDoc);
  renderSelector();
  switchDoc(newDoc.id);
  saveLocal();
}

function renderSelector() {
  docSelector.innerHTML = '';
  docs.forEach(doc => {
    const opt = document.createElement('option');
    opt.value = doc.id;
    opt.textContent = doc.title || 'Untitled Note';
    docSelector.appendChild(opt);
  });
}

function updateSelectorTitle() {
  const selectedOpt = docSelector.querySelector(`option[value="${currentDocId}"]`);
  if (selectedOpt) {
    selectedOpt.textContent = titleInput.value || 'Untitled Note';
  }
}

function switchDoc(id) {
  const doc = docs.find(d => d.id === id);
  if (!doc) return;
  
  currentDocId = id;
  docSelector.value = id;
  titleInput.value = doc.title === 'Untitled Note' ? '' : doc.title;
  editor.innerHTML = doc.content;
  source.value = serialize();
  
  dirty = false;
  saveState.textContent = 'All changes saved';
  saveState.style.opacity = '1';
  if (!isRtfView) editor.focus();
}

function markChanged(msg = 'Saving...') {
  dirty = true;
  saveState.textContent = msg;
  saveState.style.opacity = '0.7';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveLocal, 1000);
}

function saveLocal() {
  if (!currentDocId) return;
  const doc = docs.find(d => d.id === currentDocId);
  if (doc) {
    doc.content = editor.innerHTML;
    doc.title = titleInput.value || 'Untitled Note';
    doc.updatedAt = Date.now();
    
    docs = docs.filter(d => d.id !== doc.id);
    docs.unshift(doc);
    
    chrome.storage.local.set({ [STORAGE_KEY]: docs }, () => {
      saveState.textContent = 'All changes saved';
      saveState.style.opacity = '1';
      dirty = false;
      
      const activeVal = docSelector.value;
      renderSelector();
      docSelector.value = activeVal;
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
