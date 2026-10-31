# Navrang Stall — QR Menu & Orders

A Navratri / Navrang-themed (nine colours) ordering site for a food stall.

| Page | Who | What |
|------|-----|------|
| `/` | Customers (opened by scanning the QR) | Enter name → pick items → cart with total → place order → get an order number that updates live (Received → Preparing → Ready) |
| `/admin` | Stall staff (PIN protected) | Live list of who ordered what, with total, time and notes. Buttons to mark Preparing / Ready / Collected / Cancel. Sound on new order, revenue + item-wise totals, CSV export |
| `/qr` | You | Printable QR poster that opens the menu |

## Run locally
```bash
npm install
npm start          # http://localhost:3000
```

## Settings (environment variables)
- `ADMIN_PIN` – staff PIN for `/admin` (default `1234` — **change it**)
- `PUBLIC_URL` – the public address the QR code points to, e.g. `https://navrang-menu.onrender.com` (if unset, the address you opened `/qr` from is used)
- `PORT` – default `3000`

## Edit the menu
Change `menu.json` (stall name, tagline, categories, items, prices, emoji) and restart.

## Change the colours
All colours are CSS variables at the top of `public/theme.css`.

## Deploy (e.g. Render, free)
1. New → Web Service → connect this repo.
2. Build command `npm install`, start command `npm start`.
3. Add env vars `ADMIN_PIN` and `PUBLIC_URL` (your Render URL).
4. Open `https://<your-app>/qr`, print it, stick it on the stall.

Orders are saved in `data/orders.json`. On free hosts this file can reset when the
server restarts/redeploys — export CSV at the end of each day.
