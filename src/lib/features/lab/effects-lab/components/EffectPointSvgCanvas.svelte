<!--
  EffectPointSvgCanvas.svelte

  Interactive SVG viewer: renders the prop shape, displays tip point
  markers, supports click-to-add and drag-to-reposition.
  Shared across all effects - edits the unified tip point registry.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { PROP_DIMENSIONS, DEFAULT_PROP_DIMENSIONS, type PropDimensions } from "$lib/shared/animation-engine/services/IPropTextureLoader";
  import { resolvePropSvgPath } from "$lib/shared/animation-engine/services/svg-generator";
  import { basePropTypeOfRenderKey } from "$lib/shared/pictograph/prop/domain/prop-look";
  import type { EffectPointEditorState } from "../state/effect-point-editor-state.svelte";

  interface Props {
    editorState: EffectPointEditorState;
  }

  const { editorState }: Props = $props();

  let svgEl: SVGSVGElement | undefined = $state();
  let propShapeGroup: SVGGElement | undefined = $state();
  let hoverCoords = $state<{ dx: number; dy: number } | null>(null);

  // Drag origin for shift-constraint axis locking
  let dragOrigin = $state<{ dx: number; dy: number } | null>(null);
  let constraintAxis = $state<"h" | "v" | null>(null);

  // Zoom & pan state
  let zoomLevel = $state(1.0);
  let panX = $state(0);
  let panY = $state(0);
  let isPanning = $state(false);
  let panStart = $state<{ x: number; y: number; panX: number; panY: number } | null>(null);
  let spaceHeld = $state(false);

  const ZOOM_MIN = 0.25;
  const ZOOM_MAX = 3.0;
  const ZOOM_STEP = 0.15;

  const PADDING = 60;
  const POINT_MIN_RADIUS = 8;
  const POINT_MAX_RADIUS = 20;
  /** Pixels of drag before axis lock engages */
  const AXIS_LOCK_THRESHOLD = 5;
  /** Arrow key nudge amount (prop-local units) */
  const NUDGE_STEP = 1;
  /** Shift+Arrow nudge amount (larger steps) */
  const NUDGE_STEP_LARGE = 10;

  let dims = $derived<PropDimensions>(
    PROP_DIMENSIONS[basePropTypeOfRenderKey(editorState.selectedPropType)] ?? DEFAULT_PROP_DIMENSIONS
  );

  let baseViewBoxWidth = $derived(dims.width + PADDING * 2);
  let baseViewBoxHeight = $derived(dims.height + PADDING * 2);

  // Zoomed viewBox: larger viewBox = zoomed out, smaller = zoomed in
  let viewBoxWidth = $derived(baseViewBoxWidth / zoomLevel);
  let viewBoxHeight = $derived(baseViewBoxHeight / zoomLevel);

  // ViewBox origin accounts for zoom centering + pan offset
  let viewBoxX = $derived((baseViewBoxWidth - viewBoxWidth) / 2 - panX);
  let viewBoxY = $derived((baseViewBoxHeight - viewBoxHeight) / 2 - panY);

  let zoomPercent = $derived(Math.round(zoomLevel * 100));

  // Load the prop SVG inline when prop type changes or group element mounts
  $effect(() => {
    const propType = editorState.selectedPropType;
    const group = propShapeGroup;
    if (group) loadPropSvg(propType);
  });

  async function loadPropSvg(propType: string) {
    if (!propShapeGroup) return;
    try {
      // Same seam the animation canvas draws from. Placing points against a
      // different family is what left every saved tip point ~15-20% too far out.
      const resp = await fetch(resolvePropSvgPath(propType.toLowerCase()));
      if (!resp.ok) {
        propShapeGroup.replaceChildren();
        return;
      }
      const text = await resp.text();
      // Parse SVG via DOMParser (safe: no script execution in parsed documents)
      const doc = new DOMParser().parseFromString(text, "image/svg+xml");
      const svgRoot = doc.documentElement;
      // Remove any script elements (defense-in-depth)
      svgRoot.querySelectorAll("script").forEach((s) => s.remove());
      // Sanitize all elements for ghost display
      for (const el of svgRoot.querySelectorAll("*")) {
        for (const attr of Array.from(el.attributes)) {
          // Remove event handlers
          if (attr.name.startsWith("on")) el.removeAttribute(attr.name);
        }
        // Strip inline fill/stroke so CSS ghost styling applies uniformly.
        // Many prop SVGs use inline style="fill:#color" which overrides CSS rules,
        // causing the ghost to show original colors instead of a uniform outline.
        if (el instanceof SVGElement && el.style) {
          el.style.removeProperty("fill");
          el.style.removeProperty("stroke");
          el.style.removeProperty("stroke-width");
        }
      }
      // Normalize the source viewBox to PROP_DIMENSIONS. Tip points live in
      // prop-dimension units, but some assets (e.g. simple_staff at 300x92.33
      // vs dims 270x83.1) carry a different coordinate scale. Without this,
      // the ghost renders off-center and tip markers drift off the prop ends.
      const propDims = PROP_DIMENSIONS[basePropTypeOfRenderKey(propType)] ?? DEFAULT_PROP_DIMENSIONS;
      const vb = (svgRoot.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
      let target: Element = propShapeGroup;
      if (
        vb.length === 4 && vb.every(Number.isFinite) && vb[2]! > 0 && vb[3]! > 0 &&
        (vb[2] !== propDims.width || vb[3] !== propDims.height || vb[0] !== 0 || vb[1] !== 0)
      ) {
        const sx = propDims.width / vb[2]!;
        const sy = propDims.height / vb[3]!;
        const wrapper = document.createElementNS("http://www.w3.org/2000/svg", "g");
        wrapper.setAttribute("transform", `scale(${sx} ${sy}) translate(${-vb[0]!} ${-vb[1]!})`);
        propShapeGroup.replaceChildren(wrapper);
        target = wrapper;
      } else {
        propShapeGroup.replaceChildren();
      }
      // Move child nodes into the target group.
      // NOTE: Use Array.from snapshot, NOT while(firstChild) + importNode.
      // importNode creates a COPY without removing the source node,
      // so while(firstChild) would loop forever.
      for (const child of Array.from(svgRoot.childNodes)) {
        target.appendChild(document.importNode(child, true));
      }
    } catch {
      propShapeGroup?.replaceChildren();
    }
  }

  function svgPointFromClientCoords(clientX: number, clientY: number): { dx: number; dy: number } | null {
    if (!svgEl) return null;
    const ctm = svgEl.getScreenCTM();
    if (!ctm) return null;
    const inv = ctm.inverse();
    const pt = new DOMPoint(clientX, clientY).matrixTransform(inv);
    // Convert from viewBox coords (prop centered in base viewBox) to prop-local coords
    const centerX = baseViewBoxWidth / 2;
    const centerY = baseViewBoxHeight / 2;
    const dx = Math.round((pt.x - centerX) * 10) / 10;
    const dy = Math.round((pt.y - centerY) * 10) / 10;
    return { dx, dy };
  }

  function svgPointFromEvent(e: MouseEvent): { dx: number; dy: number } | null {
    return svgPointFromClientCoords(e.clientX, e.clientY);
  }

  function svgPointFromTouch(t: Touch): { dx: number; dy: number } | null {
    return svgPointFromClientCoords(t.clientX, t.clientY);
  }

  function handleWheel(e: WheelEvent) {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
    zoomLevel = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoomLevel + delta));
  }

  function zoomIn() {
    zoomLevel = Math.min(ZOOM_MAX, zoomLevel + ZOOM_STEP);
  }

  function zoomOut() {
    zoomLevel = Math.max(ZOOM_MIN, zoomLevel - ZOOM_STEP);
  }

  function resetView() {
    zoomLevel = 1.0;
    panX = 0;
    panY = 0;
  }

  function handlePanStart(e: MouseEvent) {
    // Middle-click or Space+click to pan
    if (e.button === 1 || (spaceHeld && e.button === 0)) {
      e.preventDefault();
      isPanning = true;
      panStart = { x: e.clientX, y: e.clientY, panX, panY };

      const onPanMove = (moveEvent: MouseEvent) => {
        if (!panStart || !svgEl) return;
        // Convert pixel delta to viewBox units
        const rect = svgEl.getBoundingClientRect();
        const scaleX = viewBoxWidth / rect.width;
        const scaleY = viewBoxHeight / rect.height;
        panX = panStart.panX + (moveEvent.clientX - panStart.x) * scaleX;
        panY = panStart.panY + (moveEvent.clientY - panStart.y) * scaleY;
      };

      const onPanEnd = () => {
        isPanning = false;
        panStart = null;
        window.removeEventListener("mousemove", onPanMove);
        window.removeEventListener("mouseup", onPanEnd);
      };

      window.addEventListener("mousemove", onPanMove);
      window.addEventListener("mouseup", onPanEnd);
    }
  }

  function handleCanvasClick(e: MouseEvent) {
    if (editorState.isDragging || isPanning || spaceHeld) return;
    const target = e.target as Element;
    // Don't add point if clicking on an existing point marker
    if (target.closest(".effect-point-marker")) return;
    const coords = svgPointFromEvent(e);
    if (!coords) return;
    editorState.addPoint(coords.dx, coords.dy);
  }

  function handlePointMouseDown(e: MouseEvent, index: number) {
    e.preventDefault();
    e.stopPropagation();
    editorState.beginDrag(index);

    // Anchor to the point's actual position, not where the mouse landed
    const point = editorState.points[index];
    if (!point) return;
    const origin = { dx: point.dx, dy: point.dy };
    dragOrigin = origin;
    constraintAxis = null;

    // Track mouse origin separately for computing drag delta
    const mouseOrigin = svgPointFromEvent(e);

    const onMove = (moveEvent: MouseEvent) => {
      const coords = svgPointFromEvent(moveEvent);
      if (!coords || !mouseOrigin) return;

      // Shift-constrained drag: lock to dominant axis
      if (moveEvent.shiftKey) {
        const deltaX = Math.abs(coords.dx - mouseOrigin.dx);
        const deltaY = Math.abs(coords.dy - mouseOrigin.dy);

        // Determine axis once mouse drag exceeds threshold
        if (!constraintAxis && (deltaX > AXIS_LOCK_THRESHOLD || deltaY > AXIS_LOCK_THRESHOLD)) {
          constraintAxis = deltaX >= deltaY ? "h" : "v";
        }

        // Freeze the point until axis is determined (no drift)
        if (!constraintAxis) return;

        // Apply mouse delta to point's original position along the unlocked axis only
        const mouseDx = coords.dx - mouseOrigin.dx;
        const mouseDy = coords.dy - mouseOrigin.dy;

        if (constraintAxis === "h") {
          editorState.updatePointPosition(index, origin.dx + mouseDx, origin.dy);
        } else {
          editorState.updatePointPosition(index, origin.dx, origin.dy + mouseDy);
        }
      } else {
        // Unconstrained: apply mouse delta to point's original position
        constraintAxis = null;
        const mouseDx = coords.dx - mouseOrigin.dx;
        const mouseDy = coords.dy - mouseOrigin.dy;
        editorState.updatePointPosition(index, origin.dx + mouseDx, origin.dy + mouseDy);
      }
    };

    const onUp = () => {
      editorState.endDrag();
      dragOrigin = null;
      constraintAxis = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  // ─── Touch: drag a point ──────────────────────────────────────────────

  function handlePointTouchStart(e: TouchEvent, index: number) {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    editorState.beginDrag(index);

    const point = editorState.points[index];
    if (!point) return;
    const origin = { dx: point.dx, dy: point.dy };
    dragOrigin = origin;
    constraintAxis = null;

    const firstTouch = e.touches[0];
    if (!firstTouch) return;
    const touchOrigin = svgPointFromTouch(firstTouch);

    const onTouchMove = (moveEvent: TouchEvent) => {
      if (moveEvent.touches.length !== 1) return;
      moveEvent.preventDefault();
      const moveTouch = moveEvent.touches[0];
      if (!moveTouch) return;
      const coords = svgPointFromTouch(moveTouch);
      if (!coords || !touchOrigin) return;
      const moveDx = coords.dx - touchOrigin.dx;
      const moveDy = coords.dy - touchOrigin.dy;
      editorState.updatePointPosition(index, origin.dx + moveDx, origin.dy + moveDy);
    };

    const onTouchEnd = () => {
      editorState.endDrag();
      dragOrigin = null;
      constraintAxis = null;
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };

    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);
  }

  // ─── Touch: tap canvas to add, two-finger pan ──────────────────────

  function handleCanvasTouchStart(e: TouchEvent) {
    if (e.touches.length === 2) {
      // Two-finger pan
      e.preventDefault();
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      if (!t1 || !t2) return;
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      isPanning = true;
      panStart = { x: midX, y: midY, panX, panY };

      const onPanMove = (moveEvent: TouchEvent) => {
        if (moveEvent.touches.length < 2 || !panStart || !svgEl) return;
        moveEvent.preventDefault();
        const mt1 = moveEvent.touches[0];
        const mt2 = moveEvent.touches[1];
        if (!mt1 || !mt2) return;
        const newMidX = (mt1.clientX + mt2.clientX) / 2;
        const newMidY = (mt1.clientY + mt2.clientY) / 2;
        const rect = svgEl.getBoundingClientRect();
        const scaleX = viewBoxWidth / rect.width;
        const scaleY = viewBoxHeight / rect.height;
        panX = panStart.panX + (newMidX - panStart.x) * scaleX;
        panY = panStart.panY + (newMidY - panStart.y) * scaleY;
      };

      const onPanEnd = () => {
        isPanning = false;
        panStart = null;
        window.removeEventListener("touchmove", onPanMove);
        window.removeEventListener("touchend", onPanEnd);
        window.removeEventListener("touchcancel", onPanEnd);
      };

      window.addEventListener("touchmove", onPanMove, { passive: false });
      window.addEventListener("touchend", onPanEnd);
      window.addEventListener("touchcancel", onPanEnd);
    }
    // Single-finger tap to add is handled via onclick (fires after touchend)
  }

  function handleCanvasMouseMove(e: MouseEvent) {
    const coords = svgPointFromEvent(e);
    hoverCoords = coords;
  }

  function handleCanvasMouseLeave() {
    hoverCoords = null;
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === " " || e.code === "Space") {
      // Don't capture Space if focused on an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      spaceHeld = true;
      return;
    }

    if (editorState.selectedPointIndex < 0) return;
    const idx = editorState.selectedPointIndex;
    const point = editorState.points[idx];
    if (!point) return;

    const step = e.shiftKey ? NUDGE_STEP_LARGE : NUDGE_STEP;
    let dx = point.dx;
    let dy = point.dy;
    let handled = false;

    switch (e.key) {
      case "ArrowLeft":
        dx -= step;
        handled = true;
        break;
      case "ArrowRight":
        dx += step;
        handled = true;
        break;
      case "ArrowUp":
        dy -= step;
        handled = true;
        break;
      case "ArrowDown":
        dy += step;
        handled = true;
        break;
    }

    if (handled) {
      e.preventDefault();
      // Round to 1 decimal place to avoid float drift
      dx = Math.round(dx * 10) / 10;
      dy = Math.round(dy * 10) / 10;
      editorState.updatePoint(idx, { dx, dy });
    }
  }

  function handleKeyUp(e: KeyboardEvent) {
    if (e.key === " " || e.code === "Space") {
      spaceHeld = false;
    }
  }

  function pointRadius(_point: { dx: number; dy: number }): number {
    return (POINT_MIN_RADIUS + POINT_MAX_RADIUS) / 2;
  }

  onMount(() => {
    loadPropSvg(editorState.selectedPropType);
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
  class="svg-canvas-wrapper"
  tabindex="0"
  role="application"
  onkeydown={handleKeyDown}
  onkeyup={handleKeyUp}
  style="--effect-accent: var(--theme-accent, #8b5cf6); --effect-accent-border: rgba(139, 92, 246, 0.3)"
>
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_click_events_have_key_events -->
  <svg
    bind:this={svgEl}
    class="editor-svg"
    class:panning={spaceHeld || isPanning}
    viewBox="{viewBoxX} {viewBoxY} {viewBoxWidth} {viewBoxHeight}"
    xmlns="http://www.w3.org/2000/svg"
    role="application"
    aria-label="Effect point editor canvas for {editorState.selectedPropType}"
    onclick={handleCanvasClick}
    onmousedown={handlePanStart}
    onmousemove={handleCanvasMouseMove}
    onmouseleave={handleCanvasMouseLeave}
    onwheel={handleWheel}
    ontouchstart={handleCanvasTouchStart}
  >
    <!-- Background grid -->
    <defs>
      <pattern id="editor-grid" width="50" height="50" patternUnits="userSpaceOnUse">
        <line x1="0" y1="0" x2="0" y2="50" stroke="rgba(255,255,255,0.04)" stroke-width="0.5" />
        <line x1="0" y1="0" x2="50" y2="0" stroke="rgba(255,255,255,0.04)" stroke-width="0.5" />
      </pattern>
    </defs>
    <rect x={viewBoxX} y={viewBoxY} width={viewBoxWidth} height={viewBoxHeight} fill="url(#editor-grid)" />

    <!-- Origin crosshair -->
    <g class="origin-crosshair" transform="translate({baseViewBoxWidth / 2}, {baseViewBoxHeight / 2})">
      <line x1="-20" y1="0" x2="20" y2="0" stroke="rgba(255,255,255,0.15)" stroke-width="1" stroke-dasharray="4,3" />
      <line x1="0" y1="-20" x2="0" y2="20" stroke="rgba(255,255,255,0.15)" stroke-width="1" stroke-dasharray="4,3" />
      <circle r="3" fill="rgba(255,255,255,0.2)" />
    </g>

    <!-- Prop shape (centered in base viewBox) -->
    <g
      class="prop-shape"
      transform="translate({(baseViewBoxWidth - dims.width) / 2}, {(baseViewBoxHeight - dims.height) / 2})"
      opacity="0.6"
      bind:this={propShapeGroup}
    ></g>

    <!-- Effect point markers -->
    {#each editorState.points as point, i (i)}
      {@const cx = baseViewBoxWidth / 2 + point.dx}
      {@const cy = baseViewBoxHeight / 2 + point.dy}
      {@const r = pointRadius(point)}
      {@const isSelected = editorState.selectedPointIndex === i}
      <g
        class="effect-point-marker"
        class:selected={isSelected}
        transform="translate({cx}, {cy})"
        onmousedown={(e) => handlePointMouseDown(e, i)}
        ontouchstart={(e) => handlePointTouchStart(e, i)}
        onclick={(e) => { e.stopPropagation(); editorState.selectedPointIndex = i; }}
        onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); editorState.selectedPointIndex = i; } }}
        role="button"
        tabindex="0"
        aria-label="Point {i + 1}: dx={point.dx}, dy={point.dy}"
      >
        <!-- Glow ring for selected -->
        {#if isSelected}
          <circle r={r + 4} fill="none" stroke="var(--effect-accent)" stroke-width="2" opacity="0.5" />
        {/if}
        <!-- Main circle -->
        <circle r={r} fill="var(--effect-accent-border)" stroke="var(--effect-accent)" stroke-width="1.5" />
        <!-- Inner dot -->
        <circle r="2.5" fill="var(--effect-accent)" />
        <!-- Point number -->
        <text
          y={-r - 8}
          text-anchor="middle"
          fill="rgba(255,255,255,0.8)"
          font-size="14"
          font-weight="600"
        >
          {i + 1}
        </text>
      </g>
    {/each}
  </svg>

  <!-- Zoom controls -->
  <div class="zoom-controls">
    <button
      class="zoom-btn"
      onclick={zoomIn}
      disabled={zoomLevel >= ZOOM_MAX}
      aria-label="Zoom in"
      title="Zoom in"
    >+</button>
    <button
      class="zoom-level"
      onclick={resetView}
      aria-label="Reset zoom to 100%"
      title="Reset view"
    >{zoomPercent}%</button>
    <button
      class="zoom-btn"
      onclick={zoomOut}
      disabled={zoomLevel <= ZOOM_MIN}
      aria-label="Zoom out"
      title="Zoom out"
    >&minus;</button>
  </div>

  <!-- Coordinate readout -->
  {#if hoverCoords}
    <div class="coord-readout">
      dx: {hoverCoords.dx.toFixed(1)}, dy: {hoverCoords.dy.toFixed(1)}
    </div>
  {/if}

  <div class="canvas-hint">
    Click to add. Drag to move. Scroll to zoom. Space+drag to pan.
  </div>
</div>

<style>
  .svg-canvas-wrapper {
    position: relative;
    flex: 1;
    min-height: 0;
    background: var(--theme-surface-dark, #0a0a0f);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--border-radius-lg, 12px);
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .svg-canvas-wrapper:focus {
    outline: 2px solid var(--effect-accent-border);
    outline-offset: -2px;
  }

  .editor-svg {
    width: 100%;
    height: 100%;
    cursor: crosshair;
  }

  .editor-svg.panning {
    cursor: grab;
  }

  .editor-svg.panning:active {
    cursor: grabbing;
  }

  .effect-point-marker {
    cursor: grab;
  }

  .effect-point-marker:active {
    cursor: grabbing;
  }

  .coord-readout {
    position: absolute;
    top: 10px;
    right: 10px;
    padding: 6px 12px;
    background: var(--theme-overlay-dark, rgba(0, 0, 0, 0.75));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--border-radius-md, 8px);
    font-family: var(--font-mono, monospace);
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    pointer-events: none;
  }

  .zoom-controls {
    position: absolute;
    top: 10px;
    left: 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    z-index: 1;
  }

  .zoom-btn,
  .zoom-level {
    width: 36px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-overlay-dark, rgba(0, 0, 0, 0.75));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .zoom-btn:first-child {
    border-radius: var(--border-radius-md, 8px) var(--border-radius-md, 8px) 0 0;
  }

  .zoom-btn:last-child {
    border-radius: 0 0 var(--border-radius-md, 8px) var(--border-radius-md, 8px);
  }

  .zoom-level {
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    font-family: var(--font-mono, monospace);
    border-radius: 0;
  }

  .zoom-btn:hover:not(:disabled),
  .zoom-level:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.12));
  }

  .zoom-btn:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .canvas-hint {
    position: absolute;
    bottom: 10px;
    left: 50%;
    transform: translateX(-50%);
    padding: 6px 16px;
    background: var(--theme-overlay-dark, rgba(0, 0, 0, 0.65));
    border-radius: 9999px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    pointer-events: none;
    white-space: nowrap;
  }

  /* Prop SVG shapes should be white/light for dark background */
  .prop-shape :global(path),
  .prop-shape :global(rect),
  .prop-shape :global(ellipse),
  .prop-shape :global(circle),
  .prop-shape :global(polygon) {
    fill: var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
    stroke: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    stroke-width: 1;
  }
</style>
