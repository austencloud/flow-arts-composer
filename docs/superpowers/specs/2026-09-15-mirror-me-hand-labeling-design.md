# Mirror Me: hand labeling for performance video

Date: 2026-09-15. Brainstormed with Austen; sections 2 and 3 were decided by
Claude on Austen's instruction to skip the walkthrough.

## The problem

TKA notation is read from the performer's own perspective, facing downstage.
Red at E means the performer's right hand is out to their right. Performance
video is shot from the audience, so the same hand shows up on the left of the
screen. Someone learning from a posted video has to cross-map hands in their
head, and nothing on the card tells them which way to do it.

Austen's preferred teaching mode is mirror learning: the learner faces the
screen and copies what they see, treating the prop on the right of the screen
(the performer's left hand) as their own right hand. They end up performing
the mirrored sequence, which is fine. What is not fine is that nobody is told
this is happening.

## The key fact

Mirroring the notation (E and W swapped, rotation arrows reversed) makes the
card's geometry match the camera. Adding a hand swap on top changes no shapes
and no arrows. It only swaps which color sits on which side. So "does the card
match the video" is already solved by mirror, and the only thing left to say
is **which color is the viewer's right hand.** This is a labeling problem, not
a notation problem. Stage and house vocabulary is not needed.

## Decisions

- **Mirror me is the default** for everything Austen posts and shares.
- **Scope:** Post Studio exports and the in-app performance video pairing.
  The rest of the app (builder, library, cards, print) keeps performer view.
- **Approach:** one presentation flag, a derived sequence, and a card footer
  legend. No new stored sequences, no flipping of footage.

## Section 1: data model

The flag lives on the collaborative video record, not on the post. How
footage should be read is a property of the footage, and the same take feeds
Post Studio and the performance pairing through the same per-sequence video
store.

```ts
// collaborative-video.ts
export type HandLabeling = "mirror-me" | "as-performed";

export interface CollaborativeVideo {
  // ...
  /**
   * How the notation beside this footage labels hands. Missing reads as
   * "mirror-me": the card is mirrored and hand-swapped so the color on the
   * viewer's right is their right hand. "as-performed" keeps performer view.
   */
  readonly handLabeling?: HandLabeling;
}
```

- A missing value reads as mirror-me. No migration; every existing video and
  every new upload gets the default.
- The store gains `applyHandLabeling(videoId, labeling)`, written the same way
  `applyStepMap` is: a Firestore update through the collaborative video
  manager, then the in-memory record patched.
- Two controls set it, both places that already show a video's settings:
  Post Studio's source settings when the video source is selected, and the
  performance inspector in the sequence viewer. One segmented control with
  two options, "Mirror me" and "As performed", using the existing
  `SegmentedControl` component.
- The flag never changes the stored sequence or the stored step map. It is a
  presentation instruction only.

## Section 2: render path

One helper produces the card's sequence from the flag:

```ts
// sequence-viewer/services/hand-labeled-sequence.ts
export async function sequenceForHandLabeling(
  sequence: SequenceData,
  labeling: HandLabeling
): Promise<SequenceData>;
```

- `as-performed` returns the sequence unchanged.
- `mirror-me` returns `handSwapSequence(await mirrorSequence(sequence,
  motionQueryHandler))`. Both transforms already exist in
  `create/services/sequence-transforms.ts`. Mirror derives letters
  asynchronously, so the result is memoized per (sequence id, updatedAt,
  labeling) in a small module-level cache. The helper is pure apart from that
  cache.
- The step map is untouched. Beat indices are the same in both sequences, so
  the playhead highlight and the paired scrub keep working as they do now.

**Post Studio.** `PostStudioChoreoLayer` currently receives `sequence`. It
receives the labeling of the selected performance too (resolved by the
performance selection module, defaulting to mirror-me) and renders the card
from the derived sequence. Because export captures the same live card
element, preview and export cannot drift.

**Performance pairing.** The viewer shell already receives the active step map
through the video playhead bridge. The bridge grows one more host hook,
`setActiveHandLabeling`, set when a performance is selected and cleared when
the videos pane goes away. The shell derives the card's sequence through the
same helper. When no performance is active the card shows performer view,
exactly as today.

**Everywhere else** keeps rendering the stored sequence. Nothing outside these
two surfaces reads the flag.

## Section 3: the legend

The card footer already has modes `off`, `credit`, and `custom`. The legend is
not a fourth mode. It is an extra line the footer draws whenever the card is
rendered under a hand labeling, above whatever the footer mode shows. It
appears on the two surfaces above only, since they are the only ones that pass
a labeling in.

Wording, with a color swatch drawn inline where the brackets are:

- mirror-me: `Mirror me. [swatch] is your right hand.`
- as-performed: `As performed. [swatch] is my right hand, on your left.`

The swatch is the resolved color of the right-hand prop from the same source
the card uses for its props, so custom color choices carry through. It is the
right-hand color under both labelings: under mirror-me the hand swap has
already relabeled the motions, so the right-hand color is what is drawn on the
viewer's right, and under as-performed it is the performer's right hand on
the viewer's left. The line says what the viewer sees on the card.

Type and size follow the footer's existing font and scaling. No emoji, no
glyphs on the start position. If people still miss it, an R marker on the
start position can come later.

## Out of scope

- A global user preference. Austen is the only poster and the default is
  already mirror-me.
- Publishing mirrored sequences as their own records.
- Flipping footage.
- Any change to the builder, library, print, or choreo card outside the two
  surfaces named.

## Testing

- Unit: `sequenceForHandLabeling` returns the input for as-performed; for
  mirror-me the start position and every step have E and W locations swapped,
  hand colors swapped, and rotation directions reversed relative to the input.
  Cache returns the same object for the same key and a new one when
  `updatedAt` changes.
- Unit: the collaborative video codec round-trips `handLabeling` and reads a
  missing field as undefined, with the resolver mapping undefined to
  mirror-me.
- Unit: the footer legend text for each labeling, with the swatch color taken
  from the right-hand prop color.
- Browser, on the real routes `/test/post-studio` and
  `/test/step-map-editor`: with the ΩΛ-XJ take, the default card is mirrored
  and swapped with the mirror-me legend; switching the control to as-performed
  shows the canonical card and the other legend; the switch persists across a
  reload; export output matches the preview.
