# LED models port, 2026-10-14

## Scope and evidence

Observation: this worker owns `E:/worktrees/tka-platform/swarm-led-models`, branch `codex/swarm-led-models`. Starting HEAD was `503fbf5d32e7a0d374b93435978268ba0520cf6d`; initial `git status --short` was empty. Source reference is `f88f37f4041201b49ccc3beeadca10255dc1ffc2`, `wip(3d): stranded LED shape prop pipeline work`, dated 2026-09-07 by Git. The worker read the relevance report's LED section, the branch stat/diffs, and `git show codex/led-shape-props-wip:docs/superpowers/specs/2026-09-04-led-shape-props-handoff.md`.

Observation: this port contains source, generators, verifiers, and unit tests. No Blender invocation, binary/image copy, installation, dev server, broad build/check, merge, push, primary-checkout access, or external-data mutation was performed. The older handoff's claimed render/build results were not adopted as present evidence. Visual acceptance remains deferred by the brief.

## What exists now and how code reaches it

| Owner                                                                 | Observation                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/build-fan-model.py`                                          | Adds `Fan_Astral` beside Fire/Lotus/Day/Moon and the optional cover. Authors 30 blade and 36 side emitters, an open grip, frame, and diffusers. The blade uses analytic ellipse samples so generator/runtime positions agree. Existing fan assemblies remain in the generator.                                            |
| `scripts/verify-fan-glb.cjs`                                          | Requires Astral's nodes, 66-emitter/two-zone metadata, exactly 30 blade and 36 side nodes parented to the Astral group, and retains existing fan invariants. Family asset budget is 2.5 MB.                                                                                                                               |
| `src/lib/shared/3d/domain/astral-fan-geometry.ts`                     | Owns the authored emitter constants and sample coordinates used by the renderer and five optical anchors. These counts are implementation constants, not newly verified manufacturer claims.                                                                                                                              |
| `src/lib/shared/3d/domain/fan-appearance.ts`                          | Adds `INTERNAL_FAN_BUILDS` and `normalizeInternalFanAppearance`. Astral normalizes to a bare frame. Existing public fan normalization, public lists, render keys, and codecs are untouched.                                                                                                                               |
| `src/lib/shared/3d/domain/scene-prop-catalog.ts`                      | Exports `INTERNAL_LED_PROP_BUILDS`: `fan-astral`, `triquetra-tubing`, `triangle-tubing`, with existing prop identities, model paths, parent group names, and explicit build inputs. Public catalog/preview arrays do not consume this registry.                                                                           |
| `src/lib/shared/3d/domain/build-for-effect.ts`                        | Explicit internal Astral inputs survive enabling LEDs; covered Astral is uncovered. Public fan LED selection still chooses Moon. Shapes still return the existing effect result and are never automatically switched to tubing.                                                                                           |
| `src/lib/shared/3d/effects/led/astral-fan-led-renderer-3d.ts`         | Directly import `AstralFanLedRenderer3D`; call `initialize(parent)`, `update(frame)`, `reset()`, `dispose()`. Two-sided instancing draws 132 optical samples for 66 positions, with rig-local center, quaternion, scale, brightness, and per-pixel colors.                                                                |
| `scripts/build-led-shape-models.py`                                   | Authors day/LED tubing for both triquetra grips and both current Triangle grips. Reads `scripts/hoop-family-stations.json` for Triangle chord, sagitta, tube size, sleeves, and elbow length. `--layout-json` prints all emitter positions without importing Blender or writing files.                                    |
| `scripts/verify-led-shapes-glb.cjs`                                   | Requires all four parent groups and each grip child, checks station metadata, per-grip emitter counts/parentage, tubing and center-ring nodes, materials, and asset budget. Expected GLB emitter total is 216: two 60-sample triquetras plus two 48-sample Triangles.                                                     |
| `src/lib/shared/3d/domain/manufactured-shape-geometry.ts`             | Owns the runtime geometry. Triangle uses `TRIANGLE_STATIONS_M`, bowed sides, corner/side pivots, and 48 distance-spaced samples. Triquetras use a fixed-size woven trefoil with armpit/tip presentations and 60 samples each. Their current day plates remain unchanged.                                                  |
| `src/lib/shared/3d/effects/led/manufactured-shape-led-renderer-3d.ts` | Directly import `ManufacturedShapeLedRenderer3D`; same lifecycle as the Astral renderer. Frame `kind` is `triquetra`, `triquetra2`, or `triangle`; optional `triangleGrip` is `corner` (default) or `side`. Two-sided live instance counts are 120 or 96.                                                                 |
| `src/lib/shared/3d/effects/prop-build-tip-geometry-3d.ts`             | Adds Astral-only fan anchors derived from the blade equation, fixed in metres with Big Fan's existing 1.4 scale. Current Triangle grip tips and the animation-engine tip table remain untouched.                                                                                                                          |
| `src/lib/shared/3d/domain/led-prop-builds.test.ts`                    | Covers hidden registration/public defaults, internal normalization, fan counts/anchors, actual fan-builder emitter positions through AST extraction, Python/TypeScript shape parity for every grip, Triangle stations/reach, triquetra pivots, render transforms/colors/count changes, reset, and disposal without WebGL. |

Observation: the renderer classes are reachable by direct imports and exercised by unit tests. Production `EffectOrchestrator3D.svelte` does not instantiate them. The scene package does not gain an Astral/tubing dispatch through this port. The catalog's model URLs describe generator outputs; they do not assert those outputs are present. `Triquetra_LED` contains `Triquetra_LED_Armpit`/`Triquetra_LED_Tip`; `Triangle_LED` contains `Triangle_LED_Corner`/`Triangle_LED_Side`. Day groups follow the same naming pattern. A future loader must select one build and one grip child.

Observation: ownership searches covered `fan`, `LED`, `triangle`, `tubing`, the current effect/tip owners, `scripts/hoop-family-math.mjs`, generated stations, the current package patch's Triangle and triquetra profiles, and `docs/architecture/canonical-capabilities.md`. Decision: extend the existing fan/catalog/anchor owners; add the missing optical renderers; reuse current station geometry for manufactured Triangle; preserve current triquetra armpit/tip identities as separate manufactured presentations. No alternative scene loader or animation loop was introduced.

## EXPOSE LATER

Proposal: perform these steps only after the generated assets and visual targets are accepted:

1. Rebuild and verify the assets using the commands below. Preserve the separate `Fan_Astral` assembly. Capture approved preview/artwork files; none were ported here.
2. Extend the **current** scene package's `FanBuild`/`PropBuild` typing and `Fan3D` model-group dispatch for explicit `astral`. Use the current package source/patch workflow, preserving Flat Grip, Star, Moon, and current Triangle work. Do not restore the old aggregated patch.
3. Add explicit manufactured-shape build state/dispatch in that package. With the field unset, retain existing day plates/Triangle. Select the correct day/LED group and exactly one grip child from `led-shapes.glb`; retain `triangleGrip` and current triquetra identity mapping. All new meshes are authored with the hand pivot at the origin and reach along +Y, so do not reapply the WIP's old hard-coded offsets.
4. Wire the existing effect orchestrator to instantiate/update/reset/dispose these classes only for explicit new builds. Pass the existing rig-local center, world quaternion, prop group scale, colors, and brightness. For tubing pass `triangleGrip`; for Big Fan pass 1.4. Suppress generic LED tip bulbs/POV streaks for these builds and coordinate the baked lens materials with the live optical layer so static rainbow emissions do not fight animated colors.
5. After visual approval, update the existing pictograph fan domain's public normalization, `FAN_BUILDS`, compact looks, artwork/render-key handling, and preview options together, then wire `ScenePropPicker`. Keep the current default unless Austen chooses otherwise. `INTERNAL_FAN_BUILDS` currently includes Astral only for code review; adding it to the public lists now would expose an unbuilt model.
6. Add manufactured day/LED choices to the existing shape controls only after the package/build support is ready. Use the existing Triangle identity and grip control. Add approved previews instead of reviving the old 15-inch Triangle artwork.
7. Audit cross-surface settings/persistence and codecs deliberately when exposure is approved. Do not register a second Triangle prop identity or copy the obsolete WIP codecs. Add round-trip coverage for any newly persisted build fields.

## NEEDS A PERSON

Observation: Blender generation is intentionally prohibited for this worker. In a suitable checkout of this branch/commit, the exact generation and verification commands are:

```powershell
blender --background --factory-startup --python scripts/build-fan-model.py
node scripts/verify-fan-glb.cjs
blender --background --factory-startup --python scripts/build-led-shape-models.py
node scripts/verify-led-shapes-glb.cjs
```

Proposal: run the compute on d2 using the project's d2 workflow. The default outputs are `static/models/props/fan.glb` and `static/models/props/led-shapes.glb`. Those paths are outside this worker's ownership and have not been written. Both generators accept `-- --output PATH` under Blender when a different artifact destination is needed.

Observation: package changes are outside this worker's allowed paths. Astral package typing/group selection and manufactured-shape dispatch are required before a production model review can use these builds. Shape metadata/count verification has not been exercised against a generated GLB. The fan verifier has been exercised against the existing GLB and fails because that GLB lacks Astral.

Proposal: human visual acceptance should review front, three-quarter, profile, and rear views in both hands, including the open fan grip, readable individual emitters, tubing thickness, connector sleeves, triquetra weave/ring/stays, and both Triangle grips. Review a production 16-count rotated LOOP through its seam for each new LED build. The old handoff explicitly left those captures unfinished. Source dimensions/materials are inherited modeling choices until accepted; this port makes no present fidelity claim.

## Verification

Observation: the commands below were run in this worktree. No full type sweep/build was run. Python is required for the new generator parity test; Blender is not.

```powershell
npx vitest run --config tests/config/vitest.config.ts src/lib/shared/3d/domain/led-prop-builds.test.ts src/lib/shared/3d/domain/scene-prop-catalog.test.ts src/lib/shared/3d/domain/scene-prop-previews.test.ts src/lib/shared/3d/effects/prop-tip-geometry-3d.test.ts src/lib/shared/3d/effects/prop-tip-parity-2d-3d.test.ts tests/unit/3d-effects/build-for-effect.test.ts tests/unit/3d-effects/moon-fan-led.test.ts tests/unit/3d-viewer/fan-star.test.ts tests/unit/3d-viewer/fan-flat-grip.test.ts tests/unit/hoop-family/scene-hoop-family.test.ts tests/unit/scene-prop-picker-contract.test.ts tests/unit/worker-renderer/worker-prop-factory-contract.test.ts
```

Observation: exit 0; `Test Files  12 passed (12)`; `Tests  179 passed (179)`. This includes every test found importing the changed catalog/build/anchor domain files, plus the current picker and worker contracts. The new suite was subsequently rerun after correcting its type import and filling complete build fixtures; final result is recorded below.

```powershell
npx vitest run --config tests/config/vitest.config.ts src/lib/shared/3d/domain/led-prop-builds.test.ts
npx eslint src/lib/shared/3d/domain/build-for-effect.ts src/lib/shared/3d/domain/scene-prop-catalog.ts src/lib/shared/3d/domain/fan-appearance.ts src/lib/shared/3d/domain/astral-fan-geometry.ts src/lib/shared/3d/domain/manufactured-shape-geometry.ts src/lib/shared/3d/domain/led-prop-builds.test.ts src/lib/shared/3d/effects/prop-build-tip-geometry-3d.ts src/lib/shared/3d/effects/led/astral-fan-led-renderer-3d.ts src/lib/shared/3d/effects/led/manufactured-shape-led-renderer-3d.ts
npx prettier --check --ignore-unknown scripts/build-fan-model.py scripts/verify-fan-glb.cjs scripts/build-led-shape-models.py scripts/verify-led-shapes-glb.cjs src/lib/shared/3d/domain/build-for-effect.ts src/lib/shared/3d/domain/scene-prop-catalog.ts src/lib/shared/3d/domain/fan-appearance.ts src/lib/shared/3d/domain/astral-fan-geometry.ts src/lib/shared/3d/domain/manufactured-shape-geometry.ts src/lib/shared/3d/domain/led-prop-builds.test.ts src/lib/shared/3d/effects/prop-build-tip-geometry-3d.ts src/lib/shared/3d/effects/led/astral-fan-led-renderer-3d.ts src/lib/shared/3d/effects/led/manufactured-shape-led-renderer-3d.ts docs/reports/swarm-2026-10-14/led-models.md
node --check scripts/verify-led-shapes-glb.cjs
node --check scripts/verify-fan-glb.cjs
python -c "import ast,pathlib; [ast.parse(pathlib.Path(p).read_text()) for p in ['scripts/build-fan-model.py','scripts/build-led-shape-models.py']]; print('PYTHON_AST=PASS (2 scripts)')"
python scripts/build-led-shape-models.py --layout-json | python -c "import json,sys; print({k:len(v) for k,v in json.load(sys.stdin).items()})"
git diff --check
```

Observation: `--ignore-unknown` lets Prettier check all supported changed files in one command; it has no Python parser here. Python AST parsing covers both scripts. Final focused rerun, lint, formatting, and source-commit evidence are recorded at the end after those commands finish.

Observation: `node scripts/verify-fan-glb.cjs` ran without Blender, exited 1, and reported `Error: Required node is missing: Fan_Astral`. The verifier has no separate dry mode. `node scripts/verify-led-shapes-glb.cjs` exited 1 with `Error: led-shapes.glb is missing`. These are asset-generation blockers, not passing model checks. Neither error was bypassed. Earlier syntax checks exited 0 and Python printed `PYTHON_AST=PASS (2 scripts)`; the layout command printed `{'triquetra': 60, 'triquetra2': 60, 'triangle': 48, 'triangle_side': 48}`.

## Left behind from the WIP

Observation: no binaries or images were copied. `fan.glb`, `led-shapes.glb`, Astral SVG, and preview images are reproducible/generated review inputs and remain outside this source-only port.

Observation: `patches/**` and `pnpm-lock.yaml` were untouched. The old package dispatch/geometry is superseded by current Triangle work and must be reconciled at its current owner. The WIP SVG recoloring change duplicates current Triangle support and was not restored.

Observation: old Triangle registries, classification, profile/gamification lists, codecs, and placement artwork were not restored. `ScenePropPicker`, app settings/state, sequence-viewer wiring, effect orchestrator, and capture route were left unchanged because they expose or persist unfinished builds and are outside the owned paths. Old shape anchors that overwrote all Triangle/triquetra tips were not copied. Current Triangle grips/tips remain owned by the existing geometry bridge.

Observation: fan normalization lives in a new internal 3D module because editing the public pictograph list would expose Astral to settings/codecs before approval. This is the scoped adaptation of the WIP fan-appearance delta. Triangle uses today's 22-inch bowed station geometry rather than the WIP's rounded 15-inch triangle. Manufactured triquetras keep today's armpit/tip meanings, with pivots calculated from the new trefoil instead of the WIP's arbitrary offsets.

## Final evidence

Observation: the final source review adjusted Triangle's optical face offset to its current tube radius plus 1.5 mm (`0.0094375` m); triquetra keeps `0.016` m. Tests pin the resulting transformed positions for each grip. Both new renderers dispose their instanced mesh resources as well as geometry/materials; the lifecycle test checks instance disposal.

Observation: the final focused rerun exited 0 with `Test Files  1 passed (1)` and `Tests  11 passed (11)`. The final ESLint command above exited 0 with no output, errors, or warnings. Both `node --check` commands exited 0. Python AST parsing printed `PYTHON_AST=PASS (2 scripts)`, and the final layout-count command printed `{'triquetra': 60, 'triquetra2': 60, 'triangle': 48, 'triangle_side': 48}`. `git diff --check` exited 0; Git reported only CRLF-to-LF normalization advice for the fan builder.

Observation: the all-file Prettier command above exited 0 with `All matched files use Prettier code style!`. No Python formatting claim is made. Both GLB verifier failures remain unresolved until asset generation, as recorded above.

Observation: source commit `755a6e546de9e5a478911da3624411c3332bce74`, `feat(3d): port hidden Astral fan and manufactured tubing sources`, contains exactly 13 source/test paths (`13 files changed, 1889 insertions(+), 4 deletions(-)`). `git diff --cached --check` passed before that commit. The final lint rerun after renderer disposal changes exited 0 without warnings. The final test rerun reported 11 passing tests. After the source commit, `git status --short` listed only this untracked ledger. This ledger is committed separately; no integration into main was attempted under the worker boundary.

Observation: ledger-only follow-up verification uses `npx prettier --check docs/reports/swarm-2026-10-14/led-models.md`. The worker's final response records its result and the final clean status after committing this ledger.
