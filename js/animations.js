/**
 * Animations — GSAP ScrollTrigger + Lenis smooth scroll
 * One-shot scroll animations, velocity-adaptive timing
 */

(function () {
  'use strict';

  gsap.registerPlugin(ScrollTrigger);

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  // ═══════════════════════════════════════
  // LENIS SMOOTH SCROLL (desktop only)
  // ═══════════════════════════════════════

  const isMobile = window.matchMedia('(max-width: 768px)').matches;

  if (!isMobile && typeof Lenis !== 'undefined') {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      smoothTouch: false,
    });

    // Connect Lenis to GSAP ticker
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((time) => lenis.raf(time * 1000));
    gsap.ticker.lagSmoothing(0);
  }


  // ═══════════════════════════════════════
  // SCROLL VELOCITY TRACKER
  // ═══════════════════════════════════════

  let scrollVelocity = 0;

  ScrollTrigger.create({
    onUpdate: (self) => {
      scrollVelocity = self.getVelocity() / 1000;
    },
  });

  function adaptiveDuration(base) {
    const speed = Math.min(Math.abs(scrollVelocity), 6);
    const factor = 1 - speed / 8;
    return Math.max(0.3, base * Math.max(0.3, factor));
  }

  function adaptiveStagger(base) {
    const speed = Math.min(Math.abs(scrollVelocity), 6);
    const factor = 1 - speed / 8;
    return Math.max(0.02, base * Math.max(0.25, factor));
  }


  // ═══════════════════════════════════════
  // 1. FADE-UP — one-shot, velocity-adaptive
  // ═══════════════════════════════════════

  const fadeEls = gsap.utils.toArray('[data-animate="fade-up"]');
  if (fadeEls.length) {
    gsap.set(fadeEls, { y: 30, opacity: 0 });
    ScrollTrigger.batch(fadeEls, {
      start: 'top 90%',
      once: true,
      onEnter: (batch) => {
        gsap.to(batch, {
          y: 0, opacity: 1,
          duration: adaptiveDuration(1.2),
          stagger: { each: adaptiveStagger(0.1), from: 'start' },
          ease: 'power2.out',
          force3D: true,
          overwrite: true,
        });
      },
    });
  }


  // ═══════════════════════════════════════
  // 2. STAGGERED CHILDREN — one-shot
  // After trigger, remove data-animate attr so CSS rule stops applying opacity:0
  // to dynamically inserted children (catalog re-renders cards on filter change).
  // ═══════════════════════════════════════

  gsap.utils.toArray('[data-animate="fade-up-stagger"]').forEach((container) => {
    const children = gsap.utils.toArray(container.children);
    gsap.set(children, { y: 30, opacity: 0 });
    ScrollTrigger.create({
      trigger: container,
      start: 'top 90%',
      once: true,
      onEnter: () => {
        gsap.to(children, {
          y: 0, opacity: 1,
          duration: adaptiveDuration(1.2),
          stagger: { each: adaptiveStagger(0.12), from: 'start' },
          ease: 'power2.out',
          force3D: true,
          overwrite: true,
          onComplete: () => container.removeAttribute('data-animate'),
        });
      },
    });
  });


  // ═══════════════════════════════════════
  // 3. SPLIT TEXT — one-shot word reveal
  // ═══════════════════════════════════════

  gsap.utils.toArray('[data-animate="split"]').forEach((el) => {
    const html = el.innerHTML;
    const parts = html.split(/(<[^>]+>)/gi);

    el.innerHTML = parts.map((part) => {
      if (part.match(/^<[^>]+>$/)) return part;
      return part
        .split(/\s+/)
        .filter((w) => w.length > 0)
        .map((word) => `<span class="word"><span class="word-inner">${word}</span></span>`)
        .join(' ');
    }).join(' ').replace(/\s{2,}/g, ' ');

    const words = el.querySelectorAll('.word-inner');
    gsap.set(words, { y: '130%' });

    ScrollTrigger.create({
      trigger: el,
      start: 'top 88%',
      once: true,
      onEnter: () => {
        gsap.to(words, {
          y: 0,
          duration: adaptiveDuration(1.0),
          stagger: { each: adaptiveStagger(0.04), from: 'start' },
          ease: 'power3.out',
          force3D: true,
          overwrite: true,
        });
      },
    });
  });


  // ═══════════════════════════════════════
  // 4. SCALE REVEAL — one-shot
  // ═══════════════════════════════════════

  gsap.utils.toArray('[data-animate="scale-reveal"]').forEach((wrap) => {
    const inner = wrap.querySelector('img, video, div');
    if (!inner) return;
    gsap.set(inner, { y: 15, opacity: 0, scale: 1.05 });
    ScrollTrigger.create({
      trigger: wrap,
      start: 'top 88%',
      once: true,
      onEnter: () => {
        gsap.to(inner, {
          y: 0, opacity: 1, scale: 1,
          duration: adaptiveDuration(1.4),
          ease: 'power2.out',
          force3D: true,
          overwrite: true,
        });
      },
    });
  });


  // ═══════════════════════════════════════
  // 5. LINE DRAW — one-shot
  // ═══════════════════════════════════════

  gsap.utils.toArray('[data-animate="line-draw"]').forEach((el) => {
    gsap.set(el, { scaleX: 0 });
    ScrollTrigger.create({
      trigger: el,
      start: 'top 92%',
      once: true,
      onEnter: () => {
        gsap.to(el, {
          scaleX: 1,
          duration: adaptiveDuration(1.2),
          ease: 'power2.inOut',
          overwrite: true,
        });
      },
    });
  });

})();
