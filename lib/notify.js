// Push notifications (standard Web Push — the same delivery Firebase Cloud Messaging uses in browsers)
// and "something changed" pings for live screens (Supabase Realtime broadcast).
const webpush = require('web-push');
const getStore = require('./store');

const ADMIN_PIN = process.env.ADMIN_PIN || '1234';
let keysPromise;

// VAPID keys are created once and stored in the database, so nothing secret has to be configured by hand.
function getKeys() {
  keysPromise ||= (async () => {
    const store = getStore();
    let k = await store.pushKeys(ADMIN_PIN);
    if (!k || !k.public || !k.private) {
      const fresh = webpush.generateVAPIDKeys();
      k = await store.pushKeys(ADMIN_PIN, fresh.publicKey, fresh.privateKey); // keeps the first saved pair if two servers race
    }
    webpush.setVapidDetails(process.env.PUSH_CONTACT || 'mailto:chatore-stall@example.com', k.public, k.private);
    return k;
  })().catch((e) => { keysPromise = null; throw e; });
  return keysPromise;
}

async function publicKey() {
  try { return (await getKeys()).public; } catch (e) { console.error('Push keys unavailable:', e.message); return null; }
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);

// Send to every device of a role (and, for customers, following this order). Never throws.
async function push(role, orderId, payload) {
  try {
    await getKeys();
    const store = getStore();
    const subs = await store.getSubs(role, orderId, ADMIN_PIN);
    await withTimeout(Promise.allSettled((subs || []).map(async (sub) => {
      try {
        await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 3600, urgency: 'high' });
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) await store.deleteSub(sub.endpoint, ADMIN_PIN).catch(() => {});
      }
    })), 4000);
  } catch (e) { console.error('Push failed:', e.message); }
}

// Tell open screens to refresh right away (they also refresh on a timer as a fallback).
async function ping(kind, orderId) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_KEY;
  if (!url || !key) return;
  try {
    const headers = { 'Content-Type': 'application/json', apikey: key };
    if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
    await withTimeout(fetch(`${url.replace(/\/$/, '')}/realtime/v1/api/broadcast`, {
      method: 'POST', headers,
      body: JSON.stringify({ messages: [{ topic: LIVE_CHANNEL, event: 'changed', payload: { kind, orderId: orderId || null, t: Date.now() }, private: false }] }),
    }), 2500);
  } catch (e) { /* screens will still refresh on their timer */ }
}

const LIVE_CHANNEL = 'chatore-live';
const STATUS_MSG = {
  new: ['Order confirmed', 'We got your order #{no}. We will tell you when it is being prepared.'],
  preparing: ['Preparing your order', 'Order #{no} is being prepared now.'],
  ready: ['Your order is ready! 🎉', 'Order #{no} is ready — please collect it at the counter.'],
  done: ['Enjoy your food!', 'Order #{no} handed over. Thank you for visiting Hawres!'],
  cancelled: ['Order cancelled', 'Order #{no} was cancelled. Please ask at the counter.'],
};
const customerStatus = (o) => {
  const [title, body] = STATUS_MSG[o.status] || STATUS_MSG.new;
  return { title, body: body.replace('{no}', o.no), tag: 'order-' + o.id, url: '/?order=' + o.id, important: o.status === 'ready' };
};

module.exports = { push, ping, publicKey, customerStatus, LIVE_CHANNEL };
