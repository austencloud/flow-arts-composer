# Solo authoring revival, 2026-10-14

## Scope and evidence

Observation: this worker stayed in `E:/worktrees/tka-platform/swarm-solo-authoring`, branch `codex/swarm-solo-authoring`, starting at `503fbf5d32e7a0d374b93435978268ba0520cf6d`. Initial `git status --short` was empty. Rescue source: `49edfde7393adf80b4e81b09d99348099bd5344b`, read with `git show codex/construct-solo-authoring-wip` and `git diff main...codex/construct-solo-authoring-wip`. No merge, cherry-pick, checkout, push, dependency installation or server was run. Only brief-owned paths were edited.

Observation: the per-file plan in `docs/reports/swarm-2026-10-14/wip-relevance.md`, section “Construct solo authoring”, was read first. Subsequent area changes were inspected: `48050b501058ccc26cc7db3545eac53711156399` (placement naming), `aaa3c76d07` (test guard), `a97b743f05` (current imports), and `d97f7d6270698ff44324607b8a6182b004d4a40e` (pair variations). The pair-variation commit adds a separate foundation generator; this append-only editor does not invoke that generator.

Observation: grid fix commit `210e2d5859`, `fix(foundation): preserve solo start placement grids`, copies supplied `gridMode` in `create-start-placement-data.ts:22` and passes `soloProp.impliedGridMode` into the adapter's start factory at `solo-prop-sequence-adapter.ts:79`. Both fixes have failing-without-fix evidence below.

Observation: authoring commit `8e30fe3924`, `feat(test): revive guarded solo path authoring`, restores the contract, state, three components, entry page and authoring regressions. The route-local lint config is included so Svelte and test files are actually checked.

## What the test route supports

Observation from code and the real-catalog regression tests; browser behavior remains unobserved:

1. Open `/test/construct-solo-handoff`. The initial eight-step blue solo can be continued by choosing a motion.
2. Choose **New solo**, then Blue or Red, Diamond or Box, a starting orientation and a starting pictograph.
3. Append motions. **Turns** opens the existing level palette and dash/static spin direction choices. Close it with **Done** to select a pictograph with those settings.
4. Inspect the active path in production `StepGrid`. Paths longer than eight steps have **Previous** and **Next** pages. On phones, use **Your path** and **Build blue/red** to switch panels. Inspection selects a step; edits continue at the tail.
5. **Undo** and **Redo** reverse starting choices, append operations, **New solo**, and beginning partner authoring. The state remains in memory.
6. **Review solo** plays a solo without requiring a second hand. **Keep editing** returns to the draft.
7. **Add red/blue path** fixes the first hand and starts authoring the other hand on the same grid. Choose its start and author exactly the first hand's number of steps. Inspect the fixed hand with its path tab; a matching fixed pictograph also appears beside the active decision.
8. **Combine paths** becomes available at the matching length. Current Fuse and letter derivation build the pair. Unequal lengths, empty paths and unequal durations are rejected before Fuse can tile or truncate. Undo during asynchronous letter derivation invalidates the result.
9. Follow **Fixture walkthrough** to `/test/construct-solo-handoff/proposal`. Its page source is unchanged. The existing helper preserves its default/numeric eight-option limit; authoring supplies explicit turn settings to receive the full projected catalog.

## Domain and capability sources

Observation: `mcp-server/AGENTS.md` and `.claude/rules/tka-domain.md` were read before placements, grids, turns or hand reasoning. No domain facts were supplied from model memory.

| Rule used                          | Existing source and relationship                                                                                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Diamond and Box starting locations | Compose `src/lib/shared/pictograph/grid/services/placement-grid-points.ts`; Diamond returns North/East/South/West, Box Northeast/Southeast/Southwest/Northwest.                                                                             |
| Single-hand continuation           | Extend the existing `construct-solo-proposal.ts` projection of `motionQueryHandler` results; real Diamond/Box CSV data is exercised by the regression suite. Match the visible hand's endpoint location and carry its orientation.          |
| Turns, floats and spin direction   | Compose `shared/create/services/level-turn-values.ts`, `apply-turns-to-motion.ts`, and `pictograph/prop/services/orientation-calculator.ts`. The canonical transform owns float provenance and end orientation.                             |
| Canonical composition and hashes   | Compose `foundation/services/sequence-decomposer.ts` and `solo-prop-sequence-adapter.ts` after each append. Rebuild solo/hash data while keeping presentation step identities.                                                              |
| Pair fidelity                      | Compose today's `features/fuse/services/sequence-fuser.ts`. Its `rehydrateMotion` calls preserve authored fields, and its reversal detector synchronizes reversal flags with pairings. The restored helper does not overwrite Fuse motions. |
| Letters                            | Compose `shared/navigation/services/letter-deriver.ts`; solos remain unlettered. Pairing letters are synchronized after derivation.                                                                                                         |
| History and async cancellation     | Reuse `shared/history/command-stack.svelte.ts`. Draft revisions invalidate delayed pairing results; catalog request revisions reject obsolete loads.                                                                                        |
| Production access boundary         | Preserve `src/routes/test/+layout.ts` and this route's existing `+layout.svelte`/`+layout.ts`; no reset layout bypasses `guardInternalRoute`.                                                                                               |

Observation: capability discovery searched `docs/architecture/canonical-capabilities.md` with `rg` for solo, CommandStack, Fuse, orientation and motion catalog. Existing catalog, turn, history, decomposer, adapter, Fuse and rendering owners were read. The restored state factory accepts service dependencies and distributes state through context. No replacement renderer, history stack, turn algorithm or persistence owner was added.

## Verification

Observation: all existing unit tests importing either changed library file were identified using `rg -l 'create-start-placement-data|solo-prop-sequence-adapter' tests/unit`. The existing proposal regression was also included because its helper was extended.

```powershell
npx vitest run --config tests/config/vitest.config.ts tests/unit/construct-solo-authoring.test.ts tests/unit/construct-solo-grid-preservation.test.ts tests/unit/construct-solo-proposal.test.ts tests/unit/composer-presentation-state.test.ts tests/unit/create/assemble/assemble-tab-state.test.ts tests/unit/create/create-module-event-handler-append.test.ts tests/unit/grid-join/factories-and-pairings.test.ts tests/unit/fuse/fuse-reversal-contract.test.ts tests/unit/opus-persistence-audit/solo-hand-absence-roundtrip.test.ts tests/unit/opus-persistence-audit/share-wire-motion-fields.test.ts tests/unit/media-composition/post-sequence-view.test.ts tests/unit/services/SequenceHydrator.test.ts tests/unit/solo-prop-sequence-adapter.test.ts tests/unit/trace-paths-conversion.test.ts tests/unit/create/update-sequence-start-placement.test.ts
```

```text
Test Files  15 passed (15)
Tests  87 passed | 4 expected fail (91)
Duration  26.65s
Exit 0
```

Observation: the four expected failures are existing `it.fails` cases: two in `solo-hand-absence-roundtrip.test.ts` and two in `share-wire-motion-fields.test.ts`. They are neither new failures nor fixes claimed by this worker.

Observation: the restored authoring suite covers Box creation paths, both hands and both grids, whole/half/quarter turns and floats, explicit dash spin, rejected discontinuities, unequal-length pairing, both partner-authoring orders, delayed Undo, retry without workspace storage writes, and canceled async letters. Added checks cover unequal durations and float provenance/orientation/native-grid fidelity through current Fuse.

Observation: the two grid fixes were each removed temporarily, checked and restored in a `finally` block. The exact commands and assertion results were:

```powershell
npx vitest run --config tests/config/vitest.config.ts tests/unit/construct-solo-grid-preservation.test.ts -t "copies an explicit Box"
npx vitest run --config tests/config/vitest.config.ts tests/unit/construct-solo-grid-preservation.test.ts -t "passes the solo Box"
```

```text
Factory removed: Test Files 1 failed; Tests 1 failed | 2 skipped; exit 1
Adapter removed: Test Files 1 failed; Tests 2 failed | 1 skipped; exit 1
Both: AssertionError: expected undefined to be 'box'
Both files restored; the final 15-file run above passed.
```

Observation: the default ESLint config globally ignores `**/*.svelte` and `tests/`. Its initial command exited 0 with ignored-file warnings. The route-local `eslint-authoring.config.mjs` reuses the repository config and installed Svelte plugin to check the requested files explicitly. Test files use syntax lint because they are excluded from the app TypeScript project; type-dependent rules stay enabled for app TypeScript. Svelte rune modules retain the TypeScript parser.

```powershell
npx eslint --config src/routes/test/construct-solo-handoff/eslint-authoring.config.mjs --max-warnings 0 src/lib/shared/create/factories/create-start-placement-data.ts src/lib/shared/foundation/services/solo-prop-sequence-adapter.ts src/routes/test/construct-solo-handoff/+page.svelte src/routes/test/construct-solo-handoff/construct-solo-proposal.ts src/routes/test/construct-solo-handoff/solo-authoring-state.svelte.ts src/routes/test/construct-solo-handoff/SoloStartChoices.svelte src/routes/test/construct-solo-handoff/SoloMotionChoices.svelte src/routes/test/construct-solo-handoff/SoloPathPreview.svelte tests/unit/construct-solo-authoring.test.ts tests/unit/construct-solo-grid-preservation.test.ts
```

Observation: the scoped lint command exited 0 with no diagnostics and `--max-warnings 0`.

Observation: `svelte/compiler.compile` with `generate: "client"` was run directly against `+page.svelte`, `SoloStartChoices.svelte`, `SoloMotionChoices.svelte` and `SoloPathPreview.svelte`. Each printed `compiled, 0 warnings`; process exited 0. This checks syntax and Svelte diagnostics, not browser geometry or component prop types.

```powershell
npx prettier --check src/lib/shared/create/factories/create-start-placement-data.ts src/lib/shared/foundation/services/solo-prop-sequence-adapter.ts src/routes/test/construct-solo-handoff/+page.svelte src/routes/test/construct-solo-handoff/construct-solo-proposal.ts src/routes/test/construct-solo-handoff/solo-authoring-state.svelte.ts src/routes/test/construct-solo-handoff/SoloStartChoices.svelte src/routes/test/construct-solo-handoff/SoloMotionChoices.svelte src/routes/test/construct-solo-handoff/SoloPathPreview.svelte src/routes/test/construct-solo-handoff/eslint-authoring.config.mjs src/routes/test/construct-solo-handoff/AUTHORING-CONTRACT.md tests/unit/construct-solo-authoring.test.ts tests/unit/construct-solo-grid-preservation.test.ts docs/reports/swarm-2026-10-14/solo-authoring.md
```

Observation: formatting printed `All matched files use Prettier code style!` and exited 0. `git diff --check` exited 0. The original guarded layouts and `proposal/+page.svelte` have no diff.

Observation: an initial authoring test import still referenced the retired `create-start-position-data.js`; that failure was corrected to `create-start-placement-data.js` before the passing runs. Scoped lint attempts also exposed dependency-tracking expression statements and configuration/parser issues; those were corrected before the final lint result.

## Deliberately left out

Observation: the rescued reset `+layout@.svelte` was not restored, because it would bypass today's guard. Production Create, saving, saved-path selection, interior-step replacement, skewed/centric authoring, generation and handoff remain outside this test contract.

Observation: the root viewport/iframe wrapper was replaced by the rescued authoring workbench. The fixed fixture page remains reachable through the shared `LinkChip`. Its source was not replaced with the rescued authoring page. The existing helper was extended in place, with backward-compatible numeric option limits, rather than adding a competing catalog projection.

Observation: the rescued post-Fuse motion overwrite was omitted because current Fuse owns float fidelity and reversal processing. Its `fusedFrom` metadata is retained. Equal-count/duration checks remain stricter than generic Fuse, to preserve every authored step.

Observation: restored component layouts and primitives came from the rescued prototype. The workbench uses the current fixture route's workspace gap and panel radius. No new visual motif was designed. Appearance remains unverified under the brief's browser/server restrictions.

## LOOK CHECK

Observation: no browser or server was started; these are inspection instructions, not passed visual checks. URL paths are `/test/construct-solo-handoff` and `/test/construct-solo-handoff/proposal`. No live preview or local-main integration is claimed.

Proposal: inspect at 375×667, 960×412, 820×1180, 1440×900, 1920×1080, 2560×1440 and 3840×2160. Use page viewport emulation; check readable pictographs, keyboard focus, reachable controls, overflow and panel switching at each applicable state.

Proposal, complete authoring control inventory from source:

- Toolbar: Undo, Redo, New solo. Footer: Fixture walkthrough link.
- Mobile tabs: Build blue/red (Playback when reviewing), Your path.
- Partner inspection tabs: active hand “building” and primary hand “fixed”.
- Path inspection: start/step pictographs in `StepGrid`; Previous and Next appear above eight steps. Clicking highlights a step and does not replace it.
- Fresh solo setup: Blue/Red, Diamond/Box, In/Out/Clock/Counter, and four labeled starting-pictograph buttons. Partner setup exposes orientation and its four start choices; the first hand and grid remain fixed.
- Motion settings: Turns (current value), Done, difficulty levels 1/2/3/4, Level 1 turn 0; Level 2 turns 0/1/2/3; Level 3 fl/0/0.5/1/1.5/2/2.5/3; Level 4 fl/0/0.25/0.5/0.75/1/1.25/1.5/1.75/2/2.25/2.5/2.75/3, Clockwise/Counterclockwise for positive numeric dash/static turns, and Change turns when there are no options.
- Motion selection: every projected pictograph button, labeled motion type and endpoint; Retry loading on catalog failure.
- Draft/review actions: Review solo, Add red/blue path, Combine paths (Combining while busy), Keep editing.
- Inherited player: Play/Pause, BPM presets 15/30/60/90/120/150, Custom, Custom decrease/increase BPM, and Retry on animation loading failure. `fill` hides the progress bar; `disableContextMenu` disables its settings/export menu. Source: `InlineAnimationPlayer.svelte` and compact `BpmChips.svelte`.

Proposal: exercise the nine steps in “What the test route supports” for each starting hand. Include Box/Out starts, level-four float choices, a nine-step path for pagination, both direction choices, Undo/Redo across New solo and partner entry, incomplete-partner review prevention, combined playback and return to editing. Follow the fixture link and verify its original continue-blue / choose-fixed-red / paired walkthrough.

## Needs Austen and coordinator delivery

Observation: no product decision or approval is required for this bounded revival. The brief delegates visual review and integration to the coordinator; this worker must not touch another worktree, start a preview server or merge. The branch and worktree are preserved for that delivery.
