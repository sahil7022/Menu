import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimate } from 'framer-motion';
import {
  Bell, BellOff, Camera, Check, ChefHat, CircleCheck, Clock, Download, ImagePlus, Lock, LogOut, MoreHorizontal, LayoutList, Soup,
  Banknote, BadgeIndianRupee, BellRing, HandPlatter, Smartphone, NotebookPen, Pencil, PiggyBank, Plus, RotateCw, TrendingDown, TrendingUp, TriangleAlert, QrCode, ReceiptText, RotateCcw, Search, Trash2, User, UtensilsCrossed, Wallet, X,
} from 'lucide-react';
import { AnimatedNumber, NINE, T, ThemeToggle, fetchJSON, makeMoney, press } from './ui.jsx';
import ChatoreLogo from './ChatoreLogo.jsx';
import { enablePush, pushState, useLive } from './live.js';
import { buzz, shrinkPhoto } from './media.js';
import './admin.css';

const money = makeMoney('₹');
const ACTIVE = ['new', 'preparing', 'ready'];
const NEXT = { new: ['preparing', 'Start preparing', ChefHat], preparing: ['ready', 'Mark ready', CircleCheck], ready: ['done', 'Hand over', HandPlatter] };
const STATUS_NAME = { new: 'new', preparing: 'preparing', ready: 'ready', done: 'handed over', cancelled: 'cancelled' };
const FILTERS = [['active', 'Active'], ['new', 'New'], ['preparing', 'Preparing'], ['ready', 'Ready'], ['done', 'Done'], ['all', 'All']];

// One audio context, unlocked by the worker's first tap: phones keep a context made from a timer muted forever.
let audioCtx;
const unlockAudio = () => {
  try { (audioCtx ||= new (window.AudioContext || window.webkitAudioContext)()).resume(); } catch { /* audio not available */ }
};
if (typeof window !== 'undefined') ['pointerdown', 'keydown'].forEach((ev) => addEventListener(ev, unlockAudio, { passive: true }));

function beep() {
  try {
    unlockAudio();
    const ctx = audioCtx;
    [880, 1175, 1568].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.15; g.gain.setValueAtTime(0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.start(t); o.stop(t + 0.3);
    });
  } catch { /* audio not available */ }
}

export default function Admin() {
  const [pin, setPin] = useState(() => sessionStorage.getItem('navrang_pin') || '');
  const [authed, setAuthed] = useState(false);
  const [loginErr, setLoginErr] = useState('');
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('active');
  const [q, setQ] = useState('');
  const [sound, setSound] = useState(true);
  const [fresh, setFresh] = useState(() => new Set());
  const [expenses, setExpenses] = useState([]);
  const [resetOpen, setResetOpen] = useState(null);   // null | { orders, expenses } = what's ticked when the dialog opens
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState(() => sessionStorage.getItem('hawres_tab') || 'orders');   // orders | menu | money
  const [tabDir, setTabDir] = useState(1);
  const [more, setMore] = useState(false);
  const TABS = ['orders', 'menu', 'money'];
  const goTab = (t) => { if (t === tab) return; buzz(); setTabDir(TABS.indexOf(t) > TABS.indexOf(tab) ? 1 : -1); setTab(t); sessionStorage.setItem('hawres_tab', t); scrollTo({ top: 0 }); };
  const flash = (m) => { setNotice(m); setTimeout(() => setNotice(''), 3500); };
  const seen = useRef(null);
  const lastSig = useRef('');
  const soundRef = useRef(sound); soundRef.current = sound;

  useEffect(() => { document.title = 'Hawres · Orders'; }, []);

  const api = useCallback(async (path, opts = {}) => {
    try {
      return await fetchJSON(path, { ...opts, headers: { 'Content-Type': 'application/json', 'X-Admin-Pin': pin } });
    } catch (e) {
      if (e.status === 401) { sessionStorage.removeItem('navrang_pin'); setAuthed(false); setLoginErr('Wrong password, try again'); }
      throw e;
    }
  }, [pin]);

  const load = useCallback(async () => {
    const [list, exp] = await Promise.all([api('/api/admin/orders').catch(() => null), api('/api/admin/expenses').catch(() => null)]);
    if (!list) return;
    if (Array.isArray(exp)) setExpenses((old) => (JSON.stringify(old) === JSON.stringify(exp) ? old : exp));
    if (seen.current) {
      const n = list.filter((o) => !seen.current.has(o.id));
      if (n.length) {
        setFresh((f) => new Set([...f, ...n.map((o) => o.id)]));
        if (soundRef.current) beep();
        buzz([300, 120, 300]);
        document.title = `(${n.length}) New order!`; setTimeout(() => (document.title = 'Hawres · Orders'), 4000);
      }
    }
    seen.current = new Set(list.map((o) => o.id));
    const sig = JSON.stringify(list);
    if (sig !== lastSig.current) { lastSig.current = sig; setOrders(list); }   // no redraw when nothing changed
    setAuthed(true); sessionStorage.setItem('navrang_pin', pin);
  }, [api, pin]);

  useEffect(() => { if (pin && !authed && sessionStorage.getItem('navrang_pin')) load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useLive(load, 3000, authed);   // instant updates (plus a 3-second safety refresh)

  // Phone alerts: the server must hold this phone's subscription. Re-send it silently on every open
  // (permission already granted → no prompt), so a lost or never-saved subscription heals itself.
  const [alertsOn, setAlertsOn] = useState(() => pushState() === 'ok' && !!localStorage.getItem('chatore_worker_push'));
  useEffect(() => {
    if (!authed || pushState() !== 'ok') return;
    enablePush('/api/admin/push', { 'X-Admin-Pin': pin }, { silent: true })
      .then(() => { localStorage.setItem('chatore_worker_push', '1'); setAlertsOn(true); })
      .catch(() => { localStorage.removeItem('chatore_worker_push'); setAlertsOn(false); });
  }, [authed, pin]);

  const [payAsk, setPayAsk] = useState(null);   // { o, mode: 'handover' | 'confirm' } — "how did they pay?"


  // paid by cash (offline, at the counter) or UPI; paid=false to undo
  async function setPaid(o, paid, method) {
    if (!paid && !confirm(`Mark order #${o.no} as NOT paid?`)) return;
    setPayAsk(null); buzz(paid ? [10, 40, 10] : 8);
    if (paid) flash(`Payment confirmed for #${o.no} — customer notified ✓`);
    setOrders((list) => list.map((x) => (x.id === o.id ? { ...x, paid, payMethod: paid ? method : null } : x))); // optimistic
    await api('/api/admin/orders/' + o.id, { method: 'PATCH', body: JSON.stringify({ paid, method }) }).catch(() => {});
    load();
  }

  // hand over + record payment in one go
  async function handOver(o, method) {
    setPayAsk(null);
    const body = method ? { status: 'done', paid: true, method } : { status: 'done' };
    setOrders((list) => list.map((x) => (x.id === o.id ? { ...x, status: 'done', ...(method ? { paid: true, payMethod: method } : {}) } : x)));
    await api('/api/admin/orders/' + o.id, { method: 'PATCH', body: JSON.stringify(body) }).catch(() => {});
    load();
  }

  async function setStatus(o, status) {
    if (status === 'done' && !o.paid) { setPayAsk({ o, mode: 'handover' }); return; }   // ask how they paid first
    buzz();
    if (status === 'cancelled' && !confirm(`Cancel order #${o.no}?`)) return;
    setFresh((f) => { const n = new Set(f); n.delete(o.id); return n; });
    setOrders((list) => list.map((x) => (x.id === o.id ? { ...x, status } : x))); // optimistic
    await api('/api/admin/orders/' + o.id, { method: 'PATCH', body: JSON.stringify({ status }) }).catch(() => {});
    load();
  }

  const live = orders.filter((o) => o.status !== 'cancelled');
  const counts = useMemo(() => {
    const c = { active: 0, new: 0, preparing: 0, ready: 0, done: 0 };
    for (const o of orders) { if (c[o.status] !== undefined) c[o.status]++; if (ACTIVE.includes(o.status)) c.active++; }
    return c;
  }, [orders]);

  const needle = q.trim().toLowerCase().replace(/^#/, '');
  const list = orders
    .filter((o) => (filter === 'all' || (filter === 'active' ? ACTIVE.includes(o.status) : o.status === filter)) &&
      (!needle || o.name.toLowerCase().includes(needle) || String(o.no) === needle))
    .sort((a, b) => (['active', 'new', 'preparing'].includes(filter) ? a.no - b.no : b.no - a.no));

  if (!authed) return <Login pin={pin} setPin={setPin} err={loginErr} onSubmit={() => { setLoginErr(''); seen.current = null; load(); }} />;

  const exportCsv = () => {
    const rows = [['No', 'Name', 'Items', 'Total', 'Paid', 'Paid by', 'Status', 'Time', 'Note']].concat(orders.map((o) =>
      [o.no, o.name, o.items.map((i) => `${i.qty}x ${i.name}`).join('; '), o.total, o.paid ? 'yes' : 'no', o.paid ? (o.payMethod || 'upi') : '', o.status, new Date(o.createdAt).toLocaleString(), o.note || '']));
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `chatore-orders-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  const stats = [
    ['New', counts.new, Bell, 'var(--orange)', 'var(--orange-ink)'],
    ['Preparing', counts.preparing, ChefHat, 'var(--royal)', 'var(--royal-ink)'],
    ['Ready', counts.ready, CircleCheck, 'var(--peacock)', 'var(--peacock-ink)'],
    ['Unpaid', live.filter((o) => !o.paid).length, BadgeIndianRupee, 'var(--pink)', 'var(--pink-ink)'],
  ];
  const slide = {
    initial: (d) => ({ opacity: 0, x: d * 60 }), animate: { opacity: 1, x: 0, transition: T.soft },
    exit: (d) => ({ opacity: 0, x: d * -60, transition: { duration: 0.16 } }),
  };

  return (
    <>
      <div className="toran" aria-hidden="true" />
      <header className="atop">
        <span className="abrand"><ChatoreLogo size={40} title="Hawres" animated={false} /><span><b>Hawres</b><small>Poonam's Workers</small></span></span>
        <span className="live"><motion.i animate={{ opacity: [1, 0.25, 1] }} transition={{ duration: 1.6, repeat: Infinity }} />Live</span>
        <ThemeToggle />
        <motion.button className="iconbtn morebtn" onClick={() => { buzz(); setMore(true); }} aria-label="More options" {...press}><MoreHorizontal size={22} aria-hidden="true" /></motion.button>
      </header>

      <main className="awrap">
        <AnimatePresence mode="wait" custom={tabDir} initial={false}>
          {tab === 'orders' && (
            <motion.section key="orders" custom={tabDir} variants={slide} initial="initial" animate="animate" exit="exit">
              <AnimatePresence initial={false}>
                {!alertsOn && (
                  <motion.div key="alertbar" className="alertbar card" role="note"
                    initial={{ opacity: 0, y: -12, height: 0 }} animate={{ opacity: 1, y: 0, height: 'auto' }} exit={{ opacity: 0, y: -12, height: 0 }} transition={T.soft}>
                    <motion.span className="alertbell" animate={{ rotate: [0, -14, 12, -8, 0] }} transition={{ duration: 0.8, repeat: Infinity, repeatDelay: 2.2 }}>
                      <BellRing size={22} aria-hidden="true" />
                    </motion.span>
                    <span className="alerttxt"><b>Phone alerts are off</b><small>Turn on so this phone rings for new orders, even with the screen locked.</small></span>
                    <AlertsButton pin={pin} compact onOn={() => setAlertsOn(true)} />
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="stats">
                {stats.map(([l, v, I, c, ci]) => (
                  <motion.div key={l} className="stat card" style={{ '--c': c, '--ci': ci }} whileTap={{ scale: 0.96 }}>
                    <span className="sic"><I size={20} aria-hidden="true" /></span>
                    <div><div className="v"><AnimatedNumber value={v} /></div><div className="l">{l}</div></div>
                  </motion.div>
                ))}
              </div>
              <div className="filters">
                <div className="seg" role="tablist" aria-label="Filter orders">
                  {FILTERS.map(([f, label]) => (
                    <button key={f} role="tab" aria-selected={filter === f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => { buzz(); setFilter(f); }}>
                      {filter === f && <motion.span layoutId="segpill" className="segpill" transition={T.spring} />}
                      <span className="chip-in">{label}{f !== 'all' && <b>{counts[f]}</b>}</span>
                    </button>
                  ))}
                </div>
                <div className="field">
                  <Search size={20} aria-hidden="true" />
                  <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or #number" aria-label="Search orders" />
                </div>
              </div>
              <motion.div layout className="grid" aria-live="polite">
                <AnimatePresence mode="popLayout">
                  {list.map((o) => (
                    <OrderCard key={o.id} o={o} fresh={fresh.has(o.id)} onStatus={setStatus} onPaid={setPaid}
                      onConfirmPay={() => { buzz(); setPayAsk({ o, mode: 'confirm' }); }}
                      onSeen={() => setFresh((f) => { const n = new Set(f); n.delete(o.id); return n; })} />
                  ))}
                  {!list.length && (
                    <motion.div key="empty" className="empty" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
                      <UtensilsCrossed size={40} aria-hidden="true" /><p><b>No orders here yet</b><br />New orders pop up automatically.</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
              <Summary live={live} />
            </motion.section>
          )}
          {tab === 'menu' && (
            <motion.section key="menu" custom={tabDir} variants={slide} initial="initial" animate="animate" exit="exit">
              <MenuEditor api={api} flash={flash} />
            </motion.section>
          )}
          {tab === 'money' && (
            <motion.section key="money" custom={tabDir} variants={slide} initial="initial" animate="animate" exit="exit">
              <MoneyPanel live={live} expenses={expenses} api={api} setExpenses={setExpenses} onReset={() => setResetOpen({ orders: true, expenses: true })} />
            </motion.section>
          )}
        </AnimatePresence>
      </main>

      {/* bottom tab bar (phone-first) */}
      <nav className="tabbar" aria-label="Sections">
        {[['orders', 'Orders', LayoutList, counts.new], ['menu', 'Menu', Soup, 0], ['money', 'Money', Wallet, 0]].map(([t, label, I, badge]) => (
          <button key={t} className={`tabbtn ${tab === t ? 'on' : ''}`} onClick={() => goTab(t)} aria-current={tab === t ? 'page' : undefined}>
            {tab === t && <motion.span layoutId="tabglow" className="tabglow" transition={T.spring} />}
            <motion.span className="tabicon" animate={tab === t ? { y: -2, scale: 1.12 } : { y: 0, scale: 1 }} transition={T.spring}>
              <I size={22} aria-hidden="true" />
              <AnimatePresence>{badge > 0 && <motion.b key={badge} className="tabbadge" initial={{ scale: 1.8 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={T.bouncy}>{badge}</motion.b>}</AnimatePresence>
            </motion.span>
            <span className="tablabel">{label}</span>
          </button>
        ))}
      </nav>

      {/* "More" sheet */}
      <AnimatePresence>
        {more && (
          <>
            <motion.div key="mbg" className="modal-bg" onClick={() => setMore(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div key="msheet" className="moresheet" role="dialog" aria-modal="true" aria-label="More options"
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%', transition: { duration: 0.2 } }} transition={T.sheet}
              drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.5 }} onDragEnd={(_, i) => { if (i.offset.y > 80) setMore(false); }}>
              <div className="grab"><div className="handle" /></div>
              <div className="morelist">
                <motion.button className="moreitem" onClick={() => { setSound(!sound); if (!sound) beep(); buzz(); }} whileTap={{ scale: 0.97 }}>
                  {sound ? <Bell size={22} aria-hidden="true" /> : <BellOff size={22} aria-hidden="true" />}<span><b>{sound ? 'Sound on' : 'Sound off'}</b><small>Beep on this screen for new orders</small></span>
                </motion.button>
                <div className="moreitem plain"><BellRing size={22} aria-hidden="true" /><span><b>Phone alerts</b><small>Ring this phone for every new order</small></span><AlertsButton pin={pin} compact onOn={() => setAlertsOn(true)} /></div>
                <motion.a className="moreitem" href="/qr" target="_blank" rel="noopener" whileTap={{ scale: 0.97 }}><QrCode size={22} aria-hidden="true" /><span><b>QR poster</b><small>Open the printable poster</small></span></motion.a>
                <motion.button className="moreitem" onClick={() => { exportCsv(); setMore(false); }} whileTap={{ scale: 0.97 }}><Download size={22} aria-hidden="true" /><span><b>Export CSV</b><small>Download all orders</small></span></motion.button>
                <motion.button className="moreitem danger" onClick={() => { setMore(false); setResetOpen({ orders: true, expenses: false }); }} whileTap={{ scale: 0.97 }}><RotateCw size={22} aria-hidden="true" /><span><b>Reset database</b><small>Clear orders and/or investment</small></span></motion.button>
                <motion.button className="moreitem" onClick={() => { sessionStorage.removeItem('navrang_pin'); lastSig.current = ''; setPin(''); setAuthed(false); setMore(false); }} whileTap={{ scale: 0.97 }}><LogOut size={22} aria-hidden="true" /><span><b>Log out</b></span></motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {payAsk && <PayAsk key="payask" o={payAsk.o} mode={payAsk.mode}
          onPick={(m) => (payAsk.mode === 'handover' ? handOver(payAsk.o, m) : setPaid(payAsk.o, true, m))} onClose={() => setPayAsk(null)} />}
      </AnimatePresence>
      <AnimatePresence>
        {resetOpen && <ResetDialog key="reset" preset={resetOpen} api={api} onClose={() => setResetOpen(null)}
          onDone={(what) => { setResetOpen(null); seen.current = null; setFresh(new Set()); load(); flash(`Reset done — ${what} cleared ✓`); }} />}
      </AnimatePresence>
      <AnimatePresence>
        {notice && <motion.div key={notice} className="toast atoast" role="status" initial={{ opacity: 0, y: 16, scale: 0.92 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0 }} transition={T.spring}><Check size={16} aria-hidden="true" />{notice}</motion.div>}
      </AnimatePresence>
    </>
  );
}

function OrderCard({ o, fresh, onStatus, onPaid, onConfirmPay, onSeen }) {
  const nx = NEXT[o.status];
  return (
    <motion.article layout className={`order card st-${o.status} ${fresh ? 'fresh' : ''}`} onClick={fresh ? onSeen : undefined}
      initial={{ opacity: 0, scale: 0.85, y: -20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.18 } }}
      transition={T.soft}>
      {fresh && <motion.span className="glow" aria-hidden="true" animate={{ opacity: [0.9, 0.3, 0.9] }} transition={{ duration: 1.6, repeat: Infinity }} />}
      <div className="otop">
        <span className="no">#{o.no}</span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={o.status} className="pill" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.15 }}>{STATUS_NAME[o.status]}</motion.span>
        </AnimatePresence>
      </div>
      <div className="who"><User size={18} aria-hidden="true" />{o.name}</div>
      <ul>{o.items.map((i) => <li key={i.id}><span className="q">{i.qty}×</span><span>{i.name}</span><span className="p">{money(i.price * i.qty)}</span></li>)}</ul>
      {o.note && <div className="note"><NotebookPen size={16} aria-hidden="true" /><span>{o.note}</span></div>}
      <div className="foot">
        <span className="paybox">
          <b>{money(o.total)}</b>
          {o.paid ? (
            <motion.button key="p" className="paytag paid" onClick={() => onPaid(o, false)} aria-label={`Order ${o.no} paid by ${o.payMethod === 'cash' ? 'cash' : 'UPI'}. Tap to undo`}
              initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={T.bouncy} whileTap={{ scale: 0.9 }}>
              <Check size={14} aria-hidden="true" />Paid · {o.payMethod === 'cash' ? 'Cash' : 'UPI'}
            </motion.button>
          ) : o.status !== 'cancelled' && <span className="unpaid">Unpaid</span>}
        </span>
        <span className="time"><Clock size={14} aria-hidden="true" />{new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <div className="acts">
        {nx && (() => { const I = nx[2]; return <motion.button className="btn small" onClick={() => onStatus(o, nx[0])} {...press}><I size={18} aria-hidden="true" />{nx[1]}</motion.button>; })()}
        {!o.paid && o.status !== 'cancelled' && (
          <motion.button className="btn small paystep" onClick={onConfirmPay} {...press}><Wallet size={18} aria-hidden="true" />Confirm payment</motion.button>
        )}
        {['new', 'preparing'].includes(o.status) && (
          <motion.button className="btn small ghost" onClick={() => onStatus(o, 'cancelled')} aria-label={`Cancel order ${o.no}`} {...press}><X size={18} aria-hidden="true" /></motion.button>
        )}
        {['done', 'cancelled'].includes(o.status) && (
          <motion.button className="btn small ghost" onClick={() => onStatus(o, 'new')} {...press}><RotateCcw size={18} aria-hidden="true" />Reopen</motion.button>
        )}
      </div>
    </motion.article>
  );
}

function Summary({ live }) {
  const rows = useMemo(() => {
    const agg = new Map();
    for (const o of live) for (const i of o.items) { const a = agg.get(i.name) || { qty: 0, amt: 0 }; a.qty += i.qty; a.amt += i.qty * i.price; agg.set(i.name, a); }
    return [...agg].sort((a, b) => b[1].qty - a[1].qty);
  }, [live]);
  const max = Math.max(1, ...rows.map(([, a]) => a.qty));
  return (
    <section className="summary card" aria-labelledby="sumh">
      <h3 id="sumh">Item-wise sales</h3>
      {rows.length ? rows.map(([n, a], i) => (
        <motion.div layout key={n} className="bar-row" style={{ '--c': NINE[i % 9][0] }} transition={T.soft}>
          <span><b>{a.qty}×</b> {n}</span>
          <span className="track"><motion.i initial={{ scaleX: 0 }} animate={{ scaleX: a.qty / max }} transition={{ duration: 0.7, delay: i * 0.04, ease: [0.2, 0.7, 0.3, 1] }} /></span>
          <span className="amt">{money(a.amt)}</span>
        </motion.div>
      )) : <p className="muted" style={{ margin: 0 }}>Nothing sold yet.</p>}
    </section>
  );
}

function Login({ pin, setPin, err, onSubmit }) {
  const [scope, animate] = useAnimate();
  useEffect(() => { if (err && scope.current) animate(scope.current, { x: [0, -10, 10, -6, 6, 0] }, { duration: 0.4 }); }, [err, animate, scope]);
  return (
    <>
      <div className="toran" aria-hidden="true" />
      <motion.form ref={scope} className="card login" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={T.soft}
        onSubmit={(e) => { e.preventDefault(); if (pin) onSubmit(); }}>
        <span style={{ display: 'grid', placeItems: 'center' }}><ChatoreLogo size={96} /></span>
        <h2>Poonam's Workers</h2>
        <p className="muted" style={{ margin: '-6px 0 4px' }}>Enter the password to see orders.</p>
        <label className="sr-only" htmlFor="pin">Password</label>
        <div className="field"><Lock size={20} aria-hidden="true" />
          <input id="pin" type="password" placeholder="Password" autoComplete="current-password" autoFocus value={pin} onChange={(e) => setPin(e.target.value)} />
        </div>
        <p className="err" role="alert">{err}</p>
        <motion.button className="btn block" {...press}>Open orders</motion.button>
      </motion.form>
    </>
  );
}

/* ---------------- Money: investment, collected, profit ---------------- */
function MoneyPanel({ live, expenses, api, setExpenses, onReset }) {
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const invest = expenses.reduce((s, e) => s + e.amount, 0);
  const collected = live.filter((o) => o.paid).reduce((s, o) => s + o.total, 0);
  const cash = live.filter((o) => o.paid && o.payMethod === 'cash').reduce((s, o) => s + o.total, 0);
  const upi = collected - cash;
  const pending = live.filter((o) => !o.paid).reduce((s, o) => s + o.total, 0);
  const profit = collected - invest;
  const ifAllPaid = collected + pending - invest;
  const progress = invest > 0 ? Math.min(1, collected / invest) : collected > 0 ? 1 : 0;

  async function add(e) {
    e.preventDefault(); setErr('');
    const amt = Math.round(Number(amount));
    if (!(amt > 0)) return setErr('Enter an amount above 0');
    setBusy(true);
    try { setExpenses(await api('/api/admin/expenses', { method: 'POST', body: JSON.stringify({ label, amount: amt }) })); setLabel(''); setAmount(''); }
    catch (e2) { setErr(e2.message || 'Could not save'); }
    setBusy(false);
  }
  async function remove(x) {
    if (!confirm(`Remove "${x.label}" (${money(x.amount)})?`)) return;
    setExpenses(await api('/api/admin/expenses/' + x.id, { method: 'DELETE' }).catch(() => expenses));
  }

  const tiles = [
    ['Investment', invest, PiggyBank, 'var(--purple)', 'var(--purple-ink)'],
    ['Collected', collected, Wallet, 'var(--green)', 'var(--green-ink)'],
    ['Unpaid', pending, BadgeIndianRupee, 'var(--orange)', 'var(--orange-ink)'],
    [profit >= 0 ? 'Profit' : 'Loss so far', Math.abs(profit), profit >= 0 ? TrendingUp : TrendingDown, profit >= 0 ? 'var(--green)' : 'var(--red)', profit >= 0 ? 'var(--green-ink)' : 'var(--red-ink)'],
  ];
  return (
    <section className="money card" aria-labelledby="moneyh">
      <div className="money-head">
        <h3 id="moneyh">Money</h3>
        <span className="muted">Profit = money collected − investment. Updates by itself.
          <button className="linkbtn resetlink" onClick={onReset}><RotateCw size={14} aria-hidden="true" />Reset money &amp; orders</button></span>
      </div>
      <div className="mtiles">
        {tiles.map(([l, v, I, c, ci]) => (
          <motion.div key={l} className={`mtile ${l.startsWith('Profit') || l.startsWith('Loss') ? 'big' : ''}`} style={{ '--c': c, '--ci': ci }} layout>
            <span className="sic"><I size={22} aria-hidden="true" /></span>
            <div><div className="v"><AnimatedNumber value={v} format={money} /></div><div className="l">{l}</div>
              {l === 'Collected' && <div className="split"><Banknote size={12} aria-hidden="true" />Cash {money(cash)} · <Smartphone size={12} aria-hidden="true" />UPI {money(upi)}</div>}</div>
          </motion.div>
        ))}
      </div>
      <div className="breakeven" aria-label={`Break-even ${Math.round(progress * 100)} percent`}>
        <div className="be-top"><span>{invest > 0 ? (collected >= invest ? 'Investment recovered 🎉' : `Break-even: ${money(Math.max(0, invest - collected))} to go`) : 'Add your investment to track profit'}</span>
          <span className="muted">If all unpaid orders pay: <b style={{ color: ifAllPaid >= 0 ? 'var(--green-ink)' : 'var(--red-ink)' }}>{ifAllPaid >= 0 ? '' : '−'}{money(Math.abs(ifAllPaid))}</b></span></div>
        <div className="be-track"><motion.i initial={{ scaleX: 0 }} animate={{ scaleX: progress }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} /></div>
      </div>
      <form className="expform" onSubmit={add}>
        <label className="sr-only" htmlFor="expLabel">What was it for</label>
        <input id="expLabel" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="What for? (e.g. Ingredients)" maxLength={60} />
        <label className="sr-only" htmlFor="expAmt">Amount in rupees</label>
        <input id="expAmt" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} placeholder="₹ Amount" inputMode="numeric" />
        <motion.button className="btn small" disabled={busy} {...press}><Plus size={18} aria-hidden="true" />Add investment</motion.button>
      </form>
      {err && <p className="err" role="alert">{err}</p>}
      {expenses.length > 0 && (
        <ul className="explist">
          <AnimatePresence initial={false}>
            {expenses.map((x) => (
              <motion.li key={x.id} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                <span>{x.label}</span><b>{money(x.amount)}</b>
                <button className="iconbtn small" onClick={() => remove(x)} aria-label={`Remove ${x.label}`}><X size={16} aria-hidden="true" /></button>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}

/* ---------------- Phone alerts for new orders ---------------- */
function AlertsButton({ pin, compact = false, onOn }) {
  const [state, setState] = useState(() => (pushState() === 'ok' && localStorage.getItem('chatore_worker_push') ? 'on' : 'off'));
  const [msg, setMsg] = useState('');
  const say = (m, ms = 7000) => { setMsg(m); setTimeout(() => setMsg(''), ms); };
  async function turnOn() {
    const wasOn = state === 'on';
    setState('busy'); setMsg('');
    try {
      const r = await enablePush('/api/admin/push', { 'X-Admin-Pin': pin });
      localStorage.setItem('chatore_worker_push', '1'); setState('on'); onOn?.();
      say(r.sent > 0 ? `✓ Test alert sent${wasOn ? ' again' : ''} — your phone should ring now.` : 'Saved, but the test alert could not be delivered. Check the phone has internet and try again.');
    } catch (e) {
      setState(wasOn ? 'on' : 'off');
      say(e.code === 'ios-install' ? 'iPhone: Share → Add to Home Screen, open Hawres from the home screen, then try again.'
        : e.code === 'denied' ? 'Notifications are blocked. Phone Settings → Apps → Chrome → Notifications → allow, then allow this site.'
          : e.code === 'unsupported' ? 'This browser can’t do notifications — use Chrome on Android.' : `Could not turn on alerts: ${e.message}`, 9000);
    }
  }
  return (
    <span style={{ position: 'relative' }}>
      <motion.button className={`btn small ${state === 'on' ? '' : 'ghost'}`} onClick={turnOn} disabled={state === 'busy'} {...press}
        title="Get a phone notification for every new order">
        <BellRing size={18} aria-hidden="true" />{state === 'on' ? (compact ? 'Test' : 'Send test alert') : state === 'busy' ? '…' : (compact ? 'Turn on' : 'Phone alerts')}
      </motion.button>
      <AnimatePresence>{msg && <motion.span className="tipmsg" role="status" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{msg}</motion.span>}</AnimatePresence>
    </span>
  );
}

/* ---------------- Reset database ---------------- */
function ResetDialog({ preset, api, onClose, onDone }) {
  const [orders, setOrders] = useState(preset?.orders ?? true);
  const [exp, setExp] = useState(preset?.expenses ?? false);
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ok = word.trim().toUpperCase() === 'RESET' && (orders || exp);
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  async function go(e) {
    e.preventDefault(); if (!ok) return;
    setBusy(true); setErr('');
    try {
      await api('/api/admin/reset', { method: 'POST', body: JSON.stringify({ orders, expenses: exp }) });
      onDone([orders && 'orders & payments', exp && 'investment'].filter(Boolean).join(' and '));
    }
    catch (e2) { setErr(e2.message || 'Could not reset'); setBusy(false); }
  }
  return (
    <>
      <motion.div className="modal-bg" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <div className="modal-wrap">
        <motion.form className="modal card" onSubmit={go} role="dialog" aria-modal="true" aria-labelledby="resetTitle"
          initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={T.spring}>
          <div className="modal-ic"><TriangleAlert size={28} aria-hidden="true" /></div>
          <h3 id="resetTitle">Reset database</h3>
          <p className="muted">This permanently deletes the chosen data. Export CSV first if you want a copy.</p>
          <label className="check"><input type="checkbox" checked={orders} onChange={(e) => setOrders(e.target.checked)} />All orders &amp; payments (numbers restart at #1)</label>
          <label className="check"><input type="checkbox" checked={exp} onChange={(e) => setExp(e.target.checked)} />Investment entries</label>
          <label className="label" htmlFor="resetWord" style={{ marginTop: 12 }}>Type <b>RESET</b> to confirm</label>
          <input id="resetWord" value={word} onChange={(e) => setWord(e.target.value)} autoComplete="off" autoFocus />
          <p className="err" role="alert">{err}</p>
          <div className="modal-acts">
            <motion.button type="button" className="btn small ghost" onClick={onClose} {...press}>Cancel</motion.button>
            <motion.button className="btn small danger-solid" disabled={!ok || busy} {...press}><Trash2 size={18} aria-hidden="true" />{busy ? 'Resetting…' : 'Reset now'}</motion.button>
          </div>
        </motion.form>
      </div>
    </>
  );
}

/* ---------------- Menu editor (Poonam's Workers can add / edit dishes) ---------------- */
const BLANK = { id: '', name: '', price: '', category: '', desc: '', veg: true, popular: false, available: true };

function MenuEditor({ api, flash = () => {} }) {
  const [cats, setCats] = useState([]);
  const [editing, setEditing] = useState(null);   // item being added/edited
  const [open, setOpen] = useState(true);
  const load = useCallback(async () => {
    const m = await fetchJSON('/api/menu').catch(() => null);
    if (m) setCats((old) => (JSON.stringify(old) === JSON.stringify(m.categories) ? old : m.categories));
  }, []);
  useEffect(() => { load(); }, [load]);
  useLive((ev) => { if (!ev.kind || ['menu', 'timer', 'visible'].includes(ev.kind)) load(); }, 20000);
  const count = cats.reduce((n, c) => n + c.items.length, 0);

  async function toggle(it, cat) {
    setCats((cs) => cs.map((c) => ({ ...c, items: c.items.map((x) => (x.id === it.id ? { ...x, available: !x.available } : x)) })));
    const r = await api('/api/admin/menu', { method: 'POST', body: JSON.stringify({ ...it, category: cat, available: !it.available }) }).catch(() => null);
    if (r) setCats(r);
  }
  const [uploading, setUploading] = useState(null);   // item id being uploaded
  async function uploadPhoto(it, file) {
    if (!file) return;
    setUploading(it.id);
    try {
      const ph = await shrinkPhoto(file);
      const r = await api(`/api/admin/menu/${it.id}/image`, { method: 'POST', body: JSON.stringify({ mime: ph.mime, data: ph.data }) });
      setCats(r); buzz([10, 40, 10]); flash(`Photo added to ${it.name} (${ph.kb} KB) ✓`);
    } catch (e) { flash(`Photo not saved: ${e.message}`); }
    setUploading(null);
  }
  async function removePhoto(it) {
    if (!confirm(`Remove the photo of ${it.name}?`)) return;
    const r = await api(`/api/admin/menu/${it.id}/image`, { method: 'DELETE' }).catch(() => null);
    if (r) { setCats(r); flash('Photo removed'); }
  }
  async function remove(it) {
    if (!confirm(`Delete "${it.name}" from the menu?`)) return;
    const r = await api('/api/admin/menu/' + it.id, { method: 'DELETE' }).catch(() => null);
    if (r) setCats(r);
  }

  return (
    <section className="menued card" aria-labelledby="menuh">
      <div className="money-head">
        <h3 id="menuh"><button className="linkbtn" style={{ font: 'inherit', color: 'inherit', padding: 0 }} onClick={() => setOpen(!open)} aria-expanded={open}>Menu ({count}) {open ? '▾' : '▸'}</button></h3>
        <motion.button className="btn small" onClick={() => setEditing({ ...BLANK, category: cats[0]?.name || '' })} {...press}><Plus size={18} aria-hidden="true" />Add dish</motion.button>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
            {cats.map((c, ci) => (
              <div key={c.name} className="mcat" style={{ '--c': NINE[ci % 9][0], '--ci': NINE[ci % 9][1] }}>
                <h4>{c.name}</h4>
                <AnimatePresence initial={false}>
                  {c.items.map((it) => (
                    <motion.div key={it.id} layout className={`mrow ${it.available ? '' : 'off'}`} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                      <label className={`mthumb ${uploading === it.id ? 'busy' : ''}`} aria-label={it.image ? `Change photo of ${it.name}` : `Add photo of ${it.name}`}>
                        {it.image ? <img src={it.image} alt="" /> : <ImagePlus size={22} aria-hidden="true" />}
                        {uploading === it.id ? <span className="spinner" /> : <span className="mcam"><Camera size={12} aria-hidden="true" /></span>}
                        <input type="file" accept="image/*" hidden onChange={(e) => { uploadPhoto(it, e.target.files[0]); e.target.value = ''; }} />
                      </label>
                      <span className="mname"><b>{it.name}</b>{it.popular && <em> · Popular</em>}{it.desc && <small>{it.desc}</small>}
                        {it.image && <button className="linkbtn rmphoto" onClick={() => removePhoto(it)}>Remove photo</button>}</span>
                      <span className="mprice">{money(it.price)}</span>
                      <button className={`avail ${it.available ? 'on' : ''}`} onClick={() => toggle(it, c.name)} role="switch" aria-checked={it.available}
                        aria-label={`${it.name} ${it.available ? 'available' : 'sold out'}`}>{it.available ? 'Available' : 'Sold out'}</button>
                      <button className="iconbtn small" onClick={() => setEditing({ ...it, category: c.name })} aria-label={`Edit ${it.name}`}><Pencil size={16} aria-hidden="true" /></button>
                      <button className="iconbtn small" onClick={() => remove(it)} aria-label={`Delete ${it.name}`}><Trash2 size={16} aria-hidden="true" /></button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            ))}
            {!cats.length && <p className="muted">No dishes yet — tap “Add dish”.</p>}
            {cats.length > 0 && <p className="muted phototip"><Camera size={14} aria-hidden="true" /> Tap a dish's picture square to take or choose a photo.</p>}
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {editing && <ItemDialog key="ed" item={editing} cats={cats.map((c) => c.name)} api={api} onClose={() => setEditing(null)}
          onSaved={(r) => { setCats(r); setEditing(null); flash('Dish saved ✓'); }} />}
      </AnimatePresence>
    </section>
  );
}

function ItemDialog({ item, cats, api, onClose, onSaved }) {
  const [f, setF] = useState({ ...item, price: String(item.price ?? '') });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState(null);   // { mime, data, preview, kb } picked in this dialog
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  async function save(e) {
    e.preventDefault(); setErr('');
    if (!f.name.trim()) return setErr('Enter the dish name');
    if (!(Number(f.price) >= 0) || f.price === '') return setErr('Enter the price');
    setBusy(true);
    try {
      const category = f.category.trim() || 'Menu';
      let r = await api('/api/admin/menu', { method: 'POST', body: JSON.stringify({ ...f, price: Math.round(Number(f.price)), category }) });
      if (photo) {
        // a new dish gets its id from the server: find it by name in that category
        const id = item.id || r.find((c) => c.name === category)?.items.filter((x) => x.name === f.name.trim()).pop()?.id;
        if (id) r = await api(`/api/admin/menu/${id}/image`, { method: 'POST', body: JSON.stringify({ mime: photo.mime, data: photo.data }) });
      }
      onSaved(r);
    }
    catch (e2) { setErr(e2.message || 'Could not save'); setBusy(false); }
  }
  return (
    <>
      <motion.div className="modal-bg" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <div className="modal-wrap">
        <motion.form className="modal card" onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="itemTitle"
          initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={T.spring}>
          <h3 id="itemTitle" style={{ color: 'var(--gold)' }}>{item.id ? 'Edit dish' : 'Add a dish'}</h3>
          <label className="photopick">
            {photo?.preview || item.image ? <img src={photo?.preview || item.image} alt="Dish photo" /> : <span className="ph-empty"><Camera size={28} aria-hidden="true" />Add a photo</span>}
            <span className="ph-btn"><Camera size={16} aria-hidden="true" />{photo || item.image ? 'Change photo' : 'Take / choose photo'}</span>
            <input type="file" accept="image/*" hidden onChange={async (e) => {
              const file = e.target.files[0]; e.target.value = ''; setErr('');
              try { setPhoto(await shrinkPhoto(file)); buzz(); } catch (e2) { setErr(e2.message); }
            }} />
          </label>
          <label className="label" htmlFor="itName">Name</label>
          <input id="itName" value={f.name} onChange={set('name')} maxLength={60} placeholder="e.g. Veg Fried Rice" />
          <div className="two">
            <span><label className="label" htmlFor="itPrice">Price (₹)</label>
              <input id="itPrice" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value.replace(/[^0-9]/g, '') })} inputMode="numeric" placeholder="60" /></span>
            <span><label className="label" htmlFor="itCat">Category</label>
              <input id="itCat" value={f.category} onChange={set('category')} list="catlist" maxLength={30} placeholder="e.g. Drinks" />
              <datalist id="catlist">{cats.map((c) => <option key={c} value={c} />)}</datalist></span>
          </div>
          <label className="label" htmlFor="itDesc">Short description (optional)</label>
          <input id="itDesc" value={f.desc || ''} onChange={set('desc')} maxLength={140} placeholder="e.g. Spicy, served hot" />
          <label className="check"><input type="checkbox" checked={!!f.veg} onChange={set('veg')} />Vegetarian</label>
          <label className="check"><input type="checkbox" checked={!!f.popular} onChange={set('popular')} />Show “Popular” badge</label>
          <label className="check"><input type="checkbox" checked={!!f.available} onChange={set('available')} />Available (untick = sold out)</label>
          <p className="err" role="alert">{err}</p>
          <div className="modal-acts">
            <motion.button type="button" className="btn small ghost" onClick={onClose} {...press}>Cancel</motion.button>
            <motion.button className="btn small" disabled={busy} {...press}><Check size={18} aria-hidden="true" />{busy ? 'Saving…' : 'Save dish'}</motion.button>
          </div>
        </motion.form>
      </div>
    </>
  );
}

/* ---------------- "How did they pay?" before handing over ---------------- */
function PayAsk({ o, mode = 'handover', onPick, onClose }) {
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  return (
    <>
      <motion.div className="modal-bg" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <div className="modal-wrap">
        <motion.div className="modal card payask" role="dialog" aria-modal="true" aria-labelledby="payAskTitle"
          initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={T.spring}>
          <h3 id="payAskTitle" style={{ color: 'var(--gold)' }}>{mode === 'confirm' ? `Confirm payment #${o.no}` : `Hand over #${o.no}`}</h3>
          <p className="muted">How did <b>{o.name}</b> pay <b style={{ color: 'var(--gold)' }}>{money(o.total)}</b>?{mode === 'confirm' && ' The customer gets a “Payment confirmed” message.'}</p>
          <div className="paychoices">
            <motion.button className="btn" onClick={() => onPick('cash')} {...press}><Banknote size={20} aria-hidden="true" />Cash</motion.button>
            <motion.button className="btn" onClick={() => onPick('upi')} {...press}><Smartphone size={20} aria-hidden="true" />UPI</motion.button>
          </div>
          {mode === 'handover' && <motion.button className="btn small ghost block" onClick={() => onPick(null)} {...press}>Not paid yet — hand over anyway</motion.button>}
          <button className="linkbtn" onClick={onClose} style={{ width: '100%' }}>Cancel</button>
        </motion.div>
      </div>
    </>
  );
}
