/**
 * @jest-environment jsdom
 */

// We need to set up the DOM environment before requiring script.js
document.body.innerHTML = `
  <div class="app">
    <article id="editor" contenteditable="true"></article>
    <textarea id="source"></textarea>
    <div id="status"></div>
    <div id="saveState"></div>
    <div id="wordCount"></div>
    <div id="charCount"></div>
    <button id="newBtn"></button>
    <button id="themeToggle"></button>
    <div id="about"></div>
    <button id="aboutBtn"></button>
    <button id="aboutClose"></button>
    <button id="aboutDone"></button>
    <div id="welcome"></div>
    <button id="welcomeDone"></button>
    <input type="checkbox" id="hideWelcome" />
  </div>
`;

// Require the functions we exposed in script.js
const { toRtf, fromRtf, esc, getStyles } = require('./script.js');

describe('AshiPad RTF Converter', () => {
  
  describe('toRtf()', () => {
    test('converts basic text correctly', () => {
      const node = document.createTextNode('Hello World');
      expect(toRtf(node)).toBe('Hello World');
    });

    test('escapes special RTF characters', () => {
      const node = document.createTextNode('Hello \\ {World}');
      expect(toRtf(node)).toBe('Hello \\\\ \\{World\\}');
    });

    test('converts bold tags to RTF correctly', () => {
      const el = document.createElement('b');
      el.textContent = 'Bold text';
      expect(toRtf(el)).toBe('\\b Bold text\\b0 ');
    });

    test('converts italic tags to RTF correctly', () => {
      const el = document.createElement('i');
      el.textContent = 'Italic text';
      expect(toRtf(el)).toBe('\\i Italic text\\i0 ');
    });

    test('converts underline tags to RTF correctly', () => {
      const el = document.createElement('u');
      el.textContent = 'Underline text';
      expect(toRtf(el)).toBe('\\ul Underline text\\ul0 ');
    });
    
    test('converts strikethrough tags to RTF correctly', () => {
      const el = document.createElement('s');
      el.textContent = 'Strike text';
      expect(toRtf(el)).toBe('\\strike Strike text\\strike0 ');
    });

    test('converts paragraph blocks to RTF correctly', () => {
      const el = document.createElement('p');
      el.textContent = 'Paragraph';
      expect(toRtf(el)).toBe('Paragraph\\par ');
    });
  });

  describe('fromRtf()', () => {
    test('converts basic RTF to HTML', () => {
      const rtf = `{\\rtf1 Hello World}`;
      const html = fromRtf(rtf);
      expect(html).toContain('<p>Hello World</p>');
    });

    test('converts RTF bold back to HTML', () => {
      const rtf = `\\b Bold\\b0`;
      const html = fromRtf(rtf);
      expect(html).toBe('<p><strong>Bold</strong></p>');
    });

    test('converts RTF italic back to HTML', () => {
      const rtf = `\\i Italic\\i0`;
      const html = fromRtf(rtf);
      expect(html).toBe('<p><em>Italic</em></p>');
    });

    test('converts RTF underline back to HTML', () => {
      const rtf = `\\ul Underline\\ul0`;
      const html = fromRtf(rtf);
      expect(html).toBe('<p><u>Underline</u></p>');
    });

    test('converts RTF strikethrough back to HTML', () => {
      const rtf = `\\strike Strike\\strike0`;
      const html = fromRtf(rtf);
      expect(html).toBe('<p><s>Strike</s></p>');
    });
    
    test('handles empty lines properly', () => {
      const rtf = `\\par \\par`;
      const html = fromRtf(rtf);
      expect(html).toBe('<p><br></p><p><br></p><p><br></p>');
    });
  });

});
