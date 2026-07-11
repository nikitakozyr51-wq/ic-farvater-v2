/**
 * generate-data.js — синхронизация каталога из Strapi в js/*-data.js.
 *
 * Тянет каталог из Strapi REST API и собирает 4 data-файла сайта.
 * ГЛАВНОЕ: сравнивает РАСПАРСЕННЫЕ данные с текущими файлами и пишет файл
 * только если данные реально изменились. Нет изменений в Strapi → файлы не
 * трогаются → сайт не меняется.
 *
 * Режимы:
 *   node scripts/generate-data.js --check   # только сравнить, НЕ писать
 *   node scripts/generate-data.js --write   # записать изменившиеся файлы
 *
 * Env:
 *   STRAPI_URL   (default https://cms.ic-farvater.ru)
 *   STRAPI_TOKEN (read-only API token; в CI — секрет)
 *   FRONTEND_JS_DIR (default ../js рядом со scripts/)
 *
 * Запускается роботом GitHub Actions (.github/workflows/sync-catalog.yml):
 * генерация → npm run build (минификация) → commit+push → автодеплой сайта.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const STRAPI_URL = (process.env.STRAPI_URL || 'https://cms.ic-farvater.ru').replace(/\/$/, '');
const JS_DIR = process.env.FRONTEND_JS_DIR || path.resolve(__dirname, '../js');
const WRITE = process.argv.includes('--write');
let TOKEN = process.env.STRAPI_TOKEN || '';
try { if (!TOKEN) TOKEN = fs.readFileSync(path.join(__dirname, '..', '.token'), 'utf8').trim(); } catch {}

async function getAll(plural, query = '') {
  const out = [];
  for (let page = 1; ; page++) {
    const url = `${STRAPI_URL}/api/${plural}?${query}&pagination[page]=${page}&pagination[pageSize]=100`;
    const res = await fetch(url, { headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {} });
    if (!res.ok) throw new Error(`GET ${plural} p${page} → ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const json = await res.json();
    const data = json.data || [];
    out.push(...data);
    const pc = json.meta && json.meta.pagination ? json.meta.pagination.pageCount : 1;
    if (page >= pc || data.length === 0) break;
  }
  return out;
}

function loadCurrentVar(file, varName) {
  const code = fs.readFileSync(path.join(JS_DIR, file), 'utf8');
  const ctx = {};
  vm.createContext(ctx);
  vm.runInContext(code + `\n;globalThis.__OUT=(typeof ${varName}!=='undefined')?${varName}:null;`, ctx);
  return ctx.__OUT;
}

function pick(src, keys, rename = {}) {
  const o = {};
  for (const k of keys) {
    const v = src[rename[k] || k];
    if (v !== null && v !== undefined) o[k] = v;
  }
  return o;
}

// Фото из медиатеки Strapi (поле photo) → локальный файл в assets/images/cms/catalog/.
// Возвращает относительный путь для data-файлов ('../assets/...', как существующие пути)
// или '' если фото нет/не скачалось (тогда используется старое строковое поле image).
// Имя файла стабильно по hash — повторно не качаем, диффы не дёргаются.
const FRONT_ROOT = path.resolve(JS_DIR, '..');
async function downloadPhoto(photo) {
  if (!photo || !photo.url) return '';
  const url = photo.url.startsWith('http') ? photo.url : STRAPI_URL + photo.url;
  const fname = ((photo.hash || 'img') + (photo.ext || '')).replace(/^_+/, '');
  const dir = path.join(FRONT_ROOT, 'assets', 'images', 'cms', 'catalog');
  const dest = path.join(dir, fname);
  const rel = `../assets/images/cms/catalog/${fname}`;
  if (fs.existsSync(dest)) return rel;
  const res = await fetch(url, { headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {} });
  if (!res.ok) { console.warn(`  ! photo ${fname} → ${res.status}`); return ''; }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log(`  ↓ photo → ${rel}`);
  return rel;
}
// Пред-проход: скачать photo у всех доков, положить путь в doc.__photoPath.
async function resolvePhotos(docs) {
  for (const d of docs) d.__photoPath = await downloadPhoto(d.photo);
  return docs;
}

function buildSeries(doc, itemKeys, itemRename) {
  const items = (doc.items || []).map((it) => pick(it, itemKeys, itemRename));
  return {
    slug: doc.slug,
    name: doc.name,
    group: doc.group,
    tu: doc.tu == null ? '' : doc.tu,
    description: doc.description == null ? '' : doc.description,
    image: doc.__photoPath || (doc.image == null ? '' : doc.image),
    imageByType: doc.imageByType || {},
    count: items.length,
    items,
  };
}

const CONNECTOR_ITEM_KEYS = ['name', 'type', 'tu'];
const CONVERTER_ITEM_KEYS = ['name', 'type', 'subseries', 'partnumber', 'vin', 'vout', 'case', 'size', 'temp', 'power', 'current', 'datasheet', 'displayName', 'displaySub'];
const CAPACITOR_ITEM_KEYS = ['name', 'partnumber', 'capacitance', 'code', 'case', 'tolerance', 'temp', 'voltage', 'datasheet', 'displayName', 'displaySub'];
const ITEM_RENAME = { case: 'caseType' };

function buildProduct(doc) {
  const specs = {};
  for (const s of (doc.specs || [])) specs[s.label] = s.value;
  return {
    id: doc.order,
    name: doc.nameDisplay,
    category: doc.category ? doc.category.nameRu : '',
    subcategory: doc.subcategory == null ? '' : doc.subcategory,
    description: doc.description == null ? '' : doc.description,
    image: doc.__photoPath || (doc.image == null ? '' : doc.image),
    specs,
  };
}

// Массивы — по порядку; объекты — порядок ключей игнорируется (сайт читает по имени).
function deepEqualUnordered(a, b) {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!deepEqualUnordered(a[i], b[i])) return false;
    return true;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ak = Object.keys(a), bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    for (const k of ak) { if (!Object.prototype.hasOwnProperty.call(b, k)) return false; if (!deepEqualUnordered(a[k], b[k])) return false; }
    return true;
  }
  return false;
}
function whyDifferent(o, n) {
  if (!o || !n || typeof o !== 'object') return 'тип/структура';
  const ok = Object.keys(o), nk = Object.keys(n);
  const onlyOld = ok.filter((k) => !(k in n)), onlyNew = nk.filter((k) => !(k in o));
  if (onlyOld.length || onlyNew.length) return `ключи только в old:[${onlyOld}] только в new:[${onlyNew}]`;
  const valDiff = ok.filter((k) => JSON.stringify(o[k]) !== JSON.stringify(n[k]) && !deepEqualUnordered(o[k], n[k]));
  return valDiff.length ? `разные значения: ${valDiff.join(', ')}` : 'только порядок ключей (сайту безразлично)';
}
function diffArrays(label, oldArr, newArr, ordered) {
  const diffs = [];
  if (!Array.isArray(oldArr)) { diffs.push(`${label}: текущий файл не загрузился как массив`); return diffs; }
  if (oldArr.length !== newArr.length) diffs.push(`${label}: длина ${oldArr.length} → ${newArr.length}`);
  const n = Math.min(oldArr.length, newArr.length);
  for (let i = 0; i < n; i++) {
    const same = ordered ? JSON.stringify(oldArr[i]) === JSON.stringify(newArr[i]) : deepEqualUnordered(oldArr[i], newArr[i]);
    if (!same) diffs.push(`${label}[${i}] (${oldArr[i].slug || oldArr[i].name || oldArr[i].id}) — ${whyDifferent(oldArr[i], newArr[i])}`);
  }
  return diffs;
}

function header(file) {
  const cur = fs.readFileSync(path.join(JS_DIR, file), 'utf8');
  const cmt = [];
  for (const l of cur.split('\n')) { if (l.startsWith('//')) cmt.push(l); else break; }
  return cmt.length ? cmt.join('\n') + '\n\n' : '';
}
function writeSeriesFile(file, varName, arr) {
  const body = arr.map((s) => [
    '  {',
    `    slug: ${JSON.stringify(s.slug)},`,
    `    name: ${JSON.stringify(s.name)},`,
    `    group: ${JSON.stringify(s.group)},`,
    `    tu: ${JSON.stringify(s.tu)},`,
    `    description: ${JSON.stringify(s.description)},`,
    `    image: ${JSON.stringify(s.image)},`,
    `    imageByType: ${JSON.stringify(s.imageByType)},`,
    `    count: ${s.count},`,
    '    items: [',
    s.items.map((it) => '      ' + JSON.stringify(it)).join(',\n'),
    '    ]',
    '  }',
  ].join('\n')).join(',\n');
  fs.writeFileSync(path.join(JS_DIR, file), `${header(file)}var ${varName} = [\n${body}\n];\n`, 'utf8');
}
function writeProductsFile(file, arr) {
  const body = arr.map((p) => '  ' + JSON.stringify(p, null, 2).split('\n').map((l, i) => i === 0 ? l : '  ' + l).join('\n')).join(',\n');
  fs.writeFileSync(path.join(JS_DIR, file), `${header(file)}const PRODUCTS = [\n${body}\n];\n`, 'utf8');
}

(async () => {
  console.log(`STRAPI_URL=${STRAPI_URL}  JS_DIR=${JS_DIR}  mode=${WRITE ? 'WRITE' : 'CHECK'}  token=${TOKEN ? 'да' : 'нет'}`);
  const [conn, conv, cap, prods] = await Promise.all([
    getAll('connector-series-list', 'populate=*&sort=order:asc'),
    getAll('converter-series-list', 'populate=*&sort=order:asc'),
    getAll('capacitor-series-list', 'populate=*&sort=order:asc'),
    getAll('products', 'populate=*&sort=order:asc'),
  ]);
  console.log(`Из Strapi: connector=${conn.length} converter=${conv.length} capacitor=${cap.length} products=${prods.length}`);

  // Медиатека: скачать photo (если загружено) — путь приоритетнее строкового image.
  await resolvePhotos(conn); await resolvePhotos(conv); await resolvePhotos(cap); await resolvePhotos(prods);

  const targets = [
    { file: 'connectors-data.js', varName: 'CONNECTOR_SERIES', cur: loadCurrentVar('connectors-data.js', 'CONNECTOR_SERIES'), neu: conn.map((d) => buildSeries(d, CONNECTOR_ITEM_KEYS, ITEM_RENAME)), kind: 'series' },
    { file: 'converters-data.js', varName: 'CONVERTER_SERIES', cur: loadCurrentVar('converters-data.js', 'CONVERTER_SERIES'), neu: conv.map((d) => buildSeries(d, CONVERTER_ITEM_KEYS, ITEM_RENAME)), kind: 'series' },
    { file: 'capacitors-data.js', varName: 'CAPACITOR_SERIES', cur: loadCurrentVar('capacitors-data.js', 'CAPACITOR_SERIES'), neu: cap.map((d) => buildSeries(d, CAPACITOR_ITEM_KEYS, ITEM_RENAME)), kind: 'series' },
    { file: 'products.js', varName: 'PRODUCTS', cur: loadCurrentVar('products.js', 'PRODUCTS'), neu: prods.map(buildProduct), kind: 'products' },
  ];

  let changed = 0;
  for (const t of targets) {
    const diffs = diffArrays(t.file, t.cur, t.neu, t.kind === 'products');
    if (diffs.length === 0) {
      console.log(`✅ ${t.file}: идентично (${t.neu.length})`);
    } else {
      changed++;
      console.log(`⚠ ${t.file}: изменения (${diffs.length}):`);
      diffs.slice(0, 30).forEach((d) => console.log('  ' + d));
      if (WRITE) {
        if (t.kind === 'series') writeSeriesFile(t.file, t.varName, t.neu);
        else writeProductsFile(t.file, t.neu);
        console.log(`  → записан ${t.file}`);
      }
    }
  }
  console.log(`\n=== ${changed === 0 ? 'БЕЗ ИЗМЕНЕНИЙ — сайт не трогаем' : changed + ' файл(ов) ' + (WRITE ? 'обновлено' : 'изменилось (CHECK, не записано)')} ===`);
  process.exit(0);
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
