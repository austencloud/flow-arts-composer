<!--
  PostCurveEditor.svelte

  The SVG bezier plot for one keyframe segment's easing: two draggable
  control points (mouse, touch and keyboard) plus four number fields for the
  same x1/y1/x2/y2. Every edit is a coalesced setSegmentEasing at the
  playhead, joined into one undo step per drag or per typed value the same
  way a framing slider joins its own drags.

  Only ever mounted for a segment whose easing is not "hold" - a hold has no
  curve to plot, so PostKeyframeControls shows a hint instead of this.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import {
    POST_EASING_X_MAX,
    POST_EASING_X_MIN,
    POST_EASING_Y_MAX,
    POST_EASING_Y_MIN,
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
    dataToPlotX,
    dataToPlotY,
    plotToDataX,
    plotToDataY,
    type CurvePlotGeometry,
  } from "./post-curve-plot";

  interface Props {
    editor: PostEditorState;
    item: PostItem;
    channel: PostKeyframeChannel;
    segment: PostKeyframeSegment;
    locked: boolean;
  }

  let { editor, item, channel, segment, locked }: Props = $props();

  const SIZE = 200;
  const GEOMETRY: CurvePlotGeometry = {
    padPx: 20,
    plotPx: 160,
    yMin: POST_EASING_Y_MIN,
    yMax: POST_EASING_Y_MAX,
  };
  const X_STEP = 0.01;
  const Y_STEP = 0.02;

  // Defensive only - the caller never mounts this for a "hold" segment.
  const points = $derived.by((): readonly [number, number, number, number] =>
    segment.easing === "hold" ? [0.42, 0, 0.58, 1] : segment.easing
  );
  const x1 = $derived(points[0]);
  const y1 = $derived(points[1]);
  const x2 = $derived(points[2]);
  const y2 = $derived(points[3]);

  const p0 = { x: dataToPlotX(0, GEOMETRY), y: dataToPlotY(0, GEOMETRY) };
  const p3 = { x: dataToPlotX(1, GEOMETRY), y: dataToPlotY(1, GEOMETRY) };
  const p1 = $derived({ x: dataToPlotX(x1, GEOMETRY), y: dataToPlotY(y1, GEOMETRY) });
  const p2 = $derived({ x: dataToPlotX(x2, GEOMETRY), y: dataToPlotY(y2, GEOMETRY) });
  const pathD = $derived(
    `M ${p0.x},${p0.y} C ${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`
  );

  let svgEl: SVGSVGElement | null = $state(null);
  let activeHandle: "p1" | "p2" | null = $state(null);

  function svgPoint(event: PointerEvent): { x: number; y: number } {
    const rect = svgEl?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0, y: 0 };
    return {
      x: ((event.clientX - rect.left) * SIZE) / rect.width,
      y: ((event.clientY - rect.top) * SIZE) / rect.height,
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
    activeHandle = handle;
    event.preventDefault();
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!activeHandle || locked) return;
    const point = svgPoint(event);
    const x = plotToDataX(point.x, GEOMETRY);
    const y = plotToDataY(point.y, GEOMETRY);
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
    const clampX = (v: number) => Math.min(POST_EASING_X_MAX, Math.max(POST_EASING_X_MIN, v));
    const clampY = (v: number) => Math.min(POST_EASING_Y_MAX, Math.max(POST_EASING_Y_MIN, v));
    commit(
      handle === "p1"
        ? [clampX(x1 + dx), clampY(y1 + dy), x2, y2]
        : [x1, y1, clampX(x2 + dx), clampY(y2 + dy)]
    );
  }
</script>

<div class="curve-editor">
  <svg
    bind:this={svgEl}
    viewBox="0 0 {SIZE} {SIZE}"
    width={SIZE}
    height={SIZE}
    role="img"
    aria-label={t("post_curve_editor_label")}
  >
    <line x1={p0.x} y1={p0.y} x2={p3.x} y2={p3.y} class="diagonal" />
    <line x1={p0.x} y1={p0.y} x2={p1.x} y2={p1.y} class="guide" />
    <line x1={p3.x} y1={p3.y} x2={p2.x} y2={p2.y} class="guide" />
    <path d={pathD} class="curve" />
    <circle cx={p0.x} cy={p0.y} r="3" class="anchor" />
    <circle cx={p3.x} cy={p3.y} r="3" class="anchor" />
    <g
      class="handle"
      tabindex={locked ? -1 : 0}
      role="slider"
      aria-label={t("post_curve_handle_start")}
      aria-valuetext={t("post_curve_handle_value", { x: x1.toFixed(2), y: y1.toFixed(2) })}
      onpointerdown={(event) => handlePointerDown("p1", event)}
      onpointermove={handlePointerMove}
      onpointerup={handlePointerUp}
      onpointercancel={handlePointerUp}
      onkeydown={(event) => handleKeydown("p1", event)}
    >
      <circle cx={p1.x} cy={p1.y} r="22" class="handle-hit" />
      <circle cx={p1.x} cy={p1.y} r="6" class="handle-dot" />
    </g>
    <g
      class="handle"
      tabindex={locked ? -1 : 0}
      role="slider"
      aria-label={t("post_curve_handle_end")}
      aria-valuetext={t("post_curve_handle_value", { x: x2.toFixed(2), y: y2.toFixed(2) })}
      onpointerdown={(event) => handlePointerDown("p2", event)}
      onpointermove={handlePointerMove}
      onpointerup={handlePointerUp}
      onpointercancel={handlePointerUp}
      onkeydown={(event) => handleKeydown("p2", event)}
    >
      <circle cx={p2.x} cy={p2.y} r="22" class="handle-hit" />
      <circle cx={p2.x} cy={p2.y} r="6" class="handle-dot" />
    </g>
  </svg>
  <div class="fields lockable" inert={locked}>
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
      min={POST_EASING_Y_MIN}
      max={POST_EASING_Y_MAX}
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
      min={POST_EASING_Y_MIN}
      max={POST_EASING_Y_MAX}
      step={0.01}
      onchange={(value) => commit([x1, y1, x2, value])}
    />
  </div>
</div>

<style>
  .curve-editor {
    display: grid;
    gap: 0.5rem;
    justify-items: center;
  }

  svg {
    display: block;
    touch-action: none;
  }

  .diagonal {
    stroke: var(--theme-stroke, rgba(255, 255, 255, 0.15));
    stroke-width: 1;
    stroke-dasharray: 2 3;
  }

  .guide {
    stroke: var(--theme-text-secondary, #aaa);
    stroke-width: 1;
    opacity: 0.5;
  }

  .curve {
    fill: none;
    stroke: var(--theme-accent, #d4813a);
    stroke-width: 2;
  }

  .anchor {
    fill: var(--theme-text-secondary, #aaa);
  }

  .handle {
    cursor: grab;
  }

  .handle-hit {
    fill: transparent;
  }

  .handle-dot {
    fill: var(--theme-accent, #d4813a);
    stroke: var(--theme-bg, #101018);
    stroke-width: 2;
    pointer-events: none;
  }

  .handle:focus-visible .handle-dot {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    width: 100%;
  }

  /* Matches PostItemSettings' own .lockable: no disabled prop on
     ScrubbableNumber, so a locked segment goes read-only via inert instead. */
  .fields.lockable[inert] {
    opacity: 0.5;
  }
</style>
