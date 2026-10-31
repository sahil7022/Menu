// Shared animation helpers (Motion = Framer Motion's vanilla JS engine) + SVG icon set.
// Every helper respects prefers-reduced-motion and degrades to "no animation" if Motion fails to load.
(function () {
  const M = window.Motion || {};
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ok = !!M.animate && !reduce;

  const SPRING = { type: 'spring', stiffness: 420, damping: 30 };
  const SOFT = { type: 'spring', stiffness: 260, damping: 26 };
  const done = Promise.resolve();

  const animate = (el, kf, opts) => {
    if (!el || (el.length === 0)) return done;
    if (!ok) { // jump to the final state
      const els = el instanceof Element ? [el] : Array.from(el);
      const last = (v) => (Array.isArray(v) ? v[v.length - 1] : v);
      for (const e of els) {
        if ('opacity' in kf) e.style.opacity = last(kf.opacity);
        e.style.transform = '';
      }
      return done;
    }
    const a = M.animate(el, kf, opts);
    return a.finished || a;
  };
  const stagger = (d, o) => (ok ? M.stagger(d, o) : 0);

  const fx = {
    ok, reduce, SPRING, SOFT, animate, stagger,

    // Elements rise + fade in, one after another.
    enter(els, { y = 16, delay = 0, gap = 0.05, scale = 1 } = {}) {
      return animate(els, { opacity: [0, 1], y: [y, 0], scale: [scale, 1] }, { ...SOFT, delay: ok ? M.stagger(gap, { startDelay: delay }) : 0 });
    },

    // Reveal elements as they scroll into view.
    reveal(els) {
      if (!ok || !M.inView) return;
      for (const el of els) {
        el.style.opacity = 0;
        M.inView(el, () => { animate(el, { opacity: [0, 1], y: [18, 0] }, SOFT); }, { amount: 0.2 });
      }
    },

    // Quick "pop" feedback on tap/update.
    pop(el, s = 1.18) { return animate(el, { scale: [1, s, 1] }, { duration: 0.35, ease: 'easeOut' }); },
    shake(el) { return animate(el, { x: [0, -8, 8, -6, 6, 0] }, { duration: 0.4 }); },

    // Tween a number inside an element.
    count(el, to, fmt = (v) => Math.round(v)) {
      const from = Number(el.dataset.v || 0);
      el.dataset.v = to;
      if (!ok || from === to) { el.textContent = fmt(to); return; }
      M.animate(from, to, { duration: 0.6, ease: 'easeOut', onUpdate: (v) => { el.textContent = fmt(v); } });
    },

    // Press feedback for any [data-press] element (spring scale down/up).
    pressable(root = document) {
      if (!ok || !M.press) return;
      M.press(root.querySelectorAll('[data-press]:not([data-pressed-bound])'), (el) => {
        animate(el, { scale: 0.94 }, { type: 'spring', stiffness: 700, damping: 30 });
        return () => animate(el, { scale: 1 }, SPRING);
      });
      root.querySelectorAll('[data-press]').forEach((el) => el.setAttribute('data-pressed-bound', ''));
    },

    // FLIP: animate siblings to their new positions after a DOM change.
    async flip(container, mutate) {
      const before = new Map();
      if (ok) for (const el of container.children) if (el.dataset.key) before.set(el.dataset.key, el.getBoundingClientRect());
      mutate();
      if (!ok) return;
      const entering = [];
      for (const el of container.children) {
        const prev = before.get(el.dataset.key);
        if (!el.dataset.key) continue;
        if (!prev) { entering.push(el); continue; }
        const now = el.getBoundingClientRect();
        const dx = prev.left - now.left, dy = prev.top - now.top;
        if (dx || dy) animate(el, { x: [dx, 0], y: [dy, 0] }, SOFT);
      }
      if (entering.length && before.size) animate(entering, { opacity: [0, 1], scale: [0.85, 1], y: [-20, 0] }, { ...SOFT, delay: M.stagger(0.06) });
      else if (entering.length) fx.enter(entering, { gap: 0.04 });
    },

    // Nine-colour confetti burst from an element.
    confetti(origin, n = 36) {
      if (!ok) return;
      const r = origin.getBoundingClientRect();
      const colors = ['#ff7a00', '#e0123b', '#1d3fbf', '#ffc400', '#11a84a', '#7b1fa2', '#00a3a3', '#ff2e93', '#8a8f98'];
      for (let i = 0; i < n; i++) {
        const d = document.createElement('i');
        const size = 6 + Math.random() * 6;
        Object.assign(d.style, {
          position: 'fixed', left: r.left + r.width / 2 + 'px', top: r.top + r.height / 2 + 'px', width: size + 'px', height: size * (Math.random() > .5 ? 1 : 2.2) + 'px',
          background: colors[i % 9], borderRadius: Math.random() > .5 ? '50%' : '2px', zIndex: 99, pointerEvents: 'none',
        });
        document.body.appendChild(d);
        const a = (Math.PI * 2 * i) / n + Math.random() * .5, dist = 90 + Math.random() * 140;
        M.animate(d, { x: [0, Math.cos(a) * dist, Math.cos(a) * dist * 1.1], y: [0, Math.sin(a) * dist - 60, Math.sin(a) * dist + 220], rotate: [0, Math.random() * 720 - 360], opacity: [1, 1, 0] },
          { duration: 1.4 + Math.random() * .6, ease: [0.2, 0.7, 0.4, 1] }).then(() => d.remove());
      }
    },
  };

  // Lucide icons (MIT) as inline SVG strings.
  const P = {
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    minus: '<path d="M5 12h14"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    arrow: '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    bellOff: '<path d="M8.7 3A6 6 0 0 1 18 8a21.3 21.3 0 0 0 .6 5"/><path d="M17 17H3s3-2 3-9a4.67 4.67 0 0 1 .3-1.7"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="m2 2 20 20"/>',
    qr: '<rect width="5" height="5" x="3" y="3" rx="1"/><rect width="5" height="5" x="16" y="3" rx="1"/><rect width="5" height="5" x="3" y="16" rx="1"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/><path d="M21 21v.01"/><path d="M12 7v3a2 2 0 0 1-2 2H7"/><path d="M3 12h.01"/><path d="M12 3h.01"/><path d="M12 16v.01"/><path d="M16 12h1"/><path d="M21 12v.01"/><path d="M12 21v-1"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
    cookie: '<path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"/><path d="M8.5 8.5v.01"/><path d="M16 15.5v.01"/><path d="M12 12v.01"/><path d="M11 17v.01"/><path d="M7 14v.01"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    candy: '<path d="m9.5 7.5-2 2a4.95 4.95 0 1 0 7 7l2-2a4.95 4.95 0 1 0-7-7Z"/><path d="M14 6.5v10"/><path d="M10 7.5v10"/><path d="m16 7 1-5 1.37.68A3 3 0 0 0 19.7 3H21v1.3c0 .46.1.92.32 1.33L22 7l-5 1"/><path d="m8 17-1 5-1.37-.68A3 3 0 0 0 4.3 21H3v-1.3a3 3 0 0 0-.32-1.33L2 17l5-1"/>',
    cup: '<path d="m6 8 1.75 12.28a2 2 0 0 0 2 1.72h4.54a2 2 0 0 0 2-1.72L18 8"/><path d="M5 8h14"/><path d="M7 15a6.47 6.47 0 0 1 5 0 6.47 6.47 0 0 0 5 0"/><path d="m12 8 1-6h2"/>',
    note: '<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/><path d="M15 3v4a2 2 0 0 0 2 2h4"/>',
    printer: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    chef: '<path d="M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1Z"/><path d="M6 17h12"/>',
    receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 17.5v-11"/>',
    checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    undo: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    list: '<path d="M3 12h.01"/><path d="M3 18h.01"/><path d="M3 6h.01"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M8 6h13"/>',
  };
  const icon = (name, size = 20, cls = '') =>
    `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.utensils}</svg>`;

  // Navrang palette: [fill, readable-ink-on-white]
  const NINE = [
    ['#ff7a00', '#b45309'], ['#e0123b', '#be123c'], ['#1d3fbf', '#1d3fbf'], ['#f5b700', '#92400e'], ['#11a84a', '#15803d'],
    ['#7b1fa2', '#7b1fa2'], ['#00a3a3', '#0f766e'], ['#ff2e93', '#be185d'], ['#8a8f98', '#4b5563'],
  ];
  const catIcon = (name) => {
    const n = name.toLowerCase();
    if (/drink|bev|chai|tea|juice|soda|lassi/.test(n)) return 'cup';
    if (/sweet|dessert|mithai/.test(n)) return 'candy';
    if (/chaat|spicy|street/.test(n)) return 'flame';
    if (/snack|starter|farsan/.test(n)) return 'cookie';
    return 'utensils';
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  window.fx = fx;
  window.icon = icon;
  window.NINE = NINE;
  window.catIcon = catIcon;
  window.esc = esc;
})();
