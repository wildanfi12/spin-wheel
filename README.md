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

Daily starting stock is TWS 3, shirt 6, umbrella 8, cable 5, earphone 20, and
voucher 50. The spin ledger in IndexedDB is the inventory authority for the static
Pages app. IndexedDB read/write transactions serialize spins across tabs on the
same browser profile and origin. A prize is reserved before the wheel animation;
voided prizes release the reservation. Stock is calculated from non-voided history
for the current Asia/Jakarta date, so the next day's stock becomes available at
00:00 WIB without a destructive reset or timer. The history itself is retained.

Each official spin uses a fresh `crypto.getRandomValues` draw. Daily stock limits
and draw weights are separate. The initial draw weights are 0.75 for TWS HW01, 6
for Kaos Howell, 8 for Payung Howell, 1.25 for Cable Data 4 in 1, 20 for Earphone
HW03, and 50 for Voucher Diskon 20%. TWS and Cable therefore use 25% of their daily
quota as draw weight. The next-spin probability is each eligible prize's draw
weight divided by the total weight of eligible prizes; exhausted prizes have 0%
chance. Results remain independent random draws, so a prize can still repeat
consecutively, and low turnout does not guarantee that any particular prize will
or will not be awarded. Admin shows both each prize's initial odds and the odds for
the next spin.

The Admin view shows the active operational date, remaining and initial stock,
issued count, base probability, and current next-spin probability per prize. History remains available
across days and page reloads.
Old catalogs are migrated to the six current prizes while keeping old spin records;
removed prizes are hidden from the active wheel/catalog but old results remain
readable, including a pending legacy result.

The Admin page in this static build has a local password gate. A TEST button next
to sound starts a practice spin immediately. Test spins run on a temporary copy of
the current wheel, are visibly marked, and never append to the operational ledger
or decrement stock. The password verifier is
included in the public client bundle, so this gate only prevents casual access; it
is not secure authentication and should not protect sensitive information. A true
server-side admin login and shared inventory require backend hosting.
The login form can remember access on the current browser profile for 30 days; it
stores only an expiry timestamp, never the password. Sound is enabled by default
when the page opens.

The PWA activates new versions automatically and removes outdated precache entries.
The wheel SVG is memoized so energy meter updates do not redraw its sectors, LED
and energy indicators use a lightweight CSS variable, and large-screen blur effects
are disabled to reduce GPU load on laptops connected to HDMI displays.

This is a static Pages deployment: IndexedDB data is per browser profile and origin.
Different devices or browser profiles do not share inventory/history. The previous
live `/api` endpoints are not available on GitHub Pages; a shared multi-device
inventory requires a server database and is outside this static deployment.

## Spin interaction

Hold the charge control for 1.5 seconds and release at full power. Early release,
pointer cancellation, capture loss, window blur, or hiding the tab cancels charging.
Space and Enter work with the same press/release behavior. The optional no-hold mode
starts a full-power spin with one tap. Spins now complete in at most 2.8 seconds;
reduced-motion users receive a shorter spin.

## Checks

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npx.cmd playwright install chromium
$env:HOWELL_ADMIN_PASSWORD = "(password admin lokal)"
node e2e/check.mjs
```

The browser check requires the local development server and uses a fresh browser
profile so it does not touch a booth profile's saved history. The E2E password is
provided through the environment and is not stored in the test source.
