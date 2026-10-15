# PRD: Ritme — Multi-Method Focus Timer

*Working name, change it as you like. Version 1.0, October 1, 2026.*

## 1. Summary

Ritme is a focus timer web app that runs entirely in the browser and deploys to Vercel. What sets it apart from ordinary pomodoro timers: (a) five work methods, not just 25/5; (b) the timer can move into an **always-on-top mini window** so it stays visible and stays accurate while switching tabs/apps; (c) the look is deliberately instrument-like, not a SaaS template.

**Target user:** students and workers on laptops who switch tabs often (coding, writing, studying). **Goal:** an accurate timer that is pleasant to use every day, no account, data stays on device.

## 2. Goals and Non-Goals

| v1 goals | v1 non-goals |
| --- | --- |
| Accurate timer even with the tab in the background | Accounts, login, cross-device sync (v2) |
| 5 work methods + custom | Social features, leaderboards, ranking |
| Mini window (PiP) + fallback | Gamification (pets, confetti, XP) |
| Task list, stats, PWA offline | "AI coach" features or automatic recommendations |

## 3. Work Methods

| Method | Focus | Break | Timer behavior |
| --- | --- | --- | --- |
| **Pomodoro** | 25 min | 5 min (15 min every 4 sessions) | Counts down, 4-session cycle |
| **52/17** | 52 min | 17 min | Counts down, no long break |
| **Ultradian** | 90 min | 20 min | Counts down; suggested max 3–4 sessions/day |
| **Flowtime** | Flexible | Proportional | Focus **counts up**. The user presses "Finish" whenever, the break is computed automatically from focus length. No alarm during focus |
| **Time Boxing** | Clock-based | Flexible | The user lays out time blocks on a daily timeline (e.g. 09:00–10:30). The timer counts down to the end of the running block |
| **Custom** | Free | Free | The user decides, can be saved as a preset |

**Flowtime break rules (defaults, configurable):** focus \< 25 min → 5 min break; 25–50 → 8; 50–90 → 10; > 90 → 15.

**Time Boxing:** blocks are created by dragging on the timeline, each block can be linked to a task. When a block ends, a prompt appears: "extend / shift the following block / finish". Overrun blocks are flagged, not deleted.

All methods are configuration on a single timer engine (strategy pattern), so adding a new method does not change the core code.

## 4. Features and Priorities

**P0, required for the first release**

| ID | Feature | Done criteria |
| --- | --- | --- |
| F1 | Timestamp-based timer engine | Use `endTime = Date.now() + remaining`, not per-second decrement. Drift \< 1 second per hour, including with the tab in the background, laptop sleep, and resume |
| F2 | Timer runs in a Web Worker | Ticks are not throttled by the browser |
| F3 | Method picker + duration settings | Change method while idle without a reload; durations persist |
| F4 | Mini window | See section 6 |
| F5 | Session-finished notification | Sound + Web Notification + tab title changes (`12:34 · Focus`). Audio is unlocked on the user's first interaction |
| F6 | Session and cycle counter | Session position in the cycle is visible (e.g. 3 of 4) |
| F7 | Keyboard shortcuts | Space = start/pause, R = reset, S = skip, M = mini window, 1–5 = change method |
| F8 | Recovery after reload/tab close | Timer state is restored from local storage |

**P1, v1.1 target**

| ID | Feature |
| --- | --- |
| F9 | Simple task list; every focus session is linked to one task; count sessions per task |
| F10 | Daily/weekly stats: total focus hours, session count, by method, by task. Stored locally |
| F11 | Daily streak (consecutive days with at least 1 completed session) |
| F12 | Light/dark theme following the system + manual choice |
| F13 | Alarm and ambient sound choices (rain, fan, brown noise), all local files |
| F14 | Wake Lock while the timer runs |
| F15 | PWA: installable, works offline |
| F16 | Full Time Boxing (timeline, block drag) |

**P2, v2**

| ID | Feature |
| --- | --- |
| F17 | Login + cross-device sync (Supabase) |
| F18 | Strict mode: warning when pausing/skipping too often |
| F19 | CSV export, backup import |
| F20 | Indonesian / English UI |

## 5. Main User Flow

1. Open the web app → straight to the timer screen, last method selected, an obvious Start button.
2. Pick a task (optional) → Start.
3. Switch tabs → click "Mini window" once (or press M). The timer appears small above all windows.
4. Session finishes → sound + notification → the main button becomes "Start break".
5. End of day → open Stats, look at total focus.

## 6. Mini Window

- **Primary path:** Document Picture-in-Picture API (`documentPictureInPicture.requestWindow()`). Small always-on-top window with our own HTML/CSS. Desktop Chrome/Edge.
- **Fallback:** a small `window.open()` popup (not always-on-top) for other browsers, plus a countdown in the tab title.
- The window can only be opened through a user action (click/shortcut), never automatically.
- Copy the main page stylesheet into the mini window; timer logic stays single-source in the main page and the mini window only displays state. If the main tab closes, the mini window closes too, so show a warning before the tab closes while the timer runs.
- Mini window contents: time digits, mode label, one main button (start/pause), a thin progress line. No menu, no decoration. Initial size around 300×180.

## 7. UI Direction (anti "AI slop")

**Concept:** an instrument, not a dashboard. Think analog kitchen timer or measuring device: one dominant thing on screen — the time.

**Explicitly avoided**

- Purple-blue gradients, gradient text, glassmorphism, glow
- Progress rings with gradients and heavy shadows
- Big rounded-corner cards stacked everywhere
- Tomato emoji / sparkle icons / generic 3D illustrations
- Untouched default shadcn look, Inter everywhere
- Motivational copy ("Crush your goals!"), confetti, bouncy animations

**Used**

- **Color:** warm paper background `#F2EEE6`, ink `#1B1A17`. Dark mode uses warm black `#14130F`, not pure black or bluish gray. One accent per work mode, from a limited palette: brick red-orange (focus), moss green (break), ochre yellow (long break). Accents are only used on the main button and progress.
- **Typography:** at most two families. Time digits: a mono or bold grotesk with `font-variant-numeric: tabular-nums`, very large (e.g. `clamp(6rem, 22vw, 20rem)`) so digits do not shift every second. UI text: one neutral sans. Serif italic allowed very sparingly for labels like session names.
- **Progress:** a thin horizontal line the width of the viewport, plus a segment strip for the cycle (one segment per session), not a ring.
- **Layout:** the digits centered and dominant; controls small and sparse; task list and stats in side panels that can be closed. Generous spacing, 1px hairlines as dividers, almost no shadows.
- **Motion:** near zero. Mode change = 300ms background color transition. Digits are not animated. Respect `prefers-reduced-motion`.
- **Copy:** short, flat, concrete. "Focus", "5-minute break", "Session 3 of 4".
- **Accessibility:** WCAG AA contrast minimum, every control keyboard reachable, `aria-live` for status changes (not every second), clearly visible focus ring.

**Screens:** Timer (main), Task (panel), Time Boxing (daily timeline), Stats, Settings, Mini window.

Process advice: build one timer screen in Figma/straight in code first, decide font and palette, then build the rest. Do not start from a component library.

## 8. Technical Stack

| Layer | Choice | Reason |
| --- | --- | --- |
| Framework | **Vite + React + TypeScript** | This app is purely client-side, no SSR needed. Worker and PiP are simpler. Deploying to Vercel stays smooth (Next.js works too if you prefer it) |
| Styling | Tailwind CSS + CSS variables for theme tokens | Fast, but color/typography tokens are defined by us, not defaults |
| State | Zustand | Lightweight, fits timer state |
| Storage | IndexedDB via Dexie (tasks, sessions, stats); localStorage for small settings | Structured, queryable data |
| Timer | Web Worker + state machine (XState or manual reducer) | Accurate and easy to test |
| Chart | Hand-rolled SVG or uPlot | Simple stats, avoid heavy libraries |
| PWA | vite-plugin-pwa | Service worker, manifest, offline |
| Tests | Vitest (timer engine), Playwright (main flows) | The timer engine must be tested with fake timers |
| Deploy | Vercel (preview per PR, production from `main`) | As planned |
| v2 | Supabase (auth + Postgres) for sync | Free at small scale |

## 9. Data Model (concise)

```
Session  { id, method, kind: focus|break|longBreak, startedAt, endedAt, plannedMs, actualMs, taskId?, completed }
Task     { id, title, createdAt, doneAt?, sessionCount }
Block    { id, date, startMin, endMin, taskId?, status }          // Time Boxing
Preset   { id, name, focusMs, breakMs, longBreakMs?, cycle? }
Settings { theme, sound, autoStartNext, notifications, wakeLock, lastMethod }
TimerState { method, phase, endTime?, elapsedMs?, cycleIndex, running }  // restored on reload
```

## 10. Non-Functional Requirements

- **Accuracy:** drift \< 1 second/hour, including a background tab and resuming from sleep
- **Performance:** Lighthouse Performance and Accessibility ≥ 95; initial JS \< 150 KB gzip
- **Privacy:** all data local in v1; no third-party trackers
- **Browsers:** full Chrome/Edge (including PiP); Firefox/Safari with the popup fallback
- **Offline:** after the first visit, all P0 features work without internet

## 11. Risks and Technical Notes

| Risk | Mitigation |
| --- | --- |
| Browser blocks autoplay audio | Unlock AudioContext on first interaction; show an indicator when sound is not active yet |
| Notification permission denied | Sound + tab title still work; explain how to enable it in settings |
| No PiP in Firefox/Safari | Feature detection (`'documentPictureInPicture' in window`), use the fallback |
| Laptop sleeps while the timer runs | Compute from the timestamp on wake; if it already passed, show the finished session right away |
| Time Boxing eats too much build time | Ship it first as P1 (F16); the initial v1 is enough with the other 4 methods |

## 12. Milestones (estimate for one person, working around classes)

| Stage | Content | Estimate |
| --- | --- | --- |
| M0 | Repo setup, Vite, empty deploy to Vercel, design tokens (colors/fonts) | 1 day |
| M1 | Timer engine + Worker + countdown methods + Flowtime + tests | 3–4 days |
| M2 | Final timer screen, shortcuts, notifications, state recovery | 3 days |
| M3 | Mini window + fallback | 2 days |
| M4 | Task list, stats, streak, theme | 4–5 days |
| M5 | Time Boxing, PWA, polish, accessibility, Lighthouse | 4–5 days |
| v2 | Account sync, strict mode, export | to follow |

## 13. Success Metrics

- Used daily for 2 weeks without going back to another timer
- Drift test passes (run 60 minutes in a background tab, difference \< 1 second)
- Lighthouse ≥ 95 in Performance and Accessibility
- Others who see it say "this isn't a template", not "this is very AI cool"

## 14. Open Questions

1. Final stack: Vite+React or Next.js?
2. v1 interface language: Indonesian only or two languages from the start?
3. Final name and visual identity (logo/wordmark)?
4. Does Time Boxing make the first release or follow in v1.1?
