// Hidden staff login: opened by tapping the stall name on the customer page.
// The password is checked by the server (and the database) — it is never in this code.
import { useEffect, useRef, useState } from 'react';
import { motion, useAnimate } from 'framer-motion';
import { Eye, EyeOff, Lock, ShieldCheck, X } from 'lucide-react';
import { T, fetchJSON, press } from './ui.jsx';

export default function StaffGate({ onClose }) {
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState(false);
  const [scope, animate] = useAnimate();
  const inputRef = useRef();

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 150);
    const onKey = (e) => e.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => { clearTimeout(t); removeEventListener('keydown', onKey); };
  }, [onClose]);

  async function submit(e) {
    e.preventDefault();
    if (!pw) { setErr('Enter the password'); animate(scope.current, { x: [0, -10, 10, -6, 6, 0] }, { duration: 0.4 }); return; }
    setBusy(true); setErr('');
    try {
      await fetchJSON('/api/admin/orders', { headers: { 'X-Admin-Pin': pw } });
      sessionStorage.setItem('navrang_pin', pw);   // the orders page reads this and logs straight in
      setOk(true);
      setTimeout(() => { location.href = '/admin'; }, 650);
    } catch (e2) {
      setErr(e2.status === 401 ? 'Wrong password' : 'Could not connect — try again');
      setBusy(false);
      animate(scope.current, { x: [0, -10, 10, -6, 6, 0] }, { duration: 0.4 });
      inputRef.current?.select();
    }
  }

  return (
    <>
      <motion.div className="sheet-bg" style={{ zIndex: 40 }} onClick={onClose}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={T.fade} />
      <div className="gate-wrap">
        <motion.form ref={scope} className="gate card" onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="gateTitle"
          initial={{ opacity: 0, scale: 0.9, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} transition={T.spring}>
          <motion.button type="button" className="iconbtn gate-x" onClick={onClose} aria-label="Close" {...press}><X size={20} aria-hidden="true" /></motion.button>
          <motion.div className={`gate-badge ${ok ? 'ok' : ''}`} key={ok ? 'ok' : 'lock'}
            initial={{ scale: 0.5, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={T.bouncy}>
            {ok ? <ShieldCheck size={30} aria-hidden="true" /> : <Lock size={28} aria-hidden="true" />}
          </motion.div>
          <h2 id="gateTitle">{ok ? 'Welcome back!' : "Poonam's Workers"}</h2>
          <p className="muted" style={{ margin: '4px 0 16px' }}>{ok ? 'Opening the orders…' : 'Enter the password to see who ordered what.'}</p>
          <label className="label" htmlFor="gatePw">Password</label>
          <div className="field">
            <Lock size={20} aria-hidden="true" />
            <input id="gatePw" ref={inputRef} type={show ? 'text' : 'password'} value={pw} autoComplete="current-password"
              onChange={(e) => { setPw(e.target.value); setErr(''); }} aria-invalid={!!err} aria-describedby="gateErr" style={{ paddingRight: 52 }} />
            <button type="button" className="peek" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>
              {show ? <EyeOff size={20} aria-hidden="true" /> : <Eye size={20} aria-hidden="true" />}
            </button>
          </div>
          <p className="err" id="gateErr" role="alert">{err}</p>
          <motion.button className="btn block" disabled={busy} {...press}>
            {busy ? <><span className="spinner" />{ok ? 'Opening…' : 'Checking…'}</> : 'Open orders'}
          </motion.button>
        </motion.form>
      </div>
    </>
  );
}
