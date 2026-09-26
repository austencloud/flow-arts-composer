<!--
TraceStage — the drawing surface, and the ONLY file in this feature that touches
DOM pointer events.

Why GridSvg and not InteractiveCanvas
-------------------------------------
InteractiveCanvas is the right shell when you need PROPS on a grid: it requires
left/right PropState and mounts AnimatorCanvas, which is the full
Canvas2D animation engine with its own render loop, prop sprites, and glyph
overlay. This game renders no props and plays no animation — it needs a grid and
a route. In split mode it would mount TWO animation engines to draw two static
grids, on the device class least able to afford it.

GridSvg is the same grid asset those canvases draw, consumed directly as an SVG
`<g>` inside our own `viewBox="0 0 950 950"` (exactly how LessonGridDisplay uses
it). Same coordinate space, same points, none of the machinery. No third
coordinate table is introduced either way: route geometry still comes from the
converter, which still comes from the renderer's own `getPathPoints`.

Pointer discipline
------------------
- Capture on pointerdown, released on up / cancel / lostpointercapture / unmount.
  A capture that outlives its round is how a finger ends up driving the wrong
  hand two rounds later.
- `touch-action: none` is scoped to the trace surface ONLY. Everything around it
  scrolls and zooms normally, because a player who cannot scroll the page to
  reach Pause has been trapped by an accessibility feature.
- Every coalesced point is graded; rendering flushes once per animation frame.
  A 120Hz device reports far more points than it can paint, and the points a
  frame would discard are exactly where a fast curve lives.
- `getPredictedEvents()` is never read. Predicted points are the browser's
  guess about the future, and grading someone on a guess is not grading.
-->
<script lang="ts">
  import { onDestroy } from "svelte";
  import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import { tDynamic } from "$lib/shared/i18n/i18n.svelte.js";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import GridSvg from "$lib/shared/pictograph/grid/components/GridSvg.svelte";
  import type { TraceHand, TraceSample } from "../domain/trace-types";
  import { normalizeStagePoint } from "../services/trace-path-sampler";
  import { getTracePaths, handName } from "../state/trace-paths-state.svelte";
  import TraceRouteLayer from "./TraceRouteLayer.svelte";

  interface Props {
    /** Whether the challenge wants the route rail kept up while tracing. */
    showRoute: boolean;
    /** Leaving the run entirely. Stays reachable for the whole round. */
    onExit: () => void;
    /** Test surfaces can name the same escape action more honestly. */
    exitLabel?: string;
  }

  let { showRoute, onExit, exitLabel = "Exit" }: Props = $props();

  const trace = getTracePaths();

  const STAGE_UNITS = 950;

  /**
   * Split grids by default: each hand gets its own square, so the two routes
   * never overlap and a finger can never be ambiguous about which hand it
   * drives. One Hand mode collapses to a single grid.
   */
  const panels = $derived.by<TraceHand[][]>(() => {
    const hands = trace.activeHands;
    if (hands.length <= 1) return hands.length === 1 ? [[hands[0]!]] : [];
    return hands.map((hand) => [hand]);
  });

  const gridMode = $derived(trace.round?.gridMode ?? GridMode.DIAMOND);

  // Layout is decided by the space this component was given, never by sniffing
  // the user agent. A phone in landscape and a narrow desktop pane are the same
  // problem and get the same answer.
  let stageArea = $state<HTMLDivElement | undefined>(undefined);
  let areaWidth = $state(0);
  let areaHeight = $state(0);
  const sideBySide = $derived(
    panels.length > 1 && areaWidth >= areaHeight * 1.15
  );

  /** Rendered square side of one panel, in CSS px. Drives the touch-target floor. */
  let panelSidePx = $state(0);
  const unitsPerCssPx = $derived(
    panelSidePx > 0 ? STAGE_UNITS / panelSidePx : 2.5
  );

  $effect(() => {
    if (!stageArea) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box) return;
      areaWidth = box.width;
      areaHeight = box.height;
    });
    observer.observe(stageArea);
    return () => observer.disconnect();
  });

  // Pointer plumbing

  /** Elements we called setPointerCapture on, so unmount can always let go. */
  const captures = new Map<number, HTMLElement>();

  /**
   * Samples waiting for the next frame. Grading sees every one of them; the
   * flush is only about how often Svelte re-renders.
   */
  const pending = new Map<number, TraceSample[]>();
  let frameHandle: number | null = null;

  function panelRect(element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  }

  function measurePanel(element: HTMLElement): void {
    const rect = element.getBoundingClientRect();
    const side = Math.min(rect.width, rect.height);
    if (side > 0 && Math.abs(side - panelSidePx) > 0.5) {
      panelSidePx = side;
      trace.setStageSidePx(side);
    }
  }

  /**
   * Measure the surface as soon as it exists, and again whenever it resizes.
   *
   * This used to run only from `handlePointerDown`, which meant the physical
   * touch floor was unknown for the whole of the first round — the one round on
   * a phone it most needed to protect — and the route strokes drew at a fallback
   * scale until something was touched. All panels render the same square, so
   * whichever reports first is the right answer for all of them.
   */
  function measured(element: HTMLElement) {
    measurePanel(element);
    const observer = new ResizeObserver(() => measurePanel(element));
    observer.observe(element);
    return { destroy: () => observer.disconnect() };
  }

  function flush(): void {
    frameHandle = null;
    for (const [pointerId, samples] of pending) {
      if (samples.length === 0) continue;
      // Drain each BUFFER, never the map. `pending`'s keys are also this
      // component's active-pointer registry — every move, up, cancel and lost
      // capture below early-returns on a missing key. Clearing the map here
      // made a stroke go deaf after its first animation frame: the rest of the
      // gesture was never graded, the lift never released its capture, and a
      // pointercancel never reached the pause it is required to trigger.
      trace.pointerMove(pointerId, samples.splice(0, samples.length));
    }
  }

  function scheduleFlush(): void {
    if (frameHandle !== null) return;
    frameHandle = requestAnimationFrame(flush);
  }

  function flushNow(): void {
    if (frameHandle !== null) {
      cancelAnimationFrame(frameHandle);
      frameHandle = null;
    }
    flush();
  }

  function handlePointerDown(event: PointerEvent, hand: TraceHand): void {
    // Tap Route is a different input model; letting a drag start here would run
    // both at once and neither would mean anything.
    if (trace.settings.tapRouteMode) return;
    if (!trace.isTraceable && trace.phase.name !== "preview") return;

    const element = event.currentTarget as HTMLElement;
    measurePanel(element);

    const point = normalizeStagePoint(
      event.clientX,
      event.clientY,
      panelRect(element)
    );

    // The HAND comes from the panel that was touched — the grid this pointer
    // landed on. Not from pointer order, not from isPrimary. A third finger, or
    // one landing on a panel whose hand is already claimed, comes back null and
    // is ignored with a quiet cue.
    const assigned = trace.pointerDown(event.pointerId, point, hand);
    if (!assigned) return;

    element.setPointerCapture(event.pointerId);
    captures.set(event.pointerId, element);
    pending.set(event.pointerId, []);
    event.preventDefault();
  }

  function handlePointerMove(event: PointerEvent): void {
    const buffer = pending.get(event.pointerId);
    if (!buffer) return;

    const element = event.currentTarget as HTMLElement;
    const rect = panelRect(element);

    // Coalesced events are the points the browser already collected between
    // frames. Reading them is the difference between grading the curve the
    // finger drew and grading a handful of dots along it. Older browsers
    // return nothing, so the parent event is the honest fallback.
    const raw =
      typeof event.getCoalescedEvents === "function"
        ? event.getCoalescedEvents()
        : [];
    const points = raw.length > 0 ? raw : [event];

    for (const point of points) {
      const normalized = normalizeStagePoint(
        point.clientX,
        point.clientY,
        rect
      );
      buffer.push({ x: normalized.x, y: normalized.y, t: point.timeStamp });
    }

    scheduleFlush();
  }

  function releaseCapture(pointerId: number): void {
    const element = captures.get(pointerId);
    captures.delete(pointerId);
    if (element?.hasPointerCapture?.(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
  }

  function handlePointerUp(event: PointerEvent): void {
    if (!pending.has(event.pointerId)) return;
    // Everything the finger did before it left still counts, so the buffer is
    // graded before the lift is reported.
    flushNow();
    releaseCapture(event.pointerId);
    pending.delete(event.pointerId);
    trace.pointerUp(event.pointerId);
  }

  /**
   * The system took the pointer away. This is a PAUSE, never a failure and
   * never a lost beat — `pointerInterrupted` parks the round with everything
   * completed so far intact.
   */
  function handlePointerInterrupted(event: PointerEvent): void {
    if (!pending.has(event.pointerId)) return;
    flushNow();
    releaseCapture(event.pointerId);
    pending.delete(event.pointerId);
    trace.pointerInterrupted(event.pointerId);
  }

  function releaseEverything(): void {
    if (frameHandle !== null) {
      cancelAnimationFrame(frameHandle);
      frameHandle = null;
    }
    for (const pointerId of [...captures.keys()]) releaseCapture(pointerId);
    pending.clear();
    trace.releaseAllPointers();
  }

  // Leaving the tab mid-round is the same class of event as a pointercancel:
  // the player did not choose it, so it parks rather than penalizes.
  $effect(() => {
    function onVisibility() {
      if (document.visibilityState === "hidden") {
        releaseEverything();
        trace.handleVisibilityHidden();
      }
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  });

  onDestroy(releaseEverything);

  // Tap Route

  /**
   * In Tap Route mode the same waypoints are plain clicks. Nearest-stop
   * resolution keeps the target generous without letting an out-of-order tap
   * count — the state factory still enforces the order.
   */
  function handleTap(event: PointerEvent, hand: TraceHand): void {
    if (!trace.settings.tapRouteMode) return;
    const element = event.currentTarget as HTMLElement;
    const point = normalizeStagePoint(
      event.clientX,
      event.clientY,
      panelRect(element)
    );

    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    trace.tapWaypoints.forEach((waypoint, index) => {
      if (waypoint.hand !== hand) return;
      const distance = Math.hypot(
        point.x - waypoint.at.x,
        point.y - waypoint.at.y
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    if (bestIndex >= 0 && bestDistance <= 0.14) {
      trace.tapWaypoint(bestIndex);
    }
  }

  const paused = $derived(trace.phase.name === "paused");
</script>

<div class="trace-stage">
  <div class="stage-area" class:side-by-side={sideBySide} bind:this={stageArea}>
    <!-- Keyed by SLOT, not by hand. One Hand mode swaps which hand a panel
         shows the moment that hand satisfies its beat — while the finger is
         still down. Keying on the hand made Svelte destroy the very element
         holding that pointer's capture, and a detached capture element fires
         `lostpointercapture`, which this component (correctly) treats as an
         interruption. The round paused itself, twice a beat, out of a run it was
         grading. The slot count is stable, so the surface survives the swap and
         only its props change. -->
    {#each panels as panelHands, panelIndex (panelIndex)}
      {@const hand = panelHands[0]!}
      <div
        class="panel"
        class:blue={hand === HandSide.LEFT}
        class:red={hand === HandSide.RIGHT}
      >
        <div class="panel-label {hand === HandSide.LEFT ? 'blue' : 'red'}">
          <span class="panel-glyph" aria-hidden="true"
            >{hand === HandSide.LEFT ? "B" : "R"}</span
          >
          <span class="panel-name">{handName(hand)}</span>
        </div>

        <!-- The trace surface. touch-action:none lives HERE and nowhere else. -->
        <div
          class="surface"
          role="application"
          aria-label={tDynamic("learn_trace_surface_aria", {
            hand: handName(hand),
          })}
          use:measured
          onpointerdown={(e) => {
            handlePointerDown(e, hand);
            handleTap(e, hand);
          }}
          onpointermove={handlePointerMove}
          onpointerup={handlePointerUp}
          onpointercancel={handlePointerInterrupted}
          onlostpointercapture={handlePointerInterrupted}
        >
          <svg
            class="stage-svg"
            viewBox="0 0 950 950"
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="xMidYMid meet"
            aria-hidden="true"
          >
            <rect class="stage-backdrop" width="950" height="950" rx="10" />
            <GridSvg {gridMode} />
            <TraceRouteLayer
              hands={panelHands}
              segments={trace.currentSegments}
              trail={trace.trail}
              armed={trace.armed}
              {showRoute}
              isArming={trace.phase.name === "arming"}
              reducedMotion={trace.settings.reducedMotion}
              lowStimulus={trace.settings.lowStimulus}
              {unitsPerCssPx}
              tapRouteMode={trace.settings.tapRouteMode}
              tapWaypoints={trace.tapWaypoints}
              tapProgress={trace.tapProgress}
            />
          </svg>
        </div>
      </div>
    {/each}
  </div>

  <!-- Pause and Exit are visible for the whole round. Nothing about being
       mid-trace should make the way out harder to find. -->
  <div class="stage-controls">
    <button
      type="button"
      class="control"
      onclick={() => (paused ? trace.resume() : trace.pause("player"))}
    >
      {paused ? "Resume" : "Pause"}
    </button>
    <button type="button" class="control" onclick={onExit}>{exitLabel}</button>
  </div>
</div>

<style>
  .trace-stage {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 100%;
    height: 100%;
    min-height: 0;
    padding: 0.75rem;
    box-sizing: border-box;
  }

  .stage-area {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    flex: 1;
    min-height: 0;
  }

  /* Landscape-shaped container: grids sit beside each other. Chosen from the
     measured box, not from a device guess. */
  .stage-area.side-by-side {
    flex-direction: row;
  }

  .panel {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.375rem;
    min-width: 0;
    min-height: 0;
    /* Each panel takes an equal share and stays square inside it. */
    flex: 1 1 0;
    height: 100%;
  }

  .panel.blue {
    --hand-color: var(--prop-blue, #3575e2);
  }

  .panel.red {
    --hand-color: var(--prop-red, #ed1c24);
  }

  .panel-label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: var(--font-size-sm);
    font-weight: 700;
    color: var(--hand-color);
  }

  .panel-label.blue {
    --hand-color: var(--prop-blue, #3575e2);
  }

  .panel-label.red {
    --hand-color: var(--prop-red, #ed1c24);
  }

  /* The glyph rides with the name so hand identity never rests on hue alone. */
  .panel-glyph {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border: 2px solid var(--hand-color);
    border-radius: 50%;
    font-size: var(--font-size-compact);
    font-weight: 800;
  }

  .panel-label.red .panel-glyph {
    border-radius: 6px;
  }

  .surface {
    position: relative;
    flex: 1;
    min-height: 0;
    aspect-ratio: 1;
    max-width: 100%;
    max-height: 100%;
    border-radius: 1rem;
    overflow: hidden;
    border: 1px solid
      color-mix(
        in srgb,
        var(--hand-color) 36%,
        var(--theme-stroke, rgba(255, 255, 255, 0.14))
      );
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    box-shadow:
      0 1.25rem 3rem rgba(0, 0, 0, 0.2),
      inset 0 0 0 1px color-mix(in srgb, var(--hand-color) 12%, transparent);
    /* Scoped to the surface: the page around it keeps normal scroll and zoom. */
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
    cursor: crosshair;
  }

  .stage-svg {
    display: block;
    width: 100%;
    height: 100%;
  }

  .stage-backdrop {
    fill: var(--lm-pictograph-bg, #ffffff);
  }

  :global(:root.dark) .stage-backdrop {
    fill: var(--dm-pictograph-bg, #0a0a0f);
  }

  .stage-controls {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    flex-shrink: 0;
    align-self: center;
    padding: 0.25rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: 999px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    box-shadow: 0 0.75rem 2rem rgba(0, 0, 0, 0.16);
  }

  .control {
    min-width: 6rem;
    min-height: var(--min-touch-target);
    padding: 0 1rem;
    border-radius: 999px;
    border: 0;
    background: transparent;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
    transition:
      background var(--duration-fast) ease,
      transform var(--duration-fast) ease;
  }

  .control:last-child {
    background: color-mix(
      in srgb,
      var(--theme-accent, #818cf8) 18%,
      transparent
    );
  }

  @media (hover: hover) {
    .control:hover {
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.12));
    }
  }

  .control:active {
    transform: scale(0.97);
  }

  .control:focus-visible {
    outline: 2px solid var(--theme-accent, #818cf8);
    outline-offset: 2px;
  }

  /* Big-screen seam. Above it the stage gets a wider band and one step up in
     type, so a 4K monitor reads as a stage rather than a phone blown up. */
  @media (min-width: 1680px) {
    .trace-stage {
      gap: 1rem;
      padding: 1.25rem;
    }

    .stage-area {
      gap: 1.5rem;
    }

    .panel-label {
      font-size: var(--font-size-base);
    }

    .control {
      font-size: var(--font-size-base);
      min-width: 8rem;
    }
  }
</style>
