const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(path.join(__dirname, '../../js/animations.js'), 'utf8');

function media(matches) {
  let onChange;
  return {
    matches,
    addEventListener(_name, listener) { onChange = listener; },
    change(value) { this.matches = value; onChange?.(); },
  };
}

function exercise({ initiallyReduced = false, vendorAvailable = true } = {}) {
  const reduced = media(initiallyReduced);
  const mobile = media(false);
  const ticker = new Set();
  const scroll = [];
  const triggers = [];
  const tweens = [];
  const documentClasses = new Set();
  let overlayListener;
  let overlayOpen = false;
  const group = {
    children: [],
    removeAttribute(name) { this.removed = name; },
  };
  const gsap = {
    registerPlugin() {},
    ticker: {
      add: callback => ticker.add(callback),
      remove: callback => ticker.delete(callback),
      lagSmoothing() {},
    },
    utils: { toArray: selector => selector === '[data-animate="fade-up-stagger"]' ? [group] : [] },
    set() {},
    to: (elements, options) => tweens.push({ elements, options }),
  };
  class Lenis {
    constructor() { scroll.push('start instance'); }
    destroy() { scroll.push('destroy instance'); }
    stop() { scroll.push('pause'); }
    start() { scroll.push('resume'); }
    on() {}
    raf() {}
  }
  vm.runInNewContext(source, {
    gsap: vendorAvailable ? gsap : undefined,
    ScrollTrigger: { create: config => triggers.push(config), update() {} },
    Lenis,
    window: {
      matchMedia: query => query.includes('prefers-reduced-motion') ? reduced : mobile,
      getComputedStyle: element => ({ order: element.order }),
    },
    document: {
      documentElement: { classList: documentClasses },
      body: { classList: { contains: () => overlayOpen } },
      addEventListener: (_name, listener) => { overlayListener = listener; },
    },
  });
  return {
    reduced, mobile, ticker, scroll, group, tweens, triggers, documentClasses,
    setOverlay(open) {
      overlayOpen = open;
      overlayListener({ detail: { open } });
    },
  };
}

test('Smooth scrolling follows live reduced-motion and viewport changes without duplicate frame callbacks', () => {
  const runtime = exercise();
  assert.equal(runtime.ticker.size, 1);
  runtime.setOverlay(true);
  runtime.reduced.change(true);
  assert.equal(runtime.ticker.size, 0);
  runtime.reduced.change(false);
  assert.equal(runtime.ticker.size, 1);
  runtime.setOverlay(false);
  runtime.mobile.change(true);
  assert.equal(runtime.ticker.size, 0);
  assert.deepEqual(runtime.scroll, ['start instance', 'pause', 'destroy instance', 'start instance', 'pause', 'resume', 'destroy instance']);
});

test('Grouped reveals follow visible responsive order and honor a live reduced-motion change', () => {
  const runtime = exercise();
  const element = (name, order, visible = true) => ({ name, order, getClientRects: () => visible ? [{}] : [] });
  const start = runtime.triggers.find(trigger => trigger.trigger === runtime.group).onEnter;
  runtime.group.children = [element('description', 1), element('specs', 0, false), element('bullets', 3), element('actions', 2)];
  start();
  assert.deepEqual(Array.from(runtime.tweens[0].elements, elem => elem.name), ['description', 'actions', 'bullets']);
  runtime.tweens[0].options.onComplete();
  assert.equal(runtime.group.removed, 'data-animate');
  runtime.reduced.change(true);
  start();
  assert.equal(runtime.tweens.length, 1);
});

test('Content starts visible when motion is reduced or GSAP is unavailable', () => {
  for (const options of [{ initiallyReduced: true }, { vendorAvailable: false }]) {
    const runtime = exercise(options);
    assert.equal(runtime.documentClasses.has('ic-motion-ready'), false);
    assert.equal(runtime.ticker.size, 0);
    assert.equal(runtime.triggers.length, 0);
  }
});
