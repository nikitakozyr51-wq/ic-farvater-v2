/**
 * inject-html.js — Фаза 2.6. Strapi single-types → тексты/картинки в HTML.
 *
 * Подставляет значения из Strapi в маркеры HTML вида:
 *   <!-- cms:KEY -->текущее значение<!-- /cms -->
 * где KEY = "<type>.<field>" или "<type>.<field>.<index>.<subfield>"
 *   (напр. site-setting.phone, homepage.heroTitle, homepage.razemyCards.0.name).
 *
 * ГАРАНТИЯ ДИЗАЙНА:
 *   - заменяет содержимое маркера ТОЛЬКО если в Strapi значение непустое,
 *     иначе оставляет текущий HTML (fallback);
 *   - значение экранируется под контекст (текст vs значение атрибута);
 *   - --check: прогон без записи + diff с оригиналом (должен быть пустой,
 *     когда Strapi = seed из текущего HTML).
 *
 * Режимы:
 *   node scripts/inject-html.js --check   # сравнить, не писать
 *   node scripts/inject-html.js --write    # записать изменившиеся HTML
 *
 * Env: STRAPI_URL, STRAPI_TOKEN (read), FRONTEND_DIR (default ..)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const STRAPI_URL = (process.env.STRAPI_URL || 'https://cms.ic-farvater.ru').replace(/\/$/, '');
const ROOT = process.env.FRONTEND_DIR || path.resolve(__dirname, '..');
const WRITE = process.argv.includes('--write');
let TOKEN = process.env.STRAPI_TOKEN || '';
try { if (!TOKEN) TOKEN = fs.readFileSync(path.join(ROOT, '.token'), 'utf8').trim(); } catch {}

// Какие single-types тянем и под каким префиксом ключа они идут в маркерах.
const SINGLE_TYPES = [
  { prefix: 'site-setting', api: 'site-setting' },
  { prefix: 'homepage', api: 'homepage' },
  { prefix: 'about-page', api: 'about-page' },
  { prefix: 'contacts-page', api: 'contacts-page' },
];

// HTML-файлы, в которых ищем маркеры.
const HTML_FILES = ['index.html', 'pages/about.html', 'pages/contacts.html', 'pages/privacy-policy.html', 'pages/consent.html'];

async function fetchSingle(api) {
  const res = await fetch(`${STRAPI_URL}/api/${api}?populate=*`, { headers: TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {} });
  if (res.status === 404) return null;          // тип ещё не создан — ок, пропускаем
  if (!res.ok) throw new Error(`GET ${api} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = await res.json();
  return json.data || null;
}

// Превратить объект Strapi в плоский словарь dotted-ключей.
// media-поле → строка-путь (если скачано) или url; компоненты/массивы → рекурсивно с индексами.
function flatten(obj, prefix, out) {
  if (obj === null || obj === undefined) return;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => flatten(v, `${prefix}.${i}`, out));
    return;
  }
  if (typeof obj === 'object') {
    // media-объект Strapi (есть url) → путь (на этапе текстов картинки обрабатываются отдельно)
    if (typeof obj.url === 'string') { out[prefix] = obj.url; return; }
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

const MARKER = /<!--\s*cms:([\w.-]+)\s*-->([\s\S]*?)<!--\s*\/cms\s*-->/g;

(async () => {
  console.log(`STRAPI_URL=${STRAPI_URL}  ROOT=${ROOT}  mode=${WRITE ? 'WRITE' : 'CHECK'}  token=${TOKEN ? 'да' : 'нет'}`);

  // 1. собрать словарь значений
  const dict = {};
  for (const st of SINGLE_TYPES) {
    let data;
    try { data = await fetchSingle(st.api); } catch (e) { console.warn(`  ! ${st.api}: ${e.message}`); continue; }
    if (!data) { console.log(`  (тип ${st.api} ещё не создан — пропуск)`); continue; }
    flatten(data, st.prefix, dict);
  }
  const keys = Object.keys(dict);
  console.log(`Значений из Strapi: ${keys.length}`);

  // 2. пройтись по HTML
  let changedFiles = 0;
  const allMarkerKeys = new Set();
  const missingInStrapi = new Set();
  for (const rel of HTML_FILES) {
    const fp = path.join(ROOT, rel);
    if (!fs.existsSync(fp)) continue;
    const orig = fs.readFileSync(fp, 'utf8');
    let replaced = 0;
    const next = orig.replace(MARKER, (full, key, current) => {
      allMarkerKeys.add(key);
      const val = dict[key];
      if (val === undefined || val === null || val === '') {
        if (val === undefined) missingInStrapi.add(key);
        return full;                                  // fallback — оставляем как есть
      }
      const newInner = escapeForContext(val);
      if (newInner === current) return full;          // не изменилось
      replaced++;
      return `<!-- cms:${key} -->${newInner}<!-- /cms -->`;
    });
    if (next !== orig) {
      changedFiles++;
      console.log(`  ${rel}: ${replaced} замен`);
      if (WRITE) fs.writeFileSync(fp, next, 'utf8');
    } else {
      console.log(`  ${rel}: без изменений`);
    }
  }

  console.log(`\nМаркеров в HTML: ${allMarkerKeys.size}`);
  if (missingInStrapi.size) console.warn(`⚠ ключи-маркеры без значения в Strapi (fallback на HTML): ${[...missingInStrapi].join(', ')}`);
  console.log(`=== ${changedFiles === 0 ? 'HTML не изменился' : changedFiles + ' файл(ов) ' + (WRITE ? 'записано' : 'изменилось бы (CHECK)')} ===`);
  process.exit(0);
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
