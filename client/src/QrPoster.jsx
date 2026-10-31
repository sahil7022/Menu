import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Clock, Download, MapPin, Printer, QrCode, ShoppingBag, Sparkles, UtensilsCrossed } from 'lucide-react';
import { Embers, Mandala, T, TempleBell, fetchJSON, press } from './ui.jsx';
import { BrandMark } from './ChatoreLogo.jsx';
import './qr.css';

const stagger = { show: { transition: { staggerChildren: 0.08 } } };
const up = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: T.soft } };

export default function QrPoster() {
  const [menu, setMenu] = useState(null);
  const [url, setUrl] = useState('');
  useEffect(() => {
    document.title = 'Hawres · Scan to order';
    fetchJSON('/api/menu').then(setMenu);
    fetchJSON('/api/site-url').then((d) => setUrl(d.url));
  }, []);
  const ev = menu?.event;

  return (
    <div className="qrpage">
      <Embers count={14} />
      <motion.div className="poster card" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={T.soft}>
        <div className="toran" aria-hidden="true" />
        <TempleBell side="left" chain={30} /><TempleBell side="right" chain={50} delay={0.8} />
        <div className="poster-art" aria-hidden="true" />
        <Mandala className="m1" /><Mandala className="m2" reverse />
        <motion.div className="inner" variants={stagger} initial="hidden" animate="show">
          {ev?.presentedBy && <motion.p className="p-presents" variants={up}>{ev.presentedBy}<em>presents</em><b className="evname">✦ {ev.name} ✦</b></motion.p>}
          <motion.h1 className="p-title" variants={up}>
            <BrandMark menu={menu} size={110} />
          </motion.h1>
          {menu?.tagline && <motion.p className="tagline" variants={up}>“{menu.tagline}”</motion.p>}
          {ev?.dates && <motion.div className="ribbon" variants={up}><span>{ev.dates}</span></motion.div>}
          <motion.span className="kicker" variants={up}><Sparkles size={14} aria-hidden="true" />Scan to order</motion.span>
          <motion.div className="frame" initial={{ scale: 0.7, rotate: -8, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} transition={{ ...T.bouncy, delay: 0.3 }}>
            <img src="/api/qr.svg" alt="QR code that opens the menu" width="240" height="240" />
          </motion.div>
          <motion.div className="steps" variants={stagger}>
            {[[QrCode, 'Scan'], [ShoppingBag, 'Order'], [UtensilsCrossed, 'Enjoy!']].map(([I, t]) => (
              <motion.div key={t} variants={up}><span className="sic"><I size={22} aria-hidden="true" /></span>{t}</motion.div>
            ))}
          </motion.div>
          {ev && (
            <motion.div className="p-info" variants={up}>
              {ev.time && <span><Clock size={15} aria-hidden="true" />{ev.time}</span>}
              {ev.venue && <span><MapPin size={15} aria-hidden="true" />{ev.venue}</span>}
              {ev.venueNote && <small>({ev.venueNote})</small>}
            </motion.div>
          )}
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
