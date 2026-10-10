<script lang="ts">
  import { flushSync, onDestroy, tick, untrack, type Snippet } from "svelte";
  import type {
    PostItem,
    PostKeyframeChannel,
    PostProject,
    PostTrack,
  } from "#lib/shared/media-composition/domain/post-project.js";
  import {
    MAIN_TRACK_INDEX,
    POST_FRAME_RATE,
    POST_MIN_ITEM_SECONDS,
    POST_TIME_EPSILON,
    findItem,
    itemEnd,
    mainItems,
  } from "#lib/shared/media-composition/domain/post-project.js";
  import {
    channelKeyframeSeconds,
    channelValueAt,
    channelsOf,
    isAnimated,
    keyframeIndexAt,
    moveKeyframe,
  } from "#lib/shared/media-composition/domain/post-project-keyframes.js";
  import {
    hasGrid,
    musicBarMarks,
    musicSnapTargets,
    musicSpan,
  } from "#lib/shared/media-composition/domain/music-grid.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { growFade } from "#lib/shared/transitions/motion.js";
  import TimeRuler from "#lib/shared/timeline/TimeRuler.svelte";
  import { channelValueText } from "../post-editor-labels";
  import PostTimelineItem from "./PostTimelineItem.svelte";
  import PostTimelineKeyLane from "./PostTimelineKeyLane.svelte";
  import PostTimelineKeyLaneHeader from "./PostTimelineKeyLaneHeader.svelte";
  import PostTimelineMusicLane from "./PostTimelineMusicLane.svelte";
  import PostTimelineTrackHeader from "./PostTimelineTrackHeader.svelte";
  import PostTimelineZoomControls from "./PostTimelineZoomControls.svelte";
  import {
    selectTimelineItem,
    timelineGroupOf,
    timelineHandoffPair,
    timelineItemOrder,
    type TimelineSelection,
  } from "./post-timeline-selection";
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
    /** `"tunnel"` while the selected animation's opening tunnel is what is selected. */
    selectedPart?: "tunnel" | null;
    labelFor: (item: PostItem) => string;
    onSeek: (seconds: number) => void;
    onSelect: (itemId: string | null) => void;
    /** An animation's opening tunnel was pressed: it has its own look. */
    onSelectTunnel?: (itemId: string) => void;
    onGestureStart: () => void;
    onGestureEnd: () => void;
    /** Puts back what the gesture changed, leaving no undo step. */
    onGestureCancel: () => void;
    onTrim: (itemId: string, edge: "start" | "end", seconds: number) => void;
    onMoveMain: (itemId: string, start: number) => void;
    onMoveOverlay: (itemId: string, start: number, trackIndex: number) => void;
    onOpenCrossfade: (outgoingId: string, incomingId: string) => void;
    onMoveSelection: (
      itemIds: string[],
      draggedItemId: string,
      start: number,
      trackIndex: number | null
    ) => void;
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
    /** The music under the post is selected. */
    musicSelected?: boolean;
    /** The music's file can't be loaded: its row says so. */
    musicMissing?: boolean;
    onSelectMusic?: () => void;
    /** Where the music now starts on the post's clock. */
    onMoveMusic?: (startSeconds: number) => void;
    onTrimMusic?: (edge: "start" | "end", postSeconds: number) => void;
    /** Where bar 1 now falls, in the music file's own seconds. */
    onMoveDownbeat?: (downbeatSeconds: number) => void;
  }

  let {
    project,
    durationSeconds,
    playheadSeconds,
    isPlaying,
    selectedItemId,
    selectedPart = null,
    labelFor,
    onSeek,
    onSelect,
    onSelectTunnel,
    onGestureStart,
    onGestureEnd,
    onGestureCancel,
    onTrim,
    onMoveMain,
    onMoveOverlay,
    onOpenCrossfade,
    onMoveSelection,
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
    musicSelected = false,
    musicMissing = false,
    onSelectMusic,
    onMoveMusic,
    onTrimMusic,
    onMoveDownbeat,
  }: Props = $props();

  // Items sit 3px inside a row with a 1px border, so an overlay stays 44px tall.
  const OVERLAY_ROW_HEIGHT_PX = 52;
  const MAIN_ROW_HEIGHT_PX = 72;
  const RULER_HEIGHT_PX = 52; // Fits the zoom controls beside the ruler.
  const KEY_LANE_HEIGHT_PX = 44;
  /** The music's row, under the tracks. */
  const MUSIC_ROW_HEIGHT_PX = 52;
  const TRAILING_PADDING_PX = 64;
  const DRAG_THRESHOLD_PX = 4;
  const ZOOM_STEP_FACTOR = 1.25;

  let lanesScrollEl = $state<HTMLDivElement | null>(null);
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
  let selection = $state<TimelineSelection>({
    ids: [],
    anchorId: null,
    focusId: null,
  });

  // The animation and the square it turns into show as one block.
  const handoffPair = $derived(timelineHandoffPair(project));

  $effect(() => {
    if (selectedItemId !== selection.focusId)
      selection = selectedItemId
        ? {
            ids: [selectedItemId],
            anchorId: selectedItemId,
            focusId: selectedItemId,
          }
        : { ids: [], anchorId: null, focusId: null };
  });

  interface DragMember {
    id: string;
    start: number;
    duration: number;
    trackIndex: number;
    /** The row it is drawn on: the square of a joined pair sits on the animation's. */
    rowTrackIndex: number;
    label: string;
  }

  function rowTrackIndexOf(itemId: string, trackIndex: number): number {
    return handoffPair && itemId === handoffPair.movesId
      ? handoffPair.animationTrackIndex
      : trackIndex;
  }

  interface RowBlock {
    item: PostItem;
    trackIndex: number;
    start: number;
    end: number;
    joinStart: boolean;
    joinEnd: boolean;
    /** The animation's opening tunnel, drawn as its own block ahead of the rest. */
    tunnel: boolean;
  }

  /** Where an animation's opening tunnel hands over to the rest of it, if inside it. */
  function tunnelEndOf(item: PostItem, end: number): number | null {
    if (item.kind !== "animation" || item.tunnelHook?.seconds === undefined)
      return null;
    const introEnd = item.start + item.tunnelHook.seconds;
    return introEnd > item.start + POST_TIME_EPSILON &&
      introEnd < end - POST_TIME_EPSILON
      ? introEnd
      : null;
  }

  /**
   * What a row draws. A joined pair meets halfway through the stretch where
   * the animation becomes the square; each half stays its own clip. An
   * animation's opening tunnel is drawn as its own block joined to the rest,
   * so it selects, and takes a look of its own, apart from the animation.
   */
  function rowBlocks(row: TimelineRow): RowBlock[] {
    const pair = handoffPair;
    const blocks: RowBlock[] = [];
    for (const item of row.track.items) {
      if (pair && item.id === pair.movesId) continue;
      const joined = pair !== null && item.id === pair.animationId;
      const end = joined ? (pair.start + pair.end) / 2 : itemEnd(item);
      const tunnelEnd = tunnelEndOf(item, end);
      if (tunnelEnd !== null)
        blocks.push({
          item,
          trackIndex: row.trackIndex,
          start: item.start,
          end: tunnelEnd,
          joinStart: false,
          joinEnd: true,
          tunnel: true,
        });
      blocks.push({
        item,
        trackIndex: row.trackIndex,
        start: tunnelEnd ?? item.start,
        end,
        joinStart: tunnelEnd !== null,
        joinEnd: joined,
        tunnel: false,
      });
    }
    if (pair && row.trackIndex === pair.animationTrackIndex) {
      const moves = project.tracks[pair.movesTrackIndex]?.items.find(
        (item) => item.id === pair.movesId
      );
      if (moves)
        blocks.push({
          item: moves,
          trackIndex: pair.movesTrackIndex,
          start: (pair.start + pair.end) / 2,
          end: itemEnd(moves),
          joinStart: true,
          joinEnd: false,
          tunnel: false,
        });
    }
    return blocks;
  }

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
    snappedStartSeconds: number;
    members: DragMember[];
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
    snappedStartSeconds: number;
    rowHit: OverlayRowHit;
    members: DragMember[];
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
  const crossfadeKinds = new Set<PostItem["kind"]>([
    "video",
    "image",
    "card",
    "animation",
    "moves",
    "carousel",
  ]);

  function cutsFor(track: PostTrack): {
    outgoing: PostItem;
    incoming: PostItem;
    center: number;
    active: boolean;
  }[] {
    if (track.locked || track.hidden) return [];
    const cuts: ReturnType<typeof cutsFor> = [];
    for (let index = 0; index < track.items.length - 1; index++) {
      const outgoing = track.items[index]!;
      const incoming = track.items[index + 1]!;
      if (
        handoffPair &&
        [outgoing.id, incoming.id].includes(handoffPair.movesId)
      )
        continue;
      if (
        !crossfadeKinds.has(outgoing.kind) ||
        !crossfadeKinds.has(incoming.kind)
      )
        continue;
      const gap = incoming.start - itemEnd(outgoing);
      const active = Boolean(
        outgoing.transitionOut &&
        (!outgoing.transitionOut.incomingId ||
          outgoing.transitionOut.incomingId === incoming.id)
      );
      if (
        active
          ? gap > POST_TIME_EPSILON ||
            gap < -Math.min(outgoing.duration, incoming.duration)
          : Math.abs(gap) > POST_TIME_EPSILON
      )
        continue;
      cuts.push({
        outgoing,
        incoming,
        center:
          gap < 0
            ? (incoming.start + itemEnd(outgoing)) / 2
            : itemEnd(outgoing),
        active,
      });
    }
    return cuts;
  }
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
    // Drawn under the row the clip sits on, which for a joined square is the
    // animation's.
    const rowTrackIndex = rowTrackIndexOf(item.id, trackIndex);
    let topPx = 0;
    for (const row of rows) {
      topPx += row.heightPx;
      if (row.trackIndex === rowTrackIndex) break;
    }
    return {
      item,
      trackIndex: rowTrackIndex,
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
  /** Music may run past the post's end; its lane shows all of it. */
  const contentEndSeconds = $derived(
    Math.max(durationSeconds, project.music ? musicSpan(project.music).end : 0)
  );
  const contentWidthPx = $derived(
    Math.max(
      lanesViewportWidthPx,
      secondsToPixels(contentEndSeconds, pixelsPerSecond) + TRAILING_PADDING_PX,
      dragExtensionPx
    )
  );
  /** Bar numbers on the ruler while the music has a beat grid. */
  const barMarks = $derived.by(() => {
    const music = project.music;
    return music && hasGrid(music) ? musicBarMarks(music, pixelsPerSecond) : [];
  });
  const playheadXPx = $derived(
    secondsToPixels(playheadSeconds, pixelsPerSecond)
  );
  const showNewLayerZone = $derived(
    dragState?.kind === "move-overlay" && dragState.didDrag
  );

  /** Zero, the playhead and the clips' edges: where the music's lane snaps. */
  function clipSnapTargets(excludeItemIds: ReadonlySet<string>): number[] {
    const targets = new Set<number>([0, playheadSeconds]);
    for (const track of project.tracks) {
      for (const item of track.items) {
        if (excludeItemIds.has(item.id)) continue;
        targets.add(item.start);
        targets.add(itemEnd(item));
      }
    }
    return Array.from(targets);
  }

  /** Where a clip snaps: those, plus the music's edges, bars and beats. */
  function collectSnapTargets(excludeItemIds: ReadonlySet<string>): number[] {
    const targets = clipSnapTargets(excludeItemIds);
    return project.music
      ? [...targets, ...musicSnapTargets(project.music, pixelsPerSecond)]
      : targets;
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
  }

  function handleLanesScroll(): void {
    if (suppressNextScrollEvent) {
      suppressNextScrollEvent = false;
    } else {
      markUserScrolling();
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
    const clamped = clampPixelsPerSecond(
      requestedPixelsPerSecond,
      fitPixelsPerSecond(
        durationSeconds,
        lanesViewportWidthPx - TRAILING_PADDING_PX
      )
    );
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
      Math.max(1, lanesViewportWidthPx - TRAILING_PADDING_PX)
    );
    flushSync();
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
      pixelsPerSecond = fitPixelsPerSecond(
        duration,
        Math.max(1, width - TRAILING_PADDING_PX)
      );
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

  function handleItemActivate(itemId: string, event: MouseEvent): void {
    // The click that follows a real drag's pointerup would otherwise also
    // select, since the same button fires both. A finished-drag pointerup
    // marks the id here so the click right after it is a no-op.
    if (suppressNextClickForItemId === itemId) {
      suppressNextClickForItemId = null;
      return;
    }
    // Each half of a joined pair selects on its own, so the animation's and
    // the square's looks and effects edit separately; they still move as one.
    selection = selectTimelineItem(
      selection,
      itemId,
      timelineItemOrder(project, itemId),
      event.shiftKey
        ? "range"
        : event.ctrlKey || event.metaKey
          ? "toggle"
          : "plain"
    );
    onSelect(selection.focusId);
  }

  /**
   * The tunnel block selects its animation with the tunnel as the part in
   * hand. Shift and Ctrl clicks pick the whole clip, as on any other block.
   */
  function handleTunnelActivate(itemId: string, event: MouseEvent): void {
    if (event.shiftKey || event.ctrlKey || event.metaKey || !onSelectTunnel) {
      handleItemActivate(itemId, event);
      return;
    }
    if (suppressNextClickForItemId === itemId) {
      suppressNextClickForItemId = null;
      return;
    }
    selection = { ids: [itemId], anchorId: itemId, focusId: itemId };
    onSelectTunnel(itemId);
  }

  function handleLaneBackgroundPointerDown(): void {
    selection = { ids: [], anchorId: null, focusId: null };
    onSelect(null);
  }

  // --- Starting a drag -------------------------------------------------------

  function beginBodyDrag(
    event: PointerEvent,
    item: PostItem,
    trackIndex: number
  ): void {
    if (event.button !== 0) return;
    if (event.shiftKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const ids = (
      selection.ids.includes(item.id) ? selection.ids : [item.id]
    ).flatMap((id) => timelineGroupOf(handoffPair, id));
    const selected = new Set(ids);
    const members = project.tracks.flatMap((track, index) =>
      track.locked
        ? []
        : track.items
            .filter((candidate) => selected.has(candidate.id))
            .map((candidate) => ({
              id: candidate.id,
              start: candidate.start,
              duration: candidate.duration,
              trackIndex: index,
              rowTrackIndex: rowTrackIndexOf(candidate.id, index),
              label: labelFor(candidate),
            }))
    );
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
        frozenTargets: collectSnapTargets(
          new Set(members.map((member) => member.id))
        ),
        itemDurationSeconds: item.duration,
        snappedStartSeconds: item.start,
        members,
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
        frozenTargets: collectSnapTargets(
          new Set(members.map((member) => member.id))
        ),
        snappedStartSeconds: item.start,
        rowHit: { kind: "overlay", trackIndex },
        members,
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
      frozenTargets: collectSnapTargets(new Set([item.id])),
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

  function memberGhostTopPx(
    state: MoveMainDrag | MoveOverlayDrag,
    member: DragMember
  ): number {
    if (member.rowTrackIndex === MAIN_TRACK_INDEX) return mainRowTopPx;
    const layerDelta =
      state.kind === "move-overlay"
        ? trackIndexForRowHit(state.rowHit, state.originalTrackIndex) -
          state.originalTrackIndex
        : 0;
    const target = Math.max(1, member.rowTrackIndex + layerDelta);
    return target > overlayTrackCount
      ? 0
      : overlayGhostTopPx({ kind: "overlay", trackIndex: target });
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
    state.snappedStartSeconds = Math.max(
      state.originalStart -
        Math.min(...state.members.map((member) => member.start)),
      placed.start
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
      if (
        (state.kind === "move-main" || state.kind === "move-overlay") &&
        !selection.ids.includes(state.itemId)
      ) {
        selection = {
          ids: [state.itemId],
          anchorId: state.itemId,
          focusId: state.itemId,
        };
        onSelect(state.itemId);
      }
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
    state.snappedStartSeconds = Math.max(
      state.originalStart -
        Math.min(...state.members.map((member) => member.start)),
      placed.start
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
          if (state.members.length > 1)
            onMoveSelection(
              state.members.map((member) => member.id),
              state.itemId,
              state.snappedStartSeconds,
              null
            );
          else onMoveMain(state.itemId, state.snappedStartSeconds);
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
          if (state.members.length > 1)
            onMoveSelection(
              state.members.map((member) => member.id),
              state.itemId,
              state.snappedStartSeconds,
              targetTrackIndex
            );
          else
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
    <div class="toolbar-row">
      <div class="keyframe-toolbar" transition:growFade|global>
        {@render toolbarStart()}
      </div>
    </div>
  {/if}

  <div class="body">
    <div class="header-column">
      <div class="ruler-controls" style="height: {RULER_HEIGHT_PX}px">
        <PostTimelineZoomControls
          collapseWhenNarrow
          onZoomOut={() => handleZoomButton(1 / ZOOM_STEP_FACTOR)}
          onZoomIn={() => handleZoomButton(ZOOM_STEP_FACTOR)}
          onFit={handleFit}
        />
      </div>
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
        {#if project.music}
          <PostTimelineTrackHeader
            name="Music"
            heightPx={MUSIC_ROW_HEIGHT_PX}
          />
        {/if}
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
        <!-- The ruler and tracks share one scroller, so their times cannot drift apart. -->
        <div
          class="ruler-row"
          style="width: {contentWidthPx}px; height: {RULER_HEIGHT_PX}px"
          role="group"
          aria-label={t("post_timeline_ruler_label")}
          onpointerdown={handleRulerPointerDown}
          onpointermove={handleRulerPointerMove}
        >
          <TimeRuler
            duration={durationSeconds}
            {pixelsPerSecond}
            tickInterval={rulerTickInterval(pixelsPerSecond)}
            marks={barMarks}
          />
          <div
            class="playhead-line"
            style="left: {playheadXPx}px"
            aria-hidden="true"
          ></div>
        </div>
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
              {#each rowBlocks(row) as block (`${block.item.id}${block.tunnel ? ":tunnel" : ""}`)}
                {@const item = block.item}
                {@const track = project.tracks[block.trackIndex]!}
                <PostTimelineItem
                  {item}
                  leftPx={secondsToPixels(block.start, pixelsPerSecond)}
                  widthPx={secondsToPixels(
                    block.end - block.start,
                    pixelsPerSecond
                  )}
                  labelText={block.tunnel
                    ? t("post_timeline_tunnel")
                    : labelFor(item)}
                  selected={selection.ids.includes(item.id) &&
                    block.tunnel ===
                      (selectedPart === "tunnel" && item.id === selectedItemId)}
                  locked={track.locked}
                  dimmed={track.hidden}
                  joinStart={block.joinStart}
                  joinEnd={block.joinEnd}
                  tunnel={block.tunnel}
                  span={block}
                  onActivate={block.tunnel
                    ? handleTunnelActivate
                    : handleItemActivate}
                  onBodyPointerDown={(event) =>
                    beginBodyDrag(event, item, block.trackIndex)}
                  onHandlePointerDown={(event, edge) =>
                    beginHandleDrag(event, item, edge, block.trackIndex)}
                  animated={channelsOf(item).some((channel) =>
                    isAnimated(item, channel)
                  )}
                />
              {/each}
              {#each cutsFor(row.track) as cut (`${cut.outgoing.id}:${cut.incoming.id}`)}
                {#if cut.active}
                  <span
                    class="crossfade-span"
                    aria-hidden="true"
                    style:left="{secondsToPixels(
                      cut.incoming.start,
                      pixelsPerSecond
                    )}px"
                    style:width="{secondsToPixels(
                      Math.max(0, itemEnd(cut.outgoing) - cut.incoming.start),
                      pixelsPerSecond
                    )}px"
                  ></span>
                {/if}
                <button
                  type="button"
                  class="cut-crossfade"
                  class:active={cut.active}
                  style:left="{secondsToPixels(cut.center, pixelsPerSecond)}px"
                  aria-label={`${t("post_editor_transition")}${cut.active ? `, ${t(cut.outgoing.transitionOut!.type === "fade-black" ? "post_transition_fade_black" : "post_transition_dissolve")}, ${cut.outgoing.transitionOut!.duration.toFixed(2)} s` : `, ${t("post_transition_cut")}`}: ${labelFor(cut.outgoing)} → ${labelFor(cut.incoming)}`}
                  title={`${t("post_editor_transition")}${cut.active ? `, ${cut.outgoing.transitionOut!.duration.toFixed(2)} s` : ""}: ${labelFor(cut.outgoing)} → ${labelFor(cut.incoming)}`}
                  onpointerdown={(event) => event.stopPropagation()}
                  onclick={() =>
                    onOpenCrossfade(cut.outgoing.id, cut.incoming.id)}
                >
                  <span class="cut-crossfade-marker">
                    <i
                      class={cut.active
                        ? "fa-solid fa-right-left"
                        : "fa-solid fa-plus"}
                      aria-hidden="true"
                    ></i>
                  </span>
                </button>
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

          {#if project.music}
            <div
              class="lane-row"
              style="height: {MUSIC_ROW_HEIGHT_PX}px"
              role="group"
              aria-label="Music"
              onpointerdown={handleLaneBackgroundPointerDown}
            >
              <PostTimelineMusicLane
                music={project.music}
                {pixelsPerSecond}
                postEndSeconds={durationSeconds}
                selected={musicSelected}
                missing={musicMissing}
                snapTargets={() => clipSnapTargets(new Set())}
                onSelect={() => onSelectMusic?.()}
                {onGestureStart}
                {onGestureEnd}
                {onGestureCancel}
                onMove={(startSeconds) => onMoveMusic?.(startSeconds)}
                onTrim={(edge, seconds) => onTrimMusic?.(edge, seconds)}
                onMoveDownbeat={(seconds) => onMoveDownbeat?.(seconds)}
                onSnapGuide={(seconds) => (snapGuideSeconds = seconds)}
              />
            </div>
          {/if}

          {#if (dragState?.kind === "move-main" || dragState?.kind === "move-overlay") && dragState.didDrag}
            {#each dragState.members as member (member.id)}
              <div
                class="ghost-block"
                aria-hidden="true"
                style="left: {secondsToPixels(
                  member.start +
                    dragState.snappedStartSeconds -
                    dragState.originalStart,
                  dragState.frozenPixelsPerSecond
                )}px; top: {memberGhostTopPx(dragState, member)}px;
                  width: {secondsToPixels(
                  member.duration,
                  dragState.frozenPixelsPerSecond
                )}px;
                  height: {member.trackIndex === MAIN_TRACK_INDEX
                  ? MAIN_ROW_HEIGHT_PX
                  : OVERLAY_ROW_HEIGHT_PX}px"
              >
                <span>{member.label}</span>
              </div>
            {/each}
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  /* --music-tint is the music's colour: its lane, and the bar numbers on
     the ruler. */
  .post-timeline {
    --music-tint: #5fd38d;
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
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .keyframe-toolbar {
    display: grid;
    flex: 1 1 18rem;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: start;
    gap: 0.5rem;
    padding: 0.375rem 0.5rem;
  }

  .keyframe-toolbar :global(.keyframe-controls) {
    min-width: 0;
  }

  .keyframe-toolbar :global(.overflow-trigger) {
    white-space: nowrap;
  }

  .ruler-controls {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
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

  .ruler-row {
    --ruler-mark-color: var(--music-tint);
    position: sticky;
    top: 0;
    z-index: 5;
    background: var(--theme-bg, #101018);
    touch-action: none;
    user-select: none;
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

  .cut-crossfade {
    position: absolute;
    z-index: 6;
    top: 50%;
    display: grid;
    place-items: center;
    min-width: 44px;
    height: 44px;
    padding: 0;
    transform: translate(-50%, -50%);
    border: 0;
    border-radius: 0.5rem;
    background: transparent;
    color: var(--theme-text, #fff);
    cursor: pointer;
    font: inherit;
    font-size: 0.75rem;
  }

  .cut-crossfade-marker {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    box-sizing: border-box;
    padding: 0;
    border: 1px solid var(--theme-stroke, #484755);
    border-radius: 0.375rem;
    background: var(--theme-panel-elevated-bg, #1c1c26);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .cut-crossfade:hover .cut-crossfade-marker {
    border-color: var(--theme-accent);
    background: var(--theme-panel-bg, #1c1c26);
  }

  .cut-crossfade.active .cut-crossfade-marker i {
    color: var(--theme-text, #fff);
  }

  .cut-crossfade.active .cut-crossfade-marker {
    border-color: color-mix(
      in srgb,
      var(--theme-accent) 45%,
      var(--theme-stroke)
    );
  }

  .crossfade-span {
    position: absolute;
    z-index: 5;
    top: 6px;
    bottom: 6px;
    box-sizing: border-box;
    border: 0;
    border-radius: 0.375rem;
    background: color-mix(in srgb, var(--theme-text, #fff) 6%, transparent);
    pointer-events: none;
  }

  .cut-crossfade:focus-visible {
    outline: 2px solid var(--theme-text, #fff);
    outline-offset: 2px;
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
