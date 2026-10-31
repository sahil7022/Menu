import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimate } from 'framer-motion';
import {
  Bell, BellOff, Check, ChefHat, CircleCheck, ClipboardList, Clock, Download, Lock, LogOut,
  NotebookPen, QrCode, ReceiptText, RotateCcw, Search, Trash2, User, UtensilsCrossed, Wallet, X,
} from 'lucide-react';
import { AnimatedNumber, Mandala, NINE, T, fetchJSON, makeMoney, press } from './ui.jsx';
import './admin.css';

const money = makeMoney('₹');
const ACTIVE = ['new', 'preparing', 'ready'];
const NEXT = { new: ['preparing', 'Start preparing', ChefHat], preparing: ['ready', 'Mark ready', CircleCheck], ready: ['done', 'Collected', Check] };
const FILTERS = [['active', 'Active'], ['new', 'New'], ['preparing', 'Preparing'], ['ready', 'Ready'], ['done', 'Done'], ['all', 'All']];

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
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
  const seen = useRef(null);
  const soundRef = useRef(sound); soundRef.current = sound;

  useEffect(() => { document.title = 'Navrang · Orders'; }, []);

  const api = useCallback(async (path, opts = {}) => {
    try {
      return await fetchJSON(path, { ...opts, headers: { 'Content-Type': 'application/json', 'X-Admin-Pin': pin } });
    } catch (e) {
      if (e.status === 401) { sessionStorage.removeItem('navrang_pin'); setAuthed(false); setLoginErr('Wrong password, try again'); }
      throw e;
    }
  }, [pin]);

  const load = useCallback(async () => {
    const list = await api('/api/admin/orders').catch(() => null);
    if (!list) return;
    if (seen.current) {
      const n = list.filter((o) => !seen.current.has(o.id));
      if (n.length) {
        setFresh((f) => new Set([...f, ...n.map((o) => o.id)]));
        if (soundRef.current) beep();
        document.title = `(${n.length}) New order!`; setTimeout(() => (document.title = 'Navrang · Orders'), 4000);
      }
    }
    seen.current = new Set(list.map((o) => o.id));
    setOrders(list); setAuthed(true); sessionStorage.setItem('navrang_pin', pin);
  }, [api, pin]);

  useEffect(() => { if (pin && !authed && sessionStorage.getItem('navrang_pin')) load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!authed) return; const t = setInterval(load, 4000); return () => clearInterval(t); }, [authed, load]);

  async function setStatus(o, status) {
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
    const rows = [['No', 'Name', 'Items', 'Total', 'Status', 'Time', 'Note']].concat(orders.map((o) =>
      [o.no, o.name, o.items.map((i) => `${i.qty}x ${i.name}`).join('; '), o.total, o.status, new Date(o.createdAt).toLocaleString(), o.note || '']));
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `navrang-orders-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  const stats = [
    ['Revenue', <AnimatedNumber key="r" value={live.reduce((s, o) => s + o.total, 0)} format={money} />, Wallet, 'var(--green)', 'var(--green-ink)'],
    ['Orders', <AnimatedNumber key="o" value={live.length} />, ReceiptText, 'var(--purple)', 'var(--purple-ink)'],
    ['New', <AnimatedNumber key="n" value={counts.new} />, Bell, 'var(--orange)', 'var(--orange-ink)'],
    ['Preparing', <AnimatedNumber key="p" value={counts.preparing} />, ChefHat, 'var(--royal)', 'var(--royal-ink)'],
    ['Ready', <AnimatedNumber key="d" value={counts.ready} />, CircleCheck, 'var(--peacock)', 'var(--peacock-ink)'],
  ];

  return (
    <>
      <div className="toran" aria-hidden="true" />
      <div className="awrap">
        <header className="top">
          <h1><span className="hic"><ClipboardList size={24} aria-hidden="true" /></span>Orders
            <span className="live"><motion.i animate={{ opacity: [1, 0.25, 1] }} transition={{ duration: 1.6, repeat: Infinity }} />Live</span>
          </h1>
          <div className="tools">
            <motion.button className="btn small ghost" onClick={() => { setSound(!sound); if (!sound) beep(); }} aria-pressed={sound} {...press}>
              {sound ? <Bell size={18} aria-hidden="true" /> : <BellOff size={18} aria-hidden="true" />}{sound ? 'Sound on' : 'Sound off'}
            </motion.button>
            <motion.a className="btn small ghost" href="/qr" target="_blank" rel="noopener" {...press}><QrCode size={18} aria-hidden="true" />QR poster</motion.a>
            <motion.button className="btn small ghost" onClick={exportCsv} {...press}><Download size={18} aria-hidden="true" />Export CSV</motion.button>
            <motion.button className="btn small ghost" aria-label="Log out" {...press}
              onClick={() => { sessionStorage.removeItem('navrang_pin'); setPin(''); setAuthed(false); }}><LogOut size={18} aria-hidden="true" /></motion.button>
          </div>
        </header>

        <motion.div className="stats" initial="hidden" animate="show" variants={{ show: { transition: { staggerChildren: 0.06 } } }}>
          {stats.map(([l, v, I, c, ci]) => (
            <motion.div key={l} className="stat card" style={{ '--c': c, '--ci': ci }}
              variants={{ hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: T.soft } }} whileHover={{ y: -3 }}>
              <span className="sic"><I size={24} aria-hidden="true" /></span>
              <div><div className="v">{v}</div><div className="l">{l}</div></div>
            </motion.div>
          ))}
        </motion.div>

        <div className="filters">
          <div className="seg" role="tablist" aria-label="Filter orders">
            {FILTERS.map(([f, label]) => (
              <button key={f} role="tab" aria-selected={filter === f} className={`chip ${filter === f ? 'on' : ''}`} onClick={() => setFilter(f)}>
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
              <OrderCard key={o.id} o={o} fresh={fresh.has(o.id)} onStatus={setStatus}
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
        <p style={{ textAlign: 'right', marginTop: 20 }}>
          <motion.button className="btn small danger" {...press}
            onClick={async () => { if (confirm('Delete ALL orders? This cannot be undone.')) { await api('/api/admin/orders', { method: 'DELETE' }); seen.current = null; load(); } }}>
            <Trash2 size={18} aria-hidden="true" />Clear all orders
          </motion.button>
        </p>
      </div>
    </>
  );
}

function OrderCard({ o, fresh, onStatus, onSeen }) {
  const nx = NEXT[o.status];
  return (
    <motion.article layout className={`order card st-${o.status} ${fresh ? 'fresh' : ''}`} onClick={fresh ? onSeen : undefined}
      initial={{ opacity: 0, scale: 0.85, y: -20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.18 } }}
      transition={T.soft}>
      {fresh && <motion.span className="glow" aria-hidden="true" animate={{ opacity: [0.9, 0.3, 0.9] }} transition={{ duration: 1.6, repeat: Infinity }} />}
      <div className="otop">
        <span className="no">#{o.no}</span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={o.status} className="pill" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.15 }}>{o.status}</motion.span>
        </AnimatePresence>
      </div>
      <div className="who"><User size={18} aria-hidden="true" />{o.name}</div>
      <ul>{o.items.map((i) => <li key={i.id}><span className="q">{i.qty}×</span><span>{i.name}</span><span className="p">{money(i.price * i.qty)}</span></li>)}</ul>
      {o.note && <div className="note"><NotebookPen size={16} aria-hidden="true" /><span>{o.note}</span></div>}
      <div className="foot">
        <b>{money(o.total)}</b>
        <span className="time"><Clock size={14} aria-hidden="true" />{new Date(o.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <div className="acts">
        {nx && (() => { const I = nx[2]; return <motion.button className="btn small" onClick={() => onStatus(o, nx[0])} {...press}><I size={18} aria-hidden="true" />{nx[1]}</motion.button>; })()}
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
        <Mandala style={{ margin: '0 auto -6px', width: 96, height: 96, opacity: 0.9 }} />
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
