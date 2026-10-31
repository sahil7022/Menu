import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimate } from 'framer-motion';
import {
  Bell, BellOff, Check, ChefHat, CircleCheck, Clock, Download, Lock, LogOut,
  BadgeIndianRupee, BellRing, NotebookPen, PiggyBank, Plus, RotateCw, TrendingDown, TrendingUp, TriangleAlert, QrCode, ReceiptText, RotateCcw, Search, Trash2, User, UtensilsCrossed, Wallet, X,
} from 'lucide-react';
import { AnimatedNumber, NINE, T, fetchJSON, makeMoney, press } from './ui.jsx';
import ChatoreLogo from './ChatoreLogo.jsx';
import { enablePush, pushState, useLive } from './live.js';
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
  const [expenses, setExpenses] = useState([]);
  const [resetOpen, setResetOpen] = useState(false);
  const seen = useRef(null);
  const soundRef = useRef(sound); soundRef.current = sound;

  useEffect(() => { document.title = 'Chatore · Orders'; }, []);

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
    if (Array.isArray(exp)) setExpenses(exp);
    if (seen.current) {
      const n = list.filter((o) => !seen.current.has(o.id));
      if (n.length) {
        setFresh((f) => new Set([...f, ...n.map((o) => o.id)]));
        if (soundRef.current) beep();
        document.title = `(${n.length}) New order!`; setTimeout(() => (document.title = 'Chatore · Orders'), 4000);
      }
    }
    seen.current = new Set(list.map((o) => o.id));
    setOrders(list); setAuthed(true); sessionStorage.setItem('navrang_pin', pin);
  }, [api, pin]);

  useEffect(() => { if (pin && !authed && sessionStorage.getItem('navrang_pin')) load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useLive(load, 3000, authed);   // instant updates (plus a 3-second safety refresh)

  async function setPaid(o, paid) {
    setOrders((list) => list.map((x) => (x.id === o.id ? { ...x, paid } : x))); // optimistic
    await api('/api/admin/orders/' + o.id, { method: 'PATCH', body: JSON.stringify({ paid }) }).catch(() => {});
    load();
  }

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
    const rows = [['No', 'Name', 'Items', 'Total', 'Paid', 'Status', 'Time', 'Note']].concat(orders.map((o) =>
      [o.no, o.name, o.items.map((i) => `${i.qty}x ${i.name}`).join('; '), o.total, o.paid ? 'yes' : 'no', o.status, new Date(o.createdAt).toLocaleString(), o.note || '']));
    const csv = rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `chatore-orders-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  };

  const stats = [
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
          <h1><ChatoreLogo size={52} title="Chatore" />Chatore · Orders
            <span className="live"><motion.i animate={{ opacity: [1, 0.25, 1] }} transition={{ duration: 1.6, repeat: Infinity }} />Live</span>
          </h1>
          <div className="tools">
            <motion.button className="btn small ghost" onClick={() => { setSound(!sound); if (!sound) beep(); }} aria-pressed={sound} {...press}>
              {sound ? <Bell size={18} aria-hidden="true" /> : <BellOff size={18} aria-hidden="true" />}{sound ? 'Sound on' : 'Sound off'}
            </motion.button>
            <AlertsButton pin={pin} />
            <motion.a className="btn small ghost" href="/qr" target="_blank" rel="noopener" {...press}><QrCode size={18} aria-hidden="true" />QR poster</motion.a>
            <motion.button className="btn small ghost" onClick={exportCsv} {...press}><Download size={18} aria-hidden="true" />Export CSV</motion.button>
            <motion.button className="btn small ghost" aria-label="Log out" {...press}
              onClick={() => { sessionStorage.removeItem('navrang_pin'); setPin(''); setAuthed(false); }}><LogOut size={18} aria-hidden="true" /></motion.button>
          </div>
        </header>

        <MoneyPanel live={live} expenses={expenses} api={api} setExpenses={setExpenses} />

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
              <OrderCard key={o.id} o={o} fresh={fresh.has(o.id)} onStatus={setStatus} onPaid={setPaid}
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
          <motion.button className="btn small danger" onClick={() => setResetOpen(true)} {...press}>
            <RotateCw size={18} aria-hidden="true" />Reset database
          </motion.button>
        </p>
      </div>
      <AnimatePresence>
        {resetOpen && <ResetDialog key="reset" api={api} onClose={() => setResetOpen(false)} onDone={() => { setResetOpen(false); seen.current = null; setFresh(new Set()); load(); }} />}
      </AnimatePresence>
    </>
  );
}

function OrderCard({ o, fresh, onStatus, onPaid, onSeen }) {
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
        <span className="paybox">
          <b>{money(o.total)}</b>
          <motion.button key={o.paid ? 'p' : 'u'} className={`paytag ${o.paid ? 'paid' : ''}`} onClick={() => onPaid(o, !o.paid)}
            aria-label={o.paid ? `Order ${o.no} is paid. Tap to mark unpaid` : `Order ${o.no} is unpaid. Tap to mark paid`}
            initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={T.bouncy} whileTap={{ scale: 0.9 }}>
            {o.paid ? <><Check size={14} aria-hidden="true" />Paid</> : <>Unpaid · mark paid</>}
          </motion.button>
        </span>
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
function MoneyPanel({ live, expenses, api, setExpenses }) {
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const invest = expenses.reduce((s, e) => s + e.amount, 0);
  const collected = live.filter((o) => o.paid).reduce((s, o) => s + o.total, 0);
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
        <span className="muted">Profit = money collected − investment. Updates by itself.</span>
      </div>
      <div className="mtiles">
        {tiles.map(([l, v, I, c, ci]) => (
          <motion.div key={l} className={`mtile ${l.startsWith('Profit') || l.startsWith('Loss') ? 'big' : ''}`} style={{ '--c': c, '--ci': ci }} layout>
            <span className="sic"><I size={22} aria-hidden="true" /></span>
            <div><div className="v"><AnimatedNumber value={v} format={money} /></div><div className="l">{l}</div></div>
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
function AlertsButton({ pin }) {
  const [state, setState] = useState(() => (pushState() === 'ok' && localStorage.getItem('chatore_worker_push') ? 'on' : 'off'));
  const [msg, setMsg] = useState('');
  async function turnOn() {
    setState('busy'); setMsg('');
    try { await enablePush('/api/admin/push', { 'X-Admin-Pin': pin }); localStorage.setItem('chatore_worker_push', '1'); setState('on'); }
    catch (e) {
      setState('off');
      setMsg(e.code === 'ios-install' ? 'iPhone: Share → Add to Home Screen, open it from there, then try again.'
        : e.code === 'denied' ? 'Notifications are blocked — allow them in browser settings.' : 'Could not turn on alerts.');
      setTimeout(() => setMsg(''), 6000);
    }
  }
  return (
    <span style={{ position: 'relative' }}>
      <motion.button className={`btn small ${state === 'on' ? '' : 'ghost'}`} onClick={turnOn} disabled={state === 'busy'} {...press}
        title="Get a phone notification for every new order">
        <BellRing size={18} aria-hidden="true" />{state === 'on' ? 'Phone alerts on' : state === 'busy' ? 'Turning on…' : 'Phone alerts'}
      </motion.button>
      <AnimatePresence>{msg && <motion.span className="tipmsg" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{msg}</motion.span>}</AnimatePresence>
    </span>
  );
}

/* ---------------- Reset database ---------------- */
function ResetDialog({ api, onClose, onDone }) {
  const [orders, setOrders] = useState(true);
  const [exp, setExp] = useState(false);
  const [word, setWord] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ok = word.trim().toUpperCase() === 'RESET' && (orders || exp);
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); addEventListener('keydown', k); return () => removeEventListener('keydown', k); }, [onClose]);
  async function go(e) {
    e.preventDefault(); if (!ok) return;
    setBusy(true); setErr('');
    try { await api('/api/admin/reset', { method: 'POST', body: JSON.stringify({ orders, expenses: exp }) }); onDone(); }
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
