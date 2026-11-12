# One screen until the page is whole

Date: 2026-10-15. Author: Fable design, Opus implementation. Commit as
`docs/superpowers/specs/2026-10-15-boot-composed-reveal.md`.
Builds on the three boot-bar specs of 2026-10-14 (self-timing,
compositor-fill, tail-and-gradient), all merged. The capsule, travel,
milestone model and compositor fill stand.

## Austen's report (2026-10-15, his Chrome, https://localhost:5173/create)

"After that loading bar what happens is you see this screen before anything
pops in and then I see empty create buttons. Wouldn't it be just lovely if
all of the loading happened behind one screen so that by the time it's done
you see and experience everything as it's intended."

His two screenshots after the capsule leaves:

1. The forest background, the sidebar with only its first group of module
   icons, a thin indeterminate bar along the top of the content area, and
   no content.
2. "How do you want to create?" with the six method cards, every preview
   tile an empty tinted block; the sidebar now has many more items.

## Causes found in code (confirm each with runtime evidence)

- `MainApplication.svelte` ~405: when `readBootSnapshot()` is not null it
  reports `ready` at mount ("optimistic warm reload"), so the boot screen
  leaves before the active module's chunk has loaded. Screenshot 1 is
  `ModuleRenderer.svelte`'s `ModuleSkeleton` (lines ~367/416/443) or
  `LoadingGate`'s `IndeterminateBar`; identify which.
- `CreateFrontDoor.svelte` ~91: the previews' `defer` waits on
  `runAfterBootScreen` (`method-previews/after-boot-screen.ts`), then
  `runAfterNamedRouteMorphIdle`, then `reveal.afterWave`, so nothing in the
  tiles is prepared behind the screen; also `previewsWanted` mounts them
  late. Screenshot 2 is that gap.
- The sidebar gains items after the screen leaves (likely auth or
  capability-gated nav resolving). Find the owner.

## Design

### A boot hold registry (app.html)

`window.__tkaBootHold(name)` returns a `release()` function. The boot
screen dismisses only when the `ready` milestone has arrived AND every hold
registered so far is released. Holds registered after dismissal are no-ops
(return a no-op release). Release is idempotent. Probe:
`__tkaBootBar.holds = [{name, at, releasedAt, timedOut?}]`, plus
`performance.mark("boot:hold:<name>:release")`.

Cap: if holds are still open 4000 ms after `ready`, dismiss anyway and mark
those holds `timedOut`. The 15 s safety net stays. A thrown error anywhere
in the registry must still leave `ready` able to dismiss (same wrapping
rule as round 1).

Revised 2026-10-15 after a check in Austen's Chrome on 5173: the Create view
mounted 3.4 s after `ready` and only then asked for `create-previews`, so a
cap counted from `ready` timed the previews out 0.6 s later and the screen
left on empty tiles. Each hold now times out 4000 ms after `ready` or after
it was asked for, whichever is later, and no hold keeps the screen past
`ready` + 8000 ms.

### A final milestone `composed`

Add `composed` after `ready` in the fixed rank order. It is reported by the
registry itself when the last hold releases (or the cap fires) after
`ready`. The fill reaches 100% and the existing dismissal runs at
`composed`, not `ready`. The profile records `composed`, so the self-timing
bar plans for the real end of loading and does not sit at 100% while holds
are open. The default first-visit profile gains a `composed` value measured
from the production build (same method as round 1: median of 3 cold boots).
Keep `ready` as the "app services ready" milestone. The optimistic snapshot
`ready` stays; it is now harmless because holds keep the screen up.

### Who holds

1. **Active module view.** `ModuleRenderer` (or the shell owner that picks
   the active module) registers `module-view` during its own script init,
   before `ready` can fire, and releases it after the active module's real
   component (not the skeleton) has mounted and one `tick()` has passed.
   Module components register their own first-view holds synchronously
   during component init, so they exist before `module-view` releases.
   When no module renders (an error state), release with the error shown.
2. **Navigation.** The sidebar/nav owner registers `nav` and releases it
   when the item list it will show is final (auth state resolved, signed in
   or not, and capability-gated items decided).
3. **Create front door previews.** `CreateFrontDoor` registers
   `create-previews` at init when it is the visible first view, and
   releases it when every visible preview tile has drawn its first frame
   (find the existing ready signal, `reveal.notifyReady` / `handleReady`).
   Split preparation from playback: the tiles mount and draw their first
   frame behind the boot screen; the turns, wave and motion still start
   after the screen leaves (keep `runAfterBootScreen` for playback only),
   so Austen sees the motion from its beginning. If a tile cannot draw (an
   error), it releases its share so the hold cannot stick.
   When the user lands on a Create workspace rather than the front door,
   the front door must not hold.

Do not add holds for content below the fold, lazily loaded panels, or
anything the user has to open. If another module's first view visibly pops
in after dismissal, list it in the report as a follow-up instead of
widening scope.

### The reveal

When the capsule fades, the page underneath is final: background, complete
sidebar, front door with every preview showing its first frame. No
`ModuleSkeleton`, no `IndeterminateBar`, no empty tile in any frame after
the fade starts.

## Tests

- Extend `tests/unit/boot-bar-self-timing.test.ts`: holds keep the screen
  up after `ready`; `composed` arrives at the last release; the cap
  dismisses at ready+4000 and marks `timedOut`; late registration is a
  no-op; double release is harmless; a throwing registry still dismisses on
  `ready`; the profile records `composed`; the fill does not reach 100%
  before `composed`.
- A focused test for the CreateFrontDoor split if the existing preview
  tests (`grep -rl "after-boot-screen\|method-preview" tests`) can cover
  it cheaply: playback waits for the screen, first-frame preparation does
  not.
- Gates: focused Vitest files with `--config tests/config/vitest.config.ts`,
  `verify:public-firebase`, `check:fast` (new errors in touched files
  only), prettier via `git show` from the primary.

## Browser verification (before and after)

Rig: DevTools MCP if it connects; otherwise the CDP-over-WebSocket scripts
the last two rounds left in the session scratchpad, against the agent
Chrome on port 9222 (screencast frames plus a probe init script). Measure,
for `/create`:

- t(dismiss start), t(module view mounted), t(every preview first frame),
  t(nav final), and the frames from dismiss start to +3 s.
- BEFORE on current main and AFTER on the branch: dev warm (snapshot path)
  x2, dev cold, prod cold (fresh context), prod warm.
- Acceptance AFTER: zero frames from dismiss start onward show the module
  skeleton, the top indeterminate bar, an empty preview tile, or a nav list
  that later grows; the bar still has no stall over 600 ms warm / 1 s cold;
  total time to a complete page (last of the four t values) is no worse
  than BEFORE by more than 300 ms.
- Also: the capsule travel from the landing header button still runs;
  `/` has no boot screen; reduced motion; a direct load of another module
  route (e.g. the Discover/Gallery default route) dismisses normally and
  does not hit the 4 s cap; the 4 s cap in practice (block a preview's
  first frame with a probe and confirm dismissal at ready+4000).
- Frame strips: three frames at dismiss start, +300 ms, +1 s for dev warm
  BEFORE and AFTER at 1440x900, saved to the scratchpad `handoff-shots/`
  folder as `composed-before-*.png` / `composed-after-*.png`.

## Worktree and hazards

`E:/worktrees/tka-platform/boot-composed`, branch `codex/boot-composed-reveal`
from main; node_modules by PowerShell junction, never `pnpm install` inside;
explicit-pathspec commits ending with
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; stop your own
Vite/wrangler/node before `npm run wt:finish -- codex/boot-composed-reveal
--route /create` from `E:/tka-platform` in PowerShell; no push, no deploy,
never touch port 5173 (read-only loads are fine), no Playwright, do not
touch `tests/unit/scripts/svelte-compile-gate.test.ts`. If `build:fast`
fails on the `/history/draft` missing-id error and that fix is not yet on
main (another session owns it), patch locally only to build, revert, commit
nothing there. On a local wrangler server the localhost service-worker
guard in app.html reloads `/create` once; that is pre-existing, so check
the travel on dev.

## Report

Short: causes confirmed (with evidence); files; BEFORE/AFTER table of the
four times and dismiss time per case; frame-check result per case; bar
stall numbers; cap test; the new default profile value for `composed`;
frame strip paths; gate lines; deviations; follow-ups (other modules that
pop in); merge SHA.

## 2026-11-11: the module waits until it is drawn, never on a timer

Austen opened Browse sequences in a preview whose Vite server had restarted a
minute earlier. After a long wait on the boot screen it left, and the page
showed the sky, the side bar and nothing else: "it still puts me in a place
where there's nothing on the screen." The `module-view` hold had a 15 s limit
(`FIRST_VIEW_WAIT_MS`, raised from 4 s on 2026-10-31). A warm reload reports
`ready` from the boot snapshot at mount, so the 15 s started almost at once,
and Browse's code took over 30 s to arrive. The screen timed out onto
`SharedShellSkeleton`.

What changed:

- `module-view` waits until released. `__tkaBootHold(name, "until-released")`
  (and `holdBootScreen(name, UNTIL_RELEASED)` in `boot-screen.ts`) has no
  deadline: it is never marked `timedOut`, and with only such holds open no
  cap timer is set (the earliest deadline is Infinity, so no timer at all).
  It ends at the `BootHoldRelease` sites in `ModuleRenderer` (the module's
  view, its load error, its sign-in gate) or when initialization fails.
  Every other hold keeps its limits; Create's `create-workspace` still uses
  `FIRST_VIEW_WAIT_MS`.
- A long wait instead of a hand-over to nothing. When an until-released hold
  is still open 15 s after `ready`, the status crossfades to "Still loading.
  This is taking longer than usual." and a Reload button fades in under the
  capsule (beside it on screens under 600 px tall, so the capsule stays where
  the Overture's letter row expects it). The button is placed from first
  paint and fades on opacity only; reduced motion shows it at once. German
  strings are in the boot script's table. The Overture keeps lapping the
  finished mandala through the wait (checked at 20 s).
- The stored profile's `composed` is clamped to `ready` + 4 s, so a slow boot
  does not make the next boot's fill crawl toward a far-off end. Without the
  clamp a 40 s `composed` left the next fill under a tenth of the bar at
  `ready`.

Routes: only the catch-all app route (`src/routes/[...appPath]`, through
`AppShellLoader`) mounts `MainApplication`. Every `ModuleRenderer` branch
either reaches a `BootHoldRelease` or is a loading state that ends when the
module chunk or `activeModule` arrives; a load that never ends now shows the
long wait and its Reload button.

Proof: `node scripts/boot-handoff-check.mjs` loads
`/browse/explore/sequences` with Browse's code held until 30 s after
navigation. On the old behaviour the screen left at 16.8 s and the shell
skeleton was exposed from then on (FAIL); with the change the long wait
showed at about 17 s and the screen left at 30.5 s onto Browse's header and
tiles, the skeleton never exposed (PASS).

## 2026-11-11 (later): no give-up timer before ready either

The last timer that could take the screen away was the 15 s safety net for a
`ready` that never came. When the app's own startup code was slow, it added
`loaded` at 15 s and left the visitor on an empty page.

What changed:

- At 15 s from page start with no `ready` (`__tkaNoReadyYet`, timed from
  `__tkaLongWaitMs`), the screen shows the same long wait (message, Reload
  button, `data-long-wait`, `long-wait` mark) and keeps covering the page.
  It does not add `loaded` and does not end the Overture, which keeps
  lapping. It leaves by the normal path, when `ready` arrives and the holds
  clear. If a route had already removed or hidden the screen, it only stops
  the bar's ticker and ends the Overture. After `ready` the long wait still
  needs an open until-released hold; the before-`ready` case is its own
  branch. No code writes `timeout-dismiss` any more; the Overture bench reads
  `long-wait` instead.
- Pages that never mount the app shell relied on that timer. Only
  `[...appPath]` reports `ready`, so `/start` (the festival signup QR page),
  `/admin/*`, `/coven`, `/endless-spinner`, the internal tools, `/tunnel`, a
  landing route missing from app.html's list, and error pages sat behind the
  screen for 15 s. The root layout now calls `finishBootScreen()` for any
  route other than the shell once the container is up, and at once when
  startup failed (`containerError`) or the page is an error page. The
  shell's chunk-load error (`AppShellLoader`) and `MainApplication`'s
  `ErrorScreen` release it too.
- If the app's code never arrives, or throws before the layout mounts,
  nothing can report: the visitor gets the long wait and Reload, never an
  empty page.

Proof: `node scripts/boot-handoff-check.mjs` now runs two cases at 1280x800
and 390x844. `browse-late` holds Browse's code until 30 s, as before.
`startup-late` holds `MainApplication.svelte`, so `ready` arrives at about
30.5 s. On the old code `startup-late` fails: the screen left at 15.0 to
15.1 s with nothing drawn. On the new code both cases pass, with the long wait
from 16 s and the screen leaving at about 31.6 s onto Browse. The script now
pauses only the held URLs, through CDP Fetch patterns.
`page.setRequestInterception` also paused the Overture worker's requests,
which is the likely reason some earlier runs showed no mandala.
