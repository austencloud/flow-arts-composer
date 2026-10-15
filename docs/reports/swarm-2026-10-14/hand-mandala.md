# Bare-hand mandala port

Date: 2026-10-14. Verdict: **PORTED**.

## Observations and evidence

- Worktree: `E:/worktrees/tka-platform/swarm-hand-mandala`; branch: `codex/swarm-hand-mandala`. Initial `git status --short` was empty. Starting HEAD: `bf75223ef6dfface699d2d7fbcbfd4062b396c2c`.
- Read `mcp-server/AGENTS.md` before inspecting position behavior. Position statements below come from source and tests, not inferred TKA rules.
- `git show codex/hand-mandala-card` identifies `855e615cb41e850f15e6c21629355ca043de4a51`, 2026-09-14, `fix: trace bare hands in mandalas`. Ignoring whitespace, its behavior change returns one `{ dx: 0, dy: 0 }` offset for `hand`. Its test requests baseline BOTH_ENDS and expects one path per hand. The remaining source diff is formatting.
- At the first comparison, local main was `a2d45bf8a881808c814da40da4cc41fa67fde119`. `git diff main --` the preparer, alignment test, prop-tip registry, trail-point resolver and prop-end classifier produced no output before edits. Thus the failing regression exercised those current main files in this worktree. Main subsequently advanced to `5d89e19923a0c5ba4d6d49e5826d06b9dece4f91`; its geometry calculator and prop-position calculator also had no differences from this worktree when checked. No integration was attempted.
- `src/lib/shared/animation-engine/domain/types/prop-tip-points.ts` maps `hand` to `EMPTY_TIP_POINTS`. `getDefaultTrailPointConfig` in `trail-point-types.ts` disables both sources when that array is empty. Before this port, `resolveMandalaTipOffsets` therefore returned `[]` in BOTH_ENDS mode. Explicit HAND tracking already resolved the center; selecting the bare-hand prop with BOTH_ENDS did not.
- `src/lib/shared/animation-engine/services/prop-position-calculator.ts`, `calculatePropEndpoint` and `calculatePropEndpoints`, already special-case `hand` to the rendered center. `mandala-geometry-calculator.ts`, `computeTipPosition`, adds the rotated local offset to the hand position, so a zero offset follows that same center.
- `SequenceMandala.svelte:196` uses baseline BOTH_ENDS. `MandalaPathPreparer.prepare` uses effective offsets and the current render keys. The port adds only the hand special case before the existing resolver. Chirality mirroring, render-key selection, overrides, and prop-held endpoint selection remain in their existing paths.

## Main history examined

Ran the requested history query:

```powershell
git log main --since=2026-09-14 --format="%h %ad %s" --date=short -- src/lib/shared/mandala/services/mandala-path-preparer.ts tests/unit/mandala-overlay-prop-alignment.test.ts
```

It returned `a97b743f05`, `d499b7c41a`, and `c4a5a03e9c`. Also read the patches for every commit returned for the preparer and its direct prop-tip authorities (`prop-tip-points.ts`, `trail-point-types.ts`, `prop-tip-ends.ts`) in that date range. Read the two merge commits with `git show --cc`; neither showed a combined conflict-resolution diff for these paths. Checked the prop-position calculator's history too; it adds only the already listed migration and chirality commits.

| SHA                                        | Date       | Subject                                                                                | Relevant observation                                                                                                        |
| ------------------------------------------ | ---------- | -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `a97b743f05609148905e69f5ae7500c153ba7692` | 2026-10-10 | feat: migrate to SvelteKit 3, Vite 8 and TypeScript 6                                  | Imports migrate to `#lib` and `.js`; preserve these imports.                                                                |
| `f69515d340009d566e25189632a5357198fa275c` | 2026-10-07 | feat(props): straighten the Energy Saber and Energy Staff blades                       | Tip-table commentary changes; no hand routing.                                                                              |
| `c05468dbf45ce8ecfcd82517342b42089cfd8bb4` | 2026-10-07 | feat(props): redraw Energy Saber and Energy Staff as curved energy katanas             | Tip-table commentary changes; no hand routing.                                                                              |
| `646b7a7b5f91c39f6199c42f41ecaff35aa77b49` | 2026-10-06 | fix(props): drop duplicate V2 captures and rename Staff V2 to Capped Staff             | Narrows staff model orientation exceptions.                                                                                 |
| `23886259969d3e96f8b5f32f69b41f290c42a0d8` | 2026-10-06 | feat(props): stick prop in the picker, 2D and 3D                                       | Adds stick to staff tip table and two-ended classification.                                                                 |
| `081a5c7e86c42acf568c299dec709221a7583457` | 2026-10-05 | fix: align triangle model grips and effect tips                                        | Derives triangle model points from canonical generated geometry.                                                            |
| `05d2b622d4ed07f20339c65d28250b8213b19530` | 2026-10-04 | fix(animation): set conjoined grids half a staff apart                                 | Extracts staff reach constant; preserves tip values.                                                                        |
| `51c6225f15fc773c32cdeee0fe4a129ae7e91128` | 2026-09-27 | feat(pictograph): draw the chosen triangle grip on pictographs and cards               | Model orientation lookup also consults render-key tables.                                                                   |
| `4a9c0253f07a7d4628f3eaf6e5f6a0abee7f5141` | 2026-09-27 | fix(assemble): match the grid's prop look and turn Realistic staffs to their thumb end | Adds explicit staff model orientation exceptions.                                                                           |
| `b8b328072b066bf16e66d62cd8aec42049a53459` | 2026-09-25 | Merge Composer fusion into consolidation branch                                        | No combined diff for inspected prop-tip authorities.                                                                        |
| `d499b7c41a8e577c1bc0637b03b9883a9a7ea2f5` | 2026-09-22 | Tip points follow the drawn artwork for triad models and fan builds                    | Preparer resolves loaded render keys; endpoint classifier and overrides understand render keys; model orientation improves. |
| `952888d2acec4eef51c11c3402fbea0726d2acb2` | 2026-09-18 | Merge branch 'main' into codex/triangle-hoop-family                                    | No combined diff for inspected prop-tip authorities.                                                                        |
| `e9af5a669aa6490db5600ba54dec6163fe6b8aee` | 2026-09-18 | fix(props): map the triangle side sprite key back to its PropType                      | Inspected registry patch only relocates source-of-truth comments.                                                           |
| `e7db996d412e41864082492480f77131c116b1f4` | 2026-09-18 | feat(props): triangle grip appearance, render keys, boxes and tip points               | Adds generated hoop/triangle points and side-grip render-key entries.                                                       |
| `75e5048011ab14d763c3582589a83e4219365704` | 2026-09-18 | feat(props): add Renegade Juggling star fans in 2D and 3D                              | Adds star fan build points.                                                                                                 |
| `c4a5a03e9c3f67ea3036d09eb3f34857dcaef182` | 2026-09-17 | fix(effects): mirror tip points for chirality-B buugeng-family props                   | Mirrors local dx for flipped props in endpoint and mandala calculations.                                                    |
| `887f92af0971575c743b08728bc62eb7aa0396f9` | 2026-09-15 | fix(effects): resolve tip points per render key and keep fire caches honest            | Adds render-key tables, model-derived tips and lookup precedence.                                                           |

Inference: none of these later changes supplies the missing bare-hand center offset for BOTH_ENDS. The failing tests confirm that the old behavior fix is still needed.

## Regression and verification

The two added cases use the branch's static-east fixture, request BOTH_ENDS for `PropType.HAND`, and cover both baseline card geometry and effective animation geometry. They require exactly one zero offset and one path for each hand. They additionally check that each path begins at the east hand center after applying the engine scale: x equals `ENGINE_GRID_RADIUS`, y equals zero.

Before the source fix:

```text
npx vitest run --config tests/config/vitest.config.ts tests/unit/mandala-overlay-prop-alignment.test.ts -t "traces bare hands"
AssertionError: expected [] to deeply equal [ { dx: +0, dy: +0 } ]
Test Files  1 failed (1)
Tests  2 failed | 8 skipped (10)
```

After the source fix, root-level mandala test files, including the capitalized `MandalaGeometryCalculator.test.ts`, were selected case-insensitively:

```powershell
$mandalaFiles = @(Get-ChildItem tests/unit -File | Where-Object { $_.Name -match "^mandala.*\.test\.ts$" } | Sort-Object Name | ForEach-Object { "tests/unit/$($_.Name)" })
npx vitest run --config tests/config/vitest.config.ts $mandalaFiles
```

```text
Test Files  18 passed (18)
Tests  118 passed (118)
Duration  10.15s
```

The five matching files in subdirectories were then run too:

```powershell
$nestedMandalaFiles = @(Get-ChildItem tests/unit -Recurse -File | Where-Object { $_.DirectoryName -ne (Resolve-Path tests/unit).Path -and $_.Name -match "^mandala.*\.test\.ts$" } | Sort-Object FullName | ForEach-Object { [IO.Path]::GetRelativePath((Get-Location).Path, $_.FullName).Replace("\", "/") })
$nestedMandalaFiles
npx vitest run --config tests/config/vitest.config.ts $nestedMandalaFiles
```

```text
tests/unit/animation-engine/mandala-guide-tip-parity.test.ts
tests/unit/animation-engine/mandala-overlay-attachment.test.ts
tests/unit/shape-matrix/mandala-guide-reveal-frame.test.ts
tests/unit/sticker-lab/mandala-paths-cache.test.ts
tests/unit/sticker-lab/mandala-primitive-reference.test.ts
Test Files  5 passed (5)
Tests  26 passed (26)
Duration  13.19s
```

Combined result: 23 files and 144 tests passed, including the existing prop-alignment and newer guide-tip parity tests.

```text
npx eslint src/lib/shared/mandala/services/mandala-path-preparer.ts tests/unit/mandala-overlay-prop-alignment.test.ts
0 errors, 1 warning; exit 0
Warning: test file ignored by a matching ignore pattern.

npx prettier --check src/lib/shared/mandala/services/mandala-path-preparer.ts tests/unit/mandala-overlay-prop-alignment.test.ts
Checking formatting...
All matched files use Prettier code style!
```

The ESLint warning prompted a separate `npx eslint --no-ignore tests/unit/mandala-overlay-prop-alignment.test.ts`. It exited 1 with `Parsing error: "parserOptions.project" has been provided for @typescript-eslint/parser. The file was not found in any of the provided project(s)`. The repository's `tsconfig.json` includes only `src/**`. The following invocation used the parser's default-project support and passed with no output (exit 0); repository lint configuration was not changed:

```powershell
npx eslint --no-ignore --parser-options 'project:false,projectService:{allowDefaultProject:[tests/unit/mandala-overlay-prop-alignment.test.ts]}' tests/unit/mandala-overlay-prop-alignment.test.ts
```

Final formatting and whitespace checks:

```text
npx prettier --check src/lib/shared/mandala/services/mandala-path-preparer.ts tests/unit/mandala-overlay-prop-alignment.test.ts docs/reports/swarm-2026-10-14/hand-mandala.md
Checking formatting...
All matched files use Prettier code style!

git diff --check
No output; exit 0.
```

## LOOK CHECK

Proposal, not performed: open the Create sequence workspace and its animation viewer, set both props to Hand, enable the mandala display, and use the moving `zeroTurnAntiStep()` fixture from `tests/unit/mandala-overlay-prop-alignment.test.ts` (left anti motion from west to north, zero turns, counterclockwise rotation, in to out). The fixture is a concrete source-defined motion; no saved sequence ID has been established. The Create workspace's `WorkspaceGrid.svelte:849` mounts `SequenceMandala` with the selected prop types. Before the port its hand mandala resolves no paths. Afterward it should trace the hand center from west to north; the live viewer's mandala should align with the rendered hand. Compare with staff/fan artwork to confirm their tip paths retain their prior behavior. The existing static-east fixture gives an additional point-alignment check without movement.

No browser or dev server was used, as requested. Visual acceptance remains for the coordinator. No changes outside the owned paths, no integration, no push, and no external mutations were performed. Needs Austen: none. No out-of-scope changes are proposed.
