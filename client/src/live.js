// Live updates + push notifications for the browser.
import { useEffect, useRef } from 'react';

let configPromise;
export const getConfig = () => (configPromise ||= fetch('/api/config').then((r) => r.json()).catch(() => ({})));

// Realtime "something changed" pings from Supabase, shared by every component on the page.
let channelPromise;
const listeners = new Set();
function startChannel() {
  channelPromise ||= (async () => {
    const cfg = await getConfig();
    if (!cfg.realtime) return null;
    const { createClient } = await import('@supabase/supabase-js'); // loaded only when needed
    const sb = createClient(cfg.realtime.url, cfg.realtime.key, { auth: { persistSession: false } });
    return sb.channel(cfg.realtime.channel, { config: { private: false } })
      .on('broadcast', { event: 'changed' }, (m) => listeners.forEach((fn) => fn(m.payload || {})))
      .subscribe();
  })().catch(() => null);
  return channelPromise;
}

// Calls `refresh` instantly when the server says something changed, every `fallbackMs` as a safety net,
// and whenever the phone comes back to this tab.
export function useLive(refresh, fallbackMs = 5000, enabled = true) {
  const fn = useRef(refresh); fn.current = refresh;
  useEffect(() => {
    if (!enabled) return;
    const run = (payload) => fn.current(payload || {});
    listeners.add(run); startChannel();
    const t = setInterval(() => run({ kind: 'timer' }), fallbackMs);
    const onVis = () => document.visibilityState === 'visible' && run({ kind: 'visible' });
    document.addEventListener('visibilitychange', onVis);
    return () => { listeners.delete(run); clearInterval(t); document.removeEventListener('visibilitychange', onVis); };
  }, [fallbackMs, enabled]);
}

// ---------- Push notifications ----------
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone;

// 'ok' | 'unsupported' | 'ios-install' (iPhone must add the site to the Home Screen first) | 'denied' | 'default'
export function pushState() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return isIOS() && !isStandalone() ? 'ios-install' : 'unsupported';
  }
  if (Notification.permission === 'granted') return 'ok';
  return Notification.permission; // 'denied' | 'default'
}

const b64ToBytes = (b64) => {
  const s = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};

const sameKey = (a, b) => {
  if (!a) return false;
  const x = new Uint8Array(a);
  return x.length === b.length && x.every((v, i) => v === b[i]);
};

// Ask permission, subscribe this browser, and send the subscription to `endpoint`.
// Returns the server's answer, e.g. { ok: true, sent: 1 } — `sent` = notifications actually delivered to push services.
export async function enablePush(endpoint, headers = {}) {
  const state = pushState();
  if (state === 'unsupported' || state === 'ios-install') throw Object.assign(new Error(state), { code: state });
  // Ask FIRST, straight from the tap: iPhone and Firefox refuse to show the question after any other await.
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (perm !== 'granted') throw Object.assign(new Error('Notifications are blocked for this site'), { code: 'denied' });
  const [cfg, reg] = await Promise.all([getConfig(), navigator.serviceWorker.register('/sw.js')]);
  if (!cfg.pushKey) throw Object.assign(new Error('Notifications are not set up on the server'), { code: 'server' });
  await navigator.serviceWorker.ready;
  const key = b64ToBytes(cfg.pushKey);
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub.options && sub.options.applicationServerKey, key)) { await sub.unsubscribe().catch(() => {}); sub = null; } // old key → re-subscribe
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ subscription: sub.toJSON() }) });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(out.error || 'Could not save'), { code: 'server' });
  return out;
}

// warm the config cache so the tap → permission question is instant
if (typeof window !== 'undefined') setTimeout(() => getConfig(), 0);
