<script lang="ts">
  import { onMount } from "svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { getErrorHandler } from "#lib/shared/application/get-error-handler.js";
  import {
    FLOW_FEST_IMAGE,
    type ImagePoint,
  } from "../flow-fest-path-tracer/_lib/flow-fest-trace";
  import {
    FLOW_FEST_MARKER_GROUPS,
    FLOW_FEST_MARKER_PRESETS,
    cloneFlowFestSiteMarkerDraft,
    createFlowFestSiteMarkerSubmission,
    createSiteMarker,
    emptyFlowFestSiteMarkerDraft,
    getMarkerPreset,
    isTracedShape,
    markerReadiness,
    markerVertices,
    parseStoredFlowFestSiteMarkerDraft,
    toMarkerRecord,
    type FlowFestNarration,
    type FlowFestSiteMarker,
    type FlowFestSiteMarkerDraft,
  } from "./_lib/flow-fest-site-markers";
  import { createNarrationCapture } from "./_lib/narration-capture.svelte";
  import { flyFade } from "#lib/shared/transitions/motion.js";

  type InteractionMode = "place" | "pan";
  type NoticeKind = "quiet" | "success" | "error";

  const STORAGE_KEY = "flow-fest-site-markers-v1";
  /**
   * The window is stored as its top-left corner plus a width. Its HEIGHT comes
   * from the rendered element's aspect ratio, so the viewBox always matches the
   * box it is drawn in. That is not cosmetic: `pointFromEvent` maps a screen
   * position into image space linearly, which is only true when the SVG is not
   * letterboxing to preserve a mismatched ratio. Get it wrong and every marker
   * lands somewhere other than where it was pressed.
   */
  const FULL_VIEW = { x: 0, y: 0, width: FLOW_FEST_IMAGE.width } as const;
  /** Middle Earth sits near image (1224, 794); this frames it and the ground east of it. */
  const MIDDLE_EARTH_VIEW = { x: 940, y: 620, width: 900 } as const;
  const HIT_RADIUS_PIXELS = 14;
  /** Freehand sampling distance, in screen pixels, while a stroke is dragged. */
  const TRACE_SAMPLE_PIXELS = 7;
  /** Below this much pointer travel a press counts as a click, not a drag. */
  const CLICK_SLOP_PIXELS = 4;
  /** Button and key zoom. The wheel steps smaller so a flick is not a jump. */
  const ZOOM_STEP = 1.35;
  const WHEEL_ZOOM_STEP = 1.12;
  /** Ctrl+wheel is what a trackpad pinch sends, so it wants a finer grain. */
  const FINE_ZOOM_STEP = 1.05;
  /** Arrow-key pan, as a fraction of the visible window. */
  const PAN_STEP_FRACTION = 0.15;
  /** Arrow-key nudge for a selected marker, in image pixels (0.5 m each). */
  const NUDGE_IMAGE_PIXELS = 1;
  const NUDGE_IMAGE_PIXELS_LARGE = 10;
  /** A run of nudges inside this gap is one undo step, not forty. */
  const NUDGE_COALESCE_MS = 700;
  /** Padding around a fitted bounding box, as a fraction of its longest side. */
  const FIT_PADDING = 0.15;
  /** Narrowest window a single-marker frame will zoom to, in image pixels. */
  const FRAME_MIN_WIDTH = 90;

  const MODE_OPTIONS = [
    { value: "place", label: "Place", tone: "accent" as const },
    { value: "pan", label: "Pan", tone: "accent" as const },
  ];

  /** The cheatsheet is this list, so there is nothing to keep in sync by hand. */
  const HOTKEY_GROUPS: readonly {
    title: string;
    rows: readonly { keys: readonly string[]; does: string }[];
  }[] = [
    {
      title: "Move the map",
      rows: [
        { keys: ["Space", "drag"], does: "Hand tool, any time the pointer is over the map" },
        { keys: ["Middle-drag"], does: "The same, without the keyboard" },
        { keys: ["Scroll"], does: "Zoom at the cursor" },
        { keys: ["Ctrl", "scroll"], does: "Fine zoom, and a trackpad pinch" },
        { keys: ["Shift", "scroll"], does: "Pan sideways" },
        { keys: ["Arrows"], does: "Pan; Shift goes four times as far" },
        { keys: ["+"], does: "Zoom in" },
        { keys: ["−"], does: "Zoom out" },
        { keys: ["H"], does: "Toggle the hand tool and stay there" },
      ],
    },
    {
      title: "Frame something",
      rows: [
        { keys: ["1"], does: "Whole site" },
        { keys: ["2"], does: "Middle Earth" },
        { keys: ["3"], does: "Fit to everything placed" },
        { keys: ["Z"], does: "Zoom to the selected marker" },
      ],
    },
    {
      title: "Choose what to place",
      rows: [
        { keys: ["["], does: "Previous preset" },
        { keys: ["]"], does: "Next preset" },
        { keys: ["Shift", "["], does: "Previous group" },
        { keys: ["Shift", "]"], does: "Next group" },
      ],
    },
    {
      title: "Draw",
      rows: [
        { keys: ["Click"], does: "Place, or add a vertex while tracing" },
        { keys: ["Drag"], does: "Freehand a traced shape" },
        { keys: ["Shift", "click"], does: "Lock that segment to 45°" },
        { keys: ["Enter"], does: "Finish; reopens a selected traced shape" },
        { keys: ["Double-click"], does: "Finish the shape" },
        { keys: ["Backspace"], does: "Take back the last vertex" },
        { keys: ["Escape"], does: "Drop the shape in progress" },
      ],
    },
    {
      title: "Edit what is placed",
      rows: [
        { keys: ["N"], does: "Next marker, and frame it" },
        { keys: ["Shift", "N"], does: "Previous marker" },
        { keys: ["Arrows"], does: "Nudge 0.5 m; Shift moves 5 m" },
        { keys: ["Delete"], does: "Delete the selected marker" },
        { keys: ["Escape"], does: "Deselect" },
      ],
    },
    {
      title: "Everything else",
      rows: [
        { keys: ["Ctrl", "Z"], does: "Undo" },
        { keys: ["Ctrl", "Shift", "Z"], does: "Redo" },
        { keys: ["Ctrl", "S"], does: "Save to the repo" },
        { keys: ["M"], does: "Start or stop narrating" },
        { keys: ["?"], does: "This sheet" },
      ],
    },
  ];

  let draft = $state<FlowFestSiteMarkerDraft>(emptyFlowFestSiteMarkerDraft());
  let activePresetId = $state<string>("fire-circle");
  let selectedMarkerId = $state<string | null>(null);
  let interactionMode = $state<InteractionMode>("place");
  let view = $state({ ...MIDDLE_EARTH_VIEW });
  let svgElement = $state<SVGSVGElement | null>(null);
  let mapWidth = $state(1);
  let mapHeight = $state(1);
  let notice = $state(
    "Pick what you are placing, then press on the map and drag the way it faces."
  );
  let noticeKind = $state<NoticeKind>("quiet");
  let saving = $state(false);

  let pointerId: number | null = null;
  let draggingHandleFor: string | null = null;
  /** Reactive because the map's cursor switches to grabbing while a drag runs. */
  let panOrigin = $state<{
    x: number;
    y: number;
    viewX: number;
    viewY: number;
  } | null>(null);
  let history: FlowFestSiteMarkerDraft[] = [];
  let future: FlowFestSiteMarkerDraft[] = [];
  /** The traced marker accepting vertices, or null when nothing is open. */
  let tracingId = $state<string | null>(null);
  let strokeOrigin: { x: number; y: number } | null = null;
  /**
   * Held Space is the hand tool every map has: it borrows pan for as long as
   * the key is down and hands the tool back on release, without disturbing the
   * mode the author actually chose in the switch.
   */
  let spaceHeld = $state(false);
  /**
   * Space belongs to the map whenever the pointer is over it, even while a
   * rail button still holds focus. Pick a preset, move to the map, hold Space,
   * pan, then click where the thing goes — that is one gesture, and demanding
   * a throwaway click on the map to shake the button loose first was the bug.
   */
  let pointerOverMap = $state(false);
  let showHotkeys = $state(false);
  let lastNudgeAt = 0;

  const narration = createNarrationCapture();
  let recordingElapsed = $state(0);

  const viewHeight = $derived((view.width * mapHeight) / Math.max(mapWidth, 1));
  /** Screen pixels to viewBox units, so strokes and dots keep a constant size. */
  const pixelScale = $derived(view.width / Math.max(mapWidth, 1));
  const activePreset = $derived(getMarkerPreset(activePresetId));
  const selectedMarker = $derived(
    draft.markers.find((marker) => marker.id === selectedMarkerId) ?? null
  );
  /**
   * The two ways a marker can be unfinished need different instructions: a
   * facing marker is waiting on a drag, a traced one is waiting on more points.
   * One combined "needs a direction" line sends the author to the wrong gesture.
   */
  const unfinishedDirectionCount = $derived(
    draft.markers.filter(
      (marker) => !isTracedShape(marker.shape) && !markerReadiness(marker)
    ).length
  );
  const unfinishedTraceCount = $derived(
    draft.markers.filter(
      (marker) => isTracedShape(marker.shape) && !markerReadiness(marker)
    ).length
  );
  const presetsByGroup = $derived(
    FLOW_FEST_MARKER_GROUPS.map((group) => ({
      ...group,
      presets: FLOW_FEST_MARKER_PRESETS.filter(
        (preset) => preset.group === group.id
      ),
    }))
  );
  const tracingMarker = $derived(
    draft.markers.find((marker) => marker.id === tracingId) ?? null
  );
  /** What the map is actually doing right now, mode switch or held Space. */
  const effectiveMode = $derived<InteractionMode>(
    spaceHeld ? "pan" : interactionMode
  );
  const flatPresets = $derived(
    presetsByGroup.flatMap((group) => group.presets)
  );

  onMount(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = parseStoredFlowFestSiteMarkerDraft(stored);
      if (parsed) {
        draft = parsed;
        report(
          `Restored ${parsed.markers.length} marker${parsed.markers.length === 1 ? "" : "s"} from this browser.`,
          "quiet"
        );
      }
    }
    return () => narration.dispose();
  });

  /**
   * The transcript lives in the capture owner while it is being spoken and in
   * the draft once it exists, so a reload or a save carries the words with the
   * strokes they describe.
   */
  $effect(() => {
    if (!narration.recording) return;
    const timer = setInterval(() => {
      recordingElapsed = narration.elapsedMs() ?? 0;
    }, 500);
    return () => clearInterval(timer);
  });

  $effect(() => {
    const startedAt = narration.startedAt;
    const segments = narration.segments;
    const next: FlowFestNarration | null =
      startedAt && segments.length > 0
        ? { startedAt, segments: segments.map((segment) => ({ ...segment })) }
        : null;
    if (next === null && draft.narration === null) return;
    if (next && draft.narration?.segments.length === next.segments.length) return;
    draft.narration = next;
    persist();
  });

  function report(message: string, kind: NoticeKind): void {
    notice = message;
    noticeKind = kind;
  }

  function reportFailure(message: string, cause: unknown, action: string): void {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    report(message, "error");
    getErrorHandler().showUserError({
      message,
      technicalDetails: error.message,
      error,
      severity: "error",
      context: {
        module: "flow-fest-site-markers",
        tab: "terrain-authoring",
        action,
      },
    });
  }

  function persist(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
    } catch (cause) {
      reportFailure(
        "This browser refused to keep a local draft. Save to disk before you close the tab.",
        cause,
        "persist"
      );
    }
  }

  function remember(): void {
    history = [...history.slice(-99), cloneFlowFestSiteMarkerDraft(draft)];
    future = [];
  }

  /**
   * While a shape is being traced, undo means "take back that last point" —
   * which is what a hand expects mid-stroke. Only once the trace is finished
   * does undo start walking whole edits.
   */
  function undo(): void {
    const tracing = tracingMarker;
    if (tracing && tracing.points.length > 0) {
      draft.markers = draft.markers.map((marker) =>
        marker.id === tracing.id
          ? { ...marker, points: marker.points.slice(0, -1), closed: false }
          : marker
      );
      persist();
      report("Took back the last point.", "quiet");
      return;
    }
    if (tracing) {
      discardMarker(tracing.id);
      tracingId = null;
      report("Took back the start of that shape.", "quiet");
      return;
    }

    const previous = history.pop();
    if (!previous) {
      report("Nothing to undo.", "quiet");
      return;
    }
    future = [...future.slice(-99), cloneFlowFestSiteMarkerDraft(draft)];
    draft = previous;
    persist();
    report("Undid the last change.", "quiet");
  }

  function redo(): void {
    const next = future.pop();
    if (!next) {
      report("Nothing to redo.", "quiet");
      return;
    }
    history = [...history.slice(-99), cloneFlowFestSiteMarkerDraft(draft)];
    draft = next;
    persist();
    report("Redid the last change.", "quiet");
  }

  /** Removes a marker without touching history; undo calls this mid-trace. */
  function discardMarker(id: string): void {
    draft.markers = draft.markers.filter((marker) => marker.id !== id);
    if (selectedMarkerId === id) selectedMarkerId = null;
    persist();
  }

  function pointFromClient(clientX: number, clientY: number): ImagePoint | null {
    if (!svgElement) return null;
    const bounds = svgElement.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return null;
    return {
      x: view.x + ((clientX - bounds.left) / bounds.width) * view.width,
      y: view.y + ((clientY - bounds.top) / bounds.height) * viewHeight,
    };
  }

  function pointFromEvent(event: PointerEvent): ImagePoint | null {
    return pointFromClient(event.clientX, event.clientY);
  }

  function markerNear(point: ImagePoint): FlowFestSiteMarker | null {
    const reach = HIT_RADIUS_PIXELS * pixelScale;
    let closest: FlowFestSiteMarker | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const marker of draft.markers) {
      const distance = Math.hypot(
        marker.anchor.x - point.x,
        marker.anchor.y - point.y
      );
      if (distance <= reach && distance < closestDistance) {
        closest = marker;
        closestDistance = distance;
      }
    }
    return closest;
  }

  /**
   * Capture keeps the drag alive when the pointer leaves the map, which matters
   * when a circle's radius runs past the edge. It throws for a pointer the
   * element never owned, and losing capture is not a reason to lose the drag.
   */
  function capturePointer(event: PointerEvent, capture: boolean): void {
    const target = event.currentTarget as Element | null;
    if (!target) return;
    try {
      if (capture) target.setPointerCapture(event.pointerId);
      else target.releasePointerCapture(event.pointerId);
    } catch {
      /* The drag continues on the document-level move and up handlers. */
    }
  }

  function handlePointerDown(event: PointerEvent): void {
    const point = pointFromEvent(event);
    if (!point) return;
    capturePointer(event, true);
    pointerId = event.pointerId;

    /**
     * Touching the map hands the keyboard back to the map. Without this, a
     * preset button clicked a second ago still holds focus, and Space would
     * press it again instead of picking up the hand tool.
     */
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused !== document.body) {
      focused.blur();
    }

    /**
     * Middle-drag pans from any mode without touching the keyboard, which is
     * how every map behaves and what a mouse-only hand reaches for first.
     */
    const middleButton = event.button === 1;
    if (effectiveMode === "pan" || middleButton) {
      if (middleButton) event.preventDefault();
      panOrigin = {
        x: event.clientX,
        y: event.clientY,
        viewX: view.x,
        viewY: view.y,
      };
      return;
    }

    strokeOrigin = { x: event.clientX, y: event.clientY };

    const tracing = tracingMarker;
    if (tracing) {
      const reach = HIT_RADIUS_PIXELS * pixelScale;
      const closesTheLoop =
        tracing.shape === "area" &&
        tracing.points.length >= 2 &&
        Math.hypot(point.x - tracing.anchor.x, point.y - tracing.anchor.y) <=
          reach;
      if (closesTheLoop) {
        finishTrace();
        return;
      }
      const previous = markerVertices(tracing).at(-1)!;
      appendVertex(
        tracing.id,
        event.shiftKey ? snapVertex(previous, point) : point
      );
      return;
    }

    const existing = markerNear(point);
    if (existing) {
      selectedMarkerId = existing.id;
      if (isTracedShape(existing.shape)) {
        report(
          `${existing.label}. Use Continue tracing to add more points to it.`,
          "quiet"
        );
        return;
      }
      draggingHandleFor = existing.id;
      report(
        `${existing.label}. Drag to set its direction, or release to leave it.`,
        "quiet"
      );
      return;
    }

    remember();
    const marker = createSiteMarker(
      activePresetId,
      point,
      draft.markers,
      narration.elapsedMs()
    );
    draft.markers = [...draft.markers, marker];
    selectedMarkerId = marker.id;
    if (isTracedShape(marker.shape)) {
      tracingId = marker.id;
      draggingHandleFor = null;
      persist();
      report(
        `Tracing ${marker.label}. Click each corner or drag along it, then press Enter${marker.shape === "area" ? " or click the first point" : ""} to finish.`,
        "success"
      );
      return;
    }
    draggingHandleFor = marker.shape === "point" ? null : marker.id;
    persist();
    report(
      marker.shape === "point"
        ? `Placed ${marker.label}.`
        : `Placed ${marker.label}. Keep dragging to set its ${handleNoun(marker.shape)}.`,
      "success"
    );
  }

  function appendVertex(id: string, point: ImagePoint): void {
    draft.markers = draft.markers.map((marker) =>
      marker.id === id
        ? { ...marker, points: [...marker.points, { ...point }] }
        : marker
    );
  }

  function finishTrace(): void {
    const tracing = tracingMarker;
    tracingId = null;
    strokeOrigin = null;
    if (!tracing) return;
    if (!markerReadiness(tracing)) {
      discardMarker(tracing.id);
      report(
        tracing.shape === "area"
          ? "An area needs at least three points, so that one was dropped."
          : "A path needs at least two points, so that one was dropped.",
        "quiet"
      );
      return;
    }
    draft.markers = draft.markers.map((marker) =>
      marker.id === tracing.id
        ? { ...marker, closed: marker.shape === "area" }
        : marker
    );
    persist();
    report(`Finished ${tracing.label}. ${describe(tracing)}`, "success");
  }

  function continueTrace(id: string): void {
    const marker = draft.markers.find((candidate) => candidate.id === id);
    if (!marker || !isTracedShape(marker.shape)) return;
    remember();
    tracingId = id;
    selectedMarkerId = id;
    draft.markers = draft.markers.map((candidate) =>
      candidate.id === id ? { ...candidate, closed: false } : candidate
    );
    report(`Adding to ${marker.label}. Enter finishes it again.`, "quiet");
  }

  function handlePointerMove(event: PointerEvent): void {
    if (pointerId !== event.pointerId) return;

    if (panOrigin && svgElement) {
      const bounds = svgElement.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) return;
      view.x =
        panOrigin.viewX -
        ((event.clientX - panOrigin.x) / bounds.width) * view.width;
      view.y =
        panOrigin.viewY -
        ((event.clientY - panOrigin.y) / bounds.height) * viewHeight;
      clampView();
      return;
    }

    /**
     * A drag inside an open trace is freehand: sample it by distance so a road
     * traced with the hand keeps its curve without collecting a vertex per
     * pointer event.
     */
    const tracing = tracingMarker;
    if (tracing && strokeOrigin) {
      const travelled = Math.hypot(
        event.clientX - strokeOrigin.x,
        event.clientY - strokeOrigin.y
      );
      if (travelled < CLICK_SLOP_PIXELS) return;
      const point = pointFromEvent(event);
      if (!point) return;
      const last = markerVertices(tracing).at(-1)!;
      if (
        Math.hypot(point.x - last.x, point.y - last.y) <
        TRACE_SAMPLE_PIXELS * pixelScale
      ) {
        return;
      }
      appendVertex(tracing.id, point);
      return;
    }

    if (!draggingHandleFor) return;
    const point = pointFromEvent(event);
    if (!point) return;
    draft.markers = draft.markers.map((marker) =>
      marker.id === draggingHandleFor ? { ...marker, handle: point } : marker
    );
  }

  function finishPointer(event: PointerEvent): void {
    if (pointerId !== event.pointerId) return;
    capturePointer(event, false);
    pointerId = null;
    panOrigin = null;
    strokeOrigin = null;
    if (tracingId) persist();
    if (draggingHandleFor) {
      draggingHandleFor = null;
      persist();
    }
  }

  function isTypingTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    return (
      !!element &&
      (element.tagName === "INPUT" ||
        element.tagName === "TEXTAREA" ||
        element.isContentEditable)
    );
  }

  /**
   * Space, Enter and the arrows belong to whatever control has focus: Space and
   * Enter press a button, the arrows walk a SegmentedControl. The map only gets
   * them once focus is off the rails, which is why the map blurs on press.
   */
  function isControlTarget(target: EventTarget | null): boolean {
    const element = target as HTMLElement | null;
    return !!element?.closest?.(
      "button, a[href], select, summary, [role='radio'], [role='tab'], [role='switch']"
    );
  }

  /**
   * The map's keys live here rather than in the app-wide shortcut manager on
   * purpose. That manager's `global` context already binds bare `f` and `p`,
   * Shift+F/L and Shift+digit for feedback, the prop drawer and theme
   * switching — every one of which would fight a map key — and this is an
   * authoring route whose keys have no business in the user-facing Shortcut
   * Center. The canvas-local model follows `EffectPointSvgCanvas`.
   */
  function handleKeydown(event: KeyboardEvent): void {
    if (isTypingTarget(event.target) || event.defaultPrevented) return;
    const onControl = isControlTarget(event.target);

    if (event.code === "Space") {
      /** Over the map, Space is the hand tool; elsewhere it presses the button. */
      if (onControl && !pointerOverMap) return;
      event.preventDefault();
      if (!event.repeat) spaceHeld = true;
      return;
    }

    const accelerator = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();

    if (accelerator && key === "z" && !event.shiftKey) {
      event.preventDefault();
      undo();
      return;
    }
    if (accelerator && (key === "y" || (key === "z" && event.shiftKey))) {
      event.preventDefault();
      redo();
      return;
    }
    if (accelerator && key === "s") {
      event.preventDefault();
      void saveMarkers();
      return;
    }
    if (accelerator) return;

    if (event.key === "Enter") {
      if (onControl) return;
      event.preventDefault();
      if (tracingId) finishTrace();
      else if (selectedMarker && isTracedShape(selectedMarker.shape)) {
        continueTrace(selectedMarker.id);
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      if (showHotkeys) showHotkeys = false;
      else if (tracingId) cancelTrace();
      else if (selectedMarkerId) selectedMarkerId = null;
      return;
    }

    if (event.key.startsWith("Arrow")) {
      /** Tab stays focus navigation; N cycles markers. See `isControlTarget`. */
      if (onControl) return;
      event.preventDefault();
      const stepX = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      const stepY = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
      /**
       * Arrows serve the selection when there is one and the window when there
       * is not. That split is what every editor does and it never needs a mode.
       */
      if (selectedMarker && !tracingId) {
        const distance = event.shiftKey
          ? NUDGE_IMAGE_PIXELS_LARGE
          : NUDGE_IMAGE_PIXELS;
        nudgeSelected(stepX * distance, stepY * distance);
      } else {
        panBy(stepX * (event.shiftKey ? 4 : 1), stepY * (event.shiftKey ? 4 : 1));
      }
      return;
    }

    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      if (tracingId) undo();
      else if (selectedMarkerId) deleteMarker(selectedMarkerId);
      return;
    }

    /**
     * By code, not by key: Shift+[ types `{`, so reading `event.key` would make
     * the group shortcut unreachable on a US layout.
     */
    if (event.code === "BracketLeft" || event.code === "BracketRight") {
      event.preventDefault();
      const delta = event.code === "BracketRight" ? 1 : -1;
      if (event.shiftKey) stepPresetGroup(delta);
      else stepPreset(delta);
      return;
    }

    if (event.key === "?") {
      event.preventDefault();
      showHotkeys = !showHotkeys;
      return;
    }

    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoom(1 / ZOOM_STEP);
      return;
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      zoom(ZOOM_STEP);
      return;
    }

    switch (key) {
      case "1":
        event.preventDefault();
        view = { ...FULL_VIEW };
        report("Whole site.", "quiet");
        return;
      case "2":
        event.preventDefault();
        view = { ...MIDDLE_EARTH_VIEW };
        report("Middle Earth.", "quiet");
        return;
      case "3":
        event.preventDefault();
        fitToMarkers();
        return;
      case "z":
        event.preventDefault();
        if (selectedMarker) frameMarker(selectedMarker);
        else report("Select something first, then Z frames it.", "quiet");
        return;
      case "h":
        event.preventDefault();
        interactionMode = interactionMode === "pan" ? "place" : "pan";
        report(
          interactionMode === "pan"
            ? "Pan tool. Press H again for Place, or just hold Space."
            : "Place tool.",
          "quiet"
        );
        return;
      case "n":
        event.preventDefault();
        cycleSelection(event.shiftKey ? -1 : 1);
        return;
      case "m":
        event.preventDefault();
        if (narration.recording) narration.stop();
        else narration.start();
        return;
    }
  }

  function handleKeyup(event: KeyboardEvent): void {
    if (event.code === "Space") spaceHeld = false;
  }

  /** A blurred window never delivers the keyup, so the hand tool would stick. */
  function releaseHeldKeys(): void {
    spaceHeld = false;
  }

  function handleNoun(shape: FlowFestSiteMarker["shape"]): string {
    if (shape === "circle") return "radius";
    if (shape === "run") return "run";
    return "facing";
  }

  function clampView(): void {
    view.width = Math.min(Math.max(view.width, 120), FLOW_FEST_IMAGE.width);
    /** A window taller than the picture just shows the void; keep it inside. */
    if (viewHeight > FLOW_FEST_IMAGE.height) {
      view.width =
        (FLOW_FEST_IMAGE.height * Math.max(mapWidth, 1)) / Math.max(mapHeight, 1);
    }
    view.x = Math.min(Math.max(view.x, 0), FLOW_FEST_IMAGE.width - view.width);
    view.y = Math.min(
      Math.max(view.y, 0),
      Math.max(FLOW_FEST_IMAGE.height - viewHeight, 0)
    );
  }

  function zoom(factor: number): void {
    const centreX = view.x + view.width / 2;
    const centreY = view.y + viewHeight / 2;
    view.width *= factor;
    view.x = centreX - view.width / 2;
    clampView();
    view.y = centreY - viewHeight / 2;
    clampView();
  }

  /**
   * Zoom toward a screen position rather than the window centre. Every map
   * works this way: the ground under the cursor is what you are aiming at, so
   * it must stay under the cursor while the scale changes. Centre-zoom makes
   * the target slide away and forces a corrective pan after every step.
   */
  function zoomAt(factor: number, clientX: number, clientY: number): void {
    if (!svgElement) {
      zoom(factor);
      return;
    }
    const bounds = svgElement.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;
    const anchor = pointFromClient(clientX, clientY);
    if (!anchor) return;
    const fractionX = (clientX - bounds.left) / bounds.width;
    const fractionY = (clientY - bounds.top) / bounds.height;
    view.width *= factor;
    clampView();
    view.x = anchor.x - fractionX * view.width;
    view.y = anchor.y - fractionY * viewHeight;
    clampView();
  }

  function handleWheel(event: WheelEvent): void {
    event.preventDefault();
    /** Shift+wheel is the standard sideways scroll; keep it a pan, not a zoom. */
    if (event.shiftKey && !event.ctrlKey && !event.metaKey) {
      panBy(event.deltaY > 0 ? 1 : -1, 0);
      return;
    }
    const step =
      event.ctrlKey || event.metaKey ? FINE_ZOOM_STEP : WHEEL_ZOOM_STEP;
    zoomAt(event.deltaY > 0 ? step : 1 / step, event.clientX, event.clientY);
  }

  function panBy(stepsX: number, stepsY: number): void {
    view.x += stepsX * view.width * PAN_STEP_FRACTION;
    view.y += stepsY * viewHeight * PAN_STEP_FRACTION;
    clampView();
  }

  /** Centres a window of `width` image pixels on a point, then clamps it. */
  function showWindow(centre: ImagePoint, width: number): void {
    view.width = Math.min(Math.max(width, 120), FLOW_FEST_IMAGE.width);
    clampView();
    view.x = centre.x - view.width / 2;
    view.y = centre.y - viewHeight / 2;
    clampView();
  }

  function boundsOf(points: readonly ImagePoint[]): {
    centre: ImagePoint;
    width: number;
  } | null {
    if (points.length === 0) return null;
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const point of points) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
    const spanX = maxX - minX;
    const spanY = maxY - minY;
    /**
     * The window's height follows its width through the map's aspect ratio, so
     * a tall box has to be fitted by the width that produces enough height.
     */
    const aspect = Math.max(mapWidth, 1) / Math.max(mapHeight, 1);
    const width = Math.max(spanX, spanY * aspect) * (1 + FIT_PADDING * 2);
    return { centre: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 }, width };
  }

  function markerPoints(marker: FlowFestSiteMarker): ImagePoint[] {
    return marker.handle
      ? [...markerVertices(marker), marker.handle]
      : markerVertices(marker);
  }

  function fitToMarkers(): void {
    const fitted = boundsOf(draft.markers.flatMap(markerPoints));
    if (!fitted) {
      report("Nothing placed yet, so there is nothing to fit to.", "quiet");
      return;
    }
    showWindow(fitted.centre, fitted.width);
    report("Framed everything placed.", "quiet");
  }

  function frameMarker(marker: FlowFestSiteMarker): void {
    selectedMarkerId = marker.id;
    const fitted = boundsOf(markerPoints(marker));
    if (!fitted) return;
    showWindow(fitted.centre, Math.max(fitted.width, FRAME_MIN_WIDTH));
  }

  function stepPreset(delta: number): void {
    const list = flatPresets;
    if (list.length === 0) return;
    const current = list.findIndex((preset) => preset.id === activePresetId);
    const next = list[(current + delta + list.length) % list.length]!;
    activePresetId = next.id;
    report(`${next.label}. ${next.instruction}`, "quiet");
  }

  function stepPresetGroup(delta: number): void {
    const groups = presetsByGroup.filter((group) => group.presets.length > 0);
    if (groups.length === 0) return;
    const current = Math.max(
      0,
      groups.findIndex((group) =>
        group.presets.some((preset) => preset.id === activePresetId)
      )
    );
    const next = groups[(current + delta + groups.length) % groups.length]!;
    const preset = next.presets[0]!;
    activePresetId = preset.id;
    report(`${next.label} — ${preset.label}. ${preset.instruction}`, "quiet");
  }

  function cycleSelection(delta: number): void {
    if (draft.markers.length === 0) {
      report("Nothing placed yet.", "quiet");
      return;
    }
    const current = draft.markers.findIndex(
      (marker) => marker.id === selectedMarkerId
    );
    const index =
      current < 0
        ? delta > 0
          ? 0
          : draft.markers.length - 1
        : (current + delta + draft.markers.length) % draft.markers.length;
    const marker = draft.markers[index]!;
    frameMarker(marker);
    report(`${marker.label}. ${describe(marker)}`, "quiet");
  }

  /**
   * Nudging moves the whole marker — every vertex and its handle — because a
   * shape whose first point drifts away from the rest is not what "move it a
   * bit left" means. Runs of arrow presses collapse into one undo step.
   */
  function nudgeSelected(deltaX: number, deltaY: number): void {
    const marker = selectedMarker;
    if (!marker) return;
    const now = Date.now();
    if (now - lastNudgeAt > NUDGE_COALESCE_MS) remember();
    lastNudgeAt = now;
    const shift = (point: ImagePoint): ImagePoint => ({
      x: point.x + deltaX,
      y: point.y + deltaY,
    });
    draft.markers = draft.markers.map((candidate) =>
      candidate.id === marker.id
        ? {
            ...candidate,
            anchor: shift(candidate.anchor),
            handle: candidate.handle ? shift(candidate.handle) : null,
            points: candidate.points.map(shift),
          }
        : candidate
    );
    persist();
  }

  /**
   * Holding Shift while placing the next vertex locks the segment to 45-degree
   * increments. Roads and tent rows run straight far more often than not.
   */
  function snapVertex(from: ImagePoint, to: ImagePoint): ImagePoint {
    const deltaX = to.x - from.x;
    const deltaY = to.y - from.y;
    const distance = Math.hypot(deltaX, deltaY);
    if (distance < 1e-6) return to;
    const increment = Math.PI / 4;
    const angle = Math.round(Math.atan2(deltaY, deltaX) / increment) * increment;
    return {
      x: from.x + Math.cos(angle) * distance,
      y: from.y + Math.sin(angle) * distance,
    };
  }

  function cancelTrace(): void {
    const tracing = tracingMarker;
    tracingId = null;
    strokeOrigin = null;
    if (!tracing) return;
    discardMarker(tracing.id);
    report(`Dropped ${tracing.label}.`, "quiet");
  }

  function renameSelected(value: string): void {
    if (!selectedMarkerId) return;
    draft.markers = draft.markers.map((marker) =>
      marker.id === selectedMarkerId
        ? { ...marker, label: value.slice(0, 80) }
        : marker
    );
    persist();
  }

  function annotateSelected(value: string): void {
    if (!selectedMarkerId) return;
    draft.markers = draft.markers.map((marker) =>
      marker.id === selectedMarkerId
        ? { ...marker, note: value.slice(0, 500) }
        : marker
    );
    persist();
  }

  function deleteMarker(id: string): void {
    remember();
    const removed = draft.markers.find((marker) => marker.id === id);
    draft.markers = draft.markers.filter((marker) => marker.id !== id);
    if (selectedMarkerId === id) selectedMarkerId = null;
    persist();
    report(`Removed ${removed?.label ?? "the marker"}.`, "quiet");
  }

  function clearHandle(id: string): void {
    remember();
    draft.markers = draft.markers.map((marker) =>
      marker.id === id ? { ...marker, handle: null } : marker
    );
    persist();
    report("Cleared its direction. Drag from the marker to set a new one.", "quiet");
  }

  async function copyMarkers(): Promise<void> {
    const payload = createFlowFestSiteMarkerSubmission(draft);
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      report(
        `Copied ${payload.markers.length} marker${payload.markers.length === 1 ? "" : "s"} to the clipboard.`,
        "success"
      );
    } catch (cause) {
      reportFailure(
        "The clipboard refused. Use Save to disk instead.",
        cause,
        "copyMarkers"
      );
    }
  }

  async function saveMarkers(): Promise<void> {
    if (draft.markers.length === 0) {
      report("Place at least one marker before saving.", "error");
      return;
    }
    saving = true;
    try {
      const response = await fetch("/test/flow-fest-site-markers/save-markers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(createFlowFestSiteMarkerSubmission(draft)),
      });
      const result = (await response.json()) as {
        ok: boolean;
        path?: string;
        markerCount?: number;
        error?: string;
      };
      if (!response.ok || !result.ok) {
        report(result.error ?? "The save was refused.", "error");
        return;
      }
      report(
        `Saved ${result.markerCount} marker${result.markerCount === 1 ? "" : "s"} to ${result.path}.`,
        "success"
      );
    } catch (cause) {
      reportFailure(
        "The markers could not be written to the Flow Fest spec folder.",
        cause,
        "saveMarkers"
      );
    } finally {
      saving = false;
    }
  }

  function describe(marker: FlowFestSiteMarker): string {
    const record = toMarkerRecord(marker);
    const parts: string[] = [
      `${record.position.x.toFixed(1)}, ${record.position.z.toFixed(1)}`,
    ];
    if (record.facingDegrees !== null) {
      parts.push(`${record.facingDegrees.toFixed(0)}° ${compass(record.facingDegrees)}`);
    }
    if (record.radiusMeters !== null) parts.push(`r ${record.radiusMeters} m`);
    if (record.runLengthMeters !== null)
      parts.push(`${record.runLengthMeters} m long`);
    if (record.vertices !== null) parts.push(`${record.vertices.length} pts`);
    if (record.areaSquareMeters !== null)
      parts.push(formatArea(record.areaSquareMeters));
    if (record.pathLengthMeters !== null)
      parts.push(`${Math.round(record.pathLengthMeters)} m long`);
    return parts.join(" · ");
  }

  /** Hectares once a field stops being legible in square metres. */
  function formatArea(squareMeters: number): string {
    return squareMeters >= 10_000
      ? `${(squareMeters / 10_000).toFixed(2)} ha`
      : `${Math.round(squareMeters)} m²`;
  }

  function pointsAttribute(points: readonly ImagePoint[]): string {
    return points.map((point) => `${point.x},${point.y}`).join(" ");
  }

  function formatElapsed(milliseconds: number): string {
    const total = Math.floor(milliseconds / 1000);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
  }

  function compass(degrees: number): string {
    const names = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return names[Math.round(degrees / 45) % 8]!;
  }

  function arrowTip(marker: FlowFestSiteMarker): ImagePoint | null {
    if (!marker.handle) return null;
    return marker.handle;
  }
</script>

<svelte:head>
  <title>Flow Fest site markers</title>
</svelte:head>

<svelte:window
  onkeydown={handleKeydown}
  onkeyup={handleKeyup}
  onblur={releaseHeldKeys}
/>

<main class="marker-page">
  <header class="page-head">
    <div>
      <h1>Flow Fest site markers</h1>
      <p class="lede">
        Place what is actually there, trace what has a shape, and say which way
        it faces. Turn on Narrate and talk while you draw: the words are stamped
        against the same clock as the strokes, so what you say lands next to the
        thing you were pointing at. Everything saves in world metres on the
        registered orthophoto, in the same frame as the road traces.
      </p>
    </div>
    <div class="head-actions">
      <div class="mode-switch">
        <SegmentedControl
          options={MODE_OPTIONS}
          value={effectiveMode}
          onchange={(next) => (interactionMode = next as InteractionMode)}
          ariaLabel="Map interaction"
          size="sm"
        />
      </div>
      <PanelButton variant="secondary" onclick={() => zoom(1 / ZOOM_STEP)}>
        Zoom in
      </PanelButton>
      <PanelButton variant="secondary" onclick={() => zoom(ZOOM_STEP)}>
        Zoom out
      </PanelButton>
      <PanelButton
        variant="secondary"
        onclick={() => {
          view = { ...MIDDLE_EARTH_VIEW };
        }}
      >
        Middle Earth
      </PanelButton>
      <PanelButton
        variant="secondary"
        onclick={() => {
          view = { ...FULL_VIEW };
        }}
      >
        Whole site
      </PanelButton>
      <PanelButton variant="secondary" onclick={fitToMarkers}>
        Fit to placed
      </PanelButton>
      <PanelButton
        variant={narration.recording ? "primary" : "secondary"}
        onclick={() => (narration.recording ? narration.stop() : narration.start())}
        ariaPressed={narration.recording}
      >
        {narration.recording
          ? `Narrating ${formatElapsed(recordingElapsed)}`
          : "Narrate"}
      </PanelButton>
      <PanelButton
        variant="secondary"
        onclick={() => (showHotkeys = !showHotkeys)}
        ariaPressed={showHotkeys}
        ariaLabel="Keyboard shortcuts"
      >
        Keys ?
      </PanelButton>
    </div>
  </header>

  <p class="notice notice--{noticeKind}" role="status">{notice}</p>

  {#if narration.error}
    <p class="notice notice--error" role="status">{narration.error}</p>
  {:else if narration.recording || narration.segments.length > 0}
    <p class="notice notice--narrating" role="status" aria-live="off">
      <span class="narration-count">
        {narration.segments.length}
        {narration.segments.length === 1 ? "line" : "lines"} captured
      </span>
      <span class="narration-heard">
        {narration.interim ||
          narration.segments.at(-1)?.text ||
          "Listening. Say what you are pointing at."}
      </span>
    </p>
  {/if}

  <div class="workspace">
    <section class="rail rail--left" aria-label="What to place">
      {#each presetsByGroup as group (group.id)}
        <h2 class="rail-heading">{group.label}</h2>
        <ul class="preset-list">
          {#each group.presets as preset (preset.id)}
            {@const count = draft.markers.filter(
              (marker) => marker.presetId === preset.id
            ).length}
            <li>
              <button
                type="button"
                class="preset"
                class:preset--active={activePresetId === preset.id}
                aria-pressed={activePresetId === preset.id}
                onclick={() => {
                  activePresetId = preset.id;
                  /**
                   * The label, not the instruction: the line above the map
                   * already carries the instruction, and echoing it here put
                   * the same sentence in two stacked bars.
                   */
                  report(`Placing ${preset.label}.`, "quiet");
                }}
              >
                <span class="preset-label">{preset.label}</span>
                <span class="preset-shape">{preset.shape}</span>
                {#if count > 0}
                  <span class="preset-count">{count}</span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {/each}
    </section>

    <section class="map-shell" aria-label="Site map">
      <div class="map-bar">
        <p class="instruction">
          {#if tracingMarker}
            Tracing {tracingMarker.label} — {markerVertices(tracingMarker).length}
            {markerVertices(tracingMarker).length === 1 ? "point" : "points"}.
            Enter finishes, Backspace takes one back, Shift snaps to 45°, Escape
            drops it.
          {:else}
            {activePreset.instruction}
          {/if}
        </p>
        <p class="hint">
          Hold Space or middle-drag to pan. Scroll zooms at the cursor. Press ?
          for every key.
        </p>
        {#if tracingMarker}
          <PanelButton variant="primary" onclick={finishTrace}>
            Finish shape
          </PanelButton>
        {/if}
      </div>
      <svg
        bind:this={svgElement}
        bind:clientWidth={mapWidth}
        bind:clientHeight={mapHeight}
        class="map"
        class:map--pan={effectiveMode === "pan"}
        class:map--panning={panOrigin !== null}
        viewBox="{view.x} {view.y} {view.width} {viewHeight}"
        role="application"
        aria-label="Registered Flow Fest orthophoto with placed site markers"
        onpointerdown={handlePointerDown}
        onpointerenter={() => (pointerOverMap = true)}
        onpointerleave={() => (pointerOverMap = false)}
        onpointermove={handlePointerMove}
        onpointerup={finishPointer}
        onpointercancel={finishPointer}
        ondblclick={() => tracingId && finishTrace()}
        onwheel={handleWheel}
      >
        <image
          href="/data/flow-fest-sim/ortho.webp"
          x="0"
          y="0"
          width={FLOW_FEST_IMAGE.width}
          height={FLOW_FEST_IMAGE.height}
        />

        {#each draft.markers as marker (marker.id)}
          {@const selected = marker.id === selectedMarkerId}
          {@const tip = arrowTip(marker)}
          {@const vertices = markerVertices(marker)}
          <g
            class="marker"
            class:marker--selected={selected}
            class:marker--incomplete={!markerReadiness(marker)}
            class:marker--tracing={marker.id === tracingId}
          >
            {#if isTracedShape(marker.shape) && vertices.length > 1}
              {#if marker.shape === "area" && marker.closed}
                <polygon
                  class="marker-area"
                  points={pointsAttribute(vertices)}
                  stroke-width={2 * pixelScale}
                />
              {:else}
                <polyline
                  class="marker-trace"
                  points={pointsAttribute(vertices)}
                  stroke-width={3 * pixelScale}
                />
              {/if}
              {#each vertices as vertex, index (index)}
                <circle
                  class="marker-vertex"
                  cx={vertex.x}
                  cy={vertex.y}
                  r={2.5 * pixelScale}
                />
              {/each}
            {/if}
            {#if marker.shape === "circle" && tip}
              <circle
                class="marker-circle"
                cx={marker.anchor.x}
                cy={marker.anchor.y}
                r={Math.hypot(
                  tip.x - marker.anchor.x,
                  tip.y - marker.anchor.y
                )}
              />
            {/if}
            {#if tip && marker.shape !== "circle"}
              <line
                class="marker-arrow"
                x1={marker.anchor.x}
                y1={marker.anchor.y}
                x2={tip.x}
                y2={tip.y}
                stroke-width={3 * pixelScale}
              />
              <circle
                class="marker-tip"
                cx={tip.x}
                cy={tip.y}
                r={4 * pixelScale}
              />
            {/if}
            <circle
              class="marker-dot"
              cx={marker.anchor.x}
              cy={marker.anchor.y}
              r={(selected ? 7 : 5) * pixelScale}
              stroke-width={2 * pixelScale}
            />
            {#if selected}
              <text
                class="marker-text"
                x={marker.anchor.x + 10 * pixelScale}
                y={marker.anchor.y - 8 * pixelScale}
                font-size={13 * pixelScale}
              >
                {marker.label}
              </text>
            {/if}
          </g>
        {/each}
      </svg>

      {#if showHotkeys}
        <!--
          The sheet floats over the map rather than sitting in the column, so
          opening it moves nothing. Escape and the Keys button both close it.
        -->
        <div class="hotkeys" transition:flyFade={{ y: 6 }}>
          <div class="hotkeys-head">
            <h2>Keys</h2>
            <PanelButton
              variant="secondary"
              onclick={() => (showHotkeys = false)}
            >
              Close
            </PanelButton>
          </div>
          <div class="hotkeys-grid">
            {#each HOTKEY_GROUPS as group (group.title)}
              <section class="hotkey-group">
                <h3>{group.title}</h3>
                <dl>
                  {#each group.rows as row (row.does)}
                    <div class="hotkey-row">
                      <dt>
                        {#each row.keys as chunk, index (chunk)}
                          {#if index > 0}<span class="hotkey-plus">+</span>{/if}
                          <kbd>{chunk}</kbd>
                        {/each}
                      </dt>
                      <dd>{row.does}</dd>
                    </div>
                  {/each}
                </dl>
              </section>
            {/each}
          </div>
        </div>
      {/if}
    </section>

    <section class="rail rail--right" aria-label="Placed markers">
      <h2 class="rail-heading">
        Placed
        <span class="rail-count">{draft.markers.length}</span>
      </h2>
      {#if unfinishedDirectionCount > 0}
        <p class="warn">
          {unfinishedDirectionCount}
          {unfinishedDirectionCount === 1 ? "marker still needs" : "markers still need"}
          a direction. Press one on the map and drag.
        </p>
      {/if}
      {#if unfinishedTraceCount > 0}
        <p class="warn">
          {unfinishedTraceCount}
          {unfinishedTraceCount === 1 ? "shape needs" : "shapes need"} more points.
          Select it, press Continue tracing, then click or drag along the map.
        </p>
      {/if}

      {#if draft.markers.length === 0}
        <p class="empty">
          Nothing placed yet. Choose something on the left, then press on the map
          and drag.
        </p>
      {:else}
        <ul class="marker-list">
          {#each draft.markers as marker (marker.id)}
            <li>
              <button
                type="button"
                class="marker-row"
                class:marker-row--active={marker.id === selectedMarkerId}
                aria-pressed={marker.id === selectedMarkerId}
                onclick={() => frameMarker(marker)}
              >
                <span class="marker-row-label">{marker.label}</span>
                <span class="marker-row-detail">{describe(marker)}</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}

      {#if selectedMarker}
        {@const editing = selectedMarker}
        <div class="editor">
          <label class="field">
            <span>Name</span>
            <input
              type="text"
              value={editing.label}
              oninput={(event) => renameSelected(event.currentTarget.value)}
            />
          </label>
          <label class="field">
            <span>Note</span>
            <textarea
              rows="3"
              value={editing.note}
              placeholder="Anything I would not guess from the picture."
              oninput={(event) => annotateSelected(event.currentTarget.value)}
            ></textarea>
          </label>
          <div class="editor-actions">
            {#if isTracedShape(editing.shape)}
              <PanelButton
                variant="secondary"
                onclick={() => continueTrace(editing.id)}
                disabled={editing.id === tracingId}
              >
                Continue tracing
              </PanelButton>
            {:else if editing.shape !== "point"}
              <PanelButton
                variant="secondary"
                onclick={() => clearHandle(editing.id)}
              >
                Clear direction
              </PanelButton>
            {/if}
            <PanelButton
              variant="secondary"
              onclick={() => deleteMarker(editing.id)}
            >
              Delete
            </PanelButton>
          </div>
        </div>
      {/if}

      <label class="field">
        <span>Anything about the site as a whole</span>
        <textarea
          rows="3"
          value={draft.overallNote}
          placeholder="How the parts relate, what the picture gets wrong, what changes year to year."
          oninput={(event) => {
            draft.overallNote = event.currentTarget.value.slice(0, 2000);
            persist();
          }}
        ></textarea>
      </label>

      <div class="rail-actions">
        <PanelButton
          variant="primary"
          onclick={saveMarkers}
          disabled={saving}
          ariaBusy={saving}
        >
          {saving ? "Saving…" : "Save to disk"}
        </PanelButton>
        <PanelButton variant="secondary" onclick={copyMarkers}>
          Copy JSON
        </PanelButton>
        <PanelButton variant="secondary" onclick={undo}>Undo</PanelButton>
        <PanelButton variant="secondary" onclick={redo}>Redo</PanelButton>
      </div>
      <p class="empty">
        Ctrl+Z undoes, Ctrl+Shift+Z redoes, Enter finishes a traced shape,
        Delete removes the selected one.
      </p>
    </section>
  </div>
</main>

<style>
  .marker-page {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    min-height: 100vh;
    background: var(--theme-background, #0d1117);
    color: var(--theme-text, #e6edf3);
  }

  .page-head {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  h1 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 650;
  }

  .lede {
    margin: 4px 0 0;
    max-width: 68ch;
    color: var(--theme-text-secondary, #9aa7b4);
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .head-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .notice {
    margin: 0;
    padding: 8px 12px;
    border-radius: 8px;
    font-size: 0.875rem;
    background: var(--theme-surface, #161b22);
    border: 1px solid var(--theme-border, #30363d);
  }

  .notice--success {
    border-color: var(--semantic-success, #3fb950);
  }

  .notice--error {
    border-color: var(--semantic-error, #f85149);
  }

  .workspace {
    display: grid;
    grid-template-columns: minmax(200px, 240px) minmax(0, 1fr) minmax(
        260px,
        340px
      );
    gap: 12px;
    align-items: start;
    flex: 1;
    min-height: 0;
  }

  .rail {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border-radius: 10px;
    background: var(--theme-surface, #161b22);
    border: 1px solid var(--theme-border, #30363d);
    max-height: calc(100vh - 160px);
    overflow-y: auto;
  }

  .rail-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 8px 0 0;
    font-size: 0.75rem;
    font-weight: 650;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--theme-text-secondary, #9aa7b4);
  }

  .rail-heading:first-child {
    margin-top: 0;
  }

  .rail-count {
    font-variant-numeric: tabular-nums;
  }

  .preset-list,
  .marker-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .preset,
  .marker-row {
    display: flex;
    align-items: baseline;
    gap: 8px;
    width: 100%;
    min-height: 44px;
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid transparent;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      background-color var(--duration-fast, 120ms) ease,
      border-color var(--duration-fast, 120ms) ease;
  }

  .preset:hover,
  .marker-row:hover {
    background: var(--theme-surface-hover, rgba(255, 255, 255, 0.06));
  }

  .preset--active,
  .marker-row--active {
    background: color-mix(in srgb, var(--theme-accent, #4493f8) 18%, transparent);
    border-color: var(--theme-accent, #4493f8);
  }

  .preset-label {
    flex: 1;
    font-size: 0.875rem;
  }

  .preset-shape {
    font-size: 0.6875rem;
    color: var(--theme-text-secondary, #9aa7b4);
  }

  .preset-count {
    min-width: 20px;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--theme-accent, #4493f8);
    color: var(--theme-text-on-accent, #fff);
    font-size: 0.6875rem;
    font-variant-numeric: tabular-nums;
    text-align: center;
  }

  .marker-row {
    flex-direction: column;
    align-items: stretch;
    gap: 2px;
  }

  .marker-row-label {
    font-size: 0.875rem;
  }

  .marker-row-detail {
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    color: var(--theme-text-secondary, #9aa7b4);
  }

  .map-shell {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
  }

  .map-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 4px 12px;
    /**
     * The bar keeps a fixed height because its right-hand action only exists
     * while a shape is open. Without the reservation, starting and finishing a
     * trace would nudge the map up and down under the pointer.
     */
    min-height: 40px;
  }

  .instruction {
    flex: 0 1 auto;
    margin: 0;
    font-size: 0.875rem;
    color: var(--theme-text-secondary, #9aa7b4);
  }

  .hint {
    /** Shrinkable, or a narrow bar pushes it off the right of the viewport. */
    flex: 0 1 auto;
    min-width: 0;
    /** Sits beside the instruction; the auto margin keeps the button right. */
    margin: 0 auto 0 0;
    font-size: 0.75rem;
    color: var(--theme-text-tertiary, #7d8894);
  }

  /**
   * The sheet floats over the map instead of taking a row in the column, so
   * opening and closing it never moves the map under the pointer.
   */
  .hotkeys {
    position: absolute;
    inset: 48px 0 auto 0;
    z-index: 4;
    max-height: calc(100% - 60px);
    overflow-y: auto;
    padding: 14px 16px 16px;
    border-radius: 10px;
    border: 1px solid var(--theme-border, #30363d);
    background: var(--theme-surface, #0d1117);
    box-shadow: 0 18px 44px rgb(0 0 0 / 55%);
  }

  .hotkeys-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }

  .hotkeys-head h2 {
    margin: 0;
    font-size: 1rem;
  }

  .hotkeys-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 10px 22px;
  }

  .hotkey-group h3 {
    margin: 0 0 4px;
    font-size: 0.75rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--theme-text-secondary, #9aa7b4);
  }

  .hotkey-group dl {
    display: grid;
    gap: 3px;
    margin: 0;
  }

  .hotkey-row {
    display: grid;
    grid-template-columns: minmax(96px, auto) minmax(0, 1fr);
    align-items: baseline;
    gap: 10px;
  }

  .hotkey-row dt {
    display: flex;
    align-items: center;
    gap: 3px;
    justify-content: flex-end;
  }

  .hotkey-row dd {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--theme-text-secondary, #9aa7b4);
  }

  .hotkeys kbd {
    padding: 1px 6px;
    border-radius: 4px;
    border: 1px solid var(--theme-border, #30363d);
    border-bottom-width: 2px;
    background: var(--theme-card-bg, #161b22);
    color: var(--theme-text, #e6edf3);
    font-family: inherit;
    font-size: 0.75rem;
    white-space: nowrap;
  }

  .hotkey-plus {
    font-size: 0.6875rem;
    color: var(--theme-text-tertiary, #7d8894);
  }

  .notice--narrating {
    display: flex;
    align-items: baseline;
    gap: 12px;
    border-color: var(--theme-accent, #4493f8);
  }

  .narration-count {
    flex: 0 0 auto;
    font-variant-numeric: tabular-nums;
    color: var(--theme-text-secondary, #9aa7b4);
  }

  .narration-heard {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /**
   * SegmentedControl stretches to its container by default, so two five-letter
   * labels would each take a third of a 4K header. `flex-basis: auto` resolves
   * to `width`, so the width has to be capped, not just the basis.
   */
  .mode-switch {
    flex: 0 0 auto;
    width: max-content;
    max-width: 220px;
  }

  .map {
    display: block;
    width: 100%;
    height: clamp(320px, calc(100vh - 210px), 2100px);
    border-radius: 10px;
    border: 1px solid var(--theme-border, #30363d);
    background: #000;
    touch-action: none;
    cursor: crosshair;
  }

  .map--pan {
    cursor: grab;
  }

  .map--panning {
    cursor: grabbing;
  }

  /**
   * The desktop tiers own the whole viewport, so the map takes whatever the
   * head, notice and bar leave rather than subtracting a guessed constant. A
   * constant was always wrong somewhere — the lede wraps to a different number
   * of lines at each width — and the map ran past the bottom of the screen.
   */
  @media (min-width: 1201px) {
    .marker-page {
      height: 100vh;
      overflow: hidden;
    }

    .workspace {
      align-items: stretch;
      /** An `auto` row would grow to the SVG's intrinsic square height. */
      grid-template-rows: minmax(0, 1fr);
    }

    .rail {
      max-height: 100%;
    }

    .map-shell {
      min-height: 0;
    }

    /** Basis 0, so the square SVG contributes no intrinsic height to the row. */
    .map {
      flex: 1 1 0;
      height: 0;
      min-height: 0;
    }
  }

  .marker-dot {
    fill: var(--theme-accent, #4493f8);
    stroke: #fff;
  }

  .marker--incomplete .marker-dot {
    fill: var(--semantic-warning, #d29922);
  }

  .marker--selected .marker-dot {
    fill: #fff;
    stroke: var(--theme-accent, #4493f8);
  }

  .marker-arrow {
    stroke: var(--theme-accent, #4493f8);
  }

  .marker-tip {
    fill: var(--theme-accent, #4493f8);
  }

  .marker-circle {
    fill: color-mix(in srgb, var(--theme-accent, #4493f8) 14%, transparent);
    stroke: var(--theme-accent, #4493f8);
    stroke-width: 2;
    vector-effect: non-scaling-stroke;
  }

  .marker-area {
    fill: color-mix(in srgb, var(--theme-accent, #4493f8) 18%, transparent);
    stroke: var(--theme-accent, #4493f8);
    vector-effect: non-scaling-stroke;
  }

  .marker-trace {
    fill: none;
    stroke: var(--theme-accent, #4493f8);
    stroke-linecap: round;
    stroke-linejoin: round;
    vector-effect: non-scaling-stroke;
  }

  .marker--tracing .marker-trace,
  .marker--tracing .marker-area {
    stroke: var(--semantic-warning, #d29922);
    stroke-dasharray: 6 4;
  }

  .marker-vertex {
    fill: #fff;
    opacity: 0.85;
  }

  .marker-text {
    fill: #fff;
    paint-order: stroke;
    stroke: rgba(0, 0, 0, 0.85);
    stroke-width: 3;
    vector-effect: non-scaling-stroke;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 0.75rem;
    color: var(--theme-text-secondary, #9aa7b4);
  }

  .field input,
  .field textarea {
    padding: 8px 10px;
    border-radius: 8px;
    border: 1px solid var(--theme-border, #30363d);
    background: var(--theme-background, #0d1117);
    color: var(--theme-text, #e6edf3);
    font: inherit;
    font-size: 0.875rem;
    resize: vertical;
  }

  .editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px;
    border-radius: 8px;
    border: 1px solid var(--theme-border, #30363d);
  }

  .editor-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  /**
   * A wrapping flex row strands Redo on a line of its own at most rail widths,
   * and three tracks in a ~315px rail is too narrow for "Copy JSON" to stay on
   * one line. Two columns of two is a deliberate composition: no orphan row, no
   * wrapped label, and Save keeps its accent fill to read as the primary.
   */
  .rail-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .empty,
  .warn {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.5;
    color: var(--theme-text-secondary, #9aa7b4);
  }

  .warn {
    color: var(--semantic-warning, #d29922);
  }

  /**
   * Wide canvas buys a second preset column, not larger controls: seventeen
   * presets stop scrolling and the roads group becomes visible without a hunt.
   */
  @media (min-width: 2200px) {
    .workspace {
      grid-template-columns: minmax(0, 420px) minmax(0, 1fr) minmax(0, 400px);
    }

    .preset-list {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 4px;
    }
  }

  /**
   * Once the columns collapse the map is the workspace, so it leads and the
   * picker follows it. Leaving the picker on top pushed the map past half the
   * viewport at 820 wide — that is hiding the workspace, not recomposing for
   * it. The lede folds away because the instruction line above the map already
   * says what the current preset wants, and the presets flow into as many
   * columns as fit under a capped height.
   */
  @media (max-width: 1200px) {
    .workspace {
      grid-template-columns: minmax(0, 1fr);
    }

    .lede {
      display: none;
    }

    .map-shell {
      order: -1;
    }

    .rail--left {
      max-height: 30vh;
    }

    .rail--right {
      max-height: none;
    }

    .preset-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
      gap: 4px;
    }

    .map {
      height: 58vh;
    }
  }

  /** A phone has less height to spend on the picker below the map. */
  @media (max-width: 700px) {
    .rail--left {
      max-height: 34vh;
    }

    .map {
      height: 46vh;
    }

    /** Keyboard guidance on a touch device is a row of wasted height. */
    .hint {
      display: none;
    }
  }

  /**
   * Short and wide (a folded phone in landscape) is a height problem, not a
   * width problem. Stacking there buries the map under the picker, so the
   * columns come back, the lede folds away, and the placed-marker rail moves
   * under the map where it can scroll without stealing map height.
   */
  @media (max-height: 620px) {
    .marker-page {
      gap: 8px;
      padding: 10px;
    }

    .lede {
      display: none;
    }

    .workspace {
      grid-template-columns: minmax(0, 210px) minmax(0, 1fr);
    }

    /* Two columns again, so the picker returns to the left of the map. */
    .map-shell {
      order: 0;
    }

    .rail--left {
      max-height: none;
    }

    .rail--right {
      grid-column: 1 / -1;
      max-height: 40vh;
    }

    .preset-list {
      display: flex;
      grid-template-columns: none;
    }

    .map {
      height: calc(100vh - 150px);
    }
  }
</style>
