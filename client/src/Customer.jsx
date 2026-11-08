import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimate, useDragControls, useReducedMotion } from 'framer-motion';
import {
  ArrowRight, Bell, BellRing, Check, ChefHat, CircleCheck, Clock, Flame, Minus, NotebookPen, Plus, ReceiptText,
  Copy, MapPin, QrCode, Search, ShoppingBag, Smartphone, Sparkles, User, UtensilsCrossed, Wallet, X,
} from 'lucide-react';
import { AnimatedNumber, CategoryIcon, Embers, Mandala, NINE, T, TempleBell, fetchJSON, makeMoney, press, useConfetti } from './ui.jsx';
import StaffGate from './StaffGate.jsx';
import Splash from './Splash.jsx';
import { BrandMark } from './ChatoreLogo.jsx';
import { enablePush, pushState, useLive } from './live.js';
import { buzz } from './media.js';
import './customer.css';

const LS_NAME = 'navrang_name', LS_ORDERS = 'chatore_orders', LS_PUSHED = 'chatore_push_orders';
const readIds = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
const ACTIVE = ['new', 'preparing', 'ready'];

export default function Customer() {
  const [menu, setMenu] = useState(null);
  const [name, setName] = useState(() => localStorage.getItem(LS_NAME) || '');
  const [screen, setScreen] = useState(null);           // 'name' | 'menu' | 'done'
  const [cart, setCart] = useState({});                 // id -> qty
  const [sheet, setSheet] = useState(false);
  const [myIds, setMyIds] = useState(() => {            // every order this phone placed
    const ids = readIds(LS_ORDERS);
    const legacy = localStorage.getItem('navrang_last_order');
    return legacy && !ids.includes(legacy) ? [...ids, legacy] : ids;
  });
  const [myOrders, setMyOrders] = useState({});         // id -> order (live)
  const [viewId, setViewId] = useState(null);           // order shown on the 'done' screen
  const [ordersSheet, setOrdersSheet] = useState(false);
  const [toast, setToast] = useState(null);
  const [confetti, fireConfetti] = useConfetti();
  const [gate, setGate] = useState(false);       // hidden workers' login
  const [splash, setSplash] = useState(() => !sessionStorage.getItem('chatore_splash'));   // once per visit
  const [askNotify, setAskNotify] = useState(null); // order id to ask about notifications
  const taps = useRef({ n: 0, t: 0 });
  const onTitleTap = () => {                     // 5 quick taps on the stall name open it
    const now = Date.now();
    taps.current.n = now - taps.current.t < 1500 ? taps.current.n + 1 : 1;
    taps.current.t = now;
    if (taps.current.n >= 5) { taps.current.n = 0; setGate(true); }
  };

  const money = useMemo(() => makeMoney(menu?.currency), [menu]);
  const items = useMemo(() => {
    const m = new Map();
    menu?.categories.forEach((c, ci) => c.items.forEach((it) => m.set(it.id, { ...it, cat: c.name, ci })));
    return m;
  }, [menu]);
  const { count, total } = useMemo(() => {
    let count = 0, total = 0;
    for (const [id, q] of Object.entries(cart)) { const it = items.get(id); if (it) { count += q; total += it.price * q; } }
    return { count, total };
  }, [cart, items]);

  useEffect(() => { localStorage.setItem(LS_ORDERS, JSON.stringify(myIds.slice(-20))); }, [myIds]);

  // Fetch the latest state of all my orders; tell the customer when something changes.
  const prev = useRef({});
  const refresh = async () => {
    if (!myIds.length) return;
    const list = await fetchJSON('/api/orders?ids=' + myIds.join(',')).catch(() => null);
    if (!list) return;
    const next = Object.fromEntries(list.map((o) => [o.id, o]));
    for (const o of list) {
      const p = prev.current[o.id];
      if (p && p.status !== o.status) {
        if (o.status === 'ready') { navigator.vibrate?.([300, 120, 300, 120, 300]); chime(3); showToast(`Order #${o.no} is ready — collect it!`); }
        else if (o.status === 'preparing') { chime(1); showToast(`Order #${o.no} is being prepared`); }
      }
      if (p && !p.paid && o.paid) { chime(2); navigator.vibrate?.([120, 60, 120]); showToast(`Payment confirmed for #${o.no} ✓`); }
    }
    prev.current = next;
    setMyOrders(next);
  };
  useLive(refresh, 5000, myIds.length > 0);
  // the menu can change while customers browse (new dishes, prices, sold out)
  useLive(async (ev) => {
    if (ev.kind && !['menu', 'visible', 'timer'].includes(ev.kind)) return;
    const m = await fetchJSON('/api/menu').catch(() => null);
    if (m) setMenu(m);
  }, 15000, !!menu);
  // drop cart items that sold out or were removed
  useEffect(() => {
    if (!menu) return;
    const ok = new Set(menu.categories.flatMap((c) => c.items.filter((i) => i.available).map((i) => i.id)));
    setCart((c) => { const gone = Object.keys(c).filter((id) => !ok.has(id)); if (!gone.length) return c; const n = { ...c }; gone.forEach((id) => delete n[id]); return n; });
  }, [menu]);
  useEffect(() => { refresh(); }, [myIds.join()]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load menu; open an order from a notification link (?order=…) or resume the latest unfinished one
  useEffect(() => {
    (async () => {
      const m = await fetchJSON('/api/menu');
      setMenu(m); document.title = `${m.stallName} · Menu`;
      const fromLink = new URLSearchParams(location.search).get('order');
      if (fromLink && /^[a-z0-9]+$/.test(fromLink)) {
        setMyIds((ids) => (ids.includes(fromLink) ? ids : [...ids, fromLink]));
        setViewId(fromLink); history.replaceState(null, '', '/'); return setScreen('done');
      }
      const ids = myIds;
      if (name && ids.length) {
        const list = await fetchJSON('/api/orders?ids=' + ids.join(',')).catch(() => []);
        const open = list.filter((o) => ACTIVE.includes(o.status)).sort((a, b) => b.no - a.no)[0];
        if (open) { setViewId(open.id); return setScreen('done'); }
      }
      setScreen(name ? 'menu' : 'name');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "fly to cart": a little copy of the dish photo arcs down to the cart bar
  const [flights, setFlights] = useState([]);
  const fly = (el, item) => {
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = el.getBoundingClientRect();
    const f = { id: Math.random(), x: r.left + r.width / 2, y: r.top + r.height / 2, image: item?.image, ci: item?.ci ?? 0 };
    setFlights((l) => [...l, f]);
    setTimeout(() => setFlights((l) => l.filter((x) => x.id !== f.id)), 900);
  };
  const change = (id, d, srcEl) => {
    buzz(d > 0 ? 12 : 6);
    if (d > 0 && srcEl) fly(srcEl.closest('.item')?.querySelector('.thumb') || srcEl, items.get(id));
    const cur = cart[id] || 0;
    const q = Math.max(0, Math.min(50, cur + d));
    if (d > 0 && !cur) showToast(`${items.get(id).name} added`);
    const n = { ...cart }; q ? (n[id] = q) : delete n[id];
    setCart(n);
    if (!Object.keys(n).length) setSheet(false);
  };

  const toastTimer = useRef();
  function showToast(msg) {
    setToast({ msg, id: Math.random() });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }

  async function placeOrder(note) {
    const o = await fetchJSON('/api/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, note, items: Object.entries(cart).map(([id, qty]) => ({ id, qty })) }),
    });
    prev.current[o.id] = o;
    setMyOrders((m) => ({ ...m, [o.id]: o }));
    setMyIds((ids) => [...ids, o.id]);
    setSheet(false); setCart({}); setViewId(o.id); setScreen('done');
    // already allowed notifications before? follow this order too, silently
    if (pushState() === 'ok' && localStorage.getItem(LS_PUSHED)) {
      enablePush(`/api/orders/${o.id}/push`).then(() => markPushed(o.id)).catch(() => {});
    } else if (pushState() !== 'denied' && pushState() !== 'unsupported') {
      setTimeout(() => setAskNotify(o.id), 1600);   // after the confetti
    }
  }

  const openOrder = (id) => { setOrdersSheet(false); setViewId(id); setScreen('done'); scrollTo({ top: 0, behavior: 'smooth' }); };
  const compact = screen === 'menu' || screen === 'done';
  const mine = myIds.map((id) => myOrders[id]).filter(Boolean).sort((a, b) => b.no - a.no);
  const activeCount = mine.filter((o) => ACTIVE.includes(o.status)).length;
  const viewed = viewId && myOrders[viewId];

  return (
    <>
      <Embers />
      <div className="toran" aria-hidden="true" />
      {screen && screen !== 'name' && (
        <TopActions cartCount={count} ordersCount={activeCount} hasOrders={mine.length > 0}
          onCart={() => { if (count) { setScreen('menu'); setSheet(true); } else { setScreen('menu'); showToast('Your cart is empty — add something tasty!'); } }}
          onOrders={() => setOrdersSheet(true)} />
      )}
      <Hero menu={menu} compact={compact} onTitle={onTitleTap} />

      <main className="wrap">
        {(!screen || (screen === 'done' && !viewed)) && <Skeleton />}
        <AnimatePresence mode="wait">
          {screen === 'name' && (
            <NameScreen key="name" initial={name} onDone={(n) => { setName(n); localStorage.setItem(LS_NAME, n); setScreen('menu'); }} />
          )}
          {screen === 'menu' && menu && (
            <MenuScreen key="menu" menu={menu} name={name} cart={cart} change={change} money={money}
              onChangeName={() => setScreen('name')} ordersCount={activeCount} hasOrders={mine.length > 0} onOrders={() => setOrdersSheet(true)} />
          )}
          {screen === 'done' && viewed && (
            <Confirmation key={'done-' + viewed.id} order={viewed} money={money} fireConfetti={fireConfetti}
              onAgain={() => setScreen('menu')} onAllOrders={() => setOrdersSheet(true)} />
          )}
        </AnimatePresence>
      </main>

      <AnimatePresence>
        {screen === 'menu' && count > 0 && !sheet && (
          <CartBar key="bar" count={count} total={total} money={money} onOpen={() => setSheet(true)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {sheet && (
          <CartSheet key="sheet" name={name} cart={cart} items={items} total={total} count={count} money={money}
            change={change} onClose={() => setSheet(false)} onPlace={placeOrder} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {ordersSheet && <OrdersSheet key="orders" orders={mine} money={money} onOpen={openOrder} onClose={() => setOrdersSheet(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div key={toast.id} className="toast" role="status"
            initial={{ opacity: 0, y: 16, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }} transition={T.spring}>
            <Check size={16} aria-hidden="true" />{toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{gate && <StaffGate key="gate" onClose={() => setGate(false)} />}</AnimatePresence>
      <AnimatePresence>
        {askNotify && <NotifyPrompt key="ask" orderId={askNotify} onClose={() => setAskNotify(null)} onOn={() => { markPushed(askNotify); setAskNotify(null); showToast('Notifications on — we\'ll ring when it\'s ready'); }} />}
      </AnimatePresence>
      {confetti}
      {flights.map((f) => (
        <motion.span key={f.id} className="flyer" aria-hidden="true"
          style={{ left: f.x - 28, top: f.y - 28, '--c': NINE[f.ci % 9][0], backgroundImage: f.image ? `url(${f.image})` : undefined }}
          initial={{ x: 0, y: 0, scale: 1, opacity: 1 }}
          animate={{ x: [0, (innerWidth / 2 - f.x) * 0.5, innerWidth / 2 - f.x], y: [0, -70, innerHeight - 52 - f.y], scale: [1, 0.9, 0.3], opacity: [1, 1, 0.3] }}
          transition={{ duration: 0.75, ease: [0.3, 0.1, 0.4, 1], times: [0, 0.35, 1] }} />
      ))}
      <AnimatePresence>
        {splash && <Splash key="splash" menu={menu} onDone={() => { sessionStorage.setItem('chatore_splash', '1'); setSplash(false); }} />}
      </AnimatePresence>
    </>
  );
}

// Short "ding" when something changes while the page is open
let audioCtx;
function chime(times = 1) {
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    for (let k = 0; k < times; k++) {
      [988, 1319].forEach((f, i) => {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.type = 'sine'; o.frequency.value = f; o.connect(g); g.connect(audioCtx.destination);
        const t = audioCtx.currentTime + k * 0.45 + i * 0.12;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        o.start(t); o.stop(t + 0.42);
      });
    }
  } catch { /* no audio */ }
}

/* Big, friendly prompt right after ordering */
function NotifyPrompt({ orderId, onClose, onOn }) {
  const ios = pushState() === 'ios-install';
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function on() {
    setBusy(true); setErr('');
    try { await enablePush(`/api/orders/${orderId}/push`); onOn(); }
    catch (e) {
      setBusy(false);
      setErr(e.code === 'denied' ? 'Notifications are blocked for this site — allow them in your browser settings, then tap again.'
        : `Could not turn on (${e.message}). You can try again from the order screen.`);
    }
  }
  return (
    <>
      <motion.div className="sheet-bg" style={{ zIndex: 40 }} onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <div className="gate-wrap">
        <motion.div className="gate card notify-ask" role="dialog" aria-modal="true" aria-labelledby="askTitle"
          initial={{ opacity: 0, scale: 0.85, y: 40 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} transition={T.spring}>
          <motion.div className="bellbig" animate={{ rotate: [0, -16, 14, -10, 8, 0] }} transition={{ duration: 1, repeat: Infinity, repeatDelay: 1.2 }}>
            <BellRing size={36} aria-hidden="true" />
          </motion.div>
          <h2 id="askTitle">Turn on notifications</h2>
          {ios ? (
            <p className="muted">On iPhone: tap <b>Share</b> <span aria-hidden="true">⎋</span> → <b>Add to Home Screen</b>, open <b>Hawres</b> from your home screen, then tap “Notify me” on your order. Until then this page updates live while it's open.</p>
          ) : (
            <p className="muted">We'll <b>ring your phone</b> when your order is being prepared and when it's <b>ready to collect</b> — even if you close this page.</p>
          )}
          {err && <p className="err" role="alert">{err}</p>}
          {!ios && (
            <motion.button className="btn block" onClick={on} disabled={busy} {...press}>
              {busy ? <span className="spinner" /> : <BellRing size={20} aria-hidden="true" />}Turn on notifications
            </motion.button>
          )}
          <button className="linkbtn" onClick={onClose} style={{ width: '100%' }}>{ios ? 'Got it' : 'Not now'}</button>
        </motion.div>
      </div>
    </>
  );
}

const markPushed = (id) => {
  const ids = readIds(LS_PUSHED);
  if (!ids.includes(id)) localStorage.setItem(LS_PUSHED, JSON.stringify([...ids, id].slice(-20)));
};

/* ---------------- Top-right: cart + my orders ---------------- */
function TopActions({ cartCount, ordersCount, hasOrders, onCart, onOrders }) {
  return (
    <motion.div className="topactions" initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={T.soft}>
      <motion.button className="topbtn" onClick={onCart} aria-label={`Cart, ${cartCount} items`} {...press}>
        <ShoppingBag size={22} aria-hidden="true" />
        <AnimatePresence>{cartCount > 0 && <motion.span key={cartCount} className="topbadge" initial={{ scale: 1.8 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={T.bouncy}>{cartCount}</motion.span>}</AnimatePresence>
      </motion.button>
      {hasOrders && (
        <motion.button className="topbtn" onClick={onOrders} aria-label={`My orders, ${ordersCount} in progress`} {...press}
          initial={{ scale: 0 }} animate={{ scale: 1 }} transition={T.bouncy}>
          <ReceiptText size={22} aria-hidden="true" />
          <AnimatePresence>{ordersCount > 0 && <motion.span key={ordersCount} className="topbadge live" initial={{ scale: 1.8 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={T.bouncy}>{ordersCount}</motion.span>}</AnimatePresence>
        </motion.button>
      )}
    </motion.div>
  );
}

const STATUS_LABEL = { new: 'Received', preparing: 'Preparing', ready: 'Ready!', done: 'Handed over', cancelled: 'Cancelled' };

function OrdersSheet({ orders, money, onOpen, onClose }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', k); return () => removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <>
      <motion.div className="sheet-bg" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={T.fade} />
      <motion.div className="sheet" role="dialog" aria-modal="true" aria-labelledby="myOrdersTitle"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%', transition: { duration: 0.22, ease: 'easeIn' } }} transition={T.sheet}>
        <div className="grab"><div className="handle" aria-hidden="true" /></div>
        <div className="sheet-head">
          <h2 id="myOrdersTitle">My orders</h2>
          <motion.button className="iconbtn" onClick={onClose} aria-label="Close" {...press}><X size={20} aria-hidden="true" /></motion.button>
        </div>
        <div className="sheet-body" style={{ paddingBottom: 18 }}>
          <p className="muted" style={{ margin: '0 0 8px', fontSize: '.9rem' }}>Live status — updates by itself.</p>
          <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.05 } } }}>
            {orders.map((o) => (
              <motion.button key={o.id} className={`myorder st-${o.status}`} onClick={() => onOpen(o.id)} layout
                variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }} whileTap={{ scale: 0.98 }}>
                <span className="mo-no brand">#{o.no}</span>
                <span className="mo-mid">
                  <span className="mo-items">{o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}</span>
                  <span className="mo-tags">
                    <span className="pill">{STATUS_LABEL[o.status]}</span>
                    <span className={`pill ${o.paid ? 'st-ready' : 'st-new'}`}>{o.paid ? (o.payMethod === 'cash' ? 'Paid · Cash' : 'Paid · UPI') : 'Payment not confirmed'}</span>
                  </span>
                </span>
                <span className="mo-amt">{money(o.total)}</span>
              </motion.button>
            ))}
            {!orders.length && <p className="muted">No orders yet.</p>}
          </motion.div>
        </div>
      </motion.div>
    </>
  );
}

/* ---------------- Hero ---------------- */
const wordsV = { show: { transition: { staggerChildren: 0.08 } } };
const wordV = { hidden: { opacity: 0, y: 24, scale: 0.9 }, show: { opacity: 1, y: 0, scale: 1, transition: T.soft } };

function Hero({ menu, compact, onTitle }) {
  const ev = menu?.event;
  return (
    <motion.header layout className={`hero ${compact ? 'compact' : ''}`} transition={T.soft}>
      {!compact && <>
        <TempleBell side="left" chain={34} />
        <TempleBell side="right" chain={58} delay={0.8} />
        <Mandala className="m1" /><Mandala className="m2" reverse />
      </>}
      <AnimatePresence>
        {!compact && ev?.presentedBy && (
          <motion.p className="presents" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {ev.presentedBy}<em>presents</em><b className="evname">✦ {ev.name} ✦</b>
          </motion.p>
        )}
      </AnimatePresence>
      <motion.h1 layout="position" className="hero-title" key={menu?.stallName}>
        {/* Tapping the stall name 5 times opens the workers' login */}
        <motion.button type="button" className="title-btn" onClick={onTitle} whileTap={{ scale: 0.97 }}
          variants={wordsV} initial="hidden" animate={menu ? 'show' : 'hidden'}>
          <BrandMark menu={menu} size={compact ? 52 : 108} row={compact} variants={wordV} />
        </motion.button>
      </motion.h1>
      <AnimatePresence>
        {!compact && menu?.tagline && (
          <motion.p className="tagline" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.5 } }} exit={{ opacity: 0 }}>“{menu.tagline}”</motion.p>
        )}
      </AnimatePresence>
      {ev?.dates && (
        <motion.div layout="position" className="ribbon" initial={{ opacity: 0, scaleX: 0.6 }} animate={{ opacity: 1, scaleX: 1 }} transition={{ ...T.soft, delay: 0.3 }}>
          <span>{ev.dates}</span>
        </motion.div>
      )}
      <AnimatePresence>
        {!compact && (
          <motion.div className="hero-art" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.8, ease: [0.2, 0.7, 0.3, 1] }}>
            <img src="/dancers.webp" alt="Garba dancers with dandiya sticks" width="900" height="639" />
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {!compact && ev && (
          <motion.div className="event-info" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.4 } }} exit={{ opacity: 0 }}>
            {ev.time && <span><Clock size={16} aria-hidden="true" />{ev.time}</span>}
            {ev.venue && <span><MapPin size={16} aria-hidden="true" />{ev.venue}{ev.venueNote && <small>{ev.venueNote}</small>}</span>}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}

const screenMotion = { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0, transition: T.soft }, exit: { opacity: 0, y: -12, transition: { duration: 0.15 } } };

function Skeleton() {
  return <div style={{ marginTop: 20 }}>{[0, 1, 2].map((i) => <div key={i} className="skel" style={{ height: 104, marginBottom: 12 }} />)}</div>;
}

/* ---------------- Name ---------------- */
function NameScreen({ initial, onDone }) {
  const [v, setV] = useState(initial || '');
  const [err, setErr] = useState('');
  const [scope, animate] = useAnimate();
  const inputRef = useRef();
  const submit = (e) => {
    e.preventDefault();
    const n = v.trim();
    if (!n) { setErr('Please enter your name'); animate(scope.current, { x: [0, -8, 8, -6, 6, 0] }, { duration: 0.4 }); inputRef.current.focus(); return; }
    onDone(n);
  };
  return (
    <motion.section className="card name-card" {...screenMotion} aria-labelledby="welcome">
      <motion.div className="badge" initial={{ scale: 0, rotate: -30 }} animate={{ scale: 1, rotate: 0 }} transition={{ ...T.bouncy, delay: 0.1 }}>
        <UtensilsCrossed size={30} aria-hidden="true" />
      </motion.div>
      <h2 id="welcome">Kem cho! Welcome</h2>
      <p className="muted" style={{ margin: '6px 0 0' }}>Tell us your name — we'll call it out when your order is ready.</p>
      <form onSubmit={submit} noValidate>
        <label className="label" htmlFor="nameInput">Your name</label>
        <div className="field" ref={scope}>
          <User size={20} aria-hidden="true" />
          <input id="nameInput" ref={inputRef} value={v} onChange={(e) => { setV(e.target.value); setErr(''); }}
            placeholder="e.g. Riya" maxLength={40} autoComplete="given-name" enterKeyHint="go"
            aria-invalid={!!err} aria-describedby="nameErr" />
        </div>
        <p className="err" id="nameErr" role="alert">{err}</p>
        <motion.button className="btn block" type="submit" {...press} whileHover={{ scale: 1.02 }}>
          See the menu
          <motion.span animate={{ x: [0, 4, 0] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }} style={{ display: 'flex' }}>
            <ArrowRight size={20} aria-hidden="true" />
          </motion.span>
        </motion.button>
      </form>
      <motion.div className="perks" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 0.3 } } }}>
        {[[Sparkles, 'Freshly made'], [Clock, 'Order in seconds'], [Wallet, 'Pay at counter']].map(([I, t]) => (
          <motion.span key={t} className="perk" variants={{ hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0 } }}><I size={16} aria-hidden="true" />{t}</motion.span>
        ))}
      </motion.div>
    </motion.section>
  );
}

/* ---------------- Menu ---------------- */
function MenuScreen({ menu, name, cart, change, money, onChangeName, ordersCount, hasOrders, onOrders }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const reduce = useReducedMotion();
  const tabsRef = useRef();

  useEffect(() => {
    let ticking = false;
    const onScroll = () => { if (ticking) return; ticking = true; requestAnimationFrame(() => { setScrolled(scrollY > 120); ticking = false; }); };
    addEventListener('scroll', onScroll, { passive: true });
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setActive(+e.target.dataset.i)), { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('section.cat').forEach((s) => io.observe(s));
    return () => { removeEventListener('scroll', onScroll); io.disconnect(); };
  }, [q]);
  useEffect(() => {
    const strip = tabsRef.current, tab = strip?.querySelector(`[data-i="${active}"]`);
    if (strip && tab) strip.scrollTo({ left: tab.offsetLeft - strip.clientWidth / 2 + tab.clientWidth / 2, behavior: reduce ? 'auto' : 'smooth' });
  }, [active, reduce]);

  const needle = q.trim().toLowerCase();
  const cats = menu.categories.map((c, i) => ({
    ...c, i,
    items: c.items.filter((it) => !needle || `${it.name} ${it.desc || ''} ${c.name}`.toLowerCase().includes(needle)),
  }));
  const any = cats.some((c) => c.items.length);

  return (
    <motion.section {...screenMotion}>
      <div className={`bar ${scrolled ? 'scrolled' : ''}`}>
        <div className="greet">
          <span>Hi <b>{name}</b></span>
          <span style={{ display: 'flex', gap: 14 }}>
            {hasOrders && <button className="linkbtn ordlink" onClick={onOrders}><ReceiptText size={16} aria-hidden="true" />My orders{ordersCount > 0 && <b>{ordersCount}</b>}</button>}
            <button className="linkbtn" onClick={onChangeName}>Change name</button>
          </span>
        </div>
        <div className="field">
          <Search size={20} aria-hidden="true" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search dishes" aria-label="Search dishes" autoComplete="off" />
        </div>
        <nav className="tabs" ref={tabsRef} aria-label="Menu categories">
          {cats.filter((c) => c.items.length).map((c) => {
            const [fill, ink] = NINE[c.i % 9];
            const on = active === c.i;
            return (
              <motion.button key={c.i} data-i={c.i} className={`tab ${on ? 'on' : ''}`} style={{ '--c': fill, '--ci': ink }} {...press}
                aria-current={on ? 'true' : undefined}
                onClick={() => document.getElementById('cat' + c.i)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })}>
                {on && <motion.span layoutId="tabpill" className="tabpill" transition={T.spring} />}
                <span className="tab-in"><CategoryIcon name={c.name} size={16} />{c.name}</span>
              </motion.button>
            );
          })}
        </nav>
      </div>

      {cats.map((c) => {
        const [fill, ink] = NINE[c.i % 9];
        return (
          <AnimatePresence key={c.i} initial={false}>
            {c.items.length > 0 && (
              <motion.section className="cat" id={'cat' + c.i} data-i={c.i} style={{ '--c': fill, '--ci': ink }}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} aria-labelledby={'h' + c.i}>
                <motion.h2 id={'h' + c.i} initial={{ opacity: 0, x: -16 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={T.soft}>
                  <span className="cat-ic"><CategoryIcon name={c.name} size={20} /></span>{c.name}
                </motion.h2>
                <AnimatePresence initial={false}>
                  {c.items.map((it) => <ItemCard key={it.id} it={it} cat={c.name} qty={cart[it.id] || 0} change={change} money={money} />)}
                </AnimatePresence>
              </motion.section>
            )}
          </AnimatePresence>
        );
      })}
      <AnimatePresence>
        {!any && (
          <motion.div className="empty-search" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <Search size={32} aria-hidden="true" /><p><b>No dishes found</b><br />Try another name.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

function ItemCard({ it, cat, qty, change, money }) {
  return (
    <motion.article whileTap={{ scale: 0.985 }} className={`item card ${qty ? 'in-cart' : ''} ${it.available === false ? 'is-soldout' : ''}`}
      initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.15 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
      whileHover={{ y: -3 }} transition={T.soft}>
      <motion.div className="thumb" whileHover={{ scale: 1.06, rotate: -3 }} transition={T.spring}>
        {it.image ? <motion.img src={it.image} alt="" loading="lazy" initial={{ scale: 1.2, opacity: 0 }} whileInView={{ scale: 1, opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.6 }} />
          : <CategoryIcon name={cat} size={30} />}
      </motion.div>
      <div className="info">
        <div className="nm">
          {it.veg && <span className="veg" role="img" aria-label="Vegetarian" title="Vegetarian" />}
          {it.name}
          {it.popular && <span className="hot"><Flame size={12} aria-hidden="true" />Popular</span>}
        </div>
        {it.desc ? <p className="desc">{it.desc}</p> : <div style={{ height: 8 }} />}
        <div className="row">
          <span className="price">{money(it.price)}</span>
          {it.available === false ? <span className="soldout">Sold out</span> : <QtyControl id={it.id} name={it.name} qty={qty} change={change} />}
        </div>
      </div>
    </motion.article>
  );
}

function QtyControl({ id, name, qty, change, color }) {
  const prev = useRef(qty);
  const dir = qty >= prev.current ? 1 : -1;
  useEffect(() => { prev.current = qty; }, [qty]);
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      {qty === 0 ? (
        <motion.button key="add" className="add" onClick={(e) => change(id, 1, e.currentTarget)} aria-label={`Add ${name}`}
          initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.7, opacity: 0 }}
          whileTap={{ scale: 0.92 }} whileHover={{ scale: 1.04 }} transition={T.spring}>
          ADD <Plus size={16} aria-hidden="true" />
        </motion.button>
      ) : (
        <motion.div key="qty" className="qty" style={color ? { '--c': color } : undefined}
          initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.7, opacity: 0 }} transition={T.spring}>
          <motion.button whileTap={{ scale: 0.85 }} onClick={() => change(id, -1)} aria-label={`Remove one ${name}`}><Minus size={18} aria-hidden="true" /></motion.button>
          <span className="num" aria-live="polite">
            <AnimatePresence mode="popLayout" initial={false} custom={dir}>
              <motion.span key={qty} custom={dir}
                variants={{ in: (d) => ({ y: d * -14, opacity: 0 }), out: (d) => ({ y: d * 14, opacity: 0 }) }}
                initial="in" animate={{ y: 0, opacity: 1 }} exit="out" transition={T.spring}>{qty}</motion.span>
            </AnimatePresence>
          </span>
          <motion.button whileTap={{ scale: 0.85 }} onClick={(e) => change(id, 1, e.currentTarget)} aria-label={`Add one more ${name}`}><Plus size={18} aria-hidden="true" /></motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ---------------- Cart bar + sheet ---------------- */
function CartBar({ count, total, money, onOpen }) {
  return (
    <motion.div className="cartbar" initial={{ y: 120, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 120, opacity: 0 }} transition={T.soft}>
      <motion.button className="btn" onClick={onOpen} aria-label={`View cart, ${count} items, ${money(total)}`} {...press}>
        <span className="bagwrap">
          <ShoppingBag size={22} aria-hidden="true" />
          <motion.span key={count} className="count" initial={{ scale: 1.6 }} animate={{ scale: 1 }} transition={T.bouncy}>{count}</motion.span>
        </span>
        <span className="mid"><b><AnimatedNumber value={total} format={money} /></b><small>{count} item{count === 1 ? '' : 's'}</small></span>
        <span className="go">View cart <ArrowRight size={16} aria-hidden="true" /></span>
      </motion.button>
    </motion.div>
  );
}

function CartSheet({ name, cart, items, total, count, money, change, onClose, onPlace }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [scope, animate] = useAnimate();
  const closeRef = useRef();
  const drag = useDragControls();

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);

  async function place() {
    setBusy(true); setErr('');
    try { await onPlace(note); }
    catch (e) { setErr(e.message || 'Network problem — please try again'); animate(scope.current, { x: [0, -8, 8, -6, 6, 0] }, { duration: 0.4 }); setBusy(false); }
  }

  return (
    <>
      <motion.div className="sheet-bg" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={T.fade} />
      <motion.div className="sheet" role="dialog" aria-modal="true" aria-labelledby="cartTitle"
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%', transition: { duration: 0.22, ease: 'easeIn' } }} transition={T.sheet}
        drag="y" dragControls={drag} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, i) => { if (i.offset.y > 120 || i.velocity.y > 600) onClose(); }}>
        {/* Swipe down on the handle/header to close */}
        <div className="grab" onPointerDown={(e) => drag.start(e)}><div className="handle" aria-hidden="true" /></div>
        <div className="sheet-head" onPointerDown={(e) => e.target.closest('button') || drag.start(e)}>
          <h2 id="cartTitle">Your cart</h2>
          <motion.button ref={closeRef} className="iconbtn" onClick={onClose} aria-label="Close cart" {...press}><X size={20} aria-hidden="true" /></motion.button>
        </div>
        <div className="sheet-body">
          <p className="muted" style={{ margin: '0 0 4px' }}>Order for {name}</p>
          <motion.div initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.05, delayChildren: 0.1 } } }}>
            <AnimatePresence initial={false}>
              {Object.entries(cart).map(([id, q]) => {
                const it = items.get(id);
                return (
                  <motion.div layout key={id} className="line" variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0 } }}
                    exit={{ opacity: 0, x: -40, transition: { duration: 0.18 } }} transition={T.soft}>
                    <span className="nm">{it.name}<br /><small>{money(it.price)} each</small></span>
                    <QtyControl id={id} name={it.name} qty={q} change={change} color="var(--primary)" />
                    <span className="amt"><AnimatedNumber value={it.price * q} format={money} /></span>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
          <motion.div layout className="bill" transition={T.soft}>
            <div className="r"><span>Items ({count})</span><span>{money(total)}</span></div>
            <div className="t"><span>To pay</span><span><AnimatedNumber value={total} format={money} /></span></div>
          </motion.div>
          <motion.div layout className="field notefield" transition={T.soft}>
            <label className="sr-only" htmlFor="note">Special request</label>
            <NotebookPen size={20} aria-hidden="true" />
            <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Any request? (less spicy, no onion…)" maxLength={140} />
          </motion.div>
        </div>
        <div className="sheet-foot">
          <p className="err" role="alert" style={{ textAlign: 'center' }}>{err}</p>
          <motion.button ref={scope} className="btn block" onClick={place} disabled={busy || !count} {...press}>
            {busy ? <><span className="spinner" />Placing order…</> : <>Place order · <AnimatedNumber value={total} format={money} /></>}
          </motion.button>
          <button className="linkbtn" onClick={onClose}>+ Add more items</button>
        </div>
      </motion.div>
    </>
  );
}

/* ---------------- Confirmation + live tracker ---------------- */
const STEPS = [['new', 'Received', ReceiptText, 'var(--orange)'], ['preparing', 'Preparing', ChefHat, 'var(--royal)'], ['ready', 'Ready', CircleCheck, 'var(--green)']];
const STATUS_TEXT = {
  new: "We got your order — it's in the queue", preparing: 'Our team is preparing your food',
  ready: 'Your order is ready! Please collect it', done: 'Handed over — enjoy your food!', cancelled: 'This order was cancelled. Please ask at the counter.',
};

function Confirmation({ order: o, money, fireConfetti, onAgain, onAllOrders }) {
  const idx = { new: 0, preparing: 1, ready: 2, done: 2 }[o.status] ?? -1;
  const numRef = useRef();
  const cancelled = o.status === 'cancelled';
  const first = useRef(true);
  useEffect(() => {
    const fresh = Date.now() - new Date(o.createdAt).getTime() < 60000;   // just placed
    if ((first.current && fresh) || (!first.current && o.status === 'ready')) setTimeout(() => fireConfetti(numRef.current), 350);
    first.current = false;
  }, [o.status, fireConfetti]);

  return (
    <motion.section className="card done" {...screenMotion} aria-live="polite">
      <motion.div className={`tick ${cancelled ? 'bad' : ''}`} initial={{ scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ ...T.bouncy, delay: 0.1 }}>
        {cancelled ? <X size={44} aria-hidden="true" /> : (
          <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <motion.path d="M20 6 9 17l-5-5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, delay: 0.3, ease: 'easeOut' }} />
          </svg>
        )}
      </motion.div>
      <h2>{cancelled ? 'Order cancelled' : `Thank you, ${o.name}!`}</h2>
      <p className="muted" style={{ margin: '6px 0 0' }}>Your order number</p>
      <motion.div ref={numRef} className="ordno brand gold-text" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...T.bouncy, delay: 0.25 }}>#{o.no}</motion.div>

      {!cancelled && (
        <div className="track" aria-label={`Order progress: ${STEPS[idx]?.[1]}`}>
          <div className="rail" />
          <motion.div className="fill" initial={{ scaleX: 0 }} animate={{ scaleX: idx / 2 }} transition={{ duration: 0.8, delay: 0.4, ease: [0.2, 0.7, 0.3, 1] }} />
          {STEPS.map(([s, label, I, c], i) => (
            <motion.div key={s} className={`step ${i <= idx ? 'on' : ''}`} style={{ '--c': c }}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ ...T.soft, delay: 0.3 + i * 0.08 }}>
              <span className="dotwrap">
                {i === idx && o.status !== 'done' && (
                  <motion.span className="ring" animate={{ scale: [1, 1.35], opacity: [0.5, 0] }} transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }} />
                )}
                <motion.span className="dot" animate={i <= idx ? { scale: [0.8, 1.1, 1] } : {}} transition={{ duration: 0.4 }} key={i <= idx ? 'on' : 'off'}>
                  <I size={20} aria-hidden="true" />
                </motion.span>
              </span>
              {label}
            </motion.div>
          ))}
        </div>
      )}
      <AnimatePresence mode="wait">
        <motion.p key={o.status} className="statusline" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}>
          {STATUS_TEXT[o.status]}
        </motion.p>
      </AnimatePresence>

      {ACTIVE.includes(o.status) && <NotifyCard o={o} />}
      {!cancelled && o.upi && <PayCard o={o} money={money} />}

      <div className="receipt">
        {o.items.map((i) => <div className="r" key={i.id}><span>{i.qty} × {i.name}</span><span>{money(i.price * i.qty)}</span></div>)}
        <div className="r t"><span>Total</span><span>{money(o.total)}</span></div>
        {o.note && <p className="muted note"><NotebookPen size={16} aria-hidden="true" />{o.note}</p>}
      </div>
      <p className="muted hint"><Clock size={16} aria-hidden="true" />Show this screen at the counter — it updates automatically.</p>
      <motion.button className="btn block" onClick={onAgain} {...press}>Order something else</motion.button>
      <button className="linkbtn" onClick={onAllOrders} style={{ marginTop: 6 }}><ReceiptText size={16} aria-hidden="true" style={{ verticalAlign: '-3px', marginRight: 6 }} />See all my orders</button>
    </motion.section>
  );
}

/* ---------------- Notifications ---------------- */
function NotifyCard({ o }) {
  const already = () => pushState() === 'ok' && readIds(LS_PUSHED).includes(o.id);
  const [state, setState] = useState(already() ? 'on' : 'idle');   // idle | busy | on | ios | denied | error
  async function turnOn() {
    setState('busy');
    try { await enablePush(`/api/orders/${o.id}/push`); markPushed(o.id); setState('on'); }
    catch (e) { setState(e.code === 'ios-install' ? 'ios' : e.code === 'denied' ? 'denied' : 'error'); console.warn('Notify failed:', e); }
  }
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div key={state} className={`notifycard ${state === 'on' ? 'on' : ''}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={T.soft}>
        {state === 'on' ? (
          <><BellRing size={20} aria-hidden="true" /><span><b>Notifications on.</b> We'll message you when it's preparing and when it's ready.</span></>
        ) : state === 'ios' ? (
          <><Bell size={20} aria-hidden="true" /><span>On iPhone: tap <b>Share → Add to Home Screen</b>, open Hawres from there, then tap “Notify me”. This screen also updates live.</span></>
        ) : state === 'denied' ? (
          <><Bell size={20} aria-hidden="true" /><span>Notifications are blocked in your browser settings — no problem, this screen updates live.</span></>
        ) : (
          <>
            <Bell size={20} aria-hidden="true" />
            <span><b>Get a message</b> when your food is being prepared and when it's ready.{state === 'error' && <em className="err" style={{ display: 'block' }}>Couldn't turn on — try again.</em>}</span>
            <motion.button className="btn small" onClick={turnOn} disabled={state === 'busy'} {...press}>{state === 'busy' ? <span className="spinner" /> : 'Notify me'}</motion.button>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

/* ---------------- UPI payment ---------------- */
function PayCard({ o, money }) {
  const [copied, setCopied] = useState(false);
  const upiId = new URLSearchParams(o.upi.split('?')[1]).get('pa');
  const copy = async () => {
    try { await navigator.clipboard.writeText(upiId); setCopied(true); buzz(); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  return (
    <AnimatePresence mode="wait" initial={false}>
      {o.paid ? (
        <motion.div key="paid" className="paycard paid" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={T.bouncy}>
          <motion.span initial={{ rotate: -90, scale: 0 }} animate={{ rotate: 0, scale: 1 }} transition={{ ...T.bouncy, delay: 0.1 }}><CircleCheck size={26} aria-hidden="true" /></motion.span>
          <span><b>Payment confirmed{o.payMethod === 'cash' ? ' (cash)' : o.payMethod === 'upi' ? ' (UPI)' : ''}</b><small>The Hawres workers have received your {money(o.total)}. Thank you!</small></span>
        </motion.div>
      ) : (
        <motion.div key="unpaid" className="paycard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={T.soft}>
          <div className="payhead"><Wallet size={20} aria-hidden="true" /><b>Pay {money(o.total)}</b><span className="pill st-new">Not confirmed</span></div>
          <motion.div className="payqr" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ ...T.spring, delay: 0.15 }}>
            <img src={`/api/orders/${o.id}/upi.svg`} alt={`UPI QR code to pay ${money(o.total)} to Hawres`} width="220" height="220" />
            <span className="qrcap">Scan with any UPI app · amount is filled in</span>
          </motion.div>
          <motion.a className="btn block" href={o.upi} onClick={() => buzz()} {...press}>
            <Smartphone size={20} aria-hidden="true" />Or pay {money(o.total)} in a UPI app on this phone
          </motion.a>
          <p className="apps">GPay · PhonePe · Paytm · BHIM · or pay cash at the counter</p>
          <button className="linkbtn upicopy" onClick={copy}><Copy size={16} aria-hidden="true" />{copied ? 'UPI ID copied!' : `UPI ID: ${upiId}`}</button>
          <div className="showworkers">
            <motion.span className="sw-ic" animate={{ y: [0, -4, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}><Smartphone size={22} aria-hidden="true" /></motion.span>
            <span><b>After paying, show this screen to the Hawres stall workers.</b> They'll confirm your payment and this card turns green.</span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
