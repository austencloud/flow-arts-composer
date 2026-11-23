<script lang="ts">
  import { createFlowFestLowerLoopTraceSubmission } from "./_lib/flow-fest-lower-loop-trace";
  import {
    traceLengthMeters,
    type ImagePoint,
  } from "../flow-fest-path-tracer/_lib/flow-fest-trace";

  const VIEW = { x: 1400, y: 630, width: 330, height: 255 } as const;
  const MIN_SAMPLE_DISTANCE_PIXELS = 1.25;

  let map: SVGSVGElement | null = $state(null);
  let points: ImagePoint[] = $state([]);
  let undoHistory: ImagePoint[][] = $state([]);
  let drawing = $state(false);
  let saving = $state(false);
  let saved = $state(false);
  let notice = $state(
    "Drag in as many passes as you need, or click to place precise points."
  );

  const closedPoints = $derived.by(() => {
    if (drawing || points.length < 3) return points;
    return [...points, { ...points[0]! }];
  });
  const pathData = $derived(
    closedPoints.length === 0
      ? ""
      : closedPoints
          .map(
            (point, index) =>
              `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`
          )
          .join(" ")
  );
  const loopLength = $derived(traceLengthMeters(closedPoints));
  const canSend = $derived(!drawing && points.length >= 3 && loopLength >= 150);

  function imagePoint(event: PointerEvent): ImagePoint | null {
    if (!map) return null;
    const transform = map.getScreenCTM();
    if (!transform) return null;
    const point = map.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const image = point.matrixTransform(transform.inverse());
    return {
      x: Math.max(VIEW.x, Math.min(VIEW.x + VIEW.width, image.x)),
      y: Math.max(VIEW.y, Math.min(VIEW.y + VIEW.height, image.y)),
    };
  }

  function beginDrawing(event: PointerEvent): void {
    const point = imagePoint(event);
    if (!point || !map) return;
    undoHistory = [
      ...undoHistory,
      points.map((candidate) => ({ ...candidate })),
    ];
    points = [...points, point];
    drawing = true;
    saved = false;
    notice = "Drawing this pass. Release whenever you want to pause.";
    map.setPointerCapture(event.pointerId);
  }

  function continueDrawing(event: PointerEvent): void {
    if (!drawing) return;
    const point = imagePoint(event);
    const previous = points.at(-1);
    if (
      !point ||
      !previous ||
      Math.hypot(point.x - previous.x, point.y - previous.y) <
        MIN_SAMPLE_DISTANCE_PIXELS
    ) {
      return;
    }
    points = [...points, point];
  }

  function finishDrawing(event: PointerEvent): void {
    if (!drawing) return;
    continueDrawing(event);
    drawing = false;
    map?.releasePointerCapture(event.pointerId);
    notice =
      points.length >= 3
        ? "Pass kept. Continue from the blue endpoint, or Send when the loop is right."
        : "Point kept. Continue from the blue endpoint with another drag or click.";
  }

  function undo(): void {
    const previous = undoHistory.at(-1);
    if (!previous) return;
    points = previous.map((point) => ({ ...point }));
    undoHistory = undoHistory.slice(0, -1);
    drawing = false;
    saved = false;
    notice = points.length
      ? "Last pass removed. Continue from the blue endpoint."
      : "Last pass removed. Start again whenever you are ready.";
  }

  function handleKeydown(event: KeyboardEvent): void {
    const target = event.target;
    const isEditingText =
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement && target.isContentEditable);
    const isUndoShortcut =
      event.key.toLowerCase() === "z" &&
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey;

    if (
      !isUndoShortcut ||
      isEditingText ||
      drawing ||
      saving ||
      !undoHistory.length
    ) {
      return;
    }

    event.preventDefault();
    undo();
  }

  function clear(): void {
    if (!points.length) return;
    undoHistory = [...undoHistory, points.map((point) => ({ ...point }))];
    points = [];
    drawing = false;
    saved = false;
    notice = "Cleared. Undo restores it, or start a new multi-pass trace.";
  }

  async function sendToCodex(): Promise<void> {
    if (!canSend || saving) return;
    saving = true;
    saved = false;
    notice = "Saving your registered loop…";
    try {
      const response = await fetch("/test/flow-fest-loop-tracer/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(createFlowFestLowerLoopTraceSubmission(points)),
      });
      const result = (await response.json()) as {
        ok?: boolean;
        error?: string;
        pointCount?: number;
      };
      if (!response.ok || !result.ok) {
        throw new Error(result.error ?? "The loop could not be saved.");
      }
      saved = true;
      notice = `Sent to Codex · ${result.pointCount ?? points.length} registered points`;
    } catch (cause) {
      notice =
        cause instanceof Error ? cause.message : "The loop could not be saved.";
    } finally {
      saving = false;
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
  <title>Trace the Lower Campground Loop</title>
  <meta
    name="description"
    content="Draw the lower Flow Fest campground road over its registered aerial."
  />
</svelte:head>

<main class="tracer-shell">
  <header>
    <div>
      <p class="eyebrow">FLOW FEST · LOWER CAMPGROUND</p>
      <h1>Trace the road in as many passes as you need</h1>
    </div>
    <p class="north" aria-label="Map is oriented north-up">
      <strong>N</strong> ↑
    </p>
  </header>

  <section
    class="map-frame"
    aria-label="Lower campground aerial drawing surface"
  >
    <svg
      bind:this={map}
      class:drawing
      viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.width} ${VIEW.height}`}
      role="img"
      aria-label="North-up registered aerial of the lower campground. Drag repeatedly or click to add precise points around the pale road."
      onpointerdown={beginDrawing}
      onpointermove={continueDrawing}
      onpointerup={finishDrawing}
      onpointercancel={finishDrawing}
    >
      <image href="/data/flow-fest-sim/ortho.webp" width="2048" height="2048" />
      {#if pathData}
        <path class="drawn-loop-shadow" d={pathData} />
        <path class="drawn-loop" d={pathData} />
      {/if}
      {#if points.length > 0}
        <circle
          class="start-point"
          cx={points[0]!.x}
          cy={points[0]!.y}
          r="2.8"
        />
      {/if}
      {#if points.length > 1}
        <circle
          class="end-point"
          cx={points.at(-1)!.x}
          cy={points.at(-1)!.y}
          r="3.2"
        />
      {/if}
    </svg>
    <div class="scale" aria-label="Fifty metre scale"><span></span>50 m</div>
  </section>

  <footer>
    <p class:saved class="notice" aria-live="polite">{notice}</p>
    <p class="measurement">{loopLength.toFixed(0)} m</p>
    <div class="actions">
      <button
        type="button"
        class="secondary"
        onclick={undo}
        aria-keyshortcuts="Control+Z Meta+Z"
        disabled={saving || !undoHistory.length}
      >
        Undo
      </button>
      <button
        type="button"
        class="secondary"
        onclick={clear}
        disabled={saving || !points.length}
      >
        Clear
      </button>
      <button
        type="button"
        class="primary"
        onclick={sendToCodex}
        disabled={!canSend || saving}
      >
        {saving ? "Sending…" : saved ? "Sent ✓" : "Send to Codex"}
      </button>
    </div>
  </footer>
</main>

<style>
  :global(html),
  :global(body) {
    margin: 0;
    min-width: 320px;
    min-height: 100%;
    overflow: hidden;
    background: #07110d;
  }

  :global(body) {
    min-height: 100dvh;
  }

  button {
    font: inherit;
  }

  .tracer-shell {
    box-sizing: border-box;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    gap: clamp(8px, 1.4cqh, 16px);
    min-height: 100dvh;
    padding: clamp(10px, 1.8cqh, 22px);
    color: #f4f7ef;
    background:
      radial-gradient(circle at 50% 0%, rgb(31 61 46 / 45%), transparent 45%),
      #07110d;
    container-type: size;
  }

  header,
  footer {
    display: flex;
    align-items: center;
    gap: 16px;
    width: min(100%, 1480px);
    margin-inline: auto;
  }

  header {
    justify-content: space-between;
  }

  h1,
  p {
    margin: 0;
  }

  h1 {
    font-family: Georgia, "Times New Roman", serif;
    font-size: clamp(22px, 2.8cqh, 36px);
    line-height: 1.05;
  }

  .eyebrow {
    margin-bottom: 3px;
    color: #a6d8ba;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.12em;
  }

  .north {
    display: grid;
    justify-items: center;
    min-width: 44px;
    font-size: 22px;
    line-height: 0.9;
  }

  .map-frame {
    position: relative;
    width: min(100%, 1480px);
    min-height: 0;
    margin-inline: auto;
    overflow: hidden;
    border: 1px solid rgb(218 239 220 / 36%);
    border-radius: clamp(14px, 2cqh, 24px);
    background: #122119;
    box-shadow: 0 18px 60px rgb(0 0 0 / 38%);
  }

  svg {
    display: block;
    width: 100%;
    height: 100%;
    min-height: 0;
    cursor: crosshair;
    touch-action: none;
    user-select: none;
  }

  svg.drawing {
    cursor: grabbing;
  }

  image {
    pointer-events: none;
  }

  .drawn-loop-shadow,
  .drawn-loop {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }

  .drawn-loop-shadow {
    stroke: rgb(0 0 0 / 70%);
    stroke-width: 8;
  }

  .drawn-loop {
    stroke: #64ff9a;
    stroke-width: 4;
  }

  .start-point {
    fill: #ffffff;
    stroke: #07110d;
    stroke-width: 1.2;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }

  .end-point {
    fill: #64b5ff;
    stroke: #07110d;
    stroke-width: 1.2;
    vector-effect: non-scaling-stroke;
    pointer-events: none;
  }

  .scale {
    position: absolute;
    right: 16px;
    bottom: 13px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 9px;
    border-radius: 7px;
    color: #fff;
    background: rgb(0 0 0 / 62%);
    font-size: 12px;
    font-weight: 800;
    pointer-events: none;
  }

  .scale span {
    display: block;
    width: min(100px, 20cqw);
    border-top: 3px solid currentColor;
  }

  footer {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    min-height: 46px;
  }

  .notice {
    min-width: 0;
    min-height: 1.3em;
    overflow: hidden;
    color: #dbe8dc;
    font-size: 14px;
    line-height: 1.3;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .notice.saved {
    color: #8dffb7;
  }

  .measurement {
    width: 62px;
    color: #b7c9bc;
    font-size: 14px;
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  button {
    min-height: 44px;
    padding: 0 16px;
    border: 1px solid rgb(218 239 220 / 24%);
    border-radius: 10px;
    color: #f5f8f2;
    font-size: 14px;
    font-weight: 800;
    cursor: pointer;
  }

  button:focus-visible {
    outline: 3px solid #baffd1;
    outline-offset: 2px;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  .secondary {
    background: #17251d;
  }

  .primary {
    min-width: 148px;
    border-color: #64ff9a;
    color: #082312;
    background: #64ff9a;
  }

  @media (max-width: 700px) {
    .tracer-shell {
      gap: 8px;
      padding: 8px;
    }

    header {
      padding-inline: 4px;
    }

    h1 {
      font-size: 20px;
    }

    .eyebrow {
      font-size: 12px;
    }

    footer {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .measurement {
      display: none;
    }

    .actions {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: 1fr 1fr 1.5fr;
      width: 100%;
    }

    button,
    .primary {
      width: 100%;
      min-width: 0;
      padding-inline: 8px;
    }
  }

  @media (max-height: 520px) {
    .tracer-shell {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-rows: auto minmax(0, 1fr);
    }

    header {
      grid-column: 1 / -1;
    }

    footer {
      display: flex;
      flex-direction: column;
      align-items: stretch;
      width: min(250px, 31vw);
      min-width: 190px;
    }

    .notice {
      white-space: normal;
    }

    .actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      width: 100%;
    }

    .primary {
      grid-column: 1 / -1;
    }
  }

  /* the first row clears a phone's status bar; nothing moves when --safe-top is 0 */
  .tracer-shell {
    border-top: var(--safe-top) solid transparent;
  }
</style>
