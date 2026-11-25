<script lang="ts">
  /**
   * One hand's notation: the hand path, the swept sector, the direction dart,
   * and the prop's own compass.
   *
   * The poi and its trail are not drawn here. The shared animation canvas
   * under the stage draws the app's own poi and trail from the same poses, so
   * this layer carries only what is QfT's to say.
   *
   * Split out of QftStage when the stage learned to draw a matrix cell, which
   * is two of these at once. The stage keeps what belongs to the picture as a
   * whole — the viewBox and the body compass — and everything that belongs to
   * a single hand lives here, so a second hand costs one more element rather
   * than a second copy of the drawing code.
   *
   * Draws into the parent's user space; the stage owns the coordinate system.
   */
  import {
    pendulumIndexAt,
    pendulumPosesAt,
    pointAt,
    posesAt,
    propIndexAt,
    PROP_LENGTH,
    type QftIncrement,
    type QftKnobs,
  } from "#lib/shared/notation/qft/qft-model.js";
  import {
    trajectoryPosesAt,
    trajectoryPropIndexAt,
    type QftTrajectory,
  } from "@tka/shape-domain";
  import {
    ALL_LAYERS,
    type QftLayers,
  } from "#lib/shared/notation/qft/qft-layers.js";

  interface Props {
    knobs?: QftKnobs;
    trajectory?: QftTrajectory;
    increments: QftIncrement[];
    /** Continuous position in the eight-step cycle. */
    cursor: number;
    /** Pixels per prop length, set by the stage. */
    unit: number;
    pendulum?: boolean;
    layers?: QftLayers;
    /** The sector and prop-compass colour for this hand. */
    color?: string;
    /** The direction dart's colour. Amber solo; the hand's own colour in a duet. */
    dartColor?: string;
    /** Disambiguates this figure's arrowhead marker from the other hand's. */
    uid?: string;
    /**
     * Which side of the canvas poi this pass draws. The ground (hand path,
     * sector, prop compass, arm) goes under the poi; the marks that must stay
     * readable over it (dart, lit prop number) go over. "all" draws both.
     */
    part?: "under" | "over" | "all";
  }

  let {
    knobs,
    trajectory,
    increments,
    cursor,
    unit,
    pendulum = false,
    layers = ALL_LAYERS,
    color = "var(--theme-accent, #8b5cf6)",
    dartColor = "var(--semantic-warning, #fbbf24)",
    uid = "solo",
    part = "all",
  }: Props = $props();

  const under = $derived(part !== "over");
  const over = $derived(part !== "under");

  const fallbackKnobs: QftKnobs = {
    radius: 1,
    downbeats: 1,
    spin: "inspin",
  };
  const resolvedKnobs = $derived(knobs ?? fallbackKnobs);
  const radius = $derived(trajectory?.radius ?? resolvedKnobs.radius);
  const step = $derived(Math.floor(cursor) % 8);
  const row = $derived(increments[step]);

  const poses = $derived(
    trajectory
      ? trajectoryPosesAt(trajectory, cursor)
      : pendulum
        ? pendulumPosesAt(cursor)
        : posesAt(resolvedKnobs, cursor)
  );
  const hand = $derived({ x: poses.hand.x * unit, y: poses.hand.y * unit });

  /* A hand that swings with the poi travels an arc, not the whole circle. */
  const handArc = $derived.by(() => {
    if (!trajectory?.handFollowsProp) return null;
    return Array.from({ length: 121 }, (_, index) => {
      const at = trajectoryPosesAt(trajectory, (index / 120) * 8).hand;
      return `${index === 0 ? "M" : "L"}${at.x * unit},${at.y * unit}`;
    }).join(" ");
  });

  /**
   * Prop position is measured from the hand, not from the centre of the body.
   * That is the single most misread part of the system — it is why the 4-petal
   * corners read 5, 7, 1, 3 rather than anything intuitive. So the prop gets its
   * own compass, riding along with the hand, and the outer ring is left to say
   * where the hand is. Lighting a hand-relative number on the body-centred ring
   * puts it nowhere near the prop it describes.
   */
  const handLocalPoint = (position: number) => {
    const p = pointAt(position, PROP_LENGTH);
    return { x: hand.x + p.x * unit, y: hand.y + p.y * unit };
  };

  /**
   * The direction dart.
   *
   * The direction column is the load-bearing half of QfT — it is the only thing
   * separating an inspin flower from an antispin one — but it existed on this
   * stage as a number in a table with nothing in the picture to attach it to.
   * Charlie drew it as a flag off the prop, in separate diagrams, because drawn
   * permanently it competes with the tether and the trail.
   *
   * So it fires rather than persists: a dart leaves the head at each step
   * boundary, pointing along that step's direction value. On Charlie's
   * convention an out-of-resolution cell has no direction to fire, so the
   * absence of a dart IS the `n` — visible rather than merely tabulated.
   *
   * And it TRAVELS. Pinned at the departure point it was immediately overtaken
   * by the prop rotating towards it, which read as the prop swallowing its own
   * direction marker — the opposite of the thing the dart is there to say. It
   * now shoots away along the direction it names and fades as it goes, so it
   * stays ahead of the prop for as long as it is visible.
   */
  const DART_LENGTH = 0.55;
  /** How far the dart runs before it is gone, in prop lengths. */
  const DART_TRAVEL = 0.8;
  /** Share of an increment the dart lives for. */
  const DART_SPAN = 0.45;

  /** 0 at the instant a step begins, 1 when the dart has finished its run. */
  const dartAge = $derived(
    Math.min(1, (cursor - Math.floor(cursor)) / DART_SPAN)
  );

  /** Fades out over its own flight rather than sitting still and dimming. */
  const dartLife = $derived(1 - dartAge);

  const dart = $derived.by(() => {
    const current = row;
    const value = current?.propDirDepart;
    if (!current || value === undefined || value === "n") return null;

    const from = handLocalPoint(current.propDepart);
    /* Unit vector of the named direction; the same one both offsets ride along. */
    const heading = pointAt(value, 1);
    /* Decelerating, so it leaves fast and trails off rather than moving linearly. */
    const run = DART_TRAVEL * (1 - (1 - dartAge) ** 2) * unit;

    const x1 = from.x + heading.x * run;
    const y1 = from.y + heading.y * run;
    return {
      x1,
      y1,
      x2: x1 + heading.x * DART_LENGTH * unit,
      y2: y1 + heading.y * DART_LENGTH * unit,
    };
  });

  /**
   * The swept sector.
   *
   * The 2011 guide's clearest diagrams — static spin, pendulum — fill the wedge
   * the prop crosses between its departure and its arrival. It is the same idea
   * as a pictograph's arrow: it says the prop went from HERE to THERE, rather
   * than leaving you to infer it from two marks. The rest of the published
   * diagrams do not do this; they instead accumulate a marker at every position
   * passed, which reads as clutter rather than as a move.
   *
   * So the stage draws it for every move, growing from the departure angle to
   * wherever the prop is now. At the end of an increment it is exactly the wedge
   * the guide drew; part way through, it is the sweep in progress.
   *
   * The angle comes from the model's continuous index, not from the drawn head
   * position — at 8 rotations per hand rotation the prop turns a full circle in
   * one increment, which no angle measured off screen coordinates can express.
   */
  const indexAt = (u: number) =>
    trajectory
      ? trajectoryPropIndexAt(trajectory, u)
      : pendulum
        ? pendulumIndexAt(u)
        : propIndexAt(resolvedKnobs, u);

  const RADIANS_PER_POSITION = Math.PI / 4;

  function wedge(startIndex: number, span: number) {
    if (Math.abs(span) < 0.0005) return null;

    /* A full turn or more is the whole disc; beyond that the wedge is meaningless. */
    const clamped = Math.max(-8, Math.min(8, span));
    const r = PROP_LENGTH * unit;

    const a0 = startIndex * RADIANS_PER_POSITION;
    const a1 = (startIndex + clamped) * RADIANS_PER_POSITION;
    const p0 = { x: hand.x + r * Math.sin(a0), y: hand.y - r * Math.cos(a0) };
    const p1 = { x: hand.x + r * Math.sin(a1), y: hand.y - r * Math.cos(a1) };

    /*
     * Screen y grows downward, so sweep-flag follows the sign of travel rather
     * than a fixed value — otherwise a reversing pendulum fills the complement
     * of its own swing.
     */
    const largeArc = Math.abs(clamped) > 4 ? 1 : 0;
    const sweepFlag = clamped > 0 ? 1 : 0;

    return `M${hand.x.toFixed(2)},${hand.y.toFixed(2)} L${p0.x.toFixed(2)},${p0.y.toFixed(2)} A${r},${r} 0 ${largeArc} ${sweepFlag} ${p1.x.toFixed(2)},${p1.y.toFixed(2)} Z`;
  }

  /*
   * Two wedges, because they answer different questions and the page needs both.
   *
   * The pale one is the whole increment the current row describes, depart to
   * arrive. It is there whether or not anything is moving, so a paused stage
   * reads exactly like the guide's still: this row is THIS wedge.
   *
   * The bright one is how far the prop has actually got through it, and it is
   * empty at rest. Together they read as a snapshot filling in, rather than as
   * marks accumulating.
   */
  const sectorFull = $derived.by(() => {
    const from = Math.floor(cursor);
    const start = indexAt(from);
    return wedge(start, indexAt(from + 1) - start);
  });

  const sectorProgress = $derived.by(() => {
    const from = Math.floor(cursor);
    const start = indexAt(from);
    return wedge(start, indexAt(cursor) - start);
  });

  const PROP_POINT_R = 21;
  /** Where the lit number visibly ends: its radius plus half its white rim. */
  const PROP_POINT_EDGE = PROP_POINT_R + 1;

  const HOME_BASE = [1, 2, 3, 4, 5, 6, 7, 8];
  const markerId = $derived(`qft-dart-head-${uid}-${part}`);
</script>

<g
  class="figure"
  style={`--figure-color: ${color}; --dart-color: ${dartColor};`}
>
  <defs>
    <marker
      id={markerId}
      viewBox="0 0 10 10"
      refX="8"
      refY="5"
      markerWidth="5"
      markerHeight="5"
      orient="auto-start-reverse"
    >
      <path d="M0,0 L10,5 L0,10 z" fill="var(--dart-color)" />
    </marker>
  </defs>

  {#if under && layers.handPath && handArc}
    <path class="hand-path" d={handArc} fill="none" />
  {:else if under && layers.handPath && radius > 0.01}
    <circle class="hand-path" cx="0" cy="0" r={radius * unit} />
  {/if}

  <!-- Under the canvas poi in the eye: this is ground, not a mark. -->
  {#if under && layers.sector}
    {#if sectorFull}
      <path class="sector" d={sectorFull} />
    {/if}
    {#if sectorProgress}
      <path class="sector-progress" d={sectorProgress} />
    {/if}
  {/if}

  <!-- The prop's own compass, projected from the hand. -->
  {#if under && layers.propCompass}
    <circle class="hand-ring" cx={hand.x} cy={hand.y} r={PROP_LENGTH * unit} />
  {/if}
  {#each HOME_BASE as position (position)}
    {#if under && layers.propCompass && row?.propDepart !== position}
      {@const p = handLocalPoint(position)}
      <circle class="prop-tick" cx={p.x} cy={p.y} r="4" />
    {/if}
  {/each}

  <!--
    The arm. One stroke from the centre to the hand, so the hand's compass
    position reads at a glance and the radius is legible as a length rather than
    an abstract slider value. Nothing to draw at radius 0 — the hand is the
    centre.
  -->
  {#if under && layers.handPath && radius > 0.01 && !pendulum}
    <line class="arm" x1="0" y1="0" x2={hand.x} y2={hand.y} />
  {/if}

  {#if over && layers.dart && dart && dartLife > 0}
    <line
      class="dart"
      x1={dart.x1}
      y1={dart.y1}
      x2={dart.x2}
      y2={dart.y2}
      opacity={dartLife}
      marker-end={`url(#${markerId})`}
    />
  {/if}

  <!--
    Drawn last. At an integer step this marker covers the poi's head and both
    end at the same point, so the lit number IS where the prop is. Its outer
    edge, not its middle, sits on the compass ring (Austen, 2026-11-23).
  -->
  {#if over && layers.propCompass && row}
    {@const offset = pointAt(
      row.propDepart,
      PROP_LENGTH * unit - PROP_POINT_EDGE
    )}
    {@const p = { x: hand.x + offset.x, y: hand.y + offset.y }}
    <g class="prop-point">
      <circle cx={p.x} cy={p.y} r={PROP_POINT_R} />
      <text x={p.x} y={p.y} dy="7">{row.propDepart}</text>
    </g>
  {/if}
</g>

<style>
  .hand-path {
    fill: none;
    stroke: var(--semantic-border, rgb(255 255 255 / 0.3));
    stroke-width: 2;
  }

  .sector {
    fill: color-mix(in srgb, var(--figure-color) 24%, transparent);
    stroke: none;
  }

  .sector-progress {
    fill: color-mix(in srgb, var(--figure-color) 34%, transparent);
    stroke: none;
  }

  .hand-ring {
    fill: none;
    stroke: var(--semantic-border-subtle, rgb(255 255 255 / 0.1));
    stroke-width: 2;
  }

  .prop-tick {
    fill: var(--semantic-border, rgb(255 255 255 / 0.26));
  }

  .prop-point circle {
    fill: var(--figure-color);
    stroke: #fff;
    stroke-width: 2;
  }

  .prop-point text {
    fill: #fff;
    font-size: 1.4rem;
    font-weight: 700;
    text-anchor: middle;
    font-variant-numeric: tabular-nums;
  }

  /*
   * Thinner and dimmer than the tether on purpose. The arm is orientation, not
   * the subject — if it reads as strongly as the tether, the eye stops being
   * able to tell which line is the prop.
   */
  .arm {
    stroke: var(--semantic-text-secondary, rgb(255 255 255 / 0.32));
    stroke-width: 2;
    stroke-linecap: round;
    stroke-dasharray: 5 6;
  }

  .dart {
    stroke: var(--dart-color);
    stroke-width: 4;
    stroke-linecap: round;
  }
</style>
