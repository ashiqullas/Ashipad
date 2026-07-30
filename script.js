const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

const editor = $('#editor') || document.createElement('div');
const source = $('#source') || document.createElement('textarea');
const status = $('#status') || document.createElement('div');
const saveState = $('#saveState') || document.createElement('div');
const wordCount = $('#wordCount') || document.createElement('div');
const charCount = $('#charCount') || document.createElement('div');

let activeView = 'write';
let dirty = false;
let saveTimer;
let docs = [];
let currentDocId = null;

// Core Configuration
const STORAGE_KEY = 'ashipad-docs';
const CURRENT_DOC_KEY = 'ashipad-current-doc';
const LEGACY_KEY = 'ashipad-content';

// RTF Escaping and Parsing (basic implementation)
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
  const blocks = ['div', 'p', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
  
  let prefix = '';
  if (blocks.includes(t)) {
    let prev = n.previousSibling;
    let prevIsBlock = prev && prev.nodeType === Node.ELEMENT_NODE && blocks.includes(prev.tagName.toLowerCase());
    if (prev && !prevIsBlock) {
      prefix = '\\par\n';
    }
  }

  if (blocks.includes(t) && !n.textContent.trim()) return prefix + '\\par\n';
  if (t === 'br') return '\\par\n';
  
  let x = [...n.childNodes].map(toRtf).join('');
  let { a, z } = getStyles(n);
  
  if ((t === 'b' || t === 'strong') && !a.includes('\\b ')) { a += '\\b '; z = '\\b0 ' + z; }
  if ((t === 'i' || t === 'em') && !a.includes('\\i ')) { a += '\\i '; z = '\\i0 ' + z; }
  if (t === 'u' && !a.includes('\\ul ')) { a += '\\ul '; z = '\\ul0 ' + z; }
  if (['s', 'strike', 'del'].includes(t) && !a.includes('\\strike ')) { a += '\\strike '; z = '\\strike0 ' + z; }

  let out = prefix + a + x + z;
  if (blocks.includes(t) && !out.endsWith('\\par\n') && !out.endsWith('\\par ')) {
    out += '\\par\n';
  }
  return out;
}

const serialize = () => {
  const body = [...editor.childNodes].map(toRtf).join('');
  return body.trim();
};

function fromRtf(r) {
  // Strips basic envelope
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
    .replace(/(?<!\\)\\[a-zA-Z]+-?\d*\s?/g, '') // Strip remaining unhandled control words
    // unescape RTF special characters
    .replace(/\\\{/g, '{')
    .replace(/\\\}/g, '}')
    .replace(/\\\\/g, '\\')
    .replace(/[{}]/g, ''); // Strip group braces not escaped

  return x.split('\n').map(l => l.trim() ? `<p>${l}</p>` : '<p><br></p>').join('') || '<p><br></p>';
}

function updateCounts() {
  const t = editor.textContent.trim();
  const n = t ? t.split(/\s+/).length : 0;
  wordCount.textContent = `${n} word${n === 1 ? '' : 's'}`;
  charCount.textContent = `${t.length} character${t.length === 1 ? '' : 's'}`;
}

function saveLocal() {
  if (!currentDocId) return;
  const doc = docs.find(d => d.id === currentDocId);
  if (doc) {
    doc.content = editor.innerHTML;
    doc.title = $('#docTitle').value;
    doc.updatedAt = Date.now();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
    saveState.textContent = 'All changes saved';
    saveState.style.opacity = '1';
    dirty = false;

    // Update the sidebar item in-place without redrawing the whole list
    const activeLi = $(`#doc-${currentDocId}`);
    if (activeLi) {
      const titleEl = activeLi.querySelector('.doc-title');
      const dateEl = activeLi.querySelector('.doc-date');
      if (titleEl) titleEl.textContent = doc.title || 'Untitled Document';
      if (dateEl) dateEl.textContent = new Date(doc.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
  }
}

function markChanged(msg = 'Saving…') {
  dirty = true;
  saveState.textContent = msg;
  saveState.style.opacity = '0.7';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveLocal, 1500);
}

$('#docTitle').addEventListener('input', () => markChanged());

function executeCommand(cmd, arg = null) {
  editor.focus();
  document.execCommand(cmd, false, arg);
  source.value = serialize();
  updateCounts();
  markChanged();
}

function toggleView(v) {
  activeView = v;
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.view === v));

  if (v === 'write') {
    editor.classList.remove('hidden');
    source.classList.add('hidden');
    $('#copyRtfBtn').classList.add('hidden');
    // Restart CSS animation
    editor.style.animation = 'none';
    editor.offsetHeight; // reflow
    editor.style.animation = null;
  } else {
    source.classList.remove('hidden');
    editor.classList.add('hidden');
    $('#copyRtfBtn').classList.remove('hidden');
    // Restart CSS animation
    source.style.animation = 'none';
    source.offsetHeight; // reflow
    source.style.animation = null;
  }

  if (v === 'rtf') source.value = serialize();
}

function toggleTheme() {
  const isDark = document.body.getAttribute('data-theme') === 'dark';
  if (isDark) {
    document.body.removeAttribute('data-theme');
    localStorage.setItem('ashipad-theme', 'light');
    $('#themeToggle').innerHTML = '🌙';
  } else {
    document.body.setAttribute('data-theme', 'dark');
    localStorage.setItem('ashipad-theme', 'dark');
    $('#themeToggle').innerHTML = '☀️';
  }
}

// Event Listeners
$$('[data-cmd]').forEach(b => {
  b.onclick = () => {
    let arg = null;
    if (b.dataset.cmd === 'formatBlock') {
      arg = b.dataset.arg;
    }
    executeCommand(b.dataset.cmd, arg);
  };
});

$$('.tab').forEach(b => b.onclick = () => toggleView(b.dataset.view));

function checkEmpty() {
  const html = editor.innerHTML.trim();
  if (!html || html === '<p><br></p>' || html === '<br>') {
    editor.classList.add('is-empty');
  } else {
    editor.classList.remove('is-empty');
  }
}

editor.oninput = () => {
  source.value = serialize();
  updateCounts();
  checkEmpty();
  markChanged();
};

source.oninput = () => {
  editor.innerHTML = fromRtf(source.value);
  updateCounts();
  markChanged('Editing RTF…');
};

// Sidebar Toggle Logic
$('#menuToggle').onclick = () => $('#sidebar').classList.remove('sidebar-closed');
$('#sidebarClose').onclick = () => $('#sidebar').classList.add('sidebar-closed');

function createNewDoc() {
  if (dirty) saveLocal();
  const newDoc = {
    id: Date.now().toString(),
    title: 'Untitled Document',
    content: '<p><br></p>',
    updatedAt: Date.now()
  };
  docs.unshift(newDoc);
  switchDoc(newDoc.id);
  $('#sidebar').classList.add('sidebar-closed');
}

$('#newBtn').onclick = createNewDoc;
$('#sidebarNewBtn').onclick = createNewDoc;

function switchDoc(id) {
  if (dirty) saveLocal();
  currentDocId = id;
  localStorage.setItem(CURRENT_DOC_KEY, id);
  const doc = docs.find(d => d.id === id);
  if (!doc) return;

  editor.innerHTML = doc.content;
  $('#docTitle').value = doc.title;

  updateCounts();
  checkEmpty();
  source.value = serialize();

  renderSidebar();
  toggleView('write');
}

function renderSidebar() {
  const list = $('#docList');
  list.innerHTML = '';
  docs.sort((a, b) => b.updatedAt - a.updatedAt);

  docs.forEach(doc => {
    const li = document.createElement('li');
    li.id = `doc-${doc.id}`;
    if (doc.id === currentDocId) li.classList.add('active');

    const date = new Date(doc.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    li.innerHTML = `
      <div class="doc-info">
        <div class="doc-title">${doc.title || 'Untitled Document'}</div>
        <div class="doc-date">${date}</div>
      </div>
      <button class="icon-btn doc-delete" title="Delete document">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    `;

    li.onclick = () => {
      switchDoc(doc.id);
      if (window.innerWidth <= 768) {
        $('#sidebar').classList.add('sidebar-closed');
      }
    };

    li.querySelector('.doc-delete').onclick = (e) => {
      e.stopPropagation();

      const modal = $('#deleteModal');
      $('#deleteModalTitle').textContent = `"${doc.title || 'Untitled Document'}"`;
      modal.classList.remove('hidden');

      $('#deleteCancel').onclick = () => {
        modal.classList.add('hidden');
      };

      $('#deleteConfirmBtn').onclick = () => {
        modal.classList.add('hidden');
        docs = docs.filter(d => d.id !== doc.id);
        if (docs.length === 0) {
          createNewDoc();
        } else {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(docs));
          if (currentDocId === doc.id) {
            switchDoc(docs[0].id);
          } else {
            renderSidebar();
          }
        }
      };
    };

    list.appendChild(li);
  });
}

$('#copyRtfBtn').onclick = () => {
  navigator.clipboard.writeText(source.value).then(() => {
    const btn = $('#copyRtfBtn');
    const originalHtml = btn.innerHTML;
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
        <path style="stroke-dasharray: 50; stroke-dashoffset: 50; animation: drawCheck 0.4s ease forwards;" d="M20 6L9 17l-5-5"/>
      </svg> RTF Copied`;
    btn.classList.add('success');

    setTimeout(() => {
      btn.innerHTML = originalHtml;
      btn.classList.remove('success');
    }, 2500);
  });
};

$('#themeToggle').onclick = toggleTheme;

// Modals
const about = $('#about');
$('#aboutBtn').onclick = () => {
  about.classList.remove('hidden');
};

$('#aboutClose').onclick = $('#aboutDone').onclick = () => {
  about.classList.add('hidden');
};

const welcome = $('#welcome');

function startTour() {
  if (!window.driver) return;
  const driverObj = window.driver.js.driver({
    showProgress: true,
    animate: true,
    steps: [
      { element: '#docTitle', popover: { title: 'Name your document', description: 'Give your document a memorable name here.', side: "bottom", align: 'start' }},
      { element: '.ribbon', popover: { title: 'Format text', description: 'Use the ribbon to bold, italicize, underline, or strike-through text. Standard keyboard shortcuts also work.', side: "bottom", align: 'start' }},
      { element: '.tabs', popover: { title: 'Switch views', description: 'Toggle between the visual editor and the raw RTF source code.', side: "bottom", align: 'start' }},
      { element: '#menuToggle', popover: { title: 'Manage documents', description: 'Access your saved documents or create new ones from the sidebar.', side: "bottom", align: 'start' }},
      { element: '#themeToggle', popover: { title: 'Themes', description: 'Toggle between light and dark mode.', side: "bottom", align: 'start' }}
    ]
  });
  driverObj.drive();
}

const handleWelcomeClose = (shouldStartTour) => {
  if ($('#hideWelcome').checked) localStorage.setItem('ashipad-hide-welcome', 'true');
  welcome.classList.add('hidden');
  
  // Mark tour as done to avoid automatic popup on next reload 
  // if they hid the welcome modal but didn't explicitly take the tour
  localStorage.setItem('ashipad-tour-completed', 'true');

  if (shouldStartTour) {
    startTour();
  }
};

$('#skipTourBtn').onclick = () => handleWelcomeClose(false);
$('#startTourBtn').onclick = () => handleWelcomeClose(true);

// Initialization
function init() {
  // Load Theme
  if (localStorage.getItem('ashipad-theme') === 'dark') {
    document.body.setAttribute('data-theme', 'dark');
    $('#themeToggle').innerHTML = '☀️';
  }

  // Load Welcome Modal
  if (localStorage.getItem('ashipad-hide-welcome') !== 'true') {
    welcome.classList.remove('hidden');
  } else if (localStorage.getItem('ashipad-tour-completed') !== 'true') {
    // Small delay to ensure the UI is fully rendered before tour starts
    setTimeout(() => {
      startTour();
      localStorage.setItem('ashipad-tour-completed', 'true');
    }, 100);
  }

  // Load Documents
  try {
    const savedDocs = localStorage.getItem(STORAGE_KEY);
    if (savedDocs) docs = JSON.parse(savedDocs);
  } catch (e) { }

  // Legacy migration
  const legacyContent = localStorage.getItem(LEGACY_KEY);
  if (legacyContent) {
    docs.unshift({
      id: Date.now().toString(),
      title: 'Migrated Document',
      content: legacyContent,
      updatedAt: Date.now()
    });
    localStorage.removeItem(LEGACY_KEY);
  }

  if (docs.length === 0) {
    docs.push({
      id: Date.now().toString(),
      title: 'Untitled Document',
      content: '<p><br></p>',
      updatedAt: Date.now()
    });
  }

  const savedCurrentId = localStorage.getItem(CURRENT_DOC_KEY);
  const targetId = docs.find(d => d.id === savedCurrentId) ? savedCurrentId : docs[0].id;

  switchDoc(targetId);
}
init();

// Expose for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    toRtf,
    fromRtf,
    serialize,
    esc,
    getStyles
  };
}
