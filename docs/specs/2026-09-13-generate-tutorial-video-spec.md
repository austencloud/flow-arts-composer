# Generate tutorial and promo video specification

## Decision

Start with one wordless, outcome-led pilot: **Generate a mirrored pattern**.
It opens on a real generated sequence, shows the shortest settings interaction
that causes the result, then proves the captured result. Build it from a
semantic capture manifest. Assemble future lessons from the same small scene
units; cut vertical promos selectively from validated landscape source.

This is a production specification only. It does not authorize a UI change, a
recording, a render, or publication.

## Evidence and limits

| Source inspected | Established | Use in this specification |
| --- | --- | --- |
| `E:/tka-platform-media/shape-matrix-demo-2026-09-05-v3/shape-engine-full-demo.mp4` and `shape-engine-social.mp4` | Final H.264/AAC exports: 1920×1080 and 1080×1920, 30 fps, 217.288 s and 60.679 s. | Direct precedent for a landscape master and a selective vertical cut. |
| `.../production/final-full-timeline.json`, `validation-*.json`, and `previews/all-scenes-action-result-contact-sheet.jpg` | 25 Shape Engine scenes, eight selected for social, with action and result review frames. The contact sheet was visually inspected. | Reuse the action/result contract, dark quiet framing, restrained captions, and red/blue live-art emphasis. |
| `scripts/demo-capture/browser-director.mjs` and `CapturePointer.svelte` | Capture tooling sends native mouse movement and press/release, checks `:hover`, and writes frame plus `capture.json` evidence. | Reuse its proof model after checking Generate selectors. |
| `GeneratePanel.svelte` and `CardBasedSettingsContainer.svelte` | Current Generate cards include Word, saved setups, Length, Grid mode, Level, Turn intensity when applicable, Customize, LOOP, and Generate/Re-generate. Config persists locally. | Current capture surface only. Labels and layout must be re-checked before recording. |
| `HandRelationshipPanel.svelte` and `hand-relationship.ts` | Customize has Free, Mirrored, Flipped, Unison, Opposite; Inverted is disabled for Free; Match turns is disabled at Level 1; relationship and matching turns are distinct constraints. | The pilot teaches one relationship, then optionally Match turns as a separate constraint. |
| `generate-config.svelte.ts` and `generate-actions.svelte.ts` | Default config is an 8-step Level 2 Diamond rotated quartered LOOP, but saved config can replace it; freeform generation has random paths and no observed public capture seed. | Reset/apply a known setup before each take. A captured result is not a promise that a later click repeats it. |

No Generate-specific production recording or manifest was found among the
repository assets inspected. The Shape Engine artifacts are the authentic
feature-demo precedent; Generate footage must be captured from verified current
behavior at `/create/generate`.

Production decisions, not shipped behavior: a seedable generator, a stable deep
link to a recipe, a tutorial route, a capture fixture, a manifest location,
automatic re-recording, and a publication destination. A semantic mismatch
must mark a scene for review. It must never silently treat old footage as
current.

## Modular lesson plan

| Lesson | Real interaction | Required visible proof | Priority |
| --- | --- | --- | --- |
| `first-result` | Establish a known recipe, press Generate. | A new sequence arrives in the real workbench. | Pilot support. |
| `hand-relationship` | Customize → Hand Relationship → Mirrored → Generate. | Mirrored is selected and every captured step passes its relationship predicate. | Pilot. |
| `match-turns` | At a level with turns, enable Match turns → Generate. | Toggle is on and every captured step passes the turn predicate. | Pilot only if proof is available. |
| `inverted` | Select a non-Free relationship, enable Inverted → Generate. | Selected state and a separately proven output. | Follow-up. |
| `level-and-turns` | Change Level or Turn intensity → Generate. | Changed control and result. | Follow-up. |
| `loop` | Choose an actual supported LOOP → Generate. | Selected LOOP and an output-specific loop proof. | Follow-up. |
| `style-and-positions` | Change one Customize constraint → Generate. | The output proves the stated constraint. | Defer while Customize changes. |
| `saved-setup` | Apply named setup → Generate. | Applied recipe and saved-state policy are visible. | Defer pending fixture/account policy. |

Do not make the first video a catalogue of every control. The evolving interface
would make that footage stale quickly and it would teach labels without a
concrete result.

## Pilot storyboard: `generate-hand-relationship`

Landscape target: 45–60 seconds at the source cadence justified by capture.
Time ranges guide editing; browser automation waits for state, never fixed time.

| Scene | Target | Action | Copy | Verifiable result |
| --- | ---: | --- | --- | --- |
| `hook-result` | 0–5 s | Open on the finished real workbench sequence. | `Build a pattern with the hands already related.` | Result is readable before controls are introduced. |
| `open-customize` | 5–11 s | Native pointer opens Customize. | `Choose the relationship before you generate.` | Customize opens; Hand Relationship entry is visible. |
| `choose-mirrored` | 11–20 s | Select Mirrored. | Use the exact current UI wording. | Mirrored is visibly selected. |
| `generate` | 20–30 s | Return to panel and press Generate. | `Generate a new sequence from this recipe.` | Activation and completed reveal are visible. |
| `read-result` | 30–43 s | Hold the live sequence and existing workbench evidence. | `This captured sequence follows the Mirrored rule on every generated step.` | Independent predicate validates every recorded step. |
| `match-turns` | 43–54 s | When enabled in current UI, toggle Match turns and regenerate. | `Match turns adds the same turn amount on both hands.` | Separate relationship-and-turn proof. Omit if unavailable. |
| `outro` | 54–60 s | Hold clean real result. | `Choose a rule. Generate a pattern to explore.` | No repeatability claim. |

The 9:16 promo is a 20–30 second editorial cut of `hook-result`,
`choose-mirrored`, `generate`, and `read-result`. It needs its own crops,
safe-area review, contact sheet, and final validation. It is not a squeezed
landscape export.

## Capture language

Use the Shape Engine visual grammar: matte dark surround, large authentic app
artifact, sparse factual captions, a visible GhostPointer, and the app's
red/blue hand distinction. Keep landscape essential text above the lower 140 px
of a 1080p frame. Validate vertical text against top, bottom, and side player
overlays. Do not cover the control being demonstrated.

For every action, find a visible enabled control by current semantic role/name,
read its rectangle, move the real pointer into it, verify hover, press and
release the same target, wait for a meaningful state predicate, and record the
result. A fallback activation is permitted only when the proof names it. A
painted pointer followed by a DOM click is not interaction evidence.

## Semantic manifest and change review

Keep originals immutable by capture revision. The edit reads UTF-8 semantic
data, not hard-coded frame paths or timings. A minimal scene record is:

```json
{
  "schemaVersion": 1,
  "feature": "create-generate",
  "lesson": "generate-hand-relationship",
  "app": { "commit": "<captured SHA>", "route": "/create/generate" },
  "profile": { "viewport": [1920, 1080], "reducedMotion": false },
  "recipe": {
    "source": "reset-default-or-named-setup",
    "settings": { "length": 8, "level": 2, "gridMode": "diamond", "handRelationship": "mirrored", "handRelationshipInverted": false, "matchHandTurns": false }
  },
  "scenes": [{
    "id": "choose-mirrored",
    "action": { "role": "radio", "name": "Mirrored" },
    "expectedState": { "selectedRelationship": "mirrored" },
    "resultProof": "proof/choose-mirrored.json",
    "source": "raw/choose-mirrored.mp4",
    "editorial": { "seek": 0, "duration": 9, "caption": "Choose the relationship before you generate." }
  }]
}
```

The production schema also records the selected control states, readiness
checks, input method and coordinates, canonical generated-step digest, source
and delivery cadence, crop box, caption-safe area, audio provenance, and final
hashes. A scene can claim a setting only if its proof contains post-action UI
state and an output predicate appropriate to that setting.

At pre-render, compare every scene fingerprint against the current build:
commit/route, control role and accessible name, selected/disabled state, recipe
schema, expected output predicate, layout/crop allowance, and caption geometry.
Missing or renamed controls, changed disabled rules, a failed predicate, or a
changed safe area produces **needs review**. A person then updates the manifest,
retakes the scene, revises the claim, or retires it. Passing means reviewed
against this build, not automatically current forever.

Generate's known recipe can stabilize inputs but not random output. Store the
captured setup snapshot and canonical step digest; use that output only as
evidence of that take. If repeatable capture later becomes necessary, add a
scoped capture/test fixture or an explicit injectable random source, preserve
production defaults, and record the fixture and seed. Do not imply seedless
footage is reproducible.

## Pilot acceptance

1. Every scene comes from a real current Generate session and has native input,
   hover, action, state, and result proof.
2. Captions make only shipped, observed claims and remain clear with player
   controls shown.
3. Mirrored is validated across every captured step. Match turns, if used, has
   its own proof and is never conflated with the relationship rule.
4. Manifest links immutable raw source, action proof, output proof, edit
   timing/crop, and final hashes for each scene.
5. Landscape and vertical exports receive separate action/result contact sheets,
   final-frame review, and bounded decode/metadata/black-frame/audio checks.
6. A deliberate semantic-selector or expected-state change invalidates the
   relevant scene in the validator.

## Recommended implementation slice

Implement only the semantic validator and this pilot capture profile. Reuse the
existing capture director where its semantics still match, add Generate-specific
readiness and output predicates, and produce review contact sheets. Decide from
that pilot whether deterministic capture support is worth changing in production.
