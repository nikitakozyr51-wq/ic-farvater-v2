'use strict';
const MarkdownIt = require('markdown-it');
const { Parser } = require('htmlparser2');
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function safeHref(value) {
 const raw = String(value ?? '').trim();
 if (!raw || /[\u0000-\u0020\u007f\\]/.test(raw) || raw.startsWith('//')) return '';
 try { const url = new URL(raw, 'https://ic-farvater.ru'); return ['https:', 'http:', 'mailto:', 'tel:'].includes(url.protocol) ? raw : ''; } catch { return ''; }
}
const markdown = new MarkdownIt({ html: false, linkify: false, typographer: false });
markdown.validateLink = url => Boolean(safeHref(url));
markdown.renderer.rules.image = (tokens, index) => escape(tokens[index].content || '');
const linkOpen = markdown.renderer.rules.link_open || ((tokens, index, options, env, renderer) => renderer.renderToken(tokens, index, options));
const linkClose = markdown.renderer.rules.link_close || ((tokens, index, options, env, renderer) => renderer.renderToken(tokens, index, options));
markdown.renderer.rules.link_open = (tokens, index, options, env, renderer) => { env.linkDepth = (env.linkDepth || 0) + 1; return linkOpen(tokens, index, options, env, renderer); };
markdown.renderer.rules.link_close = (tokens, index, options, env, renderer) => { env.linkDepth = Math.max(0, (env.linkDepth || 0) - 1); return linkClose(tokens, index, options, env, renderer); };
markdown.renderer.rules.text = (tokens, index, options, env) => {
 const value = escape(tokens[index].content);
 return env.sources && !env.linkDepth ? value.replace(/\[(\d+)\]/g, '<a class="editorial-source-ref" href="#source-$1">[$1]</a>') : value;
};
function inlineHtml(value, { sources = false } = {}) {
 let html = '', suppressed = 0; const stack = [];
 const allowed = new Set(['br','strong','b','em','i','a','code']);
 const dangerous = new Set(['script','style','iframe','object','svg','math','template']);
 const parser = new Parser({
  onopentag(name, attrs) {
   if (suppressed || dangerous.has(name)) { suppressed++; stack.push({ name, suppressed: true }); return; }
   let output = allowed.has(name) ? name : '';
   if (output === 'a' && !safeHref(attrs.href)) output = '';
   stack.push({ name, output });
   if (output) html += '<' + output + (output === 'a' ? ' href="' + escape(safeHref(attrs.href)) + '"' : '') + '>';
  },
  ontext(value) {
   if (suppressed) return;
   let text = escape(value);
   if (sources && !stack.some(n => n.output === 'a' || n.output === 'code')) text = text.replace(/\[(\d+)\]/g, '<a class="editorial-source-ref" href="#source-$1">[$1]</a>');
   html += text;
  },
  onclosetag() { const tag = stack.pop(); if (!tag) return; if (tag.suppressed) suppressed--; else if (tag.output && tag.output !== 'br') html += '</' + tag.output + '>'; },
 }, { decodeEntities: true });
 parser.end(String(value ?? '')); return html;
}
function richText(value, { sources = false } = {}) {
 return markdown.render(String(value ?? ''), { sources, linkDepth: 0 });
}
function plainText(value) { let text = ''; const parser = new Parser({ ontext: s => { text += s; }, onopentag: name => { if (['br','p','div'].includes(name)) text += ' '; } }, { decodeEntities: true }); parser.end(String(value ?? '')); return text.replace(/\s+/g, ' ').trim(); }
/** Keep accepted NBSP spelling only when existing markup is already safe and equivalent. */
function editableInline(value, current = '') {
 const next = inlineHtml(value == null ? '' : String(value));
 const safeCurrent = inlineHtml(current);
 const decodeNbsp = text => text.replace(/&nbsp;|&#0*160;|&#x0*a0;/gi, '\u00a0');
 const sameSpacing = text => text.replace(/\u00a0/g, ' ');
 return decodeNbsp(current) === safeCurrent && sameSpacing(safeCurrent) === sameSpacing(next) ? current : next;
}
module.exports = { escape, safeHref, inlineHtml, richText, plainText, editableInline };
