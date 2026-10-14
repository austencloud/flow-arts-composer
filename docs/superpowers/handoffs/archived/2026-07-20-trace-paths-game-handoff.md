> Archived 2026-10-14: Matching scope is recorded in `docs/superpowers/specs/shipped/2026-07-20-trace-paths-game-design.md`.

# Trace Paths Game Handoff

## Mission

Implement Trace Paths v1 from the approved design:

[`2026-07-20-trace-paths-game-design.md`](./2026-07-20-trace-paths-game-design.md)

Start with the device-truth harness and pure trace engine. Carry the work through a complete one-hand vertical slice, then synchronized split-grid two-hand play. Integrate it as a dedicated immersive experience launched from Learn > Play. Keep the evaluator portable enough for a standalone shell later, but do not create a second product or package during v1.

The design commit is `51445f72a5` (`docs: design Trace Paths touch game`).

## Done, verified

### Product design

- The complete product, interaction, architecture, scoring, accessibility, safety, privacy, test, and rollout design is committed at `51445f72a5`.
- The design chooses synchronized split grids as the default two-hand layout.
- A shared grid is an advanced mode that runs only after a physical collision preflight.
- Both canonical `SequenceData` and verified `HandPathData` are content sources.
- The first named content target is Zan's Diamond, but its path must be author-verified before encoding.
- The first product home is inside TKA, launched from Learn > Play. Standalone extraction is an evidence-based later decision.

### Repository orientation

The following implementation paths were read, not inferred:

- `src/lib/features/learn/play/domain/game-registry.ts`
- `src/lib/features/learn/play/components/PlayHub.svelte`
- `src/lib/features/learn/play/components/GameShell.svelte`
- `src/lib/features/learn/play/domain/arcade-types.ts`
- `src/lib/features/learn/play/state/arcade-session-state.svelte.ts`
- `src/lib/features/learn/play/domain/scoring.ts`
- `src/lib/features/learn/play/domain/progression.ts`
- `src/lib/features/learn/play/services/play-progress-store.ts`
- `src/lib/features/learn/components/interactive/positions/PlacementGrid.svelte`
- `src/lib/features/learn/components/interactive/GridPointTapQuiz.svelte`
- `src/lib/shared/interactive-canvas/InteractiveCanvas.svelte`
- `src/lib/shared/assemble-lab/services/grid-hit-target-calculator.ts`
- `src/lib/features/choreo-card/services/hand-path-data-builder.ts`
- `src/lib/features/hand-paths/hand-path-builder/services/hand-path-animator.ts`
- `src/lib/features/landing-preview/components/VideoCropEditor.svelte`
- `src/lib/shared/browse/services/pinch-zoom-grid-controller.ts`
- `packages/9square-domain/src/data/grid.ts`
- `packages/9square-domain/src/data/transitions.ts`
- `packages/9square-domain/src/data/eight-step-cap.ts`

The repository search found reusable arcade, grid, canvas, path, haptic, fullscreen, viewport, persistence, and pointer-cache systems. It did not find an ordered freehand evaluator, synchronized two-hand beat gate, or shared-grid collision preflight.

### Domain grounding

Flow Arts MCP evidence was gathered in this session:

- `get_sequence_data` returned a starting state plus ordered blue and red motions with start and end locations. This proves the typed sequence-to-trace input contract.
- `get_domain_topic("motion-types-complete")` confirmed the geometry distinction between curved shifts, straight dashes or hashes, and held static motion.
- `get_position_info("beta")` confirmed that both hands can occupy the same canonical grid point. This is the domain reason split grids are the reliable two-hand default.
- `search_vtg("Zan's Diamond")`, `search_vtg("Zan diamond")`, and `get_term_definition("Zan's Diamond")` returned no named pattern record.
- Repository grep found the phrase `Zan's Diamond variations` in `src/lib/features/learn/domain/concepts.ts`, but no ordered coordinates.

Do not turn the earlier `ZANZ` word-generation probe into Zan's Diamond. They are unrelated.

### External research

- W3C Pointer Events Level 3 supports concurrent pointer IDs, capture, `touch-action`, cancellation, and coalesced event samples.
- The `$1` recognizer is a completed single-stroke template classifier. `$P` ignores stroke number, order, and direction. Neither matches this live ordered-route problem.
- Discrete Fréchet distance is suitable for ordered point-sequence comparison across different sampling densities.
- WCAG pointer and dragging guidance informed Tap Route, One Hand, and Step-through Preview alternatives.
- WCAG flash guidance, NHS epilepsy guidance, and FDA intended-use guidance informed the no-flash and no-medical-claim rules.

Sources are linked in the design document.

### Document verification

- All relative Markdown targets in the design document resolve to real local files.
- `git diff --cached --check` passed before commit.
- The AI-writing pattern scan found no em dashes, canned transitions, inflated claims, or prohibited marketing language. Matches for `unlocks` and `landscape` were literal product terms.
- No application code was changed for this concept.

## Believed done, not yet verified

- The split-grid default should avoid same-point collisions and most finger occlusion. It has not been tried on physical hardware.
- Discrete Fréchet plus ordered checkpoint and corridor gates should produce useful feedback. Thresholds and weights are design baselines, not calibrated values.
- `InteractiveCanvas` should provide the right aligned canvas stack. The proposed generic interaction-layer slot has not been implemented or rendered.
- The existing arcade can support performance outcomes without changing quiz behavior. The discriminated event design has not been compiled against every game.
- An unfolded Z Fold should have enough space for strong split-grid play and some collision-safe shared-grid challenges. No device proof exists yet.
- The named Zan's Diamond target should fit the `HandPathData` adapter after its coordinates are verified. Its source record does not exist yet.

## In flight

No implementation files are in flight. The next agent owns the feature from the first code change.

Begin with Phase 0 from the design:

1. Add an internal Trace Paths harness through the existing application test-route convention.
2. Render two normalized paths on synchronized split grids.
3. Capture stable pointer IDs, pointer assignment, coalesced samples, capture loss, and visibility loss.
4. Show ordered checkpoint progress and normalized path distance in a removable diagnostics overlay.
5. Write pure tests before attaching progression or polished chrome.

Move directly into the one-hand vertical slice when the engine tests pass. Do not leave the feature as a permanent lab-only prototype.

## Loose ends, ranked

### P0: Prove the touch engine

- Define normalized trace, segment, beat, sample, evaluation, and result types using canonical domain types at the adapter boundary.
- Reuse or extract path sampling from `hand-path-animator.ts`; add parity tests before moving its logic.
- Implement swept checkpoint detection, mostly monotonic segment progress, hold zones, corridor analysis, and discrete Fréchet scoring.
- Simulate 30, 60, and 120 Hz traces in unit tests and require materially equivalent results.
- Treat `pointercancel` and `lostpointercapture` as neutral interruption.

### P0: Deliver the playable vertical slice

- One hand: preview, arm, trace, feedback, retry, next.
- Two hands: split grids, start in either order, synchronized beats, early-arrival wait, and static holds.
- Add Reduced Motion, Low Stimulus, haptic, and sound settings with the first playable UI.
- Add Tap Route and Step-through Preview before content unlocks depend on the new game.

### P0: Preserve the arcade

- Add performance round events without changing existing choice-game scoring.
- Keep `submitAnswer()` as a compatibility path or prove an equally low-risk migration.
- Reuse aggregate score, stars, unlocks, local storage, and Firestore progress.
- Add a game capability contract for immersive stage and input guidance. Do not scatter `gameId === "trace-paths"` checks through the shell.
- Derive Play Hub game-count language from the registry.

### P1: Prove real hardware

- Ask for explicit browser-control permission immediately before interactive DevTools verification. The current conversation grants broad implementation trust, not the repository's required explicit browser permission.
- Run the physical matrix on Austen's Z Fold: folded and unfolded, portrait and landscape, Chrome Android and Samsung Internet, reversed finger start order, early lift, third contact, rotation, background and restore, and fingers leaving bounds.
- Capture proof of two stable pointer IDs and one completed synchronized round.
- Tune target, corridor, regression, and synchrony thresholds from device traces. Do not guess final constants from desktop mouse input.

### P1: Add shared-grid challenges

- Implement collision preflight from simultaneous target and corridor separation.
- Reject same-point and overlapping simultaneous routes.
- Allow crossings only when their beat timing prevents physical collision.
- Keep split mode available as the reliable fallback.

### P1: Source Zan's Diamond

- Ask Austen to verify the ordered hand path or provide the trusted reference when content work reaches this item.
- Store the result as a sourced hand-path record.
- Never infer the route from the name, an unsourced video, or the generated word `ZANZ`.

### P2: Expand content

- Build progression from one segment to memory, two-hand sync, static holds, longer chains, and full sequences.
- Populate 9-Square domain data from sourced material before enabling the generic 3-by-3 product skin.
- Add rhythm only after untimed path practice is reliable.
- Keep global leaderboards out until cross-device score fairness is demonstrated.

### P3: Decide on standalone extraction

- Measure repeat play, completed rounds, trace improvement, and use outside lessons.
- If the interaction earns a separate shell, extract the already pure engine. Do not copy it into a second codebase.

## Decisions

### The game is not an Assemble interaction

Dragging may improve Assemble, but Trace Paths is its own touch game. It trains a gesture rather than editing a sequence.

### Default two-hand play uses two grids

Canonical two-hand content can place both hands at the same semantic point. One screen coordinate cannot accept two fingertips. Split grids preserve each path and the shared timeline without inventing offset choreography.

### Shared grid is earned per challenge

Large screens make shared play more plausible, not automatically valid. Geometry and timing decide whether fingers can coexist.

### Point order is the correctness gate

A player must reach required checkpoints in order. Geometry scoring is forgiving inside a tuned corridor, and beautiful tracing cannot compensate for a skipped point.

### Speed is not the default reward

The current arcade speed bonus conflicts with deliberate motor practice. Coverage, Accuracy, Continuity, and Sync remain visible. Tempo arrives only in an opt-in later mode.

### Raw traces stay local

Do not persist or transmit pointer coordinates, pressure, contact geometry, device identifiers, or replayable traces in v1. Remote analytics needs a separate schema review.

### Accessibility does not pretend tracing is tapping

Trace medals measure tracing. Tap Route, One Hand, and Step-through Preview preserve access to content and unlocks without making a false equivalence.

### This is not an epilepsy product

The game can be calm, low stimulus, and personally enjoyable. It does not claim to treat, mitigate, rehabilitate, or make play medically safe. No flashing is the product rule.

## Gotchas

### Shared checkout

The working tree contains extensive unrelated changes from other sessions. They belong to their owners.

- Work directly on `main` under the current repository rule.
- Never switch the primary checkout to another branch.
- Never use `git add -A`, `git add .`, or a bare `git commit`.
- Commit with explicit pathspecs only.
- Do not revert, format, stage, or include unrelated files.

At handoff creation, `main` was already ahead of `origin/main` with other agents' committed work. Inspect the current log and status before every commit or push.

### Dev server

Port 5173 belongs to Austen's VS Code server and serves HTTPS only.

- Never start, stop, restart, or kill it.
- Read-only checks use `https://localhost:5173` with the required certificate handling.
- Use a separate free port such as 5174 only when a private server is actually needed.

### Browser control

Interactive DevTools actions require explicit verbal permission in the active conversation. Read-only screenshots and console inspection are allowed only within the repository rule. Synthetic component tests do not prove simultaneous touch behavior.

### Domain facts

Every TKA letter, position, motion, grid, and named-pattern claim requires Flow Arts MCP evidence. If the MCP is unavailable, stop and ask for a Codex restart. Never render pictographs or sequences through shell scripts, inline code, or base64.

### Canvas layering

`InteractiveCanvas.svelte` has an optional visual animation layer and a click-oriented `HitTargetOverlay`. Add a generic trace interaction layer or a precisely aligned wrapper. Do not mutate the click overlay into a multi-pointer controller.

`grid-hit-target-calculator.ts` contains its own target arrays. Add a parity test against the shared grid coordinate source before trusting it for scoring. Do not create another coordinate table.

### Pointer handling

- `isPrimary` does not identify blue or red.
- Pointer IDs may be reused after a gesture; scope them to the active round.
- Use coalesced events when available and the parent move event as fallback.
- Predicted events may decorate rendering but never affect correctness.
- `touch-action: none` belongs on the play surface only.
- Browser palm rejection and orientation changes may cancel a pointer stream. Pause without blame.

### Path geometry

Static motion is a hold, not a zero-length drawn segment. Straight and curved paths must share geometry with the existing path animator. Do not teach an approximate line because it was easier to score.

### Scoring

The existing arcade session is binary and speed-biased. Protect all eight current games with focused regression tests while adding performance events. No full global check belongs in the inner loop; follow the repository's focused verification rules.

### Nine-square content

The package exists, but its core position, transition, and CAP arrays are empty TODOs. Do not launch an unsourced 3-by-3 curriculum from its interfaces alone.

### Skills and rules for implementation

Use these skills when their work begins:

- `concepts` for the learning loop and progression
- `code-style` for TypeScript and Svelte
- `state-management` for the trace state factory and context
- `styling` for the immersive responsive surface
- `testing` for the engine and arcade regression coverage
- `error-boundaries` only for earned runtime failure paths
- `service-naming` for any new stateful service or getter

Read the matching `.claude/rules/*.md` before each implementation concern. The design document does not override repository canon.
