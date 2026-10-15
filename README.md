# Ritme

Multi-method focus timer. Runs entirely in the browser, no account, data stays on device.

Product spec: `docs/PRD.md`. Design direction: `DESIGN.md`.

## Running

```bash
npm install
npm run dev
```

## Commands

| Command                         | Purpose                                                                       |
| ------------------------------- | ----------------------------------------------------------------------------- |
| `npm run dev`                   | Vite dev server                                                               |
| `npm run build`                 | `tsc -b` then production build to `dist/`                                     |
| `npm run preview`               | Serve the build output                                                        |
| `npm run lint`                  | ESLint                                                                        |
| `npm run typecheck`             | TypeScript, both projects                                                     |
| `npm run test`                  | Vitest (unit)                                                                 |
| `npm run test:e2e`              | Playwright (main flows)                                                       |
| `npm run check`                 | lint + typecheck + unit tests                                                 |
| `node scripts/check-tokens.mjs` | Sync `tokens.generated.ts` and the `DESIGN.md` color table from `tokens.css` |

## Stack

Vite + React + TypeScript, Tailwind v4 (tokens via CSS variables), Zustand, Dexie
(IndexedDB), Vitest, Playwright, vite-plugin-pwa. Deployed to Vercel.

## Structure

```
docs/PRD.md          product spec
DESIGN.md            design direction and tokens
src/app/             app shell, providers, constants
src/db/              Dexie schema
src/data/            Dexie repositories (tasks, sessions, backup)
src/lib/             pure utilities (storage, time)
src/pwa/             service worker registration
src/screens/         screens
src/state/           Zustand stores
src/stats/           stats and streak aggregation (F10, F11)
src/styles/          tokens and base layer
src/timer/           pure timer engine, method configs, Worker tick, mini window
public/              fonts, icons, manifest
e2e/                 Playwright tests
```

## Non-negotiable rules

1. Timer is driven by `endTime` (timestamp), not per-second subtraction. Tick in a Web Worker.
2. Timer logic is pure and testable with fake timers. Work methods = configuration on
   one engine, not branches per method.
3. UI follows PRD section 7 and `DESIGN.md`.
4. At most two font families. Time digits use `tabular-nums`.
5. UI copy is in English, short and flat.
6. One milestone per session (`docs/PRD.md` section 12), no features beyond the request.
7. Do not add dependencies without a written reason.
8. Colors come only from `src/styles/tokens.css`. After changing them, run
   `node scripts/check-tokens.mjs`. `src/lib/contrast.test.ts` locks every token
   pair to WCAG AA, so contrast cannot be lowered without a failing test.

## Milestone status

| Stage | Content                                                    | Status |
| ----- | ---------------------------------------------------------- | ------ |
| M0    | Repo, Vite, design tokens, manifest, deploy                | done   |
| M1    | Timer engine, Worker, all methods, tests                   | done   |
| M2    | Session notifications, session counter, shortcuts, state recovery | done |
| M3    | Mini window (Document PiP) and popup fallback              | done   |
| M4a   | Task list (F9), Dexie data layer, session recording        | done   |
| M4b   | Stats (F10), streak (F11), theme (F12)                     | done   |
| M5a   | Time Boxing (F16)                                          | done   |
| M5b   | Wake Lock (F14), PWA/offline (F15), accessibility audit    | done   |
| M5c   | Release polish, Lighthouse verification (Perf 96, A11y 100) | done  |
| M6    | F13 sounds, F19 backup export, Ultradian nudge             | done   |

## Manual test: PiP mini window (Chrome/Edge)

Document Picture-in-Picture cannot be tested headless. The `window.open`
fallback path (popup opens, time stays in sync, popup buttons control the main
page, closing the popup resets state) is covered by Playwright. The PiP path
is checked manually:

1. `npm run build && npm run preview`, open in desktop Chrome/Edge.
2. Click "Mini window" or press `M` → a 300×180 always-on-top
   window opens. The main page does not reload; there is no second timer.
3. Click "Start" → numbers in the mini window run in sync; the main
   buttons in the mini (Start/Pause/Finish/Start break) control the main page.
4. Skip to break → the mini accent changes too; switch light/dark theme on the
   main page → the mini follows.
5. Focus the mini, press Space then `R` → toggle and reset work from the mini
   window.
6. Close the mini via X → the "Mini window" button returns to `aria-pressed="false"`.
7. With the timer running and the mini open, reload the main tab → the browser
   shows a warning. Timer paused or mini closed → no warning.
8. After reload: the timer recovers as usual, the mini window is closed (it
   does not reopen automatically).
9. If PiP is denied (e.g. blocked by browser policy), the same action falls
   back to a small popup; if the popup is also blocked, the main screen shows
   the message "Popup blocked — mini window did not open".
