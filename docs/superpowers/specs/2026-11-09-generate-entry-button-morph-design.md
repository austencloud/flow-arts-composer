# Generate entry: the preview's button becomes the real one

Austen, 2026-11-09, looking at a frame of the Generate entry: the small Generate
button in the card's preview should morph into the workspace's real Generate
button, its dice and word reused, with the other cards springing out of it.
He picked every option below that was offered as recommended, and left the
spring-out style to Claude.

Builds on `2026-11-07-create-entry-one-motion-design.md`. Only Generate
changes; the other five methods keep the plate and miniature.

## What you see

1. **Tap.** The four little steps, the title, the description and the gold
   card fade where they are (the card keeps its small shrink as it fades). The
   other cards file into their drawers and the name files into Generate's, as
   now. The small green button stays fully lit: it is lifted into the flight
   layer and is the one thing that travels.
2. **Wait.** Until the panel is laid out, the button drifts toward the middle
   of the board, slowing and never stopping, and its dice tumbles in quarter
   turns. No gold box and no "Loading generator..." spinner while it waits.
   The board is held up to 4 s for this (the entry backdrop's own cap) instead
   of the usual 560 ms; past that the workspace shows as today, spinner and
   all, and the button fades.
3. **Morph.** The first frame the panel's cards are laid out, the button
   glides from wherever it is to the real button and grows into it over one
   flight (280 ms, fast start). Its green box changes size and corners; its
   dice and word ride at one uniform scale so the type never squashes, and
   land on the real button's dice and word. In the frame it lands, the real
   button shows and the copy goes. Same icon, same word, so there is no
   crossfade.
4. **Spring.** As the button lands, the settings cards come out of it: each
   starts small and centered on the button and flies to its place, the row
   nearest the button first, then each row above. The level pills, the empty
   sequence hint and the left side arrive last, as now.

## Edges

- Reduced motion: the plain crossfade, as today.
- No preview button on the card (a layout that hides the stage), or no flight
  layer: today's plate and miniature.
- The real button missing or off stage when the gate opens, or the 4 s cap
  passing: the copy fades out where it is and the workspace crossfades in.
- A preview button showing only its dice (narrow cards): the dice rides to the
  real dice and the real word fades in as it lands.
- Back on the board mid-entry: the copy fades with the rest (`abort`).
- A repeat entry starts clean (the flight layer resets on `clear`, fixed
  2026-11-09).

## How it is built

- `CreateEntryFlight.svelte` gets a rider for the button: `lift` copies the
  preview button into the layer at its box (its green, corners, dice and
  word), starts the drift and the tumble; `morph` takes it to the real
  button. Like the plate, the box is laid out at its end and scaled back, with
  its corners counter-scaled, so its move is one compositor transform; the
  content is a separate uniform-scale transform.
- `create-entry-choreography.ts`: Generate's landing gains `source`, the real
  button's selector and the preview button's selector. `depart` lifts the
  button when both are there, and reports that it waits long
  (`holdsLong`), so `CreateModule` gives the gate the 4 s cap. `land` takes
  the source path: morph, then the settings cards spring from the button's
  box in the existing bottom-up order; the cast arrives as now.
- The real button's reveal and the copy's exit are step keyframes on the same
  timeline, so they change in the same frame.

## Proof

Recorded frames (`scripts/record-create-entry.mjs`) of Generate warm and cold,
at 1x and 4x CPU, at desktop, the Fold inner screen (707 by 772) and the cover
screen (412 by 915), plus a repeat entry in one page load. The focused
choreography and flight tests pass.

## Plan

1. Rider in `CreateEntryFlight.svelte` (`lift`, drift, tumble, `morph`,
   `dismiss`) with a browser test that it lands on the target's box and
   resets on `clear`.
2. Choreography: `source` landing, the tapped card's fade, `holdsLong`, the
   spring from the button; `CreateModule` passes the longer cap.
3. Record and look at the frames above; fix what they show.
4. Merge to local main with `wt:finish --route /create`.
