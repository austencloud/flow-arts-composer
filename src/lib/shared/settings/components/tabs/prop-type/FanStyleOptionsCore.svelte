<!--
  FanStyleOptions.svelte
  The fan look (Pictograph, DoodleGrip Fire, Lotus Fire, Flat Grip Fire,
  DoodleGrip Day, Moon LED, Star Fire, plus the covered DoodleGrip), opened
  from the prop grid's look chip once a fan is selected. Bound to the shared
  fanAppearance setting, which the 2D canvas and the 3D scene both read. The
  frame color is a 3D-only detail and stays out of this 2D control.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import FanAppearancePicker from "#lib/shared/pictograph/prop/components/FanAppearancePicker.svelte";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { propDrawerState } from "#lib/shared/settings/state/prop-drawer-state.svelte.js";
  import {
    normalizeFanAppearance,
    type FanAppearance,
  } from "#lib/shared/pictograph/prop/domain/fan-appearance.js";

  let {
    fill = false,
    horizontal = false,
    room = false,
    appearance,
    propType = PropType.FAN,
    onchange,
  }: {
    /**
     * The host has given this chooser a definite height (the drilled view of
     * a bounded picker). The build and cover cards then share that height
     * instead of sitting at their natural size above empty space.
     */
    fill?: boolean;
    horizontal?: boolean;
    /**
     * With `fill`, a host that never scrolls (a guide screen): every look stays
     * in the box, however small, in whichever columns suit the box's shape.
     */
    room?: boolean;
    appearance: FanAppearance;
    /** The fan the Standard / Big control has selected; the tiles draw it. */
    propType?: PropType;
    onchange: (appearance: FanAppearance) => void;
  } = $props();

  const normalizedAppearance = $derived(normalizeFanAppearance(appearance));
  function change(next: FanAppearance): void {
    onchange(normalizeFanAppearance(next));
  }

  let dragging = $state(false);
  let pointer: {
    id: number;
    x: number;
    scrollLeft: number;
    dragging: boolean;
  } | null = null;
  let suppressClick = false;

  function pointerDown(event: PointerEvent) {
    if (!horizontal || event.pointerType !== "mouse" || event.button !== 0)
      return;
    const rail = event.currentTarget as HTMLDivElement;
    if (rail.scrollWidth <= rail.clientWidth) return;
    pointer = {
      id: event.pointerId,
      x: event.clientX,
      scrollLeft: rail.scrollLeft,
      dragging: false,
    };
  }

  function pointerMove(event: PointerEvent) {
    if (!pointer || event.pointerId !== pointer.id) return;
    const distance = event.clientX - pointer.x;
    if (!pointer.dragging && Math.abs(distance) < 6) return;
    const rail = event.currentTarget as HTMLDivElement;
    if (!pointer.dragging) {
      pointer.dragging = true;
      dragging = true;
      rail.setPointerCapture(event.pointerId);
    }
    rail.scrollLeft = pointer.scrollLeft - distance;
    event.preventDefault();
  }

  function pointerEnd(event: PointerEvent) {
    if (!pointer || event.pointerId !== pointer.id) return;
    if (pointer.dragging) {
      suppressClick = true;
      setTimeout(() => (suppressClick = false), 0);
    }
    pointer = null;
    dragging = false;
  }

  function clickCapture(event: MouseEvent) {
    if (!suppressClick) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  }
</script>

<div
  class="fan-style-options"
  role="group"
  aria-label={t("settings_fan_appearance_choices")}
  class:fill
  class:horizontal
  class:room
  class:dragging
  data-testid="fan-style-options"
  onpointerdown={pointerDown}
  onpointermove={pointerMove}
  onpointerup={pointerEnd}
  onpointercancel={pointerEnd}
  onclickcapture={clickCapture}
>
  <FanAppearancePicker
    value={normalizedAppearance}
    onchange={change}
    frameColor={false}
    compact
    pairPreview={!propDrawerState.watching3D}
    pairPropType={propType}
  />
</div>

<style>
  .fan-style-options {
    container: fan-options / inline-size;
    flex: 0 0 auto;
    min-width: 0;
    width: 100%;
  }

  /*
    The host's own width picks the columns: a narrow effects panel stacks
    the looks, a phone drawer seats three across so all nine show at once,
    and a wide sheet five (nine sit 5 + 4; four across would leave one alone).
  */
  .fan-style-options :global(.option-grid) {
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 8.75rem), 1fr));
    gap: 10px;
  }

  @container fan-options (min-width: 15rem) {
    .fan-style-options :global(.option-grid) {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  /* A bounded host shares its height among the rows, so its shape picks the
     columns that keep a tile near its own shape. A tall narrow drawer (a
     tablet's) seats the nine two across: three across there stretches each
     tile into a slab with a small drawing in it. Phone drawers are shorter
     than 48rem and keep three. */
  @container fan-options (min-width: 15rem) and (max-width: 39.99rem) and (min-height: 48rem) and (max-aspect-ratio: 11 / 20) {
    .fan-style-options.fill :global(.option-grid) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    /* An odd count leaves the last tile alone; it sits centred, at a
       column's width, rather than beside an empty cell. */
    .fan-style-options.fill
      :global(.option-grid > :last-child:nth-child(odd)) {
      grid-column: 1 / -1;
      justify-self: center;
      width: calc(50% - 5px);
    }
  }

  /* Five across suits a wide host whose tiles keep their own shape: one with
     no fixed height, or a bounded one at least 8:5 wide (the room hosts turn
     at the same shape). A taller bounded host stays three across (3 x 3), on
     a flat frame floor so all nine still fit: two rows of five there stretch
     into slabs. */
  @container fan-options (min-width: 40rem) {
    .fan-style-options:not(.fill):not(.horizontal) :global(.option-grid) {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
  }

  @container fan-options (min-width: 40rem) and (min-aspect-ratio: 8 / 5) {
    .fan-style-options.fill :global(.option-grid) {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
  }

  /*
    Each compact preview is scaled so every fan reads at one size
    (imageScale). The tallest of them, the DoodleGrip at 1.92, stands 0.57
    card widths high, so a 3:2 frame holds it with air above and below
    instead of the 8:3 capture frame cropping its wicks.
  */
  .fan-style-options :global(.preview-frame) {
    aspect-ratio: 3 / 2;
    height: auto;
  }

  @media (max-height: 560px) {
    .fan-style-options :global(.preview-frame) {
      aspect-ratio: 5 / 3;
    }
  }

  /* The chosen look glows from behind. Screen blending lets the wash sit
     over captures that are opaque at the frame's own black, so it reads as
     light in the room rather than a tinted rectangle. */
  .fan-style-options :global(.preview-frame)::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 1;
    background: radial-gradient(
      62% 74% at 50% 56%,
      color-mix(in srgb, var(--prop-picker-accent) 62%, transparent),
      transparent 72%
    );
    opacity: 0;
    mix-blend-mode: screen;
    pointer-events: none;
    transition: opacity var(--duration-normal) var(--ease-standard);
  }

  .fan-style-options :global(.option.selected .preview-frame)::after {
    opacity: 0.5;
  }

  .fan-style-options :global(.option-label) {
    padding: 9px 12px 10px;
    font-size: 13px;
  }

  /* Names and makers are said in full: they wrap to a second line rather
     than trail off. The maker is 12px in its own spelling; capitals with
     tracking would not fit a three-across tile. Tiles in a row still end
     level, since grid items stretch to their row. */
  .fan-style-options :global(.option-name),
  .fan-style-options :global(.option-credit) {
    overflow: visible;
    white-space: normal;
    text-overflow: clip;
  }

  .fan-style-options :global(.option-credit) {
    font-size: var(--font-size-compact, 12px);
    letter-spacing: 0;
    text-transform: none;
  }

  /* A three-across tile is about 100px wide: the label keeps to the 12px
     floor and a tighter box so a two-line name and its maker fit. */
  @container fan-options (min-width: 15rem) and (max-width: 40rem) {
    .fan-style-options :global(.option-label) {
      padding: 6px 6px 7px;
      font-size: var(--font-size-compact, 12px);
      line-height: 1.15;
    }

    /* The drawing now reaches the tile's corners, so the selected tick is a
       small corner mark here rather than a 22px disc over a wick. */
    .fan-style-options :global(.option-grid .option .selected-badge) {
      top: 4px;
      right: 4px;
      width: 18px;
      height: 18px;
      font-size: var(--font-size-compact);
    }
  }

  /* Bounded hosts give the cards all available height to share. Their
     height is definite, so the chooser can also answer it (a short drawer
     flattens the frame floor below). */
  .fan-style-options.fill {
    container-type: size;
    height: 100%;
    min-height: 0;
  }

  .fan-style-options.fill :global(.fan-appearance-picker) {
    height: 100%;
    min-height: 0;
  }

  .fan-style-options.fill :global(.build-choice),
  .fan-style-options.fill :global(.modifier-grid),
  .fan-style-options.fill :global(.modifier-grid > div) {
    height: 100%;
    min-height: 0;
  }

  .fan-style-options.fill :global(.picker) {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  /* Rows grow to share the height when there is room and never shrink
     below a card's natural size: a short phone drawer scrolls the grid
     instead of cropping every fan. The 3px inset keeps a lifted or ringed
     card's edge inside the scrollport. */
  .fan-style-options.fill :global(.option-grid) {
    flex: 1;
    min-height: 0;
    grid-auto-rows: minmax(min-content, 1fr);
    overflow-y: auto;
    overscroll-behavior-y: contain;
    padding: 3px;
    margin: -3px;
  }

  .fan-style-options.fill :global(.option) {
    height: 100%;
    min-height: 0;
  }

  /* A grid item with an aspect ratio aligns to the start by default, which
     would park the frame at the top of a tall card above a black band. It
     stretches instead, and `contain` gives the fan the extra room as air. */
  .fan-style-options.fill :global(.preview-frame) {
    align-self: stretch;
  }

  /* In a bounded drawer the ratio is only the frame's floor: rows with room
     stretch it taller. A drawer under 25rem (a 360 x 640 phone) cannot hold
     three rows of 3:2 frames, so its floor is the flatter 7:4 (5:3 left the
     list 2px too tall to sit still). */
  @container fan-options (max-height: 25rem) {
    .fan-style-options.fill:not(.room) :global(.preview-frame) {
      aspect-ratio: 7 / 4;
    }
  }

  /* The same idea for the wide 3 x 3: a 3:1 floor lets three rows fit the
     shortest drawer that takes this shape (8:5), and any with more room
     stretch the frame back up. The drawings shrink to fit; none is cropped. */
  @container fan-options (min-width: 40rem) and (max-aspect-ratio: 8 / 5) {
    .fan-style-options.fill:not(.room) :global(.preview-frame) {
      aspect-ratio: 3 / 1;
    }
  }

  /* And for the tall drawer's five rows of two (the same query as its
     columns): a 5:2 floor fits them from 48rem tall. */
  @container fan-options (min-width: 15rem) and (max-width: 39.99rem) and (min-height: 48rem) and (max-aspect-ratio: 11 / 20) {
    .fan-style-options.fill:not(.room) :global(.preview-frame) {
      aspect-ratio: 5 / 2;
    }
  }

  /* A host that never scrolls: the box's shape picks the columns, the cards
     share its height, and a box too short for names shows the fans alone. */
  .fan-style-options.room {
    container: fan-room / size;
    flex: 1 1 0;
  }
  .fan-style-options.room :global(.fan-appearance-picker) {
    container-type: normal;
  }
  .fan-style-options.room :global(.option-grid) {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    grid-auto-rows: minmax(0, 1fr);
    gap: 4px;
    overflow: hidden;
    padding: 0;
    margin: 0;
  }
  @container fan-room (max-aspect-ratio: 3 / 4) {
    .fan-style-options.room :global(.option-grid) {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @container fan-room (min-aspect-ratio: 8 / 5) {
    .fan-style-options.room :global(.option-grid) {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
  }
  @container fan-room (min-aspect-ratio: 4 / 1) {
    .fan-style-options.room :global(.option-grid) {
      grid-template-columns: repeat(9, minmax(0, 1fr));
    }
  }
  .fan-style-options.room :global(.option) {
    border-radius: 8px;
  }
  .fan-style-options.room :global(.preview-frame) {
    height: auto;
    min-height: 0;
    aspect-ratio: auto;
  }
  .fan-style-options.room :global(.option-label) {
    min-height: 0;
    padding: 2px 4px;
    font-size: var(--font-size-compact, 12px);
    text-align: center;
  }
  @container fan-room (max-height: 8rem) {
    .fan-style-options.room :global(.option-label) {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      overflow: hidden;
      border: 0;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }

  /* The rail scrolls its cards sideways under a compact toolbar. */
  .fan-style-options.horizontal {
    container-type: size;
    height: 100%;
    min-height: 0;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-x: contain;
    scroll-snap-type: x proximity;
    touch-action: pan-x pinch-zoom;
    cursor: grab;
    padding: 2px 2px 8px;
  }
  .fan-style-options.horizontal.dragging {
    cursor: grabbing;
    scroll-snap-type: none;
    user-select: none;
  }
  .fan-style-options.horizontal :global(.fan-appearance-picker) {
    container-type: normal;
    display: flex;
    gap: 20px;
    width: max-content;
    min-width: 100%;
    height: 100%;
  }
  .fan-style-options.horizontal :global(.build-choice),
  .fan-style-options.horizontal :global(.modifier-grid) {
    flex: 0 0 auto;
    height: 100%;
    min-height: 0;
  }
  .fan-style-options.horizontal :global(.picker) {
    height: 100%;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
  }
  .fan-style-options.horizontal :global(.picker.headingless) {
    grid-template-rows: minmax(0, 1fr);
  }
  .fan-style-options.horizontal :global(.option-grid) {
    grid-template-columns: none;
    grid-auto-flow: column;
    grid-auto-columns: clamp(9.5rem, 28cqw, 13rem);
    grid-template-rows: minmax(0, 1fr);
    gap: 10px;
    min-height: 0;
  }
  .fan-style-options.horizontal :global(.option) {
    scroll-snap-align: start;
    min-height: 44px;
  }
  .fan-style-options.horizontal :global(.preview-frame) {
    height: 100%;
    min-height: 0;
    aspect-ratio: auto;
  }
  /* The rail has no row to spare for the note; each waiting tile keeps its
     clock mark and says the same words to a screen reader. */
  .fan-style-options.horizontal :global(.waiting-note),
  .fan-style-options.room :global(.waiting-note) {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  .fan-style-options.horizontal :global(.option-label) {
    font-size: var(--font-size-min, 14px);
    padding: 8px 12px 9px;
  }

  @media (prefers-reduced-motion: reduce) {
    .fan-style-options :global(.preview-frame)::after {
      transition: none;
    }
  }
</style>
