<!--
  PanelGroup - Container that manages panel sizes with drag handles

  Orchestrates multiple children with ResizeHandle components between them.
  Children are passed as an array of snippets for full control.

  Props:
  - direction: "horizontal" | "vertical"
  - panels: Array of { content: Snippet, defaultSize?: number, minSize?: number, maxSize?: number }
  - sizes: Current sizes as flex ratios (bindable)

  Key insight: We need explicit panel definitions rather than slots
  because we need to insert ResizeHandles between them and track sizes.
-->
<script module lang="ts">
  import type { Snippet } from "svelte";

  export interface PanelDefinition {
    /** Panel content */
    content: Snippet;
    /** Default flex size (default: 1) */
    defaultSize?: number;
    /** Minimum size in pixels */
    minSize?: number;
    /** Maximum size in pixels (0 = no max) */
    maxSize?: number;
    /**
     * Hold this panel at a CSS length while keeping its normal flex size for
     * later. A collapsed dock can therefore reopen at the exact size the user
     * left its editor instead of resetting the workspace.
     */
    fixedSize?: string;
    /**
     * Start at a CSS length while leaving the resize handle active. The first
     * drag turns that preferred allocation into the user's saved flex sizes.
     */
    preferredSize?: string;
    /**
     * While this panel's own allocation grows, lay its content out at the size
     * it is growing to and let the moving edge uncover it; while it shrinks,
     * keep its content at the size it started from and let the edge cover it.
     * Content that is costly to re-lay out, such as a grid of pictographs or a
     * column of settings cards, then lays out once instead of on every frame
     * of the slide. A neighbour that only absorbs the space keeps following
     * the edge, so what stays on screen grows or shrinks with the motion.
     * Applies only when the group can compute the settled size.
     * When it is the only panel changing, it also slides in pixels, so its
     * edge follows the easing curve (see startPixelSlide).
     */
    revealContent?: boolean;
    /** Whether the handle after this panel is available (default: true). */
    resizable?: boolean;
    /** Accessible name for the handle after this panel. */
    resizeLabel?: string;
    /** Panel ID for tracking */
    id?: string;
  }
</script>

<script lang="ts">
  import { onDestroy, onMount, untrack } from "svelte";
  import { holdBackgroundFor } from "$lib/shared/background/shared/state/background-hold.svelte";
  import { flexPresence, growFade } from "$lib/shared/transitions/motion";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import ResizeHandle from "./ResizeHandle.svelte";
  import {
    needsMeasuredBasisHandoff,
    panelFlexStyle,
    resolvePanelFlex,
    settledPanelSizes,
    type PanelFlex,
  } from "./panel-flex";
  // The root's `data-panel-motion` attribute is PANEL_MOTION_ATTRIBUTE.
  import { PANEL_SETTLE_EVENT } from "./panel-motion";

  interface Props {
    /** Layout direction */
    direction: "horizontal" | "vertical";
    /** Panel definitions */
    panels: PanelDefinition[];
    /** Current sizes as flex values (bindable) */
    sizes?: number[];
    /** Called when sizes change */
    onSizesChange?: (sizes: number[]) => void;
    /** Double-click on the handle after panel `index`; hosts use it to reset. */
    onHandleDoubleClick?: (index: number) => void;
    /** Gap size for handles */
    gap?: number;
    /**
     * Keep the panel contents but remove the split-pane wrappers and handles.
     * Useful when a compact layout presents one panel at a time.
     */
    flattened?: boolean;
    /**
     * While true, a revealContent panel that starts to slide lays its content
     * out at the destination size but stays where it is; the slide runs once
     * this turns false. Lets the owner keep one-off work, such as the first
     * draw of what the panel reveals, out of the slide's frames.
     */
    holdMotion?: boolean;
  }

  let {
    direction,
    panels,
    sizes = $bindable([]),
    onSizesChange,
    onHandleDoubleClick,
    gap = 6,
    flattened = false,
    holdMotion = false,
  }: Props = $props();

  let containerRef = $state<HTMLDivElement | null>(null);
  let dragStartSizes = $state<number[]>([]);
  let activeDragIndex = $state<number | null>(null);
  let manuallySizedPanels = $state<Set<string | number>>(new Set());
  let handleValues = $state<number[]>([]);
  const hasResizeHandles = $derived(
    !flattened && panels.slice(0, -1).some((panel) => panel.resizable !== false)
  );

  // Initialize sizes from panel defaults - only when panel count changes
  // Use untrack to prevent reactive cascade when sizes is bindable
  $effect(() => {
    const panelCount = panels.length;
    untrack(() => {
      if (sizes.length !== panelCount) {
        sizes = panels.map((p) => p.defaultSize ?? 1);
      }
    });
  });

  onMount(() => {
    if (!containerRef || !hasResizeHandles) return;

    let scheduledFrame = 0;
    const scheduleRefresh = () => {
      if (scheduledFrame) return;
      scheduledFrame = requestAnimationFrame(() => {
        scheduledFrame = 0;
        refreshHandleValues();
      });
    };
    const resizeObserver = new ResizeObserver(scheduleRefresh);
    const observePanels = () => {
      if (!containerRef) return;
      resizeObserver.disconnect();
      resizeObserver.observe(containerRef);
      for (const panel of containerRef.querySelectorAll(
        ":scope > .panel-wrapper"
      )) {
        resizeObserver.observe(panel);
      }
      scheduleRefresh();
    };
    const panelObserver = new MutationObserver(observePanels);
    panelObserver.observe(containerRef, { childList: true });
    observePanels();

    return () => {
      if (scheduledFrame) cancelAnimationFrame(scheduledFrame);
      panelObserver.disconnect();
      resizeObserver.disconnect();
    };
  });

  $effect(() => {
    void panels;
    void direction;
    void gap;
    if (!hasResizeHandles) return;

    const firstFrame = requestAnimationFrame(refreshHandleValues);
    const settledTimer = setTimeout(refreshHandleValues, DURATION.emphasis);
    return () => {
      cancelAnimationFrame(firstFrame);
      clearTimeout(settledTimer);
    };
  });

  // Handle resize start
  function handleDragStart(index: number) {
    const renderedSizes = containerRef
      ? Array.from(
          containerRef.querySelectorAll<HTMLElement>(":scope > .panel-wrapper")
        ).map((panel) =>
          direction === "horizontal" ? panel.clientWidth : panel.clientHeight
        )
      : [];

    // A preferred panel begins at content height, not at its stored flex
    // ratio. Starting the drag from the rendered pixels prevents the first
    // pointer movement from snapping it back to that stale ratio.
    dragStartSizes =
      renderedSizes.length === panels.length ? renderedSizes : [...sizes];
    sizes = [...dragStartSizes];

    const nextManuallySizedPanels = new Set(manuallySizedPanels);
    for (const panelIndex of [index, index + 1]) {
      if (panels[panelIndex]?.preferredSize) {
        nextManuallySizedPanels.add(panels[panelIndex]?.id ?? panelIndex);
      }
    }
    manuallySizedPanels = nextManuallySizedPanels;
    activeDragIndex = index;
    refreshHandleValues();
  }

  // Handle resize drag
  function handleDrag(index: number, delta: number) {
    if (!containerRef || dragStartSizes.length === 0) return;

    const containerSize =
      direction === "horizontal"
        ? containerRef.clientWidth
        : containerRef.clientHeight;

    // Account for gaps
    const totalGaps = (panels.length - 1) * gap;
    const availableSize = containerSize - totalGaps;

    // Total flex units
    const totalFlex = dragStartSizes.reduce((a, b) => a + b, 0);

    // Convert delta pixels to flex units
    const pixelsPerFlex = availableSize / totalFlex;
    const deltaFlex = delta / pixelsPerFlex;

    // Get constraints
    const panel1 = panels[index];
    const panel2 = panels[index + 1];
    const startSize1 = dragStartSizes[index];
    const startSize2 = dragStartSizes[index + 1];

    if (
      !panel1 ||
      !panel2 ||
      startSize1 === undefined ||
      startSize2 === undefined
    )
      return;

    const minFlex1 = panel1.minSize ? panel1.minSize / pixelsPerFlex : 0.1;
    const minFlex2 = panel2.minSize ? panel2.minSize / pixelsPerFlex : 0.1;
    const maxFlex1 = panel1.maxSize ? panel1.maxSize / pixelsPerFlex : Infinity;
    const maxFlex2 = panel2.maxSize ? panel2.maxSize / pixelsPerFlex : Infinity;

    // Calculate new sizes with constraints
    let newSize1 = startSize1 + deltaFlex;
    let newSize2 = startSize2 - deltaFlex;

    // Apply min constraints
    if (newSize1 < minFlex1) {
      const diff = minFlex1 - newSize1;
      newSize1 = minFlex1;
      newSize2 -= diff;
    }
    if (newSize2 < minFlex2) {
      const diff = minFlex2 - newSize2;
      newSize2 = minFlex2;
      newSize1 -= diff;
    }

    // Apply max constraints
    if (newSize1 > maxFlex1) {
      const diff = newSize1 - maxFlex1;
      newSize1 = maxFlex1;
      newSize2 += diff;
    }
    if (newSize2 > maxFlex2) {
      const diff = newSize2 - maxFlex2;
      newSize2 = maxFlex2;
      newSize1 += diff;
    }

    const newSizes = [...sizes];
    newSizes[index] = Math.max(0.1, newSize1);
    newSizes[index + 1] = Math.max(0.1, newSize2);

    sizes = newSizes;
    const total = newSize1 + newSize2;
    handleValues[index] = total > 0 ? (newSize1 / total) * 100 : 50;
    onSizesChange?.(newSizes);
  }

  // Handle resize end
  function handleDragEnd() {
    dragStartSizes = [];
    activeDragIndex = null;
    requestAnimationFrame(refreshHandleValues);
  }

  function handleKeydown(index: number, event: KeyboardEvent): void {
    const decreaseKey = direction === "horizontal" ? "ArrowLeft" : "ArrowUp";
    const increaseKey = direction === "horizontal" ? "ArrowRight" : "ArrowDown";
    if (event.key !== decreaseKey && event.key !== increaseKey) return;

    event.preventDefault();
    event.stopPropagation();
    handleDragStart(index);
    const step = event.shiftKey ? 48 : 16;
    handleDrag(index, event.key === decreaseKey ? -step : step);
    handleDragEnd();
  }

  function measureHandleValue(index: number): number {
    const renderedPanels = containerRef
      ? Array.from(
          containerRef.querySelectorAll<HTMLElement>(":scope > .panel-wrapper")
        )
      : [];
    const leadingPanel = renderedPanels[index];
    const trailingPanel = renderedPanels[index + 1];
    const leading = leadingPanel
      ? direction === "horizontal"
        ? leadingPanel.clientWidth
        : leadingPanel.clientHeight
      : (sizes[index] ?? 1);
    const trailing = trailingPanel
      ? direction === "horizontal"
        ? trailingPanel.clientWidth
        : trailingPanel.clientHeight
      : (sizes[index + 1] ?? 1);
    return (leading / (leading + trailing)) * 100;
  }

  function refreshHandleValues(): void {
    if (!hasResizeHandles) return;
    handleValues = panels
      .slice(0, -1)
      .map((_, index) => measureHandleValue(index));
  }

  // A keyed panel keeps its captured definition while its outro runs. Reading
  // `panels[index]` here used the next array instead, so a departing fixed or
  // content-sized dock briefly became `flex: 1` and starved its neighbour.
  function getPanelFlex(panel: PanelDefinition, index: number): PanelFlex {
    return resolvePanelFlex(panel, {
      flexShare: sizes[index],
      manuallySized: manuallySizedPanels.has(panel.id ?? index),
    });
  }

  // Get flex style for a panel
  function getFlexStyle(panel: PanelDefinition, index: number): string {
    return panelFlexStyle(getPanelFlex(panel, index));
  }

  /**
   * A held dock that swaps one allocation for another is the one layout change
   * CSS cannot carry on its own. `flex-basis: 480px -> auto` is a discrete
   * change, so the whole group re-lays out in a single frame: the stage takes
   * the reclaimed space instantly and every panel below the dock teleports.
   *
   * When both endpoints are held -- grow and shrink are both 0 -- the basis
   * alone decides the size, so both ends can be measured in pixels and handed
   * back to the transition already declared on `.panel-wrapper`. Anything with
   * a live flex share keeps today's behaviour, because there the basis is not
   * the whole story.
   */
  const appliedFlex = new Map<string | number, PanelFlex>();
  const basisHandoffs = new Map<string | number, () => void>();
  let pendingBasisHandoffs: {
    key: string | number;
    element: HTMLElement;
    from: number;
    basis: string;
  }[] = [];

  function panelWrapperFor(key: string | number): HTMLElement | null {
    if (!containerRef) return null;
    const wrappers = Array.from(
      containerRef.querySelectorAll<HTMLElement>(":scope > .panel-wrapper")
    );
    return (
      wrappers.find(
        (wrapper) => (wrapper.dataset.panelId ?? "") === String(key)
      ) ?? null
    );
  }

  function measurePanel(element: HTMLElement): number {
    const rect = element.getBoundingClientRect();
    return direction === "horizontal" ? rect.width : rect.height;
  }

  function prefersReducedMotion(): boolean {
    return (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
    );
  }

  $effect.pre(() => {
    void panels;
    untrack(() => {
      pendingBasisHandoffs = [];
      if (!containerRef || prefersReducedMotion()) return;

      panels.forEach((panel, index) => {
        const key = panel.id ?? index;
        const previous = appliedFlex.get(key);
        if (!previous) return;

        const next = getPanelFlex(panel, index);
        if (!needsMeasuredBasisHandoff(previous, next)) return;

        const element = panelWrapperFor(key);
        if (!element) return;

        pendingBasisHandoffs.push({
          key,
          element,
          from: measurePanel(element),
          basis: next.basis,
        });
      });
    });
  });

  $effect(() => {
    void panels;
    void sizes;
    void manuallySizedPanels;

    untrack(() => {
      panels.forEach((panel, index) => {
        appliedFlex.set(panel.id ?? index, getPanelFlex(panel, index));
      });

      const handoffs = pendingBasisHandoffs;
      pendingBasisHandoffs = [];
      for (const handoff of handoffs) startBasisHandoff(handoff);

      const slides = pendingPixelSlides;
      pendingPixelSlides = [];
      for (const slide of slides) startPixelSlide(slide);
    });
  });

  function startBasisHandoff(handoff: {
    key: string | number;
    element: HTMLElement;
    from: number;
    basis: string;
  }): void {
    basisHandoffs.get(handoff.key)?.();

    const { element, from, basis, key } = handoff;
    // The declarative endpoint is already on the element, so this reads the
    // destination geometry. Nothing has painted yet, which is what lets the
    // pinned start below stand in for the frame the browser would have skipped.
    const to = measurePanel(element);
    if (Math.abs(to - from) < 0.5) return;

    element.style.transition = "none";
    element.style.flexBasis = `${from}px`;
    void element.offsetWidth;
    element.style.transition = "";
    element.style.flexBasis = `${to}px`;

    const settle = () => {
      element.removeEventListener("transitionend", onTransitionEnd);
      clearTimeout(safety);
      basisHandoffs.delete(key);
      // Hand the basis back so a content-sized dock resumes following its
      // contents instead of freezing at the size it happened to land on.
      element.style.flexBasis = basis;
    };
    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target !== element || event.propertyName !== "flex-basis")
        return;
      settle();
    };
    const safety = setTimeout(settle, DURATION.emphasis + DURATION.instant);

    element.addEventListener("transitionend", onTransitionEnd);
    basisHandoffs.set(key, settle);
  }

  /**
   * A revealContent panel trading a held size for a share of the track (or
   * back) changes flex-grow, and a panel's size is not proportional to its
   * grow factor. Opening the Create workspace beside a tool panel on 4, grow
   * 0 -> 5 covered a third of the distance in the first twentieth of the
   * curve and crawled through the rest. Its settled size is known, so the
   * panel slides in pixels instead -- pinned at its current size, eased to
   * the settled one -- and takes its declared flex back once it lands, which
   * changes nothing on screen. The other panels keep their shares and fill
   * the rest of the track as it moves.
   */
  interface PixelSlide {
    key: string | number;
    element: HTMLElement;
    from: number;
    to: number;
    flex: PanelFlex;
  }
  const pixelSlides = new Map<string | number, () => void>();
  const heldSlides = new Map<string | number, () => void>();
  let pendingPixelSlides: PixelSlide[] = [];

  function setPanelFlex(element: HTMLElement, flex: PanelFlex): void {
    element.style.flexGrow = String(flex.grow);
    element.style.flexShrink = String(flex.shrink);
    element.style.flexBasis = flex.basis;
  }

  function startPixelSlide(slide: PixelSlide): void {
    pixelSlides.get(slide.key)?.();

    const { element, from, to, flex, key } = slide;
    element.style.transition = "none";
    setPanelFlex(element, { grow: 0, shrink: 0, basis: `${from}px` });
    void element.offsetWidth;
    element.style.transition = "";

    let safety: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      heldSlides.delete(key);
      element.style.flexBasis = `${to}px`;
      safety = setTimeout(settle, DURATION.emphasis + DURATION.instant);
      armMotionSafety();
    };

    const settle = () => {
      element.removeEventListener("transitionend", onTransitionEnd);
      clearTimeout(safety);
      heldSlides.delete(key);
      pixelSlides.delete(key);
      // The declared flex resolves to the size the slide ended on; without
      // the transition it is a swap, not another trip.
      element.style.transition = "none";
      setPanelFlex(element, flex);
      void element.offsetWidth;
      element.style.transition = "";
    };
    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target !== element || event.propertyName !== "flex-basis")
        return;
      settle();
    };

    element.addEventListener("transitionend", onTransitionEnd);
    pixelSlides.set(key, settle);
    if (untrack(() => holdMotion)) heldSlides.set(key, run);
    else run();
  }

  $effect(() => {
    if (holdMotion) return;
    untrack(() => {
      for (const run of Array.from(heldSlides.values())) run();
    });
  });

  /**
   * Motion: from the moment a panel's flex allocation changes until its track
   * comes to rest, the root carries `data-panel-motion` so per-resize
   * measurers can wait, and a `revealContent` panel whose allocation changed
   * holds its content at the larger of its start and settled sizes so that
   * content lays out once.
   */
  let containerMainSize = $state(0);
  let inMotion = $state(false);
  /** Held content size for each revealContent panel in motion. */
  let revealingPanels = $state<ReadonlyMap<string | number, number>>(new Map());
  let motionSafety: ReturnType<typeof setTimeout> | null = null;
  const revealsContent = $derived(panels.some((panel) => panel.revealContent));

  /**
   * The animated backdrop repaints a viewport-sized canvas every frame, and
   * while the track moves those frames belong to the slide. It holds its last
   * frame from the moment the allocation changes until the track settles, plus
   * a short tail so the landing frame and the settle swap are covered too. The
   * hold is capped, so a motion that never reports settling can't keep the
   * backdrop still.
   */
  const BACKDROP_HOLD_CAP_MS = 1000;
  const BACKDROP_SETTLE_TAIL_MS = 60;
  const groupId = $props.id();
  const backdropHoldKey = `panel-group-motion:${groupId}`;
  $effect(() => {
    if (!inMotion) return;
    untrack(() => holdBackgroundFor(backdropHoldKey, BACKDROP_HOLD_CAP_MS));
    return () => holdBackgroundFor(backdropHoldKey, BACKDROP_SETTLE_TAIL_MS);
  });

  $effect(() => {
    const element = containerRef;
    const axis = direction;
    if (!element || !revealsContent) return;
    const resizeObserver = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (box)
        containerMainSize = axis === "horizontal" ? box.width : box.height;
    });
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  });

  const settledSizes = $derived.by(() => {
    if (!revealsContent || flattened || containerMainSize <= 0) return null;
    const handleCount = panels
      .slice(0, -1)
      .filter((panel) => panel.resizable !== false).length;
    return settledPanelSizes(
      panels.map((panel, index) => getPanelFlex(panel, index)),
      containerMainSize,
      handleCount * gap
    );
  });

  function flexChanged(previous: PanelFlex, next: PanelFlex): boolean {
    return (
      previous.grow !== next.grow ||
      previous.shrink !== next.shrink ||
      previous.basis !== next.basis
    );
  }

  function armMotionSafety(): void {
    if (motionSafety !== null) clearTimeout(motionSafety);
    // transitionend normally settles first. This covers a change the browser
    // had nothing to interpolate, so the group never stays "moving".
    motionSafety = setTimeout(
      settleMotion,
      DURATION.emphasis + DURATION.normal
    );
  }

  function settleMotion(): void {
    if (motionSafety !== null) clearTimeout(motionSafety);
    motionSafety = null;
    // A held slide has not started; it re-arms the safety when it does.
    if (heldSlides.size > 0) return;
    // After the safety net, a transition whose wrapper left mid-slide never
    // reports its end; start the next motion's count from zero.
    runningTrackTransitions = 0;
    if (!inMotion) return;
    inMotion = false;
    revealingPanels = new Map();
    containerRef?.dispatchEvent(
      new CustomEvent(PANEL_SETTLE_EVENT, { bubbles: true })
    );
  }

  $effect.pre(() => {
    void panels;
    void sizes;
    void manuallySizedPanels;
    untrack(() => {
      if (!containerRef || activeDragIndex !== null || prefersReducedMotion())
        return;

      let changedCount = 0;
      const revealing = new Map<string | number, number>();
      const slides: PixelSlide[] = [];
      panels.forEach((panel, index) => {
        const key = panel.id ?? index;
        const previous = appliedFlex.get(key);
        const next = getPanelFlex(panel, index);
        if (!previous || !flexChanged(previous, next)) return;
        changedCount++;

        const settled = settledSizes?.[index];
        const element = panel.revealContent ? panelWrapperFor(key) : null;
        if (settled === undefined || !element) return;
        const from = measurePanel(element);
        if (Math.abs(settled - from) < 0.5) return;
        // A panel whose own allocation moves holds its content still: growing,
        // it lays out at its end size and is uncovered; shrinking, it keeps
        // its start size and is covered, since laying it out at the end size
        // would crop it before the edge got there. A neighbour that only
        // fills the space is left to follow the edge. Holding it too made
        // Play show the animator at its final size at once, under tools that
        // then slid off it, instead of growing the picture as they folded.
        revealing.set(key, Math.max(settled, from));
        if (!needsMeasuredBasisHandoff(previous, next)) {
          slides.push({ key, element, from, to: settled, flex: next });
        }
      });
      if (changedCount === 0) return;

      // A pixel slide needs the rest of the track to give way around it: one
      // moving panel, and a neighbour with a share to absorb the difference.
      const slide = slides[0];
      pendingPixelSlides =
        changedCount === 1 &&
        slide &&
        panels.some(
          (panel, index) =>
            (panel.id ?? index) !== slide.key &&
            getPanelFlex(panel, index).grow > 0
        )
          ? [slide]
          : [];

      inMotion = true;
      revealingPanels = revealing;
      armMotionSafety();
    });
  });

  function isFlexTrackTransition(event: TransitionEvent): boolean {
    return (
      (event.propertyName === "flex-grow" ||
        event.propertyName === "flex-basis") &&
      event.target instanceof HTMLElement &&
      event.target.parentElement === containerRef
    );
  }

  // Track transitions still running, counted from their own events. Asking
  // each wrapper for its running animations instead flushed style for the
  // whole page at the tail of every slide.
  let runningTrackTransitions = 0;
  let settleCheck: ReturnType<typeof setTimeout> | null = null;

  function handleTrackTransitionRun(event: TransitionEvent): void {
    if (!isFlexTrackTransition(event)) return;
    runningTrackTransitions++;
    if (inMotion) armMotionSafety();
  }

  function handleTrackTransitionDone(event: TransitionEvent): void {
    if (!isFlexTrackTransition(event)) return;
    runningTrackTransitions = Math.max(0, runningTrackTransitions - 1);
    if (!inMotion || runningTrackTransitions > 0 || settleCheck !== null)
      return;
    // A retargeted transition reports its cancel and its replacement's run in
    // the same frame, in either order, so wait for that frame's events to end.
    settleCheck = setTimeout(() => {
      settleCheck = null;
      if (runningTrackTransitions === 0) settleMotion();
    }, 0);
  }

  onDestroy(() => {
    for (const settle of Array.from(basisHandoffs.values())) settle();
    for (const settle of Array.from(pixelSlides.values())) settle();
    if (motionSafety !== null) clearTimeout(motionSafety);
    if (settleCheck !== null) clearTimeout(settleCheck);
  });
</script>

<div
  class="panel-group"
  class:horizontal={direction === "horizontal"}
  class:vertical={direction === "vertical"}
  class:dragging={activeDragIndex !== null}
  class:flattened
  style:--panel-gap="{gap}px"
  data-panel-motion={inMotion ? "" : undefined}
  bind:this={containerRef}
  ontransitionrun={handleTrackTransitionRun}
  ontransitionend={handleTrackTransitionDone}
  ontransitioncancel={handleTrackTransitionDone}
>
  {#each panels as panel, i (panel.id ?? i)}
    {@const heldContentSize = revealingPanels.get(panel.id ?? i)}
    {@const revealing = heldContentSize !== undefined}
    <!-- Panel wrapper with flex sizing -->
    <div
      class="panel-wrapper"
      class:revealing
      style={getFlexStyle(panel, i)}
      style:--panel-content-size={revealing
        ? `${heldContentSize}px`
        : undefined}
      data-panel-id={panel.id}
      data-min-size={panel.minSize}
      data-max-size={panel.maxSize}
      data-manually-sized={manuallySizedPanels.has(panel.id ?? i) || undefined}
      transition:flexPresence={{
        duration: DURATION.emphasis,
        axis: direction === "horizontal" ? "x" : "y",
      }}
    >
      {@render panel.content()}
    </div>

    <!-- Resize handle between panels -->
    {#if !flattened && i < panels.length - 1 && panel.resizable !== false}
      <div
        class="resize-handle-slot"
        class:horizontal={direction === "horizontal"}
        class:vertical={direction === "vertical"}
        transition:growFade={{
          duration: DURATION.fast,
          axis: direction === "horizontal" ? "x" : "y",
        }}
      >
        <ResizeHandle
          direction={direction === "horizontal" ? "horizontal" : "vertical"}
          size={gap}
          onDragStart={() => handleDragStart(i)}
          onDrag={(delta) => handleDrag(i, delta)}
          onDragEnd={handleDragEnd}
          onKeydown={(event) => handleKeydown(i, event)}
          onDoubleClick={onHandleDoubleClick
            ? () => onHandleDoubleClick(i)
            : undefined}
          ariaLabel={panel.resizeLabel ??
            `Resize ${panel.id ?? `panel ${i + 1}`} and ${panels[i + 1]?.id ?? `panel ${i + 2}`}`}
          ariaValueNow={handleValues[i] ?? measureHandleValue(i)}
        />
      </div>
    {/if}
  {/each}
</div>

<style>
  .panel-group {
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .panel-group.horizontal {
    flex-direction: row;
  }

  .panel-group.vertical {
    flex-direction: column;
  }

  .panel-group.flattened,
  .panel-group.flattened .panel-wrapper {
    display: contents;
  }

  .panel-wrapper {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transition:
      flex-grow var(--transition-emphasis),
      flex-basis var(--transition-emphasis);
  }

  .panel-wrapper > :global(*) {
    flex: 1;
    min-width: 0;
    min-height: 0;
  }

  /* A revealContent panel whose allocation is moving: its content holds one
     size (where a growing track ends, where a shrinking one started), so it
     lays out once and the moving edge uncovers or covers it. */
  .panel-group.vertical > .panel-wrapper.revealing > :global(*) {
    flex: none;
    height: var(--panel-content-size);
  }

  .panel-group.horizontal > .panel-wrapper.revealing > :global(*) {
    width: var(--panel-content-size);
  }

  .resize-handle-slot {
    display: flex;
    flex: none;
    min-width: 0;
    min-height: 0;
  }

  .resize-handle-slot.horizontal {
    width: var(--panel-gap);
    height: 100%;
  }

  .resize-handle-slot.vertical {
    width: 100%;
    height: var(--panel-gap);
  }

  .resize-handle-slot > :global(*) {
    flex: 1;
  }

  /* During drag, prevent interactions with panel content */
  .panel-group.dragging {
    user-select: none;
  }

  .panel-group.dragging .panel-wrapper {
    pointer-events: none;
    transition: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .panel-wrapper {
      transition: none;
    }
  }
</style>
