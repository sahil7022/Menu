// Shared bits: motion tokens, palette, animated number, confetti, buttons.
import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from 'framer-motion';
import { CakeSlice, Coffee, CupSoda, Flame, Cookie, Moon, Soup, Sun, UtensilsCrossed } from 'lucide-react';

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
  const I = /^(tea|chai|coffee)\b|hot drink/.test(n) ? Coffee
    : /drink|bev|juice|soda|lassi/.test(n) ? CupSoda
    : /chinese|noodle|momo|manchurian|soup|maggi/.test(n) ? Soup
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

// Spinning golden mandala that blooms in (spin is CSS so it stays smooth while scrolling).
export function Mandala({ className, style, reverse }) {
  const { opacity = 0.28, ...rest } = style || {};
  return (
    <motion.div className={className} style={{ position: 'absolute', ...rest }} aria-hidden="true"
      initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity }} transition={{ duration: 1.2, ease: [0.2, 0.7, 0.3, 1] }}>
      <div className={`mandala spin ${reverse ? 'rev' : ''}`} style={{ width: '100%', height: '100%' }} />
    </motion.div>
  );
}

export async function fetchJSON(url, opts) {
  const r = await fetch(url, opts);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.error || 'Something went wrong'); e.status = r.status; throw e; }
  return data;
}

// Glowing embers drifting up behind the page (pure CSS animation — smooth while scrolling).
export function Embers({ count = 22 }) {
  const reduce = useReducedMotion();
  const n = typeof window !== 'undefined' && window.innerWidth < 600 ? Math.round(count * 0.55) : count;
  const [sparks] = useState(() => Array.from({ length: n }, (_, i) => ({
    i, left: Math.random() * 100, size: 3 + Math.random() * 5, dur: 7 + Math.random() * 9,
    delay: -Math.random() * 16, drift: (Math.random() - 0.5) * 80, peak: 0.5 + Math.random() * 0.5,
  })));
  if (reduce) return null;
  return (
    <div className="embers" aria-hidden="true">
      {sparks.map((s) => (
        <i key={s.i} style={{ left: `${s.left}%`, width: s.size, height: s.size, '--d': `${s.dur}s`, '--delay': `${s.delay}s`, '--dx': `${s.drift}px`, '--peak': s.peak }} />
      ))}
    </div>
  );
}

// Gold temple bell hanging on a chain, gently swinging.
export function TempleBell({ side = 'left', chain = 60, delay = 0 }) {
  return (
    <div className={`bell bell-${side} swing`} aria-hidden="true" style={{ animationDelay: `${delay}s` }}>
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
    </div>
  );
}

// ---------- Light / dark theme ----------
const THEME_KEY = 'hawres_theme';
export const getTheme = () => document.documentElement.dataset.theme || 'dark';
function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(THEME_KEY, t); } catch { /* private mode */ }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'light' ? '#fff8ee' : '#0a0d22');
}
// Sun/moon button: switches with a circular reveal from the button (where supported).
export function ThemeToggle({ className = '' }) {
  const [theme, setTheme] = useState(getTheme);
  const reduce = useReducedMotion();
  function toggle(e) {
    const next = theme === 'dark' ? 'light' : 'dark';
    navigator.vibrate?.(8);
    const swap = () => { applyTheme(next); setTheme(next); };
    if (!document.startViewTransition || reduce) return swap();
    const r = e.currentTarget.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    document.startViewTransition(swap).ready.then(() => {
      document.documentElement.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
        { duration: 550, easing: 'cubic-bezier(.2,.7,.3,1)', pseudoElement: '::view-transition-new(root)' });
    }).catch(() => {});
  }
  return (
    <motion.button className={`themebtn ${className}`} onClick={toggle} whileTap={{ scale: 0.88 }}
      aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} title={theme === 'dark' ? 'Light theme' : 'Dark theme'}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={theme} style={{ display: 'grid' }} initial={{ rotate: -90, scale: 0.4, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: 1 }} exit={{ rotate: 90, scale: 0.4, opacity: 0 }} transition={{ duration: 0.25 }}>
          {theme === 'dark' ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}
