/**
 * Main JS — shared logic across all pages
 * Mobile menu, smooth scroll, common interactions
 */

/** Cyrillize: convert Latin look-alikes to Cyrillic for display of отечественные
 *  product codes (ET1310PN1U → ЕТ1310РН1У). Used in catalog cards, product
 *  detail title, variants table, related cards. Top-level so all init* see it. */
const CYRILLIZE_MAP = {
  'A':'А','B':'В','C':'С','E':'Е','H':'Н','I':'И','K':'К','M':'М','N':'Н','O':'О','P':'Р','R':'Р','S':'С','T':'Т','U':'У','V':'В','X':'Х','Y':'У',
  'a':'а','b':'в','c':'с','e':'е','h':'н','i':'и','k':'к','m':'м','n':'н','o':'о','p':'р','r':'р','s':'с','t':'т','u':'у','v':'в','x':'х','y':'у'
};
function cyrillize(s) {
  return String(s || '').split('').map(ch => CYRILLIZE_MAP[ch] || ch).join('');
}

/** Form submission helper — production hits PHP backend, staging/local returns
 *  mock success after a short delay so we can demo the UI flow without a backend.
 *  Production endpoint = same-origin /scripts/send.php (requires Beget + PHP).
 *  Staging hosts (localhost / github.io / netlify) skip the network call. */
const FORM_ENDPOINT = '/scripts/send.php';
function isStagingHost() {
  const h = location.hostname;
  return h === 'localhost' || h === '127.0.0.1' ||
         h.endsWith('.github.io') || h.endsWith('.netlify.app') ||
         h.endsWith('.vercel.app');
}
async function submitForm(form, kind, extra) {
  if (isStagingHost()) {
    await new Promise(r => setTimeout(r, 500));
    return { ok: true, staging: true };
  }
  const fd = new FormData(form);
  fd.set('kind', kind);
  fd.set('consent', '1');
  if (extra && typeof extra === 'object') {
    for (const [k, v] of Object.entries(extra)) {
      if (v != null && v !== '') fd.set(k, v);
    }
  }
  try {
    const res = await fetch(FORM_ENDPOINT, { method: 'POST', body: fd });
    let json;
    try { json = await res.json(); }
    catch { return { ok: false, error: 'Сервер вернул некорректный ответ' }; }
    return json;
  } catch (err) {
    return { ok: false, error: 'Сеть недоступна. Напишите info@ic-farvater.ru' };
  }
}

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
  initFooterEmailForm();
  initCatalog();
  initProductDetail();
});

/** Footer email form — пользователь вводит email → открываем KP drawer с
 *  предзаполненным email, фокус на поле «имя» (чтобы человек продолжил с того
 *  места где остановился). Финальная отправка идёт через #kpForm → send.php. */
function initFooterEmailForm() {
  document.querySelectorAll('.footer__email-form').forEach((form) => {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const emailInput = form.querySelector('input[type="email"]');
      const email = (emailInput?.value || '').trim();
      // Trigger drawer open via the existing global click delegation
      const opener = document.querySelector('[data-action="open-kp-drawer"]');
      if (!opener) return;
      opener.click();
      // Drawer DOM уже в body (initKpDrawer отработал на DOMContentLoaded) —
      // можно сразу пред-заполнить email и переставить фокус на имя.
      const kpEmail = document.getElementById('kpEmail');
      if (kpEmail && email) {
        kpEmail.value = email;
        requestAnimationFrame(() => document.getElementById('kpName')?.focus());
      }
      if (emailInput) emailInput.value = '';
    });
  });
}

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

/** Header search — inline expandable input on desktop.
 *  Click icon → form slides out from icon's position, expanding leftward into the
 *  nav area. Icon collapses simultaneously. Submit → /products.html?q=<query>.
 *  Esc / close-button revert. Mobile uses the burger-menu inline search (initMobileMenu). */
function initHeaderSearch() {
  const header = document.querySelector('.header');
  const searchBtn = header && header.querySelector('.header__search');
  if (!header || !searchBtn) return;

  // Wrap icon + form in a fixed-width container so the form can be absolutely positioned
  // without disturbing the flex layout. The wrap is 18px wide (matches icon) — when form
  // expands, it grows LEFTWARD from the wrap's right edge (anchored via right:0), so the
  // adjacent "запросить КП" button stays put.
  let wrap = header.querySelector('.header__search-wrap');
  let form = header.querySelector('.header__search-form');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'header__search-wrap';
    searchBtn.parentNode.insertBefore(wrap, searchBtn);
    wrap.appendChild(searchBtn);

    form = document.createElement('form');
    form.className = 'header__search-form';
    form.setAttribute('role', 'search');
    form.innerHTML = `
      <input type="search" class="header__search-input" placeholder="поиск по продукции..." aria-label="Поиск по продукции" autocomplete="off">
      <button type="submit" class="header__search-submit" aria-label="Найти">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.5"/>
          <path d="M12.5 12.5L16.5 16.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
      <button type="button" class="header__search-close" aria-label="Закрыть поиск">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </button>
    `;
    wrap.appendChild(form);
  }

  const input = form.querySelector('.header__search-input');
  const closeBtn = form.querySelector('.header__search-close');

  // Resolve relative path back to root (pages/about.html → "../"; index.html → "")
  const isInPages = /\/pages\//.test(window.location.pathname);
  const root = isInPages ? '../' : '';

  function open() {
    header.classList.add('header--searching');
    // Defer focus until transition starts so visibility:visible has applied.
    requestAnimationFrame(() => input.focus());
  }
  function close() {
    header.classList.remove('header--searching');
    input.value = '';
    input.blur();
  }

  searchBtn.addEventListener('click', (e) => {
    e.preventDefault();
    open();
  });
  closeBtn.addEventListener('click', close);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) { input.focus(); return; }
    const target = `${root}pages/products.html?q=${encodeURIComponent(q)}#all`;
    window.location.href = target;
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && header.classList.contains('header--searching')) close();
  });
}

/** Mobile burger menu — Pencil C8EHBB "Menu v4 — Mobile (open)".
    Builds a fullscreen overlay element appended to <body> so it sits above the
    sticky page header (avoids the scroll-edge artifact where sticky header peeks
    through). Structure (per Pencil C8EHBB):
      - menu header: ic farvater logo + X close
      - search-item (top)
      - 5 nav-items: главная / продукция / о компании / услуги / контакты (28/500/-1, alignItems end, → on right)
      - CTA: запросить кп → (full-width pill, dark fill, 52h)
      - contact block: 4 fields (телефон/email/адрес/режим работы) */
function initMobileMenu() {
  const burger = document.querySelector('.header__burger');
  if (!burger) return;

  // Resolve relative path back to root (pages/about.html → "../"; index.html → "")
  const isInPages = /\/pages\//.test(window.location.pathname);
  const root = isInPages ? '../' : '';

  // Build the overlay (once per page). Reuses on subsequent burger clicks.
  let menu = document.getElementById('mobileMenu');
  if (!menu) {
    menu = document.createElement('div');
    menu.id = 'mobileMenu';
    menu.className = 'mobile-menu';
    menu.hidden = true;
    menu.innerHTML = `
      <header class="mobile-menu__header">
        <a href="${root}index.html" class="mobile-menu__logo">ic farvater</a>
        <button type="button" class="mobile-menu__close" aria-label="Закрыть меню">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
            <path d="M5 5L17 17M17 5L5 17" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </header>
      <nav class="mobile-menu__nav" aria-label="Главная навигация">
        <form class="mobile-menu__search-form" role="search" data-action="mobile-search">
          <input type="search" class="mobile-menu__search-input" placeholder="поиск по продукции..." aria-label="Поиск по продукции" autocomplete="off">
          <button type="submit" class="mobile-menu__search-submit" aria-label="Найти">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.5"/>
              <path d="M12.5 12.5L16.5 16.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
          </button>
        </form>
        <a class="mobile-menu__item" href="${root}index.html"><span>главная</span><span class="mobile-menu__arrow" aria-hidden="true">→</span></a>
        <a class="mobile-menu__item" href="${root}pages/products.html"><span>продукция</span><span class="mobile-menu__arrow" aria-hidden="true">→</span></a>
        <a class="mobile-menu__item" href="${root}pages/about.html"><span>о&nbsp;компании</span><span class="mobile-menu__arrow" aria-hidden="true">→</span></a>
        <a class="mobile-menu__item" href="${root}index.html#uslugi"><span>услуги</span><span class="mobile-menu__arrow" aria-hidden="true">→</span></a>
        <a class="mobile-menu__item" href="${root}pages/contacts.html"><span>контакты</span><span class="mobile-menu__arrow" aria-hidden="true">→</span></a>
      </nav>
      <div class="mobile-menu__cta-wrap">
        <a href="#" class="mobile-menu__cta" data-action="open-kp-drawer">запросить КП <span aria-hidden="true">→</span></a>
      </div>
      <div class="mobile-menu__contact">
        <div class="mobile-menu__field">
          <span class="mobile-menu__field-label">телефон</span>
          <a class="mobile-menu__field-value" href="tel:+79967788842">+7&nbsp;996&nbsp;778-88-42</a>
        </div>
        <div class="mobile-menu__field">
          <span class="mobile-menu__field-label">email</span>
          <a class="mobile-menu__field-value" href="mailto:info@ic-farvater.ru">info@ic-farvater.ru</a>
        </div>
        <div class="mobile-menu__field">
          <span class="mobile-menu__field-label">адрес</span>
          <span class="mobile-menu__field-value">ул.&nbsp;Беринга, д.&nbsp;1-А, оф.&nbsp;46-Н<br>г.&nbsp;Санкт-Петербург, 199406</span>
        </div>
        <div class="mobile-menu__field">
          <span class="mobile-menu__field-label">режим работы</span>
          <span class="mobile-menu__field-value">пн.–пт. 10:00–18:00</span>
        </div>
      </div>
    `;
    document.body.appendChild(menu);
  }

  function setOpen(open) {
    menu.hidden = !open;
    menu.classList.toggle('mobile-menu--open', open);
    burger.classList.toggle('header__burger--open', open);
    burger.setAttribute('aria-expanded', open);
    document.body.classList.toggle('menu-open', open);
  }

  burger.addEventListener('click', () => setOpen(menu.hidden));
  menu.querySelector('.mobile-menu__close').addEventListener('click', () => setOpen(false));

  // Close menu on any nav/CTA/contact link click. Excludes the search-form which has its own handler.
  menu.querySelectorAll('.mobile-menu__item, .mobile-menu__cta, .mobile-menu__field-value, .mobile-menu__logo').forEach(link => {
    link.addEventListener('click', () => setOpen(false));
  });

  // Search form — submit navigates to catalog with ?q=<query>; empty query opens catalog with search input focused.
  const searchForm = menu.querySelector('.mobile-menu__search-form');
  const searchInput = menu.querySelector('.mobile-menu__search-input');
  searchForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = searchInput.value.trim();
    setOpen(false);
    const target = `${root}pages/products.html${q ? `?q=${encodeURIComponent(q)}` : ''}#all`;
    window.location.href = target;
  });
}

/** Highlight nav link matching current page or hash (v2 .header__nav-link + v1 .header__link) */
function initActiveNavLink() {
  const links = document.querySelectorAll('.header__nav-link, .header__link');
  if (!links.length) return;

  function syncActive() {
    const hash = window.location.hash;
    const path = window.location.pathname;
    links.forEach(link => {
      const href = link.getAttribute('href') || '';
      // Match either: exact href = current hash, OR same pathname with matching hash.
      // Avoids false positives where href.endsWith('#consent') matched 'consent.html'.
      const isHashMatch = hash && (href === hash || href === path + hash);
      const isPathMatch = !hash && (href === path || href === path.replace(/^.*\/(.*)$/, '$1'));
      link.classList.toggle('header__nav-link--active', !!(isHashMatch || isPathMatch));
    });
  }

  syncActive();
  window.addEventListener('hashchange', syncActive);
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

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    removeFormMessage(form);

    const originalLabel = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.textContent = 'отправка...'; }

    const result = await submitForm(form, 'contact');
    if (result.ok) {
      showFormMessage(form, 'спасибо! мы свяжемся с вами в течение рабочего дня.', true);
      form.reset();
      if (fileState) fileState.clear();
    } else {
      showFormMessage(form, result.error || 'ошибка отправки. напишите info@ic-farvater.ru', false);
    }
    if (btn) { btn.disabled = false; btn.innerHTML = originalLabel; }
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

/** Yandex.Metrica loader — reads counter ID from <meta name="yandex-counter">
 *  (empty/zero → no-op). Idempotent: re-calls are ignored. */
function loadYandexMetrika() {
  if (window.ym) return;
  const meta = document.querySelector('meta[name="yandex-counter"]');
  const id = parseInt(meta?.content || '0', 10);
  if (!id) return; // placeholder — counter not configured yet
  (function(m,e,t,r,i,k,a){
    m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
    m[i].l=1*new Date();
    for (var j = 0; j < e.scripts.length; j++) {
      if (e.scripts[j].src === r) return;
    }
    k=e.createElement(t); a=e.getElementsByTagName(t)[0];
    k.async=1; k.src=r; a.parentNode.insertBefore(k,a);
  })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');
  window.ym(id, 'init', {
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: false,
    defer: true,
  });
}

/** Cookie consent banner — persists choice in localStorage and loads analytics
 *  on accept. Loads analytics automatically if user already accepted previously. */
function initCookieBanner() {
  const banner = document.getElementById('cookieBanner');
  const choice = localStorage.getItem('cookieConsent');

  // Already accepted before — load analytics + skip banner
  if (choice === 'accepted' || localStorage.getItem('cookieAccepted') === 'true') {
    if (banner) banner.classList.add('cookie-banner--hidden');
    loadYandexMetrika();
    return;
  }
  // Previously rejected — skip banner, no analytics
  if (choice === 'rejected') {
    if (banner) banner.classList.add('cookie-banner--hidden');
    return;
  }
  // No choice yet — show banner
  if (!banner) return;
  banner.classList.remove('cookie-banner--hidden');
  banner.querySelectorAll('[data-cookie-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.getAttribute('data-cookie-action');
      const accepted = action === 'accept';
      localStorage.setItem('cookieConsent', accepted ? 'accepted' : 'rejected');
      banner.classList.add('cookie-banner--hidden');
      if (accepted) loadYandexMetrika();
    });
  });
}

/** Product carousel — bounded horizontal scroll for card-grids on home page.
 *  Mobile + tablet (<1024px): JS skips; CSS hides cards 5-8 + arrows entirely.
 *  Desktop (≥1024px):
 *    - Arrows always visible; disabled state at boundaries via
 *      [aria-disabled="true"] which CSS dims to opacity 0.25.
 *    - Scroll step = 1 card per click.
 *    - Lazy-load: images with data-src have their src set only when their card
 *      enters the visible window (initial + after each scroll). Saves ~50% of
 *      LCP/transfer when half the cards are off-screen by default. */
function initProductCarousels() {
  if (window.matchMedia('(max-width: 1023.98px)').matches) return;

  document.querySelectorAll('.product-carousel').forEach(carousel => {
    const track = carousel.querySelector('.product-carousel__track');
    const grid = track && track.querySelector('.product-cards-grid');
    const btnPrev = carousel.querySelector('.product-carousel__btn--prev');
    const btnNext = carousel.querySelector('.product-carousel__btn--next');

    if (!track || !grid || !btnPrev || !btnNext) return;

    const cards = Array.from(grid.children).filter(el => el.nodeType === 1);
    const N = cards.length;
    if (N < 2) {
      btnPrev.setAttribute('aria-disabled', 'true');
      btnNext.setAttribute('aria-disabled', 'true');
      return;
    }

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

    function syncButtons() {
      const max = maxIndex();
      // Always visible; just toggle disabled-look at boundaries.
      btnPrev.setAttribute('aria-disabled', String(index <= 0));
      btnNext.setAttribute('aria-disabled', String(index >= max));
    }

    // Lazy-load image swap: swap data-src → src for cards inside the visible window
    // (with 100px buffer so adjacent cards preload before user reaches them).
    function loadVisibleImages() {
      const trackW = track.offsetWidth;
      const offset = index * getStep();
      cards.forEach(card => {
        const img = card.querySelector('img[data-src]');
        if (!img) return;
        const cardLeft = card.offsetLeft - offset;
        const cardRight = cardLeft + card.offsetWidth;
        if (cardRight > -100 && cardLeft < trackW + 100) {
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
        }
      });
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
      syncButtons();
      loadVisibleImages();
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


// Compact one-sentence series descriptions for catalog cards + related cards across pages.
// Lead with WHAT it is + key spec or differentiator. ~40–70 chars, lowercase, search-friendly.
// shortDesc() falls back to description.split('.')[0] when slug isn't in the map.
const SERIES_SHORT_DESC = {
  // Connectors (23)
  'et-2rmg':    'блочные герметичные вилки и розетки, до 200 °с',
  'et-2rmt':    'малогабаритные резьбовые соединители, 4–50 контактов',
  'et-2rtt':    'силовые соединители для повышенных токов, до 850 в',
  'et-ek-ep':   'технологические заглушки для розеток и вилок',
  'et-mr1':     'малогабаритные для сигнальных цепей в компактной рэа',
  'et-onc-bs':  'быстросъёмные одноконтактные с байонетом',
  'et-rrs':     'радиочастотные соединители до 3 мгц, до 200 в',
  'et-rsg':     'радиочастотные для свч-цепей, герметичные',
  'et-shr':     'штепсельные цилиндрические для бортовой аппаратуры',
  'et-snc144':  'высокоплотные круглые, mil-dtl-38999 series iii',
  'et-snc23':   'электрические соединители для приборов и радиоустановок',
  'et-snc28':   'цилиндрические для силовых и сигнальных цепей',
  'et-2rmp':    'цилиндрические с резьбой, упрощённый корпус',
  'et-onc-bm':  'малогабаритные байонетные, до 3 мгц',
  'et-rbm4':    'высокочастотные резьбовые 75 ом, импортозамещение',
  'et-rbn2':    'высокочастотные резьбовые 75 ом, импортозамещение',
  'et-rvn1':    'высокочастотные резьбовые 75 ом',
  'et-rvn2':    'высокочастотные для больших токов и частот',
  'et-snc127':  'цилиндрические для электроцепей в приборах',
  'et-snc13':   'прямоугольные серии снц13 для рэа',
  'et-snc146':  'цилиндрические резьбовые, импортозамещение',
  'et-snc147':  'цилиндрические резьбовые, передача сигналов',
  'et-snc233':  'цилиндрические резьбовые для рэа с повышенными требованиями',
  // Converters (4)
  'irtysh':     'dc/dc-преобразователи, pin-to-pin замена vicor',
  'volga':      'ac/dc-преобразователи, авиационная сеть 115 в / 400 гц',
  'enisei':     'dc/dc-преобразователи 27 в, гальваноизолированные',
  'kama':       'ac/dc-преобразователи 230 в, 50–1000 гц',
  // Capacitors (3)
  'arc70a':     'mlcc-конденсаторы, аналог atc 100a',
  'arc70c':     'mlcc-конденсаторы 2225, аналог atc 100c',
  'arc70e':     'mlcc-конденсаторы, аналог atc 100e'
};
function shortDesc(slug, fallback) {
  return SERIES_SHORT_DESC[slug] || (fallback ? String(fallback).split('.')[0] + '.' : '');
}

// Connector type normalization. Buckets messy real-world variant types (typos like
// "роозетка", qualified forms like "вилка блочная", accessories like "заглушка для
// снц144") into 4 primary categories so the Type filter UI stays tight and image
// lookups can match keys reliably.
function normalizeType(raw) {
  const t = (raw || '').toLowerCase().trim();
  if (!t) return null;
  if (/заглушк/.test(t)) return 'заглушка';
  if (/кожух/.test(t))   return 'кожух';
  if (/вилк/.test(t))    return 'вилка';
  if (/розетк|роозетк/.test(t)) return 'розетка';
  return t; // fallback for clean types (e.g. "dc/dc" / "ac/dc" in converters)
}

// Generic type-fallback images for connector variants — used when a series has no
// series.imageByType but its items carry a type. Only 4 of 23 connector series
// have type-specific files on disk; for the other 19 these generic images show
// the correct connector TYPE rather than all variants sharing the series default.
//
// "Заглушка" intentionally has NO fallback — et-ek-ep.webp visually reads as an
// electronic module/converter, not a cap, so it would confuse users. Variants of
// type "Заглушка" fall through to series.image → grey card when series has none.
const GENERIC_TYPE_IMAGES = {
  'вилка':    '../assets/images/products/connectors/et-2rmt-vilka.webp',
  'розетка':  '../assets/images/products/connectors/et-2rmt-rozetka.webp'
};

// Resolve the best image for a series item. Order:
//   1. series.imageByType[item.type] — exact key match
//   2. series.imageByType[k] where normalizeType(k) === normalizeType(item.type)
//      (handles e.g. "Вилка приборная" matching key "Вилка")
//   3. GENERIC_TYPE_IMAGES[normalizeType(item.type)] — global fallback
//   4. series.image — series default
function resolveSeriesItemImage(series, item) {
  if (series && series.imageByType && item && item.type) {
    const img = series.imageByType[item.type];
    if (img) return img;
    const norm = normalizeType(item.type);
    if (norm) {
      const entry = Object.entries(series.imageByType).find(([k]) => normalizeType(k) === norm);
      if (entry) return entry[1];
    }
  }
  if (item && item.type) {
    const norm = normalizeType(item.type);
    if (norm && GENERIC_TYPE_IMAGES[norm]) return GENERIC_TYPE_IMAGES[norm];
  }
  return (series && series.image) || '';
}

// Variant display name/sub split — module level (used by initCatalog cards/search AND
// initProductDetail variant title). Prefer the compact displayName over the raw long
// name ("Модульный преобразователь DC/DC Иртыш 3,3 В / 264 Вт ET-F300C-3V3P264R23").
// Rows whose Strapi displaySub is empty (серия ЕНИСЕЙ) cram the part-number into
// displayName — derive the split: trailing token ≥8 chars with digits+letters → sub.
function splitVariantName(it) {
  const dn = it.displayName || it.name || '';
  let name = dn, sub = it.displaySub || '';
  if (!sub) {
    const m = /^(.+)\s(\S{8,})$/.exec(dn);
    if (m && /\d/.test(m[2]) && /[A-Za-zА-Яа-яЁё]/.test(m[2])) { name = m[1]; sub = m[2]; }
  }
  return [name, sub];
}

// Характеристики уровня СЕРИИ для карточек вариантов — источник ekb-test.ru
// (первоисточник данных каталога) + series.description; собраны и адверсариально
// сверены 2026-07-11. Дополняются item-полями в variantSpecs(); при совпадении
// ключа item-значение приоритетнее серии.
const SERIES_SPECS = {
  arc70a: [['аналог', 'ATC 100A (American Technical Ceramics)'], ['ту', 'ТКЕС.434410.002 ТУ'], ['тке', '0±30 ppm/°C'], ['тип', 'многослойные керамические (MLCC)'], ['применение', 'усилители мощности, задающие генераторы, согласующие цепи, СВЧ-фильтры']],
  arc70c: [['аналог', 'ATC 100C (American Technical Ceramics)'], ['корпус', '2225'], ['ёмкость', '0,5–3000 пФ'], ['допуск', '±1% … ±5%'], ['температура', '−55…+200 °C'], ['тке', '0±30 ppm/°C'], ['применение', 'импульсные усилители мощности, передающие тракты, радиолокация']],
  arc70e: [['аналог', 'ATC 100E (American Technical Ceramics)'], ['корпус', '3838'], ['ёмкость', '0,5–5100 пФ'], ['допуск', '±0,05 пФ … ±5%'], ['температура', '−55…+200 °C'], ['тке', '0±30 ppm/°C'], ['применение', 'МШУ, приёмные СВЧ-тракты, полосовые фильтры']],
  irtysh: [['вход', '24 (18–36) / 28 (9–36) / 300 (180–375) / 375 (250–425) В'], ['выход', '3,3 / 5 / 8 / 12 / 15 / 24 / 28 / 36 / 48 В'], ['мощность', '50–600 Вт'], ['корпус', '1/4, 1/2 и full brick (117×55,9×12,7 мм)'], ['температура', '−20…+100 °C (C) / −40…+100 °C (H) / −55…+100 °C (M)'], ['совместимость', 'pin-to-pin с VICOR'], ['применение', 'бортовое питание, промавтоматика, связь, спецаппаратура']],
  volga: [['вход', '115 В (80–140 В) или 230 В (176–242 В), однофазная сеть'], ['выход', '5 / 12 / 15 / 24 / 27 / 48 В'], ['мощность', '50–2000 Вт'], ['корпус', 'исполнения A1–A6 (от 101×51×19 мм)'], ['температура', '−50…+100 °C (Р) / −40…+100 °C (С)'], ['совместимость', 'функциональный аналог Vicor, TRACO POWER, VPT'], ['применение', 'электропитание измерительной, промышленной и специальной аппаратуры']],
  enisei: [['вход', '27 В (17–36 В)'], ['мощность', '7,5–1200 Вт'], ['выходы', '5/12/15/24/27 В, 1–2 канала'], ['температура', '−40…+100 °C (исп. С)'], ['корпуса', 'F1–F8'], ['совместимость', 'аналог Vicor, TRACO POWER, VPT'], ['применение', 'бортовая и стационарная РЭА']],
  kama: [['вход', '230 В (176–242 В), универсальный'], ['мощность', '50–1000 Вт'], ['выходы', '5/12/15/24/27/48 В'], ['температура', '−60…+100 °C (Р) / −40…+100 °C (С)'], ['корпуса', 'F5–F8, от 84,5×53 до 168×122 мм'], ['применение', 'вторичное питание промышленной и спецаппаратуры']],
  'et-2rmg': [['контакты', '4–50'], ['напряжение', 'до 560 В'], ['температура', '−60…+200 °C'], ['вибрация', '5–5000 Гц, 50g'], ['удар', '500g одиночный / 100g многократный'], ['ресурс', '500 циклов, наработка 1000 ч'], ['покрытия', 'золото, серебро, хим. никель'], ['совместимость', 'розетки ЕТ-2РМТ / ЕТ-2РМДТ']],
  'et-2rmt': [['контакты', '4–50'], ['напряжение', 'до 560 В'], ['ток', '5/10/20/40 А (контакты Ø1,0–3,0 мм)'], ['температура', '−60…+150 °C'], ['вибрация', '1–5000 Гц'], ['удар', '5000 м/с² одиночный'], ['корпуса', 'размеры 14–45'], ['ресурс', '500 циклов, наработка 1000 ч'], ['покрытия', 'золото, серебро']],
  'et-2rtt': [['напряжение', 'до 850 В'], ['теплостойкость', '100 °C'], ['покрытия', 'серебро'], ['ресурс', '500 циклов, наработка 1000 ч'], ['сочленение', 'резьбовое, одношпоночная поляризация'], ['исполнение', 'приборное и кабельное, прямой/угловой корпус'], ['климатика', 'всеклиматическое, внутренний монтаж']],
  'et-2rmp': [['статус', 'в разработке, ТУ на стадии утверждения'], ['корпуса', 'размеры 14–30 (предварительно)'], ['контакты', '4–32 (предварительно)'], ['исполнение', 'приборное, внутренний монтаж'], ['применение', 'РЭА']],
  'et-snc23': [['контакты', '3–61'], ['напряжение', '400–500 В'], ['теплостойкость', 'до +200 °C'], ['ресурс', '500 циклов'], ['наработка', '1000 ч'], ['покрытия', 'контакты — золото'], ['совместимость', 'аналог СНЦ23'], ['ту', 'ТКЕС.434410.014 ТУ']],
  'et-snc144': [['совместимость', 'MIL-DTL-38999 Series III'], ['экранирование', '65–85 дБ'], ['напряжение', 'до 500 В'], ['теплостойкость', 'до +200 °C'], ['ресурс', '500 циклов'], ['сохраняемость', '15 лет'], ['покрытия', 'контакты — золото, корпус — никель/кадмий'], ['ту', 'ТКЕС.434410.049 ТУ']],
  'et-snc28': [['сочленение', 'байонетное'], ['корпус', 'металлический, экранированный'], ['защита', 'от ЭМП и климатических воздействий'], ['цепи', 'силовые и сигнальные'], ['применение', 'авионика, системы управления, спец. РЭА'], ['ту', 'ТКЕС.434410.012 ТУ']],
  'et-snc127': [['сочленение', 'байонетное'], ['исполнение', 'всеклиматическое'], ['варианты', 'приборные и кабельные'], ['корпус', 'прямой или угловой'], ['ту', 'ТКЕС.434410.007 ТУ']],
  'et-shr': [['цепи', 'постоянный и переменный ток'], ['корпус', 'металлический, байонетное сочленение'], ['совместимость', 'замена классической серии ШР'], ['стойкость', 'повышенная климатическая и механическая'], ['применение', 'промышленная, бортовая и спец. аппаратура'], ['ту', 'ТКЕС.434410.003 ТУ']],
  'et-onc-bs': [['цепи', 'постоянный, переменный (до 3 МГц), импульсный ток'], ['сочленение', 'байонетное, быстросъёмное'], ['фиксация', 'надёжная при вибрации'], ['назначение', 'силовые и сигнальные цепи'], ['совместимость', 'аналог ОНЦ-БС-1(2)'], ['ту', 'ТКЕС.434410.024 ТУ']],
  'et-onc-bm': [['контакты', 'Ø1,0 мм, до 102 в корпусе'], ['напряжение', '150 В'], ['температура', '−60…+85 °C'], ['вибрация', '1–5000 Гц'], ['удар', '10 000 м/с² одиночный, 1500 м/с² многократный'], ['ресурс', '250 циклов, наработка 5000 ч'], ['покрытия', 'серебро, золото'], ['ту', 'ТКЕС.434410.047 ТУ']],
  'et-mr1': [['цепи', 'сигнальные и низковольтные'], ['сочленение', 'байонетное, стыковка без инструмента'], ['покрытия', 'серебро, золото'], ['конструктив', 'малогабаритный цилиндрический'], ['исполнения', 'вилки и розетки, в т. ч. с кожухом'], ['ту', 'ТКЕС.434410.032 ТУ']],
  'et-rrs': [['частота', 'до 3 МГц'], ['напряжение', 'до 200 В'], ['исполнение', 'герметичное, всеклиматическое'], ['вибро- и ударостойкость', 'повышенная'], ['поляризация', 'многопозиционная (корпус)'], ['применение', 'бортовая, корабельная и специальная аппаратура'], ['ту', 'ТКЕС.434410.045 ТУ']],
  'et-rsg': [['назначение', 'коммутация ВЧ- и СВЧ-цепей'], ['исполнения', 'ЕТ-РС и ЕТ-РСГ (герметичное)'], ['потери на передачу', 'низкие'], ['волновое сопротивление', 'стабильное'], ['климатика', 'защита от климатических воздействий'], ['применение', 'антенно-фидерные тракты, измерительная аппаратура, радиосвязь'], ['ту', 'ТКЕС.434410.026 ТУ']],
  'et-ek-ep': [['назначение', 'защита контактной пары от пыли, влаги и механических повреждений'], ['исполнения', 'ЕТ-ЭК — для кабельных розеток, ЕТ-ЭП — для приборных вилок'], ['типы', 'заглушки для СНЦ23, 2РМ, ОНЦ'], ['совместимость', 'ЕТ-2РМТ, ЕТ-2РМГ, ЕТ-2РТТ, ЕТ-СНЦ и другие серии ЕТ'], ['режим', 'хранение, транспортировка, перерывы в эксплуатации'], ['ту', 'ТКЕС.434410.014 / .016 / .024 ТУ']],
  'et-rbm4': [['статус', 'перспективная серия, в разработке'], ['тип', 'блочные малогабаритные разъёмы'], ['назначение', 'межмодульная коммутация в компактной аппаратуре'], ['ту', 'не утверждены'], ['доступность', 'сроки запуска и характеристики — по запросу у менеджера']],
  'et-rbn2': [['тип', 'блочные низкочастотные разъёмы'], ['контакты', '18–34 (предварительно)'], ['конструктив', 'приборные вилки, кабельные розетки'], ['применение', 'сигнальные и низковольтные цепи РЭА'], ['статус', 'серия в разработке'], ['ту', 'не утверждены']],
  'et-rvn1': [['тип', 'врубные низкочастотные соединители'], ['сочленение', 'автоматическое, при стыковке блоков РЭА'], ['статус', 'серия в разработке'], ['ту', 'не утверждены']],
  'et-rvn2': [['тип', 'врубные соединители'], ['сочленение', 'автоматическое, при стыковке блоков и модулей'], ['применение', 'стойки, этажерки, выдвижные узлы РЭА'], ['монтаж', 'быстрая сборка-разборка без инструмента'], ['ресурс', 'многократные циклы сочленения'], ['конструктив', 'вилки и розетки'], ['ту', 'ТКЕС.434410.020 ТУ']],
  'et-snc13': [['тип', 'цилиндрические соединители СНЦ13'], ['применение', 'коммутация цепей в РЭА'], ['конструктив', 'вилки и розетки'], ['типоразмеры', '10/10, 19/12, 30/14'], ['ту', 'ТКЕС.434410.036 ТУ (серийные позиции)'], ['статус', 'часть позиций в разработке, часть доступна к заказу']],
  'et-snc146': [['статус', 'перспективная серия, в разработке'], ['ту', 'не утверждены'], ['конструкция', 'цилиндрический соединитель'], ['назначение', 'коммутация цепей'], ['применение', 'приборы и радиоустановки с повышенными требованиями к надёжности']],
  'et-snc147': [['статус', 'перспективная серия, в разработке'], ['ту', 'не утверждены'], ['конструкция', 'цилиндрический соединитель'], ['контакты', '3–22 (предварительный ряд)'], ['исполнения', 'приборные вилки, кабельные розетки'], ['номенклатура', '16 позиций в предварительном ряду']],
  'et-snc233': [['статус', 'перспективная серия, в разработке'], ['ту', 'не утверждены'], ['конструкция', 'цилиндрический соединитель'], ['сочленение', 'байонетное'], ['корпус', 'с экранированием'], ['назначение', 'коммутация цепей в РЭА']]
};

// Реальные характеристики варианта: партномер + item-поля (у конденсаторов —
// ёмкость/допуск/корпус/температура, у преобразователей — выход/мощность) +
// факты серии из SERIES_SPECS. Заменяет прежний фолбэк, при котором на карточке
// любого товара оставались статические разъёмные спеки из HTML-шаблона.
function variantSpecs(kindKey, series, item) {
  const specs = {};
  const pn = item.partnumber || splitVariantName(item)[1];
  if (pn) specs['партномер'] = pn;
  if (item.type) specs['тип'] = String(item.type).toLowerCase();
  if (kindKey === 'capacitor') {
    if (item.capacitance) specs['ёмкость'] = item.capacitance + ' пФ';
    if (item.case) specs['корпус'] = item.case;
    if (item.voltage) specs['напряжение'] = item.voltage;
    if (item.tolerance) specs['допуск'] = item.tolerance;
    if (item.temp) specs['температура'] = item.temp;
  } else if (kindKey === 'converter') {
    if (item.vout) specs['выходное напряжение'] = item.vout + ' В';
    if (item.power) specs['мощность'] = item.power + ' Вт';
  }
  (SERIES_SPECS[series.slug] || []).forEach(([k, v]) => { if (!(k in specs)) specs[k] = v; });
  const tu = item.tu || series.tu;
  if (tu && !specs['ту']) specs['ту'] = tu;
  return specs;
}

/** Catalog — search + category filter + hash routing + product list rendering.
 *  Only activates on products.html (#catalogGrid).
 *  Search: debounce 250ms, homoglyph-normalized (Latin↔Cyrillic).
 *  Hash routing: #microchips, #razemy, #converters, #capacitors, #transistors, #pcb, #rantsy, #snow, #all.
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
  // Normalize: lowercase, Latin homoglyphs → Cyrillic, ё→е fold.
  function normalize(s) {
    // NBSP → space: data strings carry literal U+00A0 (no-hanging-prepositions rule),
    // multi-word queries must still match across them.
    s = String(s == null ? '' : s).toLowerCase().replace(/ё/g, 'е').replace(/ /g, ' ');
    s = s.split('').map(ch => HOMOGLYPH[ch] || ch).join('');
    return s;
  }
  // Fuzzy substring match — handles Russian morphology by progressively
  // stripping last 1–3 chars of query (covers "микросхема"→"микросхем",
  // "разъёма"→"разъём"→"разъем"). Both sides go through normalize() first.
  function fuzzyMatch(haystack, query) {
    if (!query) return true;
    const h = normalize(haystack);
    const q = normalize(query);
    if (h.includes(q)) return true;
    if (q.length >= 5) {
      if (h.includes(q.slice(0, -1))) return true; // -1 ending
      if (h.includes(q.slice(0, -2))) return true; // -2 ending (e.g. "ой" "ая")
    }
    return false;
  }
  // cyrillize() defined at module level (top of file)
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
    pcb: 'печатные платы',
    rantsy: 'реактивные ранцы',
    snow: 'снегоуборочная техника'
  };

  // Landing-only categories (no SKU data in catalog) — the list view renders a single
  // cat-card linking to the category landing (product-detail.html#cat-X) instead of items.
  const LANDING_ONLY_CATS = {
    pcb:    { image: '../assets/images/products/pcb.webp',     alt: 'Печатные платы' },
    rantsy: { image: '../assets/images/products/jetpack.webp', alt: 'Реактивные ранцы' },
    snow:   { image: '../assets/images/products/snow.webp',    alt: 'Снегоуборочная техника' }
  };

  // Entry cards (Pencil zCPAQ "entry-cards-6cats · short copy") — first card in
  // filtered grid, leads to category landing page (#cat-X). Landing-only cats
  // (pcb / rantsy / snow) skipped: their grid tiles navigate direct to the landing.
  // Pencil zCPAQ — current version dropped sub-name suffixes (ЕТ-серии/ARC70/LDMOS).
  // Titles now match Pencil literals 1:1.
  const ENTRY_CARDS = {
    microchips:  { title: 'о&nbsp;микро&shy;схемах',         sub: 'аналоги&nbsp;· корпуса&nbsp;· применение' },
    razemy:      { title: 'о&nbsp;разъёмах',                  sub: 'приборные&nbsp;· кабельные&nbsp;· MIL-spec' },
    converters:  { title: 'о&nbsp;преобра&shy;зова&shy;телях', sub: 'ИРТЫШ&nbsp;· ВОЛГА&nbsp;· ЕНИСЕЙ&nbsp;· КАМА' },
    capacitors:  { title: 'о&nbsp;конден&shy;саторах',        sub: 'СВЧ&nbsp;· 0,1–500&nbsp;пФ' },
    transistors: { title: 'о&nbsp;транзис&shy;торах',         sub: 'S-&nbsp;· L-&nbsp;· X-диапазоны' }
  };
  const PAGE_SIZE = 12;

  // Connector type data is messy (typos like "роозетка", qualified variants like "вилка блочная",
  // accessories like "заглушка для снц144"). Bucket everything into 4 primary types so the
  // Type filter UI stays tight (без 17 опечаток).
  // Connector type normalization + image resolution — moved to module level below
  // initCatalog (need to be accessible from initProductDetail as well).

  // Get items for a single category (used by category-filter view).
  // Series items carry a `group` field (main / additional / dev) so renderList
  // can emit subsection headers (e.g. "основные серии" / "в разработке").
  // Series cards link to in-page sub-hash #cat/slug (stay on catalog, no separate Series Detail).

  // Card description for microchips/transistors — extract clean function type from specs.
  // Strips Latin parenthetical glosses ("(Power management)", "(MCU)"); sentence-cases
  // all-caps Russian; preserves Latin acronyms (LDMOS, HEMT) and short Cyrillic acronyms
  // (АЦП, ЦАП, ПЛИС, МК, ОУ). Fallback: manufacturer brand from subcategory.
  function cleanCardType(text) {
    if (!text) return '';
    let t = String(text).trim();
    // Drop parens that contain Latin chars (English gloss like "(Power management)").
    t = t.replace(/\s*\([^)]*[A-Za-z][^)]*\)/g, '').trim();
    // If all-caps Cyrillic (no lowercase Cyrillic anywhere), sentence-case it.
    if (!/[а-яё]/.test(t) && /[А-ЯЁ]/.test(t)) {
      // Lowercase everything, then re-uppercase first letter and known acronyms.
      t = t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
      // Re-uppercase known short Cyrillic acronyms (whole words only).
      t = t.replace(/\b(плис|ацп|цап|пзу|озу|оу|опн|цсп|мк|свч|экб|опк|гост|рв)\b/gi,
        (m) => m.toUpperCase());
    }
    return t;
  }
  function chipCardDesc(p) {
    const fromType = cleanCardType(p.specs && p.specs['Тип']);
    if (fromType) return fromType;
    // Fallback: drop "Микросхемы " / "СВЧ-транзисторы " prefix → just the manufacturer/family.
    const sub = (p.subcategory || '').replace(/^Микросхемы\s+/i, '').replace(/^СВЧ-транзисторы\s+/i, '');
    return cleanCardType(sub);
  }

  function getItems(cat) {
    const out = [];
    // seriesTypes — Set of normalized variant types this series contains. Used by Type-filter
    // at category level to narrow visible series to those matching the selected type.
    const collectTypes = (s) => new Set((s.items || []).map(i => normalizeType(i.type)).filter(Boolean));
    if (cat === 'razemy' && typeof CONNECTOR_SERIES !== 'undefined') {
      CONNECTOR_SERIES.forEach(s => out.push({
        type: 'series', kind: 'connector', cat: 'razemy', id: s.slug, name: s.name,
        desc: shortDesc(s.slug, s.description),
        image: s.image, group: s.group || 'main', href: `#razemy/${s.slug}`,
        seriesTypes: collectTypes(s)
      }));
    } else if (cat === 'converters' && typeof CONVERTER_SERIES !== 'undefined') {
      CONVERTER_SERIES.forEach(s => out.push({
        type: 'series', kind: 'converter', cat: 'converters', id: s.slug, name: s.name,
        desc: shortDesc(s.slug, s.description),
        image: s.image, group: s.group || 'main', href: `#converters/${s.slug}`,
        seriesTypes: collectTypes(s)
      }));
    } else if (cat === 'capacitors' && typeof CAPACITOR_SERIES !== 'undefined') {
      CAPACITOR_SERIES.forEach(s => out.push({
        type: 'series', kind: 'capacitor', cat: 'capacitors', id: s.slug, name: s.name,
        desc: shortDesc(s.slug, s.description),
        image: s.image, group: s.group || 'main', href: `#capacitors/${s.slug}`,
        seriesTypes: collectTypes(s)
      }));
    } else if (cat === 'microchips' && typeof PRODUCTS !== 'undefined') {
      PRODUCTS.filter(p => p.category === 'Микросхемы').forEach(p => out.push({
        type: 'product', kind: 'microchip', cat: 'microchips', id: p.id, name: p.name,
        desc: chipCardDesc(p), descCased: true,
        image: p.image, href: `product-detail.html#p-${p.id}`
      }));
    } else if (cat === 'transistors' && typeof PRODUCTS !== 'undefined') {
      PRODUCTS.filter(p => p.category === 'СВЧ-транзисторы').forEach(p => out.push({
        type: 'product', kind: 'transistor', cat: 'transistors', id: p.id, name: p.name,
        desc: chipCardDesc(p), descCased: true,
        image: p.image, href: `product-detail.html#p-${p.id}`
      }));
    }
    return out;
  }

  // Global search across ALL data sources (PRODUCTS + all *_SERIES + variants nested in series.items[])
  // Used when search query is active with no specific category filter.
  // User must be able to find ANY SKU by typing exact code (e.g. "ет-2рмг14б4ш1а2").
  function getAllItems() {
    const out = [
      ...getItems('razemy'),
      ...getItems('converters'),
      ...getItems('capacitors'),
      ...getItems('microchips'),
      ...getItems('transistors')
    ];
    // Also index individual SKU variants inside each series.items[]
    // Index variant SKU codes — partnumber + displayName + displaySub all included so user can find
    // exact items by typing "0R5" (capacitor partnumber) or short codes.
    const variantDesc = (it) => [
      it.type, it.tu, it.partnumber, it.displayName, it.displaySub
    ].filter(Boolean).join(' · ');

    if (typeof CONNECTOR_SERIES !== 'undefined') {
      CONNECTOR_SERIES.forEach(s => (s.items || []).forEach((it, idx) => out.push({
        type: 'variant', kind: 'connector-variant', cat: 'razemy',
        id: `${s.slug}:${idx}`, name: splitVariantName(it)[0],
        desc: variantDesc(it),
        image: resolveSeriesItemImage(s, it),
        href: `product-detail.html#v-${s.slug}:${idx}`
      })));
    }
    if (typeof CONVERTER_SERIES !== 'undefined') {
      CONVERTER_SERIES.forEach(s => (s.items || []).forEach((it, idx) => out.push({
        type: 'variant', kind: 'converter-variant', cat: 'converters',
        id: `${s.slug}:${idx}`, name: splitVariantName(it)[0],
        desc: variantDesc(it),
        image: resolveSeriesItemImage(s, it),
        href: `product-detail.html#v-${s.slug}:${idx}`
      })));
    }
    if (typeof CAPACITOR_SERIES !== 'undefined') {
      CAPACITOR_SERIES.forEach(s => (s.items || []).forEach((it, idx) => out.push({
        type: 'variant', kind: 'capacitor-variant', cat: 'capacitors',
        id: `${s.slug}:${idx}`, name: splitVariantName(it)[0],
        desc: variantDesc(it),
        image: resolveSeriesItemImage(s, it),
        href: `product-detail.html#v-${s.slug}:${idx}`
      })));
    }
    // Landing-only categories (pcb / rantsy / snow) — searchable as single entries
    // linking to the category landing (no SKU data to index).
    Object.keys(LANDING_ONLY_CATS).forEach(cat => out.push({
      type: 'landing', kind: 'landing', cat,
      id: `cat-${cat}`, name: CAT_NAMES[cat],
      desc: CAT_LIST_DESC[cat] || '',
      image: LANDING_ONLY_CATS[cat].image,
      href: `product-detail.html#cat-${cat}`
    }));
    return out;
  }

  function renderList(cat, search) {
    if (!listWrap || !listGrid) return 0;
    let items = getItems(cat);
    if (search) {
      const q = search.trim();
      items = items.filter(it => fuzzyMatch(it.name + ' ' + (it.desc || ''), q));
    }
    // Type filter at category level — narrow series to those containing at least one variant
    // of the selected type. Only applies to series (razemy / converters / capacitors).
    if (state.seriesType && state.seriesType !== 'all') {
      const t = state.seriesType.toLowerCase();
      items = items.filter(it => it.seriesTypes && it.seriesTypes.has(t));
    }
    const count = items.length;
    const catLabel = CAT_NAMES[cat] || cat;
    // listHeader (cat-breadcrumb + count) hidden — subheaders are primary headings now.
    listHeader.innerHTML = '';
    // Remove any leftover banner from previous renders.
    const existingBanner = listGrid.parentElement.querySelector('.catalog__list-banner');
    if (existingBanner) existingBanner.remove();
    listGrid.innerHTML = '';
    // Group headers logic:
    // - If category has multiple groups (e.g. razemy main+dev) → subheaders per group
    //   ("ОСНОВНЫЕ СЕРИИ (12)" / "В РАЗРАБОТКЕ (11)")
    // - If single group → one main header with category name ("МИКРОСХЕМЫ — 51 ТОВАР")
    const GROUP_LABELS = { main: 'основные серии', additional: 'дополнительные серии', dev: 'в разработке' };
    const itemWord = (n, asSeries) => asSeries
      ? pluralize(n, 'серия', 'серии', 'серий')
      : pluralize(n, 'товар', 'товара', 'товаров');
    // Count items per group
    const groupCounts = {};
    items.forEach(it => { groupCounts[it.group || 'main'] = (groupCounts[it.group || 'main'] || 0) + 1; });
    const groupKeys = Object.keys(groupCounts);
    const singleGroup = groupKeys.length <= 1;
    const itemsAreSeries = items.length && items[0].type === 'series';
    function makeSubheader(label, count) {
      const hdr = document.createElement('div');
      hdr.className = 'catalog__list-subheader';
      hdr.innerHTML = `<span class="catalog__list-subheader__title">${label}</span><span class="catalog__list-subheader__count">${count} ${itemWord(count, itemsAreSeries)}</span>`;
      return hdr;
    }
    function renderSlice(slice, isFirst) {
      let lastGroup = null;
      let entryInserted = false;
      const entry = ENTRY_CARDS[cat];
      slice.forEach((it, idx) => {
        if (singleGroup && isFirst && idx === 0) {
          // Single-group cat: use cat name as the only header
          listGrid.appendChild(makeSubheader(catLabel, count));
          lastGroup = it.group || 'main';
        } else if (!singleGroup && it.group && it.group !== lastGroup) {
          listGrid.appendChild(makeSubheader(GROUP_LABELS[it.group] || it.group, groupCounts[it.group]));
          lastGroup = it.group;
        }
        // Entry card sits FIRST (before any product card) per Pencil zCPAQ.
        // Once per render, only for first slice, only if this cat has an entry card.
        if (isFirst && entry && !entryInserted) {
          listGrid.appendChild(makeEntryCard(cat, entry));
          entryInserted = true;
        }
        listGrid.appendChild(buildCard(it));
      });
    }
    // Empty state when filter+search yields nothing — show message + offer global search.
    // SECURITY: user-controlled `q` goes through textContent/dataset (никогда innerHTML) — защита от XSS.
    if (count === 0) {
      const empty = document.createElement('div');
      empty.className = 'catalog__list-empty';
      const q = search ? search.trim() : '';
      const NBSP = ' ';
      if (q) {
        empty.append(`ничего не${NBSP}найдено по${NBSP}запросу «${q}» в${NBSP}«${catLabel}». попробуйте `);
        const a = document.createElement('a');
        a.href = '#all';
        a.dataset.globalSearch = q;
        a.textContent = `поискать во${NBSP}всех категориях`;
        empty.appendChild(a);
        empty.append('.');
      } else {
        empty.textContent = `в${NBSP}разделе «${catLabel}» пока нет товаров.`;
      }
      listGrid.appendChild(empty);
      if (listMore) listMore.hidden = true;
      return 0;
    }
    // Sort items by group (main → additional → dev)
    const groupOrder = { main: 0, additional: 1, dev: 2 };
    items.sort((a, b) => (groupOrder[a.group] ?? 9) - (groupOrder[b.group] ?? 9));
    renderSlice(items.slice(0, PAGE_SIZE), true);
    if (items.length > PAGE_SIZE) {
      listMore.hidden = false;
      let page = 1;
      listMore.onclick = () => {
        page++;
        renderSlice(items.slice(page * PAGE_SIZE - PAGE_SIZE, page * PAGE_SIZE), false);
        if (page * PAGE_SIZE >= items.length) listMore.hidden = true;
      };
    } else {
      listMore.hidden = true;
    }
    return count;
  }

  const state = { search: '', cat: 'all', series: null, seriesType: 'all', view: 'grid' };
  let searchTimer = null;
  // Both desktop sidebar filter-items[data-view] AND mobile toolbar view-link[data-view] —
  // single selector handles both, JS toggles state.view on click.
  const viewBtns = document.querySelectorAll('.filter-item[data-view], .catalog__view-link[data-view]');

  // Render arbitrary items list with search-results header
  function renderSearchResults(query) {
    const q = query.trim();
    const all = getAllItems();
    const matched = all.filter(it => fuzzyMatch(it.name + ' ' + (it.desc || ''), q));
    const count = matched.length;
    listHeader.innerHTML = `
      <span class="catalog__list-cat">результаты поиска</span>
      <span class="catalog__list-count">${count} ${pluralize(count, 'результат', 'результата', 'результатов')}</span>
    `;
    listGrid.innerHTML = '';
    if (count === 0) {
      const empty = document.createElement('div');
      empty.className = 'catalog__list-empty';
      // SECURITY: user-controlled `query` через textContent (никогда innerHTML).
      const NBSP = ' ';
      empty.append(`ничего не${NBSP}найдено по${NBSP}запросу «${query}». попробуйте другой запрос или${NBSP}`);
      const a = document.createElement('a');
      a.href = '#all';
      a.textContent = `вернитесь к${NBSP}категориям`;
      empty.appendChild(a);
      empty.append('.');
      listGrid.appendChild(empty);
      if (listMore) listMore.hidden = true;
      return 0;
    }
    const shown = matched.slice(0, PAGE_SIZE);
    shown.forEach(it => listGrid.appendChild(buildCard(it)));
    if (matched.length > PAGE_SIZE) {
      listMore.hidden = false;
      let page = 1;
      listMore.onclick = () => {
        page++;
        matched.slice(page * PAGE_SIZE - PAGE_SIZE, page * PAGE_SIZE).forEach(it => listGrid.appendChild(buildCard(it)));
        if (page * PAGE_SIZE >= matched.length) listMore.hidden = true;
      };
    } else {
      listMore.hidden = true;
    }
    return count;
  }

  function buildCard(it) {
    const a = document.createElement('a');
    a.className = 'cat-card cat-card--small' + (it.group === 'dev' ? ' cat-card--dev' : '');
    a.href = it.href;
    // Product codes in UPPERCASE (ЕТ-СНЦ23, ЕТ1310РН1У — they're abbreviations/model codes).
    // Series cards keep lowercase desc (legacy brand voice for SERIES_SHORT_DESC); microchip/
    // transistor cards with descCased:true preserve sentence-case from chipCardDesc().
    const descText = it.desc
      ? (it.descCased ? cyrillize(it.desc) : cyrillize(it.desc).toLowerCase())
      : '';
    a.innerHTML = `
      <div class="cat-card__img">
        ${it.image ? `<img src="${it.image}" alt="${it.name}" loading="lazy" onerror="this.style.opacity='0'">` : ''}
      </div>
      <div class="cat-card__info">
        <h3 class="cat-card__name">${cyrillize(it.name)}</h3>
        ${descText ? `<p class="cat-card__desc">${descText}</p>` : ''}
      </div>
    `;
    return a;
  }

  // Entry card (Pencil zCPAQ): text-only first card linking to category landing.
  // Structure per spec: 228w outer, top 228h block (caption + title + spacer + sub),
  // bottom CTA "перейти к описанию →".
  function makeEntryCard(cat, entry) {
    const a = document.createElement('a');
    a.className = 'cat-card cat-card--entry';
    a.href = `product-detail.html#cat-${cat}`;
    // Pencil zCPAQ bottom row cBPoU: flex space-between, top border 1px D7D3CB, padding [12,0,0,0],
    // "перейти к описанию" LEFT and "→" RIGHT — both 15/500 #112F6E.
    a.innerHTML = `
      <div class="cat-card--entry__top">
        <span class="cat-card--entry__caption">обзор раздела</span>
        <h3 class="cat-card--entry__title">${entry.title}</h3>
        <div class="cat-card--entry__spacer"></div>
        <span class="cat-card--entry__sub">${entry.sub}</span>
      </div>
      <span class="cat-card--entry__cta">
        <span class="cat-card--entry__cta-label">перейти к&nbsp;описанию</span>
        <span class="cat-card--entry__cta-arrow" aria-hidden="true">→</span>
      </span>
    `;
    return a;
  }

  // Render variants of a single series in 4-col grid (replaces Series Detail page)
  function renderSeriesVariants(cat, slug) {
    let series = null, prefix = '', catLabel = CAT_NAMES[cat] || cat;
    if (cat === 'razemy' && typeof CONNECTOR_SERIES !== 'undefined') {
      series = CONNECTOR_SERIES.find(s => s.slug === slug);
      prefix = 's-c';
    } else if (cat === 'converters' && typeof CONVERTER_SERIES !== 'undefined') {
      series = CONVERTER_SERIES.find(s => s.slug === slug);
      prefix = 's-v';
    } else if (cat === 'capacitors' && typeof CAPACITOR_SERIES !== 'undefined') {
      series = CAPACITOR_SERIES.find(s => s.slug === slug);
      prefix = 's-k';
    }
    if (!series) return 0;
    const seriesName = cyrillize(series.name);
    const allItems = series.items || [];
    // Series-view sidebar gets a Type filter (вилка/розетка/…). Filter active selection
    // narrows the rendered cards (match against normalized type buckets).
    const activeType = (state.seriesType && state.seriesType !== 'all') ? state.seriesType : null;
    const items = activeType ? allItems.filter(it => normalizeType(it.type) === activeType) : allItems;
    const count = items.length;
    // Header: series name (left) + variant count (right) — same .catalog__list-subheader pattern
    // as the category view ("разъёмы — 24 серии"). No back-arrow; sidebar navigation moves the
    // user back to the category list via the active category filter.
    listHeader.innerHTML = '';
    listGrid.innerHTML = '';
    const titleHdr = document.createElement('div');
    titleHdr.className = 'catalog__list-subheader';
    titleHdr.innerHTML = `<span class="catalog__list-subheader__title">${seriesName}</span><span class="catalog__list-subheader__count">${count} ${pluralize(count, 'вариант', 'варианта', 'вариантов')}</span>`;
    listGrid.appendChild(titleHdr);
    function makeVariantCard(it) {
      const card = document.createElement('a');
      card.className = 'cat-card cat-card--small';
      // idx is the position in the UNFILTERED items[] — preserves correct variant page link
      // regardless of type filter ("вилка" / "розетка") narrowing the rendered list.
      const origIdx = allItems.indexOf(it);
      card.href = `product-detail.html#v-${slug}:${origIdx}`;
      // Image lookup via shared helper (series.imageByType → normalized match →
      // GENERIC_TYPE_IMAGES fallback → series.image).
      const img = resolveSeriesItemImage(series, it);
      // Compact name + part-number sub (fixes overflowing converter/capacitor names).
      const [vName, vSub] = splitVariantName(it);
      const vDesc = [it.type ? cyrillize(it.type).toLowerCase() : '', vSub ? cyrillize(vSub) : '']
        .filter(Boolean).join(' · ');
      card.innerHTML = `
        <div class="cat-card__img">
          ${img ? `<img src="${img}" alt="${it.name}" loading="lazy" onerror="this.style.opacity='0'">` : ''}
        </div>
        <div class="cat-card__info">
          <h3 class="cat-card__name">${cyrillize(vName)}</h3>
          ${vDesc ? `<p class="cat-card__desc">${vDesc}</p>` : ''}
        </div>
      `;
      return card;
    }
    items.slice(0, PAGE_SIZE).forEach(it => listGrid.appendChild(makeVariantCard(it)));
    if (items.length > PAGE_SIZE) {
      listMore.hidden = false;
      let page = 1;
      listMore.onclick = () => {
        page++;
        items.slice(page * PAGE_SIZE - PAGE_SIZE, page * PAGE_SIZE).forEach(it => {
          listGrid.appendChild(makeVariantCard(it));
        });
        if (page * PAGE_SIZE >= items.length) listMore.hidden = true;
      };
    } else {
      listMore.hidden = true;
    }
    return count;
  }

  // Render category rows (one per catalog category) for list view at cat=all (Pencil rN0pk default state).
  // Each row: name + short desc + → arrow. Click navigates to that category.
  // Literal NBSP ( ) after short prepositions — no-hanging-prepositions rule.
  // Entities (&nbsp;) would pollute the search haystack; normalize() folds   → space.
  const CAT_LIST_DESC = {
    microchips:  'цифровые и аналоговые микросхемы',
    razemy:      '23 серии ЕТ для ответственных применений',
    converters:  'преобразователи напряжения dc/dc · ac/dc',
    capacitors:  'свч-конденсаторы arc70 · аналог atc',
    transistors: 'свч-транзисторы ldmos для усилителей мощности',
    pcb:         'печатные платы одно- · двух- · многослойные',
    rantsy:      'турбореактивные ранцы для спасательных и промышленных задач',
    snow:        'снегоуборочная техника для экстремальных условий'
  };
  function renderCategoryListRows() {
    if (!listGrid) return;
    listHeader.innerHTML = '';
    const existingBanner = listGrid.parentElement.querySelector('.catalog__list-banner');
    if (existingBanner) existingBanner.remove();
    listGrid.innerHTML = '';
    if (listMore) listMore.hidden = true;
    ['microchips', 'razemy', 'converters', 'capacitors', 'transistors', 'pcb', 'rantsy', 'snow'].forEach(cat => {
      const row = document.createElement('a');
      row.className = 'cat-card cat-card--small';
      row.href = `#${cat}`;
      row.innerHTML = `
        <div class="cat-card__img"></div>
        <div class="cat-card__info">
          <h3 class="cat-card__name">${CAT_NAMES[cat]}</h3>
          <p class="cat-card__desc">${CAT_LIST_DESC[cat]}</p>
        </div>
      `;
      listGrid.appendChild(row);
    });
  }

  // Render sidebar Type filter (вилка / розетка / …).
  // Two modes:
  //   - Series view (cat + slug): types come from that series' items[]. Narrows variant cards.
  //   - Category view (cat only): types are the union across all series in the category.
  //     Narrows the rendered series cards (keep those with at least one variant of that type).
  // Hidden for categories without a series structure (microchips / transistors / pcb).
  function renderTypeFilter(cat, slug) {
    const group = document.getElementById('typeFilterGroup');
    const itemsEl = document.getElementById('typeFilterItems');
    if (!group || !itemsEl) return;
    const seriesSource = cat === 'razemy' && typeof CONNECTOR_SERIES !== 'undefined' ? CONNECTOR_SERIES
                       : cat === 'converters' && typeof CONVERTER_SERIES !== 'undefined' ? CONVERTER_SERIES
                       : cat === 'capacitors' && typeof CAPACITOR_SERIES !== 'undefined' ? CAPACITOR_SERIES
                       : null;
    if (!seriesSource) {
      group.hidden = true;
      return;
    }
    let types;
    if (slug) {
      // Series mode — types from this series only (normalized).
      const series = seriesSource.find(s => s.slug === slug);
      if (!series || !Array.isArray(series.items)) { group.hidden = true; return; }
      types = [...new Set(series.items.map(i => normalizeType(i.type)).filter(Boolean))];
    } else {
      // Category mode — union of normalized types across all series in this category.
      const allTypes = new Set();
      seriesSource.forEach(s => (s.items || []).forEach(it => { const n = normalizeType(it.type); if (n) allTypes.add(n); }));
      types = [...allTypes];
    }
    if (types.length < 2) {
      // Only one type (or none) — filter not useful.
      group.hidden = true;
      return;
    }
    group.hidden = false;
    itemsEl.innerHTML = '';
    const all = document.createElement('button');
    all.type = 'button';
    all.className = 'filter-item' + (state.seriesType === 'all' ? ' filter-item--active' : '');
    all.dataset.type = 'all';
    all.textContent = 'все';
    itemsEl.appendChild(all);
    types.forEach(t => {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isActive = state.seriesType === t;
      btn.className = 'filter-item' + (isActive ? ' filter-item--active' : '');
      btn.dataset.type = t;
      btn.textContent = t;
      itemsEl.appendChild(btn);
    });
    // Wire clicks (delegated via fresh handler each render — innerHTML wipes previous listeners)
    itemsEl.querySelectorAll('.filter-item').forEach(b => {
      b.addEventListener('click', () => {
        state.seriesType = b.dataset.type || 'all';
        apply();
      });
    });
  }

  function apply() {
    const q = normalize(state.search.trim());
    const inListMode = state.cat !== 'all';
    const inSearchMode = !inListMode && !!state.search.trim();
    const inSeriesMode = inListMode && !!state.series;

    if (inSeriesMode) {
      // Series variant grid (no separate Series Detail page)
      grid.hidden = true;
      listWrap.hidden = false;
      renderSeriesVariants(state.cat, state.series);
      if (emptyMsg) emptyMsg.hidden = true;
      renderTypeFilter(state.cat, state.series);
    } else if (inSearchMode) {
      // Global search mode: hide cat-cards, render matches across ALL data
      grid.hidden = true;
      listWrap.hidden = false;
      renderSearchResults(state.search);
      // Remove any banner from previous renders
      const existingBanner = listGrid.parentElement.querySelector('.catalog__list-banner');
      if (existingBanner) existingBanner.remove();
      if (emptyMsg) emptyMsg.hidden = true;
    } else if (inListMode) {
      // List view: hide cat-cards, render category items.
      // renderList() handles its own empty-state UI (contextual message + global-search fallback link).
      // Special case: landing-only categories (pcb / rantsy / snow) have no products in
      // catalog → render ONE regular cat-card-row (looks identical to other list rows /
      // grid cards) pointing to the landing page.
      grid.hidden = true;
      listWrap.hidden = false;
      const count = renderList(state.cat, state.search);
      const landingOnly = LANDING_ONLY_CATS[state.cat];
      if (count === 0 && landingOnly && !state.search) {
        const card = document.createElement('a');
        card.className = 'cat-card cat-card--small';
        card.href = `product-detail.html#cat-${state.cat}`;
        card.innerHTML = `
          <div class="cat-card__img">
            <img width="1200" height="1200" src="${landingOnly.image}" alt="${landingOnly.alt}" loading="lazy" onerror="this.style.opacity='0'">
          </div>
          <div class="cat-card__info">
            <h3 class="cat-card__name">${CAT_NAMES[state.cat]}</h3>
            <p class="cat-card__desc">перейти к&nbsp;описанию категории</p>
          </div>
        `;
        listGrid.innerHTML = '';
        listGrid.appendChild(card);
        if (listMore) listMore.hidden = true;
      }
      if (emptyMsg) emptyMsg.hidden = true;
      // Type filter at category level — visible for series-based cats (razemy/converters/capacitors).
      renderTypeFilter(state.cat, null);
    } else if (state.view === 'list') {
      // Default (cat=all, no search) + list view → category rows per Pencil rN0pk.
      grid.hidden = true;
      listWrap.hidden = false;
      renderCategoryListRows();
      if (emptyMsg) emptyMsg.hidden = true;
    } else {
      // Default view: all cat-cards visible
      grid.hidden = false;
      listWrap.hidden = true;
      cards.forEach(card => { card.hidden = false; });
      if (emptyMsg) emptyMsg.hidden = true;
    }

    // Hide Type filter when leaving series-based categories (microchips/transistors/pcb/all).
    if (!inSeriesMode && !inListMode) {
      const tg = document.getElementById('typeFilterGroup');
      if (tg) tg.hidden = true;
      state.seriesType = 'all';
    } else if (inListMode && !['razemy', 'converters', 'capacitors'].includes(state.cat)) {
      const tg = document.getElementById('typeFilterGroup');
      if (tg) tg.hidden = true;
      state.seriesType = 'all';
    }

    // Update active state on sidebar + pills — marker (•)/( ) rendered via CSS ::before
    sidebarBtns.forEach(b => {
      b.classList.toggle('filter-item--active', b.dataset.cat === state.cat);
    });
    pillBtns.forEach(b => b.classList.toggle('catalog__pill--active', b.dataset.cat === state.cat));

    // View toggle (сетка/список) — applies class to list grid. Active state on
    // both desktop sidebar (.filter-item--active) and mobile toolbar (.catalog__view-link--active).
    listGrid.classList.toggle('catalog__list-grid--list', state.view === 'list');
    viewBtns.forEach(b => {
      const isActive = b.dataset.view === state.view;
      b.classList.toggle('filter-item--active', isActive);
      b.classList.toggle('catalog__view-link--active', isActive);
    });

    const activeCount = (state.search ? 1 : 0) + (state.cat !== 'all' ? 1 : 0) + (state.seriesType && state.seriesType !== 'all' ? 1 : 0);
    if (clearBadge) clearBadge.textContent = String(activeCount);

    let hash = '';
    if (state.cat !== 'all') hash = `#${state.cat}`;
    if (state.series) hash += `/${state.series}`;
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

  // Clicking sidebar/pill clears any series sub-state too
  sidebarBtns.forEach(btn => btn.addEventListener('click', () => { state.series = null; state.seriesType = 'all'; setCat(btn.dataset.cat); }));
  pillBtns.forEach(btn => btn.addEventListener('click', () => { state.series = null; state.seriesType = 'all'; setCat(btn.dataset.cat); }));
  viewBtns.forEach(btn => btn.addEventListener('click', () => { state.view = btn.dataset.view; apply(); }));

  // Application filter — visual radio selection (data not tagged with applications;
  // matches v1 site UX: groups are presented but don't narrow the grid).
  const appBtns = document.querySelectorAll('.catalog__sidebar .filter-item[data-app]');
  appBtns.forEach(btn => btn.addEventListener('click', () => {
    appBtns.forEach(b => b.classList.toggle('filter-item--active', b === btn));
  }));

  // Global-search fallback link inside empty-state (delegated to listGrid).
  // Clicking "поискать во всех категориях" clears filter + keeps query.
  listGrid.addEventListener('click', (e) => {
    const link = e.target.closest('[data-global-search]');
    if (!link) return;
    e.preventDefault();
    const q = link.getAttribute('data-global-search') || '';
    state.cat = 'all';
    state.series = null;
    state.seriesType = 'all';
    state.search = q;
    searchInputs.forEach(i => i.value = q);
    history.replaceState(null, '', '#all');
    apply();
  });

  // Collapsible filter groups — click on header toggles items below (Pencil J1dha chevron).
  // Sidebar groups (desktop) default OPEN; toolbar groups (mobile) default CLOSED.
  document.querySelectorAll('.filter-group__header').forEach(hdr => {
    const group = hdr.closest('.filter-group');
    if (!group) return;
    const items = group.querySelector('.filter-group__items');
    if (!items) return;
    // Initial state from data-collapsed attribute (set by CSS media query elsewhere if needed)
    hdr.style.cursor = 'pointer';
    hdr.setAttribute('role', 'button');
    hdr.setAttribute('aria-expanded', 'true');
    hdr.addEventListener('click', () => {
      const open = hdr.getAttribute('aria-expanded') === 'true';
      hdr.setAttribute('aria-expanded', open ? 'false' : 'true');
      group.classList.toggle('filter-group--collapsed', open);
    });
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      state.search = '';
      state.cat = 'all';
      state.series = null;
      state.seriesType = 'all';
      searchInputs.forEach(i => i.value = '');
      apply();
    });
  }

  const validCats = ['all', 'microchips', 'razemy', 'converters', 'capacitors', 'transistors', 'pcb', 'rantsy', 'snow'];
  function applyHash() {
    const h = window.location.hash.replace('#', '');
    // Support sub-hash: #razemy/et-2rmg (category + series slug)
    const [hCat, hSeries] = h.split('/');
    if (hCat && hCat !== 'search' && validCats.includes(hCat)) {
      // Reset type filter when category OR series changes — selected type may not exist
      // in the new context (e.g. "заглушка" set at #razemy but next series has only вилка/розетка).
      const newSeries = hSeries || null;
      if (state.cat !== hCat || state.series !== newSeries) state.seriesType = 'all';
      state.cat = hCat;
      state.series = newSeries;
      apply();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (!h || h === 'search') {
      state.cat = 'all';
      state.series = null;
      state.seriesType = 'all';
      apply();
    }
  }
  applyHash();
  window.addEventListener('hashchange', applyHash);

  // Read ?q=<query> URL param (set by mobile menu search submit) and apply on load.
  const urlParams = new URLSearchParams(window.location.search);
  const qParam = urlParams.get('q');
  if (qParam) {
    state.search = qParam;
    searchInputs.forEach(i => i.value = qParam);
    apply();
  }
}


/** Category Landing pages — Pencil v4 spec.
 *  Frames: fh0MA microchips / tUie5 razemy / USmAk converters / njeyO capacitors /
 *  DA6LB transistors / Py4Cq pcb (Desktop). Mobile: HPQvI / X61Pn / zyxIp / BqfNx / PtnRv / YpDYC.
 *  Each: H1 + breadcrumb + subtitle / pd-image + 2 desc paragraphs + bullets list + CTA /
 *  nomenclature 9-row table / related 3 other cats. */
const CATEGORY_LANDINGS = {
  microchips: {
    name: 'микросхемы',
    eyebrowCategory: ['microchips', 'микросхемы'],
    subtitle: 'цифровые и&nbsp;аналоговые ис&nbsp; ·&nbsp; 51 позиция&nbsp; ·&nbsp; аналоги импортных компонентов',
    image: '../assets/images/products/items/ET1310PN1U.webp',
    description: [
      'поставляем цифровые и&nbsp;аналоговые интегральные микросхемы для&nbsp;ответственных применений: ацп/цап, сигнальные процессоры (цсп), микроконтроллеры, интерфейсные и&nbsp;драйверные ис, dc/dc-контроллеры, линейные стабилизаторы, операционные усилители, компараторы и&nbsp;источники опорного напряжения.',
      'номенклатура включает как&nbsp;массовые серии, так&nbsp;и&nbsp;специализированные компоненты под&nbsp;бортовую, измерительную и&nbsp;промышленную аппаратуру. подбираем функциональные аналоги снятых с&nbsp;производства или&nbsp;попавших под&nbsp;санкции импортных микросхем.'
    ],
    bullets: [
      ['цифровые ис', 'логика, регистры, дешифраторы'],
      ['процессоры',  'микроконтроллеры, цсп, плис'],
      ['ацп / цап',   'разрядность 8–24&nbsp;бит, sar, Σ-Δ'],
      ['усилители',   'оу, инструментальные, компараторы']
    ],
    nomenclature: [
      ['цифровые ис',  'логика, счётчики, регистры, дешифраторы'],
      ['процессоры',   'микроконтроллеры, цсп, плис'],
      ['ацп / цап',    'разрядность 8–24&nbsp;бит, sar, Σ-Δ'],
      ['усилители',    'оу, инструментальные, компараторы'],
      ['питание',      'ldo, dc/dc-контроллеры, супервизоры'],
      ['интерфейсы',   'rs-232/485, can, spi, i²c, lvds'],
      ['память',       'sram, eeprom, flash, fram'],
      ['исполнения',   'коммерческое, индустриальное, «5»'],
      ['корпуса',      'dip, soic, qfp, qfn, bga, металлокерамика']
    ]
  },
  razemy: {
    name: 'разъёмы',
    eyebrowCategory: ['razemy', 'разъёмы'],
    subtitle: 'герметичные блочные ет-серии&nbsp; ·&nbsp; более 1500&nbsp;позиций&nbsp; ·&nbsp; замена 2рмг&nbsp;/ 2рмт&nbsp;/ снц&nbsp;/ шр',
    image: '../assets/images/products/connectors/et-snc28.webp',
    description: [
      'поставляем герметичные блочные разъёмы ет-серии для&nbsp;бортовой и&nbsp;наземной аппаратуры. цилиндрические низкочастотные соединители 2рмг(д)&nbsp;/ 2рмт&nbsp;/ 2рмдт&nbsp;/ 2ртт&nbsp;/ шр&nbsp;/ снц23&nbsp;/ снц28&nbsp;/ снц144&nbsp;/ онц-бс&nbsp;/ ррс&nbsp;/ рс(г)&nbsp;/ мр1, а&nbsp;также заглушки эк&nbsp;/ эп.',
      'функциональные аналоги изделий 2рм&nbsp;/ 2рмгд&nbsp;/ шр&nbsp;/ снц по&nbsp;ткес.434410.039, 016, 005, 014 и&nbsp;др. рабочая температура −60…+200&nbsp;°с, напряжение до&nbsp;560&nbsp;в, число контактов 4–50, ресурс 500&nbsp;циклов.'
    ],
    bullets: [
      ['цилиндрические', 'блочные 2рмг(д), розетки 2рмт&nbsp;/ 2рмдт'],
      ['снц-серии',      'снц23&nbsp;· снц28&nbsp;· снц127&nbsp;· снц144'],
      ['шр и&nbsp;онц-бс',     'кабельные и&nbsp;приборные соединители'],
      ['ррс, рс(г), мр1','розетки экранированные, заглушки эк&nbsp;/ эп']
    ],
    nomenclature: [
      ['серии',       '12 основных серий ет + 12 в&nbsp;разработке'],
      ['контакты',    'от&nbsp;4 до&nbsp;50, шаг 3,5–6&nbsp;мм'],
      ['напряжение',  'до&nbsp;560&nbsp;в, ток до&nbsp;25&nbsp;а'],
      ['температура', '−60…+200&nbsp;°с (испол. ухл)'],
      ['вибрация',    '5–5000&nbsp;гц при&nbsp;50g'],
      ['удар',        'одиночный 500g, многократный 100g'],
      ['покрытия',    'золото, серебро, химический никель'],
      ['ту',          'ткес.434410.039 / 016 / 005 / 014 / 049'],
      ['ресурс',      '500 циклов, срок хранения 7&nbsp;лет']
    ]
  },
  converters: {
    name: 'преобразователи',
    eyebrowCategory: ['converters', 'преобразователи напряжения'],
    subtitle: 'dc/dc модульные&nbsp; ·&nbsp; 626 позиций&nbsp; ·&nbsp; pin-to-pin замена vicor',
    image: '../assets/images/products/items/Irtysh.webp',
    description: [
      'поставляем модульные dc/dc-преобразователи серий иртыш, волга, енисей и&nbsp;кама с&nbsp;полной pin-to-pin совместимостью с&nbsp;продукцией vicor. применяются в&nbsp;бортовых системах электропитания, промышленной автоматике, средствах связи и&nbsp;специальной аппаратуре.',
      'входные напряжения 24, 28, 300 и&nbsp;375&nbsp;в, выходные 3,3–48&nbsp;в, мощность 50–600&nbsp;вт. форм-факторы 1/2, 1/4&nbsp;brick и&nbsp;full&nbsp;brick 117×55,9×12,7&nbsp;мм. три температурных исполнения: c, h, m с&nbsp;верхней границей +100&nbsp;°с.'
    ],
    bullets: [
      ['иртыш',  '370 позиций dc/dc&nbsp;· vin&nbsp;24/28/300/375&nbsp;в'],
      ['волга',  '124 позиции&nbsp;· мощность 50–500&nbsp;вт'],
      ['енисей', '80 позиций&nbsp;· промышленный диапазон'],
      ['кама',   '52 позиции&nbsp;· компактные модули']
    ],
    nomenclature: [
      ['серии',         'иртыш&nbsp;· волга&nbsp;· енисей&nbsp;· кама'],
      ['входные',       '24&nbsp;в (18–36), 28&nbsp;в (9–36), 300&nbsp;в (180–375), 375&nbsp;в (250–425)'],
      ['выходные',      '3,3&nbsp;/ 5&nbsp;/ 8&nbsp;/ 12&nbsp;/ 15&nbsp;/ 24&nbsp;/ 28&nbsp;/ 36&nbsp;/ 48&nbsp;в'],
      ['мощность',      '50–600&nbsp;вт'],
      ['форм-фактор',   '1/2&nbsp;brick, 1/4&nbsp;brick, full&nbsp;brick 117×55,9×12,7&nbsp;мм'],
      ['температура',   'c (−20…+100), h (−40…+100), m (−55…+100&nbsp;°с)'],
      ['совместимость', 'pin-to-pin с&nbsp;vicor'],
      ['применение',    'опк, авиация, космос, телекоммуникации'],
      ['позиций',       '626 в&nbsp;каталоге']
    ]
  },
  capacitors: {
    name: 'свч-конденсаторы',
    eyebrowCategory: ['capacitors', 'свч-конденсаторы'],
    subtitle: 'mlcc серии arc70&nbsp; ·&nbsp; 273 позиции&nbsp; ·&nbsp; аналог atc&nbsp;100a&nbsp;/ 100c&nbsp;/ 100e',
    image: '../assets/images/products/capacitors.webp',
    description: [
      'поставляем многослойные керамические свч-конденсаторы (mlcc) серий arc70a, arc70c и&nbsp;arc70e&nbsp;— прямые функциональные аналоги american technical ceramics atc&nbsp;100a, 100c, 100e из&nbsp;тех&nbsp;же материалов.',
      'корпус 0505, ёмкость 0,1–1000&nbsp;пф, рабочее напряжение 150 или&nbsp;300&nbsp;в, температура −55…+200&nbsp;°с. применяются в&nbsp;усилителях мощности, задающих генераторах, согласующих цепях и&nbsp;свч-фильтрах.'
    ],
    bullets: [
      ['arc70a',     '86 позиций&nbsp;· аналог atc&nbsp;100a'],
      ['arc70c',     '90 позиций&nbsp;· аналог atc&nbsp;100c'],
      ['arc70e',     '97 позиций&nbsp;· аналог atc&nbsp;100e'],
      ['применение', 'усилители мощности, генераторы, фильтры']
    ],
    nomenclature: [
      ['серии',       'arc70a&nbsp;· arc70c&nbsp;· arc70e'],
      ['ёмкость',     '0,1–1000&nbsp;пф'],
      ['корпус',      '0505'],
      ['напряжение',  '150&nbsp;в (код 151) или&nbsp;300&nbsp;в (код 301)'],
      ['температура', '−55…+200&nbsp;°с'],
      ['допуск',      '±0,05&nbsp;пф … ±0,5&nbsp;пф'],
      ['аналог',      'atc 100a&nbsp;· 100c&nbsp;· 100e'],
      ['ту',          'ткес.434410.002 ту'],
      ['позиций',     '273 в&nbsp;каталоге']
    ]
  },
  transistors: {
    name: 'свч-транзисторы',
    eyebrowCategory: ['transistors', 'свч-транзисторы'],
    subtitle: 'ldmos для&nbsp;усилителей мощности&nbsp; ·&nbsp; до&nbsp;киловатт&nbsp; ·&nbsp; частоты до&nbsp;ггц',
    image: '../assets/images/products/transistors.webp',
    description: [
      'мощные свч-транзисторы ldmos (laterally diffused mos)&nbsp;— полевые транзисторы с&nbsp;боковой диффузией, оптимизированные для&nbsp;работы на&nbsp;высоких частотах и&nbsp;больших уровнях мощности.',
      'архитектура ldmos обеспечивает высокий кпд, линейность передаточной характеристики и&nbsp;устойчивость к&nbsp;рассогласованию нагрузки. кристаллы и&nbsp;корпусные приборы с&nbsp;выходной мощностью от&nbsp;единиц ватт до&nbsp;киловатт, рабочее напряжение 28–50&nbsp;в.'
    ],
    bullets: [
      ['ldmos',      'от&nbsp;единиц вт до&nbsp;квт'],
      ['технология', 'ldmos (кремний), gan на&nbsp;sic'],
      ['частоты',    'вч&nbsp;/ увч&nbsp;/ свч до&nbsp;нескольких ггц'],
      ['корпуса',    'металлокерамика, фланцевые, smd']
    ],
    nomenclature: [
      ['технология',           'ldmos (кремний)'],
      ['частотный диапазон',   'вч&nbsp;/ увч&nbsp;/ свч, до&nbsp;нескольких ггц'],
      ['выходная мощность',    'от&nbsp;единиц вт до&nbsp;квт'],
      ['напряжение питания',   '28&nbsp;в&nbsp;/ 32&nbsp;в&nbsp;/ 50&nbsp;в'],
      ['режим работы',         'cw, импульсный'],
      ['класс усиления',       'a, ab, c, d'],
      ['корпуса',              'металлокерамика, фланцевые, smd'],
      ['применение',           'связь, радиолокация, ism, медтехника'],
      ['форм-фактор',          'кристалл&nbsp;/ корпусной прибор']
    ]
  },
  pcb: {
    name: 'печатные платы',
    eyebrowCategory: ['pcb', 'печатные платы'],
    subtitle: 'проектирование и&nbsp;производство под&nbsp;заказ&nbsp; ·&nbsp; до&nbsp;40&nbsp;слоёв&nbsp; ·&nbsp; класс точности до&nbsp;6',
    image: '../assets/images/products/pcb.webp',
    description: [
      'проектируем и&nbsp;изготавливаем печатные платы под&nbsp;задачу заказчика: опп, дпп, многослойные до&nbsp;40 слоёв, свч-платы, гибкие и&nbsp;гибко-жёсткие конструкции, а&nbsp;также платы на&nbsp;алюминиевом и&nbsp;медном основании.',
      'выполняем обратное проектирование топологии (сколка) без&nbsp;документации, слепые и&nbsp;скрытые переходные отверстия, металлизацию торцов и&nbsp;вырезов, заполнение отверстий проводящим или&nbsp;непроводящим компаундом.'
    ],
    bullets: [
      ['опп&nbsp;· дпп&nbsp;· мпп',     'до&nbsp;40 слоёв со&nbsp;слепыми и&nbsp;скрытыми переходами'],
      ['свч и&nbsp;гибкие',          'rogers, taconic, arlon, полиимидные основания'],
      ['класс точности',       'до&nbsp;6 по&nbsp;ГОСТ&nbsp;Р&nbsp;53429-2009, ipc&nbsp;class 2&nbsp;/ 3'],
      ['обратное проектирование','восстановление топологии готовой платы без&nbsp;документации']
    ],
    nomenclature: [
      ['типы плат',         'опп, дпп, мпп, свч, гибкие, гибко-жёсткие'],
      ['кол-во слоёв',      '1–40'],
      ['класс точности',    'до&nbsp;6 по&nbsp;ГОСТ&nbsp;Р&nbsp;53429-2009, ipc&nbsp;class 2&nbsp;/ 3'],
      ['проводник / зазор', 'от&nbsp;0,07&nbsp;мм'],
      ['отверстия',         'от&nbsp;0,1&nbsp;мм, соотношение 1:10&nbsp;— 1:20'],
      ['толщина платы',     '0,1–6,0&nbsp;мм, фольга 5–150&nbsp;мкм'],
      ['материалы',         'fr-4, high&nbsp;tg, rogers, taconic, arlon, isola, алюминий, медь'],
      ['покрытия',          'hasl, lead&nbsp;free, ni-au, enepig, иммерс. sn&nbsp;/ ag, осп'],
      ['контроль качества', 'адаптерный и&nbsp;летающий щуп, aoi, контроль импеданса ±5&nbsp;/ 10%']
    ]
  },
  // rantsy / snow — по правкам заказчика (2026-07-11): H1 и предложения с заглавной,
  // области применения и цикл испытаний отдельными абзацами, блок (03) переименован
  // в «Характеристики» (bulletsTitle) с рядами Масса/Тяга/Мощность/Скорость.
  rantsy: {
    name: 'Реактивные ранцы',
    eyebrowCategory: ['rantsy', 'реактивные ранцы'],
    subtitle: 'Турбореактивный ранец 20–25&nbsp;кг&nbsp; ·&nbsp; Тяга 80&nbsp;кг&nbsp; ·&nbsp; Скорость до&nbsp;100&nbsp;км/ч&nbsp; ·&nbsp; Производство с&nbsp;сентября 2026',
    image: '../assets/images/products/jetpack.webp',
    bulletsTitle: 'Характеристики',
    description: [
      'Поставляем реактивные ранцы для&nbsp;аварийно-спасательных служб, промышленной инспекции и&nbsp;индустрии развлечений. Лёгкий турбореактивный ранец массой 20–25&nbsp;кг развивает тяговое усилие 80&nbsp;кг при&nbsp;мощности 250–300&nbsp;л.с. и&nbsp;скорости до&nbsp;100&nbsp;км/ч.',
      'Области применения: тушение пожаров в&nbsp;высотных зданиях, горно-спасательные работы, инспекция объектов энергетики и&nbsp;нефтегазовой отрасли, шоу и&nbsp;спецэффекты для&nbsp;кино.',
      'Технологический цикл разработки и&nbsp;полевых испытаний завершён. Старт серийного производства запланирован на&nbsp;сентябрь 2026 года.'
    ],
    bullets: [
      ['Масса',           '20–25&nbsp;кг'],
      ['Тяговое усилие',  '80&nbsp;кг'],
      ['Мощность',        '250–300&nbsp;л.с.'],
      ['Скорость',        'До&nbsp;100&nbsp;км/ч']
    ],
    nomenclature: [
      ['Масса',           '20–25&nbsp;кг'],
      ['Тяговое усилие',  '80&nbsp;кг'],
      ['Мощность',        '250–300&nbsp;л.с.'],
      ['Скорость',        'До&nbsp;100&nbsp;км/ч'],
      ['Время полёта',    '5–10&nbsp;минут'],
      ['Расход топлива',  '2–4&nbsp;л на&nbsp;100&nbsp;км'],
      ['Двигатель',       'Турбореактивный'],
      ['Статус',          'Разработка и&nbsp;испытания завершены'],
      ['Производство',    'Старт — сентябрь 2026 года']
    ]
  },
  snow: {
    name: 'Снегоуборочная техника',
    eyebrowCategory: ['snow', 'снегоуборочная техника'],
    subtitle: 'Профессиональная уборка снега&nbsp; ·&nbsp; Тяга 80&nbsp;кг&nbsp; ·&nbsp; Металлический корпус&nbsp; ·&nbsp; 56 машин за&nbsp;2025 год',
    image: '../assets/images/products/snow.webp',
    bulletsTitle: 'Характеристики',
    description: [
      'Поставляем снегоуборочную технику для&nbsp;работы в&nbsp;экстремальных погодных условиях: очистка территорий от&nbsp;плотных сугробов, снежных валов и&nbsp;обледенелых участков. Высокая тяга и&nbsp;мощная силовая установка обеспечивают производительность при&nbsp;интенсивной эксплуатации.',
      'Корпус и&nbsp;основные элементы изготовлены из&nbsp;металла — повышенная прочность, устойчивость к&nbsp;механическим повреждениям и&nbsp;длительный срок службы.',
      'По&nbsp;итогам 2025 года поставлено 56 единиц техники, за&nbsp;первое полугодие 2026 года — ещё 37 машин.'
    ],
    bullets: [
      ['Тяговое усилие', '80&nbsp;кг'],
      ['Мощность',       'Эквивалент 250–300&nbsp;л.с.'],
      ['Топливо',        'Авиационное'],
      ['Корпус',         'Полностью металлический']
    ],
    nomenclature: [
      ['Тяговое усилие',  '80&nbsp;кг'],
      ['Мощность',        'Эквивалент 250–300&nbsp;л.с.'],
      ['Топливо',         'Авиационное'],
      ['Корпус',          'Металл, усиленная конструкция'],
      ['Назначение',      'Сугробы, снежные валы, наледь'],
      ['Условия работы',  'Экстремальные погодные условия'],
      ['Эксплуатация',    'Интенсивная'],
      ['Поставки за&nbsp;2025 год', '56 единиц'],
      ['Поставки за&nbsp;1-е полугодие 2026', '37 единиц']
    ]
  }
};

/** Related cards (Pencil "другие категории" — 4 cats at bottom of each landing). */
// Related cats for "другие категории" on landings — 4 cards per Pencil W3oj8 4-col grid.
// Always derived from the canonical order minus the current category, takes the first 4 —
// tail categories (pcb / rantsy / snow) intentionally never appear as related cards;
// their RELATED_CAT_INFO entries are reserved for a future reorder.
const RELATED_CAT_ORDER = ['razemy', 'microchips', 'converters', 'capacitors', 'transistors', 'pcb', 'rantsy', 'snow'];
const RELATED_CATS = Object.fromEntries(
  RELATED_CAT_ORDER.map(cat => [cat, RELATED_CAT_ORDER.filter(c => c !== cat).slice(0, 4)])
);
const RELATED_CAT_INFO = {
  microchips:  { label: 'микросхемы',       desc: 'цифровые и&nbsp;аналоговые ис', image: '../assets/images/products/items/ET1636RR1 1.webp' },
  razemy:      { label: 'разъёмы',          desc: 'ет-серии, более 1500 позиций', image: '../assets/images/products/connectors/et-snc28.webp' },
  converters:  { label: 'преобразователи',  desc: 'dc/dc иртыш&nbsp;· волга&nbsp;· енисей&nbsp;· кама', image: '../assets/images/products/items/Irtysh.webp' },
  capacitors:  { label: 'свч-конденсаторы', desc: 'mlcc arc70a&nbsp;/ 70c&nbsp;/ 70e', image: '../assets/images/products/capacitors.webp' },
  transistors: { label: 'свч-транзисторы',  desc: 'ldmos для&nbsp;усилителей мощности', image: '../assets/images/products/transistors.webp' },
  pcb:         { label: 'печатные платы',   desc: 'до&nbsp;40 слоёв, опп&nbsp;/ дпп&nbsp;/ мпп', image: '../assets/images/products/pcb.webp' },
  rantsy:      { label: 'реактивные ранцы', desc: 'тяга 80&nbsp;кг&nbsp;· до&nbsp;100&nbsp;км/ч', image: '../assets/images/products/jetpack.webp' },
  snow:        { label: 'снегоуборочная техника', desc: 'для&nbsp;экстремальных условий', image: '../assets/images/products/snow.webp' }
};

/** Product Detail — populate fields from data based on URL hash.
 *  Hash formats: #p-<id> (PRODUCTS by id), #s-c-<slug> (connector series),
 *  #s-v-<slug> (converter series), #s-k-<slug> (capacitor series),
 *  #cat-<slug> (static landings — any CATEGORY_LANDINGS key, incl. pcb / rantsy / snow).
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
  } else if (hash.startsWith('#v-')) {
    // Variant: #v-<seriesSlug>:<itemIdx>
    const [seriesSlug, idxStr] = hash.slice(3).split(':');
    const idx = parseInt(idxStr, 10);
    let series = null;
    if (typeof CONNECTOR_SERIES !== 'undefined') {
      series = CONNECTOR_SERIES.find(s => s.slug === seriesSlug);
      if (series) { catSlug = 'razemy'; catLabel = 'разъёмы'; }
    }
    if (!series && typeof CONVERTER_SERIES !== 'undefined') {
      series = CONVERTER_SERIES.find(s => s.slug === seriesSlug);
      if (series) { catSlug = 'converters'; catLabel = 'преобразователи'; }
    }
    if (!series && typeof CAPACITOR_SERIES !== 'undefined') {
      series = CAPACITOR_SERIES.find(s => s.slug === seriesSlug);
      if (series) { catSlug = 'capacitors'; catLabel = 'свч-конденсаторы'; }
    }
    if (series && Array.isArray(series.items) && series.items[idx]) {
      const item = series.items[idx];
      const itemImage = resolveSeriesItemImage(series, item);
      // Короткий заголовок как у разъёмов — партномер уходит в «Характеристики».
      const [vName, vSub] = splitVariantName(item);
      const vKind = catSlug === 'razemy' ? 'connector' : catSlug === 'converters' ? 'converter' : 'capacitor';
      data = {
        name: vName,
        partnumber: vSub || item.partnumber || '',
        description: series.description || '',
        image: itemImage,
        specs: variantSpecs(vKind, series, item),
        tu: item.tu || series.tu || '',
        subcategory: item.type ? item.type.toLowerCase() : '',
        seriesName: series.name,
        seriesSlug: series.slug,
        variantIdx: idx
      };
      kind = 'variant';
    }
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
        subtitle: landing.subtitle,
        description: landing.description,
        image: landing.image,
        specs: landing.specs,
        bullets: landing.bullets,
        bulletsTitle: landing.bulletsTitle,
        nomenclature: landing.nomenclature,
        items: items
      };
      kind = 'landing';
      catSlug = landing.eyebrowCategory[0];
      catLabel = landing.eyebrowCategory[1];
    }
  }

  // Invalid hash → render an empty state instead of leaving stale ЕТ-СНЦ23 static content.
  // Triggers when a known prefix was used but no data lookup succeeded (e.g. #cat-foo, #v-xyz:99, #p-99999).
  const hashLooksRoutable = /^#(cat-|p-|v-|s-[cvk]-)/.test(hash);
  if (!data && hashLooksRoutable) {
    const main = document.querySelector('.product-detail') || document.querySelector('main');
    if (main) {
      const eyebrow = document.querySelector('.product-top__eyebrow');
      if (eyebrow) eyebrow.innerHTML = `<a href="products.html">каталог</a>`;
      const title = document.querySelector('.product-top__title');
      if (title) {
        title.textContent = 'товар не найден';
        const c = title.querySelector('.product-top__counter');
        if (c) c.hidden = true;
      }
      const subtitle = document.querySelector('.product-top__subtitle');
      if (subtitle) subtitle.textContent = 'проверьте ссылку или вернитесь в каталог.';
      // Hide all content sections except product-top.
      document.querySelectorAll('.section--pd-content, .section--pd-variants, .section--pd-nomenclature, .section--pd-related').forEach(s => s.hidden = true);
      document.title = 'товар не найден — IC Фарватер';
      document.body.dataset.pdKind = '';
    }
    return;
  }
  if (!data) return;

  // Title — UPPERCASE for product codes (ЕТ1310РН1У), preserve original case for category landing names (микросхемы/разъёмы — already lowercase).
  const titleEl = document.querySelector('.product-top__title');
  if (titleEl) {
    const counter = titleEl.querySelector('.product-top__counter');
    const rawName = data.name || data.displayName || '';
    // Landings have lowercase Russian names ("микросхемы"); products/series have UPPERCASE codes ("ET1310PN1U" / "ЕТ-2РМГ(Д)")
    titleEl.textContent = kind === 'landing' ? rawName : cyrillize(rawName);
    // Variant counter — reflect 1-based index within parent series (Pencil JbcyB "(NN)").
    // Landings have no counter on H1 (counter shown as section markers below).
    if (counter) {
      if (kind === 'variant' && data.variantIdx != null) {
        counter.textContent = `(${String(data.variantIdx + 1).padStart(2, '0')})`;
        counter.hidden = false;
      } else if (kind === 'landing') {
        counter.hidden = true;
      } else {
        counter.textContent = '(01)';
        counter.hidden = false;
      }
      titleEl.appendChild(counter);
    }
  }

  // Eyebrow breadcrumb: каталог / <category> / <type> — Pencil v4 uses slash separator (HxV1w/WxsJU/nCPVW).
  const eyebrowEl = document.querySelector('.product-top__eyebrow');
  if (eyebrowEl) {
    const trail = data.subcategory || '';
    eyebrowEl.innerHTML = `<a href="products.html">каталог</a>&nbsp;/&nbsp;<a href="products.html#${catSlug}">${catLabel}</a>` +
      (trail ? `&nbsp;/&nbsp;<span>${String(trail).toLowerCase()}</span>` : '');
  }

  // Subtitle (short description)
  const subtitleEl = document.querySelector('.product-top__subtitle');
  if (subtitleEl) {
    if (kind === 'landing' && data.subtitle) {
      subtitleEl.innerHTML = data.subtitle;
    } else if (data.description) {
      const desc = Array.isArray(data.description) ? data.description[0] : data.description;
      subtitleEl.textContent = String(desc).split('.')[0] + '.';
    } else if (data.tu) {
      subtitleEl.textContent = data.tu.toLowerCase();
    }
  }

  // Image
  const imgEl = document.querySelector('.pd-image__placeholder');
  const labelEl = document.querySelector('.pd-image__label');
  if (labelEl) labelEl.textContent = kind === 'landing' ? (data.name || '') : cyrillize(data.name || '');
  if (imgEl) {
    const labelText = kind === 'landing' ? (data.name || '') : cyrillize(data.name || '');
    if (data.image) {
      imgEl.innerHTML = `<img src="${data.image}" alt="${data.name}" loading="lazy" style="width:100%;height:100%;object-fit:contain;" onerror="this.style.display='none';this.parentElement.innerHTML='<span class=&quot;pd-image__label&quot;>${labelText}</span>'">`;
    } else {
      imgEl.innerHTML = `<span class="pd-image__label">${labelText}</span>`;
    }
  }

  // Page kind marker → CSS uses this to swap layout (Series Detail vs Variant Page vs Landing).
  // Series detail (qYQC0) uses "о серии" caption style instead of H2 "описание",
  // hides specs + related, image is 4:3 (580×480 in Pencil).
  document.body.dataset.pdKind = kind || '';

  // Description counter (02) — show only for landings (Pencil v4 W7BuW7/aagoV)
  const descCounter = document.querySelector('.pd-block__counter--landing');
  if (descCounter) descCounter.hidden = (kind !== 'landing');

  // Description H2 title swap — Series Detail uses "о серии" caption label, not H2 "описание".
  const descTitleEl = document.querySelector('.pd-block--description .pd-block__title');
  if (descTitleEl) {
    const counter = descTitleEl.querySelector('.pd-block__counter--landing');
    descTitleEl.textContent = 'Описание';
    if (counter) descTitleEl.appendChild(counter);
  }

  // Description — can be string (single para) or array (multi-para per Pencil v4 landings)
  const descBody = document.querySelector('.pd-block--description .pd-block__body');
  if (descBody && data.description) {
    let paras;
    if (Array.isArray(data.description)) {
      paras = data.description;
    } else {
      paras = String(data.description).split(/(?<=[.])\s+/).filter(Boolean);
    }
    descBody.innerHTML = paras.map(s => `<p>${String(s).trim()}</p>`).join('');
  }

  // Specs table — Variant page only.
  // - Landing → hidden (specs surface via Nomenclature section instead).
  // - Series Detail → hidden (qYQC0 has no characteristics column — variant table covers it).
  // - Variant page (W3oj8) → shown with parsed item-level specs.
  const specsBlockEl = document.querySelector('.pd-block--specs');
  if (kind === 'landing') {
    if (specsBlockEl) specsBlockEl.hidden = true;
  } else {
    if (specsBlockEl) specsBlockEl.hidden = false;
    const specsTable = document.querySelector('.pd-specs');
    if (specsTable) {
      let specsObj = {};
      if (data.specs) {
        specsObj = { ...data.specs };   // клон — не мутировать shared series.specs
      } else if (kind === 'variant') {
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
  }

  // Bullets block (Pencil v4 — landings only). 4-row "что мы поставляем" list.
  // Lives INSIDE pd-info between description and actions (NOT a separate full-width section).
  const bulletsBlock = document.getElementById('pdBulletsBlock');
  const bulletsList = document.getElementById('pdBulletsList');
  if (bulletsBlock && bulletsList) {
    if (kind === 'landing' && Array.isArray(data.bullets)) {
      // Заголовок блока (03): по умолчанию «Что мы поставляем», лендинги rantsy/snow
      // переопределяют на «Характеристики» (правка заказчика).
      const bulletsTitleEl = bulletsBlock.querySelector('.pd-block__title--bullets');
      if (bulletsTitleEl) {
        const bCounter = bulletsTitleEl.querySelector('.pd-block__counter--bullets');
        bulletsTitleEl.textContent = data.bulletsTitle || 'Что мы поставляем';
        if (bCounter) bulletsTitleEl.appendChild(bCounter);
      }
      bulletsList.innerHTML = '';
      data.bullets.forEach(([label, value]) => {
        const row = document.createElement('div');
        row.className = 'pd-bullets__row';
        row.innerHTML = `<span class="pd-bullets__label">${label}</span><span class="pd-bullets__value">${value}</span>`;
        bulletsList.appendChild(row);
      });
      bulletsBlock.hidden = false;
    } else {
      bulletsBlock.hidden = true;
    }
  }

  // Nomenclature section (Pencil v4 — landings only). 9-row spec table.
  const nomSection = document.getElementById('pdNomenclatureSection');
  const nomTable = document.getElementById('pdNomenclatureTable');
  if (nomSection && nomTable) {
    if (kind === 'landing' && Array.isArray(data.nomenclature)) {
      nomTable.innerHTML = '';
      data.nomenclature.forEach(([label, value]) => {
        const row = document.createElement('div');
        row.className = 'pd-nomenclature__row';
        row.innerHTML = `<span class="pd-nomenclature__label">${label}</span><span class="pd-nomenclature__value">${value}</span>`;
        nomTable.appendChild(row);
      });
      nomSection.hidden = false;
    } else {
      nomSection.hidden = true;
    }
  }

  // Update page title (browser tab) — cyrillize product code
  document.title = `${cyrillize((data.name || '').toUpperCase())} — IC Фарватер`;

  // Wire data-kp-product / data-kp-category onto the primary CTA so the КП drawer pre-fills correctly.
  const primaryCta = document.querySelector('.pd-actions__primary[data-action="open-kp-drawer"]');
  if (primaryCta) {
    primaryCta.dataset.kpProduct = cyrillize(((data.partnumber || data.name) || '').toUpperCase());
    primaryCta.dataset.kpCategory = catLabel || '';
  }

  // === RELATED cards — dynamic per category. For LANDINGS → "другие категории" (3 other cats).
  // For variants/series → 4 sibling items in same category. ===
  const relatedGrid = document.getElementById('pdRelatedGrid');
  const relatedSection = document.querySelector('.section--pd-related');
  const relatedTitleEl = document.querySelector('.pd-related__title');
  if (relatedGrid) {
    let pool = [];
    if (kind === 'landing' && Array.isArray(RELATED_CATS[catSlug])) {
      // Other categories — 3 cards linking to other landings
      pool = RELATED_CATS[catSlug].map(key => {
        const info = RELATED_CAT_INFO[key];
        return info ? { name: info.label, desc: info.desc, image: info.image, href: `product-detail.html#cat-${key}` } : null;
      }).filter(Boolean);
      if (relatedTitleEl) {
        const counter = relatedTitleEl.querySelector('.pd-related__counter');
        if (counter) counter.textContent = '(05)';
        relatedTitleEl.textContent = 'другие категории';
        if (counter) relatedTitleEl.appendChild(counter);
      }
    } else if (catSlug === 'razemy' && typeof CONNECTOR_SERIES !== 'undefined') {
      pool = CONNECTOR_SERIES.filter(s => s.slug !== data.slug).slice(0, 4).map(s => ({
        name: s.name, desc: shortDesc(s.slug, s.description),
        image: s.image, href: `products.html#razemy/${s.slug}`
      }));
    } else if (catSlug === 'converters' && typeof CONVERTER_SERIES !== 'undefined') {
      pool = CONVERTER_SERIES.filter(s => s.slug !== data.slug).slice(0, 4).map(s => ({
        name: s.name, desc: shortDesc(s.slug, s.description),
        image: s.image, href: `products.html#converters/${s.slug}`
      }));
    } else if (catSlug === 'capacitors' && typeof CAPACITOR_SERIES !== 'undefined') {
      pool = CAPACITOR_SERIES.filter(s => s.slug !== data.slug).slice(0, 4).map(s => ({
        name: s.name, desc: shortDesc(s.slug, s.description),
        image: s.image, href: `products.html#capacitors/${s.slug}`
      }));
    } else if ((catSlug === 'microchips' || catSlug === 'transistors') && typeof PRODUCTS !== 'undefined') {
      const catName = catSlug === 'microchips' ? 'Микросхемы' : 'СВЧ-транзисторы';
      const currentId = (typeof data.id === 'number') ? data.id : null;
      pool = PRODUCTS.filter(p => p.category === catName && p.id !== currentId).slice(0, 4).map(p => ({
        name: p.name, desc: (p.subcategory || '').toLowerCase(),
        image: p.image, href: `product-detail.html#p-${p.id}`
      }));
    }
    if (pool.length) {
      relatedGrid.innerHTML = '';
      pool.forEach(it => {
        const a = document.createElement('a');
        a.className = 'pd-card';
        a.href = it.href;
        const cyrName = kind === 'landing' ? it.name : cyrillize(it.name);
        a.innerHTML = `
          <div class="pd-card__image" aria-label="${it.name}">
            ${it.image ? `<img src="${it.image}" alt="${it.name}" loading="lazy" style="width:100%;height:100%;object-fit:contain;" onerror="this.style.display='none';this.parentElement.insertAdjacentHTML('beforeend','<span class=\\'pd-card__image-label\\'>${cyrName}</span>')">` : `<span class="pd-card__image-label">${cyrName}</span>`}
          </div>
          <div class="pd-card__info">
            <span class="pd-card__name">${cyrName}</span>
            ${it.desc ? `<span class="pd-card__desc">${it.desc}</span>` : ''}
          </div>
        `;
        relatedGrid.appendChild(a);
      });
      if (relatedSection) relatedSection.hidden = false;
    } else {
      if (relatedSection) relatedSection.hidden = true;
    }
  }

  // Variants section was used by the (now removed) Series Detail page. Always hidden here.
  const variantsSection = document.getElementById('pdVariantsSection');
  if (variantsSection) variantsSection.hidden = true;

  // Висящие предлоги в динамически отрендеренном контенте (specs/bullets/description):
  // первичный рендер закрывает nbsp.js на DOMContentLoaded, ре-рендеры по hashchange — этот вызов.
  if (window.applyNbsp) window.applyNbsp(document.querySelector('main') || document.body);

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
            <!-- Honeypot — невидимое поле для отсечения ботов -->
            <div aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;">
              <label>Не заполняйте это поле<input type="text" name="honeypot" tabindex="-1" autocomplete="off"></label>
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

  // Submit — production hits PHP backend, staging mocks success
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('.kp-form__submit');
      if (btn) { btn.disabled = true; btn.textContent = 'отправка...'; }
      // Remove old message
      form.querySelectorAll('.kp-form__msg').forEach(el => el.remove());

      // Pull product context that openDrawer wrote into the visible chips
      const productName = document.getElementById('kpProductName')?.textContent?.trim();
      const productCategory = document.getElementById('kpProductLabel')?.textContent?.trim();

      const result = await submitForm(form, 'kp', {
        product: productName,
        category: productCategory,
      });
      const msg = document.createElement('p');
      if (result.ok) {
        msg.className = 'kp-form__msg kp-form__msg--ok';
        msg.textContent = 'Спасибо! Мы свяжемся с вами в течение рабочего дня.';
        form.reset();
        if (filesList) filesList.innerHTML = '';
      } else {
        msg.className = 'kp-form__msg kp-form__msg--error';
        msg.textContent = result.error || 'Ошибка отправки. Напишите info@ic-farvater.ru';
      }
      form.appendChild(msg);
      if (btn) { btn.disabled = false; btn.textContent = 'отправить запрос'; }
    });
  }
}

