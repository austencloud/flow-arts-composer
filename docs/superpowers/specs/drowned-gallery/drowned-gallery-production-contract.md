# Drowned Gallery (Three Channels) production contract — REJECTED

**Status: REJECTED by Austen, 2026-08-09**, after walking the Gate 2 graybox:
*"I think we fucked it up I think we should not have gone for three different
channels to look for I think this is bad I think we need to go back to our
original plan of the grotto in the waterfall with the reflection."*

The scene reverts to **"The Ring" (v2)** — the grotto, the waterfall and the
mirror-pool reflection, with A, B and C staged on the three alcove shelves.
That is the layout of commit `3b946cfae1`, which is restored as the live
Drowned Gallery. Gate 1 is marked rejected in `./scene-gates.json`; gates 2–6
returned to pending. Gate 0's evidence (exact sequences, MCP letter proof)
survives unchanged — those facts are direction-independent.

## Why it failed (keep this; it constrains the next attempt)

Three channels bought interactivity by **splitting the ensemble**. Water's
strongest asset is all three letters legible at once, doubled in still black
water — and the redesign spent exactly that to buy a corridor choice. The
private air-bell audience is a real beat, but it is a beat that hides the other
two performers to deliver, and the Q2 "state swap" needed to un-hide them for
the finale was a mechanism invented to repair damage the layout caused. When a
design needs an automaton teleport to restore the thing it broke, the layout is
wrong. Reflection, not routing, is what Water uniquely visualizes.

Everything below this line documents the rejected direction as-built.

---

**Superseded status (historical):** Gate 1 APPROVED (Austen, 2026-08-09, "I'm in let's do it" —
tracker `kZfilqc0ViZpGR3nPOPU`); Gate 2 playable graybox READY FOR REVIEW.
Approval riders: Q2 = state swap (automatons idle at ring niches, appear in
their bell while visited, return for the finale; one body per letter, finale
complete at any dive count); "three dives" checklist wording must become
choose-one grammar in every Gate 2+ artifact; zero-dive ascent allowed;
30 × 30 m footprint and Earth door shift accepted.

**Scene ID:** `drowned-gallery`

**Gate manifest:** `./scene-gates.json`

**Creative provenance:** design spec
`docs/superpowers/specs/2026-08-09-drowned-gallery-channels-design.md`
(directed by Austen 2026-08-09: "spec it" → "go"); museum tracker item pending
first capture session for this revision.

## Outcome

The visitor chooses ONE flooded channel and earns one private audience — the
letter they picked becomes their personal introduction to Water — then rises
the buoyant shaft to discover all three letters doubled in the mirror pool.
The other two bells stay open as optional dives and replay. One dive is
required; nothing is a checklist (2026-08-09 Codex-review amendment: earn the
room's transformation, not every letter — Fire keeps its full set because its
room state causally requires it). Felt sequence: descent → choice → breath →
weightlessness → reflection.

## Authority ledger

| Concern | Canonical owner | Evidence path | Current conflict |
|---|---|---|---|
| Creative direction | Design spec + this conversation's direction | `../2026-08-09-drowned-gallery-channels-design.md` | Supersedes the 2026-08-02 single S-path gallery; tracker capture pending |
| Story canon | Story bible | `E:/flow-arts-private/museum/story-bible.md` | None known for Water |
| Room shell and transitions | Compiled cave floor plan | `src/lib/features/museum/data/vulcan-cave-floor-plan.ts` | Resolved: gallery grew to 30 × 30 m (Q3); downstream rooms moved — see Gate 1 notes |
| Performer roster | Live museum data | `vulcan-cave-floor-plan.ts` (`cave-water-a/b/c` in the gallery's bells) | None — `CAVE_MODE_ROOMS` / `ROOM_CONTENT` repointed to `cave-water-gallery`, retiring the 2026-08-02 loose end #5 |
| TKA motion | Flow Arts MCP | Calls recorded 2026-08-09 (A, B, C explanations) | None |
| Selected sequences | `museum-exhibit-sequences.ts` | Fingerprints in `./scene-gates.json` | None — exact live loops, MCP-generated 2026-08-02 |
| Spatial geometry | `drowned-gallery-terrain.ts` layout | Revised 2026-08-09 (hub, channels, bells, shaft) | None — S-path retired |
| Blender output | 2026-08-09 pipeline | `scripts/build-drowned-gallery-graybox.py` + manifest | Rebuilds from the revised layout after Gate 1 |
| Runtime behavior | `/test/drowned-gallery-graybox` walk route, then integrated museum | `src/routes/test/drowned-gallery-graybox/` | Buoyant-shaft gravity seam not yet wired |

## Claim ledger

| ID | Class | Statement | Evidence | Status |
|---|---|---|---|---|
| C-001 | literal | Water stages the exact museum sequences AAAA, BBBB, CCCC (`cave-water-seq-a/b/c`), alpha3→alpha3 loops. | `museum-exhibit-sequences.ts` + fingerprints in `scene-gates.json` | verified |
| C-002 | literal | A, B, C are the Split-Same group of Type 1 Dual-Shift: A blue pro/red pro, B anti/anti, C blue anti/red pro (the hybrid). | Flow Arts MCP `get_letter_explanation` A/B/C, 2026-08-09 | verified |
| C-003 | metaphor | Channel length encodes letter order (A shortest → C longest, the hybrid earning the longest dive). | Design spec | proposed |
| C-004 | metaphor | The mirror pool doubling all three performers expresses water showing motion twice. | Design spec; doubled-firelight reflection proven in the 2026-08-02 graybox | proposed |
| C-005 | invention | Private air-bell audiences: surfacing = meeting a letter. | Design spec | proposed |
| C-006 | invention | Buoyant shaft: reduced-gravity water column as the post-dive reward ascent. | Design spec; Moon gravity-scale seam precedent | proposed |
| C-007 | invention | Channel mouths glow with their bell's firelight color through the water. | Design spec | proposed |

## Experience sentence

> The player enters from the Squeeze, wades down the flooded approach until the
> rock closes overhead, chooses one of three dark channel mouths in the drowned
> hub, surfaces into a private air-bell where a single performer plays at arm's
> length, dives back to choose again, rises weightless up a glowing buoyant
> shaft to the grotto ring, watches A, B and C play doubled in the black mirror
> pool, and exits east through the gilded threshold toward Fire.

## Gate 0: Evidence preflight

### Sources and conflicts

- Room shell: `cave-water-approach` (interior 12.75–15.25 × 58.75–70.75),
  `cave-water-gallery` (7.25–20.75 × 29.75–53.75), `cave-water` grotto
  (1.25–26.25 × 2.75–24.75), world metres, from the compiled grid.
- Entry: Squeeze → approach north door. Exit: grotto east door → Fire.
- Performer roster: exactly three — `cave-water-a/b/c`.
- Exact sequences: `cave-water-seq-a/b/c` in `museum-exhibit-sequences.ts`
  (file sha256 `707a7111…ad3843`; per-sequence fingerprints in the manifest).
  MCP-generated 2026-08-02 at score 1.00; re-verified against
  `get_letter_explanation` 2026-08-09 — motion types and rotation directions
  match per letter.
- Production stack: Svelte/Threlte/Three/Rapier; the 2026-08-09 Blender
  graybox pipeline (commit `3b946cfae1`).
- Superseded: the 2026-08-02 single S-path drowned gallery layout. Its shipped
  graybox remains the Gate 2 baseline until the revised layout lands.
- Known conflicts: gallery footprint may need to grow for three bells (moves
  downstream cave rooms — must be settled at Gate 1); shared-avatar rig-space
  body-follow defect must be fixed before close-read judgment at Gate 2;
  stale `CAVE_MODE_ROOMS` entry (cosmetic).

### Live motion proof

MCP calls this session: A = Type 1 Dual-Shift, blue pro, red pro; B = blue
anti, red anti; C = blue anti, red pro; group Split-Same (ABC). The museum
loops are the exact catalog of these letters at four beats each, not newly
generated variants.

## Gate 1: Measured plan — READY FOR REVIEW

Delivered 2026-08-09:

- **Revised layout module** (`drowned-gallery-terrain.ts` v3): drowned hub
  (7.5 × 7.5 m, oculus overhead), three roofed channels (measured runs 7.3 /
  10.3 / 13.3 m, A < B < C), three 6 × 5 m air-bells (dry deck at new datum
  `BELL_FLOOR_Y = -1.2`, water margin, performer shelf at `SHELF_Y`, 3 m
  ceiling), drowned shaft passage under the north door, buoyant shaft column
  (2.5 m sq) through a rimmed hole in the grotto apron. Grotto ring, mirror
  pool, waterfall, gilded threshold, all datums, and the elevationAt/blockedAt
  contract carry forward (uncovered bay points still throw).
- **Plan board + report**: `./drowned-gallery-gate1-board.svg` (top-down plan,
  two developed long sections — dive and rise, 11-stop route strip staged as
  ONE choice + optional dives per the 2026-08-09 one-dive amendment, sightline
  rays, final-frame wedge) and `./drowned-gallery-gate1-report.json`
  (walkability / clearance / sightlines / final-view, all passed). Sightlines
  follow the Earth Gate 1.1 standard: 7 moving route-sampled windows per bell
  aimed at the performer floor; all clear; all 6 bell↔bell cross-sightlines
  blocked by rock.
- **Performer anchors moved**: `cave-water-a/b/c` now stage one-per-bell on the
  bell shelves (shared `BELL_SHELF_ANCHORS_M` expression; the grotto holds no
  anchors). `CAVE_MODE_ROOMS` and `ROOM_CONTENT` follow, which also retires
  the stale-entry loose end from 2026-08-02.
- **Open questions resolved at Gate 1** (recorded in the report): Q1 — one
  shared column entered from the HUB's fifth opening; every bell reaches it
  through the hub after any single dive, so ONE dive completes the route and
  nothing is gated (amendment-compliant; per-bell feeders rejected because the
  spec pins the gravity seam to one bounded column with one entrance and one
  exit, and three feeders braid the map). Q3 — the gallery footprint GROWS to
  30 × 30 m. Q4 — falling into the shaft is safe-and-floaty (rim = rendered
  curb). Q2 (ring finale staging) is PROPOSED as restaging A/B/C on the kept
  ring niches — needs Austen's call at review.
- **Downstream movement (Q3 consequence)**: every room placed after the
  gallery moved (Earth's south door shifted +2.5 m). Earth-canyon Blender
  manifest regenerated; earth-long-terrace pinned span updated; downstream
  grayboxes built from pre-move manifests need re-verification at their own
  gates. Full museum unit suite green (402 tests).
- **Traversal proof**: `drowned-gallery-traversal.test.ts` proves the
  one-dive route for EACH bell (single bell → shaft bottom), plus the full
  three-bell coverage walk, then (Gate 2 gravity seam) apron → ring → Fire
  door; 34 drowned-gallery tests pass.
- **Blender manifest regenerated** from the revised layout (source digest
  `3c39e4cf…b7f0db`); the graybox rebuild itself is Gate 2.

## Gate 2: Playable graybox — READY FOR REVIEW

Delivered 2026-08-09 (choose-one grammar throughout):

- Blender build extended for v3: drowned hub with oculus, three channels with
  per-letter firelight mouth frames (A amber, B coral, C gold), three air-bells
  with shelf stages, firelight panels, and locators at BOTH state-swap poles
  (`LOC_Bell_*` and `LOC_Niche_*`), rendered shaft rim curb, glowworm-lined
  buoyant column, 9 QA cameras. Optimized GLB 129.5 KB, gltf-validator clean,
  sequence-parity metadata (performer/sequence ids + layout digest) stamped in
  asset extras.
- Walk route updated: colliders from the v3 layout (bell margins/shelves
  barriered), layout-aware location labels, per-bell shelf lights, and the
  buoyant-shaft float wired through UCC's LiftingPhysicsProvider seam
  (2.4 m/s lift inside the column, cut above the rim so the player crests and
  lands on the apron).
- Evidence + checks recorded in `./scene-gates.json` (validator PASS);
  contact sheet at `./drowned-gallery-gate2-contact-sheet.png`.
- Awaiting Austen's first-person walk: the choice at the hub, the surfacing
  beat in a bell, the float, and the doubled finale are the judgment calls.

## Gates 3–6

Pending Gate 2 approval.
