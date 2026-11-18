import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { client, populateQuery, verifyDynamicZone } from './cms-client.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WRITE = process.argv.includes('--write'), PREVIEW = process.argv.includes('--draft-preview');
if (PREVIEW && (process.env.IC_DESIGN_STAGING !== '1' || !/^http:\/\/(?:ic-design-cms|127\.0\.0\.1|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)(?::\d+)?$/.test(process.env.STRAPI_URL || ''))) throw Error('Draft export is restricted to the closed staging CMS');
const contract = JSON.parse(fs.readFileSync(path.join(ROOT, 'contracts/editorial-v1.json')));
const api = client(), snapshot = { version: contract.version, mode: PREVIEW ? 'draft-preview' : 'published', articles: [], laboratoryPages: [] };
const metadata = new Set(['id','documentId','createdAt','updatedAt','publishedAt','locale','provider','provider_metadata','folderPath','folder','related']);
async function clean(value) {
 if (Array.isArray(value)) return Promise.all(value.map(clean));
 if (!value || typeof value !== 'object') return value;
 if (value.url && value.hash && value.ext) {
  const filename = String(value.hash + value.ext); if (!/^[a-zA-Z0-9_-]+\.(webp|png|jpe?g|avif|gif|pdf)$/i.test(filename)) throw Error('Unsupported media filename');
  const rel = 'assets/images/cms/editorial/' + filename;
  await api.media(value.url, path.join(ROOT, rel), { write: WRITE });
  const result = { url: rel, width: value.width, height: value.height, alternativeText: value.alternativeText || '', caption: value.caption || '', formats: {} };
  for (const [name, format] of Object.entries(value.formats || {})) {
   const f = await clean({ ...format, ext: format.ext || value.ext });
   if (f?.url) result.formats[name] = f;
  }
  return result;
 }
 const result = {};
 for (const [key, v] of Object.entries(value)) if (!metadata.has(key)) result[key] = await clean(v);
 return result;
}
for (const [type, cfg] of Object.entries(contract.types)) {
 const query = populateQuery(cfg.populate); query.set('status', PREVIEW ? 'draft' : 'published'); query.set('sort[0]', 'order:asc'); query.set('sort[1]', 'slug:asc');
 const rows = await api.collection(cfg.api, query.toString());
 // Independent shallow projection includes every component identity, even if a fragment was omitted.
 const inventoryQuery = new URLSearchParams(query);
 for (const key of [...inventoryQuery.keys()]) if (key.startsWith('populate')) inventoryQuery.delete(key);
 inventoryQuery.set('populate[content]', 'true');
 const inventory = await api.collection(cfg.api, inventoryQuery.toString());
 verifyDynamicZone(rows, inventory);
 const keys = new Set(), routes = new Set();
 for (const row of rows) {
  if (!row.externalKey || !row.title || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(row.slug) || keys.has(row.externalKey) || routes.has(row.slug)) throw Error('Invalid or duplicate editorial identity: ' + type);
  if (!PREVIEW && !row.publishedAt) throw Error('Draft document in published API response');
  keys.add(row.externalKey); routes.add(row.slug);
 }
 snapshot[type === 'article' ? 'articles' : 'laboratoryPages'] = await clean(rows);
}
const file = path.join(ROOT, 'content/editorial.json'), next = JSON.stringify(snapshot, null, 2) + '\n';
const changed = !fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== next;
if (WRITE && changed) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, next); }
console.log('[editorial-export]', JSON.stringify({ mode: snapshot.mode, articles: snapshot.articles.length, laboratoryPages: snapshot.laboratoryPages.length, changed, write: WRITE }));
