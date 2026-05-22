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

/** Header search toggle — open on icon click, redirect on submit */
function initHeaderSearch() {
  const header = document.querySelector('.header');
  const toggle = document.querySelector('.header__search-toggle');
  const box = document.querySelector('.header__search-box');
  const input = document.querySelector('.header__search-input');
  const submit = document.querySelector('.header__search-submit');

  if (!header || !toggle || !box || !input) return;

  function openSearch() {
    header.classList.add('header--search-open');
    box.setAttribute('aria-hidden', 'false');
    toggle.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => input.focus());
  }

  function closeSearch() {
    header.classList.remove('header--search-open');
    box.setAttribute('aria-hidden', 'true');
    toggle.setAttribute('aria-expanded', 'false');
    input.value = '';
  }

  function doSearch() {
    const q = input.value.trim();
    if (!q) { closeSearch(); return; }
    const base = window.location.pathname.includes('/pages/') ? 'products.html' : 'pages/products.html';
    window.location.href = `${base}?search=${encodeURIComponent(q)}`;
  }

  toggle.addEventListener('click', () => {
    header.classList.contains('header--search-open') ? closeSearch() : openSearch();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
    if (e.key === 'Escape') closeSearch();
  });

  if (submit) submit.addEventListener('click', doSearch);

  document.addEventListener('click', (e) => {
    if (header.classList.contains('header--search-open') && !e.target.closest('.header__search-wrap')) {
      closeSearch();
    }
  });
}

/** Mobile burger menu toggle */
function initMobileMenu() {
  const burger = document.querySelector('.header__burger');
  const nav = document.querySelector('.header__nav');
  const searchBtn = document.querySelector('.header__search-mobile');
  const searchInput = document.querySelector('.header__nav .header__search-input');

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

  // Mobile search icon — open drawer + focus search input
  if (searchBtn) {
    searchBtn.addEventListener('click', () => {
      setOpen(true);
      if (searchInput) requestAnimationFrame(() => searchInput.focus());
    });
  }

  // Close menu on link click
  nav.querySelectorAll('.header__link').forEach(link => {
    link.addEventListener('click', () => setOpen(false));
  });
}

/** Highlight the nav link matching current page or hash */
function initActiveNavLink() {
  const links = document.querySelectorAll('.header__link');
  if (!links.length) return;

  function syncHash() {
    const hash = window.location.hash;
    if (!hash) return;
    links.forEach(link => {
      const href = link.getAttribute('href');
      link.classList.toggle('header__link--active', href === hash || href.endsWith(hash));
    });
  }

  syncHash();
  window.addEventListener('hashchange', syncHash);
}

/** Contact form → /scripts/send.php */
const CONTACT_FILE_MAX_COUNT = 5;
const CONTACT_FILE_MAX_TOTAL = 10 * 1024 * 1024;
const CONTACT_FILE_ALLOWED = ['pdf','doc','docx','xls','xlsx','csv','txt','png','jpg','jpeg','zip','rar','7z'];

function initContactForm() {
  const form = document.getElementById('contactForm');
  if (!form) return;

  const btn = form.querySelector('.contact-form__submit');
  const fileState = initContactFiles(form);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = new FormData(form);
    if (btn) { btn.disabled = true; btn.textContent = 'ОТПРАВКА...'; }
    removeFormMessage(form);

    try {
      const res = await fetch('/scripts/send.php', { method: 'POST', body: data });
      const json = await res.json();

      if (json.ok) {
        showFormMessage(form, 'Спасибо! Мы свяжемся с вами в течение рабочего дня.', true);
        form.reset();
        if (fileState) fileState.clear();
      } else {
        showFormMessage(form, json.error || 'Произошла ошибка. Попробуйте позже.', false);
      }
    } catch {
      showFormMessage(form, 'Нет соединения с сервером. Напишите нам: info@ic-farvater.ru', false);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'ОТПРАВИТЬ'; }
    }
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

/** Cert accordion toggle */
function initCertAccordion() {
  document.querySelectorAll('.cert-row__header').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = btn.closest('.cert-row');
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

