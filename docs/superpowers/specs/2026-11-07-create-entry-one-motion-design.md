# Create entry as one motion

Date: 2026-11-07. Builds on `2026-11-07-create-entry-filing-design.md` and
`2026-11-07-generate-entry-choreography-design.md`, and replaces their timing.

## Why

Austen, after watching the six entries: after the tap the card "appears to hang
in the air for a pretty long period of time". He wants every entry to feel like a
choreographed act with the workspace's parts as the players, without taking a
long time or coming in so many stages that it wastes time.

Measured on desktop (Construct, 2026-11-07): the tapped card stood still for
about 0.37 s (the clearing floor) and then held as a miniature for another
0.13 s (the split lead) before any piece left. The entry came in five stages
(file, wait, condense, hold, split, then a trailing arrival) and came to rest
1.2 to 1.5 s after the tap. The workspaces themselves are laid out 0.08 to 0.27 s
after the tap.

## The shared timeline

| Time after the tap | What happens |
| --- | --- |
| 0 | The other cards file into their drawers, as before. The heading fades. The tapped card's description fades and the card starts shrinking. The card's icon and name leave it and file into that method's own drawer icon (the sidebar icon on desktop, the bottom pill elsewhere), just behind the others; the drawer nods as it goes in. |
| as soon as the pieces exist | The gate opens: the workspace's pieces are laid out and no loading state is left. Pictures that are still drawing do not hold it. The plate picks the card up from wherever its shrink has got to and condenses onto the miniature. |
| as the plate arrives | Every player leaves the miniature in the method's order. There is no hold. The supporting cast (toolbar, hints, level pills) flies in the same wave, in the same order, instead of arriving afterward. |
| about 0.8 s | Everything is at rest. |

Rules:

- No fixed wait. The clearing floor is gone; the gate waits only for the pieces.
- No hold. The first player leaves when the plate reaches the miniature.
- One wave. Nothing starts after the last piece lands, except a method's own
  signature on content that was still drawing (Shape's ripple).
- The card name no longer lands on a workspace title. Its icon and name go to
  its drawer, so the tap also shows where this method lives.
- A picture that finishes drawing after its piece lands shows up where it
  landed; the gate never waits for it.
- Reduced motion plays none of it, as before.
- Durations come from the motion tokens only.

## Each method's order

| Method | Players | Order |
| --- | --- | --- |
| Construct | header, the three start pictures, footer, hint | Dealt like cards: the start pictures leave left to right, each landing as the next leaves; the header and footer ride in the middle of the deal. |
| Generate | Generate button, option tiles, level pills, hint | Built up from the button: the green Generate button leaves first and the tiles stack up above it row by row, bottom to top; the level pills land last. |
| Shape | top bar, shape grid panel, detail panel | Opens like a book: the grid panel goes left, the detail panel right and the top bar up, all together. The grid's shapes then ripple in diagonally from the top-left corner as they are drawn. |
| Fuse | header, Left path, Right path, Combined preview | Two paths, then the fusion: both paths (and the header) leave together; the Combined preview leaves a beat later and lands last. |
| Tunnel | header, Cast column, Stage | Cast first, then the stage: the header and Cast column leave together; the Stage leaves a beat later. |
| Assemble | grid panel, hand dock, hint | The grid and dock leave together. As the grid lands, its four target rings pop out from the center point to their spots; the hint comes in with them. |

## What does not change

- The filing itself: each other card into its own sidebar icon on desktop, the
  bottom pill on phone and tablet, nearest drawer first, each drawer nodding.
- The miniature: the real pieces at a small scale on a tray in the card's
  colors, fitted inside the part of the card that is on show.
- Pieces that cannot move by transform (something inside placed against a box
  outside them) fade in where they are.
- A workspace with no pieces, or a card with too little of itself on show,
  crossfades after the filing.

## Checks

Recorded with `scripts/record-create-entry.mjs`, one press per run, every frame
looked at:

- all six methods on desktop (1426 by 856),
- all six on a phone (412 by 915),
- Construct and Shape on the Fold inner screen (707 by 772),
- one method at 2560 by 1440,
- a kept sequence,
- reduced motion (no animations).

Pass: the tapped card is never still for more than one frame between the tap and
the flight, and every entry comes to rest within about 0.9 s of the tap on
desktop (Shape's ripple may run on while its grid finishes drawing).
