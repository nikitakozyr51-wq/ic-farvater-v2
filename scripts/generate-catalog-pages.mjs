#!/usr/bin/env node
/**
 * generate-catalog-pages.mjs — реальные URL каталога (подход A, 2026-07-16).
 *
 * Генерирует статические страницы, 1:1 повторяющие клиентский рендер
 * initProductDetail (js/main.js:2148+), используя ЖИВОЙ pages/product-detail.html
 * как шаблон — хром (header/footer/critical CSS/скрипты) наследуется автоматически
 * и не может разъехаться с сайтом.
 *
 * Типы страниц (ровно те, что есть на живом сайте, без новых):
 *   landing  #cat-<slug>   → pages/<catSlug>.html                    (8)
 *   variant  #v-<slug>:<i> → pages/<prefix>-<series>-<pn>.html       (~2400)
 *   product  #p-<id>       → pages/tovar-<slug>.html                 (без дублей вариантов)
 *
 * Страницы НЕ содержат хэша в ссылках на себя → initProductDetail бейлится на
 * пустом хэше (main.js:2150) → двойного рендера нет, а анимации ([data-animate],
 * GSAP) и интерактив (KP-drawer, бургер, поиск) работают штатно: animations.js
 * снимает DOM ДО DOMContentLoaded, все init глобальные.
 *
 * Запуск:  node scripts/generate-catalog-pages.mjs           — полная генерация + sitemap
 *          node scripts/generate-catalog-pages.mjs --pilot   — 3 пилотные страницы, без sitemap
 *          node scripts/generate-catalog-pages.mjs --check   — только отчёт, без записи
 */

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = path.join(ROOT, 'pages');
const PILOT = process.argv.includes('--pilot');
const CHECK = process.argv.includes('--check');
const SITE = 'https://ic-farvater.ru';

// ============================================================ данные через vm
const ctx = {};
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['connectors-data.js', 'converters-data.js', 'capacitors-data.js', 'categories-data.js', 'products.js', 'catalog-urls.js']) {
  const p = path.join(ROOT, 'js', f);
  if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: f });
}
const g = (name) => { try { return vm.runInContext(name, ctx); } catch { return undefined; } };
const CONNECTOR_SERIES = g('CONNECTOR_SERIES') || [];
const CONVERTER_SERIES = g('CONVERTER_SERIES') || [];
const CAPACITOR_SERIES = g('CAPACITOR_SERIES') || [];
const CATEGORIES = g('CATEGORIES') || [];
const PRODUCTS = g('PRODUCTS') || [];
// Единая URL-схема — та же, что использует рантайм (js/catalog-urls.js)
const CATALOG_URLS = g('CATALOG_URLS');
if (!CATALOG_URLS) throw new Error('js/catalog-urls.js не загрузился в vm');

// ==================================== извлечение const-литералов из main.js
const MAIN_SRC = fs.readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
function extractObjectLiteral(src, name) {
  const start = src.indexOf(`const ${name} = {`);
  if (start === -1) throw new Error(`main.js: не найден const ${name}`);
  let i = src.indexOf('{', start), depth = 0, str = null;
  for (let j = i; j < src.length; j++) {
    const ch = src[j], prev = src[j - 1];
    if (str) { if (ch === str && prev !== '\\') str = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { str = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return src.slice(i, j + 1); }
  }
  throw new Error(`main.js: не сбалансированы скобки у ${name}`);
}
const lit = (name) => new Function('return (' + extractObjectLiteral(MAIN_SRC, name) + ')')();
const SERIES_SPECS = lit('SERIES_SPECS');
const CATEGORY_LANDINGS = lit('CATEGORY_LANDINGS');
const RELATED_CAT_INFO = lit('RELATED_CAT_INFO');
const GENERIC_TYPE_IMAGES = lit('GENERIC_TYPE_IMAGES');
const SERIES_SHORT_DESC = lit('SERIES_SHORT_DESC');
const CYRILLIZE_MAP = lit('CYRILLIZE_MAP');

// ============================== порт хелперов main.js (строки указаны, 1:1)
// cyrillize — main.js:13
const cyrillize = (s) => String(s || '').split('').map(ch => CYRILLIZE_MAP[ch] || ch).join('');
// normalizeType — main.js:731
function normalizeType(raw) {
  const t = (raw || '').toLowerCase().trim();
  if (!t) return null;
  if (/заглушк/.test(t)) return 'заглушка';
  if (/кожух/.test(t)) return 'кожух';
  if (/вилк/.test(t)) return 'вилка';
  if (/розетк|роозетк/.test(t)) return 'розетка';
  return t;
}
// resolveSeriesItemImage — main.js:766
function resolveSeriesItemImage(series, item) {
  const ibt = series && series.imageByType;
  if (ibt && item) {
    if (item.type && ibt[item.type]) return ibt[item.type];
    if (item.type) {
      const norm = normalizeType(item.type);
      if (norm) {
        const entry = Object.entries(ibt).find(([k]) => normalizeType(k) === norm);
        if (entry) return entry[1];
      }
    }
    if (item.case && ibt[item.case]) return ibt[item.case];
    const pm = String(item.partnumber || '').match(/^ЭТ[А-Я]+?([\d,]+)-/);
    if (pm && ibt[pm[1]]) return ibt[pm[1]];
    if (item.capacitance) {
      const c = String(item.capacitance);
      if (ibt[c]) return ibt[c];
      const alt = c.indexOf(',') !== -1 ? c.replace(',', '.') : c.replace('.', ',');
      if (ibt[alt]) return ibt[alt];
    }
  }
  if (item && item.type) {
    const norm = normalizeType(item.type);
    if (norm && GENERIC_TYPE_IMAGES[norm]) return GENERIC_TYPE_IMAGES[norm];
  }
  return (series && series.image) || '';
}
// splitVariantName — main.js:799
function splitVariantName(it) {
  const dn = it.displayName || it.name || '';
  let name = dn, sub = it.displaySub || '';
  if (!sub) {
    const m = /^(.+)\s(\S{8,})$/.exec(dn);
    if (m && /\d/.test(m[2]) && /[A-Za-zА-Яа-яЁё]/.test(m[2])) { name = m[1]; sub = m[2]; }
  }
  return [name, sub];
}
// variantSpecs — main.js:870
function variantSpecs(kindKey, series, item) {
  const specs = {};
  let pn = item.partnumber || splitVariantName(item)[1];
  if (!pn) {
    const t = String(item.name || '').split(/\s+/)[0];
    if (t.length >= 5 && /\d/.test(t) && /[A-Za-zА-Яа-яЁё]/.test(t)) pn = t;
  }
  if (pn) specs['партномер'] = pn;
  if (item.type) specs['тип'] = String(item.type).toLowerCase();
  if (kindKey === 'capacitor') {
    if (item.capacitance) specs['ёмкость'] = item.capacitance + ' пФ';
    if (item.case) specs['корпус'] = item.case;
    if (item.voltage) specs['напряжение'] = String(item.voltage).replace(/\s+Код\s+(\d+)/g, ' (код $1)');
    if (item.tolerance) specs['допуск'] = item.tolerance;
    if (item.temp) specs['температура'] = item.temp;
  } else if (kindKey === 'converter') {
    if (item.vout) specs['выходное напряжение'] = item.vout + ' В';
    if (item.power) specs['мощность'] = item.power + ' Вт';
  }
  (SERIES_SPECS[series.slug] || []).forEach(([k, v]) => { if (!(k in specs)) specs[k] = v; });
  const tu = item.tu || series.tu;
  if (tu && !specs['ту']) specs['ту'] = tu;
  return specs;
}
// shortDesc — main.js:723
const shortDesc = (slug, fallback) =>
  SERIES_SHORT_DESC[slug] || (fallback ? String(fallback).split('.')[0] + '.' : '');
// markdown-lite — main.js:2100-2141
const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const mdInline = (s) => s.replace(/(^|[\s(«"—–-])_([^_\n]+?)_(?=$|[\s.,;:!?)»"—–-])/g, '$1<em>$2</em>');
const mdText = (s) => mdInline(escHtml(s));
const MD_OL = /^(\d{1,2})[.)][ \t]+(.*)$/;
const MD_UL = /^([•·▪]|[-*+])[ \t]+(.*)$/;
function renderCmsDescription(raw) {
  return String(raw).split(/\n{2,}/).map((b) => b.trim()).filter(Boolean).map((block) => {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    const out = []; let buf = [], mode = null, start = null;
    const flush = () => {
      if (!buf.length) return;
      if (mode === 'ul') {
        out.push('<ul class="pd-block__list">' + buf.map((t) => `<li>${mdText(t)}</li>`).join('') + '</ul>');
      } else if (mode === 'ol') {
        out.push('<ol class="pd-block__list pd-block__list--num"' + (start > 1 ? ` start="${start}"` : '') + '>'
          + buf.map((t) => `<li>${mdText(t)}</li>`).join('') + '</ol>');
      } else {
        out.push('<p>' + buf.map(mdText).join('<br>') + '</p>');
      }
      buf = []; mode = null; start = null;
    };
    for (const line of lines) {
      let m, type, text;
      if ((m = line.match(MD_OL))) { type = 'ol'; text = m[2]; }
      else if ((m = line.match(MD_UL))) { type = 'ul'; text = m[2]; }
      else { type = 'p'; text = line; }
      if (type !== mode) flush();
      if (type === 'ol' && start === null) start = parseInt(m[1], 10);
      mode = type; buf.push(text);
    }
    flush();
    return out.join('');
  }).join('');
}

// CMS-переопределение лендингов — main.js:817-819, 2068-2092
const CMS_CATS = (Array.isArray(CATEGORIES) && CATEGORIES.some((c) => c && c.cardDesc))
  ? CATEGORIES.filter((c) => c && c.slug && c.name) : null;
if (CMS_CATS) {
  for (const c of CMS_CATS) {
    const fb = CATEGORY_LANDINGS[c.slug] || {};
    const hasCms = c.subtitle || c.description || (c.bullets && c.bullets.length) || (c.nomenclature && c.nomenclature.length);
    if (!hasCms && !fb.name) continue;
    CATEGORY_LANDINGS[c.slug] = {
      name: c.name || fb.name,
      eyebrowCategory: [c.slug, (c.name || fb.name || '').toLowerCase()],
      subtitle: c.subtitle || fb.subtitle || '',
      image: c.image || fb.image || '',
      bulletsTitle: c.bulletsTitle || fb.bulletsTitle,
      nomenclatureTitle: c.nomenclatureTitle || fb.nomenclatureTitle,
      description: c.description ? String(c.description) : (fb.description || []),
      bullets: (c.bullets && c.bullets.length) ? c.bullets : (fb.bullets || []),
      nomenclature: (c.nomenclature && c.nomenclature.length) ? c.nomenclature : (fb.nomenclature || [])
    };
    RELATED_CAT_INFO[c.slug] = {
      label: (c.name || fb.name || '').toLowerCase(),
      desc: c.cardDesc || (RELATED_CAT_INFO[c.slug] || {}).desc || '',
      image: c.image || (RELATED_CAT_INFO[c.slug] || {}).image || ''
    };
  }
}
// RELATED_CAT_ORDER / RELATED_CATS — main.js:2046-2051
const RELATED_CAT_ORDER = CMS_CATS
  ? CMS_CATS.map((c) => c.slug)
  : ['razemy', 'microchips', 'converters', 'capacitors', 'transistors', 'pcb', 'rantsy', 'snow'];
const RELATED_CATS = Object.fromEntries(
  RELATED_CAT_ORDER.map(cat => [cat, RELATED_CAT_ORDER.filter(c => c !== cat).slice(0, 4)])
);

// ================================================= NBSP (алгоритм js/nbsp.js)
//   задан escape-последовательностью — переживает копирование, в отличие
// от литеральных байтов (feedback-pencil-nbsp-marker).
// Список слов — ТОЧНАЯ копия js/nbsp.js:18-26 (сверено ревью 2026-07-16)
const SHORT_WORDS = [
  'а', 'в', 'и', 'к', 'о', 'с', 'у', 'я',
  'во', 'за', 'из', 'ко', 'на', 'не', 'об', 'от', 'по', 'со',
  'до', 'но', 'же', 'ни', 'то', 'бы', 'ли',
  'для', 'или', 'при', 'что', 'под', 'над', 'без', 'про',
];
const _wp = SHORT_WORDS.join('|');
const NB_MID = new RegExp('([\\s(«\\[—–-])(' + _wp + ')\\s+(?=[А-ЯЁа-яё0-9«])', 'gi');
const NB_START = new RegExp('^(' + _wp + ')\\s+(?=[А-ЯЁа-яё0-9«])', 'i');
const nbsp = (s) => String(s == null ? '' : s).replace(NB_MID, '$1$2 ').replace(NB_START, '$1 ');

// ================================================= имена файлов — через CATALOG_URLS
const fileForVariant = (catSlug, series, idx) => CATALOG_URLS.variantFile(catSlug, series, idx);
const fileForCategory = (catSlug) => CATALOG_URLS.categoryFile(catSlug);
const fileForProduct = (p) => CATALOG_URLS.productFile(p);

// Дедуп «товар = вариант»: 351 ИРТЫШ + 86 ARC70A товаров дублируют варианты серий.
// Ключ — нормализованный партномер (латиница/кириллица-гомоглифы через cyrillize).
const normPn = (s) => cyrillize(String(s || '').toUpperCase()).replace(/\s+/g, '');
const variantPnSet = new Set();
for (const arr of [CONNECTOR_SERIES, CONVERTER_SERIES, CAPACITOR_SERIES]) {
  for (const s of arr) for (const it of (s.items || [])) {
    const pn = CATALOG_URLS.variantPn(it);
    if (pn) variantPnSet.add(normPn(pn));
  }
}

// ================================================= шаблон и хирургия по нему
// CRLF→LF: рабочая копия может быть с CRLF (git autocrlf), якоря-регексы считают на \n
const TPL = fs.readFileSync(path.join(PAGES, 'product-detail.html'), 'utf8').replace(/\r\n/g, '\n');
const esc = escHtml;
const escAttr = (s) => escHtml(s).replace(/"/g, '&quot;');
function clamp(s, max) {
  s = String(s || '').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), 20)).trim() + '…';
}
/** Meta description ≤158: сперва целиком, потом без «хвоста»-бойлерплейта,
 *  потом по границе предложения; в крайнем случае — по слову, без висящей
 *  запятой перед многоточием (находка SEO-ревью: обрыв посреди предложения). */
function composeMeta(main, tail) {
  main = String(main || '').trim();
  const full = (main + (tail ? ' ' + tail : '')).trim();
  if (full.length <= 158) return full;
  if (main.length <= 158) return main;
  const cut = main.slice(0, 158);
  const dot = cut.lastIndexOf('. ');
  if (dot > 60) return cut.slice(0, dot + 1);
  return cut.slice(0, Math.max(cut.lastIndexOf(' '), 40)).replace(/[\s,;:—–-]+$/, '') + '…';
}
const jsonld = (o) => JSON.stringify(o, null, 2).replace(/</g, '\\u003c');
function replaceOnce(html, re, replacement, what) {
  if (!re.test(html)) throw new Error(`шаблон: не найден якорь для «${what}»`);
  // замена функцией: данные из Strapi могут содержать $-паттерны ($&, $`, $1…),
  // которые String.replace иначе интерпретирует — молчаливая порча страницы
  return html.replace(re, () => replacement);
}
const imgExists = (rel) => {
  if (!rel || /^https?:/.test(rel)) return true; // хотлинки — как на живом сайте
  return fs.existsSync(path.join(PAGES, rel.split('?')[0]));
};

/** Собирает страницу из шаблона. model: см. buildModel*. */
function renderPage(m) {
  let h = TPL;

  // -------- head: title / description / canonical / robots / og / twitter
  h = replaceOnce(h, /<title>[\s\S]*?<\/title>/, `<title>${esc(m.title)}</title>`, 'title');
  h = replaceOnce(h, /<meta name="description" content="[^"]*">/, `<meta name="description" content="${escAttr(m.metaDesc)}">`, 'meta description');
  h = replaceOnce(h, /<link rel="canonical" href="[^"]*">/, `<link rel="canonical" href="${SITE}/pages/${m.file}">`, 'canonical');
  h = replaceOnce(h, /<meta name="robots" content="[^"]*">/, `<meta name="robots" content="${m.noindex ? 'noindex, follow' : 'index, follow'}">`, 'robots');
  h = replaceOnce(h, /<meta property="og:type" content="[^"]*">/, `<meta property="og:type" content="${m.kind === 'landing' ? 'website' : 'product'}">`, 'og:type');
  h = replaceOnce(h, /<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${escAttr(m.title)}">`, 'og:title');
  h = replaceOnce(h, /<meta property="og:description" content="[^"]*">/, `<meta property="og:description" content="${escAttr(m.metaDesc)}">`, 'og:description');
  h = replaceOnce(h, /<meta property="og:url" content="[^"]*">/, `<meta property="og:url" content="${SITE}/pages/${m.file}">`, 'og:url');
  if (m.absImage) {
    h = replaceOnce(h, /<meta property="og:image" content="[^"]*">/, `<meta property="og:image" content="${escAttr(m.absImage)}">`, 'og:image');
    h = h.replace(/<meta name="twitter:image" content="[^"]*">/, `<meta name="twitter:image" content="${escAttr(m.absImage)}">`);
    // фото каталога — квадраты 1200×1200 (пайплайн обработки), не 1200×630 шаблона
    h = h.replace(/<meta property="og:image:width" content="[^"]*">/, '<meta property="og:image:width" content="1200">');
    h = h.replace(/<meta property="og:image:height" content="[^"]*">/, '<meta property="og:image:height" content="1200">');
  }
  h = replaceOnce(h, /<meta name="twitter:title" content="[^"]*">/, `<meta name="twitter:title" content="${escAttr(clamp(m.title, 70))}">`, 'twitter:title');
  h = replaceOnce(h, /<meta name="twitter:description" content="[^"]*">/, `<meta name="twitter:description" content="${escAttr(clamp(m.metaDesc, 200))}">`, 'twitter:description');

  // -------- noscript: без JS контент не должен остаться opacity:0 под лоадером
  // (зеркало reduced-motion блока animations.css:67-88)
  const NOSCRIPT = `<noscript><style>.page-loader{display:none!important}[data-animate],[data-animate="fade-up"],[data-animate="fade-up-stagger"]>*,[data-animate="scale-reveal"]>img,[data-animate="scale-reveal"]>video,[data-animate="scale-reveal"]>div{opacity:1!important;transform:none!important;scale:none!important}[data-animate="line-draw"]{transform:none!important}</style></noscript>`;
  // -------- JSON-LD
  const crumbs = [
    { '@type': 'ListItem', position: 1, name: 'Главная', item: `${SITE}/` },
    { '@type': 'ListItem', position: 2, name: 'Каталог', item: `${SITE}/pages/products.html` },
  ];
  if (m.kind === 'landing') {
    crumbs.push({ '@type': 'ListItem', position: 3, name: m.h1 });
  } else {
    // В JSON-LD ведём на реальную страницу категории (перелинковка); видимая
    // крошка при этом остаётся products.html#<cat> — 1:1 с живым сайтом.
    crumbs.push({ '@type': 'ListItem', position: 3, name: m.catLabel, item: `${SITE}/pages/${m.catSlug}.html` });
    crumbs.push({ '@type': 'ListItem', position: 4, name: m.h1 });
  }
  const ld = [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: crumbs }];
  if (m.kind !== 'landing') {
    // Brand намеренно НЕ указываем: у серий это имя серии, у товаров — внутренняя
    // подкатегория (утечка «ЭКБ ТЕСТ», находка SEO-ревью). Не выдумываем данные.
    const prod = {
      '@context': 'https://schema.org', '@type': 'Product',
      name: m.h1, description: m.metaDesc,
      url: `${SITE}/pages/${m.file}`
    };
    if (m.pn) { prod.sku = m.pn; prod.mpn = m.pn; }
    if (m.absImage) prod.image = m.absImage;
    ld.push(prod);
  }
  const ldTags = ld.map(o => `<script type="application/ld+json">\n${jsonld(o)}\n  </script>`).join('\n  ');
  h = replaceOnce(h, /\n<\/head>|\n +<\/head>/, `\n  ${ldTags}\n  ${NOSCRIPT}\n</head>`, '</head>');

  // -------- body: data-pd-kind (main.js:2335 ставит его JS'ом; CSS-лейаут зависит)
  h = replaceOnce(h, /<body>/, `<body data-pd-kind="${m.kind}">`, 'body');

  // -------- eyebrow breadcrumb (main.js:2299-2304)
  const trail = m.trail ? `&nbsp;/&nbsp;<span>${esc(String(m.trail).toLowerCase())}</span>` : '';
  h = replaceOnce(h,
    /<nav class="product-top__eyebrow" aria-label="breadcrumb">[\s\S]*?<\/nav>/,
    `<nav class="product-top__eyebrow" aria-label="breadcrumb">\n          <a href="products.html">каталог</a>&nbsp;/&nbsp;<a href="products.html#${m.catSlug}">${m.catLabel}</a>${trail}\n        </nav>`,
    'eyebrow');

  // -------- H1 + counter (main.js:2276-2296)
  const counterHtml = m.counter ? `<span class="product-top__counter">${m.counter}</span>` : `<span class="product-top__counter" hidden>(01)</span>`;
  h = replaceOnce(h, /<h1 class="product-top__title">[\s\S]*?<\/h1>/, `<h1 class="product-top__title">${esc(m.h1)}${counterHtml}</h1>`, 'H1');

  // -------- subtitle (main.js:2307-2317): landing = innerHTML (доверенный), иначе textContent
  h = replaceOnce(h, /<p class="product-top__subtitle">[\s\S]*?<\/p>/, `<p class="product-top__subtitle">${m.subtitleHtml}</p>`, 'subtitle');

  // -------- главное фото (main.js:2320-2330); eager вместо lazy — above the fold
  const label = esc(m.imgLabel);
  const imgInner = (m.image && imgExists(m.image))
    ? `<img src="${escAttr(encodeURI(m.image))}" alt="${escAttr(m.rawName || m.h1)}" style="width:100%;height:100%;object-fit:contain;" onerror="this.style.display='none';this.parentElement.innerHTML='<span class=&quot;pd-image__label&quot;>${escAttr(m.imgLabel)}</span>'">`
    : `<span class="pd-image__label">${label}</span>`;
  h = replaceOnce(h,
    /<div class="pd-image__placeholder"[\s\S]*?<\/div>\n/,
    `<div class="pd-image__placeholder" aria-label="Фото ${escAttr(m.h1)}">\n            ${imgInner}\n          </div>\n`,
    'pd-image');

  // -------- описание (main.js:2337-2365)
  const descCounter = m.kind === 'landing'
    ? `<sup class="pd-block__counter pd-block__counter--landing">(02)</sup>`
    : `<sup class="pd-block__counter pd-block__counter--landing" hidden>(02)</sup>`;
  h = replaceOnce(h, /<h2 class="pd-block__title">Описание<sup[\s\S]*?<\/h2>/, `<h2 class="pd-block__title">Описание${descCounter}</h2>`, 'desc title');
  h = replaceOnce(h, /<div class="pd-block__body">[\s\S]*?<\/div>\n          <\/div>/, `<div class="pd-block__body">${m.descHtml}</div>\n          </div>`, 'desc body');

  // -------- характеристики (main.js:2371-2397)
  if (m.kind === 'landing') {
    h = replaceOnce(h, /<div class="pd-block pd-block--specs">/, `<div class="pd-block pd-block--specs" hidden>`, 'specs hidden');
  } else {
    const rows = Object.entries(m.specs || {}).map(([k, v]) =>
      `              <div class="pd-specs__row">\n                <dt class="pd-specs__label">${esc(String(k).toLowerCase())}</dt>\n                <dd class="pd-specs__value">${esc(String(v))}</dd>\n              </div>`
    ).join('\n');
    if (rows) {
      h = replaceOnce(h, /<dl class="pd-specs">[\s\S]*?<\/dl>/, `<dl class="pd-specs">\n${rows}\n            </dl>`, 'specs rows');
    } else {
      // на живом сайте пустые specs «протекали» статикой ЕТ-СНЦ23 — здесь честно прячем блок
      h = replaceOnce(h, /<div class="pd-block pd-block--specs">/, `<div class="pd-block pd-block--specs" hidden>`, 'specs hidden (empty)');
    }
  }

  // -------- bullets «что мы поставляем» (main.js:2403-2424) — только landing;
  // условие как live: Array.isArray без проверки length
  if (m.kind === 'landing' && Array.isArray(m.bullets)) {
    const bRows = m.bullets.map(([l, v]) => `            <div class="pd-bullets__row"><span class="pd-bullets__label">${l}</span><span class="pd-bullets__value">${v}</span></div>`).join('\n');
    h = replaceOnce(h, /<div class="pd-block pd-block--bullets" id="pdBulletsBlock" hidden>[\s\S]*?<div class="pd-bullets__list" id="pdBulletsList"><\/div>/,
      `<div class="pd-block pd-block--bullets" id="pdBulletsBlock">\n            <h2 class="pd-block__title pd-block__title--bullets">${m.bulletsTitle}<sup class="pd-block__counter pd-block__counter--bullets">(03)</sup></h2>\n            <div class="pd-bullets__list" id="pdBulletsList">\n${bRows}\n            </div>`,
      'bullets');
  }

  // -------- номенклатура (main.js:2427-2447) — только landing (условие как live)
  if (m.kind === 'landing' && Array.isArray(m.nomenclature)) {
    const nRows = m.nomenclature.map(([l, v]) => `          <div class="pd-nomenclature__row"><span class="pd-nomenclature__label">${l}</span><span class="pd-nomenclature__value">${v}</span></div>`).join('\n');
    h = replaceOnce(h, /<section class="section section--pd-nomenclature" id="pdNomenclatureSection" hidden>/, `<section class="section section--pd-nomenclature" id="pdNomenclatureSection">`, 'nomenclature unhide');
    h = replaceOnce(h, /<h2 class="pd-nomenclature__title">[\s\S]*?<\/h2>/, `<h2 class="pd-nomenclature__title">${esc(m.nomenclatureTitle)}</h2>`, 'nomenclature title');
    h = replaceOnce(h, /<div class="pd-nomenclature__table" id="pdNomenclatureTable"><\/div>/, `<div class="pd-nomenclature__table" id="pdNomenclatureTable">\n${nRows}\n        </div>`, 'nomenclature rows');
  }

  // -------- CTA: data-kp-* (main.js:2453-2457)
  h = replaceOnce(h, /<a href="#" class="pd-actions__primary" data-action="open-kp-drawer">/,
    `<a href="#" class="pd-actions__primary" data-action="open-kp-drawer" data-kp-product="${escAttr(m.kpProduct)}" data-kp-category="${escAttr(m.catLabel)}">`,
    'kp cta');

  // -------- related (main.js:2461-2523)
  if (m.related && m.related.length) {
    const cards = m.related.map(it => {
      const cyrName = m.kind === 'landing' ? it.name : cyrillize(it.name);
      const img = (it.image && imgExists(it.image))
        ? `<img src="${escAttr(encodeURI(it.image))}" alt="${escAttr(it.name)}" loading="lazy" style="width:100%;height:100%;object-fit:contain;" onerror="this.style.display='none';this.parentElement.insertAdjacentHTML('beforeend','<span class=\\'pd-card__image-label\\'>${escAttr(cyrName)}</span>')">`
        : `<span class="pd-card__image-label">${esc(cyrName)}</span>`;
      return `          <a href="${escAttr(it.href)}" class="pd-card">\n            <div class="pd-card__image" aria-label="${escAttr(it.name)}">\n              ${img}\n            </div>\n            <div class="pd-card__info">\n              <span class="pd-card__name">${esc(cyrName)}</span>\n              ${it.desc ? `<span class="pd-card__desc">${it.desc}</span>` : ''}\n            </div>\n          </a>`;
    }).join('\n');
    const relTitle = m.kind === 'landing' ? 'другие категории' : 'Другие исполнения';
    const relCounter = m.kind === 'landing' ? '(05)' : '(03)';
    h = replaceOnce(h, /<h2 class="pd-related__title" data-animate="fade-up">[\s\S]*?<\/h2>/, `<h2 class="pd-related__title" data-animate="fade-up">${relTitle}<sup class="pd-related__counter">${relCounter}</sup></h2>`, 'related title');
    h = replaceOnce(h, /<div class="pd-related__grid" id="pdRelatedGrid">[\s\S]*?\n        <\/div>\n      <\/div>\n    <\/section>/, `<div class="pd-related__grid" id="pdRelatedGrid">\n${cards}\n        </div>\n      </div>\n    </section>`, 'related grid');
  } else {
    h = replaceOnce(h, /<section class="section section--pd-related">/, `<section class="section section--pd-related" hidden>`, 'related hidden');
  }

  return h;
}

// ================================================= модели страниц
function buildLandingModel(catSlug) {
  const landing = CATEGORY_LANDINGS[catSlug];
  if (!landing) return null;
  const name = landing.name;
  const file = fileForCategory(catSlug);
  // subtitle: цепочка как live (main.js:2307-2316): subtitle(innerHTML) →
  // 1-е предложение description(textContent) → tu; у лендингов tu нет.
  const firstDesc = Array.isArray(landing.description) ? landing.description[0] : landing.description;
  const subtitleHtml = landing.subtitle
    || (firstDesc ? esc(String(firstDesc).replace(/<[^>]*>/g, '').split('.')[0] + '.') : '');
  // описание: массив → доверенный HTML; строка → markdown-lite (main.js:2357-2361)
  const descHtml = Array.isArray(landing.description)
    ? landing.description.map(s => `<p>${String(s).trim()}</p>`).join('')
    : renderCmsDescription(landing.description);
  const related = (RELATED_CATS[catSlug] || []).map(key => {
    const info = RELATED_CAT_INFO[key];
    return info ? { name: info.label, desc: info.desc, image: info.image, href: fileForCategory(key) } : null;
  }).filter(Boolean);
  const plainSubtitle = String(subtitleHtml).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
  const img = landing.image || '';
  return {
    kind: 'landing', file,
    catSlug: landing.eyebrowCategory[0], catLabel: landing.eyebrowCategory[1],
    h1: name, rawName: name, counter: null, trail: '',
    title: `${name.charAt(0).toUpperCase() + name.slice(1)} — каталог | IC Фарватер`,
    metaDesc: composeMeta(plainSubtitle, 'Поставка со склада в Санкт-Петербурге, документация и КП по запросу.'),
    subtitleHtml, descHtml,
    image: img, imgLabel: name,
    absImage: /^https?:/.test(img) ? img : (img && imgExists(img) ? `${SITE}/` + encodeURI(img.replace(/^\.\.\//, '')) : ''),
    bullets: landing.bullets, bulletsTitle: esc(landing.bulletsTitle || 'Что мы поставляем'),
    nomenclature: landing.nomenclature, nomenclatureTitle: landing.nomenclatureTitle || 'Номенклатура',
    kpProduct: cyrillize(name.toUpperCase()),
    related, noindex: false, pn: ''
  };
}

function buildVariantModel(catSlug, catLabel, vKind, series, item, idx) {
  const [vName, vSub] = splitVariantName(item);
  const specs = variantSpecs(vKind, series, item);
  const pn = specs['партномер'] || '';
  const file = fileForVariant(catSlug, series, idx);
  const image = resolveSeriesItemImage(series, item);
  const descSrc = series.description || '';
  const descHtml = String(descSrc).split(/(?<=[.])\s+/).filter(Boolean).map(s => `<p>${esc(nbsp(String(s).trim()))}</p>`).join('');
  const subtitle = descSrc ? String(descSrc).split('.')[0] + '.' : (item.tu || series.tu || '').toLowerCase();
  // related: первые 4 серии категории → вид каталога (main.js:2478-2492).
  // ВАЖНО: на живой variant-странице фильтр `s.slug !== data.slug` не срабатывает
  // (у variant-data поле seriesSlug, data.slug === undefined) → текущая серия НЕ
  // исключается. Подтверждено Валентиной 2026-07-13 («это как на сайте») — 1:1.
  const arr = vKind === 'connector' ? CONNECTOR_SERIES : vKind === 'converter' ? CONVERTER_SERIES : CAPACITOR_SERIES;
  const related = arr.slice(0, 4).map(s => ({
    name: s.name, desc: shortDesc(s.slug, s.description), image: s.image,
    href: `products.html#${catSlug}/${s.slug}`
  }));
  const dev = series.group === 'dev';
  const facts = Object.entries(specs).filter(([k]) => !['партномер', 'ту', 'тип', 'статус'].includes(k)).slice(0, 2)
    .map(([k, v]) => `${k} ${v}`).join(', ');
  return {
    kind: 'variant', file, catSlug, catLabel,
    h1: cyrillize(vName), rawName: vName, counter: `(${String(idx + 1).padStart(2, '0')})`,
    trail: item.type ? String(item.type).toLowerCase() : '',
    // (тип) в title различает вилку/розетку с одним партномером — иначе 25 пар
    // дублей title на индексируемых страницах (находка батч-валидации)
    title: clamp(`${cyrillize(pn || vName)}${item.type ? ' (' + String(item.type).toLowerCase() + ')' : ''} — ${catLabel} ${series.name}`, 60 - ' | IC Фарватер'.length) + ' | IC Фарватер',
    metaDesc: composeMeta(`${cyrillize(pn || vName)}${item.type ? ' (' + String(item.type).toLowerCase() + ')' : ''} — серия ${series.name}${facts ? ': ' + facts : ''}.`, 'Поставка со склада в Санкт-Петербурге, документация и КП по запросу.'),
    subtitleHtml: esc(nbsp(subtitle)), descHtml,
    image, imgLabel: cyrillize(vName),
    absImage: image && !/^https?:/.test(image) && imgExists(image) ? `${SITE}/` + encodeURI(image.replace(/^\.\.\//, '')) : (/^https?:/.test(image) ? image : ''),
    // приоритет как live (main.js:2194, 2455): displaySub → item.partnumber → имя
    specs, kpProduct: cyrillize(((vSub || item.partnumber || vName)).toUpperCase()),
    related, noindex: dev, pn: cyrillize(pn)
  };
}

function buildProductModel(p) {
  const map = {
    'Микросхемы': ['microchips', 'микросхемы'],
    'СВЧ-транзисторы': ['transistors', 'свч-транзисторы'],
    'СВЧ-конденсаторы': ['capacitors', 'свч-конденсаторы'],
    'Преобразователи напряжения': ['converters', 'преобразователи'],
    'Разъёмы': ['razemy', 'разъёмы']
  };
  const [catSlug, catLabel] = map[p.category] || ['', (p.category || '').toLowerCase()];
  const file = fileForProduct(p);
  const descHtml = p.description
    ? String(p.description).split(/(?<=[.])\s+/).filter(Boolean).map(s => `<p>${esc(nbsp(String(s).trim()))}</p>`).join('')
    : '';
  const subtitle = p.description ? String(p.description).split('.')[0] + '.' : '';
  const catName = p.category;
  // related — ровно как live (main.js:2461-2500): ветвление по catSlug, НЕ по kind.
  // Товар категории разъёмы/преобразователи/конденсаторы получает карточки СЕРИЙ
  // (у товара data.slug undefined → первая серия не исключается — live-поведение);
  // микросхемы/транзисторы — 4 соседних товара (они никогда не дедуп-скипаются).
  const SER = { razemy: CONNECTOR_SERIES, converters: CONVERTER_SERIES, capacitors: CAPACITOR_SERIES };
  const related = SER[catSlug]
    ? SER[catSlug].slice(0, 4).map(s => ({
        name: s.name, desc: shortDesc(s.slug, s.description), image: s.image,
        href: `products.html#${catSlug}/${s.slug}`
      }))
    : PRODUCTS.filter(q => q.category === catName && q.id !== p.id).slice(0, 4).map(q => ({
        name: q.name, desc: (q.subcategory || '').toLowerCase(), image: q.image,
        href: fileForProduct(q)
      }));
  return {
    kind: 'product', file, catSlug, catLabel,
    h1: cyrillize(p.name), rawName: p.name, counter: '(01)',
    trail: p.subcategory || '',
    // в title/meta — метка КАТЕГОРИИ, не subcategory: внутренние подкатегории
    // («Микросхемы ЭКБ ТЕСТ» — имя партнёра) не выносим в заголовки (SEO-ревью)
    title: clamp(`${cyrillize(p.name)} — ${catLabel}`, 60 - ' | IC Фарватер'.length) + ' | IC Фарватер',
    metaDesc: composeMeta(`${cyrillize(p.name)} — ${catLabel}. ${subtitle}`, 'Поставка со склада в Санкт-Петербурге, КП по запросу.'),
    subtitleHtml: esc(nbsp(subtitle)), descHtml,
    image: p.image, imgLabel: cyrillize(p.name),
    absImage: p.image && !/^https?:/.test(p.image) && imgExists(p.image) ? `${SITE}/` + encodeURI(p.image.replace(/^\.\.\//, '')) : (/^https?:/.test(p.image) ? p.image : ''),
    specs: p.specs || {}, kpProduct: cyrillize(p.name.toUpperCase()),
    related, noindex: false, pn: cyrillize(p.name)
  };
}

// товары-дубли вариантов (пропускаем: вариантная страница богаче)
const dedupSkip = new Set(PRODUCTS.filter(p => variantPnSet.has(normPn(p.name))).map(p => p.id));

// ================================================= сборка списка страниц
const models = [];
const SERIES_CATS = [
  ['razemy', 'разъёмы', 'connector', CONNECTOR_SERIES],
  ['converters', 'преобразователи', 'converter', CONVERTER_SERIES],
  ['capacitors', 'свч-конденсаторы', 'capacitor', CAPACITOR_SERIES],
];

if (PILOT) {
  models.push(buildLandingModel('razemy'));
  const s = CONNECTOR_SERIES.find(x => x.slug === 'et-2rmg');
  if (s && s.items && s.items[0]) models.push(buildVariantModel('razemy', 'разъёмы', 'connector', s, s.items[0], 0));
  const chip = PRODUCTS.find(p => p.category === 'Микросхемы' && !dedupSkip.has(p.id));
  if (chip) models.push(buildProductModel(chip));
} else {
  for (const slug of Object.keys(CATEGORY_LANDINGS)) models.push(buildLandingModel(slug));
  for (const [catSlug, catLabel, vKind, arr] of SERIES_CATS) {
    for (const s of arr) (s.items || []).forEach((it, idx) => models.push(buildVariantModel(catSlug, catLabel, vKind, s, it, idx)));
  }
  for (const p of PRODUCTS) if (!dedupSkip.has(p.id)) models.push(buildProductModel(p));
}

// ================================================= запись (только при диффе)
let written = 0, unchanged = 0;
const files = [];
for (const m of models.filter(Boolean)) {
  const html = renderPage(m);
  const dest = path.join(PAGES, m.file);
  files.push(m.file);
  const old = fs.existsSync(dest) ? fs.readFileSync(dest, 'utf8').replace(/\r\n/g, '\n') : null;
  m.changed = old !== html;
  if (!m.changed) { unchanged++; continue; }
  if (!CHECK) fs.writeFileSync(dest, html, 'utf8');
  written++;
}
console.log(`[catalog-pages] ${PILOT ? 'ПИЛОТ' : 'полная генерация'}: ${files.length} страниц (записано ${written}, без изменений ${unchanged}${CHECK ? ', check-режим — запись пропущена' : ''})`);

// ============================== манифест + удаление осиротевших страниц
// Запись пропала из Strapi → её страница НЕ должна остаться висеть (главный
// грех отклонённого подхода — оторванные страницы). Манифест в git; в PILOT
// не трогаем (там генерятся только 3 страницы).
if (!PILOT) {
  const manifestPath = path.join(ROOT, 'scripts', 'catalog-pages.manifest.json');
  const current = [...files].sort();
  const currentSet = new Set(current);
  let removed = 0;
  if (fs.existsSync(manifestPath)) {
    let prev = [];
    try { prev = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); } catch { /* битый манифест → только перезапишем */ }
    for (const f of prev) {
      if (!currentSet.has(f) && /^[a-z0-9-]+\.html$/.test(f)) {
        const p = path.join(PAGES, f);
        if (fs.existsSync(p)) { if (!CHECK) fs.unlinkSync(p); removed++; }
      }
    }
  }
  if (!CHECK) fs.writeFileSync(manifestPath, JSON.stringify(current, null, 1) + '\n', 'utf8');
  if (removed) console.log(`[catalog-pages] удалено осиротевших страниц: ${removed}`);
}

// ================================================= sitemap (только полный режим)
if (!PILOT && !CHECK) {
  const smPath = path.join(ROOT, 'sitemap.xml');
  // CRLF→LF обязательно: на CRLF-файле \n-регексы молча не матчатся →
  // очистка не срабатывает и url дублируются при каждом запуске (находка ревью)
  let sm = fs.readFileSync(smPath, 'utf8').replace(/\r\n/g, '\n');
  // прежние lastmod — сохраняем для страниц, чьи байты не изменились (иначе
  // ежедневный churn всех ~2700 записей и бот коммитит без причины)
  const oldDates = {};
  for (const mm of sm.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)) oldDates[mm[1]] = mm[2];
  // вычищаем прежние каталожные url (идемпотентно); 5 статических страниц выживают
  sm = sm.replace(/  <url>\s*<loc>[^<]*\/pages\/(?!products\.html|about\.html|contacts\.html|privacy-policy\.html)[^<]*<\/loc>[\s\S]*?<\/url>\n/g, '');
  const today = new Date().toISOString().slice(0, 10);
  const indexable = models.filter(Boolean).filter(m => !m.noindex);
  const urls = indexable.map(m => {
    const loc = `${SITE}/pages/${m.file}`;
    const lastmod = m.changed ? today : (oldDates[loc] || today);
    return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>\n`;
  }).join('');
  sm = sm.replace('</urlset>', urls + '</urlset>');
  fs.writeFileSync(smPath, sm, 'utf8');
  console.log(`[catalog-pages] sitemap.xml: +${indexable.length} url (noindex исключены: ${models.filter(Boolean).length - indexable.length})`);
}
