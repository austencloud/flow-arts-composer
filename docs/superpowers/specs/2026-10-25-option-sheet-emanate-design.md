# The option sheet emanates from the landed start (2026-10-25)

Brainstormed with Austen on 2026-10-25. He chose "Emanate from the landing"
over a plain bloom and a reading-order cascade after watching all three play
side by side, and kept the tempo and push as shown.

## The moment

Construct. The user taps a start placement. Today the tapped card flies into
the workspace start cell (`start-placement-morph.ts`, `DURATION.emphasis`)
while the workspace slides open (`DURATION.dramatic`) and the picker crossfade
swaps the start picker for the option picker. Then nothing: the option sheet
waits behind `sizingStable` in `OptionPickerContent.svelte`, and when that gate
opens the bar, the section headers and every card appear in one frame.

The flight explains where the start went. Nothing explains where the options
came from. This design gives the sheet an arrival that answers the landing.

## What it does

When the option sheet first shows after a start placement:

1. The letter-type bar (`OptionPickerHeader`) fades in at once with
   `flyFade` (`y: 6`, `DURATION.normal`).
2. The section headers fade in with `flyFade` (`y: 6`) after the arrival lead
   (110 ms, the same lead the shared `arrive` uses).
3. Every option card fades up while gliding outward from the direction of the
   landed start cell and settling from 96% to full size. Each card starts
   displaced `SLIDE.lg` (20 px) toward the start cell's centre and ends in its
   slot, so the landing reads as having pushed the options into place.
4. Cards arrive in order of their distance from the start cell: nearest first,
   equal distances together, farthest last. The delay is the lead plus the
   card's distance fraction times the spread (220 ms, the same cap the shared
   `arrive` uses). Each card's own motion lasts `DURATION.emphasis` on the
   standard out curve.

The whole arrival ends about 610 ms after the sheet's first paint, roughly a
second after the tap. The beat is: tap, flight and landing, then the
continuations spread out from the start.

## Owner

One intro transition, `emanate`, in `src/lib/shared/transitions/emanate.ts`,
next to the start morph's other shared owners. It is a Svelte transition
function (`in:emanate={{ origin, index }}`) whose `css` tween animates only
`opacity` and `transform`, so the compositor runs it while the picker's first
mount keeps the main thread busy.

Parameters:

- `origin`: a function returning the start cell's `DOMRect` or `null`. The
  cell is found with the same selector the morph lands on
  (`.workspace-container [data-history-start-placement]`); export that lookup
  from `start-placement-morph.ts` rather than copying the selector.
- `bounds`: a function returning the sheet's `DOMRect` (the
  `.option-picker-content` box). The farthest corner of the sheet from the
  origin normalises the distance, so each card is a pure local computation and
  no cross-card coordination is needed.
- `index`: the card's position in its list, used only by the fallback.

Timing math lives in a pure function, `emanateTiming({ card, origin, bounds })`
returning `{ delay, dx, dy }`, with unit tests: a card at the origin gets the
lead and no push; a card at the farthest corner gets lead plus spread; the push
vector has length `SLIDE.lg` and points from the card toward the origin;
distance fractions clamp to `[0, 1]`.

Constants: `LEAD_MS = 110` and `SPREAD_MS = 220`, declared once in the owner
with a comment that they mirror `arrive`'s. `lib/shared/transitions/` is
exempt from the motion coverage scan, which is the only place raw numbers may
live. `SLIDE.lg`, `DURATION.emphasis`, `DURATION.normal` and the shared easing
come from `#lib/shared/transitions/*`.

Fallbacks, inside the same owner:

- `origin()` returns `null` (an embed with no workspace, or the start cell has
  not drawn): behave exactly as the shared `arrive` with `index`, no push.
- `reducedMotion()`: `{ delay: 0, duration: 0 }`, as `arrive` does.

## Where it applies

Every card host in every sheet layout gets `in:emanate`:

- Desktop sections and the Types 4 to 6 row: `.option-card-wrapper` in
  `OptionGrid.svelte` (used by `OptionSection` and `Option456Row`).
- Double-float rows: the card host in `DoubleFloatOptionRows.svelte`.
- Phone swipe sections and the fallback single section: the `.pictograph-option`
  button in `swipe-layout/components/OptionViewerSection.svelte`.
- Compact continuous grid: the same `OptionViewerSection`, via
  `OptionPictographCell` if that is the host there.

Section headers (`OptionSectionHeader.svelte`, swipe `SectionHeader.svelte`)
get `in:flyFade={{ y: 6, delay: LEAD_MS }}`; the picker bar gets
`in:flyFade={{ y: 6 }}` on its root (it already has a `flyFade` on one inner
element; the root takes over and the inner one goes, so the bar does not fade
twice). Nothing else in the sheet moves. The crossfade in
`ConstructTabContent.svelte` and the workspace slide stay as they are.

## When it plays

The intro fires when a card host mounts. Cards are index-keyed and stay mounted
across picks, so the arrival plays once per sheet mount: after a start
placement, after Clear and a new start, and if the layout branch remounts (a
resize that crosses the desktop and swipe threshold). That is wanted.

A card that mounts later because the option set grew after a pick must not
emanate from the start cell: the landing is over. `OptionPickerContent`
provides a small context, `optionSheetOpening`, that is true from the sheet's
mount until `LEAD_MS + SPREAD_MS + DURATION.emphasis` later, and the hosts pass
`origin` only while it is true; otherwise `emanate` takes its `arrive`
fallback keyed by `index`. Content changes on already-mounted cards keep
today's in-place behaviour.

## Interaction during the arrival

Cards are interactive from their first frame; the intro changes only opacity
and transform. A tap during the ripple picks that option and the sheet updates
in place; intros still running simply finish. No input is held back.

## Verification

Watched in a real browser, not inferred from tests:

- Desktop (1440 wide and wider), the Fold inner width (707 wide) and phone
  (412 wide), each from a fresh start placement tap, at 1x and in recorded
  frames (Chrome DevTools screencast or a frame series): the bar first, then
  headers, then cards filling outward from the start cell's side of the sheet;
  the last card settled by about 610 ms after the sheet's first paint; no
  layout shift (opacity and transform only, nothing else moves).
- A pick during the ripple works and the sheet updates in place.
- Clear, then a new start: the arrival plays again.
- A pick that grows the option set: new cards use the plain `arrive`, no push
  from the start cell.
- `prefers-reduced-motion: reduce`: the sheet lands instantly.
- `src/lib/shared/transitions/motion-coverage.test.ts` and the `emanateTiming`
  unit tests pass; `npm run test:changed` passes in the worktree.

`docs/architecture/canonical-capabilities.md` gets the route: the start
placement morph paragraph names `emanate` as the second half of that beat, and
the motion routing table in `.claude/rules/no-layout-shift.md` gains a row for
"a sheet of cards arriving from a landed element".

## Rejected

- Bloom without the push (A): intentional but still; Austen wanted the causal
  link to read.
- Reading-order cascade (B): does not know where the start landed.
- Dealing each card all the way from the start cell: thirty cards crossing a
  panel boundary is the "overdoing it" he asked to avoid. The 20 px push keeps
  the direction and loses the travel.
- Ordering by stagger rank instead of distance fraction: rank spreads cards
  evenly in time, but equal distances should land together for the ripple to
  read as one wave.
- Lifting `emanate` into `@austencloud/motion` now: no second product needs it
  yet. It is written so it can move there unchanged.

## Stacked layouts cascade in rows (added 2026-10-26)

Austen, after the first version landed: on a phone the workspace and the step
grid sit above the option picker, so the options should fold in from the top
down. He chose a row cascade over a literal fold (rows hinging on a 3D axis),
which crosses the "overdoing it" line.

The layout decides the shape. `OptionPickerContent` already receives the Create
module's side-by-side flag (`isSideBySideLayout`), the one that places the
panels; the opening context passes `stacked: () => !isSideBySideLayout()` to
every card, and `emanateTiming` takes `stacked` as a parameter. Stacked (the
phone and the Fold inner screen, start cell above the sheet) runs in rows;
side by side runs radial. Whether the origin is above or below is read
against the sheet's vertical centre.

The sheet's box cannot make this call. On the first pick after a page load the
cards mount while that box is still the panel the start picker filled. At 412
wide its top sat at 41 at mount and 405 settled, reaching up past the start
cell; at 1440 wide it ran from x 206 at mount, spanning the start cell
sideways (measured 2026-10-26). A vertical test misread the phone as side by
side, and a horizontal test misread desktop as stacked, so both were tried
and dropped. The far edge used for distances (the bottom, with the origin
above) is already final when the cards mount.

- The distance fraction is vertical only: the card centre's vertical distance
  from the origin centre, over the vertical distance from the origin centre to
  the sheet's far horizontal edge (the bottom edge with the origin above, the
  top edge with it below), clamped to `[0, 1]`. Every card in a row shares a
  delay, so a row lands together, and rows land in order away from the origin.
- The push is straight along that axis: `dx: 0` and `dy: -SLIDE.lg` with the
  origin above (the card starts 20 px up and glides down into its slot),
  `dy: +SLIDE.lg` with it below.

Side by side (desktop, where the start cell sits left of the sheet) nothing
changes: radial distance, push toward the origin.

Lead, spread, per-card duration, the fallbacks and the opening window are the
same in both shapes. Tests: with the origin above the sheet, two cards in one
row at different x get the same delay and a push of exactly `{ dx: 0,
dy: -SLIDE.lg }`; a lower row gets a later delay; the bottom edge gets lead
plus spread; side by side keeps the radial push, including while a stale box
spans the origin; stacked keeps rows while a stale box covers it.

Verification adds, at 412 wide and 707 by 772: cards in one row become
visible in the same frame, rows become visible top to bottom, every card's
initial transform is a pure vertical translate, and the last on-screen card
settles about 610 ms after mount; at 1440 wide the push keeps its horizontal
component and the order stays radial. Each size is measured on the first pick
after a fresh page load, the case that broke both geometric tests.

Rejected: a true fold (each row rotating down from its top edge with
perspective), which is theatrical and puts 3D transforms on every card on a
phone; and deciding the shape from the sheet's box, which is stale at mount
on a fresh load (above).
