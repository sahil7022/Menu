import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, Printer, QrCode, ShoppingBag, Sparkles, UtensilsCrossed } from 'lucide-react';
import { Mandala, T, fetchJSON, press } from './ui.jsx';
import './qr.css';

const stagger = { show: { transition: { staggerChildren: 0.08 } } };
const up = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: T.soft } };

export default function QrPoster() {
  const [menu, setMenu] = useState(null);
  const [url, setUrl] = useState('');
  useEffect(() => {
    document.title = 'Navrang · Scan to order';
    fetchJSON('/api/menu').then(setMenu);
    fetchJSON('/api/site-url').then((d) => setUrl(d.url));
  }, []);

  return (
    <div className="qrpage">
      <motion.div className="poster card" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={T.soft}>
        <div className="toran" aria-hidden="true" />
        <Mandala className="m1" /><Mandala className="m2" reverse />
        <motion.div className="inner" variants={stagger} initial="hidden" animate="show">
          <motion.span className="kicker" variants={up}><Sparkles size={14} aria-hidden="true" />Scan to order</motion.span>
          <motion.h1 className="brand rainbow-text" variants={up}>{menu?.stallName || 'Navrang'}</motion.h1>
          <motion.p className="muted" variants={up} style={{ margin: '6px 0 0' }}>{menu?.tagline}</motion.p>
          <motion.div className="frame" initial={{ scale: 0.7, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ ...T.bouncy, delay: 0.2 }}>
            <img src="/api/qr.svg" alt="QR code that opens the menu" width="260" height="260" />
          </motion.div>
          <motion.div className="steps" variants={stagger}>
            {[[QrCode, 'Scan', 'var(--purple-ink)'], [ShoppingBag, 'Order', 'var(--red-ink)'], [UtensilsCrossed, 'Enjoy!', 'var(--peacock-ink)']].map(([I, t, c]) => (
              <motion.div key={t} variants={up}><span className="sic" style={{ background: c }}><I size={22} aria-hidden="true" /></span>{t}</motion.div>
            ))}
          </motion.div>
          <motion.p className="muted url" variants={up}>{url}</motion.p>
          <motion.div className="actions" variants={up}>
            <motion.button className="btn" onClick={() => print()} {...press}><Printer size={18} aria-hidden="true" />Print poster</motion.button>
            <motion.a className="btn ghost" href="/api/qr.svg" download="navrang-qr.svg" {...press}><Download size={18} aria-hidden="true" />Download QR</motion.a>
          </motion.div>
        </motion.div>
        <div className="band" aria-hidden="true" />
      </motion.div>
    </div>
  );
}
