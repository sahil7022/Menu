import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimate, useDragControls, useReducedMotion } from 'framer-motion';
import {
  ArrowRight, Check, ChefHat, CircleCheck, Clock, Flame, Minus, NotebookPen, Plus, ReceiptText,
  Copy, QrCode, Search, ShoppingBag, Smartphone, Sparkles, User, UtensilsCrossed, Wallet, X,
} from 'lucide-react';
import { AnimatedNumber, CategoryIcon, Mandala, NINE, T, fetchJSON, makeMoney, press, useConfetti } from './ui.jsx';
import StaffGate from './StaffGate.jsx';
import './customer.css';

const LS_NAME = 'navrang_name', LS_ORDER = 'navrang_last_order';

export default function Customer() {
  const [menu, setMenu] = useState(null);
  const [name, setName] = useState(() => localStorage.getItem(LS_NAME) || '');
  const [screen, setScreen] = useState(null);           // 'name' | 'menu' | 'done'
  const [cart, setCart] = useState({});                 // id -> qty
  const [sheet, setSheet] = useState(false);
  const [order, setOrder] = useState(null);
  const [toast, setToast] = useState(null);
  const [confetti, fireConfetti] = useConfetti();
  const [gate, setGate] = useState(false);       // hidden workers' login
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

  // Load menu + resume an unfinished order
  useEffect(() => {
    (async () => {
      const m = await fetchJSON('/api/menu');
      setMenu(m); document.title = `${m.stallName} · Menu`;
      const last = localStorage.getItem(LS_ORDER);
      if (name && last) {
        const o = await fetchJSON('/api/orders/' + last).catch(() => null);
        if (o && !['done', 'cancelled'].includes(o.status)) { setOrder(o); return setScreen('done'); }
      }
      setScreen(name ? 'menu' : 'name');
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll the order status while waiting
  useEffect(() => {
    if (screen !== 'done' || !order || ['done', 'cancelled'].includes(order.status)) return;
    const t = setInterval(async () => {
      const o = await fetchJSON('/api/orders/' + order.id).catch(() => null);
      if (o && (o.status !== order.status || o.paid !== order.paid)) {
        if (o.status === 'ready') navigator.vibrate?.([200, 100, 200]);
        setOrder(o);
      }
    }, 5000);
    return () => clearInterval(t);
  }, [screen, order]);

  const change = (id, d) => {
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
    toastTimer.current = setTimeout(() => setToast(null), 1500);
  }

  async function placeOrder(note) {
    const o = await fetchJSON('/api/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, note, items: Object.entries(cart).map(([id, qty]) => ({ id, qty })) }),
    });
    localStorage.setItem(LS_ORDER, o.id);
    setSheet(false); setCart({}); setOrder(o); setScreen('done');
  }

  const compact = screen === 'menu';

  return (
    <>
      <div className="toran" aria-hidden="true" />
      <Hero menu={menu} compact={compact} onTitle={onTitleTap} />

      <main className="wrap">
        {!screen && <Skeleton />}
        <AnimatePresence mode="wait">
          {screen === 'name' && (
            <NameScreen key="name" initial={name} onDone={(n) => { setName(n); localStorage.setItem(LS_NAME, n); setScreen('menu'); }} />
          )}
          {screen === 'menu' && menu && (
            <MenuScreen key="menu" menu={menu} name={name} cart={cart} change={change} money={money}
              onChangeName={() => setScreen('name')} />
          )}
          {screen === 'done' && order && (
            <Confirmation key="done" order={order} money={money} fireConfetti={fireConfetti}
              onAgain={() => { localStorage.removeItem(LS_ORDER); setOrder(null); setScreen('menu'); }} />
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
        {toast && (
          <motion.div key={toast.id} className="toast" role="status"
            initial={{ opacity: 0, y: 16, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10 }} transition={T.spring}>
            <Check size={16} aria-hidden="true" />{toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>{gate && <StaffGate key="gate" onClose={() => setGate(false)} />}</AnimatePresence>
      {confetti}
    </>
  );
}

/* ---------------- Hero ---------------- */
const wordsV = { show: { transition: { staggerChildren: 0.08 } } };
const wordV = { hidden: { opacity: 0, y: 24, scale: 0.9 }, show: { opacity: 1, y: 0, scale: 1, transition: T.soft } };

function Hero({ menu, compact, onTitle }) {
  return (
    <motion.header layout className={`hero ${compact ? 'compact' : ''}`} transition={T.soft}>
      {!compact && <><Mandala className="m1" /><Mandala className="m2" reverse /></>}
      <motion.h1 layout="position" className="brand" key={menu?.stallName}>
        {/* Tapping the stall name 5 times opens the workers' login */}
        <motion.button type="button" className="title-btn rainbow-text" onClick={onTitle} whileTap={{ scale: 0.96 }}
          variants={wordsV} initial="hidden" animate={menu ? 'show' : 'hidden'}>
          {(menu?.stallName || 'Navrang').split(' ').map((w, i) => <motion.span key={i} className="w" variants={wordV}>{w} </motion.span>)}
        </motion.button>
      </motion.h1>
      <AnimatePresence>
        {!compact && menu?.tagline && (
          <motion.p className="muted" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.3 } }} exit={{ opacity: 0 }}>{menu.tagline}</motion.p>
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
function MenuScreen({ menu, name, cart, change, money, onChangeName }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [scrolled, setScrolled] = useState(false);
  const reduce = useReducedMotion();
  const tabsRef = useRef();

  useEffect(() => {
    const onScroll = () => setScrolled(scrollY > 120);
    addEventListener('scroll', onScroll, { passive: true });
    const io = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && setActive(+e.target.dataset.i)), { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('section.cat').forEach((s) => io.observe(s));
    return () => { removeEventListener('scroll', onScroll); io.disconnect(); };
  }, [q]);
  useEffect(() => {
    tabsRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
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
          <button className="linkbtn" onClick={onChangeName}>Change name</button>
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
    <motion.article layout className={`item card ${qty ? 'in-cart' : ''}`}
      initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.25 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.15 } }}
      whileHover={{ y: -3, boxShadow: 'var(--shadow-md)' }} transition={T.soft}>
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
          <QtyControl id={it.id} name={it.name} qty={qty} change={change} />
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
        <motion.button key="add" className="add" onClick={() => change(id, 1)} aria-label={`Add ${name}`}
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
          <motion.button whileTap={{ scale: 0.85 }} onClick={() => change(id, 1)} aria-label={`Add one more ${name}`}><Plus size={18} aria-hidden="true" /></motion.button>
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
  ready: 'Your order is ready! Please collect it', done: 'Collected — enjoy your food!', cancelled: 'This order was cancelled. Please ask at the counter.',
};

function Confirmation({ order: o, money, fireConfetti, onAgain }) {
  const idx = { new: 0, preparing: 1, ready: 2, done: 2 }[o.status] ?? -1;
  const numRef = useRef();
  const cancelled = o.status === 'cancelled';
  const first = useRef(true);
  useEffect(() => {
    if (first.current || o.status === 'ready') setTimeout(() => fireConfetti(numRef.current), 350);
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
      <motion.div ref={numRef} className="ordno brand rainbow-text" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ ...T.bouncy, delay: 0.25 }}>#{o.no}</motion.div>

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

      {!cancelled && o.upi && <PayCard o={o} money={money} />}

      <div className="receipt">
        {o.items.map((i) => <div className="r" key={i.id}><span>{i.qty} × {i.name}</span><span>{money(i.price * i.qty)}</span></div>)}
        <div className="r t"><span>Total</span><span>{money(o.total)}</span></div>
        {o.note && <p className="muted note"><NotebookPen size={16} aria-hidden="true" />{o.note}</p>}
      </div>
      <p className="muted hint"><Clock size={16} aria-hidden="true" />Show this screen at the counter — it updates automatically.</p>
      <motion.button className="btn block" onClick={onAgain} {...press}>Order something else</motion.button>
    </motion.section>
  );
}

/* ---------------- UPI payment ---------------- */
function PayCard({ o, money }) {
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const upiId = new URLSearchParams(o.upi.split('?')[1]).get('pa');
  const copy = async () => {
    try { await navigator.clipboard.writeText(upiId); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };
  return (
    <AnimatePresence mode="wait" initial={false}>
      {o.paid ? (
        <motion.div key="paid" className="paycard paid" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={T.bouncy}>
          <CircleCheck size={22} aria-hidden="true" /><b>Payment received — thank you!</b>
        </motion.div>
      ) : (
        <motion.div key="unpaid" className="paycard" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={T.soft}>
          <div className="payhead"><Wallet size={20} aria-hidden="true" /><b>Pay {money(o.total)}</b><span className="pill st-new">Unpaid</span></div>
          <p className="muted paysub">Pay now by UPI, or pay at the counter.</p>
          <motion.a className="btn block" href={o.upi} {...press}>
            <Smartphone size={20} aria-hidden="true" />Pay {money(o.total)} with UPI app
          </motion.a>
          <p className="apps">GPay · PhonePe · Paytm · BHIM · any UPI app</p>
          <div className="payrow">
            <button className="linkbtn" onClick={() => setShowQr(!showQr)} aria-expanded={showQr}><QrCode size={16} aria-hidden="true" />{showQr ? 'Hide QR' : 'Show QR to scan'}</button>
            <button className="linkbtn" onClick={copy}><Copy size={16} aria-hidden="true" />{copied ? 'Copied!' : upiId}</button>
          </div>
          <AnimatePresence initial={false}>
            {showQr && (
              <motion.div className="payqr" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={T.spring}>
                <img src={`/api/orders/${o.id}/upi.svg`} alt={`UPI QR code to pay ${money(o.total)}`} width="200" height="200" />
              </motion.div>
            )}
          </AnimatePresence>
          <p className="muted paynote">After paying, show this screen at the counter — it turns green once we confirm.</p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
