> Archived 2026-10-14: Matching scope is recorded in `docs/superpowers/specs/shipped/2026-07-25-choreo-gorgeous-4k-design.md`.

# Choreo 4K Reliability and Visual Rebuild — Handoff (2026-07-25)

## Mission

Make `/choreo` feel deliberate, calm, and trustworthy on a 4K monitor. The
current screen restores a saved draft before its private sequence data is
reliably available, converts a temporary read failure into six red manual-retry
rows, drops those rows from the live sheet calculation, floods DevTools with
missing placement and thumbnail requests, and stretches a fixed desktop layout
across a wide workspace. Fix the recovery model first, then rebuild the
wide-screen composition without changing the physical paper contract or
preview/PDF parity. Existing product contracts are in
[the original Choreo Sheet design](active/2026-06-30-choreo-sheet-design.md),
[the inline-picker and continuity design](active/2026-07-01-choreo-sheet-v2-design.md),
and [the annotated-sheet design](2026-07-02-choreo-annotated-sheet-design.md).

## Done — verified

No implementation was performed in this diagnostic session. The source
baseline before this handoff commit was
`aa0b0dce4bd0537dc32200905ed73a74315dd00f`.

### 1. The failed rows were temporary, not deleted

- Read-only Chrome console evidence from
  `https://localhost:5173/choreo`: all six restored IDs emitted a
  `[PublicSequencesLoader] No sequence found` warning and a matching
  `[ChoreoSheet] Sequence ... not found` warning at the identical timestamp
  `2026-07-26T03:38:59.341Z`.
- The user then clicked the red row retry controls. A read-only DOM snapshot
  showed `Sequences (6)` with six resolved names and step counts:
  `KECΦ-KECΦ-KECΦ-KECΦ-` (16), `JΦJΦKΦJΦ` (8),
  `AΘ-RWAΘ-RWAΘ-RWAΘ-RW` (16), `CΦ-CΦ-CΦ-CΦ-` (8),
  `Ω-W-Ω-W-Ω-W-Ω-W-` (8), and `Φ-JΨ-DΦ-JΨ-D` (8).
- The supplied screenshot catches the intermediate state after three retries:
  three resolved rows followed by three `Failed to load` rows.
- Evidence conclusion: the records existed and the same IDs resolved later.
  The screen treated a temporary hydration miss as a terminal missing-record
  state.

### 2. The failure path and retry behavior are source-confirmed

- `src/lib/features/write/state/choreo-sheet-state.svelte.ts:481-485`
  calls `ensureHydrated(sheet.sequenceIds)` immediately during state-factory
  construction when a local draft contains IDs.
- `src/lib/features/write/components/sheet/ChoreoSheetView.svelte:65-97`
  calls the private library first, discards every thrown private-library error
  with an empty `catch`, then falls back to the public gallery.
- `src/lib/shared/library/services/library-repository.ts:193-198` throws
  `UNAUTHORIZED` when `authState.effectiveUserId` is not yet available.
- `src/lib/features/write/state/choreo-sheet-state.svelte.ts:217-252` marks a
  null or thrown load in `failedIds`. `retryHydration(id)` simply calls the same
  loader again.
- `src/lib/features/write/state/choreo-sheet-state.svelte.ts:150-157` filters
  every unresolved ID out of `hydratedSequences`. Continuity normalization,
  boundary detection, loop status, pagination, preview, playback, and export
  then operate on the reduced list rather than the requested roster.

### 3. The current 4K allocation is measured

Read-only DOM geometry from the live 4K Chrome tab:

```text
viewport CSS px:       2560 × 1249
devicePixelRatio:      1.5
Choreo workspace:      2470 × 1233
left rail:              280 × 1181
preview pane:          1706 × 1181
white sheet page:      1100 × 850
right browse dock:      460 × 1181
toolbar:               2470 × 44
```

The hard limits are source-confirmed:

- `ChoreoSheetView.svelte:1034-1051`: browse dock
  `width: min(460px, 42vw)`.
- `ChoreoSheetView.svelte:1185-1201`: rail `width: 280px`.
- `SheetPreviewPages.svelte:478-492`: page `width: 100%` with
  `max-width: 1100px`.
- `ChoreoSheetView.svelte:1428-1442`: the only layout breakpoint is
  `max-width: 900px`.

At the measured width, 606px of the preview pane remains outside the capped
sheet. The page also leaves 331px of vertical room unused. This is a desktop
layout with fixed columns, not a wide-workspace composition.

### 4. The console noise has separate source paths

These errors are not the cause of the red sequence rows, but they are real
quality defects visible in the supplied screenshot.

- Four staff-root box half-placement files do not exist:
  `default_box_pro_half_placements.json`,
  `default_box_anti_half_placements.json`,
  `default_box_dash_half_placements.json`, and
  `default_box_static_half_placements.json`.
- `src/lib/shared/pictograph/arrow/positioning/placement/services/arrow-placer.ts:63-86`
  requests all four for every unseeded prop bucket.
- `arrow-placer.ts:162-168` converts a missing file into `{}`.
  `arrow-placer.ts:200-203` then returns `{ x: 0, y: 0 }` for absent data.
- The screenshot groups each missing-placement warning 26 times. No visual
  isolation was run to prove which arrows were affected.
- The red Firebase Storage requests are dead `?alt=media` thumbnail URLs.
  `src/lib/shared/browse/components/PropAwareThumbnail.svelte:298-337`
  handles an image error by invalidating only the URL cache, setting a
  skip-cache flag, and rerendering locally.
- `src/lib/shared/browse/services/cloud-thumbnail-cache.ts` already has
  `markMissing(...)`, which removes stale persisted positive knowledge and adds
  a 24-hour negative entry, but the image-error path does not call it.
- `src/lib/shared/browse/services/thumbnail-render-orchestrator.ts:593-599`
  saves the cloud response body into IndexedDB without checking
  `response.ok`, so a 404 body can be written as if it were an image blob.

### 5. Relevant Choreo source is clean

`git diff --stat -- src/lib/features/write` returned no output. The diagnosis
did not modify Choreo source, tests, styles, Firebase data, or browser state.

## Believed done — unverified

Nothing is believed implemented.

The leading causal diagnosis is an authentication-readiness race:

1. Draft restoration starts during Choreo state construction.
2. No auth-ready boundary precedes the private-library reads.
3. A missing effective user ID throws before the Firestore read.
4. The empty `catch` erases that exception.
5. Public fallback cannot resolve private IDs.
6. Manual retries succeed after session restoration settles.

This path matches the runtime burst and source ordering, but the exact first
exception cannot be recovered because it was swallowed. A transient private
Firestore error would produce the same visible result. Prove the causal branch
with either:

- a focused test using a deferred auth/private-loader dependency; or
- temporary structured instrumentation that preserves the private error class
  and timing during one permitted reload.

The stale-positive explanation for the thumbnail 404 flood is also
source-supported but lacks a focused failing test. Add one before changing the
cache contract.

## In flight

- Branch: `main`. Do not create a branch or worktree unless Austen explicitly
  requests that action in the active conversation.
- This handoff is the only file owned by this diagnostic session.
- The shared checkout is heavily dirty with work from other live sessions.
  Run `git status --short` before editing and before every commit.
- `src/lib/features/write/**` was clean at handoff creation.
- `src/lib/shared/browse/components/PropAwareThumbnail.svelte` already has an
  uncommitted, comment-only change from another session describing worker queue
  concurrency. Do not revert it. If the thumbnail repair touches that file,
  retain and work around the existing edit.
- Many unrelated navigation, creator, generator, renderer, MCP, Store, and
  agent-hub files are modified or untracked. Never stage them.
- The local `main` was nine commits ahead of `origin/main` and zero behind
  before this handoff commit.

## Loose ends (ranked)

### 1. Make restored sequence hydration self-recovering

Start here. This is the user-blocking defect.

- Do not begin private draft hydration until Firebase authentication has
  resolved. Reuse an existing auth-ready boundary such as Firebase
  `authStateReady()` or a proven project-level initialized signal.
- Preserve the first private-library error. Classify unauthorized/not-ready,
  transient network, permission, and confirmed not-found separately.
- Retry transient/not-ready reads automatically with a bounded policy and
  cancellation. The user should not click six row buttons after opening a
  saved sheet.
- Only show a missing/deleted message after authenticated private lookup and
  public fallback both produce confirmed not-found results.
- Keep a single user fallback such as `Retry all` after automatic recovery is
  exhausted. Per-row recovery can remain for genuinely isolated failures.
- Route the earned user-blocking error through
  `getErrorHandler().showUserError()` with module, action, IDs, error class, and
  attempt count in `technicalDetails`.

Required tests:

- restored draft waits for a deferred auth/private-loader prerequisite;
- transient first attempt, successful automatic retry;
- confirmed private and public not-found becomes terminal;
- permission error does not masquerade as deletion;
- multiple IDs share the readiness wait rather than racing it six times;
- retry cancellation when the sheet changes or the component is destroyed.

### 2. Preserve sheet truth while any row is unresolved

The current derived list silently removes failed rows before normalization.
That changes adjacency, loop status, page packing, playback, and export.

- Keep roster order and block slots stable while data is loading or retrying.
- Never normalize sequence N+1 against sequence N-1 because sequence N is
  temporarily unavailable.
- Disable playback/export when the roster is incomplete, or use the last
  verified complete snapshot. Do not export a reduced act as if it were the
  requested sheet.
- Show the last known row name/count when available. A cold restore can use a
  non-authoritative metadata cache or a reserved skeleton slot, but canonical
  steps must still come from the library record.
- Avoid layout shifts when loading, retrying, or resolving. Reserve status and
  action slots.

### 3. Recompose the workspace for wide screens

The page is a physical Letter sheet and must retain its aspect ratio. The app
around it does not need fixed desktop widths.

- Use container queries and the project styling skill. Do not add another
  viewport-only breakpoint stack.
- Scale the sheet against both available width and available height. Replace
  the unconditional 1100px ceiling with an intentional fit policy.
- Give the page a clear visual stage. Controls, picker, and sheet should not
  compete as four equal dark columns.
- Establish action hierarchy in the toolbar. Sheet identity and primary
  actions should read immediately; secondary utilities should not receive
  equal weight.
- Make the sequence/settings rail collapsible or resizable in wide mode.
- Make the browse dock responsive to the available container and useful at 4K,
  while honoring the locked decision that it remains inline and the whole page
  stays visible when open.
- Consider a fit control only after searching existing zoom/fit primitives.
- Preserve the two existing output modes: `Study (dense)` and `Annotated`.
- Keep the interface useful with DevTools docked, because that is the supplied
  failure case, but optimize the normal full-width workspace too.

Before building, follow `never-hand-roll.md`: search the repository for
resizable panels, fit-to-container/zoom controls, workspace shells, toolbar
action groups, skeleton rows, and retry coordinators. Record whether each part
reuses, extends, or creates.

### 4. Stop stale thumbnail 404s from recurring

- Make an actual image/download 404 call the cloud cache's authoritative
  missing-entry path, not only `invalidateUrl`.
- Check `response.ok` before putting a cloud response blob into IndexedDB.
- Clear bad in-memory and local blobs for the same render key.
- Keep permission, quota, and server failures retryable. Only 404 belongs in
  the negative cache.
- Add focused tests proving one dead persisted positive creates at most one
  network 404 per negative-cache TTL and then falls through to a valid local
  render.
- Coordinate with the owner of the existing
  `PropAwareThumbnail.svelte` working-tree edit.

### 5. Resolve missing half-placement requests without inventing domain data

- Determine whether box half-placement data is supposed to exist from the
  canonical source or the `flow-arts` MCP. Do not author placement coordinates
  from visual guesses.
- If no box dataset exists yet, do not request those paths and negative-cache
  the absence so workers cannot repeat the same warning.
- If canonical data exists, add the real files and verify affected pictographs
  through the approved TKA rendering MCP. Never render TKA pictographs with
  shell scripts or inline code.
- Use the arrow-positioning expert when this becomes a placement-data change.

### 6. Add focused verification, then visual proof

- There is no focused hydration/retry test. The only
  `createChoreoSheetState` test located during diagnosis was the annotation
  suite in `tests/unit/choreo-sheet-annotations.test.ts`.
- Run the smallest unit targets during iteration. Follow the machine-wide
  `svelte-check` and memory gates before a full check/build.
- Reproduce the original path: keep a persisted six-sequence draft, enter or
  reload `/choreo`, and verify every row resolves without manual work.
- Verify that delayed auth does not alter preview order, continuity, loop
  status, playback, page count, or export eligibility.
- Verify the thumbnail console stays clean on first load and revisit.
- Visual proof must cover the real 4K monitor at DPR 1.5, both with the picker
  open and closed. Include one standard desktop and the 900px transition.
- Compare preview and exported PDF after the layout work. The app shell can
  change; physical sheet geometry and render parity cannot.
- Browser navigation, clicking, typing, and reload require Austen's explicit
  permission in Fable's active conversation. Read-only evaluation is allowed
  when Austen asks for a page review.

## Decisions already made

- Austen's 2026-07-25 assessment: the current load failures and 4K presentation
  do not feel top-tier. Fable is assigned to make the surface gorgeous, not to
  apply isolated cosmetic tweaks.
- A temporary platform failure must not become six manual user actions.
- Choreo remains the top-level route name; the internal feature directory
  remains `src/lib/features/write`.
- The sheet remains a distinct artifact from an Act.
- One printed cell is one sequence step. No start-position or text-label cell.
- Physical output remains Letter-sheet based, with preview/PDF parity driven by
  shared planner and geometry.
- Study mode remains dense continuous-flow packing.
- Annotated mode remains row-aligned with cues, notes, and header behavior from
  the approved annotated-sheet design.
- The add-sequences picker remains inline rather than covering the page.
- The whole sheet page must stay visible while the picker is open.
- Sequence continuity must be recalculated in roster order. Missing data may
  not silently collapse that order.
- Port 5173 is Austen's HTTPS/2 dev server. Never start, stop, restart, or kill
  it.
- Work on `main`. No branch or worktree unless Austen explicitly requests it.

## Gotchas

- Reproduce through draft restoration. `handleBrowseSelect()` and collection
  adds seed already-held data directly, so adding a card in the current session
  can hide the restore bug.
- The first private error is currently swallowed at
  `ChoreoSheetView.svelte:75-78`. Logging only the later public miss will repeat
  the misleading evidence seen in this session.
- `isHydrating` is one boolean around a parallel batch. A production retry
  coordinator needs per-ID attempt state and protection against overlapping
  batches or stale completions.
- `failedIds.delete(id)` happens before every retry. Preserve stable row
  geometry while the visual status changes from failed back to loading.
- `hydratedSequences` is used by more than the preview. Audit act playback,
  export gating, continuity, save/open, and loop status before changing its
  shape.
- The hard page cap is in `SheetPreviewPages.svelte`, but changing that number
  alone will not make the workspace coherent. Treat rail, stage, picker,
  toolbar, scroll ownership, and page fit as one layout system.
- The screenshot path from this session is temporary:
  `C:\Users\Austen\AppData\Local\Temp\codex-clipboard-Gn8759.png`.
  If it is gone, reproduce at `/choreo`; all important measurements and visible
  failure details are recorded above.
- The four placement JSON warnings and Firebase thumbnail 404s are separate
  from sequence hydration. Fixing one does not prove the others are fixed.
- `cloud-thumbnail-cache.ts` contains both positive and negative persistence.
  Do not clear all positives on a single miss; mark only the exact failed key.
- `saveCloudBlobToLocal()` currently ignores HTTP status because `fetch()`
  resolves on 404. A `.catch()` alone cannot detect this.
- Missing placement data is a TKA domain concern. Use MCP/expert evidence before
  touching coordinates.
- The active design specs predate some route and component changes. Treat their
  locked product decisions as canon, but confirm current ownership and symbols
  with source before editing.
- Commit only explicit paths. The index and working tree are shared with other
  sessions.
