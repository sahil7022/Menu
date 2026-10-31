# Chatore (चटोरे) — QR Menu & Orders for the Navrang food stall

A Navratri / Navrang-themed (nine colours) ordering site for a food stall.

| Page | Who | What |
|------|-----|------|
| `/` | Customers (opened by scanning the QR) | Enter name → pick items → cart with total → place order → get an order number that updates live (Received → Preparing → Ready) |
| `/admin` | Stall staff (password protected — or tap the stall name on the menu page) | Live list of who ordered what, with total, time and notes. Buttons to mark Preparing / Ready / Collected / Cancel. Sound on new order, revenue + item-wise totals, CSV export |
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
To change the staff password, update `ADMIN_PIN` in Vercel (then redeploy) **and** run this in the Supabase SQL editor:
`update navrang.config set v = encode(extensions.digest('NEW PASSWORD','sha256'),'hex') where k = 'pin_sha256';`

### Render / your own computer
`npm start` runs `server.js`. Without `SUPABASE_URL` orders go to `data/orders.json`
(fine for testing; lost on Render's free plan when it sleeps). Set the Supabase variables to make them permanent.

## Settings (environment variables)
- `ADMIN_PIN` – staff password for `/admin` (default `1234` — **change it**). Staff can also log in by tapping the stall name on the customer page.
- `PUBLIC_URL` – the public address the QR code points to, e.g. `https://navrang-menu.onrender.com` (if unset, the address you opened `/qr` from is used)
- `PORT` – default `3000`

## UPI payments
Set your UPI ID in `menu.json` → `"upi": { "id": "yourname@bank", "name": "Shown to payer" }`.
After ordering, customers get a **Pay ₹X with UPI app** button (GPay/PhonePe/Paytm/BHIM, amount and order number
pre-filled), a QR code, and your UPI ID to copy. Money goes straight to your account — no gateway, no fees.
Payments are **not** auto-detected: check your UPI app, then tap **Unpaid · mark paid** on the order in `/admin`;
the customer's screen turns green. Remove the `upi` block to hide online payment.

## Live updates & notifications
- Every screen updates by itself — instantly via Supabase Realtime pings, with a 3–5 s refresh as backup.
- **Customers**: after ordering, tap **Notify me** to get phone notifications: order confirmed → preparing → ready → payment received.
  The cart and **My orders** buttons (top-right) show every order this phone placed, with live status.
- **Workers**: tap **Phone alerts** on the orders page to get a notification for every new order.
- Uses standard Web Push (the same delivery Firebase Cloud Messaging uses in browsers) — free, no extra account.
  Keys are created automatically on first use and kept in the database.
  Android/Chrome/desktop work directly. **iPhone (iOS 16.4+) only after "Share → Add to Home Screen"** and opening it from there.

## Money (investment & profit)
On the orders page, add each investment (ingredients, gas, stall rent…). The Money panel shows
Investment, Collected (orders marked paid), Unpaid, and Profit/Loss = collected − investment, with a break-even bar.

## Reset database
Orders page → **Reset database** → choose orders and/or investment entries → type RESET.

## Workers' login
Tap the stall name on the menu page **5 times quickly** to open the "Poonam's Workers" login,
or go to `/admin` directly.

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
