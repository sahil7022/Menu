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
    setPaid: (id, paid, pin, method) => rpc('navrang_set_paid', { p_pin: pin, p_id: id, p_paid: paid, p_method: paid ? (method || 'upi') : null }),
    clear: (pin) => rpc('navrang_clear_orders', { p_pin: pin }),
    getMenu: () => rpc('navrang_get_menu', {}),
    saveItem: (item, pin) => rpc('navrang_save_item', { p_pin: pin, p_item: item }),
    deleteItem: (id, pin) => rpc('navrang_delete_item', { p_pin: pin, p_id: id }),
    reset: (pin, orders, expenses) => rpc('navrang_reset', { p_pin: pin, p_orders: !!orders, p_expenses: !!expenses }),
    listExpenses: (pin) => rpc('navrang_list_expenses', { p_pin: pin }),
    addExpense: (label, amount, pin) => rpc('navrang_add_expense', { p_pin: pin, p_label: label, p_amount: amount }),
    deleteExpense: (id, pin) => rpc('navrang_delete_expense', { p_pin: pin, p_id: id }),
    saveCustomerSub: (orderId, sub) => rpc('navrang_save_customer_sub', { p_order_id: orderId, p_sub: sub }),
    saveWorkerSub: (sub, pin) => rpc('navrang_save_worker_sub', { p_pin: pin, p_sub: sub }),
    getSubs: (role, orderId, pin) => rpc('navrang_get_subs', { p_pin: pin, p_role: role, p_order_id: orderId || null }),
    deleteSub: (endpoint, pin) => rpc('navrang_delete_sub', { p_pin: pin, p_endpoint: endpoint }),
    pushKeys: (pin, pub, priv) => rpc('navrang_push_keys', { p_pin: pin, p_public: pub || null, p_private: priv || null }),
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
  // expenses, push subscriptions and push keys live in a second file
  const extraFile = path.join(dir, 'extra.json');
  let extra = { expenses: [], subs: [], keys: null, nextExp: 1 };
  try { extra = { ...extra, ...JSON.parse(fs.readFileSync(extraFile, 'utf8')) }; } catch { /* first run */ }
  const saveExtra = () => fs.writeFile(extraFile, JSON.stringify(extra, null, 2), () => {});
  // menu: starts from menu.json, then workers edit it
  const menuItems = () => (extra.menu ||= require('../menu.json').categories.flatMap((c, ci) =>
    c.items.map((it, i) => ({ id: it.id, name: it.name, price: it.price, category: c.name, desc: it.desc || '', veg: it.veg !== false, popular: !!it.popular, available: true, sort: ci * 100 + i }))));
  return {
    async create(o) {
      const order = { id: Math.random().toString(36).slice(2, 12), no: nextNo++, ...o, status: 'new', paid: false, createdAt: new Date().toISOString() };
      orders.push(order); save(); return order;
    },
    async get(id) { return orders.find((x) => x.id === id) || null; },
    async list() { return orders; },
    async setStatus(id, status) { const o = orders.find((x) => x.id === id); if (!o) return null; o.status = status; save(); return o; },
    async setPaid(id, paid, pin, method) { const o = orders.find((x) => x.id === id); if (!o) return null; o.paid = !!paid; o.payMethod = paid ? (method === 'cash' ? 'cash' : 'upi') : null; save(); return o; },
    async clear() { orders = []; nextNo = 1; save(); },
    async getMenu() { return menuItems(); },
    async saveItem(item) {
      const items = menuItems();
      const name = String(item.name || '').trim().slice(0, 60), category = String(item.category || '').trim().slice(0, 30) || 'Menu';
      const price = Math.round(Number(item.price));
      if (!name) throw Object.assign(new Error('Enter the dish name'), { status: 400 });
      if (!(price >= 0 && price <= 100000)) throw Object.assign(new Error('Enter a valid price'), { status: 400 });
      const ex = items.find((x) => x.id === item.id);
      const fields = { name, price, category, desc: String(item.desc ?? ex?.desc ?? '').slice(0, 140),
        veg: item.veg ?? ex?.veg ?? true, popular: item.popular ?? ex?.popular ?? false, available: item.available ?? ex?.available ?? true };
      if (ex) Object.assign(ex, fields);
      else items.push({ id: 'i' + Math.random().toString(36).slice(2, 11), ...fields, sort: Math.max(0, ...items.map((x) => x.sort)) + 1 });
      saveExtra(); return items;
    },
    async deleteItem(id) { extra.menu = menuItems().filter((x) => x.id !== id); saveExtra(); return extra.menu; },
    async reset(pin, o, e) {
      if (o) { orders = []; nextNo = 1; save(); extra.subs = extra.subs.filter((x) => x.role !== 'customer'); }
      if (e) extra.expenses = [];
      saveExtra(); return { ok: true };
    },
    async listExpenses() { return extra.expenses; },
    async addExpense(label, amount) {
      label = String(label || '').trim().slice(0, 60) || 'Investment';
      if (!(amount > 0 && amount <= 1e7)) { const err = new Error('Enter an amount above 0'); err.status = 400; throw err; }
      extra.expenses.push({ id: extra.nextExp++, label, amount, createdAt: new Date().toISOString() }); saveExtra(); return extra.expenses;
    },
    async deleteExpense(id) { extra.expenses = extra.expenses.filter((x) => x.id !== Number(id)); saveExtra(); return extra.expenses; },
    async saveCustomerSub(orderId, sub) {
      if (!orders.some((o) => o.id === orderId)) { const err = new Error('Not found'); err.status = 404; throw err; }
      const ex = extra.subs.find((x) => x.sub.endpoint === sub.endpoint);
      if (ex) { ex.sub = sub; ex.orderIds = [...new Set([...(ex.orderIds || []), orderId])]; } else extra.subs.push({ role: 'customer', sub, orderIds: [orderId] });
      saveExtra(); return { ok: true };
    },
    async saveWorkerSub(sub) {
      extra.subs = extra.subs.filter((x) => x.sub.endpoint !== sub.endpoint); extra.subs.push({ role: 'worker', sub }); saveExtra(); return { ok: true };
    },
    async getSubs(role, orderId) { return extra.subs.filter((x) => x.role === role && (!orderId || (x.orderIds || []).includes(orderId))).map((x) => x.sub); },
    async deleteSub(endpoint) { extra.subs = extra.subs.filter((x) => x.sub.endpoint !== endpoint); saveExtra(); return { ok: true }; },
    async pushKeys(pin, pub, priv) { if (!extra.keys && pub && priv) { extra.keys = { public: pub, private: priv }; saveExtra(); } return extra.keys || { public: null, private: null }; },
  };
}

let store;
module.exports = () => (store ||= process.env.SUPABASE_URL ? supabaseStore() : fileStore());
module.exports.kind = () => (process.env.SUPABASE_URL ? 'Supabase' : 'local file data/orders.json');
