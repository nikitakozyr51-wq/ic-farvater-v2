/**
 * Main JS — shared logic across all pages
 * Mobile menu, smooth scroll, common interactions
 */

document.addEventListener('DOMContentLoaded', () => {
  initPageLoader();
  initMobileMenu();
  initHeaderSearch();
  initActiveNavLink();
  initCertAccordion();
  initServiceAccordion();
  initContactForm();
  initCookieBanner();
  initProductCarousels();
  initKpDrawer();
  initCatalog();
  initProductDetail();
});

/** Page loader — hide overlay once window finishes loading */
function initPageLoader() {
  const loader = document.getElementById('pageLoader');
  if (!loader) return;

  const hide = () => {
    loader.classList.add('page-loader--hidden');
    setTimeout(() => loader.remove(), 600);
  };

  if (document.readyState === 'complete') {
    setTimeout(hide, 300);
  } else {
    window.addEventListener('load', () => setTimeout(hide, 300), { once: true });
    setTimeout(hide, 4000);
  }
}

/** Header search — icon click navigates to catalog (with input focused there).
 *  Works on desktop (.header__search button in header__right) and mobile burger menu. */
function initHeaderSearch() {
  const searchBtns = document.querySelectorAll('.header__search, .header__search-mobile');
  if (!searchBtns.length) return;

  searchBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const base = window.location.pathname.includes('/pages/')
        ? 'products.html'
        : 'pages/products.html';
      window.location.href = `${base}#search`;
    });
  });

  // If we landed on products.html with #search hash → focus catalog search input
  if (window.location.hash === '#search') {
    const focusTarget = document.querySelector('.catalog__search input, .catalog__search-input, input[type="search"]');
    if (focusTarget) requestAnimationFrame(() => focusTarget.focus());
  }
}

/** Mobile burger menu toggle */
function initMobileMenu() {
  const burger = document.querySelector('.header__burger');
  const nav = document.querySelector('.header__nav');
  if (!burger || !nav) return;

  function setOpen(open) {
    nav.classList.toggle('header__nav--open', open);
    burger.classList.toggle('header__burger--open', open);
    burger.setAttribute('aria-expanded', open);
    document.body.classList.toggle('menu-open', open);
  }

  burger.addEventListener('click', () => {
    setOpen(!nav.classList.contains('header__nav--open'));
  });

  // Close menu on nav link click (v2 uses .header__nav-link)
  nav.querySelectorAll('.header__nav-link, .header__link').forEach(link => {
    link.addEventListener('click', () => setOpen(false));
  });
}

/** Highlight nav link matching current page or hash (v2 .header__nav-link + v1 .header__link) */
function initActiveNavLink() {
  const links = document.querySelectorAll('.header__nav-link, .header__link');
  if (!links.length) return;

  function syncHash() {
    const hash = window.location.hash;
    if (!hash) return;
    links.forEach(link => {
      const href = link.getAttribute('href');
      link.classList.toggle('header__nav-link--active', href === hash || href.endsWith(hash));
    });
  }

  syncHash();
  window.addEventListener('hashchange', syncHash);
}

/** Contact form → /scripts/send.php */
const CONTACT_FILE_MAX_COUNT = 5;
const CONTACT_FILE_MAX_TOTAL = 10 * 1024 * 1024;
const CONTACT_FILE_ALLOWED = ['pdf','doc','docx','xls','xlsx','csv','txt','png','jpg','jpeg','zip','rar','7z'];

/** Contact form — finds form by id="contactForm" OR by class .contact-form (fallback).
 *  Placeholder: no backend on localhost/gh-pages — shows success after 600ms simulated send.
 *  Replace setTimeout block with real fetch('/scripts/send.php') when backend is live. */
function initContactForm() {
  const form = document.getElementById('contactForm') || document.querySelector('.contact-form');
  if (!form) return;

  const btn = form.querySelector('.contact-form__submit');
  const fileState = initContactFiles(form);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    removeFormMessage(form);

    const originalLabel = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.textContent = 'отправка...'; }

    // TODO: replace with real backend
    setTimeout(() => {
      showFormMessage(form, 'спасибо! мы свяжемся с вами в течение рабочего дня.', true);
      form.reset();
      if (fileState) fileState.clear();
      if (btn) { btn.disabled = false; btn.innerHTML = originalLabel; }
    }, 600);
  });
}

function initContactFiles(form) {
  const input = form.querySelector('#contactFiles');
  const list = form.querySelector('#contactFilesList');
  if (!input || !list) return null;

  const selected = [];

  const sync = () => {
    const dt = new DataTransfer();
    selected.forEach(f => dt.items.add(f));
    input.files = dt.files;
    render();
  };

  const render = () => {
    list.innerHTML = '';
    selected.forEach((file, idx) => {
      const li = document.createElement('li');
      li.className = 'contact-form__file-item';

      const name = document.createElement('span');
      name.className = 'contact-form__file-name';
      name.textContent = file.name;

      const size = document.createElement('span');
      size.className = 'contact-form__file-size';
      size.textContent = formatFileSize(file.size);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'contact-form__file-remove';
      remove.setAttribute('aria-label', 'Удалить файл');
      remove.textContent = '✕';
      remove.addEventListener('click', () => {
        selected.splice(idx, 1);
        sync();
      });

      li.appendChild(name);
      li.appendChild(size);
      li.appendChild(remove);
      list.appendChild(li);
    });
  };

  input.addEventListener('change', (e) => {
    removeFormMessage(form);
    const incoming = Array.from(e.target.files || []);
    const errors = [];

    for (const file of incoming) {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      if (!CONTACT_FILE_ALLOWED.includes(ext)) {
        errors.push(`Тип «.${ext}» не поддерживается: ${file.name}`);
        continue;
      }
      if (selected.length + 1 > CONTACT_FILE_MAX_COUNT) {
        errors.push(`Максимум ${CONTACT_FILE_MAX_COUNT} файлов`);
        break;
      }
      const total = selected.reduce((s, f) => s + f.size, 0) + file.size;
      if (total > CONTACT_FILE_MAX_TOTAL) {
        errors.push('Превышен общий размер 10 MB');
        break;
      }
      selected.push(file);
    }

    if (errors.length) showFormMessage(form, errors[0], false);
    sync();
    e.target.value = '';
  });

  return {
    clear: () => {
      selected.length = 0;
      sync();
    }
  };
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function showFormMessage(form, text, success) {
  const el = document.createElement('p');
  el.className = 'contact-form__msg contact-form__msg--' + (success ? 'ok' : 'err');
  el.textContent = text;
  form.appendChild(el);
}

function removeFormMessage(form) {
  form.querySelectorAll('.contact-form__msg').forEach(el => el.remove());
}

/** Accordion items — used in About (cert + faq). Pattern:
 *    <ul class="accordion-list" data-accordion-group="faq">
 *      <li class="accordion-item">
 *        <button class="accordion-item__head" aria-expanded="false">title + icon</button>
 *        <div class="accordion-item__body">answer content</div>
 *      </li>...
 *    </ul>
 *  Behavior: click head → toggle open. Within same group only ONE open at a time
 *  (others close automatically). Height animated via inline maxHeight (set to
 *  scrollHeight when opening, 0 when closing). */
function initCertAccordion() {
  document.querySelectorAll('.accordion-item').forEach(item => {
    const head = item.querySelector('.accordion-item__head');
    const body = item.querySelector('.accordion-item__body');
    if (!head || !body) return;

    head.addEventListener('click', () => {
      const isOpen = item.classList.contains('accordion-item--open');
      const group = item.closest('[data-accordion-group]') || item.parentElement;

      // Close all siblings in the same group
      if (group) {
        group.querySelectorAll(':scope > .accordion-item--open').forEach(sib => {
          if (sib !== item) {
            sib.classList.remove('accordion-item--open');
            const sibBody = sib.querySelector('.accordion-item__body');
            const sibHead = sib.querySelector('.accordion-item__head');
            if (sibBody) sibBody.style.maxHeight = '0px';
            if (sibHead) sibHead.setAttribute('aria-expanded', 'false');
          }
        });
      }

      // Toggle clicked item
      if (isOpen) {
        item.classList.remove('accordion-item--open');
        body.style.maxHeight = '0px';
        head.setAttribute('aria-expanded', 'false');
      } else {
        item.classList.add('accordion-item--open');
        body.style.maxHeight = body.scrollHeight + 'px';
        head.setAttribute('aria-expanded', 'true');
      }
    });
  });

  // Recompute open accordion heights on resize (text wrap may change)
  window.addEventListener('resize', () => {
    document.querySelectorAll('.accordion-item--open .accordion-item__body').forEach(body => {
      body.style.maxHeight = body.scrollHeight + 'px';
    });
  });

  // v1 fallback (just in case some legacy markup exists)
  document.querySelectorAll('.cert-row__header').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.cert-row');
      if (!row) return;
      const isOpen = row.classList.toggle('cert-row--open');
      btn.setAttribute('aria-expanded', isOpen);
    });
  });
}

/** Service accordion — one open at a time, scoped per group */
function initServiceAccordion() {
  const items = document.querySelectorAll('.service-item');
  if (!items.length) return;

  items.forEach(item => {
    const btn = item.querySelector('.service-item__header');
    if (!btn) return;

    btn.addEventListener('click', () => {
      const group = item.parentElement;
      const isOpen = item.classList.contains('service-item--open');

      // Close siblings within the same group
      group.querySelectorAll(':scope > .service-item').forEach(i => {
        i.classList.remove('service-item--open');
        const b = i.querySelector('.service-item__header');
        if (b) b.setAttribute('aria-expanded', 'false');
      });

      // Open clicked (unless it was already open)
      if (!isOpen) {
        item.classList.add('service-item--open');
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });
}

/** Cookie consent banner */
function initCookieBanner() {
  const banner = document.getElementById('cookieBanner');
  if (!banner) return;
  const choice = localStorage.getItem('cookieConsent');
  if (choice === 'accepted' || choice === 'rejected' || localStorage.getItem('cookieAccepted') === 'true') {
    banner.classList.add('cookie-banner--hidden');
    return;
  }
  banner.classList.remove('cookie-banner--hidden');
  banner.querySelectorAll('[data-cookie-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-cookie-action');
      localStorage.setItem('cookieConsent', action === 'accept' ? 'accepted' : 'rejected');
      banner.classList.add('cookie-banner--hidden');
    });
  });
}

/** Product carousel — bounded scroll, desktop only */
function initProductCarousels() {
  if (window.matchMedia('(max-width: 768px)').matches) return;

  document.querySelectorAll('.product-carousel').forEach(carousel => {
    const track = carousel.querySelector('.product-carousel__track');
    const grid = track && track.querySelector('.product-cards-grid');
    const btnPrev = carousel.querySelector('.product-carousel__btn--prev');
    const btnNext = carousel.querySelector('.product-carousel__btn--next');

    if (!track || !grid || !btnPrev || !btnNext) return;

    const cards = Array.from(grid.querySelectorAll('.product-card-v2'));
    const N = cards.length;
    if (N < 2) return;

    let index = 0;

    function getStep() {
      return cards.length > 1 ? cards[1].offsetLeft - cards[0].offsetLeft : cards[0].offsetWidth;
    }

    function visibleCount() {
      const step = getStep();
      return step > 0 ? Math.round(track.offsetWidth / step) : 4;
    }

    function maxIndex() {
      return Math.max(0, N - visibleCount());
    }

    function go(i, animate) {
      index = Math.max(0, Math.min(i, maxIndex()));
      if (!animate) {
        grid.style.transition = 'none';
        grid.style.transform = `translateX(-${index * getStep()}px)`;
        grid.getBoundingClientRect();
        requestAnimationFrame(() => { grid.style.transition = ''; });
      } else {
        grid.style.transform = `translateX(-${index * getStep()}px)`;
      }
      btnPrev.style.opacity = index <= 0 ? '0.25' : '';
      btnPrev.disabled = index <= 0;
      btnNext.style.opacity = index >= maxIndex() ? '0.25' : '';
      btnNext.disabled = index >= maxIndex();
    }

    btnPrev.addEventListener('click', () => go(index - 1, true));
    btnNext.addEventListener('click', () => go(index + 1, true));
    go(0, false);

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => go(index, false), 150);
    });
  });
}


/** Catalog — search + category filter + hash routing + product list rendering.
 *  Only activates on products.html (#catalogGrid).
 *  Search: debounce 250ms, homoglyph-normalized (Latin↔Cyrillic).
 *  Hash routing: #microchips, #razemy, #converters, #capacitors, #transistors, #pcb, #all.
 *  Category filter: hides cat-cards, renders product/series list from PRODUCTS / *_SERIES data. */
function initCatalog() {
  const grid = document.getElementById('catalogGrid');
  if (!grid) return;

  const cards = Array.from(grid.querySelectorAll('.cat-card'));
  const emptyMsg = document.getElementById('catalogEmpty');
  const listWrap = document.getElementById('catalogList');
  const listHeader = document.getElementById('catalogListHeader');
  const listGrid = document.getElementById('catalogListGrid');
  const listMore = document.getElementById('catalogListMore');
  const searchInputs = document.querySelectorAll('.catalog__search input[type="search"]');
  const sidebarBtns = document.querySelectorAll('.catalog__sidebar .filter-item[data-cat]');
  const pillBtns = document.querySelectorAll('.catalog__pill[data-cat]');
  const clearBtn = document.querySelector('.filter-clear__btn');
  const clearBadge = document.querySelector('.filter-clear__badge');

  const HOMOGLYPH = {
    'a':'а','c':'с','e':'е','o':'о','p':'р','x':'х','y':'у','b':'в','h':'н','k':'к','m':'м','t':'т'
  };
  function normalize(s) {
    return s.toLowerCase().split('').map(ch => HOMOGLYPH[ch] || ch).join('');
  }
  function pluralize(n, one, two, many) {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return two;
    return many;
  }

  const CAT_NAMES = {
    microchips: 'микросхемы',
    razemy: 'разъёмы',
    converters: 'преобразователи',
    capacitors: 'свч-конденсаторы',
    transistors: 'свч-транзисторы',
    pcb: 'печатные платы'
  };
  const PAGE_SIZE = 12;

  // Get items for a category from globals (defined in products.js / *-data.js)
  function getItems(cat) {
    const out = [];
    if (cat === 'razemy' && typeof CONNECTOR_SERIES !== 'undefined') {
      CONNECTOR_SERIES.forEach(s => out.push({
        type: 'series', kind: 'connector', id: s.slug, name: s.name,
        desc: s.description ? s.description.split('.')[0] + '.' : '',
        image: s.image, href: `product-detail.html#s-c-${s.slug}`
      }));
    } else if (cat === 'converters' && typeof CONVERTER_SERIES !== 'undefined') {
      CONVERTER_SERIES.forEach(s => out.push({
        type: 'series', kind: 'converter', id: s.slug, name: s.name,
        desc: s.description ? s.description.split('.')[0] + '.' : '',
        image: s.image, href: `product-detail.html#s-v-${s.slug}`
      }));
    } else if (cat === 'capacitors' && typeof CAPACITOR_SERIES !== 'undefined') {
      CAPACITOR_SERIES.forEach(s => out.push({
        type: 'series', kind: 'capacitor', id: s.slug, name: s.name,
        desc: s.description ? s.description.split('.')[0] + '.' : '',
        image: s.image, href: `product-detail.html#s-k-${s.slug}`
      }));
    } else if (cat === 'microchips' && typeof PRODUCTS !== 'undefined') {
      PRODUCTS.filter(p => p.category === 'Микросхемы').forEach(p => out.push({
        type: 'product', kind: 'microchip', id: p.id, name: p.name,
        desc: (p.subcategory || p.description || '').toLowerCase(),
        image: p.image, href: `product-detail.html#p-${p.id}`
      }));
    } else if (cat === 'transistors' && typeof PRODUCTS !== 'undefined') {
      PRODUCTS.filter(p => p.category === 'СВЧ-транзисторы').forEach(p => out.push({
        type: 'product', kind: 'transistor', id: p.id, name: p.name,
        desc: (p.subcategory || p.description || '').toLowerCase(),
        image: p.image, href: `product-detail.html#p-${p.id}`
      }));
    }
    return out;
  }

  function renderList(cat, search) {
    if (!listWrap || !listGrid) return 0;
    let items = getItems(cat);
    if (search) {
      const q = normalize(search.trim());
      items = items.filter(it => normalize(it.name + ' ' + (it.desc || '')).includes(q));
    }
    const count = items.length;
    const catLabel = CAT_NAMES[cat] || cat;
    const itemWord = items.length && items[0].type === 'series'
      ? pluralize(count, 'серия', 'серии', 'серий')
      : pluralize(count, 'товар', 'товара', 'товаров');
    const hasLanding = !!(typeof CATEGORY_LANDINGS !== 'undefined' && CATEGORY_LANDINGS[cat]);
    listHeader.innerHTML = `
      <span class="catalog__list-cat">${catLabel}</span>
      <span class="catalog__list-count">${count} ${itemWord}</span>
    `;
    // Banner block above grid (Variant B) — for all categories with landings
    const existingBanner = listGrid.parentElement.querySelector('.catalog__list-banner');
    if (existingBanner) existingBanner.remove();
    if (hasLanding) {
      const banner = document.createElement('a');
      banner.className = 'catalog__list-banner';
      banner.href = `product-detail.html#cat-${cat}`;
      banner.innerHTML = `
        <div class="catalog__list-banner__text">
          <span class="catalog__list-banner__title">обзор категории</span>
          <span class="catalog__list-banner__desc">описание, ключевые параметры и&nbsp;полная номенклатура</span>
        </div>
        <span class="catalog__list-banner__arrow" aria-hidden="true">→</span>
      `;
      listGrid.parentElement.insertBefore(banner, listGrid);
    }
    listGrid.innerHTML = '';
    const shown = items.slice(0, PAGE_SIZE);
    shown.forEach(it => {
      const a = document.createElement('a');
      a.className = 'cat-card cat-card--small';
      a.href = it.href;
      a.innerHTML = `
        <div class="cat-card__img">
          ${it.image ? `<img src="${it.image}" alt="${it.name}" loading="lazy" onerror="this.style.opacity='0'">` : ''}
        </div>
        <div class="cat-card__info">
          <h3 class="cat-card__name">${it.name.toLowerCase()}</h3>
          ${it.desc ? `<p class="cat-card__desc">${it.desc}</p>` : ''}
        </div>
      `;
      listGrid.appendChild(a);
    });
    // Load more
    if (items.length > PAGE_SIZE) {
      listMore.hidden = false;
      let page = 1;
      listMore.onclick = () => {
        page++;
        const next = items.slice(page * PAGE_SIZE - PAGE_SIZE, page * PAGE_SIZE);
        next.forEach(it => {
          const a = document.createElement('a');
          a.className = 'cat-card cat-card--small';
          a.href = it.href;
          a.innerHTML = `
            <div class="cat-card__img">
              ${it.image ? `<img src="${it.image}" alt="${it.name}" loading="lazy" onerror="this.style.opacity='0'">` : ''}
            </div>
            <div class="cat-card__info">
              <h3 class="cat-card__name">${it.name.toLowerCase()}</h3>
              ${it.desc ? `<p class="cat-card__desc">${it.desc}</p>` : ''}
            </div>
          `;
          listGrid.appendChild(a);
        });
        if (page * PAGE_SIZE >= items.length) listMore.hidden = true;
      };
    } else {
      listMore.hidden = true;
    }
    return count;
  }

  const state = { search: '', cat: 'all' };
  let searchTimer = null;

  function apply() {
    const q = normalize(state.search.trim());
    const inListMode = state.cat !== 'all';

    if (inListMode) {
      // List view: hide cat-cards, render category items
      grid.hidden = true;
      listWrap.hidden = false;
      const count = renderList(state.cat, state.search);
      // Empty-state for categories without data (e.g. pcb)
      if (count === 0) {
        const empty = document.createElement('div');
        empty.className = 'catalog__list-empty';
        empty.innerHTML = state.cat === 'pcb'
          ? 'категория «печатные платы»&nbsp;— в&nbsp;разработке. напишите нам, чтобы&nbsp;получить актуальный прайс.'
          : 'ничего не&nbsp;найдено';
        listGrid.innerHTML = '';
        listGrid.appendChild(empty);
        if (listMore) listMore.hidden = true;
      }
      if (emptyMsg) emptyMsg.hidden = true;
    } else {
      // Default view: 6 cat-cards visible, filtered by search only
      grid.hidden = false;
      listWrap.hidden = true;
      let visibleCount = 0;
      cards.forEach(card => {
        const cardName = normalize(card.dataset.name || card.textContent || '');
        const show = !q || cardName.includes(q);
        card.hidden = !show;
        if (show) visibleCount++;
      });
      if (emptyMsg) emptyMsg.hidden = visibleCount > 0;
    }

    // Update active state on sidebar + pills
    sidebarBtns.forEach(b => {
      const isActive = b.dataset.cat === state.cat;
      b.classList.toggle('filter-item--active', isActive);
      // Re-render label with (•) or ( )
      const labelText = b.textContent.replace(/^[(•)\s]+/u, '');
      b.textContent = (isActive ? '(•) ' : '( ) ') + labelText;
    });
    pillBtns.forEach(b => b.classList.toggle('catalog__pill--active', b.dataset.cat === state.cat));

    const activeCount = (state.search ? 1 : 0) + (state.cat !== 'all' ? 1 : 0);
    if (clearBadge) clearBadge.textContent = String(activeCount);

    const hash = state.cat !== 'all' ? `#${state.cat}` : '';
    if (window.location.hash !== hash) {
      history.replaceState(null, '', `${window.location.pathname}${window.location.search}${hash}`);
    }
  }

  function setSearch(v) { state.search = v; apply(); }
  function setCat(c) { state.cat = c; apply(); }

  searchInputs.forEach(input => {
    input.addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      const val = e.target.value;
      searchTimer = setTimeout(() => {
        searchInputs.forEach(i => { if (i !== input) i.value = val; });
        setSearch(val);
      }, 250);
    });
  });
  document.querySelectorAll('.catalog__search').forEach(f => {
    f.addEventListener('submit', (e) => e.preventDefault());
  });

  sidebarBtns.forEach(btn => btn.addEventListener('click', () => setCat(btn.dataset.cat)));
  pillBtns.forEach(btn => btn.addEventListener('click', () => setCat(btn.dataset.cat)));

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      state.search = '';
      state.cat = 'all';
      searchInputs.forEach(i => i.value = '');
      apply();
    });
  }

  const validCats = ['all', 'microchips', 'razemy', 'converters', 'capacitors', 'transistors', 'pcb'];
  function applyHash() {
    const h = window.location.hash.replace('#', '');
    if (h && h !== 'search' && validCats.includes(h)) {
      state.cat = h;
      apply();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (!h || h === 'search') {
      state.cat = 'all';
      apply();
    }
  }
  applyHash();
  // Listen for hashchange (cat-card click sets href="#razemy" etc on same page)
  window.addEventListener('hashchange', applyHash);
}


/** Static landing pages — one per catalog category (6 total).
 *  Pencil fh0MA/DA6LB/Py4Cq (microchips/transistors/pcb originals) +
 *  razemy/converters/capacitors added for UX consistency.
 *  Each: title + description + key specs + nomenclature table + related categories. */
const CATEGORY_LANDINGS = {
  microchips: {
    name: 'микросхемы',
    eyebrowCategory: ['microchips', 'микросхемы'],
    description: 'микросхемы серии экб тест — широкий ассортимент цифровых и аналоговых компонентов для управления питанием, обработки сигналов и систем автоматики. отечественные аналоги импортных решений с подтверждённой надёжностью.',
    image: '../assets/images/products/items/ET1310PN1U.webp',
    specs: {
      'категория': 'цифровые и аналоговые',
      'тип корпуса': 'sot-23, sot-89, sop-8, to-220 и другие',
      'температурный диапазон': '-40…+85 °c типично, до -55…+125 °c спец-исп.',
      'количество позиций': '51 и более',
      'сертификация': 'экб тест · гост рв 20.39.412'
    }
  },
  razemy: {
    name: 'разъёмы',
    eyebrowCategory: ['razemy', 'разъёмы'],
    description: 'промышленные соединители серий ет — отечественные аналоги 2рм, 2рмт, снц. цилиндрические, прямоугольные и приборные исполнения для радиоэлектронной и бортовой аппаратуры.',
    image: '../assets/images/products/connectors/et-snc28.webp',
    specs: {
      'количество серий': '23',
      'типы корпусов': 'цилиндрические, прямоугольные, приборные',
      'количество контактов': 'от 4 до 100+',
      'температурный диапазон': '-60…+200 °с',
      'покрытие контактов': 'золото, серебро, никель',
      'сертификация': 'гост рв 20.39.414, ткес'
    }
  },
  converters: {
    name: 'преобразователи напряжения',
    eyebrowCategory: ['converters', 'преобразователи'],
    description: 'dc/dc и ac/dc модульные преобразователи серий иртыш, волга, енисей, кама. pin-to-pin совместимость с продукцией vicor. отечественные решения для аппаратуры специального назначения.',
    image: '../assets/images/products/items/Irtysh.webp',
    specs: {
      'количество серий': '4',
      'тип': 'dc/dc и ac/dc',
      'выходная мощность': '50–1000 вт',
      'входное напряжение': '24, 28, 110, 230, 300, 375 в',
      'форм-факторы': '1/2 brick, 1/4 brick, full brick',
      'температурное исполнение': 'c, h, m (-55…+100 °c)'
    }
  },
  capacitors: {
    name: 'свч-конденсаторы',
    eyebrowCategory: ['capacitors', 'свч-конденсаторы'],
    description: 'высокочастотные конденсаторы серии arc70 для свч-модулей. применяются в усилителях мощности, фильтрах и согласующих цепях в радиолокации, связи и спецтехнике.',
    image: '../assets/images/products/capacitors.webp',
    specs: {
      'количество серий': '3',
      'тип': 'arc70',
      'диапазон частот': 'до 18 ггц',
      'ёмкость': '0,1–100 пф',
      'температурный диапазон': '-55…+125 °с',
      'добротность': 'высокая (low esr/esl)'
    }
  },
  transistors: {
    name: 'свч-транзисторы',
    eyebrowCategory: ['transistors', 'свч-транзисторы'],
    description: 'свч-транзисторы ldmos для усилителей мощности в радиолокации, связи и спецтехнике. отечественные решения с рабочей частотой 0,5–4 ггц и выходной мощностью до 200 вт. высокая линейность и стабильность параметров.',
    image: '../assets/images/products/transistors.webp',
    specs: {
      'технология': 'ldmos',
      'диапазон частот': '0,5–4 ггц',
      'выходная мощность': 'до 200 вт',
      'температурный диапазон': '-60…+150 °c',
      'количество позиций': '37 серий'
    }
  },
  pcb: {
    name: 'печатные платы',
    eyebrowCategory: ['pcb', 'печатные платы'],
    description: 'многослойные печатные платы для ответственных применений: бортовая аппаратура, медтехника, промышленная автоматика. изготовление в полном цикле — от схемы до контроля качества.',
    image: '../assets/images/products/pcb.webp',
    specs: {
      'количество слоёв': 'до 24',
      'минимальная ширина проводника': '0,1 мм',
      'минимальное отверстие': '0,2 мм',
      'импеданс-контроль': 'да',
      'поверхность': 'hasl, immersion gold, osp',
      'материал': 'fr-4, rogers, политетрафторэтилен'
    }
  }
};

/** Product Detail — populate fields from data based on URL hash.
 *  Hash formats: #p-<id> (PRODUCTS by id), #s-c-<slug> (connector series),
 *  #s-v-<slug> (converter series), #s-k-<slug> (capacitor series),
 *  #cat-microchips / #cat-transistors / #cat-pcb (static landings).
 *  No hash → leave default static content (ET-СНЦ23). */
function initProductDetail() {
  if (!document.querySelector('.product-top__title') || !document.querySelector('.section--pd-content')) return;
  const hash = window.location.hash;
  if (!hash || hash === '#') return;

  let data = null, kind = null, catSlug = null, catLabel = null;

  if (hash.startsWith('#p-')) {
    const id = parseInt(hash.slice(3), 10);
    if (typeof PRODUCTS !== 'undefined') data = PRODUCTS.find(p => p.id === id);
    if (data) {
      kind = 'product';
      const map = {
        'Микросхемы': ['microchips', 'микросхемы'],
        'СВЧ-транзисторы': ['transistors', 'свч-транзисторы'],
        'СВЧ-конденсаторы': ['capacitors', 'свч-конденсаторы'],
        'Преобразователи напряжения': ['converters', 'преобразователи'],
        'Разъёмы': ['razemy', 'разъёмы']
      };
      [catSlug, catLabel] = map[data.category] || ['', (data.category || '').toLowerCase()];
    }
  } else if (hash.startsWith('#s-c-') && typeof CONNECTOR_SERIES !== 'undefined') {
    data = CONNECTOR_SERIES.find(s => s.slug === hash.slice(5));
    kind = 'connector-series';
    catSlug = 'razemy'; catLabel = 'разъёмы';
  } else if (hash.startsWith('#s-v-') && typeof CONVERTER_SERIES !== 'undefined') {
    data = CONVERTER_SERIES.find(s => s.slug === hash.slice(5));
    kind = 'converter-series';
    catSlug = 'converters'; catLabel = 'преобразователи';
  } else if (hash.startsWith('#s-k-') && typeof CAPACITOR_SERIES !== 'undefined') {
    data = CAPACITOR_SERIES.find(s => s.slug === hash.slice(5));
    kind = 'capacitor-series';
    catSlug = 'capacitors'; catLabel = 'свч-конденсаторы';
  } else if (hash.startsWith('#cat-')) {
    const landingKey = hash.slice(5);
    const landing = CATEGORY_LANDINGS[landingKey];
    if (landing) {
      // Nomenclature items from data file (PRODUCTS for microchips/transistors, _SERIES for others)
      let items = [];
      if (landingKey === 'microchips' && typeof PRODUCTS !== 'undefined') {
        items = PRODUCTS.filter(p => p.category === 'Микросхемы')
          .map(p => ({ name: p.name, type: p.subcategory || '', partnumber: String(p.id), tu: '' }));
      } else if (landingKey === 'transistors' && typeof PRODUCTS !== 'undefined') {
        items = PRODUCTS.filter(p => p.category === 'СВЧ-транзисторы')
          .map(p => ({ name: p.name, type: p.subcategory || '', partnumber: String(p.id), tu: '' }));
      } else if (landingKey === 'razemy' && typeof CONNECTOR_SERIES !== 'undefined') {
        items = CONNECTOR_SERIES.map(s => ({
          name: s.name, type: 'серия', partnumber: s.slug, tu: s.tu || ''
        }));
      } else if (landingKey === 'converters' && typeof CONVERTER_SERIES !== 'undefined') {
        items = CONVERTER_SERIES.map(s => ({
          name: s.name, type: 'серия', partnumber: s.slug, tu: s.tu || ''
        }));
      } else if (landingKey === 'capacitors' && typeof CAPACITOR_SERIES !== 'undefined') {
        items = CAPACITOR_SERIES.map(s => ({
          name: s.name, type: 'серия', partnumber: s.slug, tu: s.tu || ''
        }));
      }
      // pcb has no data → items stays empty
      data = {
        name: landing.name,
        description: landing.description,
        image: landing.image,
        specs: landing.specs,
        items: items
      };
      kind = 'landing';
      catSlug = landing.eyebrowCategory[0];
      catLabel = landing.eyebrowCategory[1];
    }
  }

  if (!data) return;

  // Title (preserve counter span)
  const titleEl = document.querySelector('.product-top__title');
  if (titleEl) {
    const counter = titleEl.querySelector('.product-top__counter');
    titleEl.textContent = (data.name || data.displayName || '').toLowerCase();
    if (counter) titleEl.appendChild(counter);
  }

  // Eyebrow breadcrumb: каталог · <category> · <type>
  const eyebrowEl = document.querySelector('.product-top__eyebrow');
  if (eyebrowEl) {
    const trail = data.subcategory || (kind && kind.includes('series') ? (data.slug || '') : '');
    eyebrowEl.innerHTML = `<a href="products.html">каталог</a> · <a href="products.html#${catSlug}">${catLabel}</a>` +
      (trail ? ` · <span>${String(trail).toLowerCase()}</span>` : '');
  }

  // Subtitle (short description)
  const subtitleEl = document.querySelector('.product-top__subtitle');
  if (subtitleEl) {
    if (data.description) {
      subtitleEl.textContent = data.description.split('.')[0] + '.';
    } else if (data.tu) {
      subtitleEl.textContent = data.tu.toLowerCase();
    }
  }

  // Image
  const imgEl = document.querySelector('.pd-image__placeholder');
  const labelEl = document.querySelector('.pd-image__label');
  if (labelEl) labelEl.textContent = (data.name || '').toLowerCase();
  if (imgEl && data.image) {
    // Replace placeholder with actual image
    imgEl.innerHTML = `<img src="${data.image}" alt="${data.name}" loading="lazy" style="width:100%;height:100%;object-fit:contain;" onerror="this.style.display='none';this.parentElement.innerHTML='<span class=&quot;pd-image__label&quot;>${(data.name || '').toLowerCase()}</span>'">`;
  }

  // Description
  const descBody = document.querySelector('.pd-block--description .pd-block__body');
  if (descBody && data.description) {
    // Split into paragraphs by sentence end
    const sentences = data.description.split(/(?<=[.])\s+/).filter(Boolean);
    descBody.innerHTML = sentences.map(s => `<p>${s.trim()}</p>`).join('');
  }

  // Specs table
  const specsTable = document.querySelector('.pd-specs');
  if (specsTable) {
    let specsObj = {};
    if (data.specs) {
      specsObj = data.specs;
    } else if (kind && kind.includes('series')) {
      // Build specs from series-level fields
      if (data.tu) specsObj['ту'] = data.tu;
      if (data.count) specsObj['количество позиций'] = String(data.count);
      if (data.group) specsObj['группа'] = data.group === 'main' ? 'основные серии' : (data.group === 'additional' ? 'дополнительные серии' : 'в разработке');
    }
    const entries = Object.entries(specsObj);
    if (entries.length) {
      specsTable.innerHTML = '';
      entries.forEach(([k, v]) => {
        const row = document.createElement('div');
        row.className = 'pd-specs__row';
        row.innerHTML = `<dt class="pd-specs__label">${String(k).toLowerCase()}</dt><dd class="pd-specs__value">${String(v)}</dd>`;
        specsTable.appendChild(row);
      });
    }
  }

  // Update page title
  document.title = `${(data.name || '').toUpperCase()} — IC Фарватер`;

  // === VARIANTS section — only for series with items[] (connector/converter/capacitor) ===
  const variantsSection = document.getElementById('pdVariantsSection');
  const variantsPills = document.getElementById('pdVariantsPills');
  const variantsTable = document.getElementById('pdVariantsTable');
  const specsBlock = document.querySelector('.pd-block--specs');

  if (variantsSection && Array.isArray(data.items) && data.items.length > 0) {
    variantsSection.hidden = false;
    if (specsBlock) specsBlock.hidden = (kind !== 'landing'); // landings keep specs visible

    // Update section title — "номенклатура" for landings, "варианты исполнения" for series
    const variantsTitleEl = document.querySelector('.pd-variants__title');
    if (variantsTitleEl) {
      const titleText = kind === 'landing' ? 'номенклатура' : 'варианты исполнения';
      const counter = variantsTitleEl.querySelector('.pd-variants__counter');
      variantsTitleEl.textContent = titleText;
      if (counter) variantsTitleEl.appendChild(counter);
    }

    // Build unique types (Вилка / Розетка / etc); for landings the type filter is hidden
    const types = ['все', ...new Set(data.items.map(i => i.type).filter(Boolean))];
    variantsPills.innerHTML = '';
    // Skip pills for landings (too many subcategory types, not useful as filter)
    if (kind !== 'landing' && types.length > 1) {
      types.forEach((t, idx) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'pd-variants__pill' + (idx === 0 ? ' pd-variants__pill--active' : '');
        btn.dataset.type = t;
        btn.textContent = t.toLowerCase();
        variantsPills.appendChild(btn);
      });
    }

    // Render rows
    function renderRows(filterType) {
      variantsTable.innerHTML = '';
      const filtered = filterType === 'все' ? data.items : data.items.filter(i => i.type === filterType);
      filtered.forEach((it, i) => {
        const row = document.createElement('a');
        row.className = 'pd-variants__row';
        row.href = `#v-${(it.partnumber || it.name).replace(/[^a-zа-яё0-9-]/gi, '-').toLowerCase()}`;
        row.innerHTML = `
          <span class="pd-variants__name">${(it.displayName || it.name).toLowerCase()}</span>
          ${it.type ? `<span class="pd-variants__type">${it.type.toLowerCase()}</span>` : ''}
          <span class="pd-variants__tu">${(it.tu || '').toLowerCase()}</span>
          <span class="pd-variants__arrow" aria-hidden="true">→</span>
        `;
        variantsTable.appendChild(row);
      });
    }
    renderRows('все');

    // Pill click handler
    variantsPills.querySelectorAll('.pd-variants__pill').forEach(btn => {
      btn.addEventListener('click', () => {
        variantsPills.querySelectorAll('.pd-variants__pill').forEach(b => b.classList.remove('pd-variants__pill--active'));
        btn.classList.add('pd-variants__pill--active');
        renderRows(btn.dataset.type);
      });
    });
  } else if (variantsSection) {
    variantsSection.hidden = true;
    if (specsBlock) specsBlock.hidden = false;
  }

  // Re-fire on hash change (clicking related-card or browser back/forward)
  if (!window.__pdHashWired) {
    window.__pdHashWired = true;
    window.addEventListener('hashchange', () => {
      initProductDetail();
      window.scrollTo({ top: 0, behavior: 'auto' });
    });
  }
}


/** KP Drawer — "запросить КП" overlay form (Pencil GbmrD mobile).
 *  Inject template into body, wire up open/close handlers, handle submit. */
function initKpDrawer() {
  if (document.getElementById('kpDrawer')) return;

  // Resolve privacy-policy path relative to current page
  const privacyHref = window.location.pathname.includes('/pages/')
    ? 'privacy-policy.html'
    : 'pages/privacy-policy.html';

  const tpl = `
    <div id="kpDrawer" class="kp-drawer" role="dialog" aria-label="Запрос цены" aria-hidden="true">
      <div class="kp-drawer__overlay" data-action="close-kp-drawer" aria-hidden="true"></div>
      <div class="kp-drawer__panel" role="document">
        <header class="kp-drawer__header">
          <span class="kp-drawer__title">форма — запрос цены</span>
          <button type="button" class="kp-drawer__close" data-action="close-kp-drawer" aria-label="Закрыть">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" stroke-width="1.5"/>
            </svg>
          </button>
        </header>
        <div class="kp-drawer__body">
          <div class="kp-drawer__product">
            <span class="kp-drawer__product-label" id="kpProductLabel">подбор</span>
            <h2 class="kp-drawer__product-name" id="kpProductName">подбор по&nbsp;каталогу</h2>
          </div>
          <form id="kpForm" class="kp-form" novalidate>
            <div class="kp-form__field">
              <label for="kpName" class="kp-form__label">имя</label>
              <input id="kpName" name="name" type="text" class="kp-form__input" autocomplete="name" required>
            </div>
            <div class="kp-form__field">
              <label for="kpEmail" class="kp-form__label">электронная почта</label>
              <input id="kpEmail" name="email" type="email" class="kp-form__input" autocomplete="email" required>
            </div>
            <div class="kp-form__field">
              <label for="kpPhone" class="kp-form__label">телефон</label>
              <input id="kpPhone" name="phone" type="tel" class="kp-form__input" autocomplete="tel">
            </div>
            <div class="kp-form__field kp-form__field--textarea">
              <label for="kpComment" class="kp-form__label">комментарий к&nbsp;запросу</label>
              <textarea id="kpComment" name="comment" class="kp-form__textarea" rows="3"></textarea>
            </div>
            <div class="kp-form__field">
              <label class="kp-form__label" for="kpFiles">вложения</label>
              <label for="kpFiles" class="kp-form__file-trigger">
                <span>прикрепить файлы</span>
                <span class="kp-form__file-icon" aria-hidden="true">+</span>
              </label>
              <input id="kpFiles" name="files" type="file" multiple class="is-hidden-file">
              <ul class="kp-form__file-list" id="kpFilesList"></ul>
            </div>
            <label class="kp-form__consent">
              <input type="checkbox" class="kp-form__checkbox" required>
              <span>согласен(на)&nbsp;на&nbsp;обработку персональных данных в&nbsp;соответствии с&nbsp;<a href="${privacyHref}">политикой конфиденциальности</a></span>
            </label>
            <button type="submit" class="kp-form__submit">отправить запрос</button>
          </form>
          <div class="kp-drawer__contacts">
            <div class="kp-drawer__row">
              <span class="kp-drawer__row-label">телефон</span>
              <a href="tel:+79967788842" class="kp-drawer__row-value">+7&nbsp;996 778-88-42</a>
            </div>
            <div class="kp-drawer__row">
              <span class="kp-drawer__row-label">коммерческий отдел</span>
              <a href="mailto:sale@ic-farvater.ru" class="kp-drawer__row-value">sale@ic-farvater.ru</a>
            </div>
            <div class="kp-drawer__row">
              <span class="kp-drawer__row-label">режим работы</span>
              <span class="kp-drawer__row-value">пн.–пт. 10:00–18:00</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', tpl);

  const drawer = document.getElementById('kpDrawer');
  const form = document.getElementById('kpForm');
  const filesInput = document.getElementById('kpFiles');
  const filesList = document.getElementById('kpFilesList');
  let lastFocused = null;

  function openDrawer(trigger) {
    lastFocused = document.activeElement;
    // Try to extract product context from trigger
    const ctx = trigger?.closest('[data-kp-product]');
    if (ctx) {
      document.getElementById('kpProductName').textContent = ctx.getAttribute('data-kp-product');
      document.getElementById('kpProductLabel').textContent = ctx.getAttribute('data-kp-category') || 'подбор';
    } else {
      // Default: pull from product-top on PD page
      const pdTitle = document.querySelector('.product-top__title');
      const pdEyebrow = document.querySelector('.product-top__eyebrow');
      const nameEl = document.getElementById('kpProductName');
      const labelEl = document.getElementById('kpProductLabel');
      if (pdTitle) {
        const clean = pdTitle.cloneNode(true);
        clean.querySelectorAll('.product-top__counter').forEach(n => n.remove());
        nameEl.textContent = clean.textContent.trim();
      } else {
        nameEl.textContent = 'подбор по каталогу';
      }
      if (pdEyebrow) {
        // Eyebrow is "каталог · РАЗДЕЛ · серия" — pick middle segment (the category)
        const segs = pdEyebrow.textContent.split('·').map(s => s.trim()).filter(Boolean);
        labelEl.textContent = segs.length >= 2 ? segs[1] : (segs[0] || 'подбор');
      } else {
        labelEl.textContent = 'подбор';
      }
    }
    drawer.classList.add('kp-drawer--open');
    drawer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-drawer-open');
    requestAnimationFrame(() => {
      document.getElementById('kpName')?.focus();
    });
  }

  function closeDrawer() {
    drawer.classList.remove('kp-drawer--open');
    drawer.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-drawer-open');
    if (lastFocused) lastFocused.focus();
  }

  // Open/close handlers via event delegation
  document.addEventListener('click', (e) => {
    const opener = e.target.closest('[data-action="open-kp-drawer"]');
    if (opener) {
      e.preventDefault();
      openDrawer(opener);
      return;
    }
    if (e.target.closest('[data-action="close-kp-drawer"]')) {
      e.preventDefault();
      closeDrawer();
    }
  });

  // ESC closes
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('kp-drawer--open')) {
      closeDrawer();
    }
  });

  // File upload list
  if (filesInput && filesList) {
    filesInput.addEventListener('change', (e) => {
      filesList.innerHTML = '';
      Array.from(e.target.files || []).forEach((f) => {
        const li = document.createElement('li');
        li.className = 'kp-form__file-item';
        li.textContent = `${f.name} · ${formatFileSize(f.size)}`;
        filesList.appendChild(li);
      });
    });
  }

  // Submit (placeholder — replace with real backend later)
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const btn = form.querySelector('.kp-form__submit');
      if (btn) { btn.disabled = true; btn.textContent = 'отправка...'; }
      // Remove old message
      form.querySelectorAll('.kp-form__msg').forEach(el => el.remove());
      setTimeout(() => {
        const msg = document.createElement('p');
        msg.className = 'kp-form__msg kp-form__msg--ok';
        msg.textContent = 'Спасибо! Мы свяжемся с вами в течение рабочего дня.';
        form.appendChild(msg);
        form.reset();
        if (filesList) filesList.innerHTML = '';
        if (btn) { btn.disabled = false; btn.textContent = 'отправить запрос'; }
      }, 600);
    });
  }
}

