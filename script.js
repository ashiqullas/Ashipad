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

// Core Configuration
const STORAGE_KEY = 'ashipad-content';

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
  const body = [...editor.childNodes].map(toRtf).join('');
  return `{\\rtf1 ${body}}`;
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
  localStorage.setItem(STORAGE_KEY, editor.innerHTML);
  dirty = false;
  status.textContent = 'Ready';
  saveState.textContent = 'All changes saved locally';
  status.style.color = '';
  saveState.style.color = '';
}

function markChanged(msg = 'Editing…') {
  dirty = true;
  status.textContent = saveState.textContent = msg;
  status.style.color = 'var(--accent)';
  saveState.style.color = 'var(--accent)';
  
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveLocal, 1000);
}

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
    editor.style.opacity = '0';
    requestAnimationFrame(() => editor.style.opacity = '1');
  } else {
    source.classList.remove('hidden');
    editor.classList.add('hidden');
    source.style.opacity = '0';
    requestAnimationFrame(() => source.style.opacity = '1');
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

editor.oninput = () => {
  source.value = serialize();
  updateCounts();
  markChanged();
};

source.oninput = () => {
  editor.innerHTML = fromRtf(source.value);
  updateCounts();
  markChanged('Editing RTF…');
};

$('#newBtn').onclick = () => {
  if (dirty && !confirm('Start a new document? Unsaved changes will be lost.')) return;
  editor.innerHTML = '<p><br></p>';
  source.value = '';
  updateCounts();
  toggleView('write');
  saveLocal();
  status.textContent = 'New document';
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
$('#welcomeDone').onclick = () => {
  if ($('#hideWelcome').checked) localStorage.setItem('ashipad-hide-welcome', 'true');
  welcome.classList.add('hidden');
};

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
  }
  
  // Load Content
  const savedContent = localStorage.getItem(STORAGE_KEY);
  if (savedContent) {
    editor.innerHTML = savedContent;
  }
  
  updateCounts();
  source.value = serialize();
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
