# Create Method Previews

**Date:** 2026-10-06
**Status:** Approved by Austen 2026-10-06
**Owner:** Austen Cloud
**Builds on:** `2026-09-01-create-front-door-design.md`

## Problem

The Create front door asks **How do you want to create?** and gives each
method a card with a small icon, its name, and one line of description. The
icon names the method but does not show what happens inside it, so a newcomer
chooses from vocabulary alone.

The cards also leave most of their room unused. At the opened Galaxy Z Fold
6's screen size, each card is 336×207 CSS px. Its icon is an 18px glyph in a
44px box, and more than half of the card is empty.

## Outcome

Each card's icon box becomes a small live preview that acts out the method
with the app's own renderers and data. The method icon moves beside the name,
so the cards still match the sidebar.

The cards take turns. One card at a time plays its scene, then rests on the
finished picture the scene ends on, so a resting card still shows what its
method makes.

## Decisions

Austen chose these on 2026-10-06:

| Question                | Choice                                                                    |
| ----------------------- | ------------------------------------------------------------------------- |
| How previews move       | Take turns, one card at a time, in board order                            |
| Where a preview sits    | Room-based: it takes the icon's place and grows into room the text leaves |
| What each card acts out | The six scenes under **Scenes**                                           |

Three details were settled while writing this spec, and Austen approved them
in review the same day:

1. **Turns stop after two rounds.** Each time the front door opens, the cards
   take two rounds of turns, about 45 seconds in all, and then rest. See
   **Turns**.
2. **No pause button.** The motion stops by itself, and both reduce-motion
   settings turn it off. See **Turns** for the accessibility tradeoff.
3. **The Tunnel fallback adds a step strip.** The formation ring alone cannot
   show a performer getting a new sequence, so the fallback pairs the ring
   with that performer's steps. See **Tunnel**.

## Evidence: Card Sizes Today

Measured on `/create` on 2026-10-06 in the agent browser, emulating each
viewport. The two Fold viewports use the Fold 6's own screen sizes, read from
the phone over wireless debugging. Spare height is the card height left after
padding, icon, and text. It varies within a tier because descriptions differ
in length; Shape's is the longest.

| Viewport  | Device               | Card (W×H)                     | Icon today     | Icon box / glyph | Spare height |
| --------- | -------------------- | ------------------------------ | -------------- | ---------------- | ------------ |
| 375×667   | iPhone SE            | 174×188                        | above text     | 40 / 16          | 1–61         |
| 369×850   | Fold cover           | 171×204                        | above text     | 40 / 16          | 18–58        |
| 707×823   | Fold open, portrait  | 336×207                        | beside text    | 44 / 18          | 90–130       |
| 823×707   | Fold open, landscape | 394×172                        | beside text    | 49 / 18          | 67–90        |
| 960×412   | short landscape      | 427×105                        | beside text    | 36 / 16          | 31–48        |
| 820×1180  | tablet portrait      | 392×315                        | beside text    | 49 / 18          | 210–232      |
| 1440×900  | laptop               | primary 632×200, other 306×229 | beside / above | 72 / 28, 48 / 20 | 64 / 1–24    |
| 1920×1080 | 4K at 200%           | primary 710×200, other 345×229 | beside / above | 72 / 28, 48 / 20 | 64 / 1–24    |
| 2560×1440 | 4K at 150%           | primary 790×200, other 385×208 | beside / above | 72 / 28, 48 / 20 | 64 / 3–26    |
| 3840×2160 | 4K at 100%           | same as 2560×1440              | beside / above | 72 / 28, 48 / 20 | 64 / 3–26    |

The iPhone SE board already scrolls: 737 px of content in a 623 px board. No
other measured board scrolls. From 1440×900 up, the six cards sit in two rows
about 430–450 px tall in total (448 px measured at 2560×1440 and 3840×2160),
on boards 900–2160 px tall, so desktop has vertical room to spare.

## Placement

The preview replaces the icon box. The board's existing `create-entry`
container tiers choose the arrangement, so every card in a row gets the same
one and nothing is measured per card.

| Board tier                                        | Card shape there  | Preview                                                    |
| ------------------------------------------------- | ----------------- | ---------------------------------------------------------- |
| Narrow, icon above text (iPhone SE, Fold cover)   | 171–174 wide      | Full-width strip where the icon row is today               |
| 480–1199 px, portrait board (Fold, tablet)        | 336–392 × 207–315 | Strip on top, text below                                   |
| 480–1199 px, landscape board (Fold landscape)     | 394×172           | Square beside the text                                     |
| Short landscape (existing height rule)            | 427×105           | Square beside the text                                     |
| 1200 px and up, primary row (Construct, Generate) | 632–790 × 200     | Square beside the text                                     |
| 1200 px and up, other rows                        | 306–385 wide      | Strip on top; these cards grow into the spare board height |

These rules hold everywhere:

- Text keeps its type sizes and is never clipped or truncated. With the icon
  beside the name, text in a strip layout gets the card's full width, so
  descriptions wrap less than today.
- When room is tight, text comes first, then the board's height, then the
  preview's size. A square beside the text shrinks before it pushes the card
  taller.
- A preview is never smaller than that tier's icon box today.
- Previews in one row share one size: the room the row's longest text leaves.
  Previews and names line up across the row.
- No board gains scrolling. The iPhone SE board scrolls no further than now.
- The preview is an artifact under the 4K rule: its drawing scales with its
  box, while the name, description, and badges stay on the global type roles.
- The **Last used** and **Free account** badges keep their pinned top-right
  place on the border. A strip on top starts below the badge's overhang.
- Each box is reserved from first paint and shows the method's tint until its
  scene is ready. `Crossfade` then brings in the scene's finished picture.
  Nothing around it moves.

## Scenes

Every scene follows one contract:

- It is built from the renderers and data its method uses, so a card cannot
  promise something the method does not do.
- A turn is about three seconds: the scene clears, builds for about two
  seconds, and settles on its finished picture. That picture is the card's
  resting state.
- Props use the app's prop artwork from settings, like every other surface.
- It is decorative. It contains no buttons, links, or focusable elements, and
  the card stays one native button.
- It composes for three box shapes: a short strip, a roomy strip, and a
  square. Square drawings (Tunnel, Assemble) sit centered in a strip.
- Taps are shown by the shared `GhostPointer`, the same demo finger the
  Composer page's Construct and Generate demos use.
- Its component header names the method flow it mirrors.

Data is local. Scenes use the 16-step demo sequence the home page already
ships (`demo-sequence.json`) and `drawMatrixRealization()`, the Firebase-free
source of real Shape Matrix sequences behind the home hero. No Firestore
reads, no workers.

### Construct

A tap picks a start position. Steps then join a short strip one at a time,
each with its own small tap, as the option picker adds steps to the step grid.
Drawn with `PictographContainer` from the demo sequence's start position and
first steps.

A short strip holds the start and two or three steps; a roomy strip holds up
to four. A square shows a 2×2 grid that wraps like the step grid. The finished
picture is the start position with its steps.

### Generate

The dice is pressed and the whole strip washes in at once, in the step grid's
own diagonal wave: each cell's band is its row plus its column, staggered by
CSS animation delay. Each turn rolls a different real sequence from
`drawMatrixRealization()`; if that source fails, turns step through the demo
sequence instead. The dice is drawn as a plain glyph for `GhostPointer` to
press, never a real button.

Before its first turn, the card rests on the demo sequence's opening steps.
After each turn it rests on the latest roll, so its second turn shows a new
one. A strip shows the dice and three or four steps. A square shows a 2×2 or
3×3 grid, where the wave reads best.

### Shape

A corner of the real matrix: blue-hand flowers down the side, red-hand flowers
across the top, and cells drawn by `ShapeMatrixMandalaArt` from
`loadShapeMatrix()` for the user's prop. A highlight lands on one cell. The
cell grows and draws its mandala from start to finish.

The drawing reuses the Matrix's own guide painter, `paintMandalaGuide`, with
its progressive reveal (`reveal` and `progress`). The live mandala overlay
traces mandalas with that same reveal, and the matrix tiles are painted by
the same painter, so the drawing finishes as exactly the tile's picture. If
the scene needs an entry point that paints one reveal frame at a given size,
the way `renderMandalaGuideImage` paints a still, it is added beside that
function.

A short strip has no room to grow, so it shows one blue flower and the cells
that fit, and the chosen cell draws in place. The finished picture is the
corner with the chosen mandala drawn. Loading the matrix here also warms the
cache Shape uses, so Shape opens faster afterward.

### Fuse

A blue one-hand path and a red one-hand path slide together and play once as a
two-prop sequence. The paths are the demo sequence's two hands, shown one hand
at a time with `PictographContainer`'s `visibleHand`, as `FuseSourceCard`
shows Fuse's inputs. After they merge, the combined steps play once with props
traveling their real paths (`motionStartData` and `motionProgress`).

A strip shows two blue and two red steps meeting as two combined steps. A
square stacks the blue row over the red row and merges them into one. The
finished picture is the combined steps.

### Tunnel

A tunnel plays. The dice on one performer is pressed, that performer gets a
new sequence, and the tunnel redraws. In the Tunnel tool, a performer card's
dice does exactly this.

The tunnel is drawn by the real `TunnelArtView`: one instance, for this card
only, with a formation from `TUNNEL_PRESETS` and its trail overlay off. Its
own `playing` prop follows the card's turn, so it is still between turns. It
must pass the cost gate under **Performance**.

If it fails the gate, the scene falls back to the real `PerformerRing` from
Stage settings, whose accent halo marks the base performer, beside that
performer's step strip. The dice re-rolls that performer, and its strip
washes in again with the step grid's wave.

The tunnel sits centered in a strip. The finished picture is the redrawn
tunnel.

### Assemble

On the real grid (`GridSvg`), a blue prop hops from point to point. A red prop
then makes the same number of hops while the blue prop moves with it as a dim
ghost, and both settle. Hops use Assemble's own arc motion (`SvgPropAnimator`),
so they curve as they do in the tool. The points come from the demo sequence's
hand locations.

`InteractiveGrid` itself is not reused, because it is interactive and needs a
live Assemble state. The grid sits centered in a strip. The finished picture
shows both props on their final points, as Assemble does on **Complete**.

## Turns

- Cards take turns in board order. A turn is one scene, about three seconds,
  then a gap of about half a second before the next card. One constant in the
  turn coordinator owns these timings, including the hover delay below.
- Turns begin after the board has painted, the browser is idle, and any
  chooser crossfade has finished, so opening Create is not slowed.
- Each time the front door opens, the cards take two rounds of turns, then all
  rest on their finished pictures.
- With a mouse or trackpad, resting the pointer on a card for a moment, or
  reaching it by keyboard, plays that card now. A card cut off mid-scene
  crossfades to its finished picture. Automatic turns wait while the pointer
  stays on that card or it keeps focus, then resume where they left off,
  restarting the interrupted card's turn. These extra turns do not count
  toward the two rounds, and they keep working after the rounds end.
- On touch screens a tap opens the method, so cards only take automatic turns.
- Turns pause while the page is hidden or the board is off screen, then resume
  where they stopped.
- Choosing a method ends the turns. Coming back to the front door starts two
  new rounds.
- With reduced motion on, in the system or in the app's own Reduce Motion
  setting, no scene plays. Every card shows its finished picture and the
  pointer never appears.
- Locked cards, such as account-only methods for guests, take turns like the
  rest. The **Free account** badge explains the lock.

Why two rounds: the previews explain the methods to someone deciding. Two
rounds do that. Endless motion beside text distracts and drains phone
batteries.

Why no pause button: WCAG 2.2.2 (Pause, Stop, Hide) asks for a way to pause,
stop, or hide automatic motion that lasts more than five seconds. This design
bounds the motion to about 45 seconds and relies on the system and app
reduce-motion settings as the stop. The shipped notation-caps redesign
(`2026-07-20-notation-caps-redesign-design.md`) made the same call for a
looping demo, at Austen's direction. A board-level pause button would meet the
criterion more strictly; the Browse mandala detail preview
(`MandalaDetailPreview.svelte`) has one. Adding it later does not change the
rest of this design.

## Performance

The front door must open as fast as it does now.

- The first paint carries no scene code. Scene modules load by dynamic import
  after first paint, in idle time, while the reserved boxes hold their tint.
- No Firestore, workers, or WebGL. Data is the demo sequence (41 KB, loaded
  with the scenes), two small static files (`tnd-base-words.json`, 88 KB, and
  `DiamondPictographDataframe.csv`, 33 KB), and the pictograph assets the
  methods already load.
- Only the card whose turn it is animates. Resting cards are static: SVG, DOM,
  or a stopped canvas.
- The turn coordinator composes the canonical render gate
  (`createRenderActivityGate`, `renderGateTarget`) for the hidden-page and
  off-screen pauses. Each scene stops its own motion between turns; Tunnel
  does it through `TunnelArtView`'s `playing` prop.
- Cost gate on the Fold: previews add no main-thread task over 50 ms after
  first paint, a turn holds 60 fps, and cards become tappable as soon as they
  do today. `TunnelArtView` and `loadShapeMatrix()` are the likeliest misses.
  Tunnel has its fallback. For Shape, the matrix build moves into idle-sized
  chunks inside its owner, which also helps Shape open faster.

## Accessibility

- Cards stay native buttons with their current accessible names. The preview
  adds nothing to the name.
- The preview is `aria-hidden="true"`, holds no focusable or interactive
  elements, and ignores pointer events, so the whole card stays one target.
- Essential text stays at least 14px, supporting text at least 12px, and
  targets at least 44px.
- Reduced motion is read through `reducedMotion()` and the global
  reduced-motion CSS, which cover both the system and the app setting.
- The description text stays, so the preview is never the only explanation.
- The board stays usable at 200% browser zoom. The narrow tier's strip rule
  applies when zoom pushes the board into that tier.

## Ownership

### Discovery

Searched on 2026-10-06 for `preview`, `previews/`, `attract`, `GhostPointer`,
`ghost pointer`, `round robin`, `take turns`, `turnIndex`, `spotlight`,
`LiveSlots`, `data-paused`, `renderGateTarget`, `reducedMotion`,
`--wave-band`, `diagonal wave`, `stroke-dashoffset`, `pathLength`, `reveal`,
`paintMandalaGuide`, `PerformerRing`, `tunnel-poster`, `demo-sequence`,
`drawMatrixRealization`, `loadPreviewSequence`, `SvgPropAnimator`, and
`LastUsedBadge`.

| Capability                    | Closest existing owner                          | Decision                                  |
| ----------------------------- | ----------------------------------------------- | ----------------------------------------- |
| Live preview in a choice card | Play hub previews                               | Compose; record the second use            |
| Taking turns across cards     | None (`LiveSlots` differs)                      | Create `createMethodPreviewTurns()`       |
| Hidden and off-screen pauses  | `createRenderActivityGate`, `renderGateTarget`  | Reuse                                     |
| Reduced motion                | `reducedMotion()`, reduced-motion CSS           | Reuse                                     |
| Tint-to-scene swap            | `Crossfade`                                     | Reuse                                     |
| Demo taps                     | `GhostPointer`                                  | Reuse; compact size only if needed        |
| Pictographs                   | `PictographContainer`                           | Reuse                                     |
| Diagonal wave                 | Step grid reveal                                | Extend so the Generate scene shares it    |
| Shape cells                   | `ShapeMatrixMandalaArt`, `loadShapeMatrix()`    | Reuse                                     |
| Mandala drawing               | `paintMandalaGuide` reveal                      | Reuse; reveal-frame entry point if needed |
| Tunnel drawing                | `TunnelArtView`; fallback `PerformerRing`       | Reuse, gated by cost                      |
| Assemble hops                 | `GridSvg`, `SvgPropAnimator`                    | Compose                                   |
| Sequences without Firebase    | `demo-sequence.json`, `drawMatrixRealization()` | Reuse                                     |

Notes on the decisions:

- **Play hub previews** (`learn/play/components/previews/`, `preview-map.ts`,
  `GameCard`) already put a decorative stage inside a button card, drawn with
  real renderers, with a finished frame under reduced motion. This is the
  pattern's second use, so `canonical-capabilities.md` records it with both
  consumers. A third consumer extracts a shared stage.
- **`LiveSlots`** grants concurrent live tiles by distance from the viewport
  center, and Play previews all loop at once. Neither passes one turn around
  in board order. The new coordinator lives in
  `features/create/shared/state/`, owned by Create.
- **Render gate:** PlayHub's local IntersectionObserver is not copied.
- **Diagonal wave:** the band math lives in `step-grid-display-state.svelte.ts`
  and the `--wave-band` keyframe in `WorkspaceGrid.svelte`. Both move where
  the step grid and the Generate scene use them, so there is one wave.
- **`InteractiveGrid`** is interactive and needs live Assemble state, so the
  Assemble scene composes its parts instead.
- **Play's `loadPreviewSequence()`** reads Firestore, so it is not used.

Required reports:

- Composing `PictographContainer`, `GhostPointer`, `Crossfade`, and the render
  gate in new feature components `CreateMethodPreview` and six scene
  components.
- Creating preview turn-taking with `createMethodPreviewTurns()` as owner;
  closest match `LiveSlots` differs because it grants concurrent live tokens
  by viewport distance instead of passing one turn around in board order.
- Reusing `paintMandalaGuide`'s progressive reveal for the Shape scene's
  drawing, extending `mandala-guide-image.ts` with a reveal-frame entry point
  only if the scene needs one.
- Extending the step grid's diagonal wave so the Generate scene shares it.

### Front Door Owners

| Owner                                                            | Outcome                                                         |
| ---------------------------------------------------------------- | --------------------------------------------------------------- |
| Selection: `onSelect`, `onLockedSelect`, locked methods          | Keep                                                            |
| Input: native button, focus ring                                 | Keep; hover and focus also request a turn                       |
| Chooser and workspace handoff: `DualSourceCrossfade`             | Keep                                                            |
| Haptics on select                                                | Keep                                                            |
| Analytics: `logCreateFrontDoorViewed`, `logCreateMethodSelected` | Keep; no new events                                             |
| Badges: `LastUsedBadge` for Last used and Free account           | Keep                                                            |
| Responsive layout: `create-entry` container tiers                | Extend with the placement rule                                  |
| Typography: global type roles                                    | Keep                                                            |
| Color: `CREATE_TABS` color, whole-surface tint, full border      | Keep; the preview takes the method color as its accent          |
| Method icon from `CREATE_TABS`                                   | Extend: moves beside the name at name size, in the method color |

## Canon Update

`visual-design-canon.md` §15 says the tiles avoid "invented workflow
graphics". Previews built from the methods' own renderers are not invented,
and §8 already calls for "sequence and pictograph previews for creation or
browsing choices." The motion belongs to the artifact, which §9 allows. §15
gains one paragraph: each tile shows a live preview built from its method's
real renderers and data, the tiles take turns and rest on a finished picture,
and the icon sits beside the name. The ban on invented workflow graphics
stays.

## Files and Systems

New, under `src/lib/features/create/shared/`:

- `components/method-previews/CreateMethodPreview.svelte`: reserved box,
  scene loading, and turn wiring
- `components/method-previews/ConstructScene.svelte`, `GenerateScene.svelte`,
  `ShapeScene.svelte`, `FuseScene.svelte`, `TunnelScene.svelte`, and
  `AssembleScene.svelte`
- `state/method-preview-turns.svelte.ts`: `createMethodPreviewTurns()`

Also new: `src/routes/test/create-method-previews/+page.svelte`, a prototype
route for the composition comparison and device checks.

Changed:

- `CreateFrontDoor.svelte`: icon beside the name, preview slot, placement CSS
- `step-grid-display-state.svelte.ts` and `WorkspaceGrid.svelte`: shared wave
- `mandala-guide-image.ts`: reveal-frame entry point, only if needed
- `GhostPointer.svelte`: compact size, only if needed
- `docs/architecture/visual-design-canon.md` §15 and
  `docs/architecture/canonical-capabilities.md`

## Verification

1. Unit tests for the turn coordinator: board order, two rounds then rest,
   hover and focus turns and the resume that follows, pauses for a hidden page
   and an off-screen board, new rounds on return, and no turns under reduced
   motion.
2. Unit tests showing the step grid and the Generate scene get the same wave
   bands, and for the reveal-frame entry point if one is added.
3. Composition before production code, on the prototype route with real
   scenes: ui-bust in Plan mode with rubric VR-1, comparing at least two
   compositions within the approved placement. For example, the preview as an
   inset stage inside the card's padding, against the preview running to the
   card's edge. The evidence ledger was last refreshed 2026-09-21 and the
   reviewer is not calibrated. Use a separate reviewer where the runtime
   allows; otherwise label the review a less independent self-review, as the
   ui-bust skill requires.
4. Full viewport pass at 375×667, 960×412, 820×1180, 1440×900, 1920×1080,
   2560×1440, and 3840×2160, plus the real Fold (open in both orientations,
   and the cover screen) and 200% zoom. Each frame checks clipping, row
   alignment, scrolling, and the reserved boxes before load.
5. Motion checks: a full round on desktop and on the Fold, hover and keyboard
   replays, a turn interrupted mid-scene, a return from a method, and both
   reduce-motion settings.
6. A Fold performance trace from opening Create through the first round,
   against the cost gate.
7. A clean console, no Firestore requests from the front door in the network
   log, and unchanged selection analytics.

## Risks

- **Phone performance.** Mitigated by one animating card at a time, scenes
  loaded after first paint, and the Fold trace as a gate.
- **Tunnel weight.** `TunnelArtView` is the heaviest piece. The fallback is
  defined.
- **Tiny boxes.** On the iPhone SE and the Fold cover, strips are roughly
  40–58 px tall, where pictographs read only as small shapes. If the prototype
  shows them unreadable, those tiers show fewer, larger items. Cards do not
  grow.
- **Drift.** The drawings come from the methods' own components, so they
  follow visual changes. The scripted beats can still fall behind a method's
  flow. Each scene's header names the flow it mirrors, so a change to that
  flow can be checked against it.
