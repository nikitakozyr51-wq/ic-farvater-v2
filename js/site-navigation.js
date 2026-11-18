/* Shared navigation and modal focus/scroll ownership. No framework dependency. */
(() => {
 'use strict';
 let dialog = null;
 const visible = node => !node.closest('[hidden],[inert]') && node.getClientRects().length > 0;
 const focusable = scope => [...scope.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex]:not([tabindex="-1"])')].filter(node => !node.disabled && visible(node));
 const notify = open => document.dispatchEvent(new CustomEvent('ic:overlay-state', { detail: { open } }));
 const closeDialog = ({ restoreFocus = true } = {}) => {
  if (!dialog) return;
  const previous = dialog; dialog = null;
  for (const [node, inert] of previous.background) node.inert = inert;
  document.body.style.overflow = previous.overflow;
  document.body.style.paddingRight = previous.padding;
  if (previous.header) previous.header.style.paddingRight = previous.headerPadding;
  document.body.classList.remove('is-overlay-open'); notify(false);
  previous.onClose?.();
  if (restoreFocus && previous.trigger?.isConnected && visible(previous.trigger)) previous.trigger.focus({preventScroll:true});
 };
 window.ICDialogs = {
  isActive: element => dialog?.element === element,
  close: closeDialog,
  open({ element, trigger = document.activeElement, onClose, focus }) {
   if (dialog?.element === element) return;
   closeDialog({ restoreFocus: false });
   const header = document.querySelector('.header'), width = window.innerWidth - document.documentElement.clientWidth;
   const background = [];
   for (let branch = element; branch && branch !== document.body; branch = branch.parentElement) {
    for (const sibling of branch.parentElement.children) if (sibling !== branch) background.push([sibling, sibling.inert]);
   }
   dialog = { element, trigger, onClose, background, overflow: document.body.style.overflow, padding: document.body.style.paddingRight, header, headerPadding: header?.style.paddingRight || '' };
   for (const [node] of background) node.inert = true;
   if (width > 0) {
    document.body.style.paddingRight = (parseFloat(getComputedStyle(document.body).paddingRight) + width) + 'px';
    if (header) header.style.paddingRight = width + 'px';
   }
   document.body.style.overflow = 'hidden'; document.body.classList.add('is-overlay-open'); notify(true);
   requestAnimationFrame(() => { if (dialog?.element === element) (focus || focusable(element)[0] || element).focus({preventScroll:true}); });
  },
 };
 document.addEventListener('keydown', event => {
  if (!dialog) return;
  if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); closeDialog(); return; }
  if (event.key !== 'Tab') return;
  const nodes = focusable(dialog.element), first = nodes[0], last = nodes.at(-1);
  if (!first) { event.preventDefault(); return; }
  if (event.shiftKey && (document.activeElement === first || !dialog.element.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && (document.activeElement === last || !dialog.element.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
 }, true);
 document.addEventListener('DOMContentLoaded', () => {
  const header = document.querySelector('.header'); if (!header) return;
  const headerInner = header.querySelector('.header__inner');
  if (CSS.supports('backdrop-filter', 'url("#ic-logo-ink")')) {
   // Keep the original labels and icons for layout and accessibility. Only the ink is masked.
   const labelParts = [];
   for (const link of headerInner.querySelectorAll('.header__nav-link')) {
    const text = Array.from(link.childNodes).find(node => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
    if (!text) continue;
    const label = document.createElement('span'), baseline = document.createElement('span');
    label.className = 'header__ink-label';
    baseline.className = 'header__ink-baseline';
    baseline.setAttribute('aria-hidden', 'true');
    text.before(label);
    label.append(text, baseline);
    labelParts.push({ label, text, baseline });
   }
   for (const svg of headerInner.querySelectorAll(':is(.header__search, .header__burger, .header__lab-trigger) > svg')) {
    const icon = document.createElement('span');
    icon.className = 'header__ink-icon';
    const shape = new XMLSerializer().serializeToString(svg).replaceAll('currentColor', 'black');
    icon.style.setProperty('--header-ink-mask', `url("data:image/svg+xml,${encodeURIComponent(shape)}")`);
    svg.before(icon);
    icon.append(svg);
   }
   const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
   const refreshLabels = () => {
    if (!context) return;
    const scale = Math.min(window.devicePixelRatio || 1, 3);
    for (const { label, text, baseline } of labelParts) {
     const box = label.getBoundingClientRect();
     if (!box.width || !box.height) continue;
     canvas.width = Math.ceil((box.width + 4) * scale);
     canvas.height = Math.ceil((box.height + 4) * scale);
     const style = getComputedStyle(label);
     context.scale(scale, scale);
     context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
     if ('letterSpacing' in context) context.letterSpacing = style.letterSpacing === 'normal' ? '0px' : style.letterSpacing;
     context.fillText(text.textContent, 2, baseline.getBoundingClientRect().top - box.top + 2);
     label.style.setProperty('--header-ink-mask', `url("${canvas.toDataURL()}")`);
    }
   };
   const observer = new ResizeObserver(refreshLabels);
   for (const { label } of labelParts) observer.observe(label);
   document.fonts.ready.then(refreshLabels);
  }
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
   // Enable the backdrop filter once the entry animation releases its compositing layer.
   const finishEntry = event => {
    if (event.target !== headerInner) return;
    headerInner.classList.remove('header__inner--entering');
    headerInner.removeEventListener('animationend', finishEntry);
    headerInner.removeEventListener('animationcancel', finishEntry);
   };
   headerInner.addEventListener('animationend', finishEntry);
   headerInner.addEventListener('animationcancel', finishEntry);
   headerInner.classList.add('header__inner--entering');
  }
  const darkSurfaces = document.querySelectorAll('[data-header-theme="dark"], main .hero');
  const desktop = window.matchMedia('(min-width:1024px)'), nav = header.querySelector('.header__nav');
  const search = header.querySelector('.header__search'), searchForm = header.querySelector('.header__search-form'), searchInput = searchForm?.querySelector('input');
  const burger = header.querySelector('.header__burger'), menu = header.querySelector('#mobileMenu');
  const laboratory = header.querySelector('.header__lab-trigger'), panel = header.querySelector('.header__lab-panel'), backdrop = header.querySelector('.header__backdrop');
  let searchOpen = false, searchHideTimer;
  function setSearch(open, restoreFocus = true) {
   clearTimeout(searchHideTimer); searchOpen = open;
   searchForm.inert = !open;
   if (open) {
    searchForm.hidden = false; searchForm.removeAttribute('aria-hidden');
    searchForm.getBoundingClientRect();
    header.classList.add('header--searching');
   } else {
    header.classList.remove('header--searching'); searchForm.setAttribute('aria-hidden','true');
    if (!desktop.matches || window.matchMedia('(prefers-reduced-motion:reduce)').matches) searchForm.hidden = true;
    else searchHideTimer = setTimeout(() => { if (!searchOpen) searchForm.hidden = true; }, 500);
   }
   search.setAttribute('aria-expanded', String(open)); nav.inert = open;
   queueTone();
   if (open) requestAnimationFrame(() => { if (searchOpen) searchInput.focus({preventScroll:true}); });
   else if (restoreFocus) search.focus({preventScroll:true});
  }
  function closeNavigation(restoreFocus = true) {
   if (window.ICDialogs.isActive(menu) || window.ICDialogs.isActive(header)) window.ICDialogs.close({ restoreFocus });
   if (searchOpen) setSearch(false, restoreFocus);
  }
  const finishMenuClose = () => { menu.hidden = true; menu.classList.remove('mobile-menu--open'); burger.setAttribute('aria-expanded','false'); search.setAttribute('aria-expanded','false'); document.body.classList.remove('menu-open'); };
  function openMenu(focusSearch = false) {
   closeNavigation(false); menu.hidden = false; menu.scrollTop = 0; menu.classList.add('mobile-menu--open'); burger.setAttribute('aria-expanded','true'); search.setAttribute('aria-expanded','true'); document.body.classList.add('menu-open');
   window.ICDialogs.open({ element: menu, trigger: focusSearch ? search : burger, onClose: finishMenuClose, focus: focusSearch ? menu.querySelector('input') : menu.querySelector('.mobile-menu__close') });
  }
  const finishLaboratoryClose = () => { panel.hidden = true; backdrop.hidden = true; header.classList.remove('header--laboratory-open'); laboratory?.setAttribute('aria-expanded','false'); };
  laboratory?.addEventListener('click', () => {
   if (window.ICDialogs.isActive(header)) { closeNavigation(); return; }
   closeNavigation(false); panel.hidden = false; backdrop.hidden = false; header.classList.add('header--laboratory-open'); laboratory.setAttribute('aria-expanded','true');
   window.ICDialogs.open({ element: header, trigger: laboratory, onClose: finishLaboratoryClose, focus: panel.querySelector('a') });
  });
  backdrop?.addEventListener('click', () => closeNavigation());
  burger.addEventListener('click', () => menu.hidden ? openMenu() : closeNavigation());
  menu.querySelector('.mobile-menu__close').addEventListener('click', () => closeNavigation());
  search.addEventListener('click', () => { if (!desktop.matches) { openMenu(true); return; } closeNavigation(false); setSearch(true); });
  searchForm.querySelector('.header__search-close').addEventListener('click', () => setSearch(false));
  for (const form of [searchForm, menu.querySelector('form')]) form.addEventListener('submit', event => {
   event.preventDefault(); const query = form.querySelector('input').value.trim();
   const target = new URL(form.action, window.location.href); if (query) target.searchParams.set('q',query); target.hash = 'all';
   closeNavigation(false); window.location.assign(target.href);
  });
  header.addEventListener('click', event => { if (event.target.closest('a[href]')) closeNavigation(false); });
  document.addEventListener('ic:close-navigation', () => closeNavigation(false));
  document.addEventListener('pointerdown', event => { if (searchOpen && !header.contains(event.target)) setSearch(false, false); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && searchOpen) { event.preventDefault(); setSearch(false); } });
  const updateSearchControls = () => search.setAttribute('aria-controls',desktop.matches ? 'headerSearchForm' : 'mobileMenu');
  updateSearchControls();
  desktop.addEventListener('change', () => { const contained = header.contains(document.activeElement); closeNavigation(false); updateSearchControls(); if (contained) header.querySelector('.header__logo').focus({preventScroll:true}); });
  let scheduled = false, lightInk;
  function updateTone() {
   scheduled = false;
   if (document.body.classList.contains('is-overlay-open')) return;
   const height = headerInner.offsetHeight;
   const ranges = [];
   if (document.body.classList.contains('is-legal-page')) ranges.push([0, height]);
   for (const element of darkSurfaces) {
    const box = element.getBoundingClientRect();
    const start = Math.max(0, box.top), end = Math.min(height, box.bottom);
    if (end > start) ranges.push([start, end]);
   }
   ranges.sort((a, b) => a[0] - b[0]);
   const bands = [];
   for (const [start, end] of ranges) {
    const previous = bands.at(-1);
    if (previous && start <= previous[1]) previous[1] = Math.max(previous[1], end);
    else bands.push([start, end]);
   }
   const allDark = bands.length === 1 && bands[0][0] === 0 && bands[0][1] === height;
   const centerDark = bands.some(([start, end]) => start <= height / 2 && end >= height / 2);
   const tone = (searchOpen ? centerDark : allDark) ? 'dark' : 'light';
   if (header.dataset.tone !== tone) header.dataset.tone = tone;
   if (allDark || !bands.length || searchOpen) {
    if (lightInk && !lightInk.hidden) lightInk.hidden = true;
    return;
   }
   if (!lightInk) {
    lightInk = headerInner.cloneNode(true);
    lightInk.classList.remove('header__inner--entering');
    lightInk.classList.add('header__tone-overlay');
    lightInk.setAttribute('aria-hidden', 'true');
    lightInk.inert = true;
    lightInk.querySelector('.header__search-form').remove();
    for (const element of lightInk.querySelectorAll('[id], [aria-controls]')) {
     element.removeAttribute('id');
     element.removeAttribute('aria-controls');
    }
    headerInner.after(lightInk);
   }
   // Each band's outline returns to the left edge, leaving gaps unpainted.
   lightInk.style.clipPath = 'polygon(' + bands.map(([start, end]) =>
    `0 ${start}px,100% ${start}px,100% ${end}px,0 ${end}px,0 ${start}px`).join(',') + ')';
   lightInk.hidden = false;
  }
  const queueTone = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(updateTone); } };
  document.addEventListener('ic:overlay-state', event => { if (!event.detail.open) queueTone(); });
  window.addEventListener('scroll',queueTone,{passive:true}); window.addEventListener('resize',queueTone,{passive:true});
  window.addEventListener('load',queueTone); window.addEventListener('pageshow',queueTone); updateTone();
 });
})();
