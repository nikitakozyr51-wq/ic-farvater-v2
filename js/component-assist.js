/* Component assistance is offered only on pages that load this script. */
(() => {
  'use strict';

  const storageKey = 'ic:component-assist';
  const experimentKey = 'ic:component-assist-timer-v1';
  const path = location.pathname;
  if (!['/', '/index.html', '/pages/products.html'].includes(path) || !window.ICDialogs) return;

  let elapsed;
  let delaySeconds;
  let eligibleReported = false;
  try {
    const saved = sessionStorage.getItem(storageKey);
    if (saved === 'shown') return;
    delaySeconds = Number(sessionStorage.getItem(experimentKey));
    if (delaySeconds !== 25 && delaySeconds !== 35) {
      delaySeconds = Math.random() < 0.5 ? 25 : 35;
      sessionStorage.setItem(experimentKey, String(delaySeconds));
    }
    elapsed = Math.max(0, Math.min(delaySeconds * 1000, Number(saved) || 0));
  } catch {
    return; // No session storage means we cannot enforce the display limit.
  }

  const delay = delaySeconds * 1000;
  const root = path.startsWith('/pages/') ? '../' : './';
  let activeSince;
  let timer;
  let pageActive = true;
  let recentFilterUntil = 0;
  let dialog;
  let imageReady = false;
  const filterControls = '.catalog__sidebar .filter-group, .catalog__sidebar .filter-clear, .catalog-filters-lane, .catalog-filters-summary';

  // Metrika visit parameters need no new conversion goal. Count eligibility
  // before either timer can finish, including visitors who leave early.
  function trackTimer(stage) {
    if (typeof metrikaCounterId !== 'number' || !metrikaCounterId ||
        typeof window.ym !== 'function' || getCookieConsent() !== 'accepted') return false;
    try {
      window.ym(metrikaCounterId, 'params', {
        component_assist_timer_v1: { [`seconds_${delaySeconds}`]: stage },
      });
      return true;
    } catch {
      return false;
    }
  }

  function reportEligible() {
    if (!eligibleReported && activeSince !== undefined) eligibleReported = trackTimer('eligible');
  }

  function isBusy() {
    const focus = document.activeElement;
    return document.body.classList.contains('is-overlay-open') ||
      !!document.querySelector('.header--searching, .kp-drawer--open, #catalogFiltersDialog:not([hidden]), #cookieBanner:not(.cookie-banner--hidden)') ||
      !!focus?.closest('form input, form select, form textarea, form button, [contenteditable="true"]') ||
      !!focus?.matches(':focus-visible') && !!focus.closest(filterControls) ||
      performance.now() < recentFilterUntil;
  }

  function save(value) {
    try {
      sessionStorage.setItem(storageKey, String(value));
      return true;
    } catch {
      return false;
    }
  }

  function stopTiming() {
    clearTimeout(timer);
    if (activeSince !== undefined) {
      elapsed = Math.min(delay, elapsed + performance.now() - activeSince);
      activeSince = undefined;
      save(elapsed);
    }
  }

  function pausePage() {
    pageActive = false;
    stopTiming();
  }

  function resumePage(event) {
    pageActive = true;
    if (event.persisted) {
      const saved = sessionStorage.getItem(storageKey);
      if (saved === 'shown') {
        pageActive = false;
        return;
      }
      elapsed = Math.max(elapsed, Math.min(delay, Number(saved) || 0));
    }
    syncTiming();
  }

  function rememberFilterInteraction(event) {
    if (event.target instanceof Element && event.target.closest(filterControls)) {
      recentFilterUntil = performance.now() + 3000;
    }
  }

  function syncTiming() {
    clearTimeout(timer);
    if (!pageActive || document.visibilityState !== 'visible' || !document.hasFocus()) {
      stopTiming();
      return;
    }
    activeSince ??= performance.now();
    reportEligible();
    const remaining = delay - elapsed - (performance.now() - activeSince);
    if (remaining > 0) {
      timer = setTimeout(syncTiming, remaining);
      return;
    }
    if (isBusy()) {
      timer = setTimeout(syncTiming, 250);
      return;
    }
    if (!dialog) {
      dialog = makeDialog();
      const image = dialog.querySelector('img');
      image.decode().catch(() => {}).then(() => {
        imageReady = true;
        syncTiming();
      });
    }
    if (!imageReady) return;

    stopTiming();
    if (!save('shown')) return;
    document.removeEventListener('visibilitychange', syncTiming);
    window.removeEventListener('focus', syncTiming);
    window.removeEventListener('blur', stopTiming);
    window.removeEventListener('pagehide', pausePage);
    window.removeEventListener('pageshow', resumePage);
    document.removeEventListener('pointerdown', rememberFilterInteraction, true);
    document.removeEventListener('input', rememberFilterInteraction, true);

    dialog.hidden = false;
    trackTimer('shown');
    window.ICDialogs.open({
      element: dialog,
      focus: dialog,
      onClose: () => { dialog.hidden = true; },
    });
  }

  function makeDialog() {
    const layer = document.createElement('div');
    layer.className = 'component-assist';
    layer.hidden = true;
    layer.tabIndex = -1;
    layer.setAttribute('role', 'dialog');
    layer.setAttribute('aria-modal', 'true');
    layer.setAttribute('aria-labelledby', 'componentAssistTitle');
    layer.setAttribute('data-lenis-prevent', '');
    layer.innerHTML = `
      <div class="component-assist__panel">
        <picture class="component-assist__picture" aria-hidden="true">
          <source media="(max-width: 767px)" srcset="${root}assets/images/popup/panel-connector-ic-blue-mobile.webp">
          <img src="${root}assets/images/popup/panel-connector-ic-blue.webp" alt="">
        </picture>
        <button class="component-assist__close" type="button" aria-label="Закрыть">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
        <div class="component-assist__body">
          <div class="component-assist__content">
            <h2 id="componentAssistTitle">Нужен компонент<br>или аналог?</h2>
            <p class="component-assist__intro" id="componentAssistIntro">Свяжемся и <span>уточним задачу.</span></p>
            <form class="component-assist__form" action="${root}scripts/send.php" method="post" novalidate>
              <input type="hidden" name="kind" value="component-assist">
              <input type="hidden" name="page_url">
              <div hidden><input name="honeypot" tabindex="-1" autocomplete="off"></div>
              <div class="component-assist__field">
                <input id="componentAssistEmail" type="email" name="email" autocomplete="email"
                  placeholder="Email для ответа" aria-label="Email для ответа" aria-describedby="componentAssistEmailError" maxlength="254" required>
                <p class="component-assist__error component-assist__email-error" id="componentAssistEmailError" role="alert"></p>
              </div>
              <button class="component-assist__button" type="submit">Запросить подбор</button>
              <div class="component-assist__consent">
                <input id="componentAssistConsent" type="checkbox" name="consent" value="1" required
                  aria-labelledby="componentAssistConsentLabel componentAssistConsentLink" aria-describedby="componentAssistConsentError">
                <div>
                  <label for="componentAssistConsent" id="componentAssistConsentLabel">Согласен на</label>
                  <a id="componentAssistConsentLink" href="${root}pages/consent.html" target="_blank" rel="noopener">обработку данных</a>
                  <a class="component-assist__policy" href="${root}pages/privacy-policy.html" target="_blank" rel="noopener">Политика <span>конфиденциальности</span></a>
                  <p class="component-assist__error" id="componentAssistConsentError" role="alert"></p>
                </div>
              </div>
              <p class="component-assist__error component-assist__form-error" role="alert"></p>
            </form>
            <div class="component-assist__success" hidden>
              <button class="component-assist__button" type="button">Закрыть</button>
            </div>
          </div>
        </div>
      </div>`;
    layer.setAttribute('aria-describedby', 'componentAssistIntro');
    document.body.append(layer);

    const form = layer.querySelector('form');
    const email = form.elements.email;
    const consent = form.elements.consent;
    const submit = form.querySelector('[type="submit"]');
    const emailError = layer.querySelector('#componentAssistEmailError');
    const consentError = layer.querySelector('#componentAssistConsentError');
    const formError = layer.querySelector('.component-assist__form-error');
    const close = () => window.ICDialogs.close();
    const done = layer.querySelector('.component-assist__success');
    layer.querySelector('.component-assist__close').addEventListener('click', close);
    done.querySelector('button').addEventListener('click', close);
    layer.addEventListener('click', event => { if (event.target === layer) close(); });

    function validation(field, message, error = '') {
      message.textContent = error;
      if (error) field.setAttribute('aria-invalid', 'true');
      else field.removeAttribute('aria-invalid');
    }
    email.addEventListener('input', () => validation(email, emailError));
    consent.addEventListener('change', () => validation(consent, consentError));

    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (submit.disabled) return;
      formError.textContent = '';
      if (!email.validity.valid) {
        validation(email, emailError, 'Введите корректный email.');
        email.focus();
        return;
      }
      if (!consent.checked) {
        validation(consent, consentError, 'Отметьте согласие.');
        consent.focus();
        return;
      }

      form.elements.page_url.value = location.href;
      submit.disabled = true;
      submit.textContent = 'Отправляем…';
      try {
        const response = await fetch(form.action, { method: 'POST', body: new FormData(form) });
        const result = await response.json();
        if (!response.ok || result?.ok !== true) {
          formError.textContent = result?.error || 'Не удалось отправить запрос. Попробуйте ещё раз.';
          return;
        }
        trackTimer('accepted');
        layer.classList.add('component-assist--sent');
        layer.querySelector('h2').textContent = 'Запрос отправлен';
        layer.querySelector('#componentAssistIntro').innerHTML = 'Свяжемся с вами<br>по указанному email.';
        form.reset();
        form.hidden = true;
        done.hidden = false;
        if (window.ICDialogs.isActive(layer)) done.querySelector('button').focus();
      } catch {
        formError.textContent = 'Не удалось отправить запрос. Попробуйте ещё раз.';
      } finally {
        submit.disabled = false;
        submit.textContent = 'Запросить подбор';
      }
    });
    return layer;
  }

  document.addEventListener('DOMContentLoaded', reportEligible, { once: true });
  document.querySelector('[data-cookie-action="accept"]')?.addEventListener('click', () => {
    queueMicrotask(reportEligible);
  }, { once: true });
  document.addEventListener('visibilitychange', syncTiming);
  window.addEventListener('focus', syncTiming);
  window.addEventListener('blur', stopTiming);
  window.addEventListener('pagehide', pausePage);
  window.addEventListener('pageshow', resumePage);
  document.addEventListener('pointerdown', rememberFilterInteraction, true);
  document.addEventListener('input', rememberFilterInteraction, true);
  syncTiming();
})();
