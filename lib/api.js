// All /api/* routes. Used by server.js (Render / your computer) and api/index.js (Vercel).
const crypto = require('crypto');
const QRCode = require('qrcode');
const menu = require('../menu.json');
const getStore = require('./store');

const ADMIN_PIN = process.env.ADMIN_PIN || '1234';
const PUBLIC_URL = process.env.PUBLIC_URL || ''; // public address used in the QR code
const STATUSES = ['new', 'preparing', 'ready', 'done', 'cancelled'];
const itemById = new Map();
for (const cat of menu.categories) for (const item of cat.items) itemById.set(item.id, item);

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

async function readBody(req) {
  if (req.body !== undefined) return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {}; // Vercel pre-parses
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

// UPI deep link (works with GPay, PhonePe, Paytm, BHIM…). Set "upi" in menu.json.
function upiLink(o) {
  const u = menu.upi;
  if (!u || !u.id) return null;
  const q = new URLSearchParams({ pa: u.id, pn: u.name || menu.stallName, am: o.total.toFixed(2), cu: 'INR', tn: `${menu.stallName} order #${o.no}` });
  return 'upi://pay?' + q.toString().replace(/\+/g, '%20');
}

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const isAdmin = (req) => crypto.timingSafeEqual(sha(req.headers['x-admin-pin'] || ''), sha(ADMIN_PIN));
const siteUrl = (req) => PUBLIC_URL || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers['x-forwarded-host'] || req.headers.host}`;

// Copy menu.json prices into the database once per server start (Supabase checks prices itself).
let menuSynced;
function syncMenu(store) {
  menuSynced ||= store.syncMenu([...itemById.values()].map(({ id, name, price }) => ({ id, name, price })), ADMIN_PIN)
    .catch((e) => { menuSynced = null; console.error('Menu sync failed (is ADMIN_PIN the same as the database PIN?):', e.message); });
  return menuSynced;
}

async function handleApi(req, res, p) {
  const store = getStore();
  const pin = String(req.headers['x-admin-pin'] || '');
  try {
    if (p === '/api/menu' && req.method === 'GET') return send(res, 200, menu);

    if (p === '/api/orders' && req.method === 'POST') {
      const body = await readBody(req);
      const name = String(body.name || '').trim().slice(0, 40);
      if (!name) return send(res, 400, { error: 'Please enter your name' });
      const items = [];
      for (const { id, qty } of Array.isArray(body.items) ? body.items : []) {
        const item = itemById.get(id); // prices always come from menu.json, never from the browser
        const q = Math.min(50, Math.max(0, parseInt(qty, 10) || 0));
        if (item && q > 0) items.push({ id, name: item.name, price: item.price, qty: q });
      }
      if (!items.length) return send(res, 400, { error: 'Your cart is empty' });
      await syncMenu(store);
      const order0 = await store.create({
        name, note: String(body.note || '').trim().slice(0, 140), items,
        total: items.reduce((s, i) => s + i.price * i.qty, 0),
      });
      return send(res, 201, { ...order0, upi: upiLink(order0) });
    }

    const mine = p.match(/^\/api\/orders\/([a-z0-9]+)$/);
    if (mine && req.method === 'GET') {
      const o = await store.get(mine[1]);
      return o ? send(res, 200, { ...o, upi: upiLink(o) }) : send(res, 404, { error: 'Not found' });
    }

    if (p.startsWith('/api/admin')) {
      if (!isAdmin(req)) return send(res, 401, { error: 'Wrong PIN' });
      if (p === '/api/admin/orders' && req.method === 'GET') return send(res, 200, await store.list(pin));
      const m = p.match(/^\/api\/admin\/orders\/([a-z0-9]+)$/);
      if (m && req.method === 'PATCH') {
        const body = await readBody(req);
        let o;
        if (typeof body.paid === 'boolean') o = await store.setPaid(m[1], body.paid, pin);
        else {
          if (!STATUSES.includes(body.status)) return send(res, 400, { error: 'Bad status' });
          o = await store.setStatus(m[1], body.status, pin);
        }
        return o ? send(res, 200, o) : send(res, 404, { error: 'Not found' });
      }
      if (p === '/api/admin/orders' && req.method === 'DELETE') { await store.clear(pin); return send(res, 200, { ok: true }); }
    }

    if (p === '/api/qr.svg' && req.method === 'GET') {
      const svg = await QRCode.toString(siteUrl(req), { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#3b0a45', light: '#ffffff' } });
      return send(res, 200, svg, 'image/svg+xml');
    }
    // UPI payment QR for one order. Amount comes from the stored order, never from the browser.
    const upiQr = p.match(/^\/api\/orders\/([a-z0-9]+)\/upi\.svg$/);
    if (upiQr && req.method === 'GET') {
      const o = await store.get(upiQr[1]);
      const link = o && upiLink(o);
      if (!link) return send(res, 404, { error: 'Not found' });
      const svg = await QRCode.toString(link, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#3b0d0d', light: '#ffffff' } });
      return send(res, 200, svg, 'image/svg+xml');
    }

    if (p === '/api/site-url') return send(res, 200, { url: siteUrl(req) });

    return send(res, 404, { error: 'Not found' });
  } catch (e) {
    if (e.status) return send(res, e.status, { error: e.status === 401 ? 'Wrong PIN' : e.message });
    console.error(e);
    return send(res, e instanceof SyntaxError ? 400 : 500, { error: e instanceof SyntaxError ? 'Bad request' : 'Server problem, please try again' });
  }
}

module.exports = { handleApi, send, ADMIN_PIN };
