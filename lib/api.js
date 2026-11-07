// All /api/* routes. Used by server.js (Render / your computer) and api/index.js (Vercel).
const crypto = require('crypto');
const QRCode = require('qrcode');
const menu = require('../menu.json');
const getStore = require('./store');
const notify = require('./notify');

const ADMIN_PIN = process.env.ADMIN_PIN || '1234';
const PUBLIC_URL = process.env.PUBLIC_URL || ''; // public address used in the QR code
const STATUSES = ['new', 'preparing', 'ready', 'done', 'cancelled'];

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

const money = (n) => (menu.currency || '₹') + Math.round(n).toLocaleString('en-IN');

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest();
const isAdmin = (req) => crypto.timingSafeEqual(sha(req.headers['x-admin-pin'] || ''), sha(ADMIN_PIN));
const siteUrl = (req) => PUBLIC_URL || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers['x-forwarded-host'] || req.headers.host}`;

// Menu = settings from menu.json (name, event, UPI…) + dishes from the database (workers edit them).
const { categories: _seed, ...menuConfig } = menu;
function groupMenu(items) {
  const cats = [];
  for (const it of items || []) {
    let c = cats.find((x) => x.name === it.category);
    if (!c) cats.push((c = { name: it.category, items: [] }));
    c.items.push({ id: it.id, name: it.name, price: it.price, desc: it.desc, veg: it.veg, popular: it.popular, available: it.available !== false });
  }
  return cats;
}

async function handleApi(req, res, p) {
  const store = getStore();
  const pin = String(req.headers['x-admin-pin'] || '');
  try {
    if (p === '/api/menu' && req.method === 'GET') return send(res, 200, { ...menuConfig, categories: groupMenu(await store.getMenu()) });

    if (p === '/api/orders' && req.method === 'POST') {
      const body = await readBody(req);
      const name = String(body.name || '').trim().slice(0, 40);
      if (!name) return send(res, 400, { error: 'Please enter your name' });
      const items = [];
      const itemById = new Map((await store.getMenu()).filter((x) => x.available !== false).map((x) => [x.id, x]));
      for (const { id, qty } of Array.isArray(body.items) ? body.items : []) {
        const item = itemById.get(id); // prices always come from the stored menu, never from the browser
        const q = Math.min(50, Math.max(0, parseInt(qty, 10) || 0));
        if (item && q > 0) items.push({ id, name: item.name, price: item.price, qty: q });
      }
      if (!items.length) return send(res, 400, { error: 'Your cart is empty (or those items just sold out)' });
      const order0 = await store.create({
        name, note: String(body.note || '').trim().slice(0, 140), items,
        total: items.reduce((s, i) => s + i.price * i.qty, 0),
      });
      // tell the workers' phones + refresh open screens (awaited: serverless functions stop after replying)
      await Promise.all([
        notify.push('worker', null, { title: `New order #${order0.no} · ${money(order0.total)}`, body: `${order0.name}: ${order0.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}`, tag: 'new-' + order0.id, url: '/admin', important: true }),
        notify.ping('order', order0.id),
      ]);
      return send(res, 201, { ...order0, upi: upiLink(order0) });
    }

    // Customer: several of their own orders at once (ids are random, so only the customer knows them)
    if (p === '/api/orders' && req.method === 'GET') {
      const ids = String(new URL(req.url, 'http://x').searchParams.get('ids') || '').split(',').filter((x) => /^[a-z0-9]{4,20}$/.test(x)).slice(0, 20);
      const list = (await Promise.all(ids.map((id) => store.get(id).catch(() => null)))).filter(Boolean);
      return send(res, 200, list.map((o) => ({ ...o, upi: upiLink(o) })));
    }

    // Live-update + push settings for the browser
    if (p === '/api/config' && req.method === 'GET') {
      const rt = process.env.SUPABASE_URL && process.env.SUPABASE_KEY
        ? { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_KEY, channel: notify.LIVE_CHANNEL } : null;
      return send(res, 200, { realtime: rt, pushKey: await notify.publicKey() });
    }

    // Customer: turn on notifications for one order
    const sub = p.match(/^\/api\/orders\/([a-z0-9]+)\/push$/);
    if (sub && req.method === 'POST') {
      const body = await readBody(req);
      await store.saveCustomerSub(sub[1], body.subscription);
      const o = await store.get(sub[1]);
      const r = o ? await notify.push('customer', o.id, notify.customerStatus(o)) : { sent: 0 }; // immediate "Order confirmed"
      return send(res, 200, { ok: true, ...r });
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
        // body: { status } and/or { paid, method: 'cash' | 'upi' } — both can be sent together ("hand over + paid")
        const body = await readBody(req);
        const hasPaid = typeof body.paid === 'boolean', hasStatus = body.status !== undefined;
        if (!hasPaid && !hasStatus) return send(res, 400, { error: 'Nothing to change' });
        if (hasStatus && !STATUSES.includes(body.status)) return send(res, 400, { error: 'Bad status' });
        if (hasPaid && body.paid && body.method && !['cash', 'upi'].includes(body.method)) return send(res, 400, { error: 'Bad payment method' });
        const found = await store.get(m[1]);
        if (!found) return send(res, 404, { error: 'Not found' });
        const before = { ...found };   // snapshot: some stores return the live object, which the updates below change
        let o = before;
        if (hasPaid) o = await store.setPaid(m[1], body.paid, pin, body.method);
        if (hasStatus) o = await store.setStatus(m[1], body.status, pin);
        const msgs = [];
        if (hasPaid && body.paid && !before.paid) msgs.push({ title: 'Payment received ✓', body: `Thanks! ${money(o.total)} received${o.payMethod === 'cash' ? ' in cash' : ' by UPI'} for order #${o.no}.`, tag: 'pay-' + o.id, url: '/?order=' + o.id });
        if (hasStatus && body.status !== before.status) msgs.push(notify.customerStatus(o));
        await Promise.all([...msgs.map((msg) => notify.push('customer', o.id, msg)), notify.ping('order', o.id)]);
        return send(res, 200, o);
      }
      if (p === '/api/admin/orders' && req.method === 'DELETE') { await store.clear(pin); await notify.ping('reset'); return send(res, 200, { ok: true }); }

      // Reset the database (workers choose what to wipe)
      if (p === '/api/admin/reset' && req.method === 'POST') {
        const body = await readBody(req);
        if (!body.orders && !body.expenses) return send(res, 400, { error: 'Choose what to reset' });
        await store.reset(pin, body.orders, body.expenses);
        await notify.ping('reset');
        return send(res, 200, { ok: true });
      }

      // Menu editing
      if (p === '/api/admin/menu' && req.method === 'POST') {
        const list = await store.saveItem(await readBody(req), pin);
        await notify.ping('menu');
        return send(res, 200, groupMenu(list));
      }
      const mi = p.match(/^\/api\/admin\/menu\/([A-Za-z0-9-]+)$/);
      if (mi && req.method === 'DELETE') { const list = await store.deleteItem(mi[1], pin); await notify.ping('menu'); return send(res, 200, groupMenu(list)); }

      // Investment / expenses
      if (p === '/api/admin/expenses' && req.method === 'GET') return send(res, 200, await store.listExpenses(pin));
      if (p === '/api/admin/expenses' && req.method === 'POST') {
        const body = await readBody(req);
        const list = await store.addExpense(String(body.label || ''), Math.round(Number(body.amount)), pin);
        await notify.ping('expenses');
        return send(res, 200, list);
      }
      const ex = p.match(/^\/api\/admin\/expenses\/(\d+)$/);
      if (ex && req.method === 'DELETE') { const list = await store.deleteExpense(Number(ex[1]), pin); await notify.ping('expenses'); return send(res, 200, list); }

      // Workers: get a phone alert for every new order
      if (p === '/api/admin/push' && req.method === 'POST') {
        const body = await readBody(req);
        await store.saveWorkerSub(body.subscription, pin);
        const r = await notify.push('worker', null, { title: 'Alerts are on 🔔', body: 'Test message: this phone will ring for every new Hawres order.', tag: 'alerts-on', url: '/admin' });
        return send(res, 200, { ok: true, ...r });
      }
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
