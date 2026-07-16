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

// ── Правило «раздел каталога → применения» (фильтр «Применение») ────────────
// Заказчик задаёт применения на уровне РАЗДЕЛА (правки 2026-07-14), а не
// отдельной позиции, поэтому проставляем apps всем сериям/товарам раздела
// автоматически — новые позиции наследуют применение своего раздела без ручной
// разметки. Если у позиции в Strapi проставлены собственные галочки
// applications — они в приоритете (ручное уточнение перекрывает правило).
// «Промышленность» (industry) исключена из справочника по правкам.
const APP_ORDER = ['telecom', 'radar', 'aviation', 'space', 'medical'];
const APP_EVERYWHERE = APP_ORDER.slice();            // «везде» — во всех применениях
const CATEGORY_APPS = {
  microchips:  ['telecom'],
  capacitors:  ['telecom', 'radar'],            // СВЧ
  transistors: ['telecom', 'radar'],            // СВЧ
  converters:  ['aviation', 'radar'],
  razemy:      APP_EVERYWHERE,                   // разъёмы — везде
  pcb:         APP_EVERYWHERE,                   // платы — везде
};
const EXCLUDED_APPS = new Set(['industry']);

// apps позиции: приоритет ручным галочкам Strapi, иначе — правило раздела.
function appsForCategory(catSlug, strapiApps) {
  const own = (strapiApps || [])
    .map((a) => a && a.slug)
    .filter(Boolean)
    .filter((s) => !EXCLUDED_APPS.has(s));
  if (own.length) return own;
  return CATEGORY_APPS[catSlug] ? CATEGORY_APPS[catSlug].slice() : [];
}

function buildSeries(doc, itemKeys, itemRename, catSlug) {
  const items = (doc.items || []).map((it) => pick(it, itemKeys, itemRename));
  const apps = appsForCategory((doc.category && doc.category.slug) || catSlug, doc.applications);
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
    ...(doc.cardCaption ? { cardCaption: doc.cardCaption } : {}),
    ...(apps.length ? { apps } : {}),
  };
}

const CONNECTOR_ITEM_KEYS = ['name', 'type', 'tu'];
const CONVERTER_ITEM_KEYS = ['name', 'type', 'subseries', 'partnumber', 'vin', 'vout', 'case', 'size', 'temp', 'power', 'current', 'datasheet', 'displayName', 'displaySub'];
const CAPACITOR_ITEM_KEYS = ['name', 'partnumber', 'capacitance', 'code', 'case', 'tolerance', 'temp', 'voltage', 'datasheet', 'displayName', 'displaySub'];
const ITEM_RENAME = { case: 'caseType' };

function buildProduct(doc) {
  const specs = {};
  for (const s of (doc.specs || [])) specs[s.label] = s.value;
  const apps = appsForCategory(doc.category ? doc.category.slug : '', doc.applications);
  return {
    id: doc.order,
    name: doc.nameDisplay,
    category: doc.category ? doc.category.nameRu : '',
    subcategory: doc.subcategory == null ? '' : doc.subcategory,
    description: doc.description == null ? '' : doc.description,
    image: doc.__photoPath || (doc.image == null ? '' : doc.image),
    specs,
    ...(doc.cardCaption ? { cardCaption: doc.cardCaption } : {}),
    ...(apps.length ? { apps } : {}),
  };
}

// Категория каталога → categories-data.js. Управляет плитками, фильтрами,
// лендингами и порядком разделов; source говорит фронту, откуда брать товары.
function buildCategory(doc) {
  return {
    slug: doc.slug,
    name: doc.nameRu,
    source: doc.source || 'none',
    order: doc.order == null ? 99 : doc.order,
    image: doc.__photoPath || (doc.image == null ? '' : doc.image),
    cardDesc: doc.cardDesc || '',
    listDesc: doc.listDesc || '',
    subtitle: doc.subtitle || '',
    bulletsTitle: doc.bulletsTitle || '',
    nomenclatureTitle: doc.nomenclatureTitle || '',
    description: doc.description || '',
    bullets: (doc.landingBullets || []).map((b) => [b.label, b.value]),
    nomenclature: (doc.nomenclature || []).map((b) => [b.label, b.value]),
    // apps раздела — для кросс-категорийного вида фильтра «Применение»
    // (в т.ч. лендинг-разделы вроде плат, у которых нет своих позиций).
    ...(CATEGORY_APPS[doc.slug] ? { apps: CATEGORY_APPS[doc.slug].slice() } : {}),
  };
}
function writeJsonVarFile(file, varName, arr) {
  const body = '// ФАЙЛ ГЕНЕРИРУЕТСЯ scripts/generate-data.js из Strapi — не править руками.\n\nconst ' + varName + ' = ' + JSON.stringify(arr, null, 2) + ';\n';
  fs.writeFileSync(path.join(JS_DIR, file), body, 'utf8');
}
// Применение (справочник фильтра каталога) → applications-data.js.
function buildApplication(doc) {
  return { slug: doc.slug, name: doc.name, order: doc.order == null ? 99 : doc.order };
}
function safeLoadCurrentVar(file, varName) {
  try { return loadCurrentVar(file, varName); } catch { return null; }
}

// ---------- Статический HTML каталога из категорий (SEO) ----------
// Плитки/фильтр/пилюли products.html и футер-нав «Каталог» на всех страницах
// перегенерируются МЕЖДУ МАРКЕРАМИ <!-- CATS:*:START/END -->. Активируется
// только когда категории наполнены (есть cardDesc) — до миграции HTML не трогаем.
const FRONT_HTML = ['index.html', 'pages/about.html', 'pages/products.html', 'pages/product-detail.html', 'pages/contacts.html', 'pages/privacy-policy.html', 'pages/consent.html'];
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function navLabel(c) { return c.name.toLowerCase().replace(/свч/g, 'СВЧ'); }
function replaceBetween(html, start, end, content) {
  const si = html.indexOf(start), ei = html.indexOf(end);
  if (si === -1 || ei === -1 || ei < si) return null;
  return html.slice(0, si + start.length) + '\n' + content + '\n' + html.slice(ei);
}
function renderCatalogHtml(cats) {
  const I = '            ';
  const tiles = cats.map((c) => {
    // landing-only категории → реальная страница лендинга (подход A, была hash-ссылка)
    const href = c.source === 'none' ? `${esc(c.slug)}.html` : `#${esc(c.slug)}`;
    return `${I}<article class="cat-card" data-cat="${esc(c.slug)}" data-name="${esc((c.name + ' ' + c.cardDesc).toLowerCase())}">
${I}  <a href="${href}" class="cat-card__link">
${I}    <div class="cat-card__img">
${I}      ${c.image ? `<img width="1200" height="1200" src="${esc(c.image)}" alt="${esc(c.name)}" loading="lazy">` : ''}
${I}    </div>
${I}    <div class="cat-card__info">
${I}      <h3 class="cat-card__name">${esc(c.name)}</h3>
${I}      ${c.cardDesc ? `<p class="cat-card__desc">${esc(c.cardDesc)}</p>` : ''}
${I}    </div>
${I}  </a>
${I}</article>`;
  }).join('\n');
  const F = '              ';
  const filters = cats.map((c) => `${F}<button class="filter-item" type="button" data-cat="${esc(c.slug)}">${esc(navLabel(c))}</button>`).join('\n');
  const pills = cats.map((c) => `${F}<button class="catalog__pill" type="button" data-cat="${esc(c.slug)}">${esc(navLabel(c))}</button>`).join('\n');
  return { tiles, filters, pills };
}
function updateCatalogHtml(cats) {
  const ready = cats.length > 0 && cats.some((c) => c.cardDesc);
  if (!ready) { console.log('· категории без контента (cardDesc пуст) — статический HTML каталога не трогаю'); return; }
  const { tiles, filters, pills } = renderCatalogHtml(cats);
  const pPath = path.join(FRONT_ROOT, 'pages', 'products.html');
  const orig = fs.readFileSync(pPath, 'utf8');
  let next = orig;
  for (const [mark, content] of [['CATS:GRID', tiles], ['CATS:FILTER', filters], ['CATS:PILLS', pills]]) {
    const r = replaceBetween(next, `<!-- ${mark}:START -->`, `<!-- ${mark}:END -->`, content);
    if (r === null) { console.warn(`  ! маркер ${mark} не найден в products.html`); continue; }
    next = r;
  }
  if (next !== orig) { if (WRITE) fs.writeFileSync(pPath, next, 'utf8'); console.log(`  → products.html: грид/фильтр/пилюли ${WRITE ? 'обновлены' : 'изменились бы (CHECK)'}`); }
  const F = '              ';
  for (const rel of FRONT_HTML) {
    const fp = path.join(FRONT_ROOT, rel);
    if (!fs.existsSync(fp)) continue;
    const prefix = rel.includes('/') ? '' : 'pages/';
    const nav = cats.map((c) => `${F}<li><a href="${prefix}products.html#${esc(c.slug)}">${esc(navLabel(c))}</a></li>`).join('\n');
    const o = fs.readFileSync(fp, 'utf8');
    const r = replaceBetween(o, '<!-- CATS:FOOTERNAV:START -->', '<!-- CATS:FOOTERNAV:END -->', nav);
    if (r !== null && r !== o) { if (WRITE) fs.writeFileSync(fp, r, 'utf8'); console.log(`  → ${rel}: футер-нав ${WRITE ? 'обновлён' : 'изменился бы (CHECK)'}`); }
  }
}
// Кнопки фильтра «Применение» из справочника (маркер APPS:FILTER в products.html).
// Активируется только когда справочник наполнен.
function updateAppsHtml(apps) {
  if (!apps.length) { console.log('· справочник применений пуст — фильтр не трогаю'); return; }
  const F = '              ';
  const btns = apps.map((a) => `${F}<button class="filter-item" type="button" data-app="${esc(a.slug)}">${esc(a.name.toLowerCase())}</button>`).join('\n');
  const pPath = path.join(FRONT_ROOT, 'pages', 'products.html');
  const orig = fs.readFileSync(pPath, 'utf8');
  const r = replaceBetween(orig, '<!-- APPS:FILTER:START -->', '<!-- APPS:FILTER:END -->', btns);
  if (r === null) { console.warn('  ! маркер APPS:FILTER не найден'); return; }
  if (r !== orig) { if (WRITE) fs.writeFileSync(pPath, r, 'utf8'); console.log(`  → products.html: фильтр применений ${WRITE ? 'обновлён' : 'изменился бы (CHECK)'}`); }
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
    // Опциональные ключи из buildSeries — обязаны сериализоваться, иначе
    // «файл записан», а новых данных в нём нет (git clean, коммита нет).
    ...(s.cardCaption ? [`    cardCaption: ${JSON.stringify(s.cardCaption)},`] : []),
    `    image: ${JSON.stringify(s.image)},`,
    `    imageByType: ${JSON.stringify(s.imageByType)},`,
    ...(s.apps ? [`    apps: ${JSON.stringify(s.apps)},`] : []),
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
  const cats = await getAll('categories', 'populate=*&sort=order:asc');
  let apps = [];
  try { apps = await getAll('applications', 'sort=order:asc'); }
  catch { console.log('· тип applications ещё не задеплоен — пропуск'); }
  console.log(`Из Strapi: connector=${conn.length} converter=${conv.length} capacitor=${cap.length} products=${prods.length} categories=${cats.length}`);

  // Медиатека: скачать photo (если загружено) — путь приоритетнее строкового image.
  await resolvePhotos(conn); await resolvePhotos(conv); await resolvePhotos(cap); await resolvePhotos(prods); await resolvePhotos(cats);

  const builtCats = cats.map(buildCategory);
  updateCatalogHtml(builtCats);
  const builtApps = apps.map(buildApplication).filter((a) => !EXCLUDED_APPS.has(a.slug));
  updateAppsHtml(builtApps);

  const targets = [
    { file: 'connectors-data.js', varName: 'CONNECTOR_SERIES', cur: loadCurrentVar('connectors-data.js', 'CONNECTOR_SERIES'), neu: conn.map((d) => buildSeries(d, CONNECTOR_ITEM_KEYS, ITEM_RENAME, 'razemy')), kind: 'series' },
    { file: 'converters-data.js', varName: 'CONVERTER_SERIES', cur: loadCurrentVar('converters-data.js', 'CONVERTER_SERIES'), neu: conv.map((d) => buildSeries(d, CONVERTER_ITEM_KEYS, ITEM_RENAME, 'converters')), kind: 'series' },
    { file: 'capacitors-data.js', varName: 'CAPACITOR_SERIES', cur: loadCurrentVar('capacitors-data.js', 'CAPACITOR_SERIES'), neu: cap.map((d) => buildSeries(d, CAPACITOR_ITEM_KEYS, ITEM_RENAME, 'capacitors')), kind: 'series' },
    { file: 'products.js', varName: 'PRODUCTS', cur: loadCurrentVar('products.js', 'PRODUCTS'), neu: prods.map(buildProduct), kind: 'products' },
    { file: 'categories-data.js', varName: 'CATEGORIES', cur: safeLoadCurrentVar('categories-data.js', 'CATEGORIES'), neu: builtCats, kind: 'categories' },
    { file: 'applications-data.js', varName: 'APPLICATIONS', cur: safeLoadCurrentVar('applications-data.js', 'APPLICATIONS'), neu: builtApps, kind: 'applications' },
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
        else if (t.kind === 'categories' || t.kind === 'applications') writeJsonVarFile(t.file, t.varName, t.neu);
        else writeProductsFile(t.file, t.neu);
        console.log(`  → записан ${t.file}`);
      }
    }
  }
  console.log(`\n=== ${changed === 0 ? 'БЕЗ ИЗМЕНЕНИЙ — сайт не трогаем' : changed + ' файл(ов) ' + (WRITE ? 'обновлено' : 'изменилось (CHECK, не записано)')} ===`);
  process.exit(0);
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
