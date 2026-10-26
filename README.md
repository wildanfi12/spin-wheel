# HOWELL SPIN & WIN

React 19, TypeScript, Vite, and IndexedDB. A static GitHub Pages app with a daily
prize wheel, participant history, and an admin inventory view.

## Run locally

```powershell
npm.cmd ci
npm.cmd run dev -- --port 5173
```

Open `http://127.0.0.1:5173/spin-wheel/`.

## Wheel and inventory

The wheel contains exactly six alternating yellow/white sectors: TWS HW01, Kaos
Howell, Payung Howell, Cable Data 4 in 1, Earphone HW03, and Voucher Diskon 20%.
The shirt sector is white. Product images in `assets/` are the supplied Howell
product assets.

Daily starting stock is TWS 3, shirt 10, umbrella 8, cable 5, earphone 20, and
voucher 50. The spin ledger in IndexedDB is the inventory authority for the static
Pages app. IndexedDB read/write transactions serialize spins across tabs on the
same browser profile and origin. A prize is reserved before the wheel animation;
voided prizes release the reservation. Stock is calculated from non-voided history
for the current Asia/Jakarta date, so the next day's stock becomes available at
00:00 WIB without a destructive reset or timer. The history itself is retained.

The Admin view shows the active operational date, remaining and initial stock, and
issued count per prize. History remains available across days and page reloads.
Old catalogs are migrated to the six current prizes while keeping old spin records;
removed prizes are hidden from the active wheel/catalog but old results remain
readable, including a pending legacy result.

This is a static Pages deployment: IndexedDB data is per browser profile and origin.
Different devices or browser profiles do not share inventory/history. The previous
live `/api` endpoints are not available on GitHub Pages; a shared multi-device
inventory requires a server database and is outside this static deployment.

## Spin interaction

Hold the charge control for 1.5 seconds and release at full power. Early release,
pointer cancellation, capture loss, window blur, or hiding the tab cancels charging.
Space and Enter work with the same press/release behavior. The optional no-hold mode
requires a deliberate second tap. Reduced-motion users receive a shorter spin.

## Checks

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npx.cmd playwright install chromium
node e2e/check.mjs
```

The browser check requires the local development server and uses a fresh browser
profile so it does not touch a booth profile's saved history.
