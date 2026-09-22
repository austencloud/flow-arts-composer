<script lang="ts" module>
  export interface RatioSwapPanel {
    ratio: string;
    level: number;
    /** Hand circles in one full drawing. */
    hand: number;
    /** Prop spins in one full drawing. */
    prop: number;
    tint: string;
  }
</script>

<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import DifficultyBadge from "$lib/shared/components/DifficultyBadge.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import {
    createRenderActivityGate,
    renderGateTarget,
  } from "$lib/shared/render-gating/render-activity-gate";
  import { reducedMotion } from "$lib/shared/transitions/motion";
  import { SHAPE_MATRIX_GUIDE_COLORS } from "$lib/shared/shape-matrix/services/shape-matrix-render";

  let { panels }: { panels: RatioSwapPanel[] } = $props();

  type Spin = "pro" | "anti";

  /*
   * The Shape Engine's staff, measured in its own units: the hand travels a
   * circle of radius 80 from the bottom of the grid, clockwise on screen, and
   * the traced end sits 67.4 from the hand. Hand angle plus prop angle drawn
   * from those two numbers lands within half a unit of the engine's own
   * paths, so the drawing here is the drawing the matrix shows.
   */
  const HAND_RADIUS = 80;
  const TIP_REACH = 67.4;
  const START = Math.PI / 2;
  const VIEW = 162;

  /** One hand circle takes this long, the same in both panels. */
  const SECONDS_PER_CIRCLE = 3.2;
  /** Both drawings rest this long, complete, before they start again. */
  const HOLD_SECONDS = 1.6;
  const SAMPLES_PER_CIRCLE = 240;

  const longest = $derived(Math.max(...panels.map((panel) => panel.hand)));

  let spin = $state<Spin>("pro");
  /** Time, counted in hand circles. Past `longest` is the resting hold. */
  let clock = $state(0);
  let playing = $state(false);

  const gate = createRenderActivityGate({
    name: "ratio-swap",
    rootMargin: "0px",
  });
  let frame: number | null = null;
  let last = 0;

  interface Point {
    x: number;
    y: number;
  }

  /** Hand and traced end after `circles` hand circles. */
  function pose(panel: RatioSwapPanel, style: Spin, circles: number) {
    const hand = START + 2 * Math.PI * circles;
    const turn = style === "pro" ? 1 : -1;
    const prop =
      START +
      Math.PI +
      turn * 2 * Math.PI * (panel.prop / panel.hand) * circles;
    const at: Point = {
      x: HAND_RADIUS * Math.cos(hand),
      y: HAND_RADIUS * Math.sin(hand),
    };
    return {
      hand: at,
      tip: {
        x: at.x + TIP_REACH * Math.cos(prop),
        y: at.y + TIP_REACH * Math.sin(prop),
      },
    };
  }

  function route(panel: RatioSwapPanel, style: Spin): Point[] {
    const samples = Math.round(SAMPLES_PER_CIRCLE * panel.hand);
    return Array.from(
      { length: samples + 1 },
      (_, index) => pose(panel, style, (panel.hand * index) / samples).tip
    );
  }

  function pointList(points: Point[]): string {
    return points
      .map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`)
      .join(" ");
  }

  function petals(panel: RatioSwapPanel, style: Spin): number {
    return style === "pro"
      ? Math.abs(panel.prop - panel.hand)
      : panel.prop + panel.hand;
  }

  function count(value: number, whole: number): string {
    return value >= whole ? String(whole) : value.toFixed(1);
  }

  function times(value: number): string {
    return value === 1 ? "once" : "twice";
  }

  function laps(value: number): string {
    return value === 1 ? "one lap" : "two laps";
  }

  const routes = $derived(
    panels.map((panel) => ({ panel, full: route(panel, spin) }))
  );

  const views = $derived(
    routes.map(({ panel, full }) => {
      const circles = Math.min(clock, panel.hand);
      const done = Math.floor((circles / panel.hand) * (full.length - 1));
      const now = pose(panel, spin, circles);
      const petalCount = petals(panel, spin);
      return {
        panel,
        ghost: pointList(full),
        trail: pointList([...full.slice(0, done + 1), now.tip]),
        start: pose(panel, spin, 0).tip,
        now,
        circles,
        spins: (circles * panel.prop) / panel.hand,
        closed: clock >= panel.hand,
        petals: `${petalCount} ${petalCount === 1 ? "petal" : "petals"}`,
      };
    })
  );

  function tick(now: number): void {
    frame = null;
    if (!playing || !gate.active) return;
    const seconds = Math.min(0.1, (now - last) / 1000);
    last = now;
    const cycle = longest + HOLD_SECONDS / SECONDS_PER_CIRCLE;
    clock = (clock + seconds / SECONDS_PER_CIRCLE) % cycle;
    frame = requestAnimationFrame(tick);
  }

  function run(): void {
    if (frame !== null || !playing || !gate.active) return;
    last = performance.now();
    frame = requestAnimationFrame(tick);
  }

  function stop(): void {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  }

  function toggle(): void {
    playing = !playing;
    if (playing) {
      if (clock >= longest) clock = 0;
      run();
    } else {
      stop();
    }
  }

  function scrub(event: Event): void {
    playing = false;
    stop();
    clock = Number((event.currentTarget as HTMLInputElement).value);
  }

  onMount(() => {
    // Reduced motion opens on the finished drawings and waits for the reader.
    if (reducedMotion()) clock = longest;
    else playing = true;
    const unsubscribe = gate.subscribe((active) => (active ? run() : stop()));
    run();
    return unsubscribe;
  });

  onDestroy(() => {
    stop();
    gate.dispose();
  });
</script>

<div class="motion" use:renderGateTarget={gate}>
  <div class="motion-controls">
    <button type="button" class="play" onclick={toggle}>
      <svg class="play-icon" viewBox="0 0 16 16" aria-hidden="true">
        {#if playing}
          <rect x="3" y="2" width="3.5" height="12" rx="1" />
          <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
        {:else}
          <path
            d="M4 2.2v11.6a1 1 0 0 0 1.5.86l9.3-5.8a1 1 0 0 0 0-1.72L5.5 1.34A1 1 0 0 0 4 2.2z"
          />
        {/if}
      </svg>
      <span>{playing ? "Pause" : "Play"}</span>
    </button>
    <div class="spin-pick">
      <SegmentedControl
        options={[
          { value: "pro", label: "Prospin" },
          { value: "anti", label: "Antispin" },
        ]}
        value={spin}
        onchange={(value: Spin) => (spin = value)}
        size="sm"
        semantics="radiogroup"
        ariaLabel="Spin direction"
      />
    </div>
  </div>

  <ul class="motion-panels" role="list">
    {#each views as view (view.panel.ratio)}
      <li class="motion-panel" style="--level-tint: {view.panel.tint}">
        <p class="motion-head">
          <DifficultyBadge level={view.panel.level} size="1.5rem" />
          <span class="motion-ratio">{view.panel.ratio}</span>
          <span class="motion-petals">{view.petals}</span>
        </p>
        <svg
          class="motion-stage"
          viewBox="{-VIEW} {-VIEW} {VIEW * 2} {VIEW * 2}"
          role="img"
          aria-label={`${view.panel.ratio} ${spin === "pro" ? "prospin" : "antispin"}: the hand circles ${times(view.panel.hand)} while the prop spins ${times(view.panel.prop)}, and the drawing closes after ${laps(view.panel.hand)} around the center`}
          style="--ink-trail: {SHAPE_MATRIX_GUIDE_COLORS.left}"
        >
          <circle class="hand-circle" r={HAND_RADIUS} />
          <polyline class="ghost" points={view.ghost} />
          <polyline class="trail" points={view.trail} />
          <circle
            class="start"
            class:met={view.closed}
            cx={view.start.x}
            cy={view.start.y}
            r="6"
          />
          <line
            class="arm"
            x1="0"
            y1="0"
            x2={view.now.hand.x}
            y2={view.now.hand.y}
          />
          <circle class="center" r="3.5" />
          <line
            class="prop"
            x1={view.now.hand.x}
            y1={view.now.hand.y}
            x2={view.now.tip.x}
            y2={view.now.tip.y}
          />
          <circle
            class="hand"
            cx={view.now.hand.x}
            cy={view.now.hand.y}
            r="7"
          />
          <circle class="tip" cx={view.now.tip.x} cy={view.now.tip.y} r="5.5" />
        </svg>
        <dl class="motion-counts">
          <div>
            <dt>Hand circles</dt>
            <dd>{count(view.circles, view.panel.hand)}</dd>
          </div>
          <div>
            <dt>Prop spins</dt>
            <dd>{count(view.spins, view.panel.prop)}</dd>
          </div>
        </dl>
        <p class="motion-status" class:closed={view.closed}>
          {view.closed
            ? `Closed after ${laps(view.panel.hand)}`
            : "Still drawing"}
        </p>
      </li>
    {/each}
  </ul>

  <label class="motion-scrub">
    <span>Hand circles</span>
    <input
      type="range"
      min="0"
      max={longest}
      step="0.01"
      value={Math.min(clock, longest)}
      oninput={scrub}
    />
  </label>
</div>

<style>
  .motion {
    container: motion / inline-size;
    display: grid;
    gap: 0.9rem;
    min-inline-size: 0;
  }

  .motion-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.6rem;
  }

  /* The segmented control fills its box, so the box sets its size. */
  .spin-pick {
    flex: 1 1 11rem;
    max-inline-size: 16rem;
    min-inline-size: 0;
  }

  .play {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-block-size: var(--touch, 44px);
    padding: 0 1rem;
    border: 1px solid var(--rule);
    border-radius: 999px;
    background: var(--surface);
    color: var(--ink);
    font: inherit;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 620;
    cursor: pointer;
  }

  .play:hover {
    border-color: color-mix(in srgb, var(--ink) 35%, transparent);
  }

  .play:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .play-icon {
    inline-size: 0.85em;
    block-size: 0.85em;
    fill: currentColor;
  }

  .motion-panels {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.6rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  /* Each ratio sits in its own level's tray, like the ladder above. */
  .motion-panel {
    display: grid;
    align-content: start;
    gap: 0.5rem;
    min-inline-size: 0;
    margin: 0;
    padding: 0.6rem 0.6rem 0.75rem;
    border: 1px solid color-mix(in srgb, var(--level-tint) 30%, transparent);
    border-radius: 18px;
    background: color-mix(in srgb, var(--level-tint) 7%, transparent);
  }

  .motion-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.45rem;
    margin: 0;
    padding: 0 0.2rem 0.5rem;
    border-bottom: 1px solid
      color-mix(in srgb, var(--level-tint) 26%, transparent);
  }

  .motion-ratio {
    color: var(--ink);
    font-size: 1.1rem;
    font-variant-numeric: tabular-nums;
    font-weight: 660;
  }

  .motion-petals {
    margin-left: auto;
    color: var(--ink-dim);
    font-size: var(--font-size-min, 0.875rem);
  }

  .motion-stage {
    display: block;
    inline-size: min(100%, 22rem);
    aspect-ratio: 1;
    margin-inline: auto;
    overflow: visible;
  }

  .hand-circle {
    fill: none;
    stroke: var(--ink-faint);
    stroke-dasharray: 4 6;
    stroke-width: 1.5;
    opacity: 0.55;
  }

  .ghost,
  .trail {
    fill: none;
    stroke: var(--ink-trail);
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .ghost {
    stroke-width: 2;
    opacity: 0.22;
  }

  .trail {
    stroke-width: 4;
  }

  .start {
    fill: none;
    stroke: var(--ink-dim);
    stroke-width: 2;
  }

  .start.met {
    stroke: var(--ink);
    stroke-width: 3;
  }

  .arm {
    stroke: var(--ink-faint);
    stroke-width: 2;
    opacity: 0.6;
  }

  .center {
    fill: var(--ink-faint);
  }

  .prop {
    stroke: var(--ink);
    stroke-linecap: round;
    stroke-width: 4;
  }

  .hand {
    fill: var(--ink);
  }

  .tip {
    fill: var(--ink-trail);
    stroke: var(--ink);
    stroke-width: 2;
  }

  .motion-counts {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.4rem;
    margin: 0;
  }

  .motion-counts div {
    display: grid;
    justify-items: center;
    gap: 0.05rem;
    min-inline-size: 0;
    text-align: center;
  }

  .motion-counts dt {
    color: var(--ink-faint);
    font-size: var(--font-size-compact, 0.78rem);
  }

  .motion-counts dd {
    margin: 0;
    color: var(--ink);
    font-size: 1.35rem;
    font-variant-numeric: tabular-nums;
    font-weight: 660;
    line-height: 1.1;
  }

  .motion-status {
    margin: 0;
    color: var(--ink-faint);
    font-size: var(--font-size-min, 0.875rem);
    text-align: center;
  }

  .motion-status.closed {
    color: var(--ink);
    font-weight: 620;
  }

  .motion-scrub {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.75rem;
    color: var(--ink-dim);
    font-size: var(--font-size-min, 0.875rem);
  }

  .motion-scrub input {
    inline-size: 100%;
    min-block-size: var(--touch, 44px);
    accent-color: var(--accent);
  }

  /* On a phone the two panels stay side by side, since watching them
     together is the point; the heading and counts tighten to fit. */
  @container motion (max-width: 26rem) {
    .motion-head {
      justify-content: center;
    }

    .motion-petals {
      flex-basis: 100%;
      margin-left: 0;
      text-align: center;
    }

    .motion-counts dd {
      font-size: 1.1rem;
    }
  }
</style>
