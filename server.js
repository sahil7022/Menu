// Chatore stall server for Render or your own computer: serves the built React app (dist/) and the API.
// On Vercel, api/index.js serves the API instead and Vercel serves dist/ itself.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { handleApi, send, ADMIN_PIN } = require('./lib/api');
const store = require('./lib/store');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'dist'); // built by `npm run build`
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };
// Single-page app: these routes all load the React app, which picks the page.
const PAGES = { '/': 'index.html', '/admin': 'index.html', '/qr': 'index.html' };

http.createServer((req, res) => {
  const p = new URL(req.url, 'http://x').pathname;
  if (p.startsWith('/api/')) return handleApi(req, res, p);
  const file = PAGES[p] || p.slice(1);
  const full = path.normalize(path.join(PUBLIC_DIR, file));
  if (!full.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(full, (err, buf) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    const cache = file.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'Cache-Control': cache });
    res.end(buf);
  });
}).listen(PORT, () => {
  console.log(`Chatore stall running on http://localhost:${PORT}`);
  console.log(`  Customer menu : /       Orders (staff): /admin  (PIN ${ADMIN_PIN === '1234' ? '1234 - change via ADMIN_PIN' : 'set'})`);
  console.log(`  Printable QR  : /qr     Orders saved in: ${store.kind()}`);
});
