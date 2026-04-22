/*!
 * Portfolio — James Delali Torkornoo
 * Main JS: cursor, theme, scroll animations, nav
 */

(function () {
  'use strict';

  /* ── Helpers ── */
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];
  const html = document.documentElement;

  /* ══════════════════════════════════════════════
     1. PRELOAD REMOVAL
  ══════════════════════════════════════════════ */
  window.addEventListener('load', () => {
    setTimeout(() => document.body.classList.remove('is-preload'), 120);
  });

  /* ══════════════════════════════════════════════
     2. CUSTOM CURSOR
  ══════════════════════════════════════════════ */
  const dot  = $('#cursor-dot');
  const ring = $('#cursor-ring');

  if (dot && ring && window.matchMedia('(hover: hover)').matches) {
    let mx = -100, my = -100;
    let rx = -100, ry = -100;
    let raf;

    document.addEventListener('mousemove', e => {
      mx = e.clientX;
      my = e.clientY;
      dot.style.left = mx + 'px';
      dot.style.top  = my + 'px';
    });

    function animateRing() {
      rx += (mx - rx) * 0.12;
      ry += (my - ry) * 0.12;
      ring.style.left = rx + 'px';
      ring.style.top  = ry + 'px';
      raf = requestAnimationFrame(animateRing);
    }
    animateRing();

    /* Hover state on interactive elements */
    const hoverTargets = 'a, button, [role="button"], input, textarea, select, label, .nav-link, .btn-primary, .btn-ghost';
    document.addEventListener('mouseover', e => {
      if (e.target.closest(hoverTargets)) document.body.classList.add('cursor-hover');
    });
    document.addEventListener('mouseout', e => {
      if (e.target.closest(hoverTargets)) document.body.classList.remove('cursor-hover');
    });

    document.addEventListener('mouseleave', () => {
      dot.style.opacity  = '0';
      ring.style.opacity = '0';
    });
    document.addEventListener('mouseenter', () => {
      dot.style.opacity  = '';
      ring.style.opacity = '';
    });
  }

  /* ══════════════════════════════════════════════
     3. THEME TOGGLE
  ══════════════════════════════════════════════ */
  const themeBtn = $('#theme-toggle');
  const THEME_KEY = 'jdt-theme';

  function applyTheme(theme) {
    html.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }

  /* Respect system preference on first visit */
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) {
    applyTheme(saved);
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  }

  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const current = html.getAttribute('data-theme');
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });
  }

  /* ══════════════════════════════════════════════
     4. ACTIVE NAV LINK (IntersectionObserver)
  ══════════════════════════════════════════════ */
  const sections = $$('section[id], div[id]').filter(el =>
    ['intro','one','two','four'].includes(el.id)
  );
  const navLinks = $$('.nav-link');

  if ('IntersectionObserver' in window && sections.length) {
    const io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          navLinks.forEach(a => a.classList.remove('active'));
          const active = navLinks.find(a => a.getAttribute('href') === '#' + entry.target.id);
          if (active) active.classList.add('active');
        }
      });
    }, { threshold: 0.35 });

    sections.forEach(s => io.observe(s));
  }

  /* ══════════════════════════════════════════════
     5. SMOOTH SCROLL (native + polyfill)
  ══════════════════════════════════════════════ */
  document.addEventListener('click', e => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const target = document.getElementById(link.getAttribute('href').slice(1));
    if (!target) return;
    e.preventDefault();

    const topbarH = window.innerWidth <= 1280 ? 56 : 0;
    const top = target.getBoundingClientRect().top + window.scrollY - topbarH;

    window.scrollTo({ top, behavior: 'smooth' });
  });

  /* ══════════════════════════════════════════════
     6. SCROLL REVEAL (fade-up wrappers + spotlights + features)
  ══════════════════════════════════════════════ */
  function revealOnScroll() {
    const revealTargets = [
      ...$$('.wrapper.fade-up'),
      ...$$('.spotlight-item'),
      ...$$('.features'),
    ];

    if (!('IntersectionObserver' in window)) {
      revealTargets.forEach(el => el.classList.remove('inactive'));
      return;
    }

    const revealIO = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.remove('inactive');
          revealIO.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });

    revealTargets.forEach(el => {
      el.classList.add('inactive');
      revealIO.observe(el);
    });
  }

  revealOnScroll();

  /* ══════════════════════════════════════════════
     7. FOOTER YEAR
  ══════════════════════════════════════════════ */
  const yearEl = document.getElementById('currentYear');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ══════════════════════════════════════════════
     8. MOBILE NAV TOGGLE (≤736px)
  ══════════════════════════════════════════════ */
  // Nav is hidden on mobile via CSS; sidebar brand acts as anchor back to top
  const brand = $('.sidebar-brand');
  if (brand) {
    brand.style.cursor = 'pointer';
    brand.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

})();
