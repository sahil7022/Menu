// Opening splash: Hawres logo with fireworks behind it. Shown once per visit (e.g. right after scanning the QR).
import { useEffect, useRef } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import ChatoreLogo from './ChatoreLogo.jsx';
import { T } from './ui.jsx';

const COLORS = ['#ff7a1a', '#ffd27a', '#ff3d6e', '#9db8ff', '#74e39f', '#d6a4ff', '#5fe0d0', '#ffa3d1', '#fff1c9'];

function Fireworks() {
  const ref = useRef();
  useEffect(() => {
    const c = ref.current, ctx = c.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w, h, raf, last = performance.now(), nextRocket = 0, stopped = false;
    const resize = () => { w = c.clientWidth; h = c.clientHeight; c.width = w * dpr; c.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    resize(); addEventListener('resize', resize);
    const rockets = [], sparks = [];
    const launch = () => rockets.push({
      x: w * (0.15 + Math.random() * 0.7), y: h + 10, vx: (Math.random() - 0.5) * 60,
      vy: -(h * (0.9 + Math.random() * 0.35)), target: h * (0.12 + Math.random() * 0.35), color: COLORS[(Math.random() * COLORS.length) | 0],
    });
    const burst = (r) => {
      const n = 46 + ((Math.random() * 24) | 0), ring = Math.random() > 0.5;
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n, sp = (ring ? 170 : 60 + Math.random() * 160) * (0.8 + Math.random() * 0.4);
        sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, decay: 0.55 + Math.random() * 0.4,
          color: Math.random() > 0.2 ? r.color : '#fff1c9', size: 1.6 + Math.random() * 1.6 });
      }
    };
    const frame = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      // fade the previous frame for trails
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      if (!stopped && now > nextRocket) { launch(); if (Math.random() > 0.5) launch(); nextRocket = now + 260 + Math.random() * 300; }
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.x += r.vx * dt; r.y += r.vy * dt; r.vy += 520 * dt;
        ctx.fillStyle = '#ffd27a'; ctx.beginPath(); ctx.arc(r.x, r.y, 2.2, 0, 7); ctx.fill();
        if (r.y <= r.target || r.vy >= 0) { burst(r); rockets.splice(i, 1); }
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.vx *= 0.985; s.vy = s.vy * 0.985 + 90 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= s.decay * dt;
        if (s.life <= 0) { sparks.splice(i, 1); continue; }
        ctx.globalAlpha = Math.max(0, s.life); ctx.fillStyle = s.color;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.size, 0, 7); ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const stop = setTimeout(() => { stopped = true; }, 2200);
    return () => { cancelAnimationFrame(raf); clearTimeout(stop); removeEventListener('resize', resize); };
  }, []);
  return <canvas ref={ref} className="fireworks" aria-hidden="true" />;
}

export default function Splash({ menu, onDone }) {
  const reduce = useReducedMotion();
  useEffect(() => { const t = setTimeout(onDone, reduce ? 1100 : 2900); return () => clearTimeout(t); }, [onDone, reduce]);
  const ev = menu?.event;
  return (
    <motion.div className="splash" onClick={onDone} role="dialog" aria-label="Welcome to Hawres"
      initial={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.45 } }}>
      {!reduce && <Fireworks />}
      <div className="splash-glow" aria-hidden="true" />
      <motion.div className="splash-center" initial={{ scale: 0.4, opacity: 0, rotate: -12 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ ...T.bouncy, delay: 0.15 }}>
        <ChatoreLogo size={150} />
      </motion.div>
      <motion.div className="splash-words" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...T.soft, delay: 0.55 }}>
        <span className="logo gold-text brand">{(menu?.stallName || 'Hawres').toLowerCase()}</span>
        {menu?.stallNameHindi && <span className="hindi brand" lang="hi">{menu.stallNameHindi}</span>}
        {ev && <span className="splash-ev">✦ {ev.name} · {ev.dates} ✦</span>}
      </motion.div>
      <motion.span className="splash-skip" initial={{ opacity: 0 }} animate={{ opacity: 0.7 }} transition={{ delay: 1.4 }}>Tap to continue</motion.span>
    </motion.div>
  );
}
