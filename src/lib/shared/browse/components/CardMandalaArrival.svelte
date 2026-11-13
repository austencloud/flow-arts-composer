<!--
  CardMandalaArrival

  What a slow gallery card shows while its picture is on the way (Austen,
  2026-11-12: "Own mandala, slow cards"). The card's own mandala draws itself
  once and holds. When the picture is ready beneath it, the drawing flies into
  the squares where the picture paints its mandalas while the picture fades
  in, and the copies land exactly on the painted ones, so the hand-off has no
  jump. A card whose picture paints no mandala lets the drawing shrink away
  instead.

  On a card with a full mandala and one per hand, the drawing splits three
  ways (Austen, 2026-11-12: "so it's like three different peels"): the joined
  figure flies to the full square while the blue and red hands peel off to
  theirs, all at once. Where both hands share a line the drawing is purple,
  as the card paints it (cardMandalaPalette), so nothing changes color as the
  picture takes over.

  PropAwareThumbnail mounts this only for a card still empty after a short
  wait, so a card that loads quickly never shows it. Under reduced motion the
  drawing appears finished and the picture swaps in without movement.

  The drawing sits in the composed card's own pixel space (the SVG viewBox is
  the canvas size, fitted the way the <img> is), so the landing squares come
  straight from computeSheetMandalaPlan.
-->
<script lang="ts" module>
  import type {
    MandalaHandVisibility,
    MandalaPalette,
    MandalaPaths,
  } from "#lib/shared/mandala/domain/mandala-types.js";
  import { resolveMandalaRenderExtent } from "#lib/shared/mandala/services/mandala-renderer.js";

  /**
   * Measure a drawing's reach before it mounts. The renderer keeps each
   * geometry's reach, so the card that asks while it waits mounts its drawing
   * without parsing every path in that frame.
   */
  export function warmCardArrival(paths: MandalaPaths): void {
    for (const show of ["both", "left", "right"] as const) {
      resolveMandalaRenderExtent(paths, { show });
    }
  }
</script>

<script lang="ts">
  import { onMount, untrack } from "svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { mandalaGridJoinOffsets } from "#lib/shared/mandala/services/mandala-grid-join.js";
  import {
    computeSheetMandalaPlan,
    type SheetMandalaSettings,
  } from "#lib/shared/browse/services/sheet-region-map.js";
  import type { MandalaVariant } from "#lib/shared/sequence-viewer/services/get-mandala-placements.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import {
    EASE_STANDARD,
    EASE_STANDARD_OUT,
    motionDuration,
  } from "#lib/shared/transitions/motion.js";
  import TKAWordGlyph from "#lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import { HEADER_GLYPH_HEIGHT_RATIO } from "@tka/render-composition";

  interface Props {
    sequence: SequenceData;
    paths: MandalaPaths;
    /** The card settings the picture is (or will be) painted with. */
    settings: SheetMandalaSettings;
    /** The card's mandala colors (cardMandalaPalette). */
    palette: MandalaPalette;
    word: string;
    /** Where the waiting card showed the word; the drawn word glides from it. */
    wordFrom: DOMRect | null;
    /** The card's size as the drawing starts; sizes the word from its first frame. */
    box: { width: number; height: number };
    lightMode: boolean;
    /** The picture is decoded and in place beneath, held hidden. */
    ready: boolean;
    /** Start the picture's fade-in. */
    onReveal: () => void;
    /** The hand-off is over; take the overlay away. */
    onDone: () => void;
  }

  const {
    sequence,
    paths,
    settings,
    palette,
    word,
    wordFrom,
    box,
    lightMode,
    ready,
    onReveal,
    onDone,
  }: Props = $props();

  /** The card's mandala line, in mandala units (ImageComposer.renderMandalas). */
  const LINE = 3;
  /** The drawing's side, as a share of the card body below the word strip. */
  const DRAWING_SHARE = 0.72;
  /** How small a drawing with no square to land on gets as it goes. */
  const AWAY_SCALE = 0.9;
  /** How long into its exit that drawing holds before it fades. */
  const AWAY_HOLD = 0.35;
  /** When in the flight the picture starts to show. */
  const REVEAL_AT = 0.5;
  /** How soon in the flight a peeling hand is fully drawn on its own. */
  const PEEL_SHOWN_AT = 0.15;

  type Hand = "left" | "right";
  interface Pose {
    x: number;
    y: number;
    s: number;
  }
  interface Copy {
    id: string;
    show: MandalaHandVisibility;
    hands: Hand[];
    /** Drawn from the start; the rest appear as they peel away. */
    lead: boolean;
    start: Pose;
    /** The painted square it lands on; null shrinks away instead. */
    variant: MandalaVariant | null;
  }

  const plan = $derived(computeSheetMandalaPlan(sequence, settings));
  const handOffsets = $derived(
    mandalaGridJoinOffsets(sequence.conjoined, sequence.gridMode)
  );

  function fit(show: MandalaHandVisibility, size: number): number {
    const extent = resolveMandalaRenderExtent(paths, { show, handOffsets });
    return size / 2 / (extent * 1.05);
  }

  function pose(p: Pose): string {
    return `translate(${p.x}px, ${p.y}px) scale(${p.s})`;
  }

  /**
   * The copies, fixed when the drawing starts. A "both" drawing is one copy
   * when the picture has a full mandala square (the one-hand squares peel
   * off it), or one copy per hand otherwise, which together make the same
   * figure.
   */
  function buildCopies(): Copy[] {
    const start = plan;
    const visible: Hand[] = [
      ...(settings.leftVisible ? (["left"] as const) : []),
      ...(settings.rightVisible ? (["right"] as const) : []),
    ];
    if (visible.length === 0) visible.push("left", "right");
    const bigShow: MandalaHandVisibility =
      visible.length === 2 ? "both" : visible[0]!;
    const bodyTop = start.headerHeight;
    const bodyHeight = start.height - bodyTop;
    const size = Math.min(start.width, bodyHeight) * DRAWING_SHARE;
    const big: Pose = {
      x: start.width / 2,
      y: bodyTop + bodyHeight / 2,
      s: fit(bigShow, size),
    };
    const offset = (hand: Hand) =>
      bigShow === "both" && handOffsets ? handOffsets[hand] : { x: 0, y: 0 };
    const handStart = (hand: Hand): Pose => ({
      x: big.x + big.s * offset(hand).x,
      y: big.y + big.s * offset(hand).y,
      s: big.s,
    });

    const copies: Copy[] = [];
    const hasFull =
      bigShow === "both" && start.spots.some((s) => s.variant === "full");
    if (hasFull) {
      copies.push({
        id: "full",
        show: "both",
        hands: ["left", "right"],
        lead: true,
        start: big,
        variant: "full",
      });
    }
    for (const hand of visible) {
      const hasSpot = start.spots.some((s) => s.variant === hand);
      if (hasFull && !hasSpot) continue;
      copies.push({
        id: hand,
        show: hand,
        hands: [hand],
        lead: !hasFull,
        start: handStart(hand),
        variant: hasSpot ? hand : null,
      });
    }
    return copies;
  }

  const copies = untrack(buildCopies);
  /** Peeling hands sit under the joined figure until they move off it. */
  const layered = [...copies].sort((a, b) => Number(a.lead) - Number(b.lead));
  const uid = $props.id();
  /** The overlap mask's reach, in mandala units, with room for the line. */
  const maskReach = untrack(
    () =>
      resolveMandalaRenderExtent(paths, { show: "both", handOffsets }) * 1.1 +
      LINE * 2
  );
  const hasOverlap = untrack(
    () => paths.left.length > 0 && paths.right.length > 0
  );
  let rootEl: HTMLDivElement;
  let wordEl = $state<HTMLDivElement | null>(null);
  let wordStrip = $state<DOMRectReadOnly | null>(null);
  /**
   * The strip's height worked out from the card's size, for the frames before
   * the strip's own size binding reports. Sizing the word only once the
   * binding reported laid every starting card out twice, which dropped
   * frames across a screen of them.
   */
  const stripSeed = untrack(() => {
    const { width, height, headerHeight } = plan;
    return headerHeight * Math.min(box.width / width, box.height / height);
  });
  /**
   * The word drawn at the height the picture letters it, the same share of
   * the strip the painter uses. No floor: a 12 px floor drew it taller than
   * a thin strip, cut off at the card's top edge and about twice the painted
   * title's size. Kept to a tenth of a pixel, so the binding's first report
   * does not nudge the size the seed already gave.
   */
  const wordHeight = $derived(
    Math.max(
      1,
      Math.round(
        (wordStrip?.height ?? stripSeed) * HEADER_GLYPH_HEIGHT_RATIO * 10
      ) / 10
    )
  );

  const drawMs = motionDuration(DURATION.scene * 1.5);
  let draws: Animation[] = [];
  let started = $state(false);
  let handedOff = false;
  let destroyed = false;
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const running = new Set<Animation>();

  function track(animation: Animation): Animation {
    running.add(animation);
    return animation;
  }

  function wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        resolve();
      }, ms);
      timers.add(timer);
    });
  }

  function settled(animations: Animation[]): Promise<unknown> {
    return Promise.all(animations.map((a) => a.finished.catch(() => null)));
  }

  /**
   * The word the waiting card showed glides up into the strip, where the
   * picture letters it, instead of jumping there.
   */
  function glideWord(): void {
    const glideMs = motionDuration(DURATION.emphasis);
    if (!wordEl || !wordFrom || glideMs <= 0 || wordFrom.width === 0) return;
    // An unsized word would start its glide many times too big.
    if (stripSeed <= 0) return;
    const row = wordEl.querySelector(".glyph-row")?.getBoundingClientRect();
    if (!row || row.width === 0) return;
    // Where the word comes to rest: centred in the strip's word room, and no
    // wider than it. The row's own fit to the room can land a frame after
    // this, so the room decides the size, not the row as measured now.
    const box = wordEl.getBoundingClientRect();
    const toWidth = Math.min(row.width, box.width);
    const toX = box.left + box.width / 2;
    const toY = box.top + box.height / 2;
    const dx = wordFrom.left + wordFrom.width / 2 - toX;
    const dy = wordFrom.top + wordFrom.height / 2 - toY;
    const scale = wordFrom.width / toWidth;
    wordEl.style.transformOrigin = `${toX - box.left}px ${toY - box.top}px`;
    track(
      wordEl.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(${scale})` },
          { transform: "none" },
        ],
        { duration: glideMs, easing: EASE_STANDARD }
      )
    );
  }

  onMount(() => {
    // Measured first, while the layout is still clean from mounting.
    glideWord();
    // Ink shows from the first frame, then eases into the last strokes.
    draws = [...rootEl.querySelectorAll<SVGPathElement>("path.trace")].map(
      (path) =>
        track(
          path.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], {
            duration: drawMs,
            easing: EASE_STANDARD_OUT,
            fill: "forwards",
          })
        )
    );
    started = true;
    return () => {
      destroyed = true;
      for (const timer of timers) clearTimeout(timer);
      for (const animation of running) animation.cancel();
    };
  });

  $effect(() => {
    if (ready && started) void handOff();
  });

  async function handOff(): Promise<void> {
    if (handedOff) return;
    handedOff = true;

    // A picture that is ready mid-drawing does not wait out the whole draw:
    // what is left of it finishes within a short beat, then the drawing
    // flies. Too short a beat lurches.
    const finishMs = motionDuration(DURATION.emphasis);
    for (const draw of draws) {
      const left = drawMs - Number(draw.currentTime ?? drawMs);
      if (finishMs > 0 && left > finishMs) draw.updatePlaybackRate(left / finishMs);
    }
    await settled(draws);
    if (destroyed) return;

    const flyMs = motionDuration(DURATION.dramatic);
    const awayMs = motionDuration(DURATION.emphasis);
    const fadeMs = motionDuration(DURATION.emphasis);
    const landing = plan;
    const flights: Animation[] = [];
    let lands = false;
    const copyEls = new Map<string, SVGGElement>();
    for (const el of rootEl.querySelectorAll<SVGGElement>("g.copy")) {
      copyEls.set(el.dataset.copy ?? "", el);
    }
    for (const copy of copies) {
      const el = copyEls.get(copy.id);
      if (!el) continue;
      const spot = copy.variant
        ? landing.spots.find((s) => s.variant === copy.variant)
        : undefined;
      const from = { transform: pose(copy.start), opacity: copy.lead ? 1 : 0 };
      if (spot) {
        lands = true;
        const end: Pose = {
          x: spot.cx,
          y: spot.cy,
          s: fit(copy.show, spot.size),
        };
        flights.push(
          track(
            el.animate(
              [
                from,
                ...(copy.lead ? [] : [{ opacity: 1, offset: PEEL_SHOWN_AT }]),
                { transform: pose(end), opacity: 1 },
              ],
              { duration: flyMs, easing: EASE_STANDARD, fill: "forwards" }
            )
          )
        );
      } else {
        // Holds a moment while the picture comes up beneath, then shrinks
        // away, so the card never goes dark between the two.
        const end: Pose = { ...copy.start, s: copy.start.s * AWAY_SCALE };
        flights.push(
          track(
            el.animate(
              [
                from,
                { opacity: from.opacity, offset: AWAY_HOLD },
                { transform: pose(end), opacity: 0 },
              ],
              { duration: awayMs, easing: EASE_STANDARD, fill: "forwards" }
            )
          )
        );
      }
    }

    // The picture starts to show while the copies are still on their way,
    // or at once when nothing lands, and the drawn word gives way to the
    // picture's.
    if (lands) {
      await wait(flyMs * REVEAL_AT);
      if (destroyed) return;
    }
    onReveal();
    if (wordEl) {
      track(
        wordEl.animate([{ opacity: 1 }, { opacity: 0 }], {
          duration: fadeMs,
          easing: EASE_STANDARD,
          fill: "forwards",
        })
      );
    }

    // The copies land on the painted mandalas with the picture mostly in;
    // the drawing then crossfades into it rather than sitting on top.
    await settled(flights);
    if (destroyed) return;
    const out = track(
      rootEl.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: motionDuration(DURATION.fast),
        easing: EASE_STANDARD,
        fill: "forwards",
      })
    );
    await settled([out]);
    if (!destroyed) onDone();
  }

  function handTransform(copy: Copy, hand: Hand): string | undefined {
    if (copy.show !== "both" || !handOffsets) return undefined;
    const { x, y } = handOffsets[hand];
    return `translate(${x} ${y})`;
  }
</script>

<div class="card-arrival" bind:this={rootEl} aria-hidden="true">
  {#if plan.headerHeight > 0 && word}
    <!-- The picture's own frame: the card box can be a little taller or wider
         than the picture, which then sits letterboxed in it, as the svg does. -->
    <div
      class="arrival-frame"
      style:width="min(100cqw, 100cqh * {plan.width / plan.height})"
      style:height="min(100cqh, 100cqw * {plan.height / plan.width})"
    >
      <!-- The word fits the room the picture letters it in, between the level
           badge and the LOOP icons, so a long word lands at the painted size. -->
      <div
        class="arrival-word"
        bind:this={wordEl}
        style:height="{(plan.headerHeight / plan.height) * 100}%"
        style:left="{(plan.word.left / plan.width) * 100}%"
        style:right="{((plan.width - plan.word.right) / plan.width) * 100}%"
        bind:contentRect={wordStrip}
      >
        <TKAWordGlyph
          {word}
          height={wordHeight}
          darkMode={!lightMode}
          fitToParent
        />
      </div>
    </div>
  {/if}
  <svg
    viewBox="0 0 {plan.width} {plan.height}"
    preserveAspectRatio="xMidYMid meet"
  >
    {#each layered as copy (copy.id)}
      <g
        class="copy"
        class:peel={!copy.lead}
        style:transform={pose(copy.start)}
        data-copy={copy.id}
      >
        {#each copy.hands as hand (hand)}
          <g transform={handTransform(copy, hand)}>
            {#each paths[hand] as path, i (i)}
              <path
                class:trace={copy.lead}
                d={path.d}
                pathLength="1"
                stroke={hand === "left" ? palette.leftStroke : palette.rightStroke}
                stroke-width={LINE}
              />
            {/each}
          </g>
        {/each}
        {#if copy.show === "both" && hasOverlap}
          <!-- Where both hands share a line, purple over both, the way the
               card composites it (compositeMandalaOverlap): the right hand's
               lines in purple, kept only where the left hand's lines are. -->
          <mask
            id="{uid}-{copy.id}"
            maskUnits="userSpaceOnUse"
            x={-maskReach}
            y={-maskReach}
            width={maskReach * 2}
            height={maskReach * 2}
          >
            <g transform={handTransform(copy, "left")}>
              {#each paths.left as path, i (i)}
                <path
                  class="mask-line"
                  class:trace={copy.lead}
                  d={path.d}
                  pathLength="1"
                  stroke="white"
                  stroke-width={LINE}
                />
              {/each}
            </g>
          </mask>
          <g mask="url(#{uid}-{copy.id})">
            <g transform={handTransform(copy, "right")}>
              {#each paths.right as path, i (i)}
                <path
                  class:trace={copy.lead}
                  d={path.d}
                  pathLength="1"
                  stroke={palette.purpleStroke}
                  stroke-width={LINE}
                />
              {/each}
            </g>
          </g>
        {/if}
      </g>
    {/each}
  </svg>
</div>

<style>
  .card-arrival {
    position: absolute;
    inset: 0;
    pointer-events: none;
    container-type: size;
  }

  .arrival-frame {
    position: absolute;
    inset: 0;
    margin: auto;
  }

  svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  .copy {
    transform-box: view-box;
    transform-origin: 0 0;
  }

  .peel {
    opacity: 0;
  }

  path {
    fill: none;
    stroke-linecap: round;
    /* The card strokes its mandala at 0.9 (renderMandalaToCanvas). */
    opacity: 0.9;
  }

  .mask-line {
    opacity: 1;
  }

  .trace {
    stroke-dasharray: 1 1;
    stroke-dashoffset: 1;
  }

  .arrival-word {
    position: absolute;
    top: 0;
    display: flex;
    align-items: center;
    justify-content: center;
  }
</style>
