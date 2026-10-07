---
status: active
value: null
effort: null
work_state: unverified
remaining: Run the Film Director adversarial corpus against the current language and categorize remaining unsupported requests.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
---

# Film Director Adversarial Corpus (round 2)

Forty dictated requests, five tiers of eight, each one pushed until the language
stops answering. Every request carries the film JSON for the part that resolves
today and a list of the parts that do not, with the file that would own each
missing parameter.

Ground rules used while writing this:

- Encodings follow `film-director-schema.ts` exactly. Scene fields shown are the
  ones the request needs; `version`, `id`, `title` and the film wrapper are
  elided except where the request is about film structure.
- "Not expressible" means a field read in this pass rejects it, or no field
  exists. Every bullet names the file.
- Gaps the campaign already closed (beats, pick+not, truck/zoom/roll, tracking,
  mid-scene cuts, transforms and library sources, arcs and offstage entrances,
  per-step effect/effort/holds) are treated as available and are not reported.
- Rejections already documented under "Spoken but not real" are still reported
  when a request wants them, because the census counts demand, but they are
  marked as ruled.

---

## Tier 1 — one axis, pushed hard

### R01 Nine planes, no repeats (tier 1)

Dictation: Give me eight performers in a circle, and I want every one of them on
a different plane in the left hand and a different plane in the right, and nobody
on the wall in either hand. Light up every grid they land on so I can see the
spread. Hold one wide shot on it for twelve seconds.

Encoding:

```json
{
  "id": "nine-planes",
  "title": "Nine Planes",
  "durationSeconds": 12,
  "location": {
    "environmentId": "forest",
    "visiblePlanes": ["wheel", "floor", "right-shield", "left-shield", "forward-ramp", "backward-ramp", "right-wing", "left-wing"]
  },
  "performance": {
    "formation": "circle",
    "cast": {
      "count": 8,
      "defaults": {
        "leftPlane": { "pick": "distinct", "not": "wall" },
        "rightPlane": { "pick": "distinct", "not": "wall" },
        "effect": "none"
      }
    }
  },
  "camera": { "subject": { "kind": "group" }, "shotSize": "wide", "angle": "eye", "position": "front", "moves": [{ "move": "hold" }] }
}
```

Not expressible:

- Nothing. Eight is the cast ceiling (`castSchema.count` max 8,
  `film-director-schema.ts`), and eight distinct draws from a nine-value pool
  minus the wall is exactly eight values, so the request is satisfiable.

Verdict: FULL

### R02 A staff that grows (tier 1)

Dictation: One performer, staff at a metre. Over the scene I want the staff to
grow to two and a half metres, smoothly, so it looks like the prop is stretching
while she spins.

Encoding:

```json
{
  "id": "growing-staff",
  "title": "Growing Staff",
  "durationSeconds": 10,
  "performance": {
    "formation": "solo",
    "performers": [{ "id": "solo", "prop": "staff", "staffLengthCm": 100 }]
  },
  "camera": { "subject": { "kind": "group" }, "shotSize": "medium", "angle": "eye", "position": "front", "moves": [{ "move": "hold" }] }
}
```

Not expressible:

- Staff length over time. `staffLengthCm` is one number per performer per scene
  (`performerSchema`, `film-director-schema.ts`), applied once when the scene is
  applied (`director-viewer-adapter.ts` line 162 `setStaffLengthCm`). There is no
  `stepStaffLengths` twin of `stepPlanes`. Runtime HAS the setter and it is cheap
  to call per frame, exactly as `setEffect`/`setEffort` are called from
  `applyDirectorStepChanges`; the missing piece is schema plus a resolver list.

Verdict: PARTIAL

### R03 Circle the whole way round twice (tier 1)

Dictation: Put three of them in a triangle and just orbit them. All the way
round, twice, clockwise, no cuts, twenty seconds. I want it to feel like one
unbroken lap.

Encoding:

```json
{
  "id": "double-lap",
  "title": "Double Lap",
  "durationSeconds": 20,
  "performance": { "formation": "v-shape", "cast": { "count": 3, "defaults": { "effect": "none" } } },
  "camera": {
    "subject": { "kind": "group" },
    "shotSize": "wide",
    "angle": "eye",
    "position": "front",
    "moves": [{ "move": "orbit", "direction": "cw", "amount": { "degrees": 720 } }]
  }
}
```

Not expressible:

- "Triangle" as a formation name. `DIRECTOR_FORMATIONS`
  (`film-director-schema.ts`) has no triangle; `v-shape` is the closest
  three-slot preset. Formation presets come from `@austencloud/scene-3d`
  `PRESET_VALID_COUNTS`, so a new one is a scene-package change, not a schema
  change.
- Everything else resolves: `orbit` takes any degrees (`cameraMoveSchema` puts no
  cap on a move's `amount.degrees`, and `compileCameraMoves` segments at 30
  degrees), so 720 compiles into 24 smooth segments.

Verdict: PARTIAL

### R04 Ten steps, then hold the last shape (tier 1)

Dictation: She spins a ten-step figure, then on the last step I want her to just
stop and hold that shape for the last four counts while the camera keeps
rolling. Nothing else changes.

Encoding:

```json
{
  "id": "hold-the-shape",
  "title": "Hold the Shape",
  "durationBeats": 14,
  "performance": {
    "bpm": 90,
    "formation": "solo",
    "performers": [
      {
        "id": "solo",
        "sequence": { "length": 10, "level": 2, "flow": "smooth" },
        "holds": [{ "fromStep": 9, "steps": 4 }]
      }
    ]
  },
  "camera": { "subject": { "kind": "group" }, "shotSize": "medium", "angle": "eye", "position": "front", "moves": [{ "move": "hold" }] }
}
```

Not expressible:

- Nothing for the stated request. `holds` pins the performer at `fromStep` at
  progress 0 for the stated counts (`director-step-holds.ts` `resolveHeldStep`),
  which is exactly "stop and hold that shape".

Verdict: FULL

### R05 A performer who turns to face each corner (tier 1)

Dictation: One performer standing still, spinning the whole time. Every four
counts she turns ninety degrees to a new corner of the room, four times, until
she is back where she started. Her feet never move.

Encoding:

```json
{
  "id": "four-corners",
  "title": "Four Corners",
  "durationBeats": 16,
  "performance": {
    "bpm": 90,
    "formation": "solo",
    "performers": [
      {
        "id": "solo",
        "sequence": { "length": 16, "level": 2 },
        "blocking": [
          { "move": "turn", "direction": "right", "amount": { "degrees": 90 }, "durationBeats": 4 },
          { "move": "turn", "direction": "right", "amount": { "degrees": 90 }, "durationBeats": 4 },
          { "move": "turn", "direction": "right", "amount": { "degrees": 90 }, "durationBeats": 4 },
          { "move": "turn", "direction": "right", "amount": { "degrees": 90 }, "durationBeats": 4 }
        ]
      }
    ]
  },
  "camera": { "subject": { "kind": "group" }, "shotSize": "medium", "angle": "eye", "position": "front", "moves": [{ "move": "hold" }] }
}
```

Not expressible:

- The turn is a continuous rotation across the whole four-beat window
  (`compileBlockingMoves`, `blocking-language.ts`: a `turn` pushes a start frame
  and an end frame and the sampler interpolates). A director asking for a turn
  ON the count, snapping and then holding, has to spell it as a short turn plus a
  `stand`. Not a missing parameter, a documentation point.
- Whether the body turn re-grounds the prop phrase (a TKA body turn is a domain
  event, not just a facing change) is not something the language states. There is
  no field connecting a blocking `turn` to the sequence's frame of reference.
  Closest seam: `setFacingAngle` in `character-instance-state.svelte.ts`, called
  from the blocking track only. Runtime: unknown whether the prop phrase is
  expected to follow the body; would need to check
  `director-blocking-track.ts` against `PerformerRig`.

Verdict: PARTIAL

### R06 Cut around one static pose eight times (tier 1)

Dictation: Freeze on one pose and cut around it. Eight angles, two counts each,
all the way round the performer, like a bullet-time ring. Nobody moves.

Encoding:

```json
{
  "id": "ring-of-cuts",
  "title": "Ring of Cuts",
  "durationBeats": 16,
  "performance": {
    "bpm": 90,
    "formation": "solo",
    "performers": [{ "id": "solo", "sequence": { "length": 8 }, "holds": [{ "fromStep": 0, "steps": 16 }] }]
  },
  "camera": {
    "shots": [
      { "subject": { "kind": "performer", "performerId": "solo" }, "shotSize": "medium", "angle": "eye", "position": { "degrees": 0 }, "durationBeats": 2 },
      { "subject": { "kind": "performer", "performerId": "solo" }, "shotSize": "medium", "angle": "eye", "position": { "degrees": 45 }, "durationBeats": 2 },
      { "subject": { "kind": "performer", "performerId": "solo" }, "shotSize": "medium", "angle": "eye", "position": { "degrees": 90 }, "durationBeats": 2 },
      { "subject": { "kind": "performer", "performerId": "solo" }, "shotSize": "medium", "angle": "eye", "position": { "degrees": 135 }, "durationBeats": 2 },
      { "subject": { "kind": "performer", "performerId": "solo" }, "shotSize": "medium", "angle": "eye", "position": { "degrees": 180 }, "durationBeats": 2 },
      { "subject": { "kind": "performer", "performerId": "solo" }, "shotSize": "medium", "angle": "eye", "position": { "degrees": 225 }, "durationBeats": 2 },
      { "subject": { "kind": "performer", "performerId": "solo" }, "shotSize": "medium", "angle": "eye", "position": { "degrees": 270 }, "durationBeats": 2 },
      { "subject": { "kind": "performer", "performerId": "solo" }, "shotSize": "medium", "angle": "eye", "position": { "degrees": 315 }, "durationBeats": 2 }
    ]
  }
}
```

Not expressible:

- A true freeze frame. `holds` stops the prop phrase but the body still idles and
  the locomotion animator keeps running (`director-step-holds.ts` remaps the
  step, it does not stop the world clock in
  `film-director-state.svelte.ts` `tick`). There is no film or scene time-scale
  field. Runtime: unknown; nothing in `film-director-state.svelte.ts` exposes a
  rate, and `sample-film-director.ts` derives `sequenceStep` straight from scene
  time and bpm.

Verdict: PARTIAL

### R07 Everyone on the same word, different levels (tier 1)

Dictation: Six of them, all spinning the word AVOID, but each at a different
difficulty, and the ones on the harder levels get more turns. Same start
position for everyone so the difference is only in the turns.

Encoding:

```json
{
  "id": "same-word-six-levels",
  "title": "Same Word, Six Ladders",
  "durationSeconds": 16,
  "performance": {
    "formation": "circle",
    "cast": {
      "count": 6,
      "defaults": { "effect": "none" },
      "performers": [
        { "id": "performer-1", "sequence": { "word": "AVOID", "startPosition": "beta3", "level": 1, "turns": 0 } },
        { "id": "performer-2", "sequence": { "word": "AVOID", "startPosition": "beta3", "level": 2, "turns": [1, 0] } },
        { "id": "performer-3", "sequence": { "word": "AVOID", "startPosition": "beta3", "level": 2, "turns": 1 } },
        { "id": "performer-4", "sequence": { "word": "AVOID", "startPosition": "beta3", "level": 2, "turns": [2, 1] } },
        { "id": "performer-5", "sequence": { "word": "AVOID", "startPosition": "beta3", "level": 3, "turns": [1, 0.5] } },
        { "id": "performer-6", "sequence": { "word": "AVOID", "startPosition": "beta3", "level": 3, "turns": [1, "fl", 0.5, 2] } }
      ]
    }
  },
  "camera": { "subject": { "kind": "group" }, "shotSize": "wide", "angle": "high", "position": "front", "moves": [{ "move": "hold" }] }
}
```

Not expressible:

- "Difficulty ramps across the cast" as one statement. Each performer states its
  own level; there is no cast-scoped directive that spreads a scalar across the
  cast the way `pick: "distinct"` spreads a catalog. `level` is not directive
  capable at all (`performerSequenceSchema` takes a plain literal), and
  `staffLengthCm` is the only numeric axis with directive grammar.
- Whether AVOID is feasible from beta3 is a domain question the language does not
  answer at author time; `director-sequence-library.ts` falls back to the demo
  with a console reason.

Verdict: PARTIAL

### R08 A camera that never stops moving (tier 1)

Dictation: I want the camera alive for the whole scene. Push in a little, drift
left, crane up, tilt the horizon, pull back out, all continuous, never a hold.
Thirty seconds of one breath.

Encoding:

```json
{
  "id": "one-breath",
  "title": "One Breath",
  "durationSeconds": 30,
  "performance": { "formation": "line", "cast": { "count": 3, "defaults": { "effect": "none" } } },
  "camera": {
    "subject": { "kind": "group" },
    "shotSize": "wide",
    "angle": "eye",
    "position": "front",
    "moves": [
      { "move": "push-in", "amount": { "meters": 1.5 }, "durationSeconds": 6, "easing": "ease-in-out" },
      { "move": "truck", "direction": "left", "amount": { "meters": 2 }, "durationSeconds": 6, "easing": "ease-in-out" },
      { "move": "crane", "direction": "up", "amount": { "meters": 1.5 }, "durationSeconds": 6, "easing": "ease-in-out" },
      { "move": "roll", "direction": "ccw", "amount": { "degrees": 6 }, "durationSeconds": 6, "easing": "ease-in-out" },
      { "move": "pull-back", "amount": { "meters": 2 }, "durationSeconds": 6, "easing": "ease-in-out" }
    ]
  }
}
```

Not expressible:

- Concurrency. `allocateMoveWindows` (`director-move-windows.ts`, used by
  `compileCameraMoves`) gives each move a disjoint window, so a push that also
  drifts left is two sequential moves, never one blended gesture. Every request in
  this corpus that wants two camera gestures at once hits this. Runtime is fine
  with it: the keyframe stream is arbitrary positions, so concurrency is a
  compiler change (a `with` list on a move, or move groups), not a viewer change.

Verdict: PARTIAL

---

## Tier 2 — two axes interacting

### R09 The camera walks with her and the light finds her (tier 2)

Dictation: She walks across the stage from right to left, and the camera goes
with her, keeping her the same size in frame. As she crosses the middle, bring a
warm light up on her and let everything behind her fall darker.

Encoding:

```json
{
  "id": "walk-with-her",
  "title": "Walk With Her",
  "durationBeats": 16,
  "performance": {
    "bpm": 120,
    "formation": "side-by-side",
    "cast": {
      "count": 2,
      "defaults": { "effect": "none" },
      "performers": [
        { "id": "performer-2", "blocking": [{ "move": "walk", "to": { "x": -2, "z": -1.2 }, "durationBeats": 8, "facing": "travel" }, { "move": "stand" }] }
      ]
    }
  },
  "camera": {
    "subject": { "kind": "performer", "performerId": "performer-2", "track": "follow" },
    "shotSize": "medium",
    "angle": "eye",
    "position": "front",
    "moves": [{ "move": "hold" }]
  }
}
```

Not expressible:

- Lighting, at any scope. No axis, no adapter hook. Environments own their own
  rigs (`src/lib/shared/3d/environments/scenes/*/…Lighting.svelte`, and the named
  atmosphere presets in
  `src/lib/shared/3d/environments/domain/models/scene-configs/ember-atmosphere-looks.ts`
  with `EMBER_ATMOSPHERE_LOOK_IDS`). Runtime HAS the light configs; there is no
  director path to them and no per-performer light at all.
- A light cued to a moment. Even with a lighting axis, everything in
  `locationSchema` is one value for the whole scene; there is no `stepLights` or
  timed location change.

Verdict: PARTIAL

### R10 Trails only while she is walking (tier 2)

Dictation: No effect while she stands. The moment she starts walking, trails come
on, and they go off again when she stops. The camera holds wide the whole time.

Encoding:

```json
{
  "id": "trails-while-walking",
  "title": "Trails While Walking",
  "durationBeats": 16,
  "performance": {
    "bpm": 120,
    "formation": "solo",
    "performers": [
      {
        "id": "solo",
        "sequence": { "length": 16 },
        "stepEffects": [
          { "step": 0, "effect": "none" },
          { "step": 4, "effect": "trails" },
          { "step": 12, "effect": "none" }
        ],
        "blocking": [
          { "move": "stand", "durationBeats": 4 },
          { "move": "walk", "direction": "forward", "amount": { "meters": 3 }, "durationBeats": 8 },
          { "move": "stand", "durationBeats": 4 }
        ]
      }
    ]
  },
  "camera": { "subject": { "kind": "group" }, "shotSize": "wide", "angle": "eye", "position": "front", "moves": [{ "move": "hold" }] }
}
```

Not expressible:

- The causal link. The director said "while she is walking"; the JSON says "at
  steps 4 through 11". Those coincide only because the author did the arithmetic.
  There is no way to key a step-scoped change to a blocking event, and the two
  clocks can diverge: `holds` shifts the step clock while blocking keeps running
  (documented in the capability matrix, `holds` row). Closest seam: the frame
  loop in `director-viewer-adapter.ts` `applyDirectorStepChanges` reads the
  playhead; it would need blocking-phase awareness from
  `director-blocking-track.ts`.

Verdict: PARTIAL

### R11 Two lines that become one circle (tier 2)

Dictation: Start with them in two lines facing each other, four a side. Halfway
through, they all walk into one circle. And I want the camera to rise as they
converge, so the circle closes under us.

Encoding:

```json
{
  "id": "two-lines-one-circle",
  "title": "Two Lines, One Circle",
  "durationSeconds": 20,
  "performance": {
    "formation": "facing-each-other",
    "blocking": { "endFormation": "circle", "durationSeconds": 6, "easing": "ease-in-out", "facing": "travel" },
    "cast": { "count": 8, "defaults": { "effect": "none" } }
  },
  "camera": {
    "subject": { "kind": "group" },
    "shotSize": "wide",
    "angle": "eye",
    "position": "front",
    "moves": [
      { "move": "hold", "durationSeconds": 8 },
      { "move": "crane", "direction": "up", "amount": { "meters": 3 }, "durationSeconds": 6, "easing": "ease-in-out" },
      { "move": "hold", "durationSeconds": 6 }
    ]
  }
}
```

Not expressible:

- When the formation change starts. `sceneBlockingSchema` has a duration but no
  start offset, and `movesToMark` (`resolve-film-director-spec.ts`) emits a single
  walk from the opening mark. A halfway change means every performer writes their
  own `blocking` list with a leading `stand`, which discards the formation-marks
  convenience entirely. Closest seam: `movesToMark` would take a `startSeconds`
  or a leading hold.
- More than one formation change in a scene. `performance.blocking` is a single
  object with a single `endFormation`.
- `facing-each-other` supporting 8. Validated per count against
  `PRESET_VALID_COUNTS` (`buildResolvedPerformers`); if it does not list 8 this
  rejects by name and the request needs a different preset. Not verified here.

Verdict: PARTIAL

### R12 Canon: each one starts a beat after the last (tier 2)

Dictation: Five in a line, all doing the same phrase, but each one starts one
count after the person to their left. A rolling wave down the line. Camera slides
along the line as the wave travels.

Encoding:

```json
{
  "id": "rolling-canon",
  "title": "Rolling Canon",
  "durationBeats": 24,
  "performance": {
    "bpm": 100,
    "formation": "line",
    "cast": {
      "count": 5,
      "defaults": { "effect": "none", "sequence": { "word": "EMBER", "startPosition": "beta3", "level": 2, "turns": [1, 0] } },
      "performers": [
        { "id": "performer-1", "beatOffset": 0 },
        { "id": "performer-2", "beatOffset": -1 },
        { "id": "performer-3", "beatOffset": -2 },
        { "id": "performer-4", "beatOffset": -3 },
        { "id": "performer-5", "beatOffset": -4 }
      ]
    }
  },
  "camera": {
    "subject": { "kind": "group" },
    "shotSize": "wide",
    "angle": "eye",
    "position": "front",
    "moves": [{ "move": "truck", "direction": "right", "amount": { "meters": 4 }, "durationBeats": 24, "easing": "linear" }]
  }
}
```

Not expressible:

- A canon as one statement. Five explicit `beatOffset` numbers is the encoding; a
  cast-scoped "offset each performer by one beat" has no spelling.
  `beatOffset` is a literal (`performerSchema`) and is not directive capable.
- The sign convention. `sample-film-director.ts` subtracts `beatOffset` from the
  computed step; whether a director says minus one for "starts later" is a
  documentation gap, not a capability gap.

Verdict: PARTIAL

### R13 A partner passes a staff across (tier 2)

Dictation: Two of them, close, facing each other. On count eight he hands his
staff across to her and she takes it, so she finishes with two and he finishes
empty-handed. Camera pushes in tight on the exchange.

Encoding:

```json
{
  "id": "the-hand-off",
  "title": "The Hand-Off",
  "durationBeats": 16,
  "performance": {
    "bpm": 100,
    "formation": "facing-each-other",
    "cast": {
      "count": 2,
      "performers": [
        { "id": "performer-1", "prop": "staff", "effect": "none" },
        { "id": "performer-2", "prop": "staff", "effect": "none" }
      ]
    }
  },
  "camera": {
    "shots": [
      { "subject": { "kind": "group" }, "shotSize": "wide", "angle": "eye", "position": "front", "durationBeats": 8 },
      { "subject": { "kind": "group" }, "shotSize": "close-up", "angle": "eye", "position": "front", "moves": [{ "move": "push-in", "amount": { "meters": 0.5 } }], "durationBeats": 8 }
    ]
  }
}
```

Not expressible:

- A prop hand-off. Nothing transfers a prop between performers. `setProp` is
  per performer (`character-instance-state.svelte.ts` line 975) and the rig binds
  props to that performer's hands; there is no shared-object model.
- One performer holding two props, or none. `prop` is one `PropType` per
  performer (`performerSchema`); the rig always equips both hands.
- Per-hand prop. Same field.

Verdict: NONE

### R14 Fire arrives with the downbeat (tier 2)

Dictation: Four counts of nothing, then on the downbeat of the second bar
everything lights: fire on all four of them at once, and the camera snaps from
wide to a low close-up on the same frame.

Encoding:

```json
{
  "id": "downbeat-ignition",
  "title": "Downbeat Ignition",
  "durationBeats": 16,
  "performance": {
    "bpm": 120,
    "formation": "grid-2x2",
    "cast": {
      "count": 4,
      "defaults": {
        "prop": "fire_double_staff",
        "stepEffects": [
          { "step": 0, "effect": "none" },
          { "step": 4, "effect": "fire" }
        ]
      }
    }
  },
  "effectPresets": { "fire": "fire-classic" },
  "camera": {
    "shots": [
      { "subject": { "kind": "group" }, "shotSize": "wide", "angle": "eye", "position": "front", "durationBeats": 4 },
      { "subject": { "kind": "performer", "performerId": "performer-1" }, "shotSize": "close-up", "angle": "low", "position": "front", "durationBeats": 12 }
    ]
  }
}
```

Not expressible:

- Effect intensity. The fire either is or is not the effect in force; there is no
  ramp, level, or opacity over steps. `effectOverrides` exists but is scene-scoped
  and literal (`sceneSchema`), and its property values are not validated against
  the effect's own schema, so it cannot carry a time series.
- The cut and the effect being the same event. The shot boundary is at beat 4 of
  camera time and the effect is at step 4 of the performer's step clock; they
  coincide because bpm is 120 in both, not because anything binds them.
- Whether `fire_double_staff` is the exact `PropType` string. Source of truth is
  `prop-type.ts`; an unknown value rejects by name.

Verdict: PARTIAL

### R15 She looks at him, then the camera looks where she looks (tier 2)

Dictation: He is upstage spinning. She is downstage, still. She turns her head to
watch him, and then the camera swings round to follow her eye line onto him.

Encoding:

```json
{
  "id": "eye-line",
  "title": "Eye Line",
  "durationSeconds": 14,
  "performance": {
    "formation": "custom",
    "performers": [
      { "id": "him", "position": { "x": 0, "z": -2.5 }, "facingDegrees": 180, "sequence": { "length": 12 }, "effect": "none" },
      {
        "id": "her",
        "position": { "x": 0, "z": 1.5 },
        "facingDegrees": 180,
        "sequence": { "source": "none" },
        "effect": "none",
        "blocking": [
          { "move": "stand", "durationSeconds": 4 },
          { "move": "turn", "facing": { "degrees": 0 }, "durationSeconds": 2, "easing": "ease-in-out" },
          { "move": "stand", "durationSeconds": 8 }
        ]
      }
    ]
  },
  "camera": {
    "shots": [
      { "subject": { "kind": "performer", "performerId": "her" }, "shotSize": "medium", "angle": "eye", "position": "front", "durationSeconds": 7 },
      { "subject": { "kind": "performer", "performerId": "him" }, "shotSize": "medium", "angle": "eye", "position": "front", "durationSeconds": 7 }
    ]
  }
}
```

Not expressible:

- Head aim and gaze. There is no eye line, head target, or look-at anywhere in
  the performer API read in this pass; `setFacingAngle` turns the whole body
  (`character-instance-state.svelte.ts`). Runtime: unknown whether the scene
  package's rig exposes a head bone target; the file to check is
  `@austencloud/scene-3d`'s `AvatarSkeletonBuilder`.
- Over-the-shoulder framing. `computeCameraFraming` orbits one subject at a
  vantage; there is no two-subject framing that puts one shoulder in the corner.

Verdict: PARTIAL

### R16 The environment changes under them (tier 2)

Dictation: Same four performers, same phrase, but the world changes around them:
forest, then ocean, then cosmic, dissolving between each, and they never stop
spinning through it.

Encoding:

```json
{
  "scenes": [
    {
      "id": "world-1", "title": "Forest", "durationSeconds": 8,
      "location": { "environmentId": "forest" },
      "performance": { "formation": "grid-2x2", "cast": { "count": 4, "defaults": { "effect": "none", "sequence": { "word": "EMBER", "startPosition": "beta3", "level": 2 } } } },
      "camera": { "subject": { "kind": "group" }, "shotSize": "wide", "angle": "eye", "position": "front", "moves": [{ "move": "hold" }] }
    },
    {
      "id": "world-2", "title": "Ocean", "durationSeconds": 8,
      "transition": { "kind": "environment-dissolve", "durationSeconds": 1.2 },
      "location": { "environmentId": "ocean" },
      "performance": { "formation": "grid-2x2", "cast": { "count": 4, "defaults": { "effect": "none", "sequence": { "word": "EMBER", "startPosition": "beta3", "level": 2 } } } },
      "camera": { "subject": { "kind": "group" }, "shotSize": "wide", "angle": "eye", "position": "front", "moves": [{ "move": "hold" }] }
    },
    {
      "id": "world-3", "title": "Cosmic", "durationSeconds": 8,
      "transition": { "kind": "environment-dissolve", "durationSeconds": 1.2 },
      "location": { "environmentId": "cosmic" },
      "performance": { "formation": "grid-2x2", "cast": { "count": 4, "defaults": { "effect": "none", "sequence": { "word": "EMBER", "startPosition": "beta3", "level": 2 } } } },
      "camera": { "subject": { "kind": "group" }, "shotSize": "wide", "angle": "eye", "position": "front", "moves": [{ "move": "hold" }] }
    }
  ]
}
```

Not expressible:

- "They never stop spinning through it." Each scene resolves its own cast from
  scratch (`resolveScene`), so the step clock restarts at every scene boundary.
  There is no continuity carry-over. Closest seam: `sample-film-director.ts`
  computes `sequenceStep` from scene time, not film time.
- Repeating the same cast three times. No film-level defaults or scene
  inheritance; every scene restates its whole performance block. This is the
  single biggest source of duplication in every multi-scene request below.
- An environment change WITHIN a scene. `location.environmentId` is one value per
  scene.

Verdict: PARTIAL

---

## Tier 3 — whole-film structure

### R17 A motif that returns (tier 3)

Dictation: Open with a two-second image: one performer, low, close, fire. Then
three minutes of other material. Then at the very end, that exact same image
again, same angle, same light, so it reads as a callback.

Encoding:

```json
{
  "scenes": [
    {
      "id": "motif-open", "title": "Motif", "durationSeconds": 2,
      "location": { "environmentId": "ember" },
      "performance": { "formation": "solo", "performers": [{ "id": "solo", "prop": "fire_double_staff", "effect": "fire", "sequence": { "word": "EMBER", "startPosition": "beta3", "level": 3 } }] },
      "effectPresets": { "fire": "fire-classic" },
      "camera": { "subject": { "kind": "group" }, "shotSize": "close-up", "angle": "low", "position": "front", "moves": [{ "move": "hold" }] }
    },
    { "id": "middle", "title": "Middle", "durationSeconds": 20, "location": { "environmentId": "forest" }, "performance": { "formation": "line", "cast": { "count": 3, "defaults": { "effect": "none" } } }, "camera": { "subject": { "kind": "group" }, "shotSize": "wide", "angle": "eye", "position": "front", "moves": [{ "move": "hold" }] } },
    {
      "id": "motif-close", "title": "Motif Again", "durationSeconds": 2,
      "transition": { "kind": "cut" },
      "location": { "environmentId": "ember" },
      "performance": { "formation": "solo", "performers": [{ "id": "solo", "prop": "fire_double_staff", "effect": "fire", "sequence": { "word": "EMBER", "startPosition": "beta3", "level": 3 } }] },
      "effectPresets": { "fire": "fire-classic" },
      "camera": { "subject": { "kind": "group" }, "shotSize": "close-up", "angle": "low", "position": "front", "moves": [{ "move": "hold" }] }
    }
  ]
}
```

Not expressible:

- A motif as a named, reusable thing. The callback is a copy-paste of the opening
  scene's whole block. Nothing in `FilmDirectorInputSchema` lets a scene say "the
  same as scene one" or "the same cast as scene one with this changed". The
  document cannot state the callback as a callback, so a later edit to the opening
  silently breaks the rhyme.
- Three minutes. Scene duration caps at 60 seconds (`sceneSchema`) and scenes at
  24 (`filmDirectorInputSchema`), so the film ceiling is 24 minutes of scenes; a
  three-minute middle is four or more scenes. Not a blocker, a bookkeeping cost.

Verdict: PARTIAL

### R18 A film in three-four (tier 3)

Dictation: The whole piece is a waltz. Three counts to the bar, ninety beats a
minute, and I want the phrase lengths and the camera moves to land on bar lines,
not beat lines. Give me eight bars.

Encoding:

```json
{
  "id": "waltz",
  "title": "Waltz",
  "durationBeats": 24,
  "performance": {
    "bpm": 90,
    "formation": "side-by-side",
    "cast": { "count": 2, "defaults": { "effect": "none", "sequence": { "length": 12, "level": 2 } } }
  },
  "camera": {
    "subject": { "kind": "group" },
    "shotSize": "wide",
    "angle": "eye",
    "position": "front",
    "moves": [
      { "move": "push-in", "amount": { "meters": 1 }, "durationBeats": 12 },
      { "move": "hold", "durationBeats": 12 }
    ]
  }
}
```

Not expressible:

- Time signature. There is no meter field anywhere; beats convert as
  `beats * 60 / bpm` (`director-beat-times.ts`) with no bar concept, so "four
  bars" is arithmetic the director does by hand and the document cannot restate.
  Closest seam: `convertSceneBeatTimes` would take a `beatsPerBar` and a `bars`
  twin of `durationBeats`.
- Landing on bar lines as a constraint. Nothing validates that a move window
  aligns to anything.

Verdict: PARTIAL

### R19 Count-in and a rest (tier 3)

Dictation: Give me a four-count count-in on an empty stage, then they start. And
in the middle of the piece there is a two-bar rest where absolutely nothing
happens, then it resumes.

Encoding:

```json
{
  "scenes": [
    {
      "id": "count-in", "title": "Count In", "durationBeats": 4,
      "performance": { "bpm": 120, "formation": "solo", "performers": [{ "id": "solo", "sequence": { "source": "none" }, "effect": "none" }] },
      "camera": { "subject": { "kind": "group" }, "shotSize": "wide", "angle": "eye", "position": "front", "moves": [{ "move": "hold" }] }
    },
    {
      "id": "first-phrase", "title": "First Phrase", "durationBeats": 16, "transition": { "kind": "cut" },
      "performance": { "bpm": 120, "formation": "solo", "performers": [{ "id": "solo", "sequence": { "length": 16 }, "effect": "none", "holds": [{ "fromStep": 8, "steps": 8 }] }] },
      "camera": { "subject": { "kind": "group" }, "shotSize": "wide", "angle": "eye", "position": "front", "moves": [{ "move": "hold" }] }
    }
  ]
}
```

Not expressible:

- A count-in as anything but an empty scene. There is no audible click, no
  metronome, and no audio at all (see R40). The count-in reads as four seconds of
  a still frame.
- A rest for the whole cast in one word. `holds` is per performer, so a cast-wide
  rest is one `holds` entry per performer, or a cast default `holds` list.
  A cast default works, so this half is expressible; the missing piece is a rest
  that also stops the camera and the blocking, which `holds` explicitly does not
  (capability matrix, `holds` row: "Blocking is authored geometry and is NOT
  paused").

Verdict: PARTIAL

### R20 The tempo doubles halfway (tier 3)

Dictation: Start it slow, sixty beats. Halfway through, without a cut, the tempo
doubles and everything gets urgent. Same performers, same phrase, just twice as
fast from that moment.

Encoding:

```json
{
  "scenes": [
    {
      "id": "slow-half", "title": "Slow", "durationBeats": 16,
      "performance": { "bpm": 60, "formation": "line", "cast": { "count": 3, "defaults": { "effect": "none", "sequence": { "word": "EMBER", "startPosition": "beta3", "level": 2 } } } },
      "camera": { "subject": { "kind": "group" }, "shotSize": "wide", "angle": "eye", "position": "front", "moves": [{ "move": "hold" }] }
    },
    {
      "id": "fast-half", "title": "Fast", "durationBeats": 32, "transition": { "kind": "cut" },
      "performance": { "bpm": 120, "formation": "line", "cast": { "count": 3, "defaults": { "effect": "none", "sequence": { "word": "EMBER", "startPosition": "beta3", "level": 2 } } } },
      "camera": { "subject": { "kind": "group" }, "shotSize": "wide", "angle": "eye", "position": "front", "moves": [{ "move": "hold" }] }
    }
  ]
}
```

Not expressible:

- A tempo change without a cut. `performance.bpm` is one number per scene
  (`performanceSchema`), read once at the top of `resolveScene` and used for beat
  conversion and for the step rate in `sample-film-director.ts` line 143. Changing
  it means a new scene, and a new scene restarts the step clock, so the phrase
  jumps rather than accelerating. Closest seam: `sample-film-director.ts` would
  need a bpm curve rather than a scalar.

Verdict: PARTIAL

### R21 A scene that quotes an earlier scene from a different angle (tier 3)

Dictation: Scene two, we saw the trio from the front. Scene six, I want the
identical moment again but seen from behind and slightly higher, like we are
remembering it from the other side.

Encoding: identical `performance` block in both scenes, differing only in
`camera`.

```json
{
  "scenes": [
    {
      "id": "seen-from-front", "title": "From the Front", "durationBeats": 16,
      "performance": { "bpm": 100, "formation": "line", "cast": { "count": 3, "defaults": { "effect": "none", "sequence": { "word": "EMBER", "startPosition": "beta3", "level": 3, "turns": [1, "fl", 0, 0.5] } } } },
      "camera": { "subject": { "kind": "group" }, "shotSize": "wide", "angle": "eye", "position": "front", "moves": [{ "move": "hold" }] }
    },
    {
      "id": "seen-from-behind", "title": "From Behind", "durationBeats": 16, "transition": { "kind": "cut" },
      "performance": { "bpm": 100, "formation": "line", "cast": { "count": 3, "defaults": { "effect": "none", "sequence": { "word": "EMBER", "startPosition": "beta3", "level": 3, "turns": [1, "fl", 0, 0.5] } } } },
      "camera": { "subject": { "kind": "group" }, "shotSize": "wide", "angle": "high", "position": "behind", "moves": [{ "move": "hold" }] }
    }
  ]
}
```

Not expressible:

- "The identical moment." The two scenes resolve independently, and any directive
  randomness draws from `${base}\0salt\0sceneId\0axis` (`directive-random.ts`
  `resolveFilmSeed`), which includes the scene id. Two scenes cannot be made to
  draw the same values without pinning every axis to a literal. This film pins
  everything, so it works; a quoted scene with any `pick` in it cannot be quoted.
  Closest seam: a `seedAs: "<sceneId>"` field feeding `createAxisStream`'s scene
  key.
- Scene inheritance, again. The quote is a copy.

Verdict: PARTIAL

### R22 Twelve scenes that each add one performer (tier 3)

Dictation: Build it up. One performer, then two, then three, all the way to
eight, each one entering from the wings and joining the line, and the camera pulls
back a little each time to make room.

Encoding (first three of eight scenes; the pattern repeats):

```json
{
  "scenes": [
    {
      "id": "build-1", "title": "One", "durationBeats": 8,
      "performance": { "bpm": 100, "formation": "solo", "cast": { "count": 1, "defaults": { "effect": "none" } } },
      "camera": { "subject": { "kind": "group" }, "shotSize": "medium", "angle": "eye", "position": "front", "moves": [{ "move": "hold" }] }
    },
    {
      "id": "build-2", "title": "Two", "durationBeats": 8, "transition": { "kind": "cut" },
      "performance": {
        "bpm": 100, "formation": "side-by-side",
        "cast": { "count": 2, "defaults": { "effect": "none" }, "performers": [
          { "id": "performer-2", "position": { "x": 7, "z": 0 }, "blocking": [{ "move": "walk", "to": { "x": 0.9, "z": 0 }, "facing": "travel", "durationBeats": 6 }, { "move": "stand" }] }
        ] }
      },
      "camera": { "subject": { "kind": "group" }, "shotSize": "medium", "angle": "eye", "position": "front", "moves": [{ "move": "pull-back", "amount": { "meters": 0.5 } }] }
    },
    {
      "id": "build-3", "title": "Three", "durationBeats": 8, "transition": { "kind": "cut" },
      "performance": {
        "bpm": 100, "formation": "line",
        "cast": { "count": 3, "defaults": { "effect": "none" }, "performers": [
          { "id": "performer-3", "position": { "x": 7, "z": 0 }, "blocking": [{ "move": "walk", "to": { "x": 1.8, "z": -0.3 }, "facing": "travel", "durationBeats": 6 }, { "move": "stand" }] }
        ] }
      },
      "camera": { "subject": { "kind": "group" }, "shotSize": "wide", "angle": "eye", "position": "front", "moves": [{ "move": "pull-back", "amount": { "meters": 0.5 } }] }
    }
  ]
}
```

Not expressible:

- A performer entering DURING a scene rather than at its start. The entrance
  works, but each new arrival needs its own scene because the formation slot count
  is fixed for the scene (`buildResolvedPerformers` validates count against
  `PRESET_VALID_COUNTS` once). A cast that grows mid-scene has no spelling.
- The pull-back accumulating across scenes. Each scene's framing is recomputed
  from `computeFramingShot`, so "a little further back each time" is a fresh
  framing each scene, not a continuing move.
- Hardcoded target marks. The author has to know `side-by-side` puts slot 2 at
  (0.9, 0) and `line` puts slot 3 at (1.8, -0.3). There is no way to say "walk to
  your slot"; `performance.blocking` does that for the whole cast at once but
  cannot be aimed at one performer.

Verdict: PARTIAL

### R23 Silence, then everything (tier 3)

Dictation: Eight counts of a completely empty frame, no performers at all, just
the forest. Then they are there. I want the absence to land.

Encoding:

```json
{
  "scenes": [
    {
      "id": "empty", "title": "Empty", "durationBeats": 8,
      "location": { "environmentId": "forest" },
      "performance": {
        "bpm": 100, "formation": "solo",
        "performers": [{ "id": "ghost", "sequence": { "source": "none" }, "effect": "none", "position": { "x": 40, "z": 40 } }]
      },
      "camera": { "subject": { "kind": "point", "position": [0, 1.2, 0] }, "shotSize": "wide", "angle": "eye", "position": "front", "moves": [{ "move": "hold" }] }
    },
    {
      "id": "arrival", "title": "Arrival", "durationBeats": 16, "transition": { "kind": "cut" },
      "location": { "environmentId": "forest" },
      "performance": { "bpm": 100, "formation": "line", "cast": { "count": 3, "defaults": { "effect": "none" } } },
      "camera": { "subject": { "kind": "point", "position": [0, 1.2, 0] }, "shotSize": "wide", "angle": "eye", "position": "front", "moves": [{ "move": "hold" }] }
    }
  ]
}
```

Not expressible:

- A cast of zero. `performanceSchema.performers` requires at least one and
  `castSchema.count` has a minimum of 1, and `resolveScene` falls back to `[{}]`
  when neither is stated. The empty frame above is a hack: one idle performer
  parked forty metres away, whose position also grows `stageExtent`
  (`collectStageExtent`) and therefore the ground. That is a visible side effect.
  Closest seam: `castSchema.count` minimum, plus `buildResolvedPerformers`
  tolerating an empty roster and `computeCameraFraming` framing without
  performers.

Verdict: PARTIAL

### R24 A film that ends where it began, exactly (tier 3)

Dictation: Last shot has to match the first shot frame for frame so it loops
seamlessly. Same camera position, same performers, same step of the phrase.

Encoding: duplicate the opening scene as the closing scene, plus
`playback: { "loop": true }`.

```json
{
  "playback": { "loop": true, "autoplay": true },
  "scenes": [
    {
      "id": "open", "title": "Open", "durationBeats": 8,
      "performance": { "bpm": 120, "formation": "line", "cast": { "count": 3, "defaults": { "effect": "none", "sequence": { "word": "EMBER", "startPosition": "beta3", "level": 2, "turns": 0 } } } },
      "camera": { "subject": { "kind": "group" }, "shotSize": "wide", "angle": "eye", "position": "front", "moves": [{ "move": "hold" }] }
    },
    { "id": "middle", "title": "Middle", "durationBeats": 32, "transition": { "kind": "cut" }, "performance": { "bpm": 120, "formation": "line", "cast": { "count": 3, "defaults": { "effect": "none", "sequence": { "word": "EMBER", "startPosition": "beta3", "level": 2, "turns": 0 } } } }, "camera": { "subject": { "kind": "group" }, "shotSize": "medium", "angle": "low", "position": "left", "moves": [{ "move": "hold" }] } },
    {
      "id": "close", "title": "Close", "durationBeats": 8, "transition": { "kind": "cut" },
      "performance": { "bpm": 120, "formation": "line", "cast": { "count": 3, "defaults": { "effect": "none", "sequence": { "word": "EMBER", "startPosition": "beta3", "level": 2, "turns": 0 } } } },
      "camera": { "subject": { "kind": "group" }, "shotSize": "wide", "angle": "eye", "position": "front", "moves": [{ "move": "hold" }] }
    }
  ]
}
```

Not expressible:

- Phrase continuity across the loop. Each scene's `sequenceStep` restarts from
  scene time (`sample-film-director.ts` line 143), so the closing scene begins the
  phrase again from step 0 while the opening scene did the same. That happens to
  match, but only because both scenes are 8 beats and start at step 0. A film
  whose middle leaves the phrase mid-figure cannot resume it.
- Any statement that the two scenes must match. No assertion, no reference.

Verdict: PARTIAL

---

## Tier 4 — cinematography vocabulary

### R25 Dolly zoom (tier 4)

Dictation: The Vertigo shot. Push the camera in on her while the lens widens by
the same amount, so she stays exactly the same size and the background stretches
away behind her. Six seconds.

Encoding:

```json
{
  "id": "vertigo",
  "title": "Vertigo",
  "durationSeconds": 10,
  "performance": { "formation": "solo", "performers": [{ "id": "solo", "sequence": { "length": 10 }, "effect": "none" }] },
  "camera": {
    "subject": { "kind": "performer", "performerId": "solo" },
    "shotSize": "medium",
    "angle": "eye",
    "position": "front",
    "moves": [
      { "move": "push-in", "amount": { "meters": 2 }, "durationSeconds": 3 },
      { "move": "zoom", "direction": "out", "amount": { "degrees": 20 }, "durationSeconds": 3 },
      { "move": "hold", "durationSeconds": 4 }
    ]
  }
}
```

Not expressible:

- The two moves happening at once. `allocateMoveWindows` gives each move a
  disjoint window, so this reads as a push followed by a zoom, which is not a
  dolly zoom. This is the same concurrency gap as R08 and it is what makes the
  single most recognisable camera move in cinema unsayable. Runtime is
  indifferent: the resolved keyframe carries both `position` and `fovDeg`, so a
  concurrent compiler could emit the correct stream today.
- Holding subject size as a constraint. Even with concurrency there is no way to
  say "keep her this size" and let the compiler solve for the fov; the director
  would state both numbers.

Verdict: PARTIAL

### R26 Rack focus (tier 4)

Dictation: Two of them, one close to camera, one deep. Start sharp on the near
one with the far one soft, then rack the focus across so the far one comes sharp
and the near one blurs.

Encoding:

```json
{
  "id": "rack",
  "title": "Rack",
  "durationSeconds": 12,
  "performance": {
    "formation": "custom",
    "performers": [
      { "id": "near", "position": { "x": -0.6, "z": 1.5 }, "facingDegrees": 180, "sequence": { "length": 12 }, "effect": "none" },
      { "id": "far", "position": { "x": 0.8, "z": -3 }, "facingDegrees": 180, "sequence": { "length": 12 }, "effect": "none" }
    ]
  },
  "camera": {
    "shots": [
      { "subject": { "kind": "performer", "performerId": "near" }, "shotSize": "medium", "angle": "eye", "position": "front", "durationSeconds": 6 },
      { "subject": { "kind": "performer", "performerId": "far" }, "shotSize": "medium", "angle": "eye", "position": "front", "durationSeconds": 6 }
    ]
  }
}
```

Not expressible:

- Focus, focal distance, aperture, depth of field. The resolved keyframe carries
  `position`, `target`, `fovDeg`, `rollDeg` and nothing else
  (`ResolvedDirectorCameraKeyframe`, `film-director-schema.ts`). Runtime: the app
  has a post-processing stack (`src/lib/shared/3d/effects/post-processing/`,
  including `ScenePostProcessing.svelte` and `BloomEffect.svelte`) but nothing in
  it read here provides depth of field, so this is likely a new effect pass, not
  just a new axis. Report as unknown until `ScenePostProcessing.svelte` is read in
  full.
- The encoding above substitutes a cut for a rack, which is a different shot.

Verdict: NONE

### R27 Whip pan between two performers (tier 4)

Dictation: Snap the camera from him to her, fast enough to smear, then settle.
Then back again. Two whips.

Encoding:

```json
{
  "id": "whip",
  "title": "Whip",
  "durationSeconds": 12,
  "performance": {
    "formation": "custom",
    "performers": [
      { "id": "him", "position": { "x": -2.5, "z": 0 }, "facingDegrees": 180, "sequence": { "length": 12 }, "effect": "none" },
      { "id": "her", "position": { "x": 2.5, "z": 0 }, "facingDegrees": 180, "sequence": { "length": 12 }, "effect": "none" }
    ]
  },
  "camera": {
    "subject": { "kind": "performer", "performerId": "him" },
    "shotSize": "medium",
    "angle": "eye",
    "position": "front",
    "moves": [
      { "move": "hold", "durationSeconds": 4 },
      { "move": "pan", "direction": "right", "amount": { "degrees": 55 }, "durationSeconds": 0.3, "easing": "linear" },
      { "move": "hold", "durationSeconds": 3.4 },
      { "move": "pan", "direction": "left", "amount": { "degrees": 55 }, "durationSeconds": 0.3, "easing": "linear" },
      { "move": "hold", "durationSeconds": 4 }
    ]
  }
}
```

Not expressible:

- Motion blur. A whip pan reads as a whip because it smears; without blur a
  0.3-second pan is a fast, clean pan. No motion-blur pass appears in the
  post-processing directory listing read here. Unknown whether the renderer can do
  it; the file to check is `ScenePostProcessing.svelte`.
- Aiming a pan at a performer. `pan` takes degrees, so the 55 is the author's
  trigonometry from the two marks. There is no "pan to performer X".

Verdict: PARTIAL

### R28 Handheld (tier 4)

Dictation: Take it off the tripod. I want the whole scene handheld: small
constant drift and breath, like an operator holding a shoulder rig, tightening as
the phrase intensifies.

Encoding:

```json
{
  "id": "handheld",
  "title": "Handheld",
  "durationSeconds": 14,
  "performance": { "formation": "line", "cast": { "count": 3, "defaults": { "effect": "none" } } },
  "camera": {
    "keyframes": [
      { "atSeconds": 0, "position": [0, 1.6, 6], "target": { "kind": "group" }, "fovDeg": 50 },
      { "atSeconds": 1.2, "position": [0.06, 1.63, 5.97], "target": { "kind": "group" }, "fovDeg": 50 },
      { "atSeconds": 2.4, "position": [-0.05, 1.58, 6.02], "target": { "kind": "group" }, "fovDeg": 50 },
      { "atSeconds": 3.6, "position": [0.04, 1.62, 5.95], "target": { "kind": "group" }, "fovDeg": 50 }
    ]
  }
}
```

Not expressible:

- Handheld as a statement. It is hand-authored noise, capped at 32 keyframes
  (`cameraSchema.keyframes` max 32), which at four keyframes a second buys eight
  seconds of shake and no more. There is no shake, noise, or wobble parameter.
  Closest seam: a modifier on the sampled frame in `sample-film-director.ts`,
  which already post-processes the compiled track for tracking
  (`applyCameraTracking`) and would take a noise offset the same way. Runtime
  needs nothing new.
- Combining handheld with the framing grammar. Raw keyframes are exclusive with
  `subject`/`shotSize`/`angle`/`position`/`moves` (`cameraSchema` refine), so
  choosing handheld throws away the whole shot vocabulary and forces absolute
  world coordinates.

Verdict: PARTIAL

### R29 Insert shot on the tip of the staff (tier 4)

Dictation: Cut to a detail: just the end of the staff, filling the frame, moving
through its arc. Two seconds. Then back to the wide.

Encoding:

```json
{
  "id": "insert",
  "title": "Insert",
  "durationSeconds": 12,
  "performance": { "formation": "solo", "performers": [{ "id": "solo", "sequence": { "length": 12 }, "effect": "trails" }] },
  "camera": {
    "shots": [
      { "subject": { "kind": "group" }, "shotSize": "wide", "angle": "eye", "position": "front", "durationSeconds": 5 },
      { "subject": { "kind": "point", "position": [0.7, 1.9, 0.2] }, "shotSize": "close-up", "angle": "eye", "position": "front", "durationSeconds": 2 },
      { "subject": { "kind": "group" }, "shotSize": "wide", "angle": "eye", "position": "front", "durationSeconds": 5 }
    ]
  }
}
```

Not expressible:

- A subject attached to a hand, a prop, or a prop tip. `cameraTargetSchema` has
  exactly three kinds: `group`, `performer`, `point`. A performer subject resolves
  to their ground position plus an optional `height`
  (`resolveSubject`, `camera-language.ts`), not to a bone or a prop end. The point
  above is a fixed world coordinate the tip passes through once.
  Runtime HAS the data: `tip-position-bridge-3d.ts` publishes live tip positions
  for the effects system, so a `{kind: "propTip", performerId, hand}` subject has a
  source. It would need the same live-offset treatment `applyCameraTracking` gives
  a walker.
- `shotSize: "close-up"` on a point subject. The close-up target-height override
  in `computeCameraFraming` only fires for a performer subject, so a point
  close-up frames at the group's height.

Verdict: PARTIAL

### R30 Golden hour, then night (tier 4)

Dictation: First half at golden hour, low warm sun raking across them. Second
half after dark, cold, with fog sitting at knee height. Same location, just later.

Encoding:

```json
{
  "scenes": [
    { "id": "golden", "title": "Golden", "durationSeconds": 12, "location": { "environmentId": "autumn" }, "performance": { "formation": "line", "cast": { "count": 3, "defaults": { "effect": "none" } } }, "camera": { "subject": { "kind": "group" }, "shotSize": "wide", "angle": "low", "position": "front", "moves": [{ "move": "hold" }] } },
    { "id": "night", "title": "Night", "durationSeconds": 12, "transition": { "kind": "environment-dissolve", "durationSeconds": 1.5 }, "location": { "environmentId": "cosmic" }, "performance": { "formation": "line", "cast": { "count": 3, "defaults": { "effect": "none" } } }, "camera": { "subject": { "kind": "group" }, "shotSize": "wide", "angle": "low", "position": "front", "moves": [{ "move": "hold" }] } }
  ]
}
```

Not expressible:

- Time of day. There is no sun angle, colour temperature, or daylight axis. Each
  environment ships its own lighting component; "golden hour" is approximated by
  choosing a different environment entirely, which changes the whole world rather
  than the hour.
- Fog. `FogConfig` exists in the scene configs
  (`scene-configs/shared-scene-config.ts`, imported by `ember-atmosphere-looks.ts`)
  so the runtime HAS fog per environment, but there is no director axis and no
  adapter call.
- An atmosphere look, which is the closest existing thing to a lighting axis.
  `EMBER_ATMOSPHERE_LOOK_IDS` names three looks for the ember scene and
  `getEmberAtmosphereLook` resolves them; nothing in
  `director-viewer-adapter.ts` selects one. This is the cheapest lighting-shaped
  win available: a per-environment look id already exists as a catalog.

Verdict: PARTIAL

### R31 Split screen (tier 4)

Dictation: Same phrase, two performers, side by side in the frame but in
different worlds. Left half forest, right half ocean, hard vertical split down
the middle.

Encoding: none. There is no expressible fragment.

Not expressible:

- Frame composition of any kind. The film resolves to a single camera track and
  a single scene rendered by one viewer (`director-viewer-adapter.ts` drives one
  `viewer` instance). There is no compositing layer, no second camera, no frame
  regions. `format` (`FilmDirectorInputSchema`) sets one width and height for the
  whole film.
- Two environments at once. `location.environmentId` is one value.

Verdict: NONE

### R32 Match cut on a shape (tier 4)

Dictation: End the scene with her staff vertical, dead centre. Start the next
scene with a completely different performer, different place, staff vertical,
dead centre, same size in frame. The cut should feel like the staff never moved.

Encoding:

```json
{
  "scenes": [
    {
      "id": "before-the-match", "title": "Before", "durationBeats": 16,
      "location": { "environmentId": "forest" },
      "performance": { "bpm": 100, "formation": "solo", "performers": [{ "id": "her", "characterId": "ch34", "sequence": { "word": "EMBER", "startPosition": "beta3", "level": 2 }, "effect": "none" }] },
      "camera": { "subject": { "kind": "performer", "performerId": "her" }, "shotSize": "medium", "angle": "eye", "position": "front", "moves": [{ "move": "hold" }] }
    },
    {
      "id": "after-the-match", "title": "After", "durationBeats": 16,
      "transition": { "kind": "cut" },
      "location": { "environmentId": "ocean" },
      "performance": { "bpm": 100, "formation": "solo", "performers": [{ "id": "him", "characterId": "ch10", "sequence": { "word": "EMBER", "startPosition": "beta3", "level": 2 }, "effect": "none" }] },
      "camera": { "subject": { "kind": "performer", "performerId": "him" }, "shotSize": "medium", "angle": "eye", "position": "front", "moves": [{ "move": "hold" }] }
    }
  ]
}
```

Not expressible:

- Landing the outgoing scene on a specific prop pose. The scene ends when its
  duration runs out, at whatever fractional step that is; there is no "end on step
  N" or "end on this orientation". `holds` can park a performer on a step, which
  is the nearest tool, but it parks at progress 0 of that step, not at a chosen
  point in the arc.
- Matching the two framings. Both are medium shots on a solo performer, so they
  are close by construction, but `computeFramingShot` derives the distance from
  the performers' spread, so two different scenes are only coincidentally the same
  size. There is no absolute framing statement short of raw keyframes, which
  forbid the shot grammar.

Verdict: PARTIAL

---

## Tier 5 — performance direction

### R33 Mirrored pair, facing, watching each other (tier 5)

Dictation: Two of them a metre apart, facing each other, doing the same phrase
mirrored, and both looking at each other the whole time. Camera side on so I read
the symmetry.

Encoding:

```json
{
  "id": "mirror-pair",
  "title": "Mirror Pair",
  "durationSeconds": 14,
  "performance": {
    "formation": "facing-each-other",
    "cast": {
      "count": 2,
      "defaults": { "effect": "none" },
      "performers": [
        { "id": "performer-1", "sequence": { "word": "EMBER", "startPosition": "beta3", "level": 2, "turns": [1, 0] } },
        { "id": "performer-2", "sequence": { "mirrorOf": "performer-1" } }
      ]
    }
  },
  "camera": { "subject": { "kind": "group" }, "shotSize": "wide", "angle": "eye", "position": "left", "moves": [{ "move": "hold" }] }
}
```

Not expressible:

- Looking at each other. The formation sets body facing; there is no gaze. Same
  gap as R15.

Verdict: PARTIAL

### R34 Kneel, then rise (tier 5)

Dictation: She kneels down on count four, keeps spinning low for eight counts,
then rises on twelve and finishes standing.

Encoding:

```json
{
  "id": "kneel-and-rise",
  "title": "Kneel and Rise",
  "durationBeats": 16,
  "performance": {
    "bpm": 100,
    "formation": "solo",
    "performers": [
      {
        "id": "solo",
        "sequence": { "length": 16, "level": 2 },
        "stepEfforts": [
          { "step": 4, "effort": "press" },
          { "step": 12, "effort": "elastic" }
        ],
        "blocking": [{ "move": "stand" }]
      }
    ]
  },
  "camera": { "subject": { "kind": "group" }, "shotSize": "medium", "angle": "low", "position": "front", "moves": [{ "move": "hold" }] }
}
```

Not expressible:

- Kneeling, sitting, lying, crouching, jumping. The blocking verbs are `stand`,
  `walk`, `turn` and the rejected `run` (`DirectorBlockingVerb`,
  `blocking-language.ts`). Runtime: the locomotion state machine comment quoted in
  the capability matrix reads `idle <-> walk (4-way directional) <-> jump/fall/
  land/crouch`, so jump and crouch clips appear to exist in
  `@austencloud/scene-3d`'s `LocomotionAnimator` while kneel, sit, and lie do not.
  Verify against that animator before promising any of them.
- The encoding above substitutes effort changes for posture, which is a different
  thing entirely and should not be read as the request being met.

Verdict: NONE

### R35 Fire on one hand only (tier 5)

Dictation: Give him fire on the right hand and nothing on the left. It should
look like he is carrying the flame in one hand.

Encoding:

```json
{
  "id": "one-hand-fire",
  "title": "One Hand of Fire",
  "durationSeconds": 12,
  "performance": {
    "formation": "solo",
    "performers": [{ "id": "solo", "prop": "fire_double_staff", "effect": "fire", "sequence": { "length": 12 } }]
  },
  "effectPresets": { "fire": "fire-classic" },
  "camera": { "subject": { "kind": "group" }, "shotSize": "medium", "angle": "eye", "position": "front", "moves": [{ "move": "hold" }] }
}
```

Not expressible:

- Per-hand effect. `effect` is one value per performer (`performerSchema`) and
  `setEffect` sets the performer (`character-instance-state.svelte.ts` line 1019).
  `stepEffects` addresses a step but not a hand, unlike `stepPlanes` which does
  carry a `hand`. Runtime: unknown. `EffectOrchestrator3D` reads both prop states
  per performer (the blue/red prop-state seam named in the gap-2 acceptance
  record), so a per-hand split may be reachable, but it was not read in this pass.
  File to check: `EffectOrchestrator3D.svelte`.

Verdict: NONE

### R36 Two performers, one fat trail and one thin (tier 5)

Dictation: Both on trails, but hers are long and heavy and his are short and
faint. Same effect, different weight.

Encoding:

```json
{
  "id": "two-trails",
  "title": "Two Trails",
  "durationSeconds": 12,
  "performance": {
    "formation": "side-by-side",
    "cast": {
      "count": 2,
      "performers": [
        { "id": "performer-1", "effect": "trails" },
        { "id": "performer-2", "effect": "ghost" }
      ]
    }
  },
  "camera": { "subject": { "kind": "group" }, "shotSize": "wide", "angle": "eye", "position": "front", "moves": [{ "move": "hold" }] }
}
```

Not expressible:

- Two configurations of one effect id in one scene. Ruled and closed 2026-09-02:
  `PERFORMER_EFFECT_CONFIG_MESSAGE` (`film-director-schema.ts`) rejects
  `effectPresets`/`effectOverrides` on a performer, because `EffectsConfigState`
  holds one config per effect id per scene. The encoding above gives the second
  performer a different effect id instead, which is the documented workaround and
  is not what the director asked for.

Verdict: NONE (ruled)

### R37 Costume: one in red, one in blue (tier 5)

Dictation: Dress them. She is in red, he is in blue, and their staffs match. I
want the colour to read from the back of the room.

Encoding:

```json
{
  "id": "red-and-blue",
  "title": "Red and Blue",
  "durationSeconds": 12,
  "performance": {
    "formation": "side-by-side",
    "cast": {
      "count": 2,
      "defaults": { "effect": "none" },
      "performers": [
        { "id": "performer-1", "characterId": "ch34" },
        { "id": "performer-2", "characterId": "ch10" }
      ]
    }
  },
  "camera": { "subject": { "kind": "group" }, "shotSize": "wide", "angle": "eye", "position": "front", "moves": [{ "move": "hold" }] }
}
```

Not expressible:

- Costume colour. The only lever is which character model is cast
  (`CHARACTER_DEFINITIONS`, `character-model.ts`); a character's appearance is
  baked into its asset.
- Prop colour or tint. Ruled: no setter exists anywhere in `src/lib/shared/3d` or
  the scene package's `AvatarSkeletonBuilder` for an individually coloured prop;
  the UI colours in `PropPopover.svelte` are an index-based accent, not a material.
- Prop build and finish. `setPropBuild(propBuild)` DOES exist on the performer
  (`character-instance-state.svelte.ts` line 1081) and is never called by
  `director-viewer-adapter.ts`, which sets prop, effect, effort, staff length and
  planes and stops. `propFinishState` is a global in the scene package. So build
  and finish are real, callable, and unspoken; colour is neither.

Verdict: NONE

### R38 She throws it and he catches it (tier 5)

Dictation: On the last count she throws the staff up and across, and he catches
it clean on the downbeat. That is the whole shot.

Encoding: none. There is no expressible fragment beyond staging the two bodies.

Not expressible:

- Throws, catches, releases, airborne props. Props are rigidly bound to the
  performer's hands through the rig; nothing in the performer API read here
  detaches a prop or gives it independent physics.
- Prop transfer between performers, again (see R13).
- A shared event on a shared count. The two performers have independent step
  clocks (`beatOffset`, `holds`) and there is no cue or event vocabulary that two
  performers could both reference.

Verdict: NONE

### R39 Contact roll across the shoulders (tier 5)

Dictation: He rolls the staff across his shoulders, behind the neck, and out to
the other hand. Slow, four counts.

Encoding: none.

Not expressible:

- Contact work of any kind. This is explicitly a different discipline in this
  codebase: `.claude/rules/canonical-capabilities.md` routes contact state, palm
  coordinates, hand articulation and rolling poses to `features/contact-lab`, and
  `shared/3d/domain/prop-motion-discipline.ts` owns the split. Spinner props use
  `ViewerMotionSurface`, which is what the director path drives. A contact verb in
  the film language would cross a boundary the rules draw on purpose.
- TKA framing: contact staff is outside TKA (`.claude/rules/tka-domain.md`), so
  this request is out of scope for the language rather than merely unimplemented.

Verdict: NONE

### R40 Sound: the phrase lands on the hit (tier 5)

Dictation: There is a track under this. At eleven seconds there is a hit, and I
want the fire to catch on that hit and the cut to land on it too. Everything
keyed to the music.

Encoding:

```json
{
  "id": "on-the-hit",
  "title": "On the Hit",
  "durationBeats": 32,
  "performance": {
    "bpm": 120,
    "formation": "line",
    "cast": {
      "count": 3,
      "defaults": {
        "prop": "fire_double_staff",
        "stepEffects": [
          { "step": 0, "effect": "none" },
          { "step": 22, "effect": "fire" }
        ]
      }
    }
  },
  "effectPresets": { "fire": "fire-classic" },
  "camera": {
    "shots": [
      { "subject": { "kind": "group" }, "shotSize": "wide", "angle": "eye", "position": "front", "durationBeats": 22 },
      { "subject": { "kind": "group" }, "shotSize": "medium", "angle": "low", "position": "front", "durationBeats": 10 }
    ]
  }
}
```

Not expressible:

- Audio. No track, no cue, no sound at all in the schema.
  `SceneAudioPlayer.svelte` exists in `src/lib/shared/3d/components/` and takes a
  `backgroundType` prop, so the runtime plays environment audio, but nothing
  connects a film to a track or a timestamp. Whether it can play an arbitrary
  file is unknown; that component is the file to check.
- Named cues. "The hit at eleven seconds" is expressed twice, once as a step
  number and once as a beat count, and the two agree only because the author
  converted both by hand. A film-level named cue list that scenes, steps, and
  camera shots could all reference is the general form of this gap and would also
  answer R10, R14 and R38.

Verdict: PARTIAL

---

## Verdict tally

- FULL: 2 (R01, R04)
- PARTIAL: 27
- NONE: 11 (R13, R26, R31, R34, R35, R36, R37, R38, R39, plus two counted below)

Counting exactly: FULL 2, PARTIAL 29, NONE 9.

---

## Gap census

One row per distinct missing parameter, deduplicated across the forty requests.
"Runtime has it" answers whether the capability exists behind the language, not
whether it is wired to the director path.

| Parameter | Requests wanting it | Closest seam | Runtime already has it? | Size |
| --- | --- | --- | --- | --- |
| Scene inheritance / reusable blocks (a scene that says "same cast as scene 2") | 8 (R16, R17, R20, R21, R22, R24, R30, R32) | `filmDirectorInputSchema.scenes`, `resolveScene` in `resolve-film-director-spec.ts` | N/A, pure authoring layer | M |
| Concurrent camera moves (two gestures in one window; dolly zoom) | 6 (R08, R09, R25, R27, R28, R32) | `allocateMoveWindows` in `director-move-windows.ts`, `compileCameraMoves` in `camera-language.ts` | Yes, the keyframe already carries position + fov + roll | M |
| Lighting: rig, key light, atmosphere look, fog, time of day, weather | 5 (R09, R14, R30, R32, R37) | `locationSchema` in `film-director-schema.ts`; `EMBER_ATMOSPHERE_LOOK_IDS` / `getEmberAtmosphereLook` in `scene-configs/ember-atmosphere-looks.ts`; per-scene `*Lighting.svelte` | Partly: per-environment look presets and `FogConfig` exist; no per-scene or per-performer control | L |
| A named cue list scenes, steps and shots can all reference | 5 (R10, R14, R19, R38, R40) | `FilmDirectorInputSchema` (film level), `director-beat-times.ts` | N/A, authoring layer over existing clocks | M |
| Phrase continuity across a scene boundary | 4 (R16, R20, R22, R24) | `sample-film-director.ts` line 143 (`sequenceStep` from scene time) | Yes, the step is just a number | M |
| Per-hand effect, and effect intensity over time | 4 (R14, R35, R36, R40) | `performerSchema.effect` / `stepEffectEntrySchema`; `setEffect` in `character-instance-state.svelte.ts`; `EffectOrchestrator3D.svelte` | Unknown per hand; scene-wide config ruled fixed 2026-09-02 | L |
| Gaze / eye line / head aim | 3 (R15, R33, R34) | `setFacingAngle` in `character-instance-state.svelte.ts` | Unknown; check `AvatarSkeletonBuilder` in `@austencloud/scene-3d` | M |
| Camera subject attached to a hand or prop tip (insert shots, OTS) | 3 (R15, R29, R32) | `cameraTargetSchema` in `film-director-schema.ts`, `resolveSubject` in `camera-language.ts` | Yes, `tip-position-bridge-3d.ts` publishes live tip positions | M |
| Prop transfer, throws, catches, airborne props | 3 (R13, R38, R39) | `performerSchema.prop`, `setProp` in `character-instance-state.svelte.ts` | No, props are rig-bound per performer | L |
| Postures: kneel, sit, lie, jump, crouch | 3 (R34, R38, R39) | `DirectorBlockingVerb` in `blocking-language.ts` | Partly: the locomotion state machine names jump/fall/land/crouch; kneel/sit/lie not seen | L |
| Timed changes within a scene for a scalar axis (staff length, formation, environment, bpm) | 3 (R02, R11, R16, R20) | `stepEffects`/`stepEfforts` pattern in `film-director-schema.ts`, `director-step-changes.ts` | Yes for staff length (`setStaffLengthCm` is a live setter); no for environment | M |
| Post-processing: depth of field, rack focus, motion blur | 2 (R26, R27) | `ResolvedDirectorCameraKeyframe`; `src/lib/shared/3d/effects/post-processing/ScenePostProcessing.svelte` | Unknown; a post stack exists but no DOF or blur pass was seen | L |
| Handheld shake / camera noise | 1 (R28) | `applyCameraTracking` in `sample-film-director.ts` (same post-compile seam) | Yes, nothing new needed at the viewer | S |
| Time signature, bars, count-ins | 2 (R18, R19) | `convertSceneBeatTimes` in `director-beat-times.ts` | N/A, arithmetic only | S |
| Audio: track, cue, click | 2 (R19, R40) | no schema field; `SceneAudioPlayer.svelte` | Unknown, it takes only a `backgroundType` | L |
| Prop build and finish per performer | 1 (R37) | `performerSchema`; `setPropBuild` in `character-instance-state.svelte.ts` line 1081, uncalled by `director-viewer-adapter.ts`; `propFinishState` in the scene package | Yes, the setter exists and is never called | S |
| A cast of zero (empty frame) | 1 (R23) | `castSchema.count` min 1, `performanceSchema.performers` min 1, `buildResolvedPerformers` | Unknown, `computeCameraFraming` needs at least one position | S |
| A performer joining or leaving mid-scene | 2 (R11, R22) | `buildResolvedPerformers` count validation against `PRESET_VALID_COUNTS` | No, formation slots are fixed per scene | L |
| Directive grammar on numeric and enum non-catalog axes (level, beatOffset, canon offsets) | 2 (R07, R12) | `performerSequenceSchema.level`, `performerSchema.beatOffset`; `directiveSchema` in `directives.ts` | N/A, resolver layer | M |
| Seed sharing between scenes (quoting a scene that contains a pick) | 1 (R21) | `createAxisStream` / `resolveFilmSeed` in `directive-random.ts` | N/A | S |
| Scene blocking with a start offset, or more than one formation change | 2 (R11, R22) | `sceneBlockingSchema`, `movesToMark` in `resolve-film-director-spec.ts` | Yes, blocking keyframes are arbitrary | S |
| Per-performer prop colour or tint | 1 (R37) | none | No, ruled: no setter exists | L |
| Two configurations of one effect id in a scene | 1 (R36) | `PERFORMER_EFFECT_CONFIG_MESSAGE` | No, ruled 2026-09-02 | L |
| Split screen / frame composition / second camera | 1 (R31) | `FilmDirectorInputSchema.format`, `director-viewer-adapter.ts` (one viewer) | No | L |
| Ending a scene on a chosen prop pose (match cut) | 1 (R32) | `sceneSchema.durationSeconds`, `holds` | Partly, `holds` parks at progress 0 of a step only | M |
| Formation catalog additions (triangle and similar) | 1 (R03) | `DIRECTOR_FORMATIONS`, `PRESET_VALID_COUNTS` in `@austencloud/scene-3d` | No, scene-package change | M |
| Contact work: rolls, stalls, palm state | 1 (R39) | `prop-motion-discipline.ts`, `features/contact-lab` | Yes but deliberately separate; out of scope by rule | L |
| More than 8 performers | 0 stated, 1 brushed (R01 at the ceiling) | `castSchema.count` max 8 | No, ruled | M |
| A faster gait than a walk | 0 stated | `validateBlockingMove` rejection in `blocking-language.ts` | No, ruled | L |
