<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import {
    POST_BOX,
    POST_FRAME_RATE,
    POST_MAX_LABEL_LENGTH,
    POST_MAX_SPEED,
    POST_MAX_TEXT_LENGTH,
    POST_MAX_VOLUME,
    POST_MAX_ZOOM,
    POST_MIN_ITEM_SECONDS,
    POST_MIN_SPEED,
    POST_MIN_ZOOM,
    POST_TIME_EPSILON,
    findItem,
    itemEnd,
    textBox,
    type PostBox,
    type PostItem,
    type PostMovesMode,
    type PostTextSize,
  } from "$lib/shared/media-composition/domain/post-project";
  import {
    setItemFill,
    setTrackFlag,
    setVideoSpeed,
    trimItem,
    updateItem,
    updateItemAt,
    type PostItemPatch,
  } from "$lib/shared/media-composition/domain/post-project-edits";
  import {
    applyLook,
    lookOf,
    type PostLook,
  } from "$lib/shared/media-composition/domain/post-project-looks";
  import {
    boxAt,
    framingAt,
    isAnimated,
    opacityAt,
  } from "$lib/shared/media-composition/domain/post-project-keyframes";
  import type { PostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import ValueSlider from "$lib/shared/ui/components/ValueSlider.svelte";
  import PostKeyframeControls from "./PostKeyframeControls.svelte";
  import { formatTakeClock } from "../builder/post-builder-format";
  import { itemDisplayLabel } from "./post-editor-labels";
  import { panelChannel, type PostPanelToolId } from "./post-editor-tools";
  import {
    STRAIGHTEN_LIMIT,
    joinRotation,
    quarterLeft,
    splitRotation,
    type CropFit,
  } from "./post-crop-geometry";
  import type { CropSession } from "./post-crop-session.svelte";

  /**
   * The body of one tool for the selected item. An amount is a slider, a
   * pick is a segmented control, an action is a button. Every change is an
   * ordinary edit, so undo takes it back; a slider dragged through many
   * values undoes in one step.
   */
  interface Props {
    editor: PostEditorState;
    item: PostItem;
    tool: PostPanelToolId;
    /**
     * The crop screen's session. Crop's controls go through it, so a turn
     * or a zoom keeps the window filled the way a drag on the stage does.
     */
    crop?: CropSession | null;
  }

  let { editor, item, tool, crop = null }: Props = $props();

  const FRAME_SECONDS = 1 / POST_FRAME_RATE;

  const trackIndex = $derived(
    findItem(editor.project, item.id)?.trackIndex ?? 0
  );
  const trackId = $derived(editor.project.tracks[trackIndex]?.id ?? null);
  const onMain = $derived(trackIndex === 0);
  const locked = $derived(editor.isLocked(item.id));
  const seconds = $derived(editor.previewSeconds);

  /** The playhead is on the item: the test the keyframes themselves use. */
  const withinSpan = $derived(
    seconds >= item.start - POST_TIME_EPSILON &&
      seconds <= itemEnd(item) + POST_TIME_EPSILON
  );
  /** Far enough inside that an edge moved to the playhead leaves a piece. */
  const playheadInside = $derived(
    seconds - item.start > POST_MIN_ITEM_SECONDS + POST_TIME_EPSILON &&
      itemEnd(item) - seconds > POST_MIN_ITEM_SECONDS + POST_TIME_EPSILON
  );
  const channel = $derived(panelChannel(tool));
  /** An animated value has no single value to show off the item. */
  const frozen = $derived(
    channel !== null && isAnimated(item, channel) && !withinSpan
  );

  function change(field: string, patch: PostItemPatch): void {
    if (locked) return;
    editor.editSetting(`${item.id}:${field}`, (project, ctx) =>
      updateItemAt(project, item.id, patch, editor.previewSeconds, ctx)
    );
  }

  function patchItem(patch: PostItemPatch): void {
    if (locked) return;
    editor.edit((project, ctx) => updateItem(project, item.id, patch, ctx));
  }

  function rename(value: string): void {
    const label = value.trim();
    patchItem({ label: label || null });
  }

  /** Moves an edge to the playhead and shows the frame now at that edge. */
  function trimToPlayhead(edge: "start" | "end"): void {
    if (locked) return;
    const id = item.id;
    const changed = editor.edit((project, ctx) =>
      trimItem(project, id, edge, editor.previewSeconds, ctx)
    );
    if (!changed) return;
    const trimmed = findItem(editor.project, id)?.item;
    if (!trimmed) return;
    editor.seek(
      edge === "start"
        ? trimmed.start
        : Math.max(trimmed.start, itemEnd(trimmed) - FRAME_SECONDS)
    );
  }

  function setFill(fill: boolean): void {
    if (locked) return;
    editor.edit((project, ctx) => setItemFill(project, item.id, fill, ctx));
  }

  function setSpeed(speed: number): void {
    if (locked) return;
    editor.editSetting(`${item.id}:speed`, (project, ctx) =>
      setVideoSpeed(project, item.id, speed, ctx)
    );
  }

  function setLook(look: PostLook): void {
    if (locked) return;
    editor.edit((project, ctx) => applyLook(project, item.id, look, ctx));
  }

  function place(box: PostBox): void {
    if (locked) return;
    editor.edit((project, ctx) =>
      updateItemAt(project, item.id, { box }, editor.previewSeconds, ctx)
    );
  }

  // ---- Crop: through the crop screen's session when there is one ----------

  function setCropZoom(zoom: number): void {
    if (crop) crop.setZoom(zoom);
    else change("zoom", { zoom });
  }

  function straighten(value: number, quarter: number): void {
    if (crop) crop.setStraighten(value);
    else change("rotation", { rotation: joinRotation(quarter, value) });
  }

  function rotateLeft(quarter: number, value: number): void {
    if (crop) crop.rotateQuarter();
    else
      change("rotation", {
        rotation: joinRotation(quarterLeft(quarter), value),
      });
  }

  function setFit(fit: CropFit): void {
    if (crop) crop.setFit(fit);
    else patchItem({ fit });
  }

  function toggleMirror(): void {
    if (crop) crop.toggleMirror();
    else if (item.kind === "video") patchItem({ flip: !item.flip });
  }

  function unlock(): void {
    const id = trackId;
    if (!id) return;
    editor.edit((project, ctx) =>
      setTrackFlag(project, id, "locked", false, ctx)
    );
  }

  /** Puts the playhead on the item's nearest frame. */
  function goToItem(): void {
    editor.pause();
    editor.seek(
      seconds < item.start
        ? item.start
        : Math.max(item.start, itemEnd(item) - FRAME_SECONDS)
    );
  }

  function sameBox(a: PostBox, b: PostBox): boolean {
    const near = (x: number, y: number) => Math.abs(x - y) < 1e-4;
    return (
      near(a.x, b.x) &&
      near(a.y, b.y) &&
      near(a.width, b.width) &&
      near(a.height, b.height)
    );
  }

  const placements = $derived.by(
    (): { id: string; label: string; box: PostBox }[] => {
      switch (item.kind) {
        case "video":
          return [
            {
              id: "full",
              label: t("post_editor_place_full"),
              box: POST_BOX.full,
            },
            {
              id: "top",
              label: t("post_editor_place_top_half"),
              box: POST_BOX.top,
            },
            {
              id: "above-strip",
              label: t("post_editor_place_above_strip"),
              box: POST_BOX.aboveStrip,
            },
          ];
        case "animation":
          return [
            {
              id: "bottom",
              label: t("post_editor_place_bottom_half"),
              box: POST_BOX.bottom,
            },
            {
              id: "top",
              label: t("post_editor_place_top_half"),
              box: POST_BOX.top,
            },
            {
              id: "full",
              label: t("post_editor_place_full"),
              box: POST_BOX.full,
            },
          ];
        case "moves":
          return [
            {
              id: "strip-square",
              label: t("post_editor_place_strip_square"),
              box: POST_BOX.stripSquare,
            },
            {
              id: "strip-wide",
              label: t("post_editor_place_strip_wide"),
              box: POST_BOX.stripWide,
            },
            {
              id: "full",
              label: t("post_editor_place_full"),
              box: POST_BOX.full,
            },
          ];
        case "carousel":
          return [
            {
              id: "strip-side",
              label: t("post_editor_place_strip_side"),
              box: POST_BOX.stripCarousel,
            },
            {
              id: "strip-wide",
              label: t("post_editor_place_strip_wide"),
              box: POST_BOX.stripWide,
            },
          ];
        case "text":
          return [
            {
              id: "top",
              label: t("post_editor_place_top"),
              box: textBox("top"),
            },
            {
              id: "middle",
              label: t("post_editor_place_middle"),
              box: textBox("middle"),
            },
            {
              id: "bottom",
              label: t("post_editor_place_bottom"),
              box: textBox("bottom"),
            },
          ];
        case "card":
          return [
            {
              id: "full",
              label: t("post_editor_place_full"),
              box: POST_BOX.full,
            },
          ];
      }
    }
  );

  const onlyPlacement = $derived(
    placements.length === 1 ? placements[0]! : null
  );

  const MOVES_MODES = $derived<
    { value: PostMovesMode; label: string; disabled: boolean }[]
  >([
    { value: "arrows", label: t("post_editor_moves_arrows"), disabled: locked },
    {
      value: "mandala",
      label: t("post_editor_moves_mandala"),
      disabled: locked,
    },
    {
      value: "alternate",
      label: t("post_editor_moves_alternate"),
      disabled: locked,
    },
  ]);

  const TEXT_SIZES = $derived<
    { value: PostTextSize; label: string; disabled: boolean }[]
  >([
    { value: "s", label: t("post_editor_text_small"), disabled: locked },
    { value: "m", label: t("post_editor_text_medium"), disabled: locked },
    { value: "l", label: t("post_editor_text_large"), disabled: locked },
  ]);

  const placementNow = $derived(
    placements.find((option) => sameBox(boxAt(item, seconds), option.box))
      ?.id ?? ""
  );

  const percent = (value: number) => `${Math.round(value)}%`;
  const fineDegrees = (value: number) => `${Number(value.toFixed(1))}°`;
  const fadeSeconds = (value: number) => `${value.toFixed(2)} s`;

  /**
   * Speed slides on a doubling scale: 1× sits in the middle, with the same
   * travel to half speed as to double.
   */
  const SPEED_STEP = 0.05;
  const speedFromStop = (stop: number) =>
    Math.min(
      POST_MAX_SPEED,
      Math.max(POST_MIN_SPEED, Math.round(2 ** stop * 100) / 100)
    );
  const formatSpeed = (stop: number) =>
    `${Number(speedFromStop(stop).toFixed(2))}×`;
</script>

{#snippet status(text: string, icon: string, action: string, run: () => void)}
  <div class="status" role="status">
    <p>{text}</p>
    <PanelButton onclick={run}>
      <i class="fa-solid {icon}" aria-hidden="true"></i>
      {action}
    </PanelButton>
  </div>
{/snippet}

{#snippet readout(
  name: string,
  value: string,
  set: { icon: string; run: () => void } | null
)}
  <div class="readout">
    <div class="readout-text">
      <span class="readout-name">{name}</span>
      <span class="readout-value">{value}</span>
    </div>
    {#if set}
      <PanelButton
        onclick={set.run}
        disabled={locked || !playheadInside}
        ariaLabel={`${t("post_editor_set_to_playhead")}: ${name}`}
      >
        <i class="fa-solid {set.icon}" aria-hidden="true"></i>
        {t("post_editor_set_to_playhead")}
      </PanelButton>
    {/if}
  </div>
{/snippet}

<div class="item-tool">
  {#if locked}
    {@render status(
      t("post_editor_layer_locked"),
      "fa-lock-open",
      t("post_editor_unlock_layer"),
      unlock
    )}
  {:else if channel !== null && !withinSpan}
    {@render status(
      t("post_editor_outside_item"),
      "fa-location-crosshairs",
      t("post_editor_go_to_item"),
      goToItem
    )}
  {/if}

  {#if channel !== null}
    <PostKeyframeControls {editor} {item} {channel} {locked} />
  {/if}

  {#if tool === "trim" && item.kind === "video"}
    {@render readout(t("post_editor_in"), formatTakeClock(item.sourceIn), {
      icon: "fa-arrow-right-to-bracket",
      run: () => trimToPlayhead("start"),
    })}
    {@render readout(t("post_editor_out"), formatTakeClock(item.sourceOut), {
      icon: "fa-arrow-right-from-bracket",
      run: () => trimToPlayhead("end"),
    })}
  {:else if tool === "timing"}
    {#if !onMain}
      <SegmentedControl
        color="accent"
        options={[
          {
            value: "clip",
            label: t("post_editor_match_clip"),
            disabled: locked,
          },
          { value: "own", label: t("post_editor_own_time"), disabled: locked },
        ]}
        value={item.fill ? "clip" : "own"}
        onchange={(value) => setFill(value === "clip")}
        ariaLabel={t("post_editor_tool_timing")}
      />
    {/if}
    {#if onMain || !item.fill}
      {#if !onMain}
        {@render readout(t("post_editor_start"), formatTakeClock(item.start), {
          icon: "fa-arrow-right-to-bracket",
          run: () => trimToPlayhead("start"),
        })}
      {/if}
      {@render readout(t("post_editor_end"), formatTakeClock(itemEnd(item)), {
        icon: "fa-arrow-right-from-bracket",
        run: () => trimToPlayhead("end"),
      })}
    {/if}
  {:else if tool === "crop" && item.kind === "video"}
    {@const framing = framingAt(item, seconds)}
    {@const parts = crop?.parts ?? splitRotation(framing.rotation)}
    <ValueSlider
      label={t("post_crop_straighten")}
      value={parts.straighten}
      min={-STRAIGHTEN_LIMIT}
      max={STRAIGHTEN_LIMIT}
      step={0.5}
      origin={0}
      format={fineDegrees}
      disabled={locked || frozen}
      onchange={(value) => straighten(value, parts.quarter)}
    />
    <ValueSlider
      label={t("post_editor_zoom")}
      value={framing.zoom * 100}
      min={POST_MIN_ZOOM * 100}
      max={POST_MAX_ZOOM * 100}
      step={1}
      origin={100}
      format={percent}
      disabled={locked || frozen}
      onchange={(value) => setCropZoom(value / 100)}
    />
    <div class="crop-row">
      <PanelButton
        onclick={() => rotateLeft(parts.quarter, parts.straighten)}
        disabled={locked || frozen}
        ariaLabel={t("post_crop_rotate_left")}
      >
        <i class="fa-solid fa-rotate-left" aria-hidden="true"></i>
        {t("post_crop_rotate")}
      </PanelButton>
      <FilterChipBase
        mode="toggle"
        emphasis="solid"
        icon="fa-solid fa-left-right"
        label={t("post_editor_flip")}
        active={item.flip}
        disabled={locked}
        onclick={toggleMirror}
      />
      <div class="crop-fit">
        <SegmentedControl
          color="accent"
          options={[
            {
              value: "cover",
              label: t("post_editor_fit_cover"),
              disabled: locked,
            },
            {
              value: "contain",
              label: t("post_editor_fit_contain"),
              disabled: locked,
            },
          ]}
          value={item.fit}
          onchange={setFit}
          ariaLabel={t("post_editor_fit")}
        />
      </div>
    </div>
    <p class="hint">{t("post_crop_hint")}</p>
  {:else if tool === "speed" && item.kind === "video"}
    <ValueSlider
      label={t("post_editor_speed")}
      value={Math.log2(item.speed)}
      min={Math.log2(POST_MIN_SPEED)}
      max={Math.log2(POST_MAX_SPEED)}
      step={SPEED_STEP}
      origin={0}
      format={formatSpeed}
      disabled={locked}
      onchange={(stop) => setSpeed(speedFromStop(stop))}
    />
  {:else if tool === "volume" && item.kind === "video"}
    <ValueSlider
      label={t("post_editor_volume")}
      value={item.volume * 100}
      min={0}
      max={POST_MAX_VOLUME * 100}
      step={1}
      format={percent}
      disabled={locked}
      onchange={(value) => change("volume", { volume: value / 100 })}
    />
    {#if editor.project.audio === "silent"}
      {@render status(
        t("post_editor_post_silent"),
        "fa-volume-high",
        t("post_editor_use_video_sound"),
        () => editor.setAudio("takes")
      )}
    {/if}
  {:else if tool === "layout" && item.kind === "video"}
    <SegmentedControl
      color="accent"
      options={[
        { value: "dual", label: t("post_editor_look_dual"), disabled: locked },
        {
          value: "breakdown",
          label: t("post_editor_look_breakdown"),
          disabled: locked,
        },
        { value: "full", label: t("post_editor_look_full"), disabled: locked },
      ]}
      value={lookOf(editor.project, item.id) ?? "custom"}
      onchange={(look) => {
        if (look !== "custom") setLook(look);
      }}
      ariaLabel={t("post_editor_look")}
    />
  {:else if tool === "position"}
    {#if onlyPlacement}
      {@const only = onlyPlacement}
      <div class="actions">
        <PanelButton
          onclick={() => place(only.box)}
          disabled={locked || frozen || placementNow === only.id}
        >
          <i class="fa-solid fa-expand" aria-hidden="true"></i>
          {only.label}
        </PanelButton>
      </div>
    {:else}
      <SegmentedControl
        color="accent"
        options={placements.map((option) => ({
          value: option.id,
          label: option.label,
          disabled: locked || frozen,
        }))}
        value={placementNow}
        onchange={(id) => {
          const option = placements.find((entry) => entry.id === id);
          if (option) place(option.box);
        }}
        ariaLabel={t("post_editor_placement")}
      />
    {/if}
  {:else if tool === "fade"}
    <ValueSlider
      label={t("post_editor_opacity")}
      value={opacityAt(item, seconds) * 100}
      min={0}
      max={100}
      step={1}
      format={percent}
      disabled={locked || frozen}
      onchange={(value) => change("opacity", { opacity: value / 100 })}
    />
    <ValueSlider
      label={t("post_editor_fade_in")}
      value={item.fadeIn}
      min={0}
      max={Math.max(0, item.duration / 2)}
      step={0.05}
      format={fadeSeconds}
      disabled={locked}
      onchange={(value) => change("fadeIn", { fadeIn: value })}
    />
    <ValueSlider
      label={t("post_editor_fade_out")}
      value={item.fadeOut}
      min={0}
      max={Math.max(0, item.duration / 2)}
      step={0.05}
      format={fadeSeconds}
      disabled={locked}
      onchange={(value) => change("fadeOut", { fadeOut: value })}
    />
  {:else if tool === "labels" && item.kind === "animation"}
    <SegmentedControl
      color="accent"
      options={[
        {
          value: "shown",
          label: t("post_editor_labels_shown"),
          disabled: locked,
        },
        {
          value: "hidden",
          label: t("post_editor_labels_hidden"),
          disabled: locked,
        },
      ]}
      value={item.overlay ? "shown" : "hidden"}
      onchange={(value) => patchItem({ overlay: value === "shown" })}
      ariaLabel={t("share_studio_deep_beat_and_letter")}
    />
  {:else if tool === "shows" && item.kind === "moves"}
    <SegmentedControl
      color="accent"
      options={MOVES_MODES}
      value={item.mode}
      onchange={(mode) => patchItem({ mode })}
      ariaLabel={t("post_editor_moves_show")}
    />
  {:else if tool === "text" && item.kind === "text"}
    <textarea
      class="field text-field"
      value={item.text}
      maxlength={POST_MAX_TEXT_LENGTH}
      rows="3"
      aria-label={t("post_editor_text_words")}
      disabled={locked}
      oninput={(event) => change("text", { text: event.currentTarget.value })}
    ></textarea>
    <SegmentedControl
      color="accent"
      options={TEXT_SIZES}
      value={item.size}
      onchange={(size) => patchItem({ size })}
      ariaLabel={t("post_editor_text_size")}
    />
  {:else if tool === "rename"}
    <input
      class="field"
      value={item.label ?? ""}
      placeholder={itemDisplayLabel(
        { ...item, label: undefined },
        editor.project
      )}
      maxlength={POST_MAX_LABEL_LENGTH}
      aria-label={t("post_editor_item_name")}
      disabled={locked}
      onchange={(event) => rename(event.currentTarget.value)}
    />
  {/if}
</div>

<style>
  .item-tool {
    display: grid;
    gap: 1rem;
    min-width: 0;
  }

  .status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 0.75rem;
    padding: 0.5rem 0.5rem 0.5rem 0.75rem;
    border: 1px solid var(--semantic-warning, #fbbf24);
    border-radius: 0.625rem;
  }

  .status p {
    margin: 0;
    color: var(--theme-text, #fff);
    font-size: 0.875rem;
  }

  .readout {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 0.75rem;
    min-width: 0;
  }

  .readout-text {
    display: grid;
  }

  .readout-name {
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.8125rem;
  }

  .readout-value {
    color: var(--theme-text, #fff);
    font-size: 1rem;
    font-variant-numeric: tabular-nums;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  /* Rotate, Mirror and the fit share a line when the panel has room. */
  .crop-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
  }

  .crop-fit {
    flex: 1 1 12rem;
    min-width: 0;
  }

  .hint {
    margin: 0;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .field {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    min-height: var(--min-touch-target, 44px);
    padding: 0 0.625rem;
    border: 1px solid var(--theme-stroke, #484755);
    border-radius: 0.5rem;
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg);
    font: inherit;
    font-size: 1rem;
  }

  .text-field {
    min-height: 5.5rem;
    padding: 0.5rem 0.625rem;
    line-height: 1.4;
    resize: vertical;
  }

  .field:focus-visible {
    outline: 2px solid var(--theme-accent, currentColor);
    outline-offset: 1px;
  }

  .field:disabled {
    opacity: 0.5;
  }
</style>
