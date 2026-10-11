<script lang="ts">
  /**
   * The channel dock: every value the camera has, on its own visible timeline.
   *
   * The Film Director's camera used to be a row of preset buttons over a fused
   * keyframe list, so the only thing a director could say was "do this move".
   * A channel is one scalar over time, and this is the surface that makes each
   * one addressable: a lane per channel, drawn by sampling the real sampler,
   * with keys that can be dragged in both time and value.
   *
   * Two things are load-bearing about how it writes:
   *
   *   - A drag previews rather than commits. Committing per pointermove would
   *     re-resolve the whole film on every frame of a gesture; the preview
   *     substitutes one scene's manual layer at sample time instead, so the rig
   *     answers immediately and the document is written once, on release.
   *   - Taking a channel into the manual layer seeds it from what composed
   *     underneath, so the first edit moves exactly one key and nothing else.
   *
   * Design: docs/superpowers/specs/active/2026-09-02-film-director-channel-architecture-design.md
   */
  import { flyFade } from "#lib/shared/transitions/motion.js";
  import { getFilmDirectorContext } from "../_lib/film-director-context";
  import {
    cameraChannelGroup,
    resolveChannel,
    sampleCameraChannel,
    seedManualChannel,
    type CameraChannelId,
  } from "../_lib/director-camera-channels";
  import { cameraChannelsFor } from "../_lib/director-camera-track";
  import {
    CHANNEL_ROW_GROUPS,
    channelCurvePoints,
    channelLabel,
    channelRange,
    formatChannelValue,
    keyAtPointer,
    laneCurvePath,
    laneX,
    laneY,
    moveKey,
    secondsAtLaneX,
    valueAtLaneY,
    type ChannelRange,
  } from "../_lib/camera-channel-editor";
  import type { ResolvedDirectorCameraChannel } from "../_lib/film-director-schema";

  let { open = $bindable(false) }: { open?: boolean } = $props();

  const director = getFilmDirectorContext();

  /** How much a keyboard nudge moves a key: a frame of time, a percent of range. */
  const NUDGE_SECONDS = 1 / 30;
  const NUDGE_FRACTION = 0.02;

  const scene = $derived(director.frame.scene);
  const sceneTime = $derived(director.frame.sceneTimeSeconds);
  const duration = $derived(Math.max(0.001, scene.durationSeconds));

  /**
   * The manual layer in force right now: the drag's working copy while one is
   * running, the document's own otherwise. Reading the preview from the
   * director rather than from local state means the lanes and the rig are
   * always looking at the same thing.
   */
  const manual = $derived.by((): readonly ResolvedDirectorCameraChannel[] => {
    const preview = director.channelPreview;
    if (preview && preview.sceneId === scene.id) return preview.channels;
    return scene.camera.channels ?? [];
  });

  const store = $derived(
    cameraChannelsFor(scene.camera, manual.length ? { manual } : undefined)
  );

  /** Channel ids the document hand-keys for this scene. */
  const owned = $derived(
    new Set((scene.camera.channels ?? []).map((channel) => channel.id))
  );

  /**
   * The range a lane draws over, frozen for the channel being dragged.
   *
   * Without the freeze the lane rescales under the finger — the value moves,
   * the extremes move with it, and the key appears to lag the pointer it is
   * supposed to be pinned to.
   */
  let frozen = $state<{ id: CameraChannelId; range: ChannelRange } | null>(null);

  interface LaneModel {
    id: CameraChannelId;
    label: string;
    range: ChannelRange;
    keys: readonly { t: number; v: number }[];
    path: string;
    isOwned: boolean;
  }

  function laneModel(id: CameraChannelId): LaneModel {
    const channel = resolveChannel(store, id);
    const keys = channel?.keys ?? [];
    const range = frozen?.id === id ? frozen.range : channelRange(keys);
    return {
      id,
      label: channelLabel(id),
      range,
      keys,
      path: channel
        ? laneCurvePath(channelCurvePoints(channel, range, duration), 100, 100)
        : "",
      isOwned: owned.has(id),
    };
  }

  /**
   * The lanes' geometry, which depends on the document rather than the clock.
   *
   * Deliberately free of `sceneTime`: eleven lanes at 96 samples each is a
   * thousand curve evaluations, and tying that to the playhead would redraw
   * every one of them on every animation frame to show a curve that had not
   * changed. The playhead and the value readouts below carry the clock instead.
   */
  const groups = $derived(
    CHANNEL_ROW_GROUPS.map((group) => ({
      label: group.label,
      lanes: group.ids.map(laneModel),
    }))
  );

  /** What each channel reads at the playhead. The only per-frame work here. */
  const values = $derived.by(() => {
    const readings = new Map<CameraChannelId, number>();
    for (const group of CHANNEL_ROW_GROUPS) {
      for (const id of group.ids) {
        const channel = resolveChannel(store, id);
        readings.set(id, channel ? sampleCameraChannel(channel, sceneTime) : 0);
      }
    }
    return readings;
  });

  const playheadPercent = $derived(laneX(sceneTime, duration) * 100);

  /**
   * Ruler marks: whole seconds while they stay legible, coarser after that.
   * The marks at either end anchor inward so neither hangs off the lane.
   */
  const ruler = $derived.by(() => {
    const step = duration <= 12 ? 1 : Math.ceil(duration / 6);
    const marks: { at: number; label: string; anchor: string }[] = [];
    for (let at = 0; at <= duration + 1e-6; at += step) {
      const fraction = laneX(at, duration);
      marks.push({
        at,
        label: `${Math.round(at)}s`,
        anchor: fraction < 0.02 ? "start" : fraction > 0.98 ? "end" : "middle",
      });
    }
    return marks;
  });

  // --- editing ----------------------------------------------------------

  interface Drag {
    pointerId: number;
    lane: HTMLElement;
    id: CameraChannelId;
    keyIndex: number;
    range: ChannelRange;
    /** The whole manual layer, this drag's working copy. */
    working: ResolvedDirectorCameraChannel[];
    /** Only the channels this gesture owns, which is all the document needs. */
    touched: CameraChannelId[];
    moved: boolean;
  }

  let drag: Drag | null = null;

  /**
   * The manual layer with `id`'s group present, seeded from what composes
   * underneath when it is not there yet.
   *
   * The group matters: yaw, pitch and distance are one aim in three scalars,
   * and the segment's aim space rides on yaw. Promoting yaw alone would leave
   * the aim half derived and half measured.
   */
  function withGroup(id: CameraChannelId): {
    working: ResolvedDirectorCameraChannel[];
    touched: CameraChannelId[];
  } {
    const working = manual.map((channel) => ({
      id: channel.id,
      keys: channel.keys.map((key) => ({ ...key })),
    }));
    const touched = [...cameraChannelGroup(id)];
    for (const member of touched) {
      if (working.some((channel) => channel.id === member)) continue;
      const seeded = seedManualChannel(store, member);
      working.push({
        id: member,
        keys: seeded.keys.map((key) => ({ ...key })),
      });
    }
    return { working, touched };
  }

  function lanePointer(
    lane: HTMLElement,
    event: PointerEvent
  ): { x: number; y: number } {
    const box = lane.getBoundingClientRect();
    return {
      x: box.width <= 0 ? 0 : (event.clientX - box.left) / box.width,
      y: box.height <= 0 ? 0 : (event.clientY - box.top) / box.height,
    };
  }

  function startDrag(lane: LaneModel, event: PointerEvent): void {
    const element = event.currentTarget as HTMLElement;
    const pointer = lanePointer(element, event);
    const index = keyAtPointer(lane.keys, pointer, lane.range, duration);

    // Empty lane: the press is a scrub, which is the other thing a director
    // wants from a timeline and the only other thing this surface could mean.
    if (index === null) {
      director.seek(scene.startSeconds + secondsAtLaneX(pointer.x, duration));
      return;
    }

    const { working, touched } = withGroup(lane.id);
    frozen = { id: lane.id, range: lane.range };
    drag = {
      pointerId: event.pointerId,
      lane: element,
      id: lane.id,
      keyIndex: index,
      range: lane.range,
      working,
      touched,
      moved: false,
    };
    element.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function moveDrag(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const pointer = lanePointer(drag.lane, event);
    applyDrag(
      secondsAtLaneX(pointer.x, duration),
      valueAtLaneY(pointer.y, drag.range)
    );
  }

  function applyDrag(atSeconds: number, value: number): void {
    if (!drag) return;
    const active = drag;
    const channel = active.working.find((entry) => entry.id === active.id);
    if (!channel) return;
    channel.keys = moveKey(
      channel.keys,
      active.keyIndex,
      atSeconds,
      value,
      duration
    );
    active.moved = true;
    director.previewChannels({
      sceneId: scene.id,
      channels: active.working.map((entry) => ({
        id: entry.id,
        keys: entry.keys.map((key) => ({ ...key })),
      })),
    });
  }

  function endDrag(event: PointerEvent): void {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const finished = drag;
    drag = null;
    frozen = null;
    if (finished.lane.hasPointerCapture(event.pointerId)) {
      finished.lane.releasePointerCapture(event.pointerId);
    }
    if (!finished.moved) {
      director.previewChannels(null);
      return;
    }
    director.editChannel({
      sceneId: scene.id,
      set: finished.working.filter((channel) =>
        finished.touched.includes(channel.id)
      ),
    });
  }

  /**
   * Keyboard editing. One key at a time, same write path as a drag: seed the
   * group, move the key, commit. Arrow keys retime and revalue; a drag is the
   * fast way to say it and this is the exact one.
   */
  function nudge(
    lane: LaneModel,
    index: number,
    deltaSeconds: number,
    deltaFraction: number
  ): void {
    const key = lane.keys[index];
    if (!key) return;
    const { working, touched } = withGroup(lane.id);
    const channel = working.find((entry) => entry.id === lane.id);
    if (!channel) return;
    const span = lane.range.max - lane.range.min;
    channel.keys = moveKey(
      channel.keys,
      index,
      key.t + deltaSeconds,
      key.v + span * deltaFraction,
      duration
    );
    director.editChannel({
      sceneId: scene.id,
      set: working.filter((entry) => touched.includes(entry.id)),
    });
  }

  function handleKeyDown(
    lane: LaneModel,
    index: number,
    event: KeyboardEvent
  ): void {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-NUDGE_SECONDS, 0],
      ArrowRight: [NUDGE_SECONDS, 0],
      ArrowUp: [0, NUDGE_FRACTION],
      ArrowDown: [0, -NUDGE_FRACTION],
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    nudge(lane, index, move[0], move[1]);
  }

  function revert(id: CameraChannelId): void {
    director.editChannel({ sceneId: scene.id, clear: cameraChannelGroup(id) });
  }

  function revertAll(): void {
    const ids = (scene.camera.channels ?? []).map((channel) => channel.id);
    if (ids.length === 0) return;
    director.editChannel({ sceneId: scene.id, clear: ids });
  }
</script>

{#if open}
  <section
    class="channel-dock"
    aria-label="Camera channels"
    transition:flyFade={{ y: 14 }}
  >
    <header class="dock-head">
      <span class="dock-title">Channels</span>
      <span class="dock-scene">{scene.title}</span>
      <span class="dock-spacer"></span>
      {#if owned.size > 0}
        <button
          type="button"
          class="dock-action"
          onclick={revertAll}
          transition:flyFade={{ y: 0, x: 6 }}
        >
          <i class="fas fa-rotate-left" aria-hidden="true"></i>
          <span>Revert all</span>
        </button>
      {/if}
      <button
        type="button"
        class="dock-action"
        aria-label="Close channels"
        onclick={() => (open = false)}
      >
        <i class="fas fa-xmark" aria-hidden="true"></i>
      </button>
    </header>

    <div class="dock-body">
      <div class="gutter">
        <div class="ruler-row"></div>
        {#each groups as group (group.label)}
          <div class="group-row">{group.label}</div>
          {#each group.lanes as lane (lane.id)}
            <div class="gutter-row" class:owned={lane.isOwned}>
              <span class="lane-label">{lane.label}</span>
              <span class="lane-value">
                {formatChannelValue(lane.id, values.get(lane.id) ?? 0)}
              </span>
              <span class="lane-state">
                {#if lane.isOwned}
                  <button
                    type="button"
                    class="revert"
                    aria-label={`Revert ${lane.label}`}
                    title="Hand-keyed. Revert to the layer below."
                    onclick={() => revert(lane.id)}
                  >
                    <i class="fas fa-rotate-left" aria-hidden="true"></i>
                  </button>
                {/if}
              </span>
            </div>
          {/each}
        {/each}
      </div>

      <div class="lanes">
        <div class="ruler-row ruler">
          {#each ruler as mark (mark.at)}
            <span
              class="tick"
              data-anchor={mark.anchor}
              style:left={`${laneX(mark.at, duration) * 100}%`}
            >
              {mark.label}
            </span>
          {/each}
        </div>

        {#each groups as group (group.label)}
          <div class="group-row"></div>
          {#each group.lanes as lane (lane.id)}
            <div
              class="lane"
              class:owned={lane.isOwned}
              role="group"
              aria-label={`${lane.label} channel`}
              onpointerdown={(event) => startDrag(lane, event)}
              onpointermove={moveDrag}
              onpointerup={endDrag}
              onpointercancel={endDrag}
            >
              <svg
                class="curve"
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <path d={lane.path} vector-effect="non-scaling-stroke" />
              </svg>
              {#each lane.keys as key, index (index)}
                <button
                  type="button"
                  class="key"
                  style:left={`${laneX(key.t, duration) * 100}%`}
                  style:top={`${laneY(key.v, lane.range) * 100}%`}
                  aria-label={`${lane.label} key at ${key.t.toFixed(2)} seconds, ${formatChannelValue(lane.id, key.v)}`}
                  onkeydown={(event) => handleKeyDown(lane, index, event)}
                ></button>
              {/each}
            </div>
          {/each}
        {/each}

        <div class="playhead" style:left={`${playheadPercent}%`}></div>
      </div>
    </div>
  </section>
{/if}

<style>
  .channel-dock {
    position: absolute;
    right: max(0.75rem, env(safe-area-inset-right));
    bottom: calc(var(--director-transport-reserve, 4.5rem) + 0.5rem);
    left: max(0.75rem, env(safe-area-inset-left));
    z-index: 69;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    /* The cap is the full channel list, measured: eleven lanes, four group
       headings, the ruler and the header come to a shade over 43rem, so a
       roomy window shows every channel at once and never scrolls. The
       container-height term is what stops a short window from letting the dock
       eat the stage. */
    max-height: clamp(9rem, 60cqh, 44rem);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: 1rem;
    color: var(--theme-text, #fff);
    /* Opaque scrim, theme tint on top. A curve is a one-pixel line read
       against whatever sits underneath it, and underneath here is a lit 3D
       stage: `--theme-panel-bg` is only 75% opaque, so the performer read
       straight through the lanes and took the curves with him. The literal is
       a scrim beneath the theme colour, not a redefinition of it. */
    background:
      linear-gradient(var(--theme-panel-bg, rgba(0, 0, 0, 0.75)) 0 100%),
      #0a0b12;
    box-shadow: 0 1rem 3.5rem rgba(0, 0, 0, 0.42);
    backdrop-filter: blur(18px);
  }

  .dock-head {
    display: flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.5rem 0.6rem 0.4rem 0.75rem;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .dock-title {
    color: var(--theme-accent, #b0a4ff);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 800;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .dock-scene {
    min-width: 0;
    overflow: hidden;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    font-size: var(--font-size-compact, 0.75rem);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dock-spacer {
    flex: 1 1 auto;
  }

  .dock-action {
    display: inline-flex;
    min-height: 2.75rem;
    min-width: 2.75rem;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    padding: 0 0.7rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: 0.6rem;
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    font: inherit;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
  }

  .dock-action:hover {
    border-color: var(--theme-accent, #9d8cff);
  }

  .dock-action:focus-visible {
    outline: 3px solid var(--theme-accent, #9d8cff);
    outline-offset: 2px;
  }

  /* Two columns that emit the same sequence of rows, so a label always sits
     level with its lane without either column knowing the other's heights. */
  .dock-body {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0 0.6rem;
    overflow-y: auto;
    padding: 0.35rem 0.75rem 0.6rem;
  }

  /* One row-gap, declared on both grids, is what keeps a label level with its
     lane all the way down the list. Spacing a lane with its own margin instead
     made every lane row 0.2rem taller than the gutter row beside it, and the
     two columns drifted a row apart by the bottom of the dock. */
  .gutter,
  .lanes {
    display: grid;
    grid-auto-rows: min-content;
    row-gap: 0.2rem;
  }

  .lanes {
    position: relative;
    min-width: 0;
  }

  .ruler-row {
    height: 1.4rem;
  }

  .ruler {
    position: relative;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .tick {
    position: absolute;
    bottom: 0.1rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
    font-size: var(--font-size-compact, 0.75rem);
    font-variant-numeric: tabular-nums;
    transform: translateX(-50%);
  }

  .tick[data-anchor="start"] {
    transform: none;
  }

  .tick[data-anchor="end"] {
    transform: translateX(-100%);
  }

  .group-row {
    height: var(--group-h, 1.35rem);
    padding-top: 0.4rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 800;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .gutter-row {
    display: grid;
    grid-template-columns: 3.25rem 4.5rem 1.75rem;
    height: var(--lane-h, 2.6rem);
    align-items: center;
    gap: 0.35rem;
  }

  .lane-label {
    overflow: hidden;
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Sized by its column rather than its content: the live value changes every
     frame, and an intrinsic width would shove the lanes on every digit. */
  .lane-value {
    overflow: hidden;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    font-size: var(--font-size-compact, 0.75rem);
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
  }

  .gutter-row.owned .lane-value {
    color: var(--theme-accent, #b0a4ff);
  }

  /* Always present, so promoting a channel does not widen the gutter. */
  .lane-state {
    display: grid;
    width: 1.75rem;
    place-items: center;
  }

  .revert {
    position: relative;
    display: grid;
    width: 1.75rem;
    min-width: 0;
    height: 1.75rem;
    min-height: 0;
    place-items: center;
    padding: 0;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #9d8cff) 55%, transparent);
    border-radius: 0.4rem;
    color: var(--theme-accent, #b0a4ff);
    background: color-mix(
      in srgb,
      var(--theme-accent, #7869eb) 24%,
      transparent
    );
    font-size: var(--font-size-compact, 0.75rem);
    cursor: pointer;
  }

  /* The visible chip stays small enough for a 41px row; the target it answers
     to does not. Expanded horizontally to the design-system floor and
     vertically to just inside the row pitch, so neighbouring rows never
     compete for the same press. */
  .revert::after {
    position: absolute;
    inset: -0.35rem -0.6rem;
    content: "";
  }

  .revert:hover {
    border-color: var(--theme-accent, #9d8cff);
  }

  .revert:focus-visible {
    outline: 3px solid var(--theme-accent, #9d8cff);
    outline-offset: 2px;
  }

  /* A visible edge, not just a wash: against an opaque dock the old 4.5%
     fill left no boundary at all, and a curve riding near the top of one lane
     read as belonging to the lane above it. */
  .lane {
    position: relative;
    height: var(--lane-h, 2.6rem);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.09));
    border-radius: 0.4rem;
    background: rgba(255, 255, 255, 0.05);
    touch-action: none;
    cursor: crosshair;
  }

  .lane:hover {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #9d8cff) 45%,
      transparent
    );
    background: rgba(255, 255, 255, 0.085);
  }

  .lane.owned {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #9d8cff) 55%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--theme-accent, #7869eb) 16%,
      rgba(255, 255, 255, 0.05)
    );
  }

  .curve {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .curve path {
    fill: none;
    stroke: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
    stroke-width: 1.5;
    stroke-linecap: round;
  }

  .lane.owned .curve path {
    stroke: var(--theme-accent, #b0a4ff);
    stroke-width: 2;
  }

  /* The lane owns the pointer: hit testing there gives a far bigger grab area
     than a 10px dot, and one code path serves mouse, touch and pen. These stay
     buttons so they are reachable and editable from the keyboard. */
  .key {
    position: absolute;
    /* The app's global button floor is a 44px touch target, and it would win
       here because it sets min-width/min-height and this rule only set
       width/height. A lane of fourteen 44px circles is a row of white blobs.
       The floor is met by the lane instead: it owns the pointer, and
       `keyAtPointer` grabs from a radius far larger than any dot. */
    width: 0.625rem;
    min-width: 0;
    height: 0.625rem;
    min-height: 0;
    padding: 0;
    border: 1px solid var(--theme-panel-bg, #10111b);
    border-radius: 50%;
    background: var(--theme-text, #fff);
    pointer-events: none;
    transform: translate(-50%, -50%);
  }

  .lane.owned .key {
    background: var(--theme-accent, #b0a4ff);
  }

  .key:focus-visible {
    outline: 3px solid var(--theme-accent, #9d8cff);
    outline-offset: 2px;
    pointer-events: auto;
  }

  .playhead {
    position: absolute;
    top: 1.4rem;
    bottom: 0;
    width: 2px;
    background: var(--theme-accent, #9d8cff);
    pointer-events: none;
    transform: translateX(-1px);
  }

  /* Short and wide, and small: the list loses lane height before it loses
     channels, and the gutter loses its numbers before it loses its names. A
     1080-tall window cannot hold eleven roomy lanes and still leave a stage
     worth watching, so the lanes give the height back rather than pushing Roll
     off the bottom. */
  @media (max-height: 75rem) {
    .channel-dock {
      --lane-h: 2.05rem;
    }
  }

  @media (max-height: 60rem) {
    .channel-dock {
      --lane-h: 1.8rem;
      --group-h: 1.05rem;
    }
  }

  @media (max-height: 34rem) {
    .channel-dock {
      --lane-h: 1.6rem;
      --group-h: 0.95rem;
    }
  }

  /* A window this short cannot stack eleven lanes and a watchable stage, and a
     bottom dock in one leaves the shot a fifty-pixel letterbox. Where there is
     width to spare the dock recomposes into a side rail: the list takes the
     full height of the window and scrolls for whatever is left over, and the
     picture keeps real area beside it instead of a strip behind it. */
  @media (max-height: 34rem) and (min-width: 48rem) {
    .channel-dock {
      top: max(0.75rem, env(safe-area-inset-top));
      left: auto;
      width: min(26rem, 46vw);
      max-height: none;
    }

    .gutter-row {
      grid-template-columns: 3.25rem 1.75rem;
    }

    .lane-value {
      display: none;
    }
  }

  /* The narrow gutter drops its live numbers rather than its names. What it
     saves goes straight back into the name column, because "Height" clipped to
     "Hei..." beside a revert chip is a worse row than a lane sixteen pixels
     shorter. */
  @media (max-width: 34rem) {
    .gutter-row {
      grid-template-columns: 3.6rem 1.75rem;
    }

    .lane-value {
      display: none;
    }
  }
</style>
