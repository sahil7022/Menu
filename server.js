// Navrang stall: QR menu + ordering server.
// Zero-database: orders are kept in data/orders.json.
const http = require('http');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || '1234';
// Public address of the site, used for the QR code (e.g. https://navrang.onrender.com).
const PUBLIC_URL = process.env.PUBLIC_URL || '';

const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');

const menu = JSON.parse(fs.readFileSync(path.join(ROOT, 'menu.json'), 'utf8'));
const priceById = new Map();
for (const cat of menu.categories) for (const item of cat.items) priceById.set(item.id, item);

fs.mkdirSync(DATA_DIR, { recursive: true });
let orders = [];
try { orders = JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8')); } catch { orders = []; }
const saveOrders = () => fs.writeFile(ORDERS_FILE, JSON.stringify(orders, null, 2), () => {});
let nextNo = orders.reduce((m, o) => Math.max(m, o.no), 0) + 1;

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const PAGES = { '/': 'index.html', '/admin': 'admin.html', '/qr': 'qr.html' };

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e5) req.destroy(); });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const isAdmin = (req) => req.headers['x-admin-pin'] === ADMIN_PIN;
const siteUrl = (req) => PUBLIC_URL || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  try {
    // ---------- API ----------
    if (p === '/api/menu' && req.method === 'GET') return send(res, 200, menu);

    if (p === '/api/orders' && req.method === 'POST') {
      const body = await readBody(req);
      const name = String(body.name || '').trim().slice(0, 40);
      if (!name) return send(res, 400, { error: 'Please enter your name' });
      const items = [];
      for (const { id, qty } of Array.isArray(body.items) ? body.items : []) {
        const item = priceById.get(id);
        const q = Math.min(50, Math.max(0, parseInt(qty, 10) || 0));
        if (item && q > 0) items.push({ id, name: item.name, price: item.price, qty: q });
      }
      if (!items.length) return send(res, 400, { error: 'Your cart is empty' });
      const order = {
        id: Math.random().toString(36).slice(2, 10),
        no: nextNo++,
        name,
        note: String(body.note || '').trim().slice(0, 140),
        items,
        total: items.reduce((s, i) => s + i.price * i.qty, 0),
        status: 'new',
        createdAt: new Date().toISOString(),
      };
      orders.push(order);
      saveOrders();
      return send(res, 201, order);
    }

    // Customer can look up their own order (by secret id) to see its status.
    const mine = p.match(/^\/api\/orders\/([a-z0-9]+)$/);
    if (mine && req.method === 'GET') {
      const o = orders.find((x) => x.id === mine[1]);
      return o ? send(res, 200, o) : send(res, 404, { error: 'Not found' });
    }

    if (p.startsWith('/api/admin')) {
      if (!isAdmin(req)) return send(res, 401, { error: 'Wrong PIN' });
      if (p === '/api/admin/orders' && req.method === 'GET') return send(res, 200, orders);
      const m = p.match(/^\/api\/admin\/orders\/([a-z0-9]+)$/);
      if (m && req.method === 'PATCH') {
        const o = orders.find((x) => x.id === m[1]);
        if (!o) return send(res, 404, { error: 'Not found' });
        const { status } = await readBody(req);
        if (!['new', 'preparing', 'ready', 'done', 'cancelled'].includes(status)) return send(res, 400, { error: 'Bad status' });
        o.status = status;
        saveOrders();
        return send(res, 200, o);
      }
      if (p === '/api/admin/orders' && req.method === 'DELETE') {
        orders = []; nextNo = 1; saveOrders();
        return send(res, 200, { ok: true });
      }
    }

    if (p === '/api/qr.svg' && req.method === 'GET') {
      const svg = await QRCode.toString(siteUrl(req), { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#3b0a45', light: '#ffffff' } });
      return send(res, 200, svg, 'image/svg+xml');
    }
    if (p === '/api/site-url') return send(res, 200, { url: siteUrl(req) });

    // ---------- Static ----------
    const file = PAGES[p] || p.slice(1);
    const full = path.normalize(path.join(PUBLIC_DIR, file));
    if (!full.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden', 'text/plain');
    fs.readFile(full, (err, buf) => {
      if (err) return send(res, 404, 'Not found', 'text/plain');
      res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream' });
      res.end(buf);
    });
  } catch (e) {
    send(res, 400, { error: 'Bad request' });
  }
});

server.listen(PORT, () => {
  console.log(`Navrang stall running on http://localhost:${PORT}`);
  console.log(`  Customer menu : /       Orders (staff): /admin  (PIN ${ADMIN_PIN === '1234' ? '1234 - change via ADMIN_PIN' : 'set'})`);
  console.log(`  Printable QR  : /qr`);
});
