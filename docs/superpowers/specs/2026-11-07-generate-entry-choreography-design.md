# Generate entry choreography

Austen, 2026-11-07, on going from the "How do you want to create?" board into
Generate: instrument it, and make it "a choreographed, intentional experience
that is delightful to watch."

## What it did

Measured from the press: a flat hold of about 340 ms with nothing moving, a
280 ms double exposure of the board over the workspace, then the settings popping
in late on their own timers. With a sequence kept, the tapped card's preview
blanked and came back and the board cut over more than a second after the press.

## What it does now

One thing to follow: the card that was pressed.

| Beat | Time, quiet machine | What moves |
| --- | --- | --- |
| Tap | 0 | The rest of the board clears away from the card, nearest first (`emanate`'s geometry run backwards). The card drops to its name and gathers itself, slowly scaling up. |
| Swap | 200 to 560 | The gate opens once the workspace has drawn, never before the clearing has read as motion (`CREATE_ENTRY_CLEARING_MS`), and at the existing cap at the latest. |
| Condense | swap + 150 | The card condenses onto a miniature of the settings grid that fits inside it, and its name settles on the miniature Generate button's word. |
| Miniature | + 100, held to 280 | The card lets go and the real settings cards are there at a small scale, contents and all, on a tray in the card's colors. |
| Split | swap + 280 to 710 | Each real card flies out of the miniature to its place, nearest the tapped card first, `STAGGER.relaxed` from first to last. The button's own words take over from the name as its card leaves and ride out with it. |
| Arrival | settled about 1050 | The level toolbar (on a phone, the level card inside the grid), the hint and a kept sequence come in from the grid (`playEmanate`), starting as the first cards come down. |

Versions, same day. The first landed the card on the Generate button and pushed
the settings out from it. Austen: making Generate into "the whole bento box
arrangement would be more sensible." The second grew the card into tiles shaped
like the settings cards, which stretched in flight, went muddy where amber
blended over them, and read as a loading placeholder. Austen chose the true
split ("A"): the real cards leave a miniature of the grid.

Lessons kept in the code:

- The card's colors are see-through. The small cards stay hidden until the card
  has condensed onto them, or they show through it as a tint.
- Hiding the tapped card is not enough: its `.method-item` tile goes too.
- The workspace layer is held at full strength during the split so the cards fly
  solid. Anything in it with its own backing (the tool panel's dark fill) fades
  that backing in by hand, or a kept sequence gets a hard edge beside it.
- The arrival moves the hint's own box. A transform on its empty slot made the
  slot the hint's containing block, so the hint sat about 100 px high until the
  arrival ended.

Everything but the plate's corners and the panel's backing is `opacity` and
`transform`, so the compositor keeps it moving while the workspace mounts.

## Owners

- `features/create/shared/services/create-entry-choreography.ts` runs the beats.
  `CHOREOGRAPHED_METHODS` says which methods play it: Generate only for now. The
  other five keep the crossfade, and each needs its own landing target.
- `features/create/shared/components/CreateEntryFlight.svelte` is the plate, over
  both crossfade sources so neither fade touches it.
- `decideCreateEntrySource` gains `floorMs`.
- `shared/transitions/emanate.ts` gains `playEmanate`, the sheet arrival as a
  web animation for elements that are already mounted.
- `holdDeferredWorkForMotion({ neededWorkRuns: true })` is a hold for a motion
  that is itself waiting for something to load. Prefetches stay out, and work
  that passes `whenMotionSettled({ needed: true })` runs. Without it the clearing
  blocked the pictograph data the workspace was waiting for and every entry ran
  out the cap. The hold becomes a full one once the flight starts.

## Cases

- **Reduced motion:** `depart` returns false and the entry stays the plain swap.
- **Nothing to land on** (a first visit where the panel misses the cap, no
  grid, a button off stage, or less than 40% of the card where the grid can be
  seen, as on a phone with a sequence kept): no flight. The board dissolves with the card still on it
  and the workspace shows its loading state, as before. A reload with the chunks
  cached flies.
- **Back while clearing:** the clearing reverses from where it is on screen.
- **Back during the flight:** the plate fades where it is while the crossfade
  brings the board back; the tray is removed. Nothing stays hidden.
- **Interrupted, then pressed again:** the next entry plays the whole thing.

## Instrumentation

`scripts/record-create-entry.mjs` presses a card with real mouse events in a
visible tab and writes the per-frame log, screencast frames and a contact sheet,
and prints each frame's changes with the beats, long frames and layout shifts.
The trace gains `beat()`, recording `departure`, `flight`, `landed` and `arrived`
as `create:enter:<method>:<beat>`. `scripts/audit-create-entry.mjs` still grades
an entry pass or fail.

## Not changed

The workspace's background, and the five other methods' entries.
