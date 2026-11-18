/* Native details keeps the content usable without JavaScript. */
(() => {
 const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
 const desktop = window.matchMedia('(min-width:1024px)');
 const toc = document.querySelector('details.editorial-toc');
 const states = new Map();
 const milliseconds = value => parseFloat(value) * (value.trim().endsWith('ms') ? 1 : 1000);

 function setOpen(details, expanded, animate = true) {
  const state = states.get(details);
  if (!state || (expanded === state.expanded && (animate || !state.height))) return;
  const { summary, body } = state;
  const from = details.getBoundingClientRect().height;
  const opacity = details.open ? Number(getComputedStyle(body).opacity) : 0;
  state.height?.cancel();
  state.fade?.cancel();
  state.expanded = expanded;
  summary.setAttribute('aria-expanded', String(expanded));
  if (!expanded && body.contains(document.activeElement)) summary.focus({ preventScroll:true });
  body.inert = !expanded;
  details.open = expanded;
  const finish = () => {
   details.open = expanded;
   details.classList.remove('editorial-details--moving');
   state.height?.cancel();
   state.fade?.cancel();
   state.height = state.fade = null;
  };
  if (!animate || reduced.matches || !details.animate) {
   finish();
   return;
  }

  const to = details.getBoundingClientRect().height;
  details.open = true;
  details.classList.add('editorial-details--moving');
  const styles = getComputedStyle(details);
  state.height = details.animate({ height:[`${from}px`, `${to}px`] }, {
   duration:milliseconds(styles.getPropertyValue('--dur-mid')),
   easing:styles.getPropertyValue('--ease-swiss').trim(),
   fill:'both',
  });
  state.fade = body.animate({ opacity:[opacity, expanded ? 1 : 0] }, {
   duration:milliseconds(styles.getPropertyValue('--dur-short')),
   easing:'ease',
   fill:'both',
  });
  state.height.onfinish = finish;
 }

 function openItem(details, expanded, animate = true) {
  if (expanded && details.matches('.editorial-disclosure')) {
   details.closest('.editorial-disclosures')?.querySelectorAll(':scope > details').forEach(other => {
    if (other !== details) setOpen(other, false, animate);
   });
  }
  setOpen(details, expanded, animate);
 }

 for (const details of document.querySelectorAll('details.editorial-disclosure, details.editorial-toc')) {
  const summary = details.querySelector(':scope > summary'), body = summary.nextElementSibling;
  states.set(details, { summary, body, expanded:details.open });
  summary.setAttribute('aria-expanded', String(details.open));
  body.inert = !details.open;
  summary.addEventListener('click', event => {
   event.preventDefault();
   if (details === toc && desktop.matches) return;
   openItem(details, !states.get(details).expanded);
  });
 }

 function revealCheck(hash) {
  let target;
  try { target = document.getElementById(decodeURIComponent(hash.replace(/^#/, ''))); }
  catch { return; }
  const details = target?.closest('.editorial-disclosure');
  if (details) openItem(details, true, false);
 }
 document.querySelectorAll('.editorial-toc a').forEach(link => link.addEventListener('click', () => revealCheck(link.hash)));
 window.addEventListener('hashchange', () => revealCheck(window.location.hash));
 revealCheck(window.location.hash);

 if (toc) {
  const ensureDesktopContents = () => {
   states.get(toc).summary.tabIndex = desktop.matches ? -1 : 0;
   if (desktop.matches) setOpen(toc, true, false);
  };
  desktop.addEventListener('change', ensureDesktopContents);
  ensureDesktopContents();
 }
 reduced.addEventListener('change', () => {
  if (reduced.matches) for (const [details, state] of states) setOpen(details, state.expanded, false);
 });
})();
