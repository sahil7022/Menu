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
npm run build      # builds the React app into dist/
npm start          # http://localhost:3000
```
While editing the design, run `npm start` and `npm run dev` together and open http://localhost:5173 (live reload).

## Hosting

### Vercel (recommended)
Configured by `vercel.json`: the React app is served as static files and `/api/*` runs as a serverless
function (`api/index.js`). Orders are stored in **Supabase**, because Vercel can't keep files.
Set these environment variables in Vercel:
- `SUPABASE_URL`, `SUPABASE_KEY` (the project's publishable key — safe to be public)
- `ADMIN_PIN` — must match the PIN stored in the database (see below)
- `PUBLIC_URL` — e.g. `https://navrang-menu.vercel.app` (used in the QR code)

The database (`supabase/schema.sql`) does its own checks: prices come from its menu table
(synced from `menu.json` automatically after each deploy), and staff actions need the PIN.
20 wrong PINs within 10 minutes locks staff actions for 10 minutes.
To change the PIN, update `ADMIN_PIN` in Vercel **and** run this in the Supabase SQL editor:
`update navrang.config set v = encode(extensions.digest('NEWPIN','sha256'),'hex') where k = 'pin_sha256';`

### Render / your own computer
`npm start` runs `server.js`. Without `SUPABASE_URL` orders go to `data/orders.json`
(fine for testing; lost on Render's free plan when it sleeps). Set the Supabase variables to make them permanent.

## Settings (environment variables)
- `ADMIN_PIN` – staff PIN for `/admin` (default `1234` — **change it**)
- `PUBLIC_URL` – the public address the QR code points to, e.g. `https://navrang-menu.onrender.com` (if unset, the address you opened `/qr` from is used)
- `PORT` – default `3000`

## Edit the menu
Change `menu.json` and restart. Each item supports:
`id`, `name`, `price`, `desc` (short description), `veg` (true/false), `popular` (shows a badge),
and optional `image` (a URL or a file you put in `public/`, e.g. `"image": "/img/dhokla.jpg"`).

## Tech & design
- **React + Vite** frontend in `client/`, **Framer Motion** for every animation
  (springs, `layout`/`layoutId` transitions, `AnimatePresence` exits, drag-to-close cart sheet,
  SVG path drawing, scroll-triggered `whileInView` reveals). `MotionConfig reducedMotion="user"`
  switches motion off for people who turn on "reduce motion" on their phone.
- Design follows the **UI/UX Pro Max** guidance for *Restaurant/Food Service*: Vibrant & Block-based +
  Motion-Driven style, warm appetizing palette (red/orange/gold) with the nine Navratri colours as accents,
  Baloo 2 + Nunito fonts, Lucide SVG icons (no emoji icons), 44px+ touch targets, AA text contrast,
  visible focus rings, labelled inputs with inline errors, transform/opacity-only animation.

## Change the colours
All colours, fonts, spacing and radii are design tokens at the top of `client/src/theme.css`.

## Deploy (e.g. Render, free)
1. New → Web Service → connect this repo.
2. Build command `npm install && npm run build`, start command `npm start`.
3. Add env vars `ADMIN_PIN` and `PUBLIC_URL` (your Render URL).
4. Open `https://<your-app>/qr`, print it, stick it on the stall.

Orders are saved in `data/orders.json`. On free hosts this file can reset when the
server restarts/redeploys — export CSV at the end of each day.
