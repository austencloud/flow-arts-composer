# First Fire: The Cinder Court production contract

**Status:** Gate 0 motion capture pending; Gate 1 measured package and Gate 2
graybox rebuilt on the revived S-procession (2026-08-09)

**Revision, 2026-08-09:** Austen rejected the hub-and-spoke Cinder Court
interior ("a shit load of different torches placed willy nilly", claustrophobic
paths, and a green route already visible before the performers had been seen)
and asked for the original 2026-08-06 torch procession back. The room is once
again one continuous S: 4.5 m corridors, 240 degree horseshoe orbits with a
separate entry and exit mouth per court, 60 torches all sitting on the walked
route, and an Earth path that is both state-gated and hidden behind rock from
every court. The design authority is
`docs/superpowers/specs/2026-08-06-first-fire-torch-procession-design.md`.

**Scene ID:** `first-fire-cinder-court`

**Gate manifest:** `./scene-gates.json`

**Creative provenance:** `1bUBNo26hJpRq4Bf36gh`,
`fsJqYPYkMjY2BESGuIBC`, `jjjRDt6uwrzf9pBOFD3C`

## Outcome

The player should leave understanding that Fire noticed their movement, kept a
visible memory of each encounter, and then voluntarily surrendered the room to
Earth. The room teaches this by walking the visitor once around each performer
in turn and letting the fire go out behind them, not by sending them back to a
hub between encounters.

## Authority ledger

| Concern | Canonical owner | Evidence path | Current conflict |
|---|---|---|---|
| Creative direction | Museum tracker | `1bUBNo26hJpRq4Bf36gh` | Supersedes the accepted August 6 S-procession decision `jl8TveF5GrOgHsA2Vyfr`. |
| Story canon | Accepted tracker decisions, then story bible | `fsJqYPYkMjY2BESGuIBC`; `E:/flow-arts-private/museum/story-bible.md` | The story bible and older Fire documents still contain stale performer-count and S-plan language. |
| Room shell and transitions | Live cave floor-plan contract | `src/lib/features/museum/data/vulcan-cave-floor-plan.ts` | The current compiled Fire interior is smaller than the approved 58 by 44 metre isolated candidate. Gate 5 owns the museum resize and adjacent-room movement. |
| Performer roster | Live museum room data | `src/lib/features/museum/data/vulcan-cave-floor-plan.ts`; `src/lib/features/museum/data/museum-room-content.ts` | None: the live roster already contains DJ, EK, and FL. |
| TKA motion | Flow Arts MCP | `get_domain_topic(elemental-model)`, 2026-08-08 | Do not infer motion behavior from the old design prose. |
| Selected sequence variants | Exact live museum sequence source and catalog | `src/lib/features/museum/data/museum-exhibit-sequences.ts`; `static/data/hero/tnd-base-words.json` | The review route does not yet mount the three live performers. |
| Spatial geometry | Room-relative TypeScript plan | `src/lib/features/museum/data/first-fire-procession-plan.ts` | None: the plan carries the revived S-procession, proven by `tests/unit/museum/first-fire-procession-plan.test.ts`. |
| Blender output | Derived Blender contract and deterministic builder | `src/lib/features/museum/data/first-fire-blender-contract.ts`; `scripts/build-first-fire-graybox.py` | None: the manifest and GLB were rebuilt from the revived plan on 2026-08-09. |
| Runtime behavior | Isolated First Fire review route | `src/routes/test/first-fire-graybox/` | Current walking and fire rendering do not consume the procession state owner. |

## Claim ledger

| ID | Class | Statement | Evidence or proposal source | Status |
|---|---|---|---|---|
| C-001 | literal | The live Fire roster contains exactly the DJ, EK, and FL performers and their three selected sequence IDs. | Live museum roster and room-content files | verified |
| C-002 | literal | The selected Fire sequences are the exact live `JDJD`, `KEKE`, and `LFLF` entries in diamond mode. | Live sequence source, catalog fingerprints, Flow Arts MCP | preflight |
| C-003 | invention | The player walks one continuous S and horseshoes 240 degrees around each of three isolated performers, entering and leaving each court through different mouths. | Accepted tracker decision `1bUBNo26hJpRq4Bf36gh` | approved concept |
| C-004 | invention | One next gate kindles while completed lanes remain as coals. | Accepted tracker decision `1bUBNo26hJpRq4Bf36gh` | approved concept |
| C-005 | invention | FL completion extinguishes every red source before green appears along the route already walked, toward Earth. | Accepted tracker decision `1bUBNo26hJpRq4Bf36gh` | approved concept |
| C-006 | invention | Fire walls create visual pressure but never own collision or trap the player. Permanent basalt owns navigation and performer isolation. | Approved Cinder Court visual candidate | measured proof required |

## Experience sentence

> The player enters from Water, crosses one returning torch labyrinth because
> only one rock-framed gate is kindled, interacts by walking generous orbits
> around DJ, EK, and FL, witnesses each completed lane cool to coals, reaches a
> final view where every red source is absent before green crosses the familiar
> court, and exits toward Earth.

## Gate 0: Evidence preflight

### Sources and conflicts

- Room shell: the isolated candidate is 58 by 44 metres with Water at room-local
  `(0, 22)` and Earth at `(58, 34)`. The current integrated cave shell is not
  large enough and is explicitly outside Gate 2.
- Entry and exit: Water enters from the west. Earth leaves from the east after
  the final return to the hub. World-space adjacency remains a Gate 5 concern.
- Performer roster: `cave-fire-automaton-dj`,
  `cave-fire-automaton-ek`, and `cave-fire-automaton-fl`.
- Exact sequences: `cave-fire-seq-dj` / `JDJD`,
  `cave-fire-seq-ek` / `KEKE`, and `cave-fire-seq-fl` / `LFLF`.
- Canon conflicts: the August 4 amphitheatre, August 6 S-procession, their
  floor-plan/Blender artifacts, and the rejected August 8 text-only plan are
  historical evidence. None owns new geometry.
- Route ambiguity resolved: each performer court has one shared 3.5 metre
  throat used for both entry and return. The gate beacon may read from the hub;
  the performer must remain hidden until the threshold is crossed.

### Live motion proof

Gate 0 remains open until the exact live `JDJD`, `KEKE`, and `LFLF` loops are
captured with visible path diagnostics and compared with their catalog
fingerprints. Generated replacements are forbidden.

## Gate 1: Measured plan

### Player route

| Stop | Player position and action | First focus | Environment response | Next cue |
|---|---|---|---|---|
| 1 | Enter from Water and cross into the hub. | The only kindled gate. | Ground fire gathers around a broad safe lane. | DJ gate beacon. |
| 2 | Enter DJ through its shared throat and walk the first orbit. | DJ inside an engulfing fire pit. | Fire follows movement; the lane cools to coals on completion. | The same throat returns to the changed hub. |
| 3 | Re-enter the hub. | DJ coals behind and one newly kindled gate. | The room visibly remembers progress. | EK gate beacon. |
| 4 | Enter EK and walk its deeper orbit. | EK alone inside a distinct fire court. | EK response peaks, then cools to coals. | The shared throat returns to the hub again. |
| 5 | Re-enter the hub a second time. | Two coal memories and one live route. | FL becomes the only red destination. | FL gate beacon. |
| 6 | Enter FL and complete its long asymmetric orbit. | FL as the final active performer. | The final response peaks. | Return to the hub. |
| 7 | Reach the familiar hub after FL. | The whole known court. | Every red flame and coal extinguishes. | A neutral pause and smoke pull east. |
| 8 | Wait or backtrack freely. | Safe neutral floor and permanent basalt. | Green arrives only after the red state is absent. | Green route crosses the hub. |
| 9 | Follow green across the court. | Earth passage. | Green remains connected to Earth. | East exit. |

### Spatial artifacts

- Annotated floor plan:
  `first-fire-cinder-court-gate1-board.svg`.
- Vertical section: the same board proves the hub beacon / hidden-performer
  relationship across a 6.4–8.4 metre basalt profile.
- Route storyboard: the same board records arrival, two coal returns, full
  blackout, and the green Earth reveal.
- Sightline study: `first-fire-cinder-court-gate1-report.json` plus the focused
  0.2 metre forward/reverse route samples in
  `tests/unit/museum/first-fire-procession-plan.test.ts`.
- Plan contract: `src/lib/features/museum/data/first-fire-procession-plan.ts`.
- Blender coordinate manifest:
  `first-fire-cinder-court-blender-plan.json`.
- Automated report: `first-fire-cinder-court-gate1-report.json`.

The measured plan holds a 58 by 44 metre isolated shell, a 20 by 18 metre
returning hub, 4 metre Water/Earth transitions, 3.5 metre shared court throats,
2.4 metre minimum orbit circulation, twelve permanent polygonal basalt masses,
and a maximum of one detailed hero fire. Fire guides own no collision.

### Approval record

Concept approval was recorded from Austen on 2026-08-08 after the reimagined
Cinder Court visual: “I'm in. Let's do this, blenderific.” The generated board
matches that returning-hub candidate and is ready for an explicit measured-plan
gate decision after review.

## Gate 2: Playable graybox

- Blender source: pending.
- Coordinate manifest: pending.
- Review GLB: pending.
- First-person walk: `https://localhost:5173/test/first-fire-graybox` after the
  new artifact lands.
- Contact sheet: pending.
- Automated report: pending.

## Gate 3: Registered visual target

- Locked cameras: pending Gate 2 approval.
- Visual target board: pending.
- Material and lighting brief: pending.

## Gate 4: Production slice

- Runtime slice: pending.
- Interaction capture: pending.
- Performance report: pending.

## Gate 5: Integrated room

- Integrated walk: pending museum-shell resize and adjacency work.
- Transition captures: pending.
- Audio review: pending.
- State and performance report: pending.

## Gate 6: Final acceptance

- Acceptance walk: pending.
- Viewport evidence: pending.
- Regression report: pending.
- Known limitations: the present work is an isolated graybox and does not prove
  Water/Earth integration, live performer playback, audio, or production fire.
