<!--
  PostCurveEditor.svelte

  The body of the Curve popover for one keyframe segment's easing: the preset
  list (PostKeyframeControls passes it in) beside an SVG bezier plot, with the
  four number fields for the same x1/y1/x2/y2 underneath. The plot's two
  control points drag with mouse or touch and step with the arrow keys. Every
  edit is a coalesced setSegmentEasing at the playhead, joined into one undo
  step per drag or per typed value the same way a framing slider joins its
  own drags.

  One data unit is the same length on both axes, so the square a curve
  crosses draws as a true square, with overshoot room above and below it. A
  hold draws as the step it is, and its hint takes the number fields' place
  in the same reserved space, so choosing Hold, or leaving it, moves nothing.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import {
    POST_EASING_X_MAX,
    POST_EASING_X_MIN,
    type PostItem,
    type PostKeyframeChannel,
  } from "$lib/shared/media-composition/domain/post-project";
  import {
    setSegmentEasing,
    type PostKeyframeSegment,
  } from "$lib/shared/media-composition/domain/post-project-keyframes";
  import { editItemKeyframes } from "$lib/shared/media-composition/domain/post-project-edits";
  import type { PostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
  import ScrubbableNumber from "$lib/shared/ui/components/ScrubbableNumber.svelte";
  import {
    CURVE_EDITOR_Y_MAX,
    CURVE_EDITOR_Y_MIN,
    dataToPlotX,
    dataToPlotY,
    plotHeight,
    plotToDataX,
    plotToDataY,
    plotWidth,
    type CurvePlotGeometry,
  } from "./post-curve-plot";

  interface Props {
    editor: PostEditorState;
    item: PostItem;
    channel: PostKeyframeChannel;
    segment: PostKeyframeSegment;
    locked: boolean;
    /** The easing preset list, laid out beside the plot. */
    presets: Snippet;
  }

  let { editor, item, channel, segment, locked, presets }: Props = $props();

  // 130px units stand the 2.2-unit-tall plot level with the seven preset rows
  // beside it.
  const GEOMETRY: CurvePlotGeometry = {
    padPx: 16,
    unitPx: 130,
    yMin: CURVE_EDITOR_Y_MIN,
    yMax: CURVE_EDITOR_Y_MAX,
  };
  const WIDTH = plotWidth(GEOMETRY);
  const HEIGHT = plotHeight(GEOMETRY);
  const X_STEP = 0.01;
  const Y_STEP = 0.02;

  function clampX(value: number): number {
    return Math.min(POST_EASING_X_MAX, Math.max(POST_EASING_X_MIN, value));
  }

  function clampY(value: number): number {
    return Math.min(CURVE_EDITOR_Y_MAX, Math.max(CURVE_EDITOR_Y_MIN, value));
  }

  const isHold = $derived(segment.easing === "hold");
  // A hold has no control points; these only fill the hidden fields then.
  const points = $derived.by((): readonly [number, number, number, number] =>
    segment.easing === "hold" ? [0.42, 0, 0.58, 1] : segment.easing
  );
  const x1 = $derived(points[0]);
  const y1 = $derived(points[1]);
  const x2 = $derived(points[2]);
  const y2 = $derived(points[3]);

  const p0 = { x: dataToPlotX(0, GEOMETRY), y: dataToPlotY(0, GEOMETRY) };
  const p3 = { x: dataToPlotX(1, GEOMETRY), y: dataToPlotY(1, GEOMETRY) };
  // Drawn clamped to the plot: a saved project may hold a y a little beyond
  // what this editor edits, and its handle should still show, at the edge.
  const p1 = $derived({ x: dataToPlotX(x1, GEOMETRY), y: dataToPlotY(clampY(y1), GEOMETRY) });
  const p2 = $derived({ x: dataToPlotX(x2, GEOMETRY), y: dataToPlotY(clampY(y2), GEOMETRY) });
  const pathD = $derived(
    isHold
      ? `M ${p0.x},${p0.y} H ${p3.x} V ${p3.y}`
      : `M ${p0.x},${p0.y} C ${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`
  );

  let svgEl: SVGSVGElement | null = $state(null);
  let activeHandle: "p1" | "p2" | null = $state(null);
  // Where on the handle the press landed, so a drag carries the handle from
  // there instead of first snapping its center under the pointer.
  let grabOffset = { x: 0, y: 0 };

  function svgPoint(event: PointerEvent): { x: number; y: number } {
    const rect = svgEl?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    return {
      x: ((event.clientX - rect.left) * WIDTH) / rect.width,
      y: ((event.clientY - rect.top) * HEIGHT) / rect.height,
    };
  }

  function commit(next: readonly [number, number, number, number]): void {
    if (locked) return;
    editor.editSetting(
      `${item.id}:${channel}:easing:${segment.index}`,
      (project, ctx) =>
        editItemKeyframes(
          project,
          item.id,
          (it) => setSegmentEasing(it, channel, editor.previewSeconds, next),
          ctx
        )
    );
  }

  function handlePointerDown(handle: "p1" | "p2", event: PointerEvent): void {
    if (locked) return;
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    const point = svgPoint(event);
    const center = handle === "p1" ? p1 : p2;
    grabOffset = { x: point.x - center.x, y: point.y - center.y };
    activeHandle = handle;
    event.preventDefault();
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!activeHandle || locked) return;
    const point = svgPoint(event);
    const x = plotToDataX(point.x - grabOffset.x, GEOMETRY);
    const y = plotToDataY(point.y - grabOffset.y, GEOMETRY);
    commit(activeHandle === "p1" ? [x, y, x2, y2] : [x1, y1, x, y]);
  }

  function handlePointerUp(event: PointerEvent): void {
    if (!activeHandle) return;
    const target = event.currentTarget as Element;
    if (target.hasPointerCapture(event.pointerId)) {
      target.releasePointerCapture(event.pointerId);
    }
    activeHandle = null;
  }

  function handleKeydown(handle: "p1" | "p2", event: KeyboardEvent): void {
    if (locked) return;
    const big = event.shiftKey ? 5 : 1;
    let dx = 0;
    let dy = 0;
    switch (event.key) {
      case "ArrowLeft":
        dx = -X_STEP * big;
        break;
      case "ArrowRight":
        dx = X_STEP * big;
        break;
      case "ArrowUp":
        dy = Y_STEP * big;
        break;
      case "ArrowDown":
        dy = -Y_STEP * big;
        break;
      default:
        return;
    }
    event.preventDefault();
    commit(
      handle === "p1"
        ? [clampX(x1 + dx), clampY(y1 + dy), x2, y2]
        : [x1, y1, clampX(x2 + dx), clampY(y2 + dy)]
    );
  }
</script>

<div class="curve-editor">
  <div class="presets">
    {@render presets()}
  </div>
  <svg
    bind:this={svgEl}
    class="plot"
    class:locked
    viewBox="0 0 {WIDTH} {HEIGHT}"
    width={WIDTH}
    height={HEIGHT}
    role="group"
    aria-label={t("post_curve_editor_label")}
  >
    {#snippet handle(
      id: "p1" | "p2",
      at: { x: number; y: number },
      x: number,
      y: number,
      label: string
    )}
      <g
        class="handle"
        class:dragging={activeHandle === id}
        tabindex={locked ? -1 : 0}
        role="slider"
        aria-label={label}
        aria-valuenow={clampY(y)}
        aria-valuemin={CURVE_EDITOR_Y_MIN}
        aria-valuemax={CURVE_EDITOR_Y_MAX}
        aria-valuetext={t("post_curve_handle_value", { x: x.toFixed(2), y: y.toFixed(2) })}
        onpointerdown={(event) => handlePointerDown(id, event)}
        onpointermove={handlePointerMove}
        onpointerup={handlePointerUp}
        onpointercancel={handlePointerUp}
        onkeydown={(event) => handleKeydown(id, event)}
      >
        <circle cx={at.x} cy={at.y} r="22" class="handle-hit" />
        <circle cx={at.x} cy={at.y} r="11" class="handle-ring" />
        <circle cx={at.x} cy={at.y} r="6" class="handle-dot" />
      </g>
    {/snippet}

    <rect
      x={p0.x}
      y={p3.y}
      width={GEOMETRY.unitPx}
      height={GEOMETRY.unitPx}
      class="unit-square"
    />
    <line x1={p0.x} y1={p0.y} x2={p3.x} y2={p3.y} class="diagonal" />
    {#if !isHold}
      <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} class="guide" />
      <line x1={p3.x} y1={p3.y} x2={p2.x} y2={p2.y} class="guide" />
    {/if}
    <path d={pathD} class="curve" />
    <circle cx={p0.x} cy={p0.y} r="3" class="anchor" />
    <circle cx={p3.x} cy={p3.y} r="3" class="anchor" />
    {#if !isHold}
      {@render handle("p1", p1, x1, y1, t("post_curve_handle_start"))}
      {@render handle("p2", p2, x2, y2, t("post_curve_handle_end"))}
    {/if}
  </svg>
  <!-- The fields and the hold hint share one grid cell, sized by the taller,
       and trade places with visibility, so neither ever moves the other. -->
  <div class="readout">
    <div class="fields" class:concealed={isHold} class:locked inert={locked || isHold}>
      <ScrubbableNumber
        label={t("post_curve_x1")}
        value={x1}
        min={POST_EASING_X_MIN}
        max={POST_EASING_X_MAX}
        step={0.01}
        onchange={(value) => commit([value, y1, x2, y2])}
      />
      <ScrubbableNumber
        label={t("post_curve_y1")}
        value={y1}
        min={CURVE_EDITOR_Y_MIN}
        max={CURVE_EDITOR_Y_MAX}
        step={0.01}
        onchange={(value) => commit([x1, value, x2, y2])}
      />
      <ScrubbableNumber
        label={t("post_curve_x2")}
        value={x2}
        min={POST_EASING_X_MIN}
        max={POST_EASING_X_MAX}
        step={0.01}
        onchange={(value) => commit([x1, y1, value, y2])}
      />
      <ScrubbableNumber
        label={t("post_curve_y2")}
        value={y2}
        min={CURVE_EDITOR_Y_MIN}
        max={CURVE_EDITOR_Y_MAX}
        step={0.01}
        onchange={(value) => commit([x1, y1, x2, value])}
      />
    </div>
    <p class="hint" class:concealed={!isHold}>{t("post_curve_hold_hint")}</p>
  </div>
</div>

<style>
  .curve-editor {
    display: grid;
    grid-template-columns: auto auto;
    grid-template-areas:
      "presets plot"
      "readout readout";
    gap: 0.5rem 0.75rem;
    align-items: start;
  }

  .presets {
    grid-area: presets;
  }

  .plot {
    grid-area: plot;
    display: block;
    touch-action: none;
  }

  .unit-square {
    fill: color-mix(in srgb, var(--theme-text, #fff) 4%, transparent);
    stroke: var(--theme-stroke, rgba(255, 255, 255, 0.15));
    stroke-width: 1;
  }

  .diagonal {
    stroke: var(--theme-stroke, rgba(255, 255, 255, 0.15));
    stroke-width: 1;
    stroke-dasharray: 2 3;
  }

  .guide {
    stroke: var(--theme-text-secondary, #aaa);
    stroke-width: 1;
    opacity: 0.6;
  }

  .curve {
    fill: none;
    stroke: var(--theme-accent, #d4813a);
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .anchor {
    fill: var(--theme-text-secondary, #aaa);
  }

  /* The ring below stands in for the focus outline, which would otherwise
     box the whole 44px hit circle. */
  .handle {
    cursor: grab;
    outline: none;
  }

  .handle.dragging {
    cursor: grabbing;
  }

  .plot.locked .handle {
    cursor: not-allowed;
  }

  .handle-hit {
    fill: transparent;
  }

  .handle-ring {
    fill: none;
    stroke: transparent;
    stroke-width: 2;
    pointer-events: none;
  }

  .handle:focus-visible .handle-ring {
    stroke: var(--theme-text, #fff);
  }

  .handle-dot {
    fill: var(--theme-accent, #d4813a);
    stroke: var(--theme-bg, #101018);
    stroke-width: 2;
    pointer-events: none;
  }

  .readout {
    grid-area: readout;
    display: grid;
  }

  .fields,
  .hint {
    grid-area: 1 / 1;
  }

  .fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
  }

  /* Matches PostItemSettings' own .lockable: no disabled prop on
     ScrubbableNumber, so a locked segment goes read-only via inert instead. */
  .fields.locked {
    opacity: 0.5;
  }

  .hint {
    align-self: center;
    margin: 0;
    padding: 0 0.375rem;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.8125rem;
    line-height: 1.4;
  }

  .concealed {
    visibility: hidden;
  }
</style>
