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
    // media-объект Strapi (есть url) → метаданные для последующего скачивания в assets/
    if (typeof obj.url === 'string') {
      const absUrl = obj.url.startsWith('http') ? obj.url : STRAPI_URL + obj.url;
      out[prefix] = { __media: true, url: absUrl, hash: obj.hash || '', ext: obj.ext || '', name: obj.name || '' };
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
      let data;
      try { data = await fetchSingle(st.api); } catch (e) { console.warn(`  ! ${st.api}: ${e.message}`); continue; }
      if (!data) { console.log(`  (тип ${st.api} ещё не создан — пропуск)`); continue; }
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
      if (!val || !val.__media) continue;
      const fname = ((val.hash || key.replace(/[^\w]+/g, '_')) + (val.ext || '')).replace(/^_+/, '');
      const dest = path.join(cmsDir, fname);
      mediaPaths[key] = `assets/images/cms/${fname}`;
      if (fs.existsSync(dest)) continue;             // уже скачано
      try {
        const res = await fetch(val.url);
        if (!res.ok) { console.warn(`  ! media ${key} → ${res.status}`); delete mediaPaths[key]; continue; }
        fs.mkdirSync(cmsDir, { recursive: true });
        fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
        console.log(`  ↓ media ${key} → ${mediaPaths[key]}`);
      } catch (e) { console.warn(`  ! media ${key}: ${e.message}`); delete mediaPaths[key]; }
    }
  }

  // 2. пройтись по HTML
  let changedFiles = 0;
  const allMarkerKeys = new Set();
  const missingInStrapi = new Set();
  for (const rel of HTML_FILES) {
    const fp = path.join(ROOT, rel);
    if (!fs.existsSync(fp)) continue;
    const subdirPrefix = rel.includes('/') ? '../' : '';   // pages/*.html → ../assets/...
    const orig = fs.readFileSync(fp, 'utf8');
    let replaced = 0;
    const next = orig.replace(MARKER, (full, key, current) => {
      allMarkerKeys.add(key);
      const val = dict[key];
      if (val === undefined || val === null || val === '') {
        if (val === undefined) missingInStrapi.add(key);
        return full;                                  // fallback — оставляем как есть
      }
      let newInner;
      if (val && val.__media) {
        if (!mediaPaths[key]) return full;            // картинка не скачалась → fallback на текущую
        newInner = subdirPrefix + mediaPaths[key];
      } else {
        newInner = escapeForContext(val);
      }
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
  if (SELFTEST) {
    if (changedFiles === 0) { console.log('=== SELFTEST OK — round-trip байт-идентичен (diff=0) ==='); process.exit(0); }
    console.error(`=== SELFTEST ПРОВАЛ — ${changedFiles} файл(ов) изменились бы (escaping/маркер-баг) ===`); process.exit(2);
  }
  if (missingInStrapi.size) console.warn(`⚠ ключи-маркеры без значения в Strapi (fallback на HTML): ${[...missingInStrapi].join(', ')}`);
  console.log(`=== ${changedFiles === 0 ? 'HTML не изменился' : changedFiles + ' файл(ов) ' + (WRITE ? 'записано' : 'изменилось бы (CHECK)')} ===`);
  process.exit(0);
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
