import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import './theme.css';
import Customer from './Customer.jsx';

const Admin = lazy(() => import('./Admin.jsx'));
const QrPoster = lazy(() => import('./QrPoster.jsx'));

const path = location.pathname;
const Page = path.startsWith('/admin') ? Admin : path.startsWith('/qr') ? QrPoster : Customer;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* reducedMotion="user": Framer Motion turns off transform/layout animations for people who ask for less motion */}
    <MotionConfig reducedMotion="user">
      <Suspense fallback={null}><Page /></Suspense>
    </MotionConfig>
  </StrictMode>,
);
