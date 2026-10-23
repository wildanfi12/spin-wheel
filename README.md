# HOWELL Kinetic Energy Wheel — local edition

React 19 / TypeScript / Vite / Motion / IndexedDB. Local development only.

## Run

From this folder on Windows:

```powershell
npm.cmd ci
npm.cmd run dev -- --port 5173
```

Open http://127.0.0.1:5173/spin-wheel/ . Stop the foreground server with Ctrl+C.
The development server is bound to loopback. No publish or deployment command is needed.

## Interaction

Hold the yellow button for 1.5 seconds; release only after FULL POWER. Early release,
pointer cancellation, capture loss, window blur, or hiding the tab cancels charging.
Space and Enter support the same hold/release interaction. Mode tanpa tahan offers
one tap to charge and a second deliberate tap to spin; it never auto-spins.

The wheel accelerates and decelerates over 6.5 seconds. Reduced-motion users receive
a short spin. Winner selection and atomic stock reservation happen before animation.
Ten segments stay visible; unavailable prizes have zero selection probability.
SELESAI opens the next participant session without removing past results.

History shows newest first, with Asia/Jakarta timestamps and CSV export. No delete UI.
Admin.tsx and admin navigation have been removed. Prize configuration lives in src/model.ts.
Existing persisted stock, image configuration, and history remain in IndexedDB.

## Storage compatibility

The existing database `howell-booth`, store `app`, key `state`, schema version 1 remain.
Old hexadecimal claim codes are accepted; new codes are sequential HW-000001 etc.
A refresh during a reserved spin reopens its saved result and does not reserve twice.
SELESAI acknowledges the result; it does not mark the physical gift as claimed.
Browser data is scoped to origin/profile: data on GitHub Pages, localhost, and
127.0.0.1 are separate. No remote history is automatically imported or deleted.
Keep using the same local hostname and port to retain access to local history.

## Assets

Original HOWELL logos are retained. The repository has no prize product photos.
The earphone image is copied unchanged from the existing local HOWELL asset folder.
Shirt, discount, data cable, and umbrella use icons. Existing saved product photos
are still honored. No substitute or invented product designs were generated.

## Checks

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npx.cmd playwright install chromium
node e2e/check.mjs
```

The browser check requires the local server above. It uses a fresh browser profile,
so test results do not alter the user's real booth history. Screenshots are saved
beside the project folder. Tested browser coverage does not replace physical iPhone,
Android, haptic, or touchscreen testing.

Implementation is shared on branch `feat/hold-to-charge` following the repository owner's request. No deployment was requested. The existing main-branch workflow deploys GitHub Pages, so this feature branch has not been merged into main.

## Verification performed

- TypeScript check, ESLint, and local production build: passed.
- Vitest: 12 tests passed (geometry, probability, stock transactions, rollback,
  session locking, charge gates, fixed ten-segment selection, monotonic easing).
- Chromium desktop 1920x1080 and viewport 390x844: screenshots inspected.
- Browser checks passed: short hold cancellation, full charge with no auto-spin,
  release spin, pointer/result match, saved result, next session, history after
  reload, pointercancel, lostpointercapture, keyboard spin, accessible two-tap mode,
  CSV download, no horizontal mobile overflow, and no console errors.
- Physical phones, real touchscreen hardware, audible output, and haptic output
  have not been tested.
- npm audit reports three inherited development-tool findings (one moderate,
  two critical) in Vitest/tinypool dependencies; no production dependency findings.
  Major test-tool upgrades were not applied as part of this UI change.

