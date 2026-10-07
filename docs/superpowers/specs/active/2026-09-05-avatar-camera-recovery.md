---
status: active
value: null
effort: null
work_state: verification
remaining: Recheck camera recovery on the avatar route and confirm persistence, 15 focused tests, and the project check.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Avatar camera recovery

## Scope and ownership

Fix the viewer's panned-target zoom dead end without changing scene assets.
Searches: `reframe`, `frameAllPerformers`, `registerSnapTo`, `minDistance`,
`dollyToCursor`, `infinityDolly`, `Focus avatar`.

Extend the existing viewer-state cast framing to the current selection, falling
back to the cast when nothing is selected. Compose it in SceneControlRail and
MobileSceneControls. Connect the worker camera to the same snap callback as the
legacy camera, with identity-guarded cleanup during renderer replacement.

Reuse camera-controls' [continuous dolly and cursor targeting](https://github.com/yomotsu/camera-controls#properties)
through `configureViewerOrbitNavigation` in the existing camera runtime. Opt in
only the two viewer camera owners, leaving museum/review wrappers unchanged.
Keep the one-metre orbit radius; allow one millimetre of saved-pose tolerance
for damping and three-decimal URLs. Worker wheel and focus transitions publish
their settled pose (wheel has no control-end event). Reduced-motion focus is
immediate.

## Verification

- 15 focused tests pass: application-thread camera controller, camera recovery,
  camera framing, and camera persistence. Uses the repository Vitest config.
- `npm run check`: zero errors, zero warnings before integration.
- ESLint passes the changed plain camera modules. The existing viewer state
  has three unrelated lint errors: its empty storage catch and two undoRevision
  getter dependency reads. Svelte files/tests are ignored by that lint config.
- Real wheel input from the reported stranded view moves camera z from
  -70.880 to -70.202 (worker) and -70.198 (legacy), with the target also moving.
- Focus returns the worker near the performer: camera approximately
  (-0.014, 1.790, -3.319), target approximately (0, 0.552, -0.005).
  Both renderer paths inspected. The worker URL updates after settling;
  reduced-motion focus updates immediately.
- Focus control measured at all seven CSS viewport tiers: 375x667, 960x412,
  820x1180, 1440x900, 1920x1080, 2560x1440, 3840x2160. Compact buttons are
  approximately 44px high; desktop buttons approximately 48px square.
  Wide-screen hit testing confirms the button is unobstructed.
- Phone and native desktop output directly inspected. Larger in-app emulated
  screenshots exhibit duplicated compositor strips/black padding, so they are
  not clean full-layout visual proof. DOM geometry and hit tests are separate
  evidence, not a claim that the screenshot artifacts belong to the app.

## Local dependency incident

The shared dependency tree had a broken zod junction (missing package contents).
An attempted cross-volume move of the task's dependency junction traversed into
the shared dependencies. A missing-only, non-deleting restore copied all 826
affected files back; the follow-up dry run reported zero missing files. An
accidentally created self-referential `.vite-temp` junction was removed without
recursion. The only directory mismatch was an empty temporary directory versus
the original provider-utils junction, which was preserved. Zod 4.3.6 was restored
from its exact registry package, without changing the lockfile or manifest.
No source changes from other tasks were reverted. Port 5173 was not restarted.
