/**
 * render-home-blocks.js — конструктор главной (Фаза D4, «Тильда» в фирменном стиле).
 *
 * Dynamic zone homepage.blocks (Strapi) → готовые секции index.html между
 * маркерами <!-- HOME:BLOCKS:START/END -->. Типы блоков — точные копии
 * существующих секций сайта (дизайн зашит, заказчик меняет контент/порядок):
 *   blocks.text-photo      → секция uy-grid («О компании» / «Кабельные сборки»)
 *   blocks.promo-cards     → секция promise-grid («Специальные предложения»)
 *   blocks.category-slider → секция product-carousel («Разъёмы» / «СВЧ-компоненты»)
 *
 * Активируется ТОЛЬКО когда в админке есть хотя бы один блок; до этого
 * статические секции index.html не трогаются (фолбэк, сайт не зависит от CMS).
 * Вызывается из inject-html.js (CI: generate-data → inject-html → build).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = process.env.FRONTEND_DIR || path.resolve(__dirname, '..');
const JS_DIR = path.join(ROOT, 'js');

function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
// Тексты из старых маркеров содержат entities (&nbsp;) и <br> — декодируем ДО esc,
// иначе на странице видно литеральное «&nbsp;».
function deEnt(s) {
  return String(s == null ? '' : s)
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/<br[^>]*>/g, '\n').replace(/&shy;/g, '');
}
// Минимальный markdown richtext-полей: абзацы по пустой строке + **bold** / *em*.
function mdParas(text) {
  return deEnt(text).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    .map((p) => '<p>' + esc(p).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/\n/g, '<br>') + '</p>');
}
function loadVar(file, varName) {
  try {
    const code = fs.readFileSync(path.join(JS_DIR, file), 'utf8');
    const ctx = {};
    vm.createContext(ctx);
    vm.runInContext(code + `\n;globalThis.__OUT=(typeof ${varName}!=='undefined')?${varName}:null;`, ctx);
    return ctx.__OUT;
  } catch { return null; }
}
// Пути в data-файлах относительные от pages/ ('../assets/...') → для index.html без '../'.
function rootPath(p) { return String(p || '').replace(/^\.\.\//, ''); }

// Медиа блока (photo из админки) → assets/images/cms/home/<hash><ext>.
async function downloadBlockPhoto(strapiUrl, token, photo) {
  if (!photo || !photo.url) return '';
  const url = photo.url.startsWith('http') ? photo.url : strapiUrl + photo.url;
  const fname = ((photo.hash || 'img') + (photo.ext || '')).replace(/^_+/, '');
  const dir = path.join(ROOT, 'assets', 'images', 'cms', 'home');
  const dest = path.join(dir, fname);
  const rel = `assets/images/cms/home/${fname}`;
  if (fs.existsSync(dest)) return rel;
  const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) { console.warn(`  ! block photo ${fname} → ${res.status}`); return ''; }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  console.log(`  ↓ block photo → ${rel}`);
  return rel;
}

// ---------- Рендеры секций (копии существующей вёрстки, счётчик подставляется) ----------
function renderTextPhoto(b, counter, photoPath) {
  const side = b.photoSide === 'right' ? ' uy-grid--image-right' : '';
  const eyebrow = b.eyebrow ? `${esc(deEnt(b.eyebrow))} · (${counter})` : `(${counter})`;
  const cta = (b.ctaText && b.ctaUrl)
    ? `\n            <a href="${esc(b.ctaUrl)}" class="btn-pill btn-pill--solid uy-grid__btn">${esc(b.ctaText)} →</a>` : '';
  return `    <section class="section section--about">
      <div class="container">
        <div class="uy-grid${side}">
          <picture class="uy-grid__image" data-animate="scale-reveal">
            ${photoPath ? `<img width="1152" height="928" src="${esc(photoPath)}" alt="${esc(b.title)}" loading="lazy">` : ''}
          </picture>
          <div class="uy-grid__text" data-animate="fade-up-stagger">
            <div class="uy-grid__head">
              <p class="section-eyebrow">${eyebrow}</p>
              <h2 class="uy-grid__title">${esc(deEnt(b.title)).replace(/\n/g, '<br class="is-desktop-only">')}</h2>
            </div>
            <div class="uy-grid__body">
              ${mdParas(b.body).join('\n              ')}
            </div>${cta}
          </div>
        </div>
      </div>
    </section>`;
}
function renderPromoCards(b, counter, photoPaths) {
  const cards = (b.cards || []).map((c, i) => `          <article class="promise-card">
            <div class="promise-card__img">
              ${photoPaths[i] ? `<img width="1200" height="800" src="${esc(photoPaths[i])}" alt="${esc(c.name)}" loading="lazy">` : ''}
            </div>
            <div class="promise-card__info">
              <h3 class="promise-card__name">${esc(deEnt(c.name))}</h3>
              <p class="promise-card__desc">${esc(deEnt(c.text))}</p>${(c.ctaText && c.ctaUrl) ? `\n              <a class="promise-card__cta" href="${esc(c.ctaUrl)}">${esc(c.ctaText)} →</a>` : ''}
            </div>
          </article>`).join('\n');
  return `    <section class="section section--promise">
      <div class="container">
        <header class="section-head" data-animate="fade-up">
          <h2 class="section-head__title">${esc(deEnt(b.title))}<span class="section-head__counter">(${counter})</span></h2>
        </header>
        <div class="promise-grid" data-animate="fade-up-stagger">
${cards}
        </div>
      </div>
    </section>`;
}
function renderCategorySlider(b, counter, catalog) {
  const cat = b.category && catalog.categories
    ? catalog.categories.find((c) => c.slug === b.category.slug) : null;
  if (!cat) return '';
  const n = b.count || 8;
  let items = [];
  const src = { connectors: catalog.connectors, converters: catalog.converters, capacitors: catalog.capacitors }[cat.source];
  if (src) items = src.slice(0, n).map((s) => ({ name: s.name, desc: '', image: s.image }));
  else if (cat.source === 'products' && catalog.products) {
    items = catalog.products.filter((p) => p.category === cat.name).slice(0, n)
      .map((p) => ({ name: p.name, desc: p.subcategory || '', image: p.image }));
  }
  if (!items.length) return '';
  const href = `pages/products.html#${esc(cat.slug)}`;
  const cards = items.map((it) => `              <a href="${href}" class="card">
                <div class="card__img">
                  ${it.image ? `<img width="1200" height="1200" src="${esc(rootPath(it.image))}" alt="${esc(it.name)}" loading="lazy">` : ''}
                </div>
                <div class="card__info">
                  <h3 class="card__name">${esc(it.name)}</h3>
                  ${it.desc ? `<p class="card__desc">${esc(it.desc)}</p>` : ''}
                </div>
              </a>`).join('\n');
  const arrow = (dir, label, d) => `          <button class="product-carousel__btn product-carousel__btn--${dir}" type="button" aria-label="${label}">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="${d}" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>`;
  return `    <section class="section section--products">
      <div class="container">
        <header class="section-head" data-animate="fade-up">
          <h2 class="section-head__title">${esc(deEnt(b.title || cat.name))}<span class="section-head__counter">(${counter})</span></h2>
        </header>
        <div class="product-carousel">
${arrow('prev', 'Предыдущие карточки', 'M19 12H5M12 5L5 12L12 19')}
          <div class="product-carousel__track">
            <div class="card-grid product-cards-grid" data-animate="fade-up-stagger">
${cards}
            </div>
          </div>
${arrow('next', 'Следующие карточки', 'M5 12H19M12 5L19 12L12 19')}
        </div>
      </div>
    </section>`;
}

// ---------- Главная точка входа ----------
async function renderHomeBlocks({ strapiUrl, token, write }) {
  // Deep populate dynamic zone (v5 'on'-синтаксис по типам блоков).
  const q = 'populate[blocks][on][blocks.text-photo][populate]=*'
    + '&populate[blocks][on][blocks.promo-cards][populate][cards][populate]=*'
    + '&populate[blocks][on][blocks.category-slider][populate]=*';
  let blocks = [];
  try {
    const res = await fetch(`${strapiUrl}/api/homepage?${q}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (res.ok) blocks = ((await res.json()).data || {}).blocks || [];
  } catch (e) { console.warn('  ! homepage blocks: ' + e.message); }
  if (!blocks.length) { console.log('· конструктор главной пуст (homepage.blocks) — статические секции не трогаю'); return; }

  const catalog = {
    categories: loadVar('categories-data.js', 'CATEGORIES') || [],
    connectors: loadVar('connectors-data.js', 'CONNECTOR_SERIES') || [],
    converters: loadVar('converters-data.js', 'CONVERTER_SERIES') || [],
    capacitors: loadVar('capacitors-data.js', 'CAPACITOR_SERIES') || [],
    products: loadVar('products.js', 'PRODUCTS') || [],
  };

  const sections = [];
  let counter = 1;
  for (const b of blocks) {
    const num = String(counter).padStart(2, '0');
    if (b.__component === 'blocks.text-photo') {
      sections.push(renderTextPhoto(b, num, await downloadBlockPhoto(strapiUrl, token, b.photo)));
    } else if (b.__component === 'blocks.promo-cards') {
      const pp = [];
      for (const c of (b.cards || [])) pp.push(await downloadBlockPhoto(strapiUrl, token, c.photo));
      sections.push(renderPromoCards(b, num, pp));
    } else if (b.__component === 'blocks.category-slider') {
      const html = renderCategorySlider(b, num, catalog);
      if (!html) { console.warn('  ! слайдер: категория не найдена/пуста — блок пропущен'); continue; }
      sections.push(html);
    } else continue;
    counter++;
  }

  const fp = path.join(ROOT, 'index.html');
  const orig = fs.readFileSync(fp, 'utf8');
  const S = '<!-- HOME:BLOCKS:START -->', E = '<!-- HOME:BLOCKS:END -->';
  const si = orig.indexOf(S), ei = orig.indexOf(E);
  if (si === -1 || ei === -1) { console.warn('  ! маркеры HOME:BLOCKS не найдены в index.html'); return; }
  let next = orig.slice(0, si + S.length) + '\n' + sections.join('\n\n') + '\n    ' + orig.slice(ei);
  // Счётчик секции «Услуги» после зоны — следующий номер за блоками.
  next = next.replace(/(id="uslugi"[\s\S]{0,600}?section-head__counter">)\((\d+)\)/, `$1(${String(counter).padStart(2, '0')})`);
  if (next !== orig) {
    if (write) fs.writeFileSync(fp, next, 'utf8');
    console.log(`  → index.html: конструктор главной, ${sections.length} блок(ов) ${write ? 'записано' : 'изменилось бы (CHECK)'}`);
  } else {
    console.log('  index.html: конструктор без изменений');
  }
}

module.exports = { renderHomeBlocks };
