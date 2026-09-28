# Earth Root Observatory Opus Review — Handoff (2026-08-08)

## Mission

Conduct an independent Opus 5 review of the Earth room and the repository-level museum scene-production process. Start from the player experience, not from the existing solution. The current concept is the **Root Observatory**: a lush cavern around a tree that has broken through the ceiling, with three performers running the exact GGGG, HHHH, and IIII museum loops around a horseshoe visitor route. The current proposal may be kept, restructured, or discarded. Determine what the ideal Fire-to-Earth-to-Air experience should be, whether Root Observatory reaches that ideal, and how the best concept should be implemented through the approval gates. The governing scene spec is [earth-root-observatory-production-contract.md](earth-root-observatory/earth-root-observatory-production-contract.md), but its current creative solution is evidence, not an answer.

The independent-review ledger at `.agents/skills/museum-scene-production/references/process-review-ledger.md` is binding. During this review, do not edit the Earth scene, the production skill, its validator, or its templates. Write the review to `.agents/skills/museum-scene-production/references/reviews/2026-08-08-opus.md`, then update only the Opus row in the ledger to `complete` with that link.

## Done — verified

- The repository-level museum scene-production workflow is committed at `d51962eaffcc0c039e7c7bcd663d189c7cf36774` (`feat(skills): add museum scene production workflow`). Its current validator accepts the Earth evidence index: `node .agents/skills/museum-scene-production/scripts/validate-scene-gates.mjs docs/superpowers/specs/earth-root-observatory/scene-gates.json` returned `PASS: earth-root-observatory gate manifest is valid` on 2026-08-08.
- First Fire is the reference case for a successful Blender-led room. Its current benchmark artifacts trace to commit `d13f0bce42a22bef815c45023c3d349229c54ee9` (`feat(museum): add First Fire runtime flame review`). Read the design, floor plan, handoff, Blender plan, runtime scene, and tests listed below before judging whether Earth is at the same standard.

## Believed done — unverified

- No Earth creative gate is complete. Gate 1.1 is `ready-for-review`, not approved. Its measured amendment has automated proof, but Austen has not completed the required spatial-comprehension check.
- The current Root Observatory graybox is rejected evidence. It is useful for diagnosis, not a valid base for assuming the concept should survive.
- The G performer body-follow defect is identified but not fixed: shoulders, torso, and head do not reliably follow the active hand side, and an arm can penetrate the torso. This is shared avatar behavior, not an Earth-only animation problem.

## In flight

All Earth implementation and evidence files are uncommitted in the shared `main` checkout at `E:\tka-platform`. Do not revert, stage, or commit them during the review. Other agents have unrelated work in the same dirty tree.

### Current creative and gate evidence

- `docs/superpowers/specs/earth-root-observatory/earth-root-observatory-production-contract.md`
- `docs/superpowers/specs/earth-root-observatory/scene-gates.json`
- `docs/superpowers/specs/earth-root-observatory/earth-root-observatory-gate1-board.svg`
- `docs/superpowers/specs/earth-root-observatory/earth-root-observatory-gate1-report.json`
- `docs/superpowers/specs/earth-root-observatory/earth-root-observatory-gate1-amendment-board.svg`
- `docs/superpowers/specs/earth-root-observatory/earth-root-observatory-gate1-amendment-report.json`
- `docs/superpowers/specs/earth-root-observatory/earth-root-observatory-gate2-contact-sheet.png`
- `docs/superpowers/specs/earth-root-observatory/earth-root-observatory-gate2-report.json`
- `docs/superpowers/specs/earth-root-observatory/gate2-renders/`

Current artifact fingerprints:

- Gate 1.1 SVG: `F8F30C1601D0A27F6A37BEE526100C833F442C81C11DB12A2E83CF4201CDFBCE`
- Gate 1.1 report: `8314CAEDA5256326A73648E3BB69553B813AA98AB46D5A33BA0DA0444D93D9F5`
- Gate ledger: `F35B400B062A855E300D14322B41B1D79EEBB575F9E33641AAE9AC8864838013`
- Rejected Gate 2 GLB: `F2C9B0DA02FDA885461346E5340A13161C5D01F3F085E9B83851E0194EA97599`

### Current geometry, Blender, and runtime implementation

- `src/lib/features/museum/data/earth-root-observatory-plan.ts`
- `src/lib/features/museum/data/earth-root-observatory-blender-contract.ts`
- `src/lib/features/museum/data/earth-root-observatory-graybox-terrain.ts`
- `scripts/export-earth-root-observatory-blender-plan.ts`
- `scripts/build-earth-root-observatory-graybox.py`
- `scripts/optimize-earth-root-observatory-glb.mjs`
- `scripts/verify-earth-root-observatory-glb.mjs`
- `static/models/museum/cave/earth-root-observatory-graybox.glb`
- `src/routes/test/earth-root-observatory-graybox/+page.svelte`
- `src/routes/test/earth-root-observatory-graybox/EarthRootObservatoryWalkScene.svelte`
- `src/routes/test/earth-root-observatory-gate1-amendment/+page.svelte`
- `src/lib/features/museum/components/game/MuseumPerformerStation3D.svelte`
- `packages/camera-3d/src/lib/components/UnifiedCameraController.svelte`
- `tests/unit/museum/earth-root-observatory-plan.test.ts`
- `tests/unit/museum/earth-root-observatory-blender-contract.test.ts`

Focused verification on 2026-08-08:

```text
pnpm exec vitest run --config tests/config/vitest.config.ts \
  tests/unit/museum/earth-root-observatory-plan.test.ts \
  tests/unit/museum/earth-root-observatory-blender-contract.test.ts

2 test files passed; 12 tests passed.
```

The live routes were HTTP 200 at handoff time:

- `https://localhost:5175/test/earth-root-observatory-gate1-amendment`
- `https://localhost:5175/test/earth-root-observatory-graybox`

Use the persistent Chrome DevTools workflow if available. If live visual inspection is unavailable, inspect the board PNG/SVG, Gate 2 contact sheet, individual Gate 2 renders, GLB, and source.

### First Fire benchmark

- `docs/superpowers/specs/2026-08-06-first-fire-torch-procession-design.md`
- `docs/superpowers/specs/2026-08-06-first-fire-torch-procession-floor-plan.svg`
- `docs/superpowers/specs/2026-08-06-first-fire-torch-procession-handoff.md`
- `docs/superpowers/specs/2026-08-06-first-fire-blender-plan.json`
- `docs/superpowers/specs/2026-08-06-first-fire-graybox-review.webp`
- `scripts/build-first-fire-graybox.py`
- `scripts/export-first-fire-blender-plan.ts`
- `src/routes/test/first-fire-graybox/`
- `src/lib/features/museum/data/first-fire-procession-plan.ts`
- `src/lib/features/museum/data/first-fire-blender-contract.ts`
- `tests/unit/museum/first-fire-procession-plan.test.ts`
- `tests/unit/museum/first-fire-blender-contract.test.ts`

### Process package under review

Read every file, including assets and validator source:

- `.agents/skills/museum-scene-production/SKILL.md`
- `.agents/skills/museum-scene-production/references/process-review-ledger.md`
- `.agents/skills/museum-scene-production/references/gate-contracts.md`
- `.agents/skills/museum-scene-production/references/visual-bridge.md`
- `.agents/skills/museum-scene-production/assets/scene-development-template.md`
- `.agents/skills/museum-scene-production/assets/scene-gates.template.json`
- `.agents/skills/museum-scene-production/scripts/validate-scene-gates.mjs`

Also load the museum tracker first, read its ten newest decisions, then read `E:/flow-arts-private/museum/story-bible.md`. Tracker decisions supersede stale design prose. Recheck G, H, and I through Flow Arts MCP rather than trusting prior descriptions.

## Loose ends (ranked)

1. **Write the independent Opus verdict.** Define the ideal Earth-room experience from first principles. Address the arrival from Fire, emotional reset, hero, route, three-performer staging, G/H/I environmental translation, visitor interaction, climax, final ensemble view, and transition to Air.
2. **Decide whether Root Observatory deserves to survive.** Use one of `keep`, `restructure`, or `replace`, with a direct rationale. If replacing it, provide a new concept with enough measured spatial logic and implementation architecture to enter Gate 1. If restructuring it, identify which underlying assumptions must change rather than merely moving objects.
3. **Audit implementation fitness.** Evaluate the plan contract, Blender derivation, GLB pipeline, Three.js runtime, performer integration, camera/route logic, environmental response design, tests, and the separation of shared versus scene-specific behavior.
4. **Audit the production workflow.** Follow every required point in the process-review ledger. Identify missing gates, slop paths, bypassable validator rules, costly ceremony, and the strongest counterargument to gated production.
5. **Design a combined-agent workflow.** Recommend where Opus, Fable, Codex, Blender, deterministic code, and Austen's approval each belong. Assign work by demonstrated strength, not model branding. Explain what evidence would justify changing ownership.
6. **Write only the review artifact and ledger row.** Do not implement the recommended room or edit the workflow during this independent pass.

## Decisions already made

- 2026-08-08: Austen corrected the cave roster: every elemental mode room contains exactly three performers. Fire is not an exception. Tracker `fsJqYPYkMjY2BESGuIBC`.
- 2026-08-08: Major museum rooms use the repository gate process, beginning with a measured floor plan and requiring explicit human approval at Gates 1 through 6. Tracker `jjjRDt6uwrzf9pBOFD3C`.
- 2026-08-08: The first Earth Gate 1 plan was approved with “Love it. Gate passed,” then invalidated by later free-walk evidence. Tracker `aN8CmfibQLjWC24E0lmJ`, contradicted by `s278g83rbcQybhjZnIfO`.
- 2026-08-08: Real GGGG, HHHH, and IIII performers must be used in the graybox. Primitive mannequins are not acceptable. Tracker `zf0pfUAmW4ODnjFJnep5`.
- 2026-08-08: The ring, petal, and hybrid motifs must be flat avatar-supporting stage surfaces. Tracker `LUF8Uggz1uwbBrmvhOQp`.
- 2026-08-08: H and I must remain readable below and away from the horseshoe route while the visitor moves. Tracker `s278g83rbcQybhjZnIfO`.
- 2026-08-08: The basin needs vegetation and root massing that shapes negative space without blocking performers or the ensemble. Tracker `2VNrQh8GQClDvq9r9wXp`.
- 2026-08-08: Remove duplicate click-to-look UI from the Earth review. Fixed stops remain usable in the in-app review; free walking belongs in Chrome. Tracker `lbzhhpX5y3UXsXU2jy3B`.
- 2026-08-08: Performer shoulders, torso, and head should follow the active hand side, with no arm penetration. This belongs to the shared avatar system. Tracker `WWXT4vkB3zd3AQdHt2CO`.
- The measured Gate 1.1 candidate is an agent proposal, not a user decision: tracker `IL6B5Bnwz3moI7ZFFmu3`.

## Gotchas

- The original Gate 1 approval is not current approval. Free walking exposed faults that the fixed board hid.
- Automated ray tests prove only the sampled geometry. They do not prove that the route is emotionally legible, that the performers command attention, or that the visitor understands why the final circle matters.
- The current Gate 1.1 proposal holds G, the tree, and the horseshoe route fixed while moving H and I. That constraint came from the current design, not from Austen. Opus is explicitly authorized to challenge it.
- The board reserves `67.2 m²` of habitat massing, but reservation is not art direction. Density alone can still produce arbitrary foliage or hide the room's visual hierarchy.
- The Root Observatory's retained root traces and canopy recognition are authored metaphors/inventions. Do not present them as literal TKA behavior.
- The current graybox includes real performers, but the shared G rig has a body-follow defect. Do not misdiagnose that as proof that the Earth concept is failing.
- `main` was 23 commits ahead of `origin/main` before this handoff commit, and the shared working tree contains many unrelated edits from other sessions. Commit with explicit pathspecs only.
- Port 5173 is Austen's shared dev server and was unhealthy earlier in the session. Port 5175 is the current Earth review server. Do not stop either server.
- The Fable review remains pending. Do not read or synthesize a Fable artifact during the independent Opus pass.
