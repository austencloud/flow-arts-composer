# Create entry: filing into the drawer, a landing for every method

Austen, 2026-11-07. Tapping a method on the "How do you want to create?" board
should teach that the other methods now live in the drawer: on a desktop the
sidebar, on a phone or tablet the pill at the bottom. His picks: the cards file
into the drawer, each into its own icon; no words and no pop-up; all six
methods; and "build out a choreographed transition from any given choice into
its tab," not only Generate's.

This extends `2026-11-07-generate-entry-choreography-design.md`, whose beats
(swap gate, condense, miniature, split, arrival) all methods now share.

## The filing

| Beat        | When                 | What moves                                                                                                                                                                                                                                                                                                                                                                              |
| ----------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Heading     | 0 to 150             | "How do you want to create?" fades out.                                                                                                                                                                                                                                                                                                                                                 |
| Filing      | 0 to about 330       | Every other card flies to its drawer and shrinks to the drawer's size (`filingTiming`): on a desktop the sidebar icon whose name matches the card, otherwise the bottom pill. Cards nearest their drawer go first, `STAGGER.normal` from first to last, each over `DURATION.emphasis`, fading over the last 40%. The workspace edge clips them, so they read as going into the sidebar. |
| Nod         | as each card goes in | The drawer's glyph swells and settles (`DRAWER_PULSE_MS`), at its fullest as its last card arrives, so on a desktop the icons nod one after another. The nods live on the navigation, outside the board, and outlast the entry.                                                                                                                                                         |
| Tapped card | 0 on                 | Drops to its name and gathers itself, as before. It stays above the filing cards.                                                                                                                                                                                                                                                                                                       |

A card with no drawer on screen clears away from the tapped card as the
original departure did.

## The landings

Every method has a `Landing` in `create-entry-choreography.ts`: the workspace's
own top-level pieces, and the title the card's name settles on where there is
one.

| Method    | Pieces                                              | Name settles on                                  |
| --------- | --------------------------------------------------- | ------------------------------------------------ |
| Generate  | the settings cards                                  | the Generate button's word (required, as before) |
| Construct | the picker heading, each start position, the footer | "Choose your start placement"                    |
| Shape     | the top bar, the matrix pane, the detail pane       | nothing: it condenses with the card              |
| Fuse      | the header, both sources, the preview               | "Fuse two paths"                                 |
| Tunnel    | the header, the source column, the preview          | "Build a tunnel"                                 |
| Assemble  | the grid, the hand dock                             | nothing                                          |

- The miniature is the box around all the pieces on stage, at one scale inside
  the card. The tray goes first in the pieces' nearest common holder and is
  placed by measuring where it lands.
- Everything in the layer that is neither a piece nor holds one arrives around
  the pieces (`besidePieces`), so a kept sequence, a resize handle or Assemble's
  sequence side never pops in. Generate keeps its own arrival list.
- Every backing between a piece and the crossfade surface fades in, as the tool
  panel's did.
- The spread from first piece to last scales with the piece count
  (`splitSpreadFor`): eight Generate cards get all of `STAGGER.relaxed`; Shape's
  three panels leave nearly together. A large piece that leaves early otherwise
  grows over a neighbour still waiting in the miniature.
- A piece that holds something absolute or fixed placed against a box outside it
  fades in where it is instead of flying, since a transform would move that
  thing wrongly (`movesSafely`). Hidden elements and shapes inside an SVG don't
  count. The check costs about 2 ms on Shape's 700-element panel.
- No pieces on stage, or too little of the card on show: the filing still plays
  and the workspace crossfades in.

## Cases checked, real frames

| Case                                       | Result                                                                                                                                                                             |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop 1426 by 856, all six               | File into their own icons, nod in turn; each method splits into its pieces.                                                                                                        |
| Phone 412 by 915, all six                  | Cards fold into the bottom pill; each method splits.                                                                                                                               |
| Fold 707 by 772 (Tunnel, Construct, Shape) | Plays. Shape's own mount blocks the main thread for about 500 ms after the swap, so its card holds still for about 300 ms before splitting. That cost is Shape's, not the entry's. |
| 2560 by 1440 (Fuse)                        | Plays.                                                                                                                                                                             |
| Kept sequence (Tunnel)                     | The sequence arrives beside the pieces.                                                                                                                                            |
| Reduced motion (Fuse, Assemble)            | No filing, no split, no animations on the board.                                                                                                                                   |

## Not changed

The swap gate and its cap, the drawer itself, the board's layout, Generate's
own landing except the shared spread rule (it has enough cards for the full
spread).
