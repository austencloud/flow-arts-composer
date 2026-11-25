<script lang="ts" module>
  import type {
    QftIncrement,
    QftKnobs,
  } from "#lib/shared/notation/qft/qft-model.js";
  import {
    type QftTrajectory as QftHandTrajectory,
    traceTrajectory,
    trajectoryPosesAt,
    type QftTrajectory,
  } from "@tka/shape-domain";

  /** Which prop a figure is, and therefore what colour it wears. */
  export type QftTone = "accent" | "blue" | "red";

  export interface QftHand {
    knobs?: QftKnobs;
    trajectory?: QftHandTrajectory;
    increments: QftIncrement[];
    tone?: QftTone;
    pendulum?: boolean;
  }

  const TONE_COLOR: Record<QftTone, string> = {
    accent: "var(--theme-accent, #8b5cf6)",
    blue: "var(--dm-motion-blue, #3575E2)",
    red: "var(--dm-motion-red, #ED1C24)",
  };
</script>

<script lang="ts">
  /**
   * The stage: home base, and one figure per hand.
   *
   * Everything here is computed from qft-model. Nothing is traced from the
   * original 2011 animations.
   *
   * The stage owns the picture as a whole — the viewBox, how far the drawing
   * reaches, and the body compass every hand is read against. Each hand's own
   * notation marks (path, sector, dart, prop compass) are a QftFigure.
   *
   * The poi itself, its trail and the frame-by-frame drawing are the app's
   * shared animation canvas: the same poi sprite and the same trail every
   * other screen uses. QfT only feeds it poses (qft-canvas-poses) and lays its
   * notation over it in the same coordinates.
   */
  import {
    pendulumPosesAt,
    pointAt,
    posesAt,
    tracePath,
    tracePendulum,
    PROP_LENGTH,
  } from "#lib/shared/notation/qft/qft-model.js";
  import {
    ALL_LAYERS,
    type QftLayers,
  } from "#lib/shared/notation/qft/qft-layers.js";
  import QftFigure from "./QftFigure.svelte";
  import { onMount } from "svelte";
  import AnimatorCanvas from "#lib/shared/animation-engine/components/AnimatorCanvas.svelte";
  import { animationSettings } from "#lib/shared/animation-engine/state/animation-settings-state.svelte.js";
  import { TrackingMode } from "#lib/shared/animation-engine/domain/types/trail-types.js";
  import {
    setCellWide,
    type TipEffectMap,
  } from "#lib/shared/animation-engine/services/tip-effect-resolver.js";
  import type { PropState } from "#lib/shared/foundation/domain/types/prop-state.js";
  import {
    CANVAS_VIEWBOX,
    QFT_UNIT_IN_VIEWBOX,
    qftPropState,
  } from "#lib/shared/notation/qft/qft-canvas-poses.js";

  interface Props {
    /** Single-hand form: the guide and the instrument both use this. */
    knobs?: QftKnobs;
    /** Per-step-rate form used by reversal patterns. */
    trajectory?: QftTrajectory;
    increments?: QftIncrement[];
    /**
     * Multi-hand form. A matrix cell is two flowers, so the stage takes a list
     * and draws the body compass once underneath all of them. Supplying this
     * overrides the single-hand props.
     */
    hands?: QftHand[];
    /** Continuous position in the eight-step cycle. */
    cursor: number;
    /**
     * Each hand's own place in the cycle, when its swing sets its speed. Kept
     * apart from `hands` so a list that changes every frame does not read as a
     * new move.
     */
    cursors?: number[];
    /**
     * A pendulum swings back along its own arc, which the three knobs cannot
     * express. Drawing it from the knobs sends the head around a full circle
     * while the notation oscillates, so the lit number lands nowhere near the
     * prop it names.
     */
    pendulum?: boolean;
    /**
     * Which layers to draw.
     *
     * The stage carries six things that are each a separate claim about the
     * move, and reading any one of them is easier with the others out of the
     * way — the direction dart in particular is hard to follow through a lit
     * trail and two compasses. The prop itself (hand, tether, head) is not on
     * this list: with that gone there is no stage.
     */
    layers?: QftLayers;
    /**
     * Half the viewBox, in the same units as UNIT below — that is, how far the
     * stage reserves room for the drawing to reach.
     *
     * It has to be CONSTANT across every move a reader compares, or the radius
     * would stop meaning anything: a small move would be drawn at the same size
     * as a large one. But it does not have to be the same constant everywhere.
     * The default covers the instrument, whose radius knob goes to 1.5 and whose
     * widest setting measures 254. The guide's eight moves top out at 222, so it
     * passes a tighter extent and gets a correspondingly larger drawing.
     */
    extent?: number;
    /**
     * Size the viewBox to what this move actually reaches, rather than to a
     * fixed reserve.
     *
     * A fixed extent has to cover the widest thing it will ever be asked to
     * draw, so every move narrower than that is rendered inside a margin it
     * never uses — Isolation was filling 65% of its box, on a page whose entire
     * job is to show it. Fitting recovers that.
     *
     * The instrument does NOT fit: its radius knob is a continuous control, and
     * a stage that rescales as you drag it would make the knob look like it was
     * doing nothing. The guide's moves are discrete, each states its radius in
     * words, and the hand path stays legible against the compass ring — so
     * there the fit is free.
     */
    fit?: boolean;
  }

  let {
    knobs,
    trajectory,
    increments,
    hands,
    cursor,
    cursors,
    pendulum = false,
    layers = ALL_LAYERS,
    extent = 270,
    fit = false,
  }: Props = $props();

  /**
   * One list, whichever form the caller used.
   *
   * The single-hand props stay because the guide and the instrument are
   * genuinely one hand and should not have to build a one-element array to say
   * so — and because keeping them meant the eight guide moves went through this
   * refactor untouched.
   */
  const figures = $derived<QftHand[]>(
    hands ?? [
      {
        knobs: trajectory
          ? undefined
          : (knobs ?? { radius: 1, downbeats: 1, spin: "inspin" }),
        trajectory,
        increments: increments ?? [],
        tone: "accent",
        pendulum,
      },
    ]
  );

  /** Pixels per prop length. The head reaches radius + 1, so 2.5 at the widest. */
  const UNIT = 100;
  const DEFAULT_KNOBS: QftKnobs = {
    radius: 1,
    downbeats: 1,
    spin: "inspin",
  };
  const HOME_BASE = [1, 2, 3, 4, 5, 6, 7, 8];
  const RING = PROP_LENGTH * UNIT;

  const cursorAt = (index: number) => cursors?.[index] ?? cursor;
  const rowAt = (index: number) =>
    figures[index]?.increments[Math.floor(cursorAt(index)) % 8];
  /** The body compass reads against the first hand; blue, in a duet. */
  const row = $derived(rowAt(0));

  const labelPoint = (position: number) => {
    const p = pointAt(position, PROP_LENGTH * 1.28);
    return { x: p.x * UNIT, y: p.y * UNIT };
  };

  /* Radii of the things that stick out past the point they are drawn at. */
  const LABEL_R = 26;
  const HEAD_R = 22;
  const STROKE_R = 5;
  /** Roughly the dart's arrowhead, which the geometry below does not include. */
  const MARKER_R = 12;
  const DART_LENGTH = 0.55;
  const DART_TRAVEL = 0.8;

  /**
   * How far the drawing reaches from the centre, over its whole cycle and
   * across every hand on the stage.
   *
   * Measured off the model rather than off the rendered DOM: a `getBBox` pass
   * would only know about the frame currently on screen, so the stage would
   * rescale the first time a later step reached further — and rescaling a
   * drawing mid-cycle is worse than drawing it small.
   *
   * Layer state is deliberately NOT consulted. Switching a layer off would
   * otherwise resize everything left behind, which reads as the stage lurching
   * rather than as one element disappearing.
   */
  const reach = $derived.by(() => {
    let out = PROP_LENGTH * 1.28 * UNIT + LABEL_R;
    const bump = (x: number, y: number, pad: number) => {
      out = Math.max(out, Math.abs(x) + pad, Math.abs(y) + pad);
    };

    for (const figure of figures) {
      const swinging = figure.pendulum ?? false;
      const figureKnobs = figure.knobs ?? DEFAULT_KNOBS;
      const samples = figure.trajectory
        ? traceTrajectory(figure.trajectory)
        : swinging
          ? tracePendulum()
          : tracePath(figureKnobs);
      for (const p of samples) bump(p.x * UNIT, p.y * UNIT, HEAD_R);

      for (let k = 0; k < 8; k += 1) {
        const at = figure.trajectory
          ? trajectoryPosesAt(figure.trajectory, k)
          : swinging
            ? pendulumPosesAt(k)
            : posesAt(figureKnobs, k);
        const h = { x: at.hand.x * UNIT, y: at.hand.y * UNIT };
        /* The prop's own compass rides the hand, so it reaches a prop length past it. */
        bump(h.x, h.y, PROP_LENGTH * UNIT + STROKE_R);

        const value = figure.increments[k]?.propDirDepart;
        if (value === undefined || value === "n") continue;
        /* The dart fires from the departure point and runs its full travel. */
        const offset = pointAt(
          figure.increments[k]?.propDepart ?? 8,
          PROP_LENGTH
        );
        const heading = pointAt(value, (DART_TRAVEL + DART_LENGTH) * UNIT);
        bump(
          h.x + offset.x * UNIT + heading.x,
          h.y + offset.y * UNIT + heading.y,
          MARKER_R
        );
      }
    }

    return out;
  });

  /** A little air, so nothing sits flush against the edge of the box. */
  const FIT_MARGIN = 1.04;

  /* Declared here rather than beside UNIT: `reach` is defined above, and
     referencing it earlier is a temporal dead zone that survives client-side
     HMR but fails the server render outright. */
  const EXTENT = $derived(fit ? reach * FIT_MARGIN : extent);

  /**
   * Which hands depart from each body-compass position this step.
   *
   * In a duet two hands can sit on the same number — that IS together timing —
   * so a position carries a list rather than a flag, and the label is tinted by
   * the first hand on it.
   */
  const departures = $derived.by(() => {
    const map = new Map<number, QftTone[]>();
    for (const [index, figure] of figures.entries()) {
      const at = rowAt(index)?.handDepart;
      if (at === undefined) continue;
      const tone = figure.tone ?? "accent";
      map.set(at, [...(map.get(at) ?? []), tone]);
    }
    return map;
  });

  const arrivals = $derived.by(() => {
    const out = new Set<number>();
    for (const index of figures.keys()) {
      const at = rowAt(index)?.handArrive;
      if (at !== undefined) out.add(at);
    }
    return out;
  });

  const soloLabel = $derived(
    `QfT home base. The hand is at position ${row?.handDepart ?? 8} on the body compass, and the prop is at position ${row?.propDepart ?? 8} measured from the hand.`
  );

  const duetLabel = $derived(
    `QfT home base. ${figures
      .map(
        (f, index) =>
          `The ${f.tone ?? "accent"} hand is at position ${rowAt(index)?.handDepart ?? 8}, its prop at ${rowAt(index)?.propDepart ?? 8}`
      )
      .join(". ")}.`
  );

  /*
   * The canvas side. A solo hand is the blue poi, like the app's own single
   * poi; in a duet the tones name the slot.
   */
  const slotOf = (figure: QftHand, index: number): "left" | "right" =>
    figure.tone === "red" || (figure.tone === undefined && index === 1)
      ? "right"
      : "left";

  function figurePosesAt(figure: QftHand, at: number) {
    if (figure.trajectory) return trajectoryPosesAt(figure.trajectory, at);
    if (figure.pendulum) return pendulumPosesAt(at);
    return posesAt(figure.knobs ?? DEFAULT_KNOBS, at);
  }

  const canvasProps = $derived.by(() => {
    let left: PropState | null = null;
    let right: PropState | null = null;
    figures.forEach((figure, index) => {
      const state = qftPropState(figurePosesAt(figure, cursorAt(index)));
      if (slotOf(figure, index) === "right") right = state;
      else left = state;
    });
    return { left, right };
  });

  /** The notation colour follows the poi it describes. */
  const figureTone = (figure: QftHand, index: number): QftTone =>
    figure.tone && figure.tone !== "accent"
      ? figure.tone
      : slotOf(figure, index) === "right"
        ? "red"
        : "blue";

  /* The app's own trail, from the reader's trail settings. A poi has one tip. */
  const TRAIL_TIPS: TipEffectMap = setCellWide({}, "trails");
  const trailSettings = $derived({
    ...animationSettings.trail,
    trackingMode: TrackingMode.RIGHT_END,
  });

  /*
   * The canvas draws its trail from whatever poses arrive, so a jump would
   * streak a chord across the flower. The trail starts over when the cursor
   * runs backwards, leaps forward, or the move itself changes.
   */
  let trailResetKey = $state(0);

  /* The canvas needs a browser; the notation still renders on the server. */
  let mounted = $state(false);
  onMount(() => {
    mounted = true;
  });
  let lastCursor: number | null = null;
  let lastShape: unknown = null;
  $effect.pre(() => {
    const at = cursor;
    const shape = figures;
    if (lastCursor !== null) {
      /* Shortest way round the eight-step loop, so 7.98 to 0.02 runs forward. */
      const delta = ((((at - lastCursor) % 8) + 12) % 8) - 4;
      if (shape !== lastShape || delta < -1e-6 || delta > 0.75) {
        trailResetKey += 1;
      }
    }
    lastCursor = at;
    lastShape = shape;
  });

  /*
   * The canvas shows its whole 950 viewBox; the stage shows EXTENT around the
   * centre. Growing the canvas past the stage's edge by this much and cropping
   * it puts one QfT prop length at the same size in both layers.
   */
  const canvasZoom = $derived(
    CANVAS_VIEWBOX / 2 / ((EXTENT / UNIT) * QFT_UNIT_IN_VIEWBOX)
  );
</script>

<div
  class="stage"
  role="img"
  aria-label={figures.length > 1 ? duetLabel : soloLabel}
>
  <div class="square">
    <svg
      class="notation under"
      viewBox={`${-EXTENT} ${-EXTENT} ${EXTENT * 2} ${EXTENT * 2}`}
      aria-hidden="true"
    >
      {#if layers.handCompass}
        <circle class="ring" cx="0" cy="0" r={RING} />
      {/if}

      {#each figures as figure, i (i)}
        <QftFigure
          knobs={figure.knobs}
          trajectory={figure.trajectory}
          increments={figure.increments}
          cursor={cursorAt(i)}
          unit={UNIT}
          {layers}
          pendulum={figure.pendulum ?? false}
          color={TONE_COLOR[figureTone(figure, i)]}
          dartColor={figure.tone && figure.tone !== "accent"
            ? TONE_COLOR[figure.tone]
            : "var(--semantic-warning, #fbbf24)"}
          uid={`${i}`}
          part="under"
        />
      {/each}
    </svg>
    <div class="canvas-box" style={`--zoom: ${canvasZoom};`} aria-hidden="true">
      {#if mounted}
        <AnimatorCanvas
          leftProp={canvasProps.left}
          rightProp={canvasProps.right}
          leftPropType="poi"
          rightPropType="poi"
          {trailSettings}
          tipEffectMap={layers.trail ? TRAIL_TIPS : undefined}
          {trailResetKey}
          gridVisible={false}
          backgroundAlpha={0}
          fillContainer={true}
          hideProgressBar={true}
          hideHeader={true}
          hideTkaGlyph={true}
          hideStepNumbers={true}
          hideElementalGlyph={true}
          hidePathLines={true}
          disableContextMenu={true}
        />
      {/if}
    </div>
    <svg
      class="notation over"
      viewBox={`${-EXTENT} ${-EXTENT} ${EXTENT * 2} ${EXTENT * 2}`}
      aria-hidden="true"
    >
      {#each figures as figure, i (i)}
        <QftFigure
          knobs={figure.knobs}
          trajectory={figure.trajectory}
          increments={figure.increments}
          cursor={cursorAt(i)}
          unit={UNIT}
          {layers}
          pendulum={figure.pendulum ?? false}
          color={TONE_COLOR[figureTone(figure, i)]}
          dartColor={figure.tone && figure.tone !== "accent"
            ? TONE_COLOR[figure.tone]
            : "var(--semantic-warning, #fbbf24)"}
          uid={`${i}`}
          part="over"
        />
      {/each}

      <!--
    The body compass, drawn over the figures so the lit number stays readable
    through a trail. It says where the HAND is, which is why it is stage-level:
    in a duet both hands are read against this one ring.
  -->
      {#if layers.handCompass}
        {#each HOME_BASE as position (position)}
          {@const p = labelPoint(position)}
          {@const departing = departures.get(position)}
          <g
            class="point"
            class:origin={departing !== undefined}
            class:arrival={arrivals.has(position)}
            style={departing && departing[0] !== "accent"
              ? `--origin-color: ${TONE_COLOR[departing[0]!]};`
              : undefined}
          >
            <circle cx={p.x} cy={p.y} r="26" />
            <text x={p.x} y={p.y} dy="9">{position}</text>
          </g>
        {/each}
      {/if}
    </svg>
  </div>
</div>

<style>
  /*
   * The container owns the box; the SVG fills it and lets preserveAspectRatio
   * letterbox the square viewBox inside. Sizing from width + aspect-ratio here
   * instead would make the stage as tall as the column is wide, which blows
   * through any height budget the page tries to give it.
   */
  .stage {
    position: relative;
    width: 100%;
    height: 100%;
    container-type: size;
  }

  /* The square the notation's viewBox letterboxes into, centred in the box. */
  .square {
    position: absolute;
    inset: 0;
    margin: auto;
    width: min(100cqw, 100cqh);
    height: min(100cqw, 100cqh);
    overflow: hidden;
  }

  .canvas-box {
    position: absolute;
    z-index: 1;
    width: calc(100% * var(--zoom));
    height: calc(100% * var(--zoom));
    left: calc(50% - 50% * var(--zoom));
    top: calc(50% - 50% * var(--zoom));
    pointer-events: none;
  }

  /* The stage owns the frame; the canvas fills it edge to edge so the overlay
     coordinates line up with the drawn poi. */
  .canvas-box :global(.content-wrapper) {
    border: none !important;
    border-radius: 0 !important;
    background: transparent !important;
  }

  .notation {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .notation.over {
    z-index: 2;
  }

  .ring {
    fill: none;
    stroke: var(--semantic-border-subtle, rgb(255 255 255 / 0.14));
    stroke-width: 2;
    stroke-dasharray: 6 10;
  }

  .point circle {
    fill: var(--semantic-surface-raised, rgb(0 0 0 / 0.5));
    stroke: var(--semantic-border, rgb(255 255 255 / 0.28));
    stroke-width: 2;
    transition:
      fill var(--duration-fast) var(--ease-standard),
      stroke var(--duration-fast) var(--ease-standard);
  }

  .point text {
    fill: var(--semantic-text-secondary, rgb(255 255 255 / 0.66));
    font-size: 1.75rem;
    font-weight: 600;
    text-anchor: middle;
    font-variant-numeric: tabular-nums;
  }

  /* The body compass says where the HAND is, so it wears the hand's colour. */
  .point.arrival circle {
    stroke: var(--semantic-text-primary, rgb(255 255 255 / 0.85));
  }

  .point.origin circle {
    fill: var(
      --origin-color,
      var(--semantic-text-primary, rgb(255 255 255 / 0.85))
    );
    stroke: #fff;
  }

  .point.origin text {
    fill: #0b1020;
  }

  @media (prefers-reduced-motion: reduce) {
    .point circle {
      transition: none;
    }
  }
</style>
