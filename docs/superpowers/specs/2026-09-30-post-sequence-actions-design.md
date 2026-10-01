# Post Sequence Actions — Design (2026-09-30)

## Problem

A post's animation, moves strip and choreo card all draw one resolved
sequence. Austen can mirror, flip and rotate a video clip, but he cannot do the
same to that sequence, so he cannot line the notation up with footage that was
filmed or edited the other way round.

The woods (Δ-ΛRZ) post shows the gap. "Use ΩΛ-XJ template" copied ΩΛ-XJ's
`mirrored: true` without flipping woods' video (`flip: false`). ΩΛ-XJ itself
has both (`mirrored: true`, `flip: true`). The animation was reflected and the
footage was not, so the notation disagreed with the performance. "Unmirror
post" toggles both together, so it could not repair it. DCKΨ- carries the same
pair of values.

## Decisions (Austen, 2026-09-30)

- He wants the same freedom on the sequence as on the video: mirror, flip,
  rotate and swap colors, each independent of the video's own controls. Lining
  the two up is his job.
- Level 1 now: whole-sequence actions inside Post. Level 2 after the 2026-10-01
  deadline: an "Edit in Composer" round trip for turns and beat changes,
  specified separately.
- Rotate turns 90° per press so the grid keeps its shape. Invert and Reverse
  stay out; they change the choreography, not its orientation.
- The template stops copying the mirror switch.

## Design

**Data.** `PostProject.sequenceActions?: PostSequenceAction[]`, an ordered list
of `"mirror" | "flip" | "rotate-left" | "rotate-right" | "swap"`, at most 64.
Absent means untouched. A press that undoes the previous press removes it
(mirror after mirror, rotate-left after rotate-right); four identical rotations
in a row cancel. Reset removes the field.

**Pipeline.** source → hand labeling (mirror-me by default) → the post's
actions in order → the whole-post mirror when on. `createPostSequenceView`
owns it and caches each result by the labeled source and a key built from the
actions and the mirror flag. While a new result is pending, the previous
result for the same source stays on screen; `pending` and `error` keep export
blocked until the current result exists. The transforms are the Composer's own
(`mirrorSequence`, `flipSequence`, `rotateSequence` with two 45° steps,
`swapHands`).

**Interface.** Selecting an animation, moves strip or card adds a Sequence
tool after Appearance (after Shows for moves). Its panel reuses
`SequenceTransformActions` with Mirror, Flip, Rotate 90° L/R, Swap and, when
anything is applied, Reset. A note says the change covers this post's
animation, moves and card, leaves the saved sequence alone, and that the video
has its own Mirror and Rotate in Crop. Each press is one ordinary edit, so
Undo takes it back.

**Template.** `applyTutorialTemplate` keeps the destination's own `mirrored` value and
never copies `sequenceActions`.

**Errors.** A failed transform leaves the previous drawing up and shows its
message in the existing draft notice; export stays disabled until the post is
changed or undone.

## Tests

- `post-sequence-actions.test.ts`: press collapsing, reset, schema round trip,
  and application order with fake transforms.
- `post-sequence-view.test.ts`: actions run after labeling and before the
  whole-post mirror; a pending change keeps the previous drawing; existing
  mirror cases still pass.
- `post-project-looks.test.ts`: the template keeps the destination's mirror
  switch.
- `post-editor-tools.test.ts`: the Sequence tool appears for animation, moves
  and card, and Appearance stays the default panel.
- Browser: press Mirror on woods in a task tab and confirm the animation
  reflects while the video does not.
