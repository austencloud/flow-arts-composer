# Film Director Plane Axes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make per-performer hand planes, per-step hand planes, and grid-plane visibility speakable axes of the film-director directive language (schema v2, additive), per Austen's 2026-08-24 ruling on the capability-matrix decision queue.

**Architecture:** Three new directive-capable axes (`bluePlane`, `redPlane`, `stepPlane`) resolved by the existing constraint resolver, plus a literal `scene.visiblePlanes` list. A prerequisite persistence fix threads the seeded viewer's write-silence down to avatar instances so films can set planes without clobbering the user's persisted viewer prefs. Shelved by the same ruling: ocean variants (one ocean), nav mode (viewer control, meaningless under a director camera), grid labels (hardwired off is the decided default).

**Tech Stack:** Existing film-director `_lib` machinery (`resolve-directives.ts`, `directive-random.ts`, `film-director-schema.ts`, `resolve-film-director-spec.ts`, `director-viewer-adapter.ts`), zod v4, vitest.

**Ground truth (verified 2026-08-24):**
- `Plane` (from `@austencloud/scene-3d`, `dist/lib/domain/enums/Plane.d.ts`) has exactly nine values: `wall`, `wheel`, `floor`, `right-shield`, `left-shield`, `forward-ramp`, `backward-ramp`, `right-wing`, `left-wing`.
- `avatar-instance-state.svelte.ts`: `setHandPlane(hand, plane)` (line ~518) derives `planeMode` via `derivePlaneModeFromHands` and writes `localStorage` key `tka-3d-planeMode-${id}`; `setStepHandPlane(stepNumber, hand, plane)` (line ~545) stores in `beatPlaneOverrides` Map, forces `PlaneMode.CUSTOM`, deletes entries that normalize to WALL-only, and `applyBeatPlaneOverrides()` no-ops when `loadedSequence` is null. `loadPersistedPlaneMode()` runs unconditionally at instance creation (read leak). Ids are `performer-${index}` — shared with the real viewer.
- `viewer-3d-state.svelte.ts`: a seeded viewer shadows all module-level persist writers with no-ops (`const persistent = seed === undefined`, line ~509) — but that write-silence does NOT reach avatar instances. Seed performer entries already carry `customBluePlane`/`customRedPlane`; seed carries `visiblePlanes`.
- `director-viewer-adapter.ts` `buildDirectorViewerSeed` hardwires `customBluePlane: Plane.WALL`, `customRedPlane: Plane.WALL`, `visiblePlanes: []`. `applyDirectorShotToViewer` mutates reused performer instances via setters inside `getSceneUndoManager().withoutUndo()`.
- `FilmDirectorScene.svelte` calls `viewer.enter3D(sequence)` then `viewer.hideAllPlanes()` at mount; `applyShot()` runs per shot change.
- Cast max is 8; the 9-plane catalog means whole-cast `distinct` is always satisfiable unless `from` narrows the pool.

---

### Task 1: Ephemeral avatar-instance persistence

**Files:**
- Modify: `src/lib/shared/3d/state/avatar-instance-state.svelte.ts`
- Modify: `src/lib/shared/3d/state/performer-manager.svelte.ts`
- Modify: `src/lib/shared/3d/state/viewer-3d-state.svelte.ts`
- Test: `tests/unit/3d-viewer/avatar-ephemeral-persistence.test.ts`

A seeded viewer is documented as "reads its own config and writes NOTHING back", but avatar instances still read the user's persisted plane mode at creation and write `tka-3d-planeMode-${id}` / `tka-3d-rotVariant-${id}` on every plane/rotation change. Thread the flag down.

- [x] **Step 1:** Add `persistent?: boolean` (default `true`) to `AvatarInstanceConfig`. In `createAvatarInstanceState`, when `persistent === false`: `loadPersistedPlaneMode()` and the rot-variant read return null/default without touching localStorage, and every `localStorage.setItem(PLANE_MODE_KEY | ROT_VARIANT_KEY, ...)` call is skipped. Gate reads and writes with one local `const persistToStorage = config.persistent !== false`.
- [x] **Step 2:** `performer-manager.svelte.ts`: the manager factory gains a `persistent` option (however its existing options/deps are shaped — read the file first) and passes it into every `createAvatarInstanceState` call.
- [x] **Step 3:** `viewer-3d-state.svelte.ts`: pass `persistent` (the existing `const persistent = seed === undefined`) into the performer-manager creation so seeded viewers get ephemeral avatar instances.
- [x] **Step 4:** Test (`avatar-ephemeral-persistence.test.ts`): create an instance with `persistent: false` plus a localStorage stub (see existing 3d-viewer tests for the pattern), call `setHandPlane("blue", Plane.WHEEL)` and `setStepHandPlane(2, "red", Plane.FLOOR)`, assert the stub recorded zero writes to `tka-3d-planeMode-*`/`tka-3d-rotVariant-*` and that a pre-populated persisted plane mode was NOT read into initial state. Also assert the default (`persistent` omitted) still persists — the real viewer's behavior is unchanged.
- [x] **Step 5:** Run the new test file plus `tests/unit/3d-viewer/performer-initial-reveal.test.ts` (guards the seeded-viewer path). Commit with explicit pathspec.

### Task 2: Schema + resolver — bluePlane, redPlane, stepPlanes, visiblePlanes

**Files:**
- Modify: `src/routes/test/film-director/_lib/film-director-schema.ts`
- Modify: `src/routes/test/film-director/_lib/resolve-film-director-spec.ts`
- Test: `tests/unit/film-director/plane-axes.test.ts`

- [x] **Step 1:** Schema: `planeSchema = z.string().refine(...)` over the nine Plane values (same pattern as the Task-11 prop/effort/formation fix so a bad value is named: `Unknown plane "chainsaw". Planes: wall, wheel, floor, right-shield, left-shield, forward-ramp, backward-ramp, right-wing, left-wing.`). Derive the catalog from `Object.values(Plane)` — do not retype the strings.
- [x] **Step 2:** Performer schema and `castDefaults` gain directive-capable `bluePlane` and `redPlane` (full directive grammar, like `prop`). Both also gain `stepPlanes?: Array<{ step: int ≥ 0, hand: "blue"|"red", plane: <shot-scope directive over Plane> }>` (strict objects). Shot-scope directive = literal | oneOf | not | pick-any — reuse the existing `resolveShotDirective` semantics (distinct/sameAs rejected there already).
- [x] **Step 3:** `scene` gains `visiblePlanes?: Plane[]` (literal array, default `[]`, dedupe not required — but reject duplicates via refine with message `scene.visiblePlanes lists "wall" twice.`).
- [x] **Step 4:** Append `"bluePlane"`, `"redPlane"`, `"stepPlane"` to `FILM_DIRECTOR_DIRECTIVE_AXES` (the matrix lockstep test will fail until Task 4 updates the doc comment — coordinate: in THIS task also update the first content line of `docs/reference/film-director-capability-matrix.md` (`<!-- directive-axes: ... -->`) to keep the lockstep test green; Task 4 does the prose).
- [x] **Step 5:** Resolver (`resolve-film-director-spec.ts`): add `PLANE_CATALOG` module-scope const from `Object.values(Plane)`. Resolve `bluePlane`/`redPlane` exactly like `prop`: precedence `performer.X ?? cast?.defaults?.X ?? Plane.WALL literal`, per-axis stream (`createAxisStream(filmSeed, shot.id, "bluePlane")` / `"redPlane"`), `resolveCastAxis`. `sameAs` copies the SAME axis from the named performer (no cross-hand copy).
- [x] **Step 6:** Resolve `stepPlanes`: effective list = `performer.stepPlanes ?? cast?.defaults?.stepPlanes ?? []` (performer list REPLACES defaults, not merges — simpler to reason about when dictating; document in a comment). Each entry's `plane` resolves via `resolveShotDirective` against `PLANE_CATALOG` on axis `"stepPlane"`. Resolved performer type carries `bluePlane: Plane`, `redPlane: Plane`, `stepPlanes: Array<{step, hand, plane: Plane}>`. Resolved scene carries `visiblePlanes: Plane[]`.
- [x] **Step 7:** Tests (`plane-axes.test.ts`): (a) default resolution = WALL/WALL, empty stepPlanes, empty visiblePlanes; (b) `distinct` across 8 performers on `bluePlane` yields 8 unique planes deterministically (re-resolve identical); (c) `sameAs` chain copies; (d) `not: "wall"` never yields wall; (e) rejection: unknown plane named in error; (f) rejection: `distinct` with `from: ["wall","wheel"]` over 3 performers → pool-too-small message; (g) stepPlanes with pick-any resolves to a catalog member and rerolls under a bumped `seed.axes.stepPlane` while `bluePlane` results hold still; (h) duplicate visiblePlanes rejected. Also re-run the golden-vector test file to prove existing axes did not shift.
- [x] **Step 8:** Run the full film-director suite (`npx vitest run tests/unit/film-director --exclude ".codex-tmp/**" --exclude ".claude/worktrees/**"`). Commit with explicit pathspec (schema, resolver, new test, matrix comment line).

### Task 3: Adapter + scene wiring

**Files:**
- Modify: `src/routes/test/film-director/_lib/director-viewer-adapter.ts`
- Modify: `src/routes/test/film-director/_components/FilmDirectorScene.svelte` (only if ordering requires; see Step 3)
- Test: `tests/unit/film-director/director-viewer-adapter.test.ts` (extend the existing file if present; otherwise create)

- [x] **Step 1:** `buildDirectorViewerSeed`: `customBluePlane: performer.bluePlane`, `customRedPlane: performer.redPlane`, `visiblePlanes: shot.scene.visiblePlanes`.
- [x] **Step 2:** `applyDirectorShotToViewer`: inside the existing `withoutUndo` block, per performer: `performer.setHandPlane("blue", directed.bluePlane)`, `performer.setHandPlane("red", directed.redPlane)`; then clear stale per-step overrides and apply the shot's: read the performer's current override steps (`getStepPlanes` won't enumerate — check the instance API for the overrides Map accessor; if none exists, add a `clearStepPlaneOverrides()` method to `avatar-instance-state.svelte.ts` that empties the Map and re-applies), then `performer.setStepHandPlane(entry.step, entry.hand, entry.plane)` per resolved entry. Note `setStepHandPlane` forces CUSTOM mode and normalizes WALL-only entries away — both acceptable.
- [x] **Step 3:** Visible planes per shot: the viewer API already has `hideAllPlanes()` (called once at mount in `FilmDirectorScene.svelte`). Find the show/toggle API in `viewer-3d-state.svelte.ts` and apply `shot.scene.visiblePlanes` in `applyDirectorShotToViewer` (hide all, then show the listed ones). Remove the mount-time `viewer.hideAllPlanes()` in `FilmDirectorScene.svelte` only if the per-shot application fully covers it; otherwise leave it.
- [x] **Step 4:** Ordering check: `applyBeatPlaneOverrides()` no-ops when the instance has no `loadedSequence`. Verify (read the load path) whether the sequence load that follows/precedes shot application re-applies overrides; if a first-shot race exists, re-apply overrides after load (smallest correct hook — document what you found in the commit message).
- [x] **Step 5:** Tests: seed carries resolved planes + visiblePlanes; apply path sets hand planes on reused instances and clears the previous shot's step overrides (shot A has overrides, shot B has none → after applying B the instance reports WALL for A's steps).
- [x] **Step 6:** Run film-director suite + `npm run check` gate is deferred to final delivery; run at least the touched test files. Commit with explicit pathspec.

### Task 4: Capability matrix + corpus + decision-queue closure

**Files:**
- Modify: `docs/reference/film-director-capability-matrix.md`
- Modify: `tests/unit/film-director/directive-corpus/` (new category file + runner registration)

- [x] **Step 1:** Matrix: move per-performer hand plane, per-step hand plane, and plane visibility from "Real but not yet speakable" into the speakable axes tables with their grammar (bluePlane/redPlane full directive grammar; stepPlanes with shot-scope directives; scene.visiblePlanes literal list). Record the 2026-08-24 rulings: ocean variants SHELVED ("there's only one ocean" — hardwired `abyss`, no axis); nav mode DROPPED (viewer navigation control; the director camera overrides it every frame, so it cannot affect a film); grid labels stay hardwired off BY DECISION (default-off confirmed).
- [x] **Step 2:** Corpus: add `plane-directives.ts` category (~25 entries, mix of accepted/rejected following existing category style): distribution over bluePlane/redPlane distinct/oneOf/not/sameAs, stepPlanes literals and pick-any, visiblePlanes lists; rejections: unknown plane (named in message), distinct over narrowed pool, sameAs to unknown performer, negative step, bad hand value, duplicate visiblePlanes, distinct/sameAs attempted at stepPlane scope (shot-scope rejection). Register in the runner; keep the coverage-bar meta-test green (recompute the rejection ratio).
- [x] **Step 3:** Run the corpus + full film-director suite. Commit with explicit pathspec.

### Task 5 (main loop, not a subagent): Creative films + delivery

Author several v2 films that stretch the language — distinct planes across a cast, sameAs plane pairings, per-step plane scrambles, camera grammar chains, seeded rerolls — then verify visually and deliver in the Browser pane. Owned by the orchestrator; not dispatched (visual work is not a fan-out candidate).
