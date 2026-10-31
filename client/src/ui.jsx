// Shared bits: motion tokens, palette, animated number, confetti, buttons.
import { useCallback, useEffect, useState } from 'react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { CakeSlice, CupSoda, Flame, Cookie, UtensilsCrossed } from 'lucide-react';

// Motion tokens — one place for timing, chosen per purpose (not one duration everywhere).
export const T = {
  tap: { type: 'spring', stiffness: 700, damping: 30 },        // press feedback
  spring: { type: 'spring', stiffness: 420, damping: 30 },     // controls swapping
  soft: { type: 'spring', stiffness: 260, damping: 26 },       // content entering
  bouncy: { type: 'spring', stiffness: 320, damping: 14 },     // celebration moments
  sheet: { type: 'spring', stiffness: 380, damping: 38 },      // bottom sheet
  fade: { duration: 0.2, ease: [0.2, 0.7, 0.3, 1] },
};
export const press = { whileTap: { scale: 0.95 }, transition: T.tap };

// Navrang palette: [fill, ink]
export const NINE = [
  ['var(--orange)', 'var(--orange-ink)'], ['var(--red)', 'var(--red-ink)'], ['var(--royal)', 'var(--royal-ink)'],
  ['var(--yellow)', 'var(--yellow-ink)'], ['var(--green)', 'var(--green-ink)'], ['var(--purple)', 'var(--purple-ink)'],
  ['var(--peacock)', 'var(--peacock-ink)'], ['var(--pink)', 'var(--pink-ink)'], ['var(--grey)', 'var(--grey-ink)'],
];
const CONFETTI = ['#f97316', '#e11d48', '#2563eb', '#f5b700', '#16a34a', '#9333ea', '#0d9488', '#ec4899', '#8a8f98'];

export function CategoryIcon({ name, size = 20 }) {
  const n = name.toLowerCase();
  const I = /drink|bev|chai|tea|juice|soda|lassi/.test(n) ? CupSoda
    : /sweet|dessert|mithai/.test(n) ? CakeSlice
    : /chaat|spicy|street/.test(n) ? Flame
    : /snack|starter|farsan/.test(n) ? Cookie : UtensilsCrossed;
  return <I size={size} strokeWidth={2} aria-hidden="true" />;
}

export const makeMoney = (cur = '₹') => (n) => cur + Math.round(n).toLocaleString('en-IN');

// Number that tweens to its new value.
export function AnimatedNumber({ value, format = (v) => Math.round(v) }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const text = useTransform(mv, format);
  useEffect(() => {
    const c = animate(mv, value, reduce ? { duration: 0 } : { duration: 0.6, ease: 'easeOut' });
    return () => c.stop();
  }, [value, reduce, mv]);
  return <motion.span style={{ fontVariantNumeric: 'tabular-nums' }}>{text}</motion.span>;
}

// Nine-colour confetti burst. Usage: const [confetti, fire] = useConfetti(); fire(element)
export function useConfetti() {
  const reduce = useReducedMotion();
  const [bursts, setBursts] = useState([]);
  const fire = useCallback((el, n = 40) => {
    if (reduce || !el) return;
    const r = el.getBoundingClientRect();
    const id = Math.random();
    const pieces = Array.from({ length: n }, (_, i) => {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.5, d = 90 + Math.random() * 150;
      return { i, x: Math.cos(a) * d, y: Math.sin(a) * d - 60, rot: Math.random() * 720 - 360, size: 6 + Math.random() * 6, long: Math.random() > 0.5, round: Math.random() > 0.5, dur: 1.4 + Math.random() * 0.6 };
    });
    setBursts((b) => [...b, { id, cx: r.left + r.width / 2, cy: r.top + r.height / 2, pieces }]);
    setTimeout(() => setBursts((b) => b.filter((x) => x.id !== id)), 2200);
  }, [reduce]);
  const node = bursts.map((b) => (
    <div key={b.id} aria-hidden="true" style={{ position: 'fixed', left: b.cx, top: b.cy, zIndex: 99, pointerEvents: 'none' }}>
      {b.pieces.map((p) => (
        <motion.i key={p.i}
          style={{ position: 'absolute', width: p.size, height: p.long ? p.size * 2.2 : p.size, background: CONFETTI[p.i % 9], borderRadius: p.round ? '50%' : 2 }}
          initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
          animate={{ x: [0, p.x, p.x * 1.1], y: [0, p.y, p.y + 280], rotate: p.rot, opacity: [1, 1, 0] }}
          transition={{ duration: p.dur, ease: [0.2, 0.7, 0.4, 1] }} />
      ))}
    </div>
  ));
  return [node, fire];
}

// Spinning rangoli circle that blooms in.
export function Mandala({ className, style, reverse }) {
  return (
    <motion.div className={`mandala ${className || ''}`} style={style} aria-hidden="true"
      initial={{ scale: 0.3, opacity: 0 }}
      animate={{ scale: 1, opacity: style?.opacity ?? 0.28, rotate: reverse ? -360 : 360 }}
      transition={{ scale: { duration: 1.2, ease: [0.2, 0.7, 0.3, 1] }, opacity: { duration: 1 }, rotate: { duration: 60, repeat: Infinity, ease: 'linear' } }} />
  );
}

export async function fetchJSON(url, opts) {
  const r = await fetch(url, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.error || 'Something went wrong'); e.status = r.status; throw e; }
  return data;
}

// Glowing embers drifting up behind the page (like the poster's sparks).
export function Embers({ count = 22 }) {
  const reduce = useReducedMotion();
  const [sparks] = useState(() => Array.from({ length: count }, (_, i) => ({
    i, left: Math.random() * 100, size: 3 + Math.random() * 5, dur: 7 + Math.random() * 9,
    delay: -Math.random() * 16, drift: (Math.random() - 0.5) * 80, peak: 0.5 + Math.random() * 0.5,
  })));
  if (reduce) return null;
  return (
    <div className="embers" aria-hidden="true">
      {sparks.map((s) => (
        <motion.i key={s.i} style={{ left: `${s.left}%`, width: s.size, height: s.size }}
          animate={{ y: [0, -window.innerHeight - 40], x: [0, s.drift], opacity: [0, s.peak, s.peak, 0] }}
          transition={{ duration: s.dur, delay: s.delay, repeat: Infinity, ease: 'linear', times: [0, 0.15, 0.8, 1] }} />
      ))}
    </div>
  );
}

// Gold temple bell hanging on a chain, gently swinging.
export function TempleBell({ side = 'left', chain = 60, delay = 0 }) {
  return (
    <motion.div className={`bell bell-${side}`} aria-hidden="true" style={{ transformOrigin: 'top center' }}
      initial={{ rotate: 0 }} animate={{ rotate: [6, -6, 6] }} transition={{ duration: 3.2, delay, repeat: Infinity, ease: 'easeInOut' }}>
      <span className="chain" style={{ height: chain }} />
      <svg width="34" height="40" viewBox="0 0 34 40">
        <defs>
          <linearGradient id={`bg-${side}`} x1="0" x2="1">
            <stop offset="0" stopColor="#8a5a16" /><stop offset=".45" stopColor="#ffd27a" /><stop offset="1" stopColor="#8a5a16" />
          </linearGradient>
        </defs>
        <circle cx="17" cy="4" r="3.5" fill="none" stroke="#e0a64a" strokeWidth="2" />
        <path d="M17 7c-7 0-10 6-10 13v8l-4 5h28l-4-5v-8c0-7-3-13-10-13z" fill={`url(#bg-${side})`} />
        <circle cx="17" cy="36" r="3" fill="#ffcf6b" />
      </svg>
    </motion.div>
  );
}
