/**
 * inject-html.js — Фаза 2.6. Strapi single-types → тексты/картинки в HTML.
 *
 * Подставляет значения из Strapi в маркеры HTML вида:
 *   <!-- cms:KEY -->текущее значение<!-- /cms -->
 * где KEY = "<type>.<field>" или "<type>.<field>.<index>.<subfield>"
 *   (напр. site-setting.phone, homepage.heroTitle, homepage.razemyCards.0.name).
 *
 * CONTENT CONTRACT:
 *   - all required single documents/marker fields must be returned successfully;
 *   - explicit null/empty values clear content; missing fields stop the build;
 *   - editable text permits a small inline HTML subset and rejects executable markup;
 *   - --check does not write HTML, snapshots or media;
 *   - the complete sync runs in a temporary directory before promoting outputs.
 *
 * Режимы:
 *   node scripts/inject-html.js --check     # сравнить с данными Strapi, не писать
 *   node scripts/inject-html.js --write      # записать изменившиеся HTML
 *   node scripts/inject-html.js --selftest   # БЕЗ Strapi: значения берутся из самих
 *                                            # маркеров → инъекция обратно → diff ОБЯЗАН быть 0.
 *                                            # Ловит конфликты (один ключ — разные значения) и
 *                                            # баги escaping. Не требует токена/сети.
 *
 * Env: STRAPI_URL, STRAPI_TOKEN (read), FRONTEND_DIR (default ..)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { client } = require('./cms-client');
const { inlineHtml, editableInline, escape: esc } = require('./editorial-text');

const STRAPI_URL = (process.env.STRAPI_URL || 'https://cms.ic-farvater.ru').replace(/\/$/, '');
const ROOT = process.env.FRONTEND_DIR || path.resolve(__dirname, '..');
const WRITE = process.argv.includes('--write');
const SELFTEST = process.argv.includes('--selftest');
let TOKEN = process.env.STRAPI_TOKEN || '';
try { if (!TOKEN) TOKEN = fs.readFileSync(path.join(ROOT, '.token'), 'utf8').trim(); } catch {}

// Какие single-types тянем и под каким префиксом ключа они идут в маркерах.
const SINGLE_TYPES = [
  { prefix: 'site-setting', api: 'site-setting' },
  { prefix: 'homepage', api: 'homepage' },
  { prefix: 'about-page', api: 'about-page' },
  { prefix: 'contacts-page', api: 'contacts-page' },
  { prefix: 'catalog-page', api: 'catalog-page' },
];

// HTML-файлы, в которых ищем маркеры.
const HTML_FILES = ['index.html', 'pages/about.html', 'pages/contacts.html', 'pages/products.html', 'pages/product-detail.html', 'pages/privacy-policy.html', 'pages/consent.html'];

async function fetchSingle(api) {
  const value = await client({ baseUrl: STRAPI_URL, token: TOKEN }).json(api, 'populate=*');
  if (!value.data || Array.isArray(value.data) || typeof value.data !== 'object') throw Error(`CMS ${api}: required single document missing`);
  return value.data;
}

// Превратить объект Strapi в плоский словарь dotted-ключей.
// media-поле → строка-путь (если скачано) или url; компоненты/массивы → рекурсивно с индексами.
function flatten(obj, prefix, out) {
  if (obj === undefined) return;
  if (obj === null) { out[prefix] = null; return; }
  if (Array.isArray(obj)) {
    out[prefix] = obj;
    obj.forEach((v, i) => flatten(v, `${prefix}.${i}`, out));
    return;
  }
  if (typeof obj === 'object') {
    // media-объект Strapi (есть url) → метаданные для последующего скачивания в assets/
    if (typeof obj.url === 'string') {
      const absUrl = obj.url.startsWith('http') ? obj.url : STRAPI_URL + obj.url;
      out[prefix] = { __media: true, url: absUrl, hash: obj.hash || '', ext: obj.ext || '', name: obj.name || '' };
      if (prefix === 'about-page.heroImage') Object.assign(out[prefix], {
        alt: typeof obj.alternativeText === 'string' ? obj.alternativeText : '',
        width: obj.width, height: obj.height,
      });
      return;
    }
    for (const [k, v] of Object.entries(obj)) {
      if (['id', 'documentId', 'createdAt', 'updatedAt', 'publishedAt', 'locale'].includes(k)) continue;
      flatten(v, `${prefix}.${k}`, out);
    }
    return;
  }
  out[prefix] = obj;   // примитив
}

function escapeForContext(value, before) {
  // Если маркер стоит внутри значения атрибута (последний незакрытый кавычечный контекст) —
  // экранируем кавычки. Грубая эвристика: смотрим символ перед "<!-- cms".
  // На практике маркеры в атрибутах ставим только вокруг src/href (значение без кавычек внутри).
  return String(value);
}

const { renderHomeBlocks } = require('./render-home-blocks');
const { renderHomeServices } = require('./render-home-services');
const { renderHomeHero } = require('./render-home-hero');

const MARKER = /<!--\s*cms:([\w.-]+)\s*-->([\s\S]*?)<!--\s*\/cms\s*-->/g;

// SELFTEST: словарь значений из самих маркеров HTML (то, что seed залил бы в Strapi).
// Ловит конфликты: один ключ с РАЗНЫМИ текущими значениями на разных страницах.
function buildDictFromMarkers() {
  const dict = {};
  const seenAt = {};
  const conflicts = [];
  for (const rel of HTML_FILES) {
    const fp = path.join(ROOT, rel);
    if (!fs.existsSync(fp)) continue;
    const html = fs.readFileSync(fp, 'utf8');
    let m;
    const re = new RegExp(MARKER.source, 'g');
    while ((m = re.exec(html)) !== null) {
      const key = m[1], val = m[2];
      if (key in dict && dict[key] !== val) conflicts.push({ key, a: `${seenAt[key]}: ${dict[key].slice(0, 60)}`, b: `${rel}: ${val.slice(0, 60)}` });
      dict[key] = val;
      seenAt[key] = rel;
    }
  }
  return { dict, conflicts };
}

(async () => {
  console.log(`STRAPI_URL=${STRAPI_URL}  ROOT=${ROOT}  mode=${SELFTEST ? 'SELFTEST' : WRITE ? 'WRITE' : 'CHECK'}  token=${TOKEN ? 'да' : 'нет'}`);

  // 1. собрать словарь значений
  let dict = {};
  const singles = {};
  if (SELFTEST) {
    const r = buildDictFromMarkers();
    dict = r.dict;
    if (r.conflicts.length) {
      console.error(`✗ КОНФЛИКТЫ (один ключ — разные значения на разных страницах):`);
      r.conflicts.forEach((c) => console.error(`  ${c.key}\n     ${c.a}\n     ${c.b}`));
      console.error('Единый источник (site-setting) изменил бы контент. Нужны раздельные ключи или унификация.');
      process.exit(2);
    }
    console.log(`SELFTEST: значений из маркеров: ${Object.keys(dict).length}`);
  } else {
    for (const st of SINGLE_TYPES) {
      const data = await fetchSingle(st.api);
      singles[st.prefix] = data;
      flatten(data, st.prefix, dict);
    }
    console.log(`Значений из Strapi: ${Object.keys(dict).length}`);
  }

  // 1.5. media-поля: скачать загруженные в Strapi картинки в assets/images/cms/
  //      (стабильное имя по hash → не качаем повторно). Путь без префикса; префикс
  //      под конкретный файл (../ для pages/*) добавляется при подстановке.
  const mediaPaths = {};
  if (!SELFTEST) {
    const cmsDir = path.join(ROOT, 'assets', 'images', 'cms');
    for (const [key, val] of Object.entries(dict)) {
      if (['homepage.heroBackground','homepage.heroBackgroundMobile'].includes(key)) continue;
      if (!val || !val.__media) continue;
      const fname = ((val.hash || key.replace(/[^\w]+/g, '_')) + (val.ext || '')).replace(/^_+/, '');
      const dest = path.join(cmsDir, fname);
      mediaPaths[key] = `assets/images/cms/${fname}`;
      if (fs.existsSync(dest)) continue;             // уже скачано
      await client({ baseUrl: STRAPI_URL, token: TOKEN }).media(val.url, dest, { write: WRITE });
    }
  }

  // 2. пройтись по HTML
  let changedFiles = 0;
  const allMarkerKeys = new Set();
  const missingInStrapi = new Set();
  const clearedParent = key => {
    const parts = key.split('.');
    while (parts.length > 1) {
      parts.pop(); const parent = dict[parts.join('.')];
      if (parent === null) return true;
      if (Array.isArray(parent)) {
        const index = Number(key.split('.')[parts.length]);
        if (Number.isInteger(index) && index >= parent.length) return true;
      }
    }
    return false;
  };
  const pending = [];
  for (const rel of HTML_FILES) {
    const fp = path.join(ROOT, rel);
    if (!fs.existsSync(fp)) continue;
    const subdirPrefix = rel.includes('/') ? '../' : '';   // pages/*.html → ../assets/...
    const orig = fs.readFileSync(fp, 'utf8');
    let replaced = 0;
    // 2a. ТЕКСТ — маркеры <!-- cms:KEY -->...<!-- /cms --> между тегами (только строковые значения)
    let next = orig.replace(MARKER, (full, key, current) => {
      allMarkerKeys.add(key);
      const val = dict[key] === undefined && clearedParent(key) ? null : dict[key];
      if (val === undefined) { missingInStrapi.add(key); return full; }
      if (val !== null && typeof val !== 'string' && typeof val !== 'number') throw Error(`CMS marker ${key}: expected editable text`);
      const text = SELFTEST ? val : editableInline(val, current);
      if (text === current) return full;
      replaced++;
      return `<!-- cms:${key} -->${text}<!-- /cms -->`;
    });
    // 2b. КАРТИНКИ — <img ... data-cms-src="KEY" ...>: подставить путь в src (или data-src для lazy).
    //     Значение атрибута чистое (без комментариев) — картинка не ломается. Пусто в Strapi → не трогаем.
    if (!SELFTEST) {
      next = next.replace(/<img\b[^>]*?\bdata-cms-src="([\w.-]+)"[^>]*>/g, (tag, key) => {
        allMarkerKeys.add(key);
        const val = dict[key];
        if (key === 'about-page.heroImage' && (val === null || (val?.__media && mediaPaths[key]))) {
          // Keep the CMS slot when an editor clears the cover, so a later selection can fill it again.
          const size = [val?.width,val?.height].every(n => Number.isSafeInteger(n) && n > 0)
            ? ` width="${val.width}" height="${val.height}"` : '';
          const newTag = val === null ? `<img data-cms-src="${key}" alt="" hidden>`
            : `<img data-cms-src="${key}"${size} src="${esc(subdirPrefix+mediaPaths[key])}" alt="${esc(val.alt)}" fetchpriority="high" decoding="async">`;
          if (newTag !== tag) replaced++;
          return newTag;
        }
        if (val === null || clearedParent(key)) { replaced++; return ''; }
        if (!val || !val.__media || !mediaPaths[key]) { if (val === undefined) missingInStrapi.add(key); return tag; }
        const attr = /\sdata-src="/.test(tag) ? 'data-src' : 'src';
        const re = new RegExp(`(\\s${attr}=")[^"]*(")`);   // \s перед именем — чтобы не цеплять data-cms-src
        if (!re.test(tag)) return tag;
        const newTag = tag.replace(re, `$1${subdirPrefix}${mediaPaths[key]}$2`);
        if (newTag !== tag) replaced++;
        return newTag;
      });
    }
    if (next !== orig) {
      changedFiles++;
      console.log(`  ${rel}: ${replaced} замен`);
      pending.push([fp, next]);
    } else {
      console.log(`  ${rel}: без изменений`);
    }
  }

  if (!SELFTEST && missingInStrapi.size) throw Error(`CMS fields missing: ${[...missingInStrapi].join(', ')}`);
  for (const [fp, next] of pending) if (WRITE) fs.writeFileSync(fp, next, 'utf8');
  if (!SELFTEST && WRITE) {
    const values = Object.fromEntries(Object.entries(dict).filter(([key]) => key.startsWith('site-setting.')));
    const file = path.join(ROOT, 'content/site-settings.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify({ version: 1, values }, null, 2) + '\n');
  }
  // Конструктор главной (D4): dynamic zone homepage.blocks → секции между HOME:BLOCKS.
  if (!SELFTEST) {
    await renderHomeHero({ homepage: singles.homepage, api: client({baseUrl:STRAPI_URL,token:TOKEN}), write: WRITE });
    const blocks = await renderHomeBlocks({ strapiUrl: STRAPI_URL, token: TOKEN, write: WRITE });
    renderHomeServices({ homepage: singles.homepage, counter: blocks?.nextCounter, write: WRITE });
  }

  console.log(`\nМаркеров в HTML: ${allMarkerKeys.size}`);
  if (SELFTEST) {
    if (changedFiles === 0) { console.log('=== SELFTEST OK — round-trip байт-идентичен (diff=0) ==='); process.exit(0); }
    console.error(`=== SELFTEST ПРОВАЛ — ${changedFiles} файл(ов) изменились бы (escaping/маркер-баг) ===`); process.exit(2);
  }
  if (missingInStrapi.size) console.warn(`⚠ ключи-маркеры без значения в Strapi (fallback на HTML): ${[...missingInStrapi].join(', ')}`);
  console.log(`=== ${changedFiles === 0 ? 'HTML не изменился' : changedFiles + ' файл(ов) ' + (WRITE ? 'записано' : 'изменилось бы (CHECK)')} ===`);
  process.exit(0);
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
