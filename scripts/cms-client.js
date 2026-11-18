'use strict';
const fs = require('node:fs'), path = require('node:path');
function client({ baseUrl = process.env.STRAPI_URL || 'https://cms.ic-farvater.ru', token = process.env.STRAPI_TOKEN || '' } = {}) {
 const base = new URL(baseUrl);
 if (!['https:', 'http:'].includes(base.protocol)) throw Error('Invalid CMS protocol');
 async function json(api, query = '') {
  const url = new URL('/api/' + api, base); url.search = typeof query === 'string' ? query : new URLSearchParams(query).toString();
  const response = await fetch(url, { headers: token ? { Authorization: 'Bearer ' + token } : {}, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw Error(`CMS ${api}: HTTP ${response.status}`);
  const value = await response.json();
  if (!value || !Object.hasOwn(value, 'data') || value.error) throw Error(`CMS ${api}: invalid response envelope`);
  return value;
 }
 async function collection(api, query = '', { allowEmpty = true } = {}) {
  const data = [], ids = new Set(); let expectedTotal, pageCount;
  for (let page = 1; page <= 1000; page++) {
   const params = new URLSearchParams(query); params.set('pagination[page]', String(page)); params.set('pagination[pageSize]', '100');
   const value = await json(api, params.toString()), meta = value.meta?.pagination;
   if (!Array.isArray(value.data) || !meta || !Number.isInteger(meta.total) || !Number.isInteger(meta.pageCount) || meta.page !== page) throw Error(`CMS ${api}: invalid pagination`);
   if (expectedTotal === undefined) { expectedTotal = meta.total; pageCount = meta.pageCount; }
   if (meta.total !== expectedTotal || meta.pageCount !== pageCount) throw Error(`CMS ${api}: collection changed during pagination; retry`);
   for (const item of value.data) {
    const id = item.documentId ?? item.id; if (id === undefined || ids.has(id)) throw Error(`CMS ${api}: duplicate or missing identity`);
    ids.add(id); data.push(item);
   }
   if (page >= pageCount) break;
   if (!value.data.length) throw Error(`CMS ${api}: incomplete pagination`);
  }
  if (data.length !== expectedTotal) throw Error(`CMS ${api}: incomplete collection`);
  if (!allowEmpty && !data.length) throw Error(`CMS ${api}: empty collection requires an explicit clear decision`);
  return data;
 }
 async function media(url, destination, { write = true } = {}) {
  const source = new URL(url, base);
  if (source.origin !== base.origin || !source.pathname.startsWith('/uploads/')) throw Error('CMS media must come from the configured upload provider');
  if (fs.existsSync(destination) || !write) return;
  const response = await fetch(source, { headers: token ? { Authorization: 'Bearer ' + token } : {}, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error(`CMS media: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer()); if (!bytes.length || bytes.length > 64 * 1024 * 1024) throw Error('CMS media size is invalid');
  fs.mkdirSync(path.dirname(destination), { recursive: true }); const temporary = destination + '.pending'; fs.writeFileSync(temporary, bytes); fs.renameSync(temporary, destination);
 }
 return { json, collection, media };
}
function populateQuery(populate) {
 const params = new URLSearchParams();
 const visit = (value, key) => {
  if (Array.isArray(value)) value.forEach((v, i) => visit(v, key + '[' + i + ']'));
  else if (value && typeof value === 'object') {
   if (!Object.keys(value).length && key.includes('[on]')) throw Error('Empty CMS dynamic-zone fragment: ' + key);
   for (const [name, v] of Object.entries(value)) visit(v, key + '[' + name + ']');
  }
  else params.set(key, String(value));
 };
 visit(populate, 'populate'); return params;
}
function verifyDynamicZone(rows, references, field = 'content') {
 if (rows.length !== references.length) throw Error('CMS component inventory changed during export; retry');
 const byId = new Map(references.map(row => [row.documentId ?? row.id, row]));
 if (byId.size !== references.length) throw Error('Duplicate CMS inventory identity');
 for (const row of rows) {
  const reference = byId.get(row.documentId ?? row.id);
  if (!reference || !Array.isArray(row[field]) || !Array.isArray(reference[field])) throw Error('Missing CMS component inventory');
  const signature = blocks => blocks.map(block => {
   if (block.id == null || !block.__component) throw Error('Missing CMS component identity');
   return block.__component + ':' + block.id;
  });
  const actual = signature(row[field]), expected = signature(reference[field]);
  if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) throw Error('Incomplete CMS dynamic-zone export: ' + field);
 }
}
module.exports = { client, populateQuery, verifyDynamicZone };
