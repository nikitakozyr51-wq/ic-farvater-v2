/**
 * generate-catalog-pages.mjs — генератор статических индексируемых страниц СЕРИЙ каталога.
 *
 * Формат страницы = как на живом сайте (страница варианта/детали): H1 (название серии),
 * описание, «Характеристики» (из SERIES_SPECS — авторитетные данные сайта), «Другие серии».
 * НИКАКИХ таблиц со списком партномеров (на сайте такого нет).
 *
 * Зачем: серии (ЕТ-2РМГ, ИРТЫШ) — самый ценный SEO-уровень (люди ищут именно серию), а на
 * сайте отдельных страниц серий нет → каталог невидим. Генератор печатает их как СТАТИКУ.
 *
 * Архитектура (после аудита + правки формата 2026-07-13):
 *  - Плоско в pages/ (глубина ../) → mobile-menu/поиск main.js (root='../') работают без правок.
 *  - Секция контента = класс `cat-content` (НЕ `section--pd-content`) → main.js initProductDetail
 *    бейлится (строка 2030) при любом хэше → статика неуязвима. main.js НЕ меняется, rebuild НЕ нужен.
 *  - Подключается только main.min.js (бургер/KP-drawer/cookie/Метрика) как progressive enhancement.
 *  - Контент виден без JS (нет data-animate); NBSP запечён на генерации (алгоритм nbsp.js).
 *
 * Данные: series-описание/название/ТУ/фото — из js/*-data.js (vm, билд-тайм); характеристики серии
 * — из SERIES_SPECS (извлекается из js/main.js). Strapi/админку не трогает.
 *
 * Запуск: node scripts/generate-catalog-pages.mjs (из корня d:\site-v2). НЕ пушить до одобрения.
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS = path.join(ROOT, 'js');
const OUT = path.join(ROOT, 'pages');
const SITE = 'https://ic-farvater.ru';

// ---- load series data (browser globals via vm) ----
const ctx = {}; ctx.window = ctx; vm.createContext(ctx);
for (const f of ['connectors-data.js', 'converters-data.js', 'capacitors-data.js']) {
  const p = path.join(JS, f);
  if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), ctx);
}
const CONNECTORS = ctx.CONNECTOR_SERIES || [];
const CONVERTERS = ctx.CONVERTER_SERIES || [];
const CAPACITORS = ctx.CAPACITOR_SERIES || [];
const findBy = (arr, slug) => (arr || []).find(s => s && s.slug === slug);

// ---- extract SERIES_SPECS (pure-data object literal) from main.js ----
function extractObjectLiteral(src, name) {
  const at = src.indexOf('const ' + name + ' = {');
  if (at < 0) return null;
  let i = src.indexOf('{', at), depth = 0, inStr = false, strCh = '';
  const start = i;
  for (; i < src.length; i++) {
    const c = src[i], prev = src[i - 1];
    if (inStr) { if (c === strCh && prev !== '\\') inStr = false; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = true; strCh = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
  }
  return null;
}
const mainSrc = fs.readFileSync(path.join(JS, 'main.js'), 'utf8');
const SERIES_SPECS = new Function('return (' + extractObjectLiteral(mainSrc, 'SERIES_SPECS') + ')')();

// ---- NBSP (алгоритм js/nbsp.js — печём на генерации, чтобы висящих предлогов не было и без JS) ----
const SHORT_WORDS = ['а','в','и','к','о','с','у','я','во','за','из','ко','на','не','об','от','по','со','до','но','же','ни','то','бы','ли','для','или','при','что','под','над','без','про'];
const _wp = SHORT_WORDS.join('|');
const NB_MID = new RegExp('([\\s(«\\[—–-])(' + _wp + ')\\s+(?=[А-ЯЁа-яё0-9«])', 'gi');
const NB_START = new RegExp('^(' + _wp + ')\\s+(?=[А-ЯЁа-яё0-9«])', 'i');
const nbsp = s => String(s == null ? '' : s).replace(NB_MID, '$1$2 ').replace(NB_START, '$1 ');

// ---- helpers ----
const esc = s => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const txt = s => esc(nbsp(s));                       // текст с NBSP + экранированием
const jsonld = obj => JSON.stringify(obj, null, 2).replace(/</g, '\\u003c');
const clamp = (s, n) => (s.length <= n ? s : s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…');
const imgExists = rel => rel && fs.existsSync(path.join(OUT, rel));
const sentences = s => String(s).split(/(?<=[.;])\s+(?=[А-ЯЁA-Z])/).map(x => x.trim()).filter(Boolean);

const CRITICAL_CSS = fs.readFileSync(path.join(OUT, 'product-detail.html'), 'utf8')
  .match(/<style id="critical-css">[\s\S]*?<\/style>/)[0];

// ---- shared chrome (1:1 product-detail.html, пути ../) ----
const header = () => `  <header class="header">
    <div class="container header__inner">
      <a href="../index.html" class="header__logo">ic farvater</a>
      <nav class="header__nav" aria-label="Главная навигация">
        <a href="products.html" class="header__nav-link" aria-current="page">каталог</a>
        <a href="../index.html#uslugi" class="header__nav-link">услуги</a>
        <a href="about.html" class="header__nav-link">о&nbsp;компании</a>
        <a href="contacts.html" class="header__nav-link">контакты</a>
      </nav>
      <div class="header__right">
        <button class="header__search" type="button" aria-label="Поиск по каталогу">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
            <circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.5"/>
            <path d="M12.5 12.5L16.5 16.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
        <a href="mailto:sale@ic-farvater.ru" class="header__cta" data-action="open-kp-drawer">запросить КП</a>
      </div>
      <button class="header__burger" type="button" aria-label="Меню" aria-expanded="false">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <path d="M3 6H19M3 11H19M3 16H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    </div>
  </header>`;

const footer = () => `  <footer class="footer">
    <div class="container">
      <div class="footer__top">
        <div class="footer__logo-block">
          <span class="footer__logo">ic farvater</span>
          <p class="footer__tagline">Поставки ЭКБ от&nbsp;склада в&nbsp;Санкт-Петербурге. Подберём компоненты из&nbsp;каталога и&nbsp;пришлём прайс со&nbsp;сроками поставки.</p>
        </div>
        <div class="footer__newsletter">
          <h3 class="footer__newsletter-title">Хотите запросить расчёт?</h3>
          <p class="footer__newsletter-desc">Подберём компоненты из&nbsp;каталога и&nbsp;пришлём прайс со&nbsp;сроками поставки.</p>
          <form class="footer__email-form" action="#">
            <input type="email" placeholder="email@example.com" aria-label="Email для расчёта" required>
            <button type="submit" aria-label="Отправить">→</button>
          </form>
          <p class="footer__disclaimer">Отправляя форму, вы&nbsp;соглашаетесь с&nbsp;политикой конфиденциальности и&nbsp;обработкой персональных данных.</p>
        </div>
        <div class="footer__navs">
          <div class="footer__nav-col footer__nav-col--products">
            <p class="footer__nav-label">Каталог</p>
            <ul class="footer__nav footer__nav--products">
              <!-- CATS:FOOTERNAV:START -->
              <li><a href="products.html#microchips">микросхемы</a></li>
              <li><a href="products.html#razemy">разъёмы</a></li>
              <li><a href="products.html#converters">преобразователи напряжения</a></li>
              <li><a href="products.html#capacitors">СВЧ-конденсаторы</a></li>
              <li><a href="products.html#transistors">СВЧ-транзисторы</a></li>
              <li><a href="products.html#pcb">печатные платы</a></li>
              <li><a href="products.html#rantsy">реактивные ранцы</a></li>
              <li><a href="products.html#snow">снегоуборочная техника</a></li>
<!-- CATS:FOOTERNAV:END -->
            </ul>
          </div>
          <div class="footer__nav-col footer__nav-col--site">
            <p class="footer__nav-label">Компания</p>
            <ul class="footer__nav footer__nav--site">
              <li><a href="../index.html">главная</a></li>
              <li><a href="about.html">о&nbsp;компании</a></li>
              <li><a href="../index.html#uslugi">услуги</a></li>
              <li><a href="contacts.html">контакты</a></li>
              <li><a href="about.html#faq">вопросы-ответы</a></li>
            </ul>
          </div>
        </div>
        <div class="footer__contact">
          <p class="footer__label">Контакты</p>
          <address class="footer__address">ул. Беринга, д. 1-А, оф. 46-Н<br>г. Санкт-Петербург, 199406</address>
          <div class="footer__phones">
            <a href="tel:+78122093465" class="footer__phone">+7 (812) 209-34-65</a>
            <a href="tel:+79967788842" class="footer__phone">+7 (996) 778-88-42</a>
          </div>
          <a href="mailto:info@ic-farvater.ru" class="footer__email">info@ic-farvater.ru</a>
        </div>
      </div>
      <div class="footer__bottom">
        <div class="footer__copyright-group">
          <p class="footer__copyright">© 2026 ООО «АЙСИ ФАРВАТЕР»</p>
          <p class="footer__copyright footer__copyright--tertiary">ИНН 7801709112 · ОГРН 1227800016993</p>
        </div>
        <div class="footer__legal">
          <a href="privacy-policy.html">политика конфиденциальности</a>
          <a href="consent.html">согласие на&nbsp;обработку персональных данных</a>
        </div>
      </div>
    </div>
  </footer>`;

const cookieBanner = () => `  <div id="cookieBanner" class="cookie-banner cookie-banner--hidden" role="dialog" aria-label="Использование cookie">
    <div class="container cookie-banner__inner">
      <div class="cookie-banner__text">
        <p class="cookie-banner__title">Мы&nbsp;используем cookie для&nbsp;корректной работы сайта и&nbsp;анализа посещаемости.</p>
        <a href="privacy-policy.html" class="cookie-banner__link">подробнее в&nbsp;политике конфиденциальности →</a>
      </div>
      <div class="cookie-banner__actions">
        <button class="cookie-banner__btn cookie-banner__btn--reject" type="button" data-cookie-action="reject">отклонить</button>
        <button class="cookie-banner__btn cookie-banner__btn--accept" type="button" data-cookie-action="accept">принять</button>
      </div>
    </div>
  </div>`;

// ---- page template ----
function renderPage(m) {
  const specsRows = m.specs.map(s =>
    `              <div class="pd-specs__row"><dt class="pd-specs__label">${txt(s[0])}</dt><dd class="pd-specs__value">${txt(s[1])}</dd></div>`
  ).join('\n');

  // Карточки «Другие серии» — точная разметка сайта (main.js): фото object-fit:contain, иначе label
  const relatedCards = m.related.map(r => {
    const inner = imgExists(r.image)
      ? `<img src="${encodeURI(r.image)}" alt="${esc(r.name)}" loading="lazy" style="width:100%;height:100%;object-fit:contain;">`
      : `<span class="pd-card__image-label">${esc(r.name)}</span>`;
    return `          <a href="${esc(r.href)}" class="pd-card">
            <div class="pd-card__image" aria-label="${esc(r.name)}">${inner}</div>
            <div class="pd-card__info"><span class="pd-card__name">${esc(r.name)}</span>${r.desc ? `<span class="pd-card__desc">${txt(r.desc)}</span>` : ''}</div>
          </a>`;
  }).join('\n');

  // Главное фото — как на сайте: img внутри .pd-image__placeholder, object-fit:contain (каталожное правило)
  const hasImg = imgExists(m.image);
  const imageBlock = `        <div class="pd-image">
          <div class="pd-image__placeholder"${hasImg ? '' : ` aria-label="Фото ${esc(m.name)}"`}>${hasImg
    ? `<img src="${encodeURI(m.image)}" alt="${esc(m.name)}" style="width:100%;height:100%;object-fit:contain;" decoding="async">`
    : `<span class="pd-image__label">${esc(m.name)}</span>`}</div>
        </div>`;

  const ld = [
    { '@context': 'https://schema.org', '@type': 'Product', name: m.name, category: m.category, description: m.metaDescription, ...(hasImg ? { image: `${SITE}/${encodeURI(m.image.replace(/^\.\.\//, ''))}` } : {}) },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Главная', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Каталог', item: `${SITE}/pages/products.html` },
      { '@type': 'ListItem', position: 3, name: m.category, item: `${SITE}/pages/products.html#${m.categoryAnchor}` },
      { '@type': 'ListItem', position: 4, name: m.name },
    ] },
  ];

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(m.title)}</title>
  <meta name="description" content="${esc(m.metaDescription)}">
  <meta name="theme-color" content="#F5F3EF">
  <meta name="yandex-counter" content="109423767">
  <link rel="canonical" href="${SITE}/pages/${m.file}">
  <meta name="robots" content="${m.noindex ? 'noindex, follow' : 'index, follow'}">
  <meta name="format-detection" content="telephone=no">
  <meta property="og:type" content="product">
  <meta property="og:site_name" content="IC Фарватер">
  <meta property="og:locale" content="ru_RU">
  <meta property="og:title" content="${esc(m.name)} — IC Фарватер">
  <meta property="og:description" content="${esc(m.metaDescription)}">
  <meta property="og:url" content="${SITE}/pages/${m.file}">
  <meta property="og:image" content="${SITE}/assets/images/og-image.jpg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(m.name)} — IC Фарватер">
  <meta name="twitter:description" content="${esc(clamp(m.metaDescription, 200))}">
  <meta name="twitter:image" content="${SITE}/assets/images/og-image.jpg">
  <link rel="icon" type="image/svg+xml" href="../assets/favicon/favicon.svg">
  <link rel="icon" type="image/png" sizes="32x32" href="../assets/favicon/favicon-32x32.png">
  <link rel="icon" type="image/png" sizes="16x16" href="../assets/favicon/favicon-16x16.png">
  <link rel="apple-touch-icon" sizes="180x180" href="../assets/favicon/apple-touch-icon.png">
  <link rel="manifest" href="../assets/favicon/site.webmanifest">
  <link rel="preload" href="../assets/fonts/InterVariable.woff2" as="font" type="font/woff2" crossorigin>
  ${CRITICAL_CSS}
  <link rel="stylesheet" href="../css/components.min.css?v=4d31d081">
  <link rel="stylesheet" href="../css/inner-page.min.css?v=818419a6">
  <style>
    /* Реплика паддингов .section--pd-content (класс НЕ используем, чтобы main.js не трогал статику) */
    .cat-content{padding-block:0}
    /* Контент виден без JS: снимаем reveal-анимацию, которая держит карточки в opacity:0 до скрипта */
    .pd-related__grid>.pd-card{opacity:1;transform:none;animation:none}
    @media(min-width:1024px){.cat-content{padding-block:60px}.pd-related__title{width:100%;padding-bottom:24px;border-bottom:1px solid var(--c-border)}}
  </style>
${ld.map(o => `  <script type="application/ld+json">${jsonld(o)}</script>`).join('\n')}
</head>
<body data-pd-static>
${header()}

  <main>
    <section class="section section--no-border page-top product-top">
      <div class="container product-top__inner product-top__inner--entry">
        <nav class="product-top__eyebrow" aria-label="breadcrumb">
          <a href="products.html">каталог</a>&nbsp;/&nbsp;<a href="products.html#${m.categoryAnchor}">${txt(m.category)}</a>&nbsp;/&nbsp;<span>${esc(m.name)}</span>
        </nav>
        <h1 class="product-top__title">${esc(m.h1)}<span class="product-top__counter">(01)</span></h1>
        <p class="product-top__subtitle">${txt(m.subtitle)}</p>
      </div>
    </section>

    <section class="section section--no-border cat-content">
      <div class="container pd-content">
${imageBlock}
        <div class="pd-info">
          <div class="pd-block pd-block--description">
            <h2 class="pd-block__title">Описание</h2>
            <div class="pd-block__body">
${m.descriptionParas.map(p => `              <p>${txt(p)}</p>`).join('\n')}
            </div>
          </div>
          <div class="pd-block pd-block--specs">
            <h2 class="pd-block__title">Характеристики</h2>
            <dl class="pd-specs">
${specsRows}
            </dl>
          </div>
          <div class="pd-actions">
            <a href="mailto:sale@ic-farvater.ru?subject=${encodeURIComponent('Запрос расчёта: ' + m.name)}" class="pd-actions__primary" data-action="open-kp-drawer" data-kp-product="${esc(m.name)}" data-kp-category="${esc(m.category)}">
              <span>запросить расчёт</span><span class="pd-actions__arrow" aria-hidden="true">→</span>
            </a>
            <a href="products.html" class="pd-actions__secondary">
              <span class="pd-actions__arrow pd-actions__arrow--left" aria-hidden="true">←</span><span>вернуться в&nbsp;каталог</span>
            </a>
          </div>
        </div>
      </div>
    </section>

    <section class="section section--pd-related">
      <div class="container pd-related">
        <h2 class="pd-related__title">Другие исполнения<sup class="pd-related__counter">(${String(m.related.length).padStart(2, '0')})</sup></h2>
        <div class="pd-related__grid">
${relatedCards}
        </div>
      </div>
    </section>
  </main>

${footer()}
${cookieBanner()}

  <script src="../js/main.min.js?v=a161aa98" defer></script>
</body>
</html>`;
}

// ---- build a series model from real data ----
const CAT = {
  connector: { label: 'разъёмы', anchor: 'razemy', arr: CONNECTORS },
  converter: { label: 'преобразователи напряжения', anchor: 'converters', arr: CONVERTERS },
  capacitor: { label: 'СВЧ-конденсаторы', anchor: 'capacitors', arr: CAPACITORS },
};

// SEO title/description по типу (данные — из series; без битых «: .» и без хардкода типа/аналога)
function specVal(specs, key) {
  const m = Object.fromEntries((specs || []).map(([k, v]) => [k, v]));
  return Array.isArray(key) ? key.map(k => m[k]).find(Boolean) : m[key];
}
// Факты для description: предпочтительные ключи, иначе первые 2 факта (кроме служебных) — чтобы
// у серий без «напряжение/температура» не было пустого «: .» и сниппеты не были near-duplicate.
function midFacts(specs, preferred) {
  const pref = preferred.map(k => specVal(specs, k)).filter(Boolean);
  if (pref.length) return pref.join(', ');
  return (specs || []).filter(([k]) => !['ту', 'партномер', 'тип', 'статус'].includes(k))
    .slice(0, 2).map(([, v]) => v).join(', ');
}
const BRAND = ' | IC Фарватер';
const titleC = (namePart) => clamp(namePart, 60 - BRAND.length) + BRAND;  // бренд не режем

function seoMeta(kind, s, specsObj) {
  if (kind === 'connector') {
    const mid = midFacts(specsObj, ['напряжение', 'температура', 'контакты']);
    return {
      title: titleC(`Разъём ${s.name} — купить, аналоги`),
      desc: clamp(`Соединители ${s.name}${mid ? ': ' + mid : ''}. Поставка со склада в СПб, подбор аналога, документы. Запросить КП.`, 158),
    };
  }
  if (kind === 'converter') {
    const vin = specVal(specsObj, 'вход') || '';
    const t = /сет|фаз|230\s*В|115\s*\//i.test(vin) ? 'AC/DC' : 'DC/DC';   // тип из данных
    const compat = specVal(specsObj, 'совместимость') || '';               // «аналог» только если реально есть
    const mid = midFacts(specsObj, ['вход', ['выход', 'выходы'], 'мощность']);
    return {
      title: titleC(`Преобразователь ${s.name} ${t}`),
      desc: clamp(`Преобразователи ${s.name} — ${t}${compat ? ', ' + compat : ''}.${mid ? ' ' + mid + '.' : ''} Поставка со склада в СПб, импортозамещение. Запросить КП.`, 158),
    };
  }
  const mid = midFacts(specsObj, ['ёмкость', 'температура', 'аналог']);
  return {
    title: titleC(`${s.name} — СВЧ-конденсаторы`),
    desc: clamp(`СВЧ-конденсаторы ${s.name}${mid ? ': ' + mid : ''}. Поставка со склада в СПб, импортозамещение. Запросить КП.`, 158),
  };
}

// Характеристики — точная копия main.js variantSpecs: партномер + тип + вариант-специфика
// (converter: выходное/мощность; capacitor: ёмкость/корпус/…) + факты серии SERIES_SPECS + ту.
function variantSpecs(kind, series, item) {
  const out = [];
  const pn = item.partnumber || String(item.name || '').split(/\s+/)[0];
  if (pn && /\d/.test(pn) && pn.length >= 5) out.push(['партномер', pn]);
  if (item.type) out.push(['тип', String(item.type).toLowerCase()]);
  if (kind === 'converter') {
    if (item.vout) out.push(['выходное напряжение', item.vout + ' В']);
    if (item.power) out.push(['мощность', item.power + ' Вт']);
  } else if (kind === 'capacitor') {
    if (item.capacitance) out.push(['ёмкость', item.capacitance + ' пФ']);
    if (item.case) out.push(['корпус', item.case]);
    if (item.voltage) out.push(['напряжение', String(item.voltage).replace(/\s+Код\s+(\d+)/g, ' (код $1)')]);
    // нормализация формата (как в описании/SERIES_SPECS): типографский минус, «+» перед верхом, запятая-десятичная, без пробелов вокруг …
    const fmt = v => String(v).replace(/(^|[\s(±])-(\d)/g, '$1−$2').replace(/\s*…\s*/g, '…').replace(/…(\+?)(\d)/g, '…+$2').replace(/(\d)\.(\d)/g, '$1,$2');
    if (item.tolerance) out.push(['допуск', fmt(item.tolerance)]);
    if (item.temp) out.push(['температура', fmt(item.temp)]);
  }
  const have = new Set(out.map(([k]) => k));
  (SERIES_SPECS[series.slug] || []).forEach(([k, v]) => { if (!have.has(k)) { out.push([k, v]); have.add(k); } });
  const tu = item.tu || series.tu;
  if (tu && !have.has('ту')) out.push(['ту', tu]);
  return out;
}

function buildModel(kind, slug, fileName) {
  const c = CAT[kind];
  const s = findBy(c.arr, slug);
  if (!s || !s.description) return null;
  const seriesSpecs = SERIES_SPECS[slug] || [];
  const item = (s.items && s.items[0]) || {};
  const specsArr = variantSpecs(kind, s, item);   // с партномером и полные — как на сайте
  const meta = seoMeta(kind, s, seriesSpecs);
  // «Другие исполнения» — как main.js:2348 на странице варианта: первые до 4 серий категории.
  // href: если сестринская серия тоже генерится статикой — ссылка на её страницу (внутренний
  // SEO-линк), иначе фолбэк на каталог. Живой каталог/main.js не трогаем.
  const related = (c.arr || [])
    .slice(0, 4)
    .map(x => ({
      name: x.name, image: x.image || null,
      href: willGenerate.has(kind + ':' + x.slug) ? fileFor(kind, x.slug) : `products.html#${c.anchor}/${x.slug}`,
      desc: x.cardCaption || '',
    }));
  return {
    file: fileName, name: s.name, h1: s.name, category: c.label, categoryAnchor: c.anchor,
    title: meta.title, metaDescription: meta.desc,
    // thin-content: серии «в разработке» (есть ключ «статус» в SERIES_SPECS) → noindex + вне sitemap.
    noindex: seriesSpecs.some(([k]) => k === 'статус'),
    // Подзаголовок: cardCaption, иначе короткая подпись из 1-2 фактов серии (НЕ первая фраза описания).
    subtitle: s.cardCaption || seriesSpecs.slice(0, 2).map(([, v]) => v).join(' · '),
    image: s.image || null,
    descriptionParas: sentences(s.description),
    specs: specsArr,
    related,
  };
}

// ---- имена файлов + какие серии генерим (для внутренних ссылок) ----
const PREFIX = { connector: 'razem', converter: 'preobrazovatel', capacitor: 'kondensator' };
const fileFor = (kind, slug) => `${PREFIX[kind]}-${slug}.html`;

// Генерим серию, только если у неё есть описание (защита от thin-content: серии «в разработке»
// без описания пропускаем). willGenerate нужен ДО buildModel (используется в related).
const willGenerate = new Set();
for (const [kind, c] of Object.entries(CAT))
  for (const s of (c.arr || []))
    if (s && s.slug && s.description) willGenerate.add(kind + ':' + s.slug);

// ---- МАСШТАБ: все серии всех категорий ----
const models = [];
const skipped = [];
for (const [kind, c] of Object.entries(CAT))
  for (const s of (c.arr || [])) {
    if (!s || !s.slug) continue;
    const m = buildModel(kind, s.slug, fileFor(kind, s.slug));
    if (m) models.push(m);
    else skipped.push(kind + ':' + s.slug + ' (нет описания)');
  }
if (skipped.length) console.log('⚠ пропущено (thin-content):', skipped.length, '—', skipped.join(', '));

// ---- write ----
fs.mkdirSync(OUT, { recursive: true });
const written = [];
for (const m of models) {
  fs.writeFileSync(path.join(OUT, m.file), renderPage(m), 'utf8');
  written.push(m);
  console.log('✓ pages/' + m.file, '(' + m.specs.length + ' характеристик, img:' + (imgExists(m.image) ? 'да' : 'нет') + ', related:' + m.related.length + ')');
}

// ---- sitemap.xml: идемпотентно (вычищаем старые URL страниц каталога, добавляем только индексируемые) ----
const smPath = path.join(ROOT, 'sitemap.xml');
if (fs.existsSync(smPath)) {
  let sm = fs.readFileSync(smPath, 'utf8');
  // 1) убрать все прежние <url> страниц серий (razem-/preobrazovatel-/kondensator-), чтобы не осталось noindex/устаревших
  sm = sm.replace(/[ \t]*<url>\s*<loc>[^<]*\/pages\/(?:razem|preobrazovatel|kondensator)-[^<]*<\/loc>[\s\S]*?<\/url>\s*/g, '');
  // 2) добавить актуальные индексируемые
  let added = 0;
  for (const m of written) {
    if (m.noindex) continue;   // «в разработке» — не в sitemap
    const loc = `${SITE}/pages/${m.file}`;
    if (sm.includes(`<loc>${loc}</loc>`)) continue;
    sm = sm.replace('</urlset>', `  <url>\n    <loc>${loc}</loc>\n    <lastmod>2026-07-13</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.7</priority>\n  </url>\n</urlset>`);
    added++;
  }
  fs.writeFileSync(smPath, sm, 'utf8');
  console.log('✓ sitemap.xml: индексируемых страниц серий', added);
}
console.log('\nГотово:', written.length, 'страниц серий в pages/');
