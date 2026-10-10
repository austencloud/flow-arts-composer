<script lang="ts">
  /**
   * One hand and its prop: the hand path, the swept sector, the trail, the
   * tether, the direction dart, and the prop's own compass.
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
    closedPathSteps,
    pointAt,
    posesAt,
    propIndexAt,
    tracePath,
    tracePendulum,
    PROP_LENGTH,
    type QftIncrement,
    type QftKnobs,
  } from "#lib/shared/notation/qft/qft-model.js";
  import {
    traceTrajectory,
    trajectoryPosesAt,
    trajectoryPropIndexAt,
    type QftTrajectory,
  } from "#lib/shared/notation/qft/qft-trajectory.js";
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
    /** The trail, head and prop-compass colour for this hand. */
    color?: string;
    /** The direction dart's colour. Amber solo; the hand's own colour in a duet. */
    dartColor?: string;
    /** Disambiguates this figure's arrowhead marker from the other hand's. */
    uid?: string;
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
  }: Props = $props();

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
  const head = $derived({ x: poses.head.x * unit, y: poses.head.y * unit });

  const samples = $derived(
    trajectory
      ? traceTrajectory(trajectory)
      : pendulum
        ? tracePendulum()
        : tracePath(resolvedKnobs)
  );
  const pathSteps = $derived(
    trajectory || pendulum ? 8 : closedPathSteps(resolvedKnobs)
  );

  const trail = $derived(
    samples
      .map(
        (p, i) =>
          `${i === 0 ? "M" : "L"}${(p.x * unit).toFixed(2)},${(p.y * unit).toFixed(2)}`
      )
      .join(" ")
  );

  /**
   * The trail's recency.
   *
   * A single evenly-lit path says what shape the prop draws but nothing about
   * where it is in drawing it. A spinner does not see that — they see a bright
   * afterimage just behind the head falling away into the older part of the
   * stroke. So the shape stays, dimly, and a short band of light rides the head.
   *
   * The band is placed by arc length rather than by cursor fraction. The head
   * does not move at a constant speed along its own path — an antispin flower
   * crawls through the petal tips and races the middles — so lighting
   * `cursor / 8` of the way along the stroke would leave the highlight visibly
   * detached from the prop exactly where the shape is most interesting.
   */
  const arc = $derived.by(() => {
    const cum = [0];
    let total = 0;
    for (let i = 1; i < samples.length; i += 1) {
      const a = samples[i - 1] as { x: number; y: number };
      const b = samples[i] as { x: number; y: number };
      total += Math.hypot(b.x - a.x, b.y - a.y) * unit;
      cum.push(total);
    }
    return { cum, total };
  });

  /** Distance along the stroke that the head has reached, in user units. */
  const headDistance = $derived.by(() => {
    const { cum } = arc;
    const spans = cum.length - 1;
    if (spans < 1) return 0;
    const t = ((cursor % pathSteps) + pathSteps) % pathSteps;
    const x = (t / pathSteps) * spans;
    const i = Math.min(spans - 1, Math.floor(x));
    const a = cum[i] as number;
    const b = cum[i + 1] as number;
    return a + (b - a) * (x - i);
  });

  /*
   * Five bands rather than a gradient: SVG cannot run a gradient along an
   * arbitrary path, and per-segment opacity over 240 samples would rebuild 240
   * nodes every frame. Five dashes with a period of exactly the path length wrap
   * around the closed stroke on their own, which is the whole trick.
   */
  const BANDS = 5;
  /** Share of the whole stroke the afterimage covers. */
  const BAND_SPAN = 0.28;

  const bands = $derived.by(() => {
    const { total } = arc;
    if (total <= 0) return [];
    const band = (total * BAND_SPAN) / BANDS;
    return Array.from({ length: BANDS }, (_, k) => ({
      k,
      dash: `${band} ${Math.max(0.01, total - band)}`,
      offset: -(headDistance - (k + 1) * band),
      opacity: 0.9 * (1 - k / BANDS) ** 1.6,
      width: 5 + 2.5 * (1 - k / BANDS),
    }));
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

  const HOME_BASE = [1, 2, 3, 4, 5, 6, 7, 8];
  const markerId = $derived(`qft-dart-head-${uid}`);
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

  {#if layers.handPath && radius > 0.01}
    <circle class="hand-path" cx="0" cy="0" r={radius * unit} />
  {/if}

  <!-- Under the trail and the tether: this is ground, not a mark. -->
  {#if layers.sector}
    {#if sectorFull}
      <path class="sector" d={sectorFull} />
    {/if}
    {#if sectorProgress}
      <path class="sector-progress" d={sectorProgress} />
    {/if}
  {/if}

  {#if layers.trail}
    <path class="trail" d={trail} />
    {#each bands as b (b.k)}
      <path
        class="trail-recent"
        d={trail}
        stroke-dasharray={b.dash}
        stroke-dashoffset={b.offset}
        stroke-width={b.width}
        opacity={b.opacity}
      />
    {/each}
  {/if}

  <!-- The prop's own compass, projected from the hand. -->
  {#if layers.propCompass}
    <circle class="hand-ring" cx={hand.x} cy={hand.y} r={PROP_LENGTH * unit} />
  {/if}
  {#each HOME_BASE as position (position)}
    {#if layers.propCompass && row?.propDepart !== position}
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
  {#if layers.handPath && radius > 0.01 && !pendulum}
    <line class="arm" x1="0" y1="0" x2={hand.x} y2={hand.y} />
  {/if}

  <line class="tether" x1={hand.x} y1={hand.y} x2={head.x} y2={head.y} />

  {#if layers.dart && dart && dartLife > 0}
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
  <circle class="hand" cx={hand.x} cy={hand.y} r="13" />
  <circle class="head" cx={head.x} cy={head.y} r="22" />

  <!--
    Drawn last. At an integer step this marker and the head coincide exactly,
    which is the whole point — the lit number IS where the prop is. Drawing it
    before the head would bury the label underneath it.
  -->
  {#if layers.propCompass && row}
    {@const p = handLocalPoint(row.propDepart)}
    <g class="prop-point">
      <circle cx={p.x} cy={p.y} r="21" />
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

  /* The shape itself: always whole, always quiet. */
  .trail {
    fill: none;
    stroke: var(--figure-color);
    stroke-width: 4;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: 0.22;
  }

  /* The afterimage riding the head. Butt caps so the bands abut without pips. */
  .trail-recent {
    fill: none;
    stroke: var(--figure-color);
    stroke-linecap: butt;
    stroke-linejoin: round;
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

  .tether {
    stroke: var(--semantic-text-primary, rgb(255 255 255 / 0.85));
    stroke-width: 4;
    stroke-linecap: round;
  }

  .dart {
    stroke: var(--dart-color);
    stroke-width: 4;
    stroke-linecap: round;
  }

  .hand {
    fill: var(--semantic-text-primary, rgb(255 255 255 / 0.85));
  }

  .head {
    fill: var(--figure-color);
    stroke: #fff;
    stroke-width: 3;
  }
</style>
