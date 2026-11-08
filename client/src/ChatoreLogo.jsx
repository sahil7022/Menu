// "Hawres" logo: a golden golgappa (pani puri) face licking its lips, with a chilli on top.
// Chatora = someone who can't resist tasty, spicy street food.
import { motion, useReducedMotion } from 'framer-motion';

export default function ChatoreLogo({ size = 96, animated = true, title = 'Hawres logo' }) {
  const reduce = useReducedMotion();
  const live = animated && !reduce;
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={title}>
      <defs>
        <radialGradient id="ch-puri" cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#ffe9a8" />
          <stop offset=".45" stopColor="#f7b84b" />
          <stop offset=".85" stopColor="#d9822b" />
          <stop offset="1" stopColor="#a85a17" />
        </radialGradient>
        <radialGradient id="ch-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffb347" stopOpacity=".55" />
          <stop offset="1" stopColor="#ffb347" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ch-chilli" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff5a4e" /><stop offset="1" stopColor="#c0122f" />
        </linearGradient>
      </defs>

      {/* warm glow */}
      <circle cx="60" cy="66" r="58" fill="url(#ch-glow)" />

      {/* chilli on top */}
      <motion.g style={{ transformOrigin: '60px 30px' }}
        animate={live ? { rotate: [-6, 6, -6] } : undefined} transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}>
        <path d="M60 30 C46 28 38 16 41 6 C49 12 56 18 63 25 Z" fill="url(#ch-chilli)" />
        <path d="M60 30 C63 24 67 20 73 19" stroke="#2f9e44" strokeWidth="4" strokeLinecap="round" fill="none" />
        <path d="M45 11 C48 14 51 16 54 18" stroke="#ffb3a8" strokeWidth="2" strokeLinecap="round" fill="none" opacity=".7" />
      </motion.g>

      {/* the puri face */}
      <circle cx="60" cy="68" r="42" fill="url(#ch-puri)" stroke="#8a4a12" strokeWidth="2" />
      <ellipse cx="44" cy="48" rx="14" ry="8" fill="#fff6d6" opacity=".45" transform="rotate(-25 44 48)" />
      {/* crispy texture */}
      {[[34, 86], [42, 92], [80, 90], [88, 80], [30, 74], [74, 44], [86, 58], [52, 40]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.6" fill="#b5651d" opacity=".55" />
      ))}

      {/* happy closed eyes */}
      <path d="M38 64 Q45 55 52 64" stroke="#3b1406" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M68 64 Q75 55 82 64" stroke="#3b1406" strokeWidth="4" strokeLinecap="round" fill="none" />
      {/* blush */}
      <ellipse cx="36" cy="74" rx="6" ry="3.5" fill="#ff6b6b" opacity=".45" />
      <ellipse cx="84" cy="74" rx="6" ry="3.5" fill="#ff6b6b" opacity=".45" />

      {/* big smile */}
      <path d="M42 76 Q60 100 78 76 Q60 84 42 76 Z" fill="#5a1406" />
      {/* tongue licking the lip */}
      <motion.path d="M66 82 C74 80 82 84 82 92 C82 98 74 98 71 93 C69 90 68 86 66 82 Z" fill="#ff5c86" stroke="#c2185b" strokeWidth="1.5"
        style={{ transformOrigin: '66px 82px' }}
        animate={live ? { rotate: [0, -12, 4, 0] } : undefined} transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 1.2, ease: 'easeInOut' }} />
      <path d="M72 88 C74 90 76 92 76 94" stroke="#c2185b" strokeWidth="1.2" fill="none" opacity=".6" />

      {/* sparkles = "yum!" */}
      <motion.g animate={live ? { opacity: [0.2, 1, 0.2], scale: [0.8, 1.1, 0.8] } : undefined} style={{ transformOrigin: '100px 40px' }}
        transition={{ duration: 1.6, repeat: Infinity }}>
        <path d="M100 32 L102 38 L108 40 L102 42 L100 48 L98 42 L92 40 L98 38 Z" fill="#fff1c9" />
      </motion.g>
      <path d="M18 44 L19.5 48 L23.5 49.5 L19.5 51 L18 55 L16.5 51 L12.5 49.5 L16.5 48 Z" fill="#ffd27a" opacity=".85" />
    </svg>
  );
}

// Logo + wordmark ("chatore" / "चटोरे" / FOOD STALL), used on the menu, QR poster and workers' page.
export function BrandMark({ menu, size = 104, row = false, variants, animated = true }) {
  return (
    <span className={`brandmark ${row ? 'row' : ''}`}>
      <motion.span className="brandmark-logo" variants={variants}><ChatoreLogo size={size} animated={animated} /></motion.span>
      <span className="brandmark-words">
        <motion.span className="logo gold-text brand" variants={variants}>{(menu?.stallName || 'Hawres').toLowerCase()}</motion.span>
        {menu?.stallNameHindi && <motion.span className="hindi brand" variants={variants} lang="hi">{menu.stallNameHindi}</motion.span>}
        <motion.span className="sublogo" variants={variants}>Food Stall</motion.span>
      </span>
    </span>
  );
}
