# Composer page: one sequence, carried

Date: 2026-10-07. Status: approved direction, spec awaiting Austen's review.
Route: `/composer` (`src/routes/(public)/composer/`). Branch:
`codex/composer-one-sequence` in `E:/worktrees/tka-platform/composer-one-sequence`.

## Decisions already made

Two reviews of the live page on 2026-10-07 (a self-review and an independent
reviewer) agreed that the page shows five unrelated demonstrations instead of
one piece of work moving through the product. Austen chose:

- Direction A, "One sequence, carried", over a tabbed workspace page and a
  short page with film.
- Fold the near-empty "The Kinetic Alphabet" stop into the hero rather than
  keeping it or moving it after Keep.

Kept as they are: the Glide stage and its motion, the 3D portal from the card,
the community gallery, the Construct builder's size cap, one stop per
demonstration (Austen, 2026-09-28), and no stop ending in a link into the app.

## Goal

A visitor who lands on `/composer` sees a real sequence playing, and then sees
that same sequence built, generated, multiplied in the tunnel, performed in 3D,
and offered to keep. The word is visible on every stop in the app's own
notation glyphs. Touching the hero or leaving it freezes the word so the thread
does not change underneath the reader.

Non-goals: the dead route code under `_launchpad/` and `_sections/` (except
`ConstructSection.svelte`, which the page uses), the duplicate Back controls
(header Back and the stage's previous arrow), unifying the three "Open" labels,
and any change to the stage's glide or the portal's motion.

## What the page does today

- `carriedSequence = visitorSequence ?? latchedHeroSequence ?? FALLBACK_DEMO`
  in `ComposerExperience.svelte`. Only the hero act's first live draw latches.
  The hero keeps auto-advancing at every loop boundary (about every 16 s), so
  the word the lower stops use is rarely the word the hero is showing.
- Construct's `onVisitorComposed` and Generate's and the tunnel's `onGenerated`
  set `visitorSequence`, which then wins forever. Generate adopts a new page
  sequence only while `!hasGeneratedLocally`.
- Construct and Generate each render their own word row with the shared
  `WordLabel`. The tunnel and 3D stops never show their word.
- "Keep the sequence you made." heads four community sequences. The visitor's
  sequence never appears there.
- The hero's right column stacks the player, the Roll pill, the prop button,
  and the Theme chip. The player's corner pause is 48 px but has opacity 0 and
  no pointer events while playing until the canvas is hovered
  (`AnimatorCanvas.svelte`, `.corner-toggle`). The gold number beside the word
  is the difficulty level badge in `layers/WordHeader.svelte`, with no
  accessible name.
- Below 600 px the 3D stop hides `.viewer-output` and shows only the WebGL2
  note. The truth matrix says "Always provide a poster or 2D fallback."
- `feature-truth-matrix.md` describes tunnel arrangements (Ring, Mirrored,
  Canon) and a "disclosed recipe" for the generator that the page does not
  show.

## Design

### 1. The page sequence

One piece of state replaces the two-variable priority: a page sequence with
its origin.

```ts
type PageSequenceSource =
  | "opening"
  | "hero"
  | "construct"
  | "generate"
  | "tunnel";
type PageSequence = { sequence: SequenceData; source: PageSequenceSource };
```

A pure reducer in `composer-sequence-ownership.ts` owns the rule:

- `carry(state, { source, sequence })` returns the new state. Last write wins.
- A `null` or undefined sequence never replaces the current one.
- The initial state is `{ sequence: FALLBACK_DEMO, source: "opening" }`.

Writers:

- Hero: an effect carries every change of `heroAct.sequence` that is not the
  baked opening, with source `"hero"`. Before the hold (below) the reader is
  still at the hero and the lower demos are not mounted, so auto-rolls cost
  nothing downstream. After the hold the hero changes only on an explicit
  Roll, so the effect then fires only for visitor choices.
- Construct: `onVisitorComposed` carries with source `"construct"`.
- Generate and tunnel: `onGenerated` carries with sources `"generate"` and
  `"tunnel"`.

Readers: Generate, tunnel, 3D, and Keep all read `pageSequence.sequence`.
The gallery demo receives it as `featured` (section 4). The existing
`resolveComposerCarriedSequence` is removed; `isVisitorOwnedConstructSequence`
stays.

Generate's adoption rule loses the `hasGeneratedLocally` flag:
`shouldAdoptCarriedSequence(current, incoming, inViewport)` is true when the
demo is in view and `incoming.id !== current?.id`. Generate's own draws set the
page sequence, so the next incoming id equals its current id and nothing
churns. A later hero Roll or Construct build changes the id, and Generate
catches up when it returns to view.

Short words carry as they are. A one-step Construct sequence is a valid
sequence for the tunnel and the 3D viewer; no minimum length is imposed.

### 2. The hero holds

`createHeroAct` gains `hold()` and a `held` getter. While held,
`offerSequenceBoundary` returns `null` at every boundary, so the player keeps
looping the current sequence. `advanceNow` (the Roll button) still advances
while held. `hold()` is idempotent and has no release; a reload starts fresh.

`ComposerExperience.svelte` calls `heroAct.hold()` on:

- the first pointerdown or keydown inside the hero's player column (Roll, prop
  chooser, pause, scrub, Theme);
- the hero stop leaving view, through an action on the hero section built on
  `observeComposerStopVisibility`: scrolled past on the plain page, or no
  longer the stage's current stop. Construct's near-activation cannot be the
  trigger: the stage keeps the next stop inside the window so it loads early,
  which would hold the hero at load. A deep link or a restored scroll arrives
  already past the hero and holds it at once.

Reduced motion: the hero already starts paused (`autoPlay={!reduceMotion}`),
so no boundary ever fires; hold changes nothing there.

### 3. One word row on every demonstration

A new `ComposerWordRow.svelte` in `_components/` replaces the two near-copies
(Construct's `header.demo-status.word-label-area` and Generate's
`header.word-slot`). It renders, left to right: an optional prop chooser
snippet, the shared `WordLabel` with `activeStepNumber`, and an optional
trailing snippet. It owns the fixed row height that keeps the grids below from
shifting when a hint swaps for a word, and an `aria-live` setting the host
controls. Props:

```ts
{ word: string; activeStepNumber?: number | null; live?: "polite" | "off";
  hint?: Snippet; propControl?: Snippet; trailing?: Snippet }
```

Where it appears:

- Construct: the word being built (existing behavior), with the existing hint
  copy when there is no word yet. The build becomes the page word only when
  the visitor composes it.
- Generate: the page word, as today.
- Tunnel (the page uses the band layout): a row above the square stage inside
  the band's stage column, with the page word and the prop chooser, which
  leaves the stage toolbar. The square layout is unchanged.
- 3D: a row above the product frame in `ComposerExperience.svelte` with the
  page word only. The 3D performers carry their own props, so no chooser.

The WordLabel glyphs are the thread. No caption repeats the word in prose on
these four stops.

### 4. Keep shows yours first

The section's intro in `ComposerExperience.svelte` stays static, because the
stage reads the rail label from the h2 and the section's accessible name
points at it before the lazy demo mounts. Its h2 becomes "Keep this
sequence." (from "Keep the sequence you made."), the limits sentence stays
("Guests keep three sequences on this device. A full account keeps a cloud
library and collections."), the "Choose a sequence below to watch it here."
sentence goes, and the "Browse the Gallery" link stays in the intro actions.

The intro's second column holds the featured card: the landing's own
`ChoreoCardPreview` renders the page sequence as a card straight from its
steps (a hero draw or a fresh build has no saved thumbnail, and the gallery's
`ChoreoCardThumbnail` goes through the cloud thumbnail cache, which an
ephemeral sequence must not touch). It is a picture, not a button. Under it a
one-line caption names the origin from the page sequence's source: "The
sequence playing above." for opening and hero, "The sequence you built." for
construct, "The sequence you generated." for generate and tunnel. It mounts
when the Keep stop nears, with the gallery.

`ComposerGalleryDemo.svelte` keeps its frame, viewer and Back control; its
header reads "Or start from the community." while no sequence is open.

No link into the app is added; the header's Open button remains the way in.

### 5. The hero rebalanced

- Toolbar: `SequenceHeroDemo.svelte` gains an optional `toolbar?: Snippet`
  rendered in place of its own `.reroll-row` when provided. Its sixteen other
  hosts pass nothing and keep the built-in Roll button. The composer page
  passes one row: a `PanelButton` Roll with the same three states the built-in
  button has ("Roll a new one", "Rolling..." while `heroAct.rerolling`, and
  "Try again" after a rejected `advanceNow`), the prop chooser, and the Theme
  chip. The `.hero-props` and `.player-theme` wrappers go away.
- Level badge: the difficulty badge `layers/WordHeader.svelte` renders gets an
  accessible name, "Difficulty level N", and a matching `title`. This is a
  shared fix and applies app-wide.
- Pause at rest: `AnimatorCanvas.svelte` gains `cornerToggleAtRest?: boolean`
  (default false). When true, `.corner-toggle` is opaque, unscaled, and
  interactive while playing, not only on hover or when paused.
  `InlineAnimationPlayer.svelte` and `SequenceHeroDemo.svelte` thread the prop
  through unchanged. The composer hero and Generate players set it; every other
  caller keeps today's hover reveal. The tunnel band toolbar's pause and the
  3D demo's pause are already 48 px and visible.
- The Kinetic Alphabet fold: the `notation-bridge` section and its h2 are
  removed, which removes one rail stop. The hero's opening note gains one
  sentence: "The pictures under the player are letters of The Kinetic
  Alphabet; the sequence is the word they spell." `ProjectStory.svelte` gains
  "Read the Guide" and "Common questions" beside its existing "Notation
  history" button, so each link exists once on the page.

### 6. Phone 3D poster

Below the existing `37.4375rem` breakpoint the 3D stop renders the product
frame with a static `<img>` of `PORTAL_STILL` (alt: "A still from the 3D
viewer.") and the existing note under it, instead of
hiding the frame. The portal button and its hint are not rendered there, so a
phone never gets an enter-3D affordance it cannot use. The breakpoint and the
WebGL2 gate are unchanged.

### 7. Documentation

- `presentation-guardrails.md`: in "How the Composer story behaves", beat 3
  gains the page-sequence rule and the word row; the stage section records the
  hero hold ("the hero stops auto-rolling at the first touch or when the
  reader leaves it") and the 2026-10-07 decision to fold the alphabet stop into
  the hero. The "Each demonstration is its own stop" list is unchanged.
- `feature-truth-matrix.md`: the Tunnel row names the page's presets (Duo,
  Radial, Mandala, Pinwheel, Spiral, Inverted, Cross) and performer counts as
  implemented in `ComposerTunnelDemo.svelte`; the generator rows say "fixed
  inputs the page does not display" instead of "disclosed recipe"; the
  accessible-demonstrations row says the pause controls are visible at rest.

## Owned paths

- `src/routes/(public)/composer/_components/ComposerExperience.svelte`
- `src/routes/(public)/composer/_components/composer-sequence-ownership.ts`
- `src/routes/(public)/composer/_components/__tests__/composer-sequence-ownership.test.ts` (new)
- `src/routes/(public)/composer/_components/ComposerWordRow.svelte` (new)
- `src/routes/(public)/composer/_components/ComposerGenerateDemo.svelte`
- `src/routes/(public)/composer/_components/ComposerTunnelDemo.svelte`
- `src/routes/(public)/composer/_components/ComposerGalleryDemo.svelte`
- `src/routes/(public)/composer/_components/ProjectStory.svelte`
- `src/routes/(public)/composer/_sections/ConstructSection.svelte`
- `src/routes/(public)/composer/presentation-guardrails.md`
- `src/routes/(public)/composer/feature-truth-matrix.md`
- `src/lib/shared/landing/components/SequenceHeroDemo.svelte`
- `src/lib/shared/landing/data/hero-act.svelte.ts`
- `src/lib/shared/landing/data/__tests__/hero-act.test.ts`
- `src/lib/shared/animation-engine/components/AnimatorCanvas.svelte`
- `src/lib/shared/animation-engine/components/layers/WordHeader.svelte`
- `src/lib/features/browse/sequences/display/components/media-viewer/InlineAnimationPlayer.svelte`
- `docs/superpowers/specs/2026-10-07-composer-one-sequence-carried-design.md`

## Data flow

```
heroAct.sequence (resting, not opening) -> carry("hero")
Construct onVisitorComposed             -> carry("construct")   \
Generate onGenerated                    -> carry("generate")     > pageSequence
Tunnel onGenerated                      -> carry("tunnel")      /      |
                                                                       v
          Generate (adopts when in view and id differs) <--------------+
          Tunnel sequence prop          <------------------------------+
          3D sourceSequence prop        <------------------------------+
          Gallery featured prop         <------------------------------+
first hero touch, or leaving the hero   -> heroAct.hold()
```

## Edge cases

- The hero has not drawn yet (still the baked opening): the page sequence is
  the opening with source `"opening"`; Keep's caption reads "The sequence
  playing above." which is true.
- The visitor generates, then returns to the hero and Rolls: the hero's new
  word becomes the page word (last write wins). Generate adopts it when it
  returns to view.
- The 3D viewer reloads when its sequence's word changes (existing
  `loadedWord` guard). Because the hero holds once the reader leaves it, the
  3D stop no longer reloads on hero auto-rolls the reader never saw.
- A tunnel draw that produces no result leaves the page sequence unchanged
  (the reducer ignores null).
- Reduced motion: no auto-roll, so the hold is inert; the word row and Keep
  tiers still work.

## Testing

Unit (Vitest, project config):

- `composer-sequence-ownership.test.ts`: initial state; last write wins across
  sources; null never replaces; `shouldAdoptCarriedSequence` without the local
  flag (in view and different id adopts; same id or out of view does not).
- `hero-act.test.ts`: after `hold()`, `offerSequenceBoundary` returns null at
  the boundary that would have advanced; `advanceNow` still swaps while held;
  `hold()` twice is harmless.

Browser (agent browser, worktree preview on a free non-5173 port, then the
primary server after integration):

- 1440x900 stage: Roll in the hero, then Next through Construct, Generate,
  tunnel, 3D, Keep; the same word appears on every row and on Keep's featured
  card; the hero word is unchanged on return. Build in Construct; the later
  rows and Keep show the built word with "The sequence you built." Draw in
  Generate; tunnel, 3D, and Keep follow.
- Hero hold: wait past one loop boundary before touching (word changes), then
  click Roll and wait past two boundaries (word changes only on Roll).
- 375x667 and 820x1180 plain page: the 3D stop shows the poster and the note;
  Keep shows the featured card above the community cards; the hero toolbar
  wraps without overflow.
- Pause controls: hero and Generate corner toggles are 48 px and visible at
  rest; tunnel and 3D unchanged at 48 px.
- Rail: one fewer stop; headings count h1 plus six h2 plus the gallery h3.
- Console clean on all three viewports.

Gate: `npm run wt:finish -- codex/composer-one-sequence --route /composer`
from `E:/tka-platform`, then a live check of
https://localhost:5173/composer.
