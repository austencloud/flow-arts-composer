<script lang="ts">
  import { flushSync, onDestroy, tick, untrack, type Snippet } from "svelte";
  import type {
    PostItem,
    PostKeyframeChannel,
    PostProject,
    PostTrack,
  } from "$lib/shared/media-composition/domain/post-project";
  import {
    MAIN_TRACK_INDEX,
    POST_FRAME_RATE,
    POST_MIN_ITEM_SECONDS,
    POST_TIME_EPSILON,
    findItem,
    itemEnd,
    mainItems,
  } from "$lib/shared/media-composition/domain/post-project";
  import {
    channelKeyframeSeconds,
    channelValueAt,
    channelsOf,
    isAnimated,
    keyframeIndexAt,
    moveKeyframe,
  } from "$lib/shared/media-composition/domain/post-project-keyframes";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { growFade } from "$lib/shared/transitions/motion";
  import TimeRuler from "$lib/shared/timeline/TimeRuler.svelte";
  import { channelValueText } from "../post-editor-labels";
  import PostTimelineItem from "./PostTimelineItem.svelte";
  import PostTimelineKeyLane from "./PostTimelineKeyLane.svelte";
  import PostTimelineKeyLaneHeader from "./PostTimelineKeyLaneHeader.svelte";
  import PostTimelineTrackHeader from "./PostTimelineTrackHeader.svelte";
  import PostTimelineZoomControls from "./PostTimelineZoomControls.svelte";
  import {
    POST_TIMELINE_DEFAULT_PIXELS_PER_SECOND,
    autoScrollForPlayhead,
    clampPixelsPerSecond,
    fitPixelsPerSecond,
    overlayRowAtPointerY,
    pixelsToSeconds,
    placeDraggedOverlay,
    revealPlayheadScrollLeft,
    roundToFrameSeconds,
    rowsYWithoutKeyLanes,
    rulerTickInterval,
    scrollLeftForStableAnchor,
    secondsToPixels,
    snapToTargets,
    type KeyLanesBand,
    type OverlayRowHit,
  } from "./post-timeline-geometry";

  /**
   * The Post Studio timeline strip: a ruler above a main track, with
   * any number of overlay tracks stacked above that. Purely a controlled view
   * - it never edits `project` itself, only reports what the user did (seek,
   * select, trim, move, flag a track) and trusts the caller to apply the edit
   * and hand back the next `project`. That is what lets a main clip
   * "shorten from the left without the left edge moving" when its start is
   * trimmed: this component just reports the dragged edge's new timeline
   * second, and whatever the caller's edit-and-normalize step decides that
   * means for the item flows back down through `project` on the next render.
   */
  interface Props {
    project: PostProject;
    durationSeconds: number;
    playheadSeconds: number;
    isPlaying: boolean;
    selectedItemId: string | null;
    labelFor: (item: PostItem) => string;
    onSeek: (seconds: number) => void;
    onSelect: (itemId: string | null) => void;
    onGestureStart: () => void;
    onGestureEnd: () => void;
    /** Puts back what the gesture changed, leaving no undo step. */
    onGestureCancel: () => void;
    onTrim: (itemId: string, edge: "start" | "end", seconds: number) => void;
    onMoveMain: (itemId: string, start: number) => void;
    onMoveOverlay: (itemId: string, start: number, trackIndex: number) => void;
    onTrackFlag: (
      trackId: string,
      flag: "hidden" | "locked",
      value: boolean
    ) => void;
    /**
     * The channel the toolbar diamond and K key: its keyframe row shows under
     * the selected clip even before it has keys. Null with no clip selected.
     */
    keyChannel: PostKeyframeChannel | null;
    /**
     * The channel the open tool edits. Its row stays up while another row is
     * picked, so picking a row never takes one away.
     */
    toolChannel: PostKeyframeChannel | null;
    onKeyChannel: (channel: PostKeyframeChannel) => void;
    onToggleKey: (
      itemId: string,
      channel: PostKeyframeChannel,
      seconds: number
    ) => void;
    onMoveKey: (
      itemId: string,
      channel: PostKeyframeChannel,
      fromSeconds: number,
      toSeconds: number
    ) => void;
    onDeleteKey: (
      itemId: string,
      channel: PostKeyframeChannel,
      seconds: number
    ) => void;
    /** A curve between two keys was pressed: open its easing. */
    onOpenCurve: (
      itemId: string,
      channel: PostKeyframeChannel,
      fromSeconds: number
    ) => void;
    /** Selected clip controls, shown in their own row above the ruler. */
    toolbarStart?: Snippet;
    onAddVideo?: () => void;
    pixelsPerSecond?: number;
  }

  let {
    project,
    durationSeconds,
    playheadSeconds,
    isPlaying,
    selectedItemId,
    labelFor,
    onSeek,
    onSelect,
    onGestureStart,
    onGestureEnd,
    onGestureCancel,
    onTrim,
    onMoveMain,
    onMoveOverlay,
    onTrackFlag,
    keyChannel,
    toolChannel,
    onKeyChannel,
    onToggleKey,
    onMoveKey,
    onDeleteKey,
    onOpenCurve,
    toolbarStart,
    onAddVideo,
    pixelsPerSecond = $bindable(POST_TIMELINE_DEFAULT_PIXELS_PER_SECOND),
  }: Props = $props();

  // Items sit 3px inside a row with a 1px border, so an overlay stays 44px tall.
  const OVERLAY_ROW_HEIGHT_PX = 52;
  const MAIN_ROW_HEIGHT_PX = 72;
  const RULER_HEIGHT_PX = 36; // Matches TimelineBody's ruler height for consistency.
  // The ruler viewport is narrower than the lanes by the zoom controls.
  // Extra trailing space lets both surfaces reach the same horizontal offset.
  const RULER_TRAILING_SPACE_PX = 160;
  const KEY_LANE_HEIGHT_PX = 44;
  const TRAILING_PADDING_PX = 64;
  const DRAG_THRESHOLD_PX = 4;
  const ZOOM_STEP_FACTOR = 1.25;

  let lanesScrollEl = $state<HTMLDivElement | null>(null);
  let rulerScrollEl = $state<HTMLDivElement | null>(null);
  let headerColumnEl = $state<HTMLDivElement | null>(null);
  let lanesContentEl = $state<HTMLDivElement | null>(null);
  let lanesViewportWidthPx = $state(0);
  let snapGuideSeconds = $state<number | null>(null);

  // Plain (non-reactive): read only from inside handlers/effects, never from
  // markup, so there is no reason for changes to trigger a render.
  let userScrolling = false;
  let userScrollTimeoutId: ReturnType<typeof setTimeout> | undefined;
  let suppressNextScrollEvent = false;
  let suppressNextClickForItemId: string | null = null;
  let suppressNextKeyClick = false;
  let didFitOnce = false;
  let previousHasItems: boolean | null = null;

  interface TrimDrag {
    kind: "trim";
    itemId: string;
    edge: "start" | "end";
    pointerId: number;
    frozenPixelsPerSecond: number;
    frozenTargets: number[];
    originalSeconds: number;
    /**
     * The item's edges when the drag began. The live item changes as it
     * trims, and a main clip keeps its start while its end moves in, so the
     * clamps use these.
     */
    originalStart: number;
    originalEnd: number;
    onMain: boolean;
    /** How far from the edge the wide handle was grabbed, so the edge doesn't jump. */
    grabOffsetSeconds: number;
    pendingSeconds: number;
    rafScheduled: boolean;
  }

  interface MoveMainDrag {
    kind: "move-main";
    itemId: string;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    didDrag: boolean;
    originalStart: number;
    grabOffsetSeconds: number;
    frozenPixelsPerSecond: number;
    frozenTargets: number[];
    itemDurationSeconds: number;
    ghostLeftPx: number;
    snappedStartSeconds: number;
  }

  interface MoveOverlayDrag {
    kind: "move-overlay";
    itemId: string;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    didDrag: boolean;
    originalStart: number;
    /** How far into the item it was grabbed, so it doesn't jump to the pointer. */
    grabOffsetSeconds: number;
    originalTrackIndex: number;
    itemDurationSeconds: number;
    frozenPixelsPerSecond: number;
    frozenTargets: number[];
    ghostLeftPx: number;
    snappedStartSeconds: number;
    rowHit: OverlayRowHit;
  }

  interface KeyframeDrag {
    kind: "keyframe";
    itemId: string;
    channel: PostKeyframeChannel;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    didDrag: boolean;
    frozenPixelsPerSecond: number;
    originalSeconds: number;
    itemStartSeconds: number;
    itemEndSeconds: number;
    frozenTargets: number[];
    pendingSeconds: number;
  }

  type DragState = TrimDrag | MoveMainDrag | MoveOverlayDrag | KeyframeDrag;

  let dragState = $state<DragState | null>(null);
  let dragExtensionPx = $state(0);
  let autoScrollFrame: number | null = null;
  let dragClientX = 0;

  onDestroy(() => {
    if (autoScrollFrame !== null) cancelAnimationFrame(autoScrollFrame);
    clearTimeout(userScrollTimeoutId);
  });

  const overlayTrackCount = $derived(Math.max(0, project.tracks.length - 1));
  const mainItemsList = $derived(mainItems(project));
  const hasItems = $derived(
    project.tracks.some((track) => track.items.length > 0)
  );

  interface TimelineRow {
    trackIndex: number;
    track: PostTrack;
    heightPx: number;
    isMain: boolean;
    displayName: string;
  }

  // Overlay rows draw the highest track index first (top of the stack, drawn
  // over everything below it) down to track 1, then the taller main row last.
  const rows = $derived.by((): TimelineRow[] => {
    const list: TimelineRow[] = [];
    for (
      let trackIndex = project.tracks.length - 1;
      trackIndex >= 1;
      trackIndex--
    ) {
      const track = project.tracks[trackIndex];
      if (!track) continue;
      list.push({
        trackIndex,
        track,
        heightPx: OVERLAY_ROW_HEIGHT_PX,
        isMain: false,
        displayName: t("post_timeline_track_layer", { number: trackIndex }),
      });
    }
    const main = project.tracks[MAIN_TRACK_INDEX];
    if (main) {
      list.push({
        trackIndex: MAIN_TRACK_INDEX,
        track: main,
        heightPx: MAIN_ROW_HEIGHT_PX,
        isMain: true,
        displayName: t("post_timeline_track_main"),
      });
    }
    return list;
  });

  interface KeyLanes extends KeyLanesBand {
    item: PostItem;
    trackIndex: number;
    locked: boolean;
    channels: PostKeyframeChannel[];
  }

  /**
   * The selected clip's keyframe rows, drawn under its own row: one per
   * animated channel, plus the channel the toolbar diamond keys, so its row
   * is there to key into before it has any.
   */
  const keyLanes = $derived.by((): KeyLanes | null => {
    if (selectedItemId === null) return null;
    const located = findItem(project, selectedItemId);
    if (!located) return null;
    const { item, trackIndex } = located;
    const channels = channelsOf(item).filter(
      (channel) =>
        channel === keyChannel ||
        channel === toolChannel ||
        isAnimated(item, channel)
    );
    if (channels.length === 0) return null;
    let topPx = 0;
    for (const row of rows) {
      topPx += row.heightPx;
      if (row.trackIndex === trackIndex) break;
    }
    return {
      item,
      trackIndex,
      locked: project.tracks[trackIndex]?.locked ?? false,
      channels,
      topPx,
      heightPx: channels.length * KEY_LANE_HEIGHT_PX,
    };
  });

  // The keyframe rows sit above the main row whenever the selected clip is
  // on an overlay track.
  const mainRowTopPx = $derived(
    overlayTrackCount * OVERLAY_ROW_HEIGHT_PX +
      (keyLanes && keyLanes.trackIndex !== MAIN_TRACK_INDEX
        ? keyLanes.heightPx
        : 0)
  );
  const contentWidthPx = $derived(
    Math.max(
      lanesViewportWidthPx,
      secondsToPixels(durationSeconds, pixelsPerSecond) + TRAILING_PADDING_PX,
      dragExtensionPx
    )
  );
  const playheadXPx = $derived(
    secondsToPixels(playheadSeconds, pixelsPerSecond)
  );
  const showNewLayerZone = $derived(
    dragState?.kind === "move-overlay" && dragState.didDrag
  );

  const ghostLabelText = $derived.by(() => {
    if (!dragState || dragState.kind === "trim") return "";
    const located = findItem(project, dragState.itemId);
    return located ? labelFor(located.item) : "";
  });

  function collectSnapTargets(excludeItemId: string): number[] {
    const targets = new Set<number>([0, playheadSeconds]);
    for (const track of project.tracks) {
      for (const item of track.items) {
        if (item.id === excludeItemId) continue;
        targets.add(item.start);
        targets.add(itemEnd(item));
      }
    }
    return Array.from(targets);
  }

  /** Measured fresh on every call so a mid-drag scroll never goes stale. */
  function contentOrigin(): { left: number; top: number } {
    const rect = lanesContentEl?.getBoundingClientRect();
    return { left: rect?.left ?? 0, top: rect?.top ?? 0 };
  }

  function pointerContentSeconds(clientX: number, pps: number): number {
    return Math.max(0, pixelsToSeconds(clientX - contentOrigin().left, pps));
  }

  // --- Ruler seek: its own local pointer-capture drag, independent of the
  // item drag machinery below since it has no threshold, ghost or snapping.

  function seekFromRulerEvent(event: PointerEvent): void {
    onSeek(pointerContentSeconds(event.clientX, pixelsPerSecond));
  }

  function handleRulerPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    seekFromRulerEvent(event);
  }

  function handleRulerPointerMove(event: PointerEvent): void {
    if (event.buttons === 0) return;
    seekFromRulerEvent(event);
  }

  // --- Scroll sync: the lanes own horizontal scrolling; either vertical
  // surface can be scrolled while keeping its matching row in view.

  function markUserScrolling(): void {
    userScrolling = true;
    clearTimeout(userScrollTimeoutId);
    userScrollTimeoutId = setTimeout(() => {
      userScrolling = false;
    }, 200);
  }

  function setLanesScrollLeft(px: number): void {
    // Setting scrollLeft fires a native 'scroll' event; without this flag
    // that echo would look like the user scrolling and pause auto-scroll.
    suppressNextScrollEvent = true;
    if (lanesScrollEl) lanesScrollEl.scrollLeft = px;
    if (rulerScrollEl) rulerScrollEl.scrollLeft = px;
  }

  function handleLanesScroll(): void {
    if (suppressNextScrollEvent) {
      suppressNextScrollEvent = false;
    } else {
      markUserScrolling();
    }
    if (rulerScrollEl && lanesScrollEl) {
      rulerScrollEl.scrollLeft = lanesScrollEl.scrollLeft;
    }
    if (headerColumnEl && lanesScrollEl) {
      headerColumnEl.scrollTop = lanesScrollEl.scrollTop;
    }
  }

  function handleHeaderScroll(): void {
    if (!headerColumnEl || !lanesScrollEl) return;
    if (lanesScrollEl.scrollTop === headerColumnEl.scrollTop) return;
    lanesScrollEl.scrollTop = headerColumnEl.scrollTop;
    headerColumnEl.scrollTop = lanesScrollEl.scrollTop;
  }

  // --- Zoom --------------------------------------------------------------

  function zoomTo(
    requestedPixelsPerSecond: number,
    anchorSeconds: number,
    anchorClientXPx: number
  ): void {
    const clamped = clampPixelsPerSecond(requestedPixelsPerSecond);
    if (clamped === pixelsPerSecond) return;
    pixelsPerSecond = clamped;
    if (!lanesScrollEl) return;
    // Grow the scrollable track before setting scrollLeft, or the browser
    // clamps the new position to the old width and the playhead drifts.
    flushSync();
    setLanesScrollLeft(
      scrollLeftForStableAnchor({
        anchorSeconds,
        anchorClientXPx,
        newPixelsPerSecond: clamped,
      })
    );
  }

  function handleZoomButton(factor: number): void {
    const anchorClientXPx = lanesScrollEl
      ? playheadXPx - lanesScrollEl.scrollLeft
      : 0;
    zoomTo(pixelsPerSecond * factor, playheadSeconds, anchorClientXPx);
  }

  function handleFit(): void {
    pixelsPerSecond = fitPixelsPerSecond(
      durationSeconds,
      lanesViewportWidthPx || 1
    );
    setLanesScrollLeft(0);
  }

  function handleWheel(event: WheelEvent): void {
    if (!(event.ctrlKey || event.metaKey) || !lanesScrollEl) return;
    // A ctrl/cmd+wheel zoom is a deliberate replacement for page zoom; a plain
    // wheel is left alone so normal two-finger pan scrolling still works.
    event.preventDefault();
    const factor = event.deltaY < 0 ? ZOOM_STEP_FACTOR : 1 / ZOOM_STEP_FACTOR;
    handleZoomButton(factor);
  }

  // --- Fit on mount, and again whenever the project goes from empty to not.

  $effect(() => {
    const currentHasItems = hasItems;
    const width = lanesViewportWidthPx;
    const duration = durationSeconds;
    if (width <= 0) return;
    const becameNonEmpty = previousHasItems === false && currentHasItems;
    if (!didFitOnce || becameNonEmpty) {
      pixelsPerSecond = fitPixelsPerSecond(duration, width);
      setLanesScrollLeft(0);
      didFitOnce = true;
    }
    previousHasItems = currentHasItems;
  });

  // --- Auto-scroll to keep the playhead in view during playback.

  $effect(() => {
    if (!isPlaying || userScrolling || !lanesScrollEl) return;
    const target = autoScrollForPlayhead({
      playheadSeconds,
      pixelsPerSecond,
      scrollLeftPx: lanesScrollEl.scrollLeft,
      viewportWidthPx: lanesViewportWidthPx,
    });
    if (target !== null) setLanesScrollLeft(target);
  });

  // A jump while paused (a new clip, an undo, a frame step) brings the
  // playhead back into view. Only the playhead moving triggers this, so
  // scrolling away by hand to look elsewhere stays put.
  $effect(() => {
    const seconds = playheadSeconds;
    untrack(() => {
      if (isPlaying || userScrolling || !lanesScrollEl) return;
      const target = revealPlayheadScrollLeft({
        playheadSeconds: seconds,
        pixelsPerSecond,
        scrollLeftPx: lanesScrollEl.scrollLeft,
        viewportWidthPx: lanesViewportWidthPx,
      });
      if (target !== null) setLanesScrollLeft(target);
    });
  });

  // --- Selection -----------------------------------------------------------

  function handleItemActivate(itemId: string): void {
    // The click that follows a real drag's pointerup would otherwise also
    // select, since the same button fires both. A finished-drag pointerup
    // marks the id here so the click right after it is a no-op.
    if (suppressNextClickForItemId === itemId) {
      suppressNextClickForItemId = null;
      return;
    }
    onSelect(itemId);
  }

  function handleLaneBackgroundPointerDown(): void {
    onSelect(null);
  }

  // --- Starting a drag -------------------------------------------------------

  function beginBodyDrag(
    event: PointerEvent,
    item: PostItem,
    trackIndex: number
  ): void {
    if (event.button !== 0) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const originalLeftPx = secondsToPixels(item.start, pixelsPerSecond);
    if (trackIndex === MAIN_TRACK_INDEX) {
      dragState = {
        kind: "move-main",
        itemId: item.id,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        didDrag: false,
        originalStart: item.start,
        grabOffsetSeconds:
          pixelsToSeconds(
            event.clientX - contentOrigin().left,
            pixelsPerSecond
          ) - item.start,
        frozenPixelsPerSecond: pixelsPerSecond,
        frozenTargets: collectSnapTargets(item.id),
        itemDurationSeconds: item.duration,
        ghostLeftPx: originalLeftPx,
        snappedStartSeconds: item.start,
      };
    } else {
      dragState = {
        kind: "move-overlay",
        itemId: item.id,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        didDrag: false,
        originalStart: item.start,
        grabOffsetSeconds:
          pixelsToSeconds(
            event.clientX - contentOrigin().left,
            pixelsPerSecond
          ) - item.start,
        originalTrackIndex: trackIndex,
        itemDurationSeconds: item.duration,
        frozenPixelsPerSecond: pixelsPerSecond,
        frozenTargets: collectSnapTargets(item.id),
        ghostLeftPx: originalLeftPx,
        snappedStartSeconds: item.start,
        rowHit: { kind: "overlay", trackIndex },
      };
    }
  }

  function beginHandleDrag(
    event: PointerEvent,
    item: PostItem,
    edge: "start" | "end",
    trackIndex: number
  ): void {
    if (event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    onGestureStart();
    const originalSeconds = edge === "start" ? item.start : itemEnd(item);
    dragState = {
      kind: "trim",
      itemId: item.id,
      edge,
      pointerId: event.pointerId,
      frozenPixelsPerSecond: pixelsPerSecond,
      frozenTargets: collectSnapTargets(item.id),
      originalSeconds,
      originalStart: item.start,
      originalEnd: itemEnd(item),
      onMain: trackIndex === MAIN_TRACK_INDEX,
      grabOffsetSeconds:
        pixelsToSeconds(event.clientX - contentOrigin().left, pixelsPerSecond) -
        originalSeconds,
      pendingSeconds: originalSeconds,
      rafScheduled: false,
    };
  }

  function beginKeyDrag(
    event: PointerEvent,
    lanes: KeyLanes,
    channel: PostKeyframeChannel,
    seconds: number
  ): void {
    if (event.button !== 0) return;
    // A drag whose closing click never landed must not eat this press's click.
    suppressNextKeyClick = false;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const { item } = lanes;
    // A key snaps to the playhead and to the clip's other keys, so keys on
    // different rows line up.
    const targets = new Set<number>([playheadSeconds]);
    for (const other of channelsOf(item)) {
      for (const key of channelKeyframeSeconds(item, other)) {
        if (
          !(other === channel && Math.abs(key - seconds) <= POST_TIME_EPSILON)
        ) {
          targets.add(key);
        }
      }
    }
    dragState = {
      kind: "keyframe",
      itemId: item.id,
      channel,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      didDrag: false,
      frozenPixelsPerSecond: pixelsPerSecond,
      originalSeconds: seconds,
      itemStartSeconds: item.start,
      itemEndSeconds: itemEnd(item),
      frozenTargets: Array.from(targets),
      pendingSeconds: seconds,
    };
  }

  function handleKeyClick(channel: PostKeyframeChannel, seconds: number): void {
    if (suppressNextKeyClick) {
      suppressNextKeyClick = false;
      return;
    }
    onKeyChannel(channel);
    onSeek(seconds);
  }

  function handleKeyKeydown(
    event: KeyboardEvent,
    lanes: KeyLanes,
    channel: PostKeyframeChannel,
    seconds: number
  ): void {
    if (lanes.locked) return;
    const content = lanesContentEl;
    const { item } = lanes;
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      onDeleteKey(item.id, channel, seconds);
      void refocusKey(content, item.id, channel, seconds);
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      const big = event.shiftKey ? 10 : 1;
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      const next = Math.min(
        itemEnd(item),
        Math.max(item.start, seconds + direction * big * (1 / POST_FRAME_RATE))
      );
      if (Math.abs(next - seconds) > POST_TIME_EPSILON) {
        onMoveKey(item.id, channel, seconds, next);
        void refocusKey(content, item.id, channel, next);
      }
    }
  }

  /**
   * Keeps the keyboard on the key it just moved, or on the nearest one left
   * in its row after a delete - and on the clip once none are - so the next
   * key press does not fall through to the editor and move the playhead or
   * delete the clip.
   */
  async function refocusKey(
    content: HTMLElement | null,
    itemId: string,
    channel: PostKeyframeChannel,
    seconds: number
  ): Promise<void> {
    await tick();
    if (!content) return;
    const selector = `[data-item-id="${CSS.escape(itemId)}"]`;
    let nearest: HTMLElement | null = null;
    let nearestDistance = Infinity;
    for (const key of content.querySelectorAll<HTMLElement>(
      `.kf-key${selector}[data-channel="${channel}"]`
    )) {
      const distance = Math.abs(Number(key.dataset.seconds) - seconds);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = key;
      }
    }
    const target =
      nearest ??
      content.querySelector<HTMLElement>(`.post-timeline-item${selector}`);
    if (target && document.activeElement !== target) target.focus();
  }

  /** The clip a keyframe row draws: during a key drag, with that key moved. */
  function laneItem(lanes: KeyLanes, channel: PostKeyframeChannel): PostItem {
    const state = dragState;
    if (
      state?.kind !== "keyframe" ||
      !state.didDrag ||
      state.itemId !== lanes.item.id ||
      state.channel !== channel
    ) {
      return lanes.item;
    }
    return moveKeyframe(
      lanes.item,
      channel,
      state.originalSeconds,
      state.pendingSeconds
    );
  }

  // Once a clip is picked, scroll its keyframe rows into view if they sit
  // below the fold, without pushing the clip's own row off the top.
  let revealedLanesFor: string | null = null;
  $effect(() => {
    const lanes = keyLanes;
    const key = lanes ? `${lanes.item.id}:${lanes.channels.length}` : null;
    if (key === revealedLanesFor) return;
    revealedLanesFor = key;
    if (!lanes) return;
    const rowHeightPx =
      lanes.trackIndex === MAIN_TRACK_INDEX
        ? MAIN_ROW_HEIGHT_PX
        : OVERLAY_ROW_HEIGHT_PX;
    const rowTopPx = lanes.topPx - rowHeightPx;
    const bottomPx = lanes.topPx + lanes.heightPx;
    void tick().then(() => {
      const scroller = untrack(() => lanesScrollEl);
      if (!scroller) return;
      if (bottomPx <= scroller.scrollTop + scroller.clientHeight) return;
      scroller.scrollTop = Math.min(bottomPx - scroller.clientHeight, rowTopPx);
    });
  });

  // --- Continuing / finishing a drag ------------------------------------------

  function trackIndexForRowHit(hit: OverlayRowHit, fallback: number): number {
    return hit.kind === "main" ? fallback : hit.trackIndex;
  }

  // Absolute top within `.lanes-content`. A new-layer hit shows in the zone
  // over the ruler instead, so it has no row here.
  function overlayGhostTopPx(hit: OverlayRowHit): number {
    if (hit.kind === "main") return mainRowTopPx;
    if (hit.kind === "new-layer") return 0;
    const rankFromTop = overlayTrackCount - hit.trackIndex;
    const topPx = rankFromTop * OVERLAY_ROW_HEIGHT_PX;
    return keyLanes && topPx >= keyLanes.topPx
      ? topPx + keyLanes.heightPx
      : topPx;
  }

  function finishDrag(): void {
    if (autoScrollFrame !== null) cancelAnimationFrame(autoScrollFrame);
    autoScrollFrame = null;
    dragState = null;
    dragExtensionPx = 0;
    snapGuideSeconds = null;
  }

  function placeMainDrag(state: MoveMainDrag, clientX: number): void {
    const placed = placeDraggedOverlay(
      pointerContentSeconds(clientX, state.frozenPixelsPerSecond) -
        state.grabOffsetSeconds,
      state.itemDurationSeconds,
      state.frozenTargets,
      state.frozenPixelsPerSecond
    );
    state.snappedStartSeconds = placed.start;
    state.ghostLeftPx = secondsToPixels(
      placed.start,
      state.frozenPixelsPerSecond
    );
    snapGuideSeconds = placed.guideSeconds;
  }

  function mainDragEdgeSpeed(clientX: number): number {
    if (!lanesScrollEl) return 0;
    const { left, right } = lanesScrollEl.getBoundingClientRect();
    const edgePx = 48;
    if (clientX < left + edgePx)
      return -Math.min(14, Math.max(0, left + edgePx - clientX) / 4);
    if (clientX > right - edgePx)
      return Math.min(14, Math.max(0, clientX - (right - edgePx)) / 4);
    return 0;
  }

  function scrollWhileDraggingMain(): void {
    autoScrollFrame = null;
    const state = dragState;
    const scroller = lanesScrollEl;
    if (state?.kind !== "move-main" || !state.didDrag || !scroller) return;
    const speed = mainDragEdgeSpeed(dragClientX);
    if (speed === 0) return;

    // Keep room beyond the current end so a card can move farther right
    // while the pointer stays at the edge of the visible timeline.
    if (speed > 0) {
      dragExtensionPx = Math.max(
        dragExtensionPx,
        scroller.scrollLeft + lanesViewportWidthPx * 2
      );
    }
    const before = scroller.scrollLeft;
    setLanesScrollLeft(Math.max(0, before + speed));
    if (scroller.scrollLeft === before) {
      // The wider content renders after this frame; try again once it exists.
      if (speed > 0)
        autoScrollFrame = requestAnimationFrame(scrollWhileDraggingMain);
      return;
    }
    placeMainDrag(state, dragClientX);
    autoScrollFrame = requestAnimationFrame(scrollWhileDraggingMain);
  }

  function handleWindowPointerMove(event: PointerEvent): void {
    const state = dragState;
    if (!state || event.pointerId !== state.pointerId) return;

    if (state.kind === "trim") {
      const rawSeconds =
        pixelsToSeconds(
          event.clientX - contentOrigin().left,
          state.frozenPixelsPerSecond
        ) - state.grabOffsetSeconds;
      const snapResult = snapToTargets(
        rawSeconds,
        state.frozenTargets,
        state.frozenPixelsPerSecond
      );
      // A snapped edge lands exactly on its target, which may sit between
      // frames. Only a free edge is rounded to a frame.
      let clamped =
        snapResult.snappedToSeconds !== null
          ? snapResult.seconds
          : roundToFrameSeconds(rawSeconds);
      clamped =
        state.edge === "start"
          ? Math.min(clamped, state.originalEnd - POST_MIN_ITEM_SECONDS)
          : Math.max(clamped, state.originalStart + POST_MIN_ITEM_SECONDS);
      // A main clip's head can go back past 0 to restore footage trimmed
      // off it. The trim itself stops at the start of the video.
      if (!(state.onMain && state.edge === "start")) {
        clamped = Math.max(0, clamped);
      }
      state.pendingSeconds = clamped;
      // Only show the guide line when the clamped result actually lands on
      // the snap target - a clamp can pull it back off after snapping.
      snapGuideSeconds =
        snapResult.snappedToSeconds !== null &&
        Math.abs(clamped - snapResult.snappedToSeconds) < POST_TIME_EPSILON
          ? snapResult.snappedToSeconds
          : null;
      if (!state.rafScheduled) {
        state.rafScheduled = true;
        requestAnimationFrame(() => {
          state.rafScheduled = false;
          if (dragState === state)
            onTrim(state.itemId, state.edge, state.pendingSeconds);
        });
      }
      return;
    }

    const deltaXPx = event.clientX - state.startClientX;
    const deltaYPx = event.clientY - state.startClientY;
    if (!state.didDrag) {
      if (Math.hypot(deltaXPx, deltaYPx) < DRAG_THRESHOLD_PX) return;
      state.didDrag = true;
    }

    if (state.kind === "move-main") {
      dragClientX = event.clientX;
      placeMainDrag(state, dragClientX);
      if (autoScrollFrame === null && mainDragEdgeSpeed(dragClientX) !== 0)
        autoScrollFrame = requestAnimationFrame(scrollWhileDraggingMain);
      return;
    }

    if (state.kind === "keyframe") {
      const rawSeconds = pointerContentSeconds(
        event.clientX,
        state.frozenPixelsPerSecond
      );
      const snapResult = snapToTargets(
        rawSeconds,
        state.frozenTargets,
        state.frozenPixelsPerSecond
      );
      const clamped = Math.min(
        state.itemEndSeconds,
        Math.max(
          state.itemStartSeconds,
          snapResult.snappedToSeconds !== null
            ? snapResult.seconds
            : roundToFrameSeconds(rawSeconds)
        )
      );
      state.pendingSeconds = clamped;
      snapGuideSeconds = clamped;
      return;
    }

    // move-overlay: the ghost's x is the snapped position (not a raw pixel
    // follow like the main-track ghost), since overlays can land anywhere.
    const placed = placeDraggedOverlay(
      pixelsToSeconds(
        event.clientX - contentOrigin().left,
        state.frozenPixelsPerSecond
      ) - state.grabOffsetSeconds,
      state.itemDurationSeconds,
      state.frozenTargets,
      state.frozenPixelsPerSecond
    );
    state.snappedStartSeconds = placed.start;
    state.ghostLeftPx = secondsToPixels(
      placed.start,
      state.frozenPixelsPerSecond
    );
    snapGuideSeconds = placed.guideSeconds;

    // Above the visible rows, over the ruler, is the drop zone for a new layer
    // on top. The zone draws over the ruler, so the rows never move mid-drag.
    const lanesTopPx = lanesScrollEl?.getBoundingClientRect().top ?? 0;
    const pointerYPx =
      event.clientY < lanesTopPx
        ? -1
        : rowsYWithoutKeyLanes(event.clientY - contentOrigin().top, keyLanes);
    const hit = overlayRowAtPointerY(pointerYPx, {
      overlayTrackCount,
      overlayRowHeightPx: OVERLAY_ROW_HEIGHT_PX,
      mainRowHeightPx: MAIN_ROW_HEIGHT_PX,
    });
    // A "main" reading only ever means the pointer is over the main row,
    // which isn't a valid target for an overlay - keep the last real row.
    state.rowHit = hit.kind === "main" ? state.rowHit : hit;
  }

  function handleWindowPointerUp(event: PointerEvent): void {
    const state = dragState;
    if (!state || event.pointerId !== state.pointerId) return;

    if (state.kind === "trim") {
      // A tap on a handle, or a drag back to where it began, changes nothing.
      if (
        Math.abs(state.pendingSeconds - state.originalSeconds) <
        POST_TIME_EPSILON
      ) {
        onGestureCancel();
      } else {
        onTrim(state.itemId, state.edge, state.pendingSeconds);
        onGestureEnd();
      }
      finishDrag();
      return;
    }

    if (state.didDrag) {
      if (state.kind === "move-main") {
        suppressNextClickForItemId = state.itemId;
        if (
          Math.abs(state.snappedStartSeconds - state.originalStart) >
          POST_TIME_EPSILON
        ) {
          onMoveMain(state.itemId, state.snappedStartSeconds);
        }
      } else if (state.kind === "move-overlay") {
        suppressNextClickForItemId = state.itemId;
        const targetTrackIndex = trackIndexForRowHit(
          state.rowHit,
          state.originalTrackIndex
        );
        const unchanged =
          targetTrackIndex === state.originalTrackIndex &&
          Math.abs(state.snappedStartSeconds - state.originalStart) <
            POST_TIME_EPSILON;
        if (!unchanged) {
          onMoveOverlay(
            state.itemId,
            state.snappedStartSeconds,
            targetTrackIndex
          );
        }
      } else {
        suppressNextKeyClick = true;
        if (
          Math.abs(state.pendingSeconds - state.originalSeconds) >
          POST_TIME_EPSILON
        ) {
          onMoveKey(
            state.itemId,
            state.channel,
            state.originalSeconds,
            state.pendingSeconds
          );
        }
      }
    }
    finishDrag();
  }

  function handleWindowPointerCancel(event: PointerEvent): void {
    const state = dragState;
    if (!state || event.pointerId !== state.pointerId) return;
    if (state.kind === "trim") onGestureCancel();
    finishDrag();
  }

  // Runs while the key is on its way down, before the editor's own Escape
  // (which clears the selection), and keeps the key to the drag it cancels.
  function handleWindowKeydown(event: KeyboardEvent): void {
    if (event.key !== "Escape" || !dragState) return;
    event.preventDefault();
    event.stopPropagation();
    if (dragState.kind === "trim") onGestureCancel();
    finishDrag();
  }
</script>

<svelte:window
  onpointermove={handleWindowPointerMove}
  onpointerup={handleWindowPointerUp}
  onpointercancel={handleWindowPointerCancel}
  onkeydowncapture={handleWindowKeydown}
/>

<div
  class="post-timeline"
  role="region"
  aria-label={t("post_timeline_region_label")}
>
  {#if toolbarStart}
    <div class="keyframe-toolbar" transition:growFade|global>
      {@render toolbarStart()}
    </div>
  {/if}
  <div class="toolbar-row">
    <div class="ruler-spacer" aria-hidden="true"></div>
    <div
      class="ruler-scroll"
      bind:this={rulerScrollEl}
      style="height: {RULER_HEIGHT_PX}px"
    >
      <div
        class="ruler-row"
        style="width: {contentWidthPx + RULER_TRAILING_SPACE_PX}px"
        role="group"
        aria-label={t("post_timeline_ruler_label")}
        onpointerdown={handleRulerPointerDown}
        onpointermove={handleRulerPointerMove}
      >
        <TimeRuler
          duration={durationSeconds}
          {pixelsPerSecond}
          tickInterval={rulerTickInterval(pixelsPerSecond)}
        />
        <div
          class="playhead-line"
          style="left: {playheadXPx}px"
          aria-hidden="true"
        ></div>
      </div>
    </div>
    <PostTimelineZoomControls
      onZoomOut={() => handleZoomButton(1 / ZOOM_STEP_FACTOR)}
      onZoomIn={() => handleZoomButton(ZOOM_STEP_FACTOR)}
      onFit={handleFit}
    />
  </div>

  <div class="body">
    <div class="header-column">
      <div
        class="header-rows"
        bind:this={headerColumnEl}
        onscroll={handleHeaderScroll}
      >
        {#each rows as row (row.trackIndex)}
          <PostTimelineTrackHeader
            name={row.displayName}
            hidden={row.track.hidden}
            locked={row.track.locked}
            heightPx={row.heightPx}
            onToggleHidden={() =>
              onTrackFlag(row.track.id, "hidden", !row.track.hidden)}
            onToggleLocked={() =>
              onTrackFlag(row.track.id, "locked", !row.track.locked)}
          />
          {#if keyLanes && keyLanes.trackIndex === row.trackIndex}
            {@const lanes = keyLanes}
            {@const inSpan =
              playheadSeconds >= lanes.item.start - POST_TIME_EPSILON &&
              playheadSeconds <= itemEnd(lanes.item) + POST_TIME_EPSILON}
            {#each lanes.channels as channel (channel)}
              <div class="key-lane-slot" transition:growFade|global>
                <PostTimelineKeyLaneHeader
                  {channel}
                  heightPx={KEY_LANE_HEIGHT_PX}
                  valueText={channelValueText(
                    channel,
                    channelValueAt(lanes.item, channel, playheadSeconds)
                  )}
                  focused={channel === keyChannel}
                  hasKeyHere={keyframeIndexAt(
                    lanes.item,
                    channel,
                    playheadSeconds
                  ) >= 0}
                  canKey={inSpan && !lanes.locked}
                  onFocus={() => onKeyChannel(channel)}
                  onToggleKey={() => {
                    onKeyChannel(channel);
                    onToggleKey(lanes.item.id, channel, playheadSeconds);
                  }}
                />
              </div>
            {/each}
          {/if}
        {/each}
      </div>
    </div>

    <div class="scroll-column">
      {#if showNewLayerZone && dragState?.kind === "move-overlay"}
        {@const active = dragState.rowHit.kind === "new-layer"}
        <div
          class="new-layer-zone"
          class:active
          style="height: {RULER_HEIGHT_PX}px"
          aria-hidden="true"
        >
          {#if active}
            <span>{t("post_timeline_new_layer_zone")}</span>
          {/if}
        </div>
      {/if}
      <div
        class="lanes-scroll"
        bind:this={lanesScrollEl}
        bind:clientWidth={lanesViewportWidthPx}
        onscroll={handleLanesScroll}
        onwheel={handleWheel}
        role="group"
        aria-label={t("post_timeline_lanes_label")}
      >
        <div
          class="lanes-content"
          bind:this={lanesContentEl}
          style="width: {contentWidthPx}px"
        >
          <div
            class="playhead-line"
            style="left: {playheadXPx}px"
            aria-hidden="true"
          ></div>
          {#if snapGuideSeconds !== null}
            <div
              class="snap-guide"
              style="left: {secondsToPixels(
                snapGuideSeconds,
                pixelsPerSecond
              )}px"
              aria-hidden="true"
            ></div>
          {/if}

          {#each rows as row (row.trackIndex)}
            <div
              class="lane-row"
              class:main-row={row.isMain}
              style="height: {row.heightPx}px"
              role="group"
              aria-label={row.displayName}
              onpointerdown={handleLaneBackgroundPointerDown}
            >
              {#if row.isMain && mainItemsList.length === 0}
                <div class="empty-hint">
                  <span>{t("post_timeline_empty_hint")}</span>
                  {#if onAddVideo}
                    <button
                      type="button"
                      class="add-video-btn"
                      onclick={onAddVideo}
                    >
                      <i class="fa-solid fa-plus" aria-hidden="true"></i>
                      {t("post_timeline_add_video")}
                    </button>
                  {/if}
                </div>
              {/if}
              {#each row.track.items as item (item.id)}
                <PostTimelineItem
                  {item}
                  leftPx={secondsToPixels(item.start, pixelsPerSecond)}
                  widthPx={secondsToPixels(item.duration, pixelsPerSecond)}
                  labelText={labelFor(item)}
                  selected={selectedItemId === item.id}
                  locked={row.track.locked}
                  dimmed={row.track.hidden}
                  onActivate={handleItemActivate}
                  onBodyPointerDown={(event) =>
                    beginBodyDrag(event, item, row.trackIndex)}
                  onHandlePointerDown={(event, edge) =>
                    beginHandleDrag(event, item, edge, row.trackIndex)}
                  animated={channelsOf(item).some((channel) =>
                    isAnimated(item, channel)
                  )}
                />
              {/each}
            </div>
            {#if keyLanes && keyLanes.trackIndex === row.trackIndex}
              {@const lanes = keyLanes}
              {#each lanes.channels as channel (channel)}
                <div class="key-lane-slot" transition:growFade|global>
                  <PostTimelineKeyLane
                    item={laneItem(lanes, channel)}
                    {channel}
                    heightPx={KEY_LANE_HEIGHT_PX}
                    {pixelsPerSecond}
                    {playheadSeconds}
                    focused={channel === keyChannel}
                    locked={lanes.locked}
                    onSeek={(seconds) => {
                      onKeyChannel(channel);
                      onSeek(seconds);
                    }}
                    onKeyPointerDown={(event, seconds) =>
                      beginKeyDrag(event, lanes, channel, seconds)}
                    onKeyClick={(seconds) => handleKeyClick(channel, seconds)}
                    onKeyKeydown={(event, seconds) =>
                      handleKeyKeydown(event, lanes, channel, seconds)}
                    onCurveClick={(fromSeconds) =>
                      onOpenCurve(lanes.item.id, channel, fromSeconds)}
                  />
                </div>
              {/each}
            {/if}
          {/each}

          {#if dragState?.kind === "move-main" && dragState.didDrag}
            <div
              class="ghost-block"
              aria-hidden="true"
              style="left: {dragState.ghostLeftPx}px; top: {mainRowTopPx}px;
                width: {secondsToPixels(
                dragState.itemDurationSeconds,
                dragState.frozenPixelsPerSecond
              )}px;
                height: {MAIN_ROW_HEIGHT_PX}px"
            >
              <span>{ghostLabelText}</span>
            </div>
          {/if}
          {#if showNewLayerZone && dragState?.kind === "move-overlay" && dragState.rowHit.kind !== "new-layer"}
            <div
              class="ghost-block"
              aria-hidden="true"
              style="left: {dragState.ghostLeftPx}px; top: {overlayGhostTopPx(
                dragState.rowHit
              )}px;
                width: {secondsToPixels(
                dragState.itemDurationSeconds,
                dragState.frozenPixelsPerSecond
              )}px;
                height: {OVERLAY_ROW_HEIGHT_PX}px"
            >
              <span>{ghostLabelText}</span>
            </div>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .post-timeline {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--theme-bg, #101018);
    container-type: inline-size;
    container-name: post-timeline;
  }

  .toolbar-row {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .keyframe-toolbar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 0.5rem;
    flex-shrink: 0;
    padding: 0.375rem 0.5rem;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .keyframe-toolbar :global(.keyframe-controls) {
    min-width: 0;
  }

  .keyframe-toolbar :global(.overflow-trigger) {
    white-space: nowrap;
  }

  .ruler-spacer {
    flex: 0 0 16rem;
  }

  .key-lane-slot {
    flex-shrink: 0;
    overflow: hidden;
  }

  .body {
    display: flex;
    flex: 1;
    min-height: 0;
  }

  .header-column {
    display: flex;
    flex-shrink: 0;
    flex-direction: column;
    width: 16rem;
    overflow: hidden;
    border-right: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    container-type: inline-size;
    container-name: post-timeline-header;
  }

  .header-rows {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding-bottom: 1rem;
    scrollbar-width: none;
  }

  .header-rows::-webkit-scrollbar {
    display: none;
  }

  .scroll-column {
    position: relative;
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
  }

  .ruler-scroll {
    flex: 1;
    min-width: 0;
    flex-shrink: 0;
    overflow: hidden;
  }

  .ruler-row {
    position: relative;
    height: 100%;
    touch-action: none;
  }

  /* Each label starts just after its tick, so the 0:00 label stays in view. */
  .ruler-row :global(.tick-label) {
    left: 4px;
    transform: none;
  }

  .lanes-scroll {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: auto;
  }

  .lanes-content {
    position: relative;
  }

  .lane-row {
    position: relative;
    box-sizing: border-box;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }

  .lane-row.main-row {
    background: color-mix(
      in srgb,
      var(--theme-card-bg, #1c1c26) 60%,
      transparent
    );
  }

  .playhead-line {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 3;
    width: 2px;
    background: var(--semantic-danger, #ff5d5d);
    pointer-events: none;
  }

  .snap-guide {
    position: absolute;
    top: 0;
    bottom: 0;
    z-index: 4;
    width: 1px;
    background: var(--theme-accent);
    opacity: 0.8;
    pointer-events: none;
  }

  /* Drawn over the ruler while an overlay is dragged. The outline hints at
     it, and it fills in with its label once the pointer is over it. */
  .new-layer-zone {
    position: absolute;
    top: 0;
    right: 0;
    left: 0;
    z-index: 6;
    display: flex;
    box-sizing: border-box;
    align-items: center;
    justify-content: center;
    border: 1px dashed var(--theme-stroke, rgba(255, 255, 255, 0.2));
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
    pointer-events: none;
  }

  .new-layer-zone.active {
    border-color: var(--theme-accent);
    background: color-mix(
      in srgb,
      var(--theme-accent) 22%,
      var(--theme-panel-elevated-bg, #1c1c26)
    );
    color: var(--theme-text);
  }

  .ghost-block {
    position: absolute;
    z-index: 5;
    pointer-events: none;
  }

  .ghost-block {
    display: flex;
    box-sizing: border-box;
    align-items: center;
    overflow: hidden;
    padding: 0 0.5rem;
    border: 1px solid var(--theme-accent);
    border-radius: 0.5rem;
    background: color-mix(
      in srgb,
      var(--theme-accent) 30%,
      var(--theme-card-bg, #1c1c26)
    );
    color: var(--theme-text);
    font-size: var(--font-size-compact, 0.75rem);
    white-space: nowrap;
    opacity: 0.85;
  }

  .empty-hint {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
    pointer-events: none;
  }

  .add-video-btn {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    min-height: var(--min-touch-target, 44px);
    padding: 0 0.9rem;
    border: 1px solid var(--theme-accent);
    border-radius: 0.5rem;
    background: color-mix(in srgb, var(--theme-accent) 16%, transparent);
    color: var(--theme-text);
    cursor: pointer;
    font: inherit;
    font-weight: 600;
    pointer-events: auto;
    transition: background-color var(--duration-fast, 150ms) ease;
  }

  @media (hover: hover) {
    .add-video-btn:hover {
      background: color-mix(in srgb, var(--theme-accent) 28%, transparent);
    }
  }

  .add-video-btn:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  @container post-timeline (max-width: 30rem) {
    .ruler-spacer {
      flex-basis: 7rem;
    }

    .header-column {
      width: 7rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .add-video-btn {
      transition: none;
    }
  }
</style>
