---
status: backlog
value: 3
effort: L
remaining: Get Austen's eye-level approval of the water-room graybox, then build shell/water, inhabitants, and exhibit polish through their gates.
depends_on: 'external: Austen eye-level graybox approval'
plan_path: ''
tags: []
last_triaged: '2026-10-07'
work_state: blocked
---

# The Drowned Gallery — Vulcan Cave Water Room Design

- **Date:** 2026-08-02
- **Status:** Approved concept + floor plan (Austen, 2026-08-02). Graybox phase authorized as the next build step; art phases gated on graybox approval.
- **Supersedes:** the rejected 6×6 `cave-water` chamber (see exhibit-scale rebuild handoff)
- **Parent docs:** `docs/superpowers/specs/2026-08-02-vulcan-cave-exhibit-scale-rebuild-handoff.md` (spatial program, rubric, decisions), `docs/superpowers/specs/2026-08-02-rules-modernization-and-cave-kickoff-handoff.md`
- **Floor plan sheet:** `static/sketches/2026-08-02-drowned-gallery-plan.html` (served at `/sketches/2026-08-02-drowned-gallery-plan.html`) — plan + longitudinal section + dimension table. That sheet is the geometry reference; this doc does not restate every number.

## Concept

One sentence: the visitor enters the Water chamber *through the water* — a
flooded passage (sump) that submerges them completely — and surfaces into a
monumental grotto where a waterfall, a black mirror pool, and a glowworm
ceiling frame three prehistoric automatons performing A, B, C in gated
waterline alcoves across the pool.

Cave-native water only. No reef, no coral, no tropical species dressing. The
water phenomena are all things real caves do: sumps, underground waterfalls,
mirror pools, drip rain, mist, bioluminescence. The ocean scene contributes
**systems** (shaders, boids, audio engine), never its biome.

## Why the visitor goes through the water (story rationale)

Raised by Austen at floor-plan review: "what was the point of them having gone
through all of that water?" Three answers, all load-bearing:

1. **It earns the reveal.** Compression before release is the oldest trick in
   cave architecture — Lascaux and Chauvet both hide their great chambers
   behind constricted, disorienting passages, and the replicas (Lascaux IV,
   Chauvet 2, Cosquer) reproduce the constriction deliberately because the
   chamber does not land without it. The sump is the compression. Ten meters
   of muffled, blue, slow-moving world make the grotto's 21 m dome and
   waterfall hit like a curtain rising.
2. **You feel the element before you meet its letters.** The room's pedagogy
   is A, B, C — but the room's *subject* is water as a medium. In the sump the
   visitor personally experiences what the mode feels like: resistance,
   refraction, muffled sound, light arriving bent. Then they surface and watch
   three practitioners translate that same quality into motion. Feel the
   element first-person → read the element performed. Every mode room can
   follow this grammar (Fire's heat-shimmer approach, Air's wind gallery...).
3. **In fiction, the water guarded the sanctuary.** Real painted caves put
   their art behind the hardest passages — difficulty of access is part of why
   the art is where it is. The Order's recreation honors that: the prehistoric
   practitioners reached this grotto by swimming the sump, and the museum
   makes every visitor retrace the initiates' path. The journey is the first
   exhibit.

**Foreshadow flourish (approved-pending-graybox):** faint carvings of the A, B,
C pictographs on the sump walls, legible only in the moving caustic light —
the visitor sees the writing before they meet the writers.

## Spatial program (reference: the floor plan sheet)

Nine stations: (1) descending approach from the Squeeze, sound-first; (2) the
sump, ~10 m fully submerged, floor −2.6 m, ceiling −0.4 m; (3) surfacing
steps — the reveal frame; (4) raised causeway (+1.2 m) with three overlooks;
(5) waterfall, ~10.5 m drop from a sunlit crack, god rays + faint rainbow in
mist; (6) mirror pool (~19 × 12 m, −3.5 m) under a glowworm dome (~11 m);
(7) three habitat alcoves in procession at the far waterline — A, B, C — rock
fins between them so each reads solo; (8) barred museum gate at the causeway's
north dead-end beside alcove C (the one close view, ~5 m); (9) dry ascending
exit toward Fire.

Grotto ≈ 24.8 × 21.5 m; full bay ≈ 47 × 29 m including approach/sump/exit.
Deliberately above the handoff's starting envelope; room streaming already
loads per-room. This sets the scale bar for the other five rooms **only after
Austen approves it at eye level** (graybox gate).

Four spatial layers per the rebuild handoff, mapped: approach/occlusion =
stations 1–3; public interpretation apron = causeway + overlooks; gate =
balustrade + barred gate + 13 m of open water; recessed habitat = the alcoves.

## Pedagogy

- **Roster source:** the cave's performers are the **19 base sequences** —
  founding smart collection "TKA 1: Learning Letters"
  (`src/lib/features/browse/collections/config/founding-collections.ts`), "the
  19 base T&D motions — no turns." One caveman automaton per sequence across
  the six rooms. Water takes **A, B, C** (Austen, 2026-08-02).
- **MCP-verified letter facts (2026-08-02):** A, B, C are Type 1 (dual-shift),
  same hand path. A = blue pro / red pro. B = blue anti / red anti. C = blue
  anti / red pro. The procession teaches by comparison: one motion, prop
  rotation as the only variable.
- **Full 19-performer roster (resolved 2026-08-02 from the canonical T&D base
  catalog, `static/data/hero/tnd-base-words.json` / `TND_BASE_CATALOG_ID =
  "l1-tnd-motions"`, families per `tnd-element.ts`):** Water (Split-Same):
  AAAA, BBBB, CCCC · Fire (Split-Opp): JDJD, KEKE, LFLF · Earth (Tog-Same):
  GGGG, HHHH, IIII · Air (Tog-Opp): DJDJ, EKEK, FLFL · Sun (Quarter-Same):
  SSSS, TTTT, UUUU, VVVV (**four** alcoves) · Moon (Quarter-Opp): MPMP, NQNQ,
  OROR (the catalog's PMPM/QNQN/RORO entries are phase-duplicates and do not
  get their own performers). Total 3+3+3+3+4+3 = 19, matching the founding
  collection count. This agrees with `CAVE_MODE_ROOMS`' category labels
  (SS/SO/TS/TO/QS/QO) and with both of Austen's stated examples. Fire and Air
  share letters with opposite timing — an intentional narrative echo to use
  when those rooms are designed. Spot-verify each room's letters via MCP at
  that room's spec time.
- **Display, two layers:** in-fiction cave art = glowing painted pictograph
  diagrams behind each performer (pre-alphabetic — no Latin letters on rock,
  per standing cave decision). Museum voice = overlook plaques (existing
  plaque system, which already composites pictograph bitmaps) may name the
  letters. Plaque copy is a Phase 4 concern and follows the writing guide.

## Phased delivery — graybox gate first

Austen (2026-08-02): the last cave build had a beautiful spec and a
disappointing 3D result. The countermeasure is a walkable graybox BEFORE any
art spend, exactly as the rebuild handoff prescribed ("the eye-level review
decides"). Each phase ends at a hard review gate; no phase starts before the
previous gate passes.

### Phase 1 — GRAYBOX (next; the confidence gate)

Untextured, placeholder everything. Deliverable: Austen walks the room
first-person on a test route and judges layout, flow, scale, pacing.

- Author the Drowned Gallery geometry as tile data in
  `src/lib/features/museum/data/vulcan-cave-floor-plan.ts` (replacing the 6×6
  `cave-water` room): causeway walkable, pool non-walkable, sump corridor,
  alcove shelves, gate, exit.
- **Prove the elevation tech.** The museum controller assumes flat floors
  (`STANDING_Y = 0.85` in `DimensionFlipProof.svelte` /
  `museum-physics-provider.ts`). The sump descent (−2.6 m) and causeway
  (+1.2 m) need per-tile floor elevation or a path-height function with
  camera-y interpolation. This is the riskiest unknown in the whole room —
  graybox exists to settle it.
- **Waterline + submersion transition.** Flat water plane at elevation 0
  (`WaterSurface.svelte` or a plain translucent plane for graybox); when
  camera y crosses the waterline: underwater fog/tint on, muffled audio on.
  Full absorption/distortion postprocessing can wait for Phase 2 — but the
  camera-crossing trigger itself is Phase 1 (it's structural).
- Placeholder alcove performers: existing `MuseumPerformerStation3D`
  mannequins, autoplaying A, B, C (step data generated via MCP
  `get_sequence_data`, added to `museum-exhibit-sequences.ts`).
- Placeholder waterfall (emissive plane/column), placeholder glowworms (few
  dots), blockout rock via simple extruded walls. No GLB shell, no Meshy, no
  fish, no caustics.
- Verification: first-person walkthrough screenshots at the standard viewport
  set + the station-by-station sequence (approach, submerged, surfacing
  reveal, each overlook, gate close view, exit).

**Gate:** Austen walks it and approves layout/flow/scale, or we iterate
geometry here where iteration is nearly free.

### Phase 2 — SHELL + WATER (art begins)

- Authored cave shell in Blender → optimized GLB via the established ocean
  pipeline (`blender-first-3d-scenes.md`), loaded through
  `roomPresentation.modelPath` (lobby precedent) so collision stays on the
  nav grid.
- Real water: `WaterSurface` (verify the Snell-window fragment reads correctly
  from above; add a surface variant if not), `WaterAbsorptionEffect` +
  `UnderwaterDistortionEffect` wired scene-locally (the shared
  `ScenePostProcessing.svelte` gate is ocean-only — do not widen that gate,
  mount effects for the museum canvas explicitly), `patchCausticsMaterial` on
  wet rock + a `useTask` advancing `causticUniforms.uTime`.
- Waterfall (shader/particles), mist, drip rain, glowworm field, god rays
  (re-derive sun position — `GodRayShafts` hardcodes the ocean sun).
- Audio: `OceanAudioEngine` with a cave-water track ("Crystal Cavern" variant
  exists) + a `CURATED_WING_SOUNDSCAPES` entry for the new room id; underwater
  low-pass while submerged.

### Phase 3 — INHABITANTS

- Three caveman automatons: existing `PerformerRig` motion (avatar model
  selection exists at the state layer — `avatarModelId`/`setModel` — but was
  never threaded through `MuseumPerformerStation3D`; thread it). Character
  model acquisition/authoring decision per the rebuild handoff — serious
  researched treatment, no cartoon shorthand.
- Bespoke props: rough-hewn branches/torches replacing `PropType.STAFF`
  (fallbacks live in `PerformerRig.svelte` and `MuseumPerformerStation3D`).
  TKA hand registration preserved.
- Fish: existing `FishBoids` + existing GLB catalog only — species chosen for
  dark-water reading; retune `stageRadius`/`boundRadius`/`swimHeight` to the
  pool + sump volume. **No new fish assets, no new boids work** (Austen,
  2026-08-02).
- Pictograph cave art: glowing painted diagrams per alcove. **Do not invent a
  style** — the pictograph-as-cave-painting renderer already exists:
  `static/retro-eras/cave-painting.html` (paints any pictograph in Lascaux
  mineral pigments on procedural stone) with its geometry/stylize helpers in
  `static/retro-eras/_shared/`. Adapt its canvas-painting code into a texture
  generator producing a `CanvasTexture` for the alcove rock, the same pattern
  `plaque-texture-generator.ts` uses. The sump-wall A/B/C carvings use the
  same generator at lower opacity.

### Phase 4 — EXHIBIT + POLISH

- Overlook plaques (pictograph-composited), artifact set, sump-wall carvings,
  sound detail pass, full rubric verification (rebuild handoff's acceptance
  rubric + its 8-point verification method).

## Meshy-via-Codex asset workflow (Phases 2–4)

Scope per Austen: bespoke props, artifacts, and at most 1–2 hero set pieces.
Cave shell is Blender-authored, not Meshy. Characters are not Meshy.

Workflow: the implementation plan ships an asset manifest (name, reference
description, prompt, poly/texture budget, pivot/scale convention). Codex is
dispatched with Austen's Meshy key to generate candidates; each candidate gets
a turntable render posted for **Austen's approve/deny before integration**.
Approved GLBs run the standard optimization pass (decimate, KTX2, re-origin)
before entering `static/models/museum/cave/`. License/attribution recorded per
the handoff's verification method.

## Technical reuse map (verified by code inventory, 2026-08-02)

| Need | Reuse | Coupling notes |
|---|---|---|
| Water plane | `scenes/ocean/runtime/water/WaterSurface.svelte` | needs `groundY` + camera. Above-water read RESOLVED (2026-08-02, shader read): `snell-window.frag` has a `uSnellEnabled` toggle — `false` is the correct from-above surface, `true` the from-below Snell window; flip on waterline crossing. Two required adaptations: (1) the edge fade uses `length(vWorldPosition.xz)` — assumes the plane sits at world origin; add a center uniform or switch to UV-space fade before placing the pool anywhere else. (2) alpha is hardcoded `mix(0.26, 0.18, windowMask)` — expose an opacity uniform for the black-mirror pool read. |
| Underwater grade | `water-absorption-effect.ts`, `underwater-distortion-effect.ts` | Effect classes portable; wire scene-locally, don't widen the ocean gate |
| Caustics | `runtime/atmosphere/seabed-caustics.ts` | pure patch fn; caller advances `uTime` |
| God rays | `runtime/atmosphere/GodRayShafts.svelte` | hardcoded sun — re-derive |
| Particles/mist | `runtime/atmosphere/MarineParticles.svelte` | drop-in |
| Fish | `runtime/fauna/fish/FishBoids.svelte` + `static/models/ocean/pack/` | radial swim volume — retune to pool |
| Audio | `audio/ocean-audio-engine.ts` + `OCEAN_TRACKS` | drop-in; plus soundscape entry for room id |
| Room shell | `roomPresentation.modelPath` (lobby precedent) | picked up automatically by `authoredRooms` |
| Entry trigger | `onWingChange` in `DimensionFlipProof.svelte` | fires once per room crossing; submersion uses camera-y, not room id |
| Performer | `MuseumPerformerStation3D` + `PerformerRig` | thread `avatarModelId`; replace STAFF fallback |
| Plaques | `plaque-texture-generator.ts` + `MuseumPlaque3D` | pictograph bitmap compositing exists |
| Cave-art pictographs | `static/retro-eras/cave-painting.html` + `_shared/pictograph-geometry.js` / `pictograph-stylize.js` | extract canvas painting into a texture generator |
| Streaming | `MuseumGeometryStreamer` / `RoomStreamingManager` | per-room load with 5 s hysteresis |

Known risks, in order: (1) floor elevation vs. flat-floor controller — Phase 1;
(2) museum canvas has no postprocessing composer today — Phase 2; (3)
`WaterSurface` above-water appearance — Phase 2; (4) fish volume vs. room
shape — Phase 3.

## Dispatch discipline for this project (Austen, 2026-08-02)

No subagent fan-outs, no judge panels, no workflow orchestration — this is a
build, not a wide-open design decision. One Opus executor per phase working
from the written plan (Opus 5 = executor tier per `fable-routing.md`), Fable
reviews diffs and does the visual verification loop itself. Visual work is
never delegated to agents that cannot see the page. Don't rush, don't
gold-plate: each phase ships its gate deliverable and stops.

## Ledger

- [x] Concept + floor plan approved (Austen, 2026-08-02)
- [ ] Phase 1 graybox built and walkable
- [ ] Phase 1 gate: Austen eye-level approval of layout/flow/scale
- [ ] Phase 2 shell + water
- [ ] Phase 2 gate: still-frame + walkthrough approval of the art target
- [ ] Phase 3 inhabitants (cavemen, props, fish, cave art)
- [ ] Phase 3 gate: performer + prop registration approval
- [ ] Phase 4 exhibit + polish; full rubric verification
- [ ] Final gate: Austen's explicit visual approval of Water before any
      propagation to the other five rooms
