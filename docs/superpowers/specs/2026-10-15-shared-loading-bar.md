# Shared loading bar

One loading bar for the app: the boot screen's self-timing capsule, reused
by any load long enough to need a bar. The 3D viewer is its first user.

## Why

Opening the 3D viewer used to show three loaders in a row: the sequence
page's ring card, an "Opening 3D" indeterminate bar, then the scene curtain's
amber bar, which started again at 0%, sat there for about four seconds,
jumped to 53% and was full well before the scene lifted. Its fill was a
`width` transition on the main thread, so it froze whenever shader compile
or model decode blocked it. The boot screen already solved all of that.

## Pieces

- `src/lib/shared/loading/self-timing-bar.engine.js`: the engine. One
  classic script (no imports or exports) that defines
  `globalThis.__tkaCreateSelfTimingBar`, so the boot screen can run it
  before any bundle and the app can import the same file.
  - Named milestones arrive in a fixed order. The last completed load's
    times replay as the expected schedule; each segment runs linearly to
    0.85 of its span, then eases out toward 0.98 so a late milestone never
    leaves the bar still.
  - Each segment is one Web Animations `scaleX` animation, run by the
    compositor, so the fill keeps moving while the main thread is blocked.
    An 80 ms ticker only samples it (aria, probes) and places the fill
    directly under reduced motion.
- `src/lib/server/performance/self-timing-bar-inline.ts`: the server inlines
  the engine into `app.html` at `<!-- tka-self-timing-bar -->`.
- `src/lib/shared/loading/loading-session.svelte.ts`: one load. Owns the bar
  across surfaces (a surface attaches its fill; with none attached the bar
  runs on a detached element), stores the completed timing under
  `localStorage["tka-loading-profile:<key>"]`, stores nothing for an
  abandoned load. Probe: `window.__tkaLoadingBars`.
- `src/lib/shared/components/loading/LoadingCapsule.svelte`: the boot
  capsule's look as a component, status crossfading inside it at a fixed
  width (every label is reserved).

## 3D viewer

`scene-loading-session.svelte.ts` defines the load:
`open, canvas, load-25, load-50, load-75, loaded, warm-40, compiled, smooth`.

- `ViewerMotionSurface` provides the session and opens it when 3D is asked
  for; its placeholder shows "Opening 3D" on it while the 3D code downloads.
- `SceneLoadingCurtain` uses the provided session (or opens its own when a
  host has none) and reports milestones from the scene feature state:
  load quarters from the reveal assets (and cast), `loaded` when they have
  all settled, `warm-40`/`compiled` from shader warmup, `complete()` when the
  scene is smooth.
- `ScenePreparationSurface` is the stage background with the capsule.

## Adding another loader

Pick a key, list the milestones the load really passes in order, give a
first-visit default (measure it), create a session when the load starts,
`reach()` each milestone, `complete()` or `abandon()`, and render
`LoadingCapsule` on it.
