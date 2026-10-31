// Order storage. Two backends with the same interface:
//  - Supabase (when SUPABASE_URL is set): permanent; required on Vercel, recommended on Render.
//  - Local JSON file (data/orders.json): zero setup, for running on your own computer.
const fs = require('fs');
const path = require('path');

function supabaseStore() {
  // The database checks prices (against its menu table) and the staff PIN itself,
  // so only the public URL + publishable key are needed here — no server secret.
  const url = process.env.SUPABASE_URL.replace(/\/$/, '');
  const key = process.env.SUPABASE_KEY;
  if (!key) throw new Error('SUPABASE_KEY must be set with SUPABASE_URL');
  async function rpc(fn, args) {
    const headers = { 'Content-Type': 'application/json', apikey: key };
    if (key.startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;
    const r = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers, body: JSON.stringify(args) });
    const text = await r.text();
    if (!r.ok) throw new Error(`Database error (${r.status}): ${text.slice(0, 200)}`);
    const data = text ? JSON.parse(text) : null;
    if (data && !Array.isArray(data) && data.error) {
      const e = new Error(data.error); e.status = data.error === 'forbidden' ? 401 : data.error === 'Not found' ? 404 : 400; throw e;
    }
    return data;
  }
  return {
    create: (o) => rpc('navrang_create_order', { p_name: o.name, p_note: o.note, p_items: o.items.map(({ id, qty }) => ({ id, qty })) }),
    get: (id) => rpc('navrang_get_order', { p_id: id }),
    list: (pin) => rpc('navrang_list_orders', { p_pin: pin }),
    setStatus: (id, status, pin) => rpc('navrang_set_status', { p_pin: pin, p_id: id, p_status: status }),
    setPaid: (id, paid, pin) => rpc('navrang_set_paid', { p_pin: pin, p_id: id, p_paid: paid }),
    clear: (pin) => rpc('navrang_clear_orders', { p_pin: pin }),
    syncMenu: (items, pin) => rpc('navrang_sync_menu', { p_pin: pin, p_items: items }),
  };
}

function fileStore() {
  const dir = path.join(__dirname, '..', 'data');
  const file = path.join(dir, 'orders.json');
  fs.mkdirSync(dir, { recursive: true });
  let orders = [];
  try { orders = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { orders = []; }
  let nextNo = orders.reduce((m, o) => Math.max(m, o.no), 0) + 1;
  const save = () => fs.writeFile(file, JSON.stringify(orders, null, 2), () => {});
  return {
    async create(o) {
      const order = { id: Math.random().toString(36).slice(2, 12), no: nextNo++, ...o, status: 'new', paid: false, createdAt: new Date().toISOString() };
      orders.push(order); save(); return order;
    },
    async get(id) { return orders.find((x) => x.id === id) || null; },
    async list() { return orders; },
    async setStatus(id, status) { const o = orders.find((x) => x.id === id); if (!o) return null; o.status = status; save(); return o; },
    async setPaid(id, paid) { const o = orders.find((x) => x.id === id); if (!o) return null; o.paid = !!paid; save(); return o; },
    async clear() { orders = []; nextNo = 1; save(); },
    async syncMenu() {},
  };
}

let store;
module.exports = () => (store ||= process.env.SUPABASE_URL ? supabaseStore() : fileStore());
module.exports.kind = () => (process.env.SUPABASE_URL ? 'Supabase' : 'local file data/orders.json');
