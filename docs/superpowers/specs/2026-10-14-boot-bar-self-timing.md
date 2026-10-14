# Boot bar: a boot that times itself

Date: 2026-10-14. Author: Fable (design). Implementer: Opus. Commit as
`docs/superpowers/specs/2026-10-14-boot-bar-self-timing.md`.
Builds on the capsule work in `docs/superpowers/specs/2026-10-13-composer-handoff-button-origin.md`
and `...-smooth.md` (merged). Nothing about the capsule's look or the travel
changes; only what drives its fill.

## Austen's decision (do not re-litigate)

He reported the bar "jumps to 80% and then stays there". Audit on his dev
server (2026-10-14, MutationObserver on the fill plus a wrapped
`__tkaLoadProgress`) confirmed it and found four defects. He picked option A:
replace the hand-numbered checkpoints with a boot that times itself and
replays its own profile, retire the byte counter, prove it with a production
replay.

## What the audit found (measured, warm dev boot, ms from navigation start)

| t | event | bar |
|---|---|---|
| 244 | DOMContentLoaded | 5% |
| 1086 | `AppShellLoader` onMount calls 84 "Resolving services" | 84% |
| 1108 | `+layout.svelte` onMount calls 72 "Starting up" | ignored (below 84) |
| 3680 / 3695 | layout calls 76 "Connecting to cloud" / 80 "Checking session" | ignored |
| 4370 | `MainApplication` onMount, boot-snapshot path, calls 100 | dismiss |
| 4679 / 4771 / 4773 / 4791 | 88 / 92 / 95 / 100 from the async init | after dismiss |

Defects: (1) Svelte mounts children before parents, so the shell's 84 lands
before the layout's 72 and the percent-only monotonic guard discards 72, 76,
80; (2) the optimistic snapshot path reports 100 at mount, so 88/92/95 never
show; (3) Phase A's PerformanceObserver counts `/_app/` bytes, and Vite dev
serves `/src`, `/node_modules`, `/.cache`, so Phase A moved the bar zero
times on dev, and on prod the 3 MB first-visit seed against ~760 KB real
bytes tops out near 18%; (4) the percentages are assigned by call site and
bear no relation to where the time goes (cloud + session was 2.6 s of the
4.4 s; script loading was ~1 s).

## 1. What exists (read before editing)

- `src/app.html`: the boot script starts near `// Self-calibrating expected
  bytes` (~1837) and ends after the 15 s safety net (~2030). Phase A
  (`__tkaExpectedBytes`, `tka-load-bytes`, `__tkaObserver`,
  `__tkaProcessResources`, `__tkaUpdateBar`, `__tkaCap`, trickle fallback),
  Phase B (`__tkaLoadProgress`, `__tkaCurrentPercent`, `__tkaPhaseBStarted`),
  `__tkaMarkSplash` (performance marks `boot:splash:*`, used by the boot
  profiler), `__tkaSlowTimer` (4 s "Almost there"), `__tkaCrossfade`,
  `__tkaBootMessage` (German table), `__tkaReduceMotion`, the `loaded` class
  + `transitionend` + `remove()` dismissal, the 15 s net. Earlier in the same
  script: landing-mode early exit and the retro-route skip; leave those.
- Fill element `#loading-bar-fill` (CSS `width` transition 500 ms,
  `.boot-capsule-fill`), `#app-loading[role=progressbar][aria-valuenow]`,
  `#loading-text[aria-live]`.
- Call sites: `src/routes/+layout.svelte` 505 (72), 683 (76), 703 (80);
  `src/routes/app/AppShellLoader.svelte` 43 (84);
  `src/lib/shared/application/components/MainApplication.svelte` 405
  (snapshot 100), 449 (88), 475 (92), 486 (95), 504 (100);
  `src/lib/shared/auth/phone-sign-in/boot-screen.ts` 11 (100);
  `src/routes/tools/warm-thumbnails/+page.svelte` 92 (100); six
  `src/routes/test/*` pages (100). `src/lib/shared/analytics/boot-profiler.ts`
  reads the `boot:splash:*` marks.
- Tests that run or read this script: `tests/unit/landing-composer-handoff.test.ts`
  (the "two plain strings" case calls `__tkaLoadProgress(88, ...)`),
  `tests/unit/startup-splash-handoff.test.ts`, and `grep -rl "tka-load-bytes\|__tkaLoadProgress\|loading-bar-fill" tests src`.
- `after-boot-screen.ts` (Create method previews) waits on `loaded`,
  `display:none`, or removal. Keep that contract exactly.

## 2. The model

### Milestones (fixed rank order, reported by name)

| rank | name | reporter |
|---|---|---|
| 0 | `start` | the boot script itself, at script start |
| 1 | `scripts` | the earliest point in app code we control: a `<script module>` block in `+layout.svelte` (runs at module evaluation, before any mount; guard with `browser`), or the top of its instance script if a module block is not viable. Say which in the report. |
| 2 | `shell` | `AppShellLoader` onMount (today's 84) |
| 3 | `hydrated` | `+layout.svelte` onMount start (today's 72) |
| 4 | `cloud` | after `getFirestoreInstance()` (76) |
| 5 | `session` | after `authState.initialize()` (80) |
| 6 | `services` | `MainApplication` DI resolved (88) |
| 7 | `workspace` | after `restoreApplicationState` + `initService.initialize` (92) |
| 8 | `settings` | after settings + theme (95) |
| 9 | `ready` | both 100 sites in `MainApplication`; the snapshot path stays optimistic (it dismisses early on purpose) |

API: `window.__tkaBootMilestone(name)`. Keep `window.__tkaLoadProgress(percent,
message)` as a shim: `percent >= 100` means `ready`; anything else is a no-op
that still records a `boot:splash:legacy:<percent>` mark. Move every real
call site to the named API; the six test routes, warm-thumbnails and
phone-sign-in `boot-screen.ts` may stay on the shim (they only send 100).

Arrival rules: a milestone of rank k anchors progress at share(k) and marks
every lower rank as passed. A lower rank arriving after a higher one is
ignored for the bar but still gets its performance mark and goes into the
probe log. Duplicate arrivals are ignored. `ready` dismisses exactly as today.

### Profile

`localStorage["tka-boot-profile"]` = `{ v: 1, at: <Date.now()>, t: { scripts:
ms, shell: ms, ... ready: ms } }`, milliseconds from `performance.timeOrigin`
(use `performance.now()` at arrival). Written at `ready` when `ready` arrived
and at least `scripts` and `shell` were recorded before it. Only milestones
that arrived before `ready` are stored. Last boot wins (same policy the byte
calibration had). Replace `tka-load-bytes` and remove the old key on first run.

share(k) = profile.t[k] / profile.t.ready. Milestones missing from the
profile are interpolated between their neighbours by rank. Built-in default
profile for first visits: the measured production cold boot (section 4),
rounded, inlined as a literal with a comment naming the date and build.

### Drive

A ticker (setInterval 80 ms, or rAF throttled to that; stop on dismiss and
when `document.hidden`) computes the expected fraction f(t):

- k = highest arrived rank, a = its arrival time, d = profile.t[k+1] -
  profile.t[k] (expected segment length), x = (t - a) / d.
- f = share(k) + (share(k+1) - share(k)) · g(x), where g(x) = x for x ≤ 0.85,
  and for x > 0.85 an asymptote that never reaches 1: g(x) = 0.85 + 0.13 ·
  (1 - e^(-(x-0.85)·1.5)). So a late step keeps creeping but the bar never
  claims the next milestone before it arrives.
- Width = 4% + 96% · f, rounded to 0.5%. Monotonic: never write a smaller
  width. `aria-valuenow` = round(100·f) on the same writes.
- CSS: keep the 500 ms width transition; it smooths the 80 ms writes and
  the catch-up jump when a milestone arrives early. Reduced motion: no
  transition (already), writes still happen.
- `ready`: width 100%, then the existing dismissal.
- "Almost there": flip when t exceeds max(4000 ms, profile.t.ready + 1000).
  The 15 s safety net stays.
- Everything in the script is wrapped so a thrown error leaves the old
  landing-mode and retro-route behaviour untouched and still dismisses on
  `ready` (test that: break localStorage and the bar still finishes).

### Probe (ships, silent)

`window.__tkaBootBar = { profile, defaultProfile: bool, milestones: [{name,
t, ignored?: true}], samples: [{t, pct}] }` with samples capped at 400
entries. `performance.mark("boot:splash:" + name)` per milestone as before
(the boot profiler keeps reading them; check it does not depend on the
`checkpoint:<percent>` naming, and update it if it does). No console output.

## 3. Tests

Extend `tests/unit/landing-composer-handoff.test.ts` or add
`tests/unit/boot-bar-self-timing.test.ts` (JSDOM, `runScripts:
"outside-only"`, the script extracted from `src/app.html` as the existing
test does; fake timers and a controllable `performance.now`). Replay
recorded timelines and assert:

1. Dev warm (the table above, milestone names mapped): width is monotonic,
   never below the previous write, never ≥ share(k+1) before k+1 arrives,
   and no interval longer than 600 ms with zero change before `ready` once a
   matching profile is loaded.
2. Out-of-order: `shell` before `hydrated`, and `ready` before
   `services/workspace/settings`: no regression, dismissal fires once, late
   lower-rank arrivals are logged as ignored.
3. First visit: no profile → default profile used, `defaultProfile: true`,
   profile written at `ready` with only pre-`ready` milestones.
4. Late boot: a profile twice as fast as the replay → the bar creeps and
   stays under the next share; "Almost there" flips at the computed time.
5. The 100-shim dismisses; a 72-shim call changes nothing.
6. Reduced motion path and a localStorage that throws.
7. The two plain strings case from the existing test still holds.

Gates: those files plus `tests/unit/startup-splash-handoff.test.ts`,
`tests/unit/landing-*`, `tests/unit/homepage-*`,
`tests/unit/seo-head-contract.test.ts` with `--config
tests/config/vitest.config.ts`; `verify:public-firebase`; `npm run
check:fast` (report only new errors in touched files; the backlog is known);
prettier on committed content via `git show`.

## 4. Verification in the browser (Chrome DevTools MCP, agent Chrome on 9222)

Timeline capture: navigate with an init script that records every
`#loading-bar-fill` style write (MutationObserver on `document`, not
`documentElement`, which is null at init-script time) and every
`__tkaBootMilestone` call, then read `window.__tkaBootBar` after boot.

Cases (each as a table of t → width, plus the milestone arrivals):
- Dev server `https://localhost:5173/create` (read-only use of his server):
  warm, twice (second run uses the profile the first wrote).
- Production build (`npm run build:fast` on d1 because the browser needs
  the output locally; serve with `wrangler pages dev` on a free port):
  cold cache in a fresh isolated context (this is the first-visit case and
  the source of the built-in default profile), then warm in the same
  context. Report chunk count and bytes for the record.
- Acceptance: on every warm case no stretch longer than 600 ms with the bar
  unchanged before `ready`; on the first-visit prod case no stretch longer
  than 1 s; the bar never sits at one value for more than a quarter of the
  boot. If the model cannot meet this on some case, report the numbers and
  the reason rather than loosening the test.
- Round 2/3 probes: the capsule travel still runs from the header button;
  `/` still hides `#app-loading`; direct `/create` load; reduced motion
  assertions; `after-boot-screen.ts` still sees the dismissal (method
  previews start on the Create front door).
- Frames: one 8x strip is not needed; instead a plain-text chart of width
  vs time for dev warm, prod cold, prod warm in the report.

## 5. Worktree, lifecycle, hazards

- `git worktree add E:/worktrees/tka-platform/boot-bar -b codex/boot-bar-self-timing main`
  from `E:/tka-platform`; node_modules by PowerShell junction; never `pnpm
  install` inside; explicit-pathspec commits; `npm run wt:finish --
  codex/boot-bar-self-timing --route /create` from `E:/tka-platform` in
  PowerShell; kill your own Vite/wrangler/node processes before it (check
  with `Get-CimInstance Win32_Process` filtered on the worktree path); no
  push, no deploy, no CI changes.
- Never start, stop or restart port 5173.
- `app.html` is shared by every route: landing mode (`__tkaIsLanding`) and
  the retro routes must behave exactly as before.
- Do not touch the capsule's markup, CSS, the travel, or the copy except
  the "Almost there" timing.
- A peer session is editing `tests/unit/scripts/svelte-compile-gate.test.ts`;
  do not touch it.

## 6. Report

Short: what changed (files), the three timeline tables, acceptance pass or
fail per case with numbers, the default profile literal, gate lines,
deviations with reasons, merge result.
