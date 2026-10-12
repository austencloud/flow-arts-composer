<!--
  One move of one hand (blue unless `hand` says red), drawn over the grid: a
  shift or the dash as a real arrow (one arrow-only pictograph each), or, for
  static, a soft halo on the hand's own point, which has no arrow in the book.
  `to` null fades the shown move out.

  The arrows are drawn ahead of time in two banks of three, one per move from
  a point. While one bank shows an arrow, the other gets ready for the point
  that arrow ends on, so the next move from there is already drawn. An arrow
  shows only once its bank has drawn it from the right point: before
  2026-10-12 a bank was re-pointed as it was shown, and the old point's arrow
  flashed for a moment first (Austen: "it seems to briefly show the arrow in a
  different spot before it suddenly disappears").

  With `drawMs`, a shown arrow draws itself on from its tail to its tip, a
  shift around the grid's centre and the dash straight across, instead of
  fading in. `settleMs` holds the other bank's redraw until the move has
  played: drawing three arrows takes a frame of over 100 ms, which made the
  arrow drawing on jump.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import { cubicOut } from "svelte/easing";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import {
    GridMode,
    GridLocation,
  } from "#lib/shared/pictograph/grid/domain/enums/grid-enums.js";
  import { getPlacementGridPoints } from "#lib/shared/pictograph/grid/services/placement-grid-points.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
  import { reducedMotion } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import {
    motionMapArrowData,
    motionMapTargets,
    type MotionMapSlot,
    type MotionMapTarget,
  } from "./hand-motions-topic.js";

  interface Props {
    from: GridLocation;
    /** Where the shown move ends; `from` itself for static, null for none. */
    to: GridLocation | null;
    hand?: HandSide;
    /** Draw a shown arrow on over this long instead of fading it in. */
    drawMs?: number;
    /** How long a shown move plays, so the next moves draw after it. */
    settleMs?: number;
  }

  let {
    from,
    to,
    hand = HandSide.LEFT,
    drawMs = 0,
    settleMs = 0,
  }: Props = $props();

  const handPoints = getPlacementGridPoints(GridMode.DIAMOND);
  const BANKS = [0, 1] as const;
  type Bank = (typeof BANKS)[number];

  /** The point each bank's three arrows start from. */
  let bankFrom = $state<Record<Bank, GridLocation>>({
    0: untrack(() => from),
    1: untrack(() => from),
  });
  /** The point each arrow was last drawn from, by bank and move. */
  let drawnFrom = $state<Record<string, GridLocation>>({});
  /** The arrow on show: its bank and where it ends. */
  let shown = $state<{ bank: Bank; to: GridLocation } | null>(null);
  /** How much of the shown arrow has drawn on, 0 to 1. */
  let reveal = $state(1);
  let revealFrame = 0;
  let revealStarted = false;
  /** Banks waiting to be re-pointed once their arrow has faded out. */
  const repoints = new Map<Bank, ReturnType<typeof setTimeout>>();

  const banks = $derived(
    BANKS.map((bank) => ({
      bank,
      targets: motionMapTargets(bankFrom[bank]),
    }))
  );

  function layerKey(bank: Bank, slot: MotionMapSlot) {
    return `${bank}:${slot}`;
  }

  function isDrawn(bank: Bank, target: MotionMapTarget) {
    return drawnFrom[layerKey(bank, target.slot)] === bankFrom[bank];
  }

  function other(bank: Bank): Bank {
    return bank === 0 ? 1 : 0;
  }

  /** Points a hidden bank at a new start, once its arrow has faded. */
  function repoint(bank: Bank, start: GridLocation, afterMs: number) {
    clearTimeout(repoints.get(bank));
    repoints.delete(bank);
    if (bankFrom[bank] === start) return;
    const go = () => {
      repoints.delete(bank);
      if (shown?.bank === bank) return;
      bankFrom[bank] = start;
    };
    if (afterMs <= 0) go();
    else repoints.set(bank, setTimeout(go, afterMs));
  }

  function show(start: GridLocation, end: GridLocation | null) {
    const leaving = shown?.bank ?? null;
    if (end === null || end === start) {
      shown = null;
      return;
    }
    if (shown && bankFrom[shown.bank] === start && shown.to === end) return;
    // A bank already drawn from here, the idle one first.
    const ready = BANKS.filter((bank) => bankFrom[bank] === start).sort(
      (a, b) => Number(a === leaving) - Number(b === leaving)
    );
    let bank: Bank;
    if (ready[0] !== undefined) {
      bank = ready[0];
    } else {
      bank = leaving === null ? 0 : other(leaving);
      clearTimeout(repoints.get(bank));
      repoints.delete(bank);
      bankFrom[bank] = start;
    }
    shown = { bank, to: end };
    startReveal();
    // The other bank gets ready for the next move, from where this one ends,
    // once this one has played and the old arrow has faded.
    const idle = other(bank);
    repoint(
      idle,
      end,
      Math.max(settleMs, leaving === idle ? DURATION.normal : 0)
    );
  }

  function startReveal() {
    cancelAnimationFrame(revealFrame);
    revealFrame = 0;
    revealStarted = false;
    reveal = drawMs > 0 && !reducedMotion() ? 0 : 1;
  }

  /** Draws the shown arrow on once its bank has drawn it. */
  $effect(() => {
    const current = shown;
    if (!current || revealStarted || reveal >= 1) return;
    const target = banks[current.bank]?.targets.find(
      (candidate) => candidate.to === current.to
    );
    if (!target || !isDrawn(current.bank, target)) return;
    revealStarted = true;
    const startedAt = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - startedAt) / drawMs);
      reveal = cubicOut(t);
      revealFrame = t < 1 ? requestAnimationFrame(step) : 0;
    };
    revealFrame = requestAnimationFrame(step);
  });

  $effect(() => {
    const start = from;
    const end = to;
    untrack(() => show(start, end));
  });

  $effect(() => {
    return () => {
      cancelAnimationFrame(revealFrame);
      for (const timer of repoints.values()) clearTimeout(timer);
    };
  });

  const ANGLE: Partial<Record<GridLocation, number>> = {
    [GridLocation.NORTH]: 0,
    [GridLocation.EAST]: 90,
    [GridLocation.SOUTH]: 180,
    [GridLocation.WEST]: 270,
  };
  /** A shift's arrow reaches a little past both of its points. */
  const SHIFT_PAD = 20;
  const SHIFT_SPAN = 90 + SHIFT_PAD * 2;
  const SOFT_DEG = 8;
  const SOFT_PCT = 8;

  /** The part of the arrow drawn so far, as a mask; none once it is whole. */
  function revealMask(
    start: GridLocation,
    target: MotionMapTarget,
    amount: number
  ): string | undefined {
    if (amount >= 1) return undefined;
    if (target.move === "dash") {
      const edge = -SOFT_PCT + amount * (100 + SOFT_PCT * 2);
      return `linear-gradient(${ANGLE[target.to] ?? 0}deg, #000 ${edge - SOFT_PCT}%, transparent ${edge}%)`;
    }
    const startAngle = ANGLE[start] ?? 0;
    const sweep = amount * SHIFT_SPAN;
    if (target.direction === "clockwise") {
      return `conic-gradient(from ${startAngle - SHIFT_PAD}deg, #000 ${sweep - SOFT_DEG}deg, transparent ${sweep}deg)`;
    }
    return `conic-gradient(from ${startAngle + SHIFT_PAD - sweep}deg, transparent 0deg, #000 ${Math.min(SOFT_DEG, sweep)}deg, #000 ${sweep}deg, transparent ${sweep}deg)`;
  }
</script>

<div class="motion-map-arrows" class:red={hand === HandSide.RIGHT}>
  {#each banks as { bank, targets } (bank)}
    {#each targets as target (target.slot)}
      {@const isShown =
        shown?.bank === bank && shown.to === target.to && isDrawn(bank, target)}
      {@const mask = isShown
        ? revealMask(bankFrom[bank], target, reveal)
        : undefined}
      <div
        class="layer"
        class:shown={isShown}
        class:drawing={drawMs > 0}
        style:mask-image={mask}
      >
        <PictographContainer
          pictographData={motionMapArrowData(bankFrom[bank], target, hand)}
          gridMode={GridMode.DIAMOND}
          leftPropTypeOverride={PropType.HAND}
          rightPropTypeOverride={PropType.HAND}
          visibleHand={hand}
          showGrid={false}
          showProps={false}
          transparentBackground={true}
          showTKA={false}
          showReversals={false}
          showTnD={false}
          showElemental={false}
          showPlacements={false}
          showNonRadialPoints={false}
          showHandPoints={false}
          stepNumberOverride={false}
          onReady={() => {
            drawnFrom[layerKey(bank, target.slot)] = bankFrom[bank];
          }}
        />
      </div>
    {/each}
  {/each}
  <svg class="layer halo" viewBox="0 0 950 950" aria-hidden="true">
    {#each handPoints as point (point.location)}
      <circle
        cx={point.x}
        cy={point.y}
        r="78"
        class:shown={point.location === from && to === from}
      />
    {/each}
  </svg>
</div>

<style>
  .motion-map-arrows {
    --hand-color: var(--prop-blue, #3b82f6);
    position: absolute;
    inset: 0;
  }
  .motion-map-arrows.red {
    --hand-color: var(--prop-red, #ef4444);
  }
  .layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .layer:not(.halo),
  .halo circle {
    opacity: 0;
    transition: opacity var(--transition-normal);
  }
  /* A drawn-on arrow appears through its mask, not a fade. */
  .layer.drawing.shown {
    transition: none;
  }
  .layer.shown,
  .halo circle.shown {
    opacity: 1;
  }
  .halo circle {
    fill: color-mix(in srgb, var(--hand-color) 14%, transparent);
    stroke: var(--hand-color);
    stroke-width: 5;
    stroke-opacity: 0.8;
  }
</style>
