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
    type PostVideoItem,
  } from "$lib/shared/media-composition/domain/post-project";
  import {
    moveOverlayItem,
    setItemFill,
    setVideoSpeed,
    trimItem,
    updateItem,
    type PostItemPatch,
  } from "$lib/shared/media-composition/domain/post-project-edits";
  import {
    applyLook,
    lookOf,
    type PostLook,
  } from "$lib/shared/media-composition/domain/post-project-looks";
  import type { PostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
  import ScrubbableNumber from "$lib/shared/ui/components/ScrubbableNumber.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { formatTakeClock } from "../builder/post-builder-format";
  import { itemDisplayLabel, itemIcon, itemKindLabel } from "./post-editor-labels";

  /**
   * The selected item's settings. Every change is an ordinary edit, so undo
   * takes it back; a slider dragged through many values undoes in one step.
   */
  interface Props {
    editor: PostEditorState;
    item: PostItem;
    onTapBeats: (clip: PostVideoItem) => void;
  }

  let { editor, item, onTapBeats }: Props = $props();

  const FRAME_SECONDS = 1 / POST_FRAME_RATE;
  const SPEED_PRESETS = [0.25, 0.5, 1, 2] as const;

  const trackIndex = $derived(findItem(editor.project, item.id)?.trackIndex ?? 0);
  const onMain = $derived(trackIndex === 0);
  const locked = $derived(editor.isLocked(item.id));
  /** An overlay spanning its clip takes its times from the clip. */
  const follows = $derived(!onMain && item.fill);
  const take = $derived(
    item.kind === "video"
      ? (editor.takes.find((entry) => entry.id === item.takeId) ?? null)
      : null
  );
  const look = $derived(
    item.kind === "video" && onMain ? lookOf(editor.project, item.id) : null
  );
  const playheadInside = $derived(
    editor.previewSeconds - item.start > POST_MIN_ITEM_SECONDS + POST_TIME_EPSILON &&
      itemEnd(item) - editor.previewSeconds > POST_MIN_ITEM_SECONDS + POST_TIME_EPSILON
  );

  function change(field: string, patch: PostItemPatch): void {
    if (locked) return;
    editor.editSetting(`${item.id}:${field}`, (project, ctx) =>
      updateItem(project, item.id, patch, ctx)
    );
  }

  function rename(value: string): void {
    if (locked) return;
    const label = value.trim();
    editor.edit((project, ctx) =>
      updateItem(project, item.id, { label: label || null }, ctx)
    );
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

  function setStart(seconds: number): void {
    if (locked) return;
    editor.editSetting(`${item.id}:start`, (project, ctx) =>
      moveOverlayItem(project, item.id, { start: seconds, trackIndex }, ctx)
    );
  }

  function setSpeed(speed: number): void {
    if (locked) return;
    editor.editSetting(`${item.id}:speed`, (project, ctx) =>
      setVideoSpeed(project, item.id, speed, ctx)
    );
  }

  function setLook(next: PostLook): void {
    if (locked) return;
    editor.edit((project, ctx) => applyLook(project, item.id, next, ctx));
  }

  function toggleFill(): void {
    if (locked) return;
    editor.edit((project, ctx) => setItemFill(project, item.id, !item.fill, ctx));
  }

  function place(box: PostBox): void {
    if (locked) return;
    editor.edit((project, ctx) => updateItem(project, item.id, { box }, ctx));
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

  const placements = $derived.by((): { id: string; label: string; box: PostBox }[] => {
    switch (item.kind) {
      case "video":
        return [
          { id: "full", label: t("post_editor_place_full"), box: POST_BOX.full },
          { id: "top", label: t("post_editor_place_top_half"), box: POST_BOX.top },
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
          { id: "top", label: t("post_editor_place_top_half"), box: POST_BOX.top },
          { id: "full", label: t("post_editor_place_full"), box: POST_BOX.full },
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
          { id: "full", label: t("post_editor_place_full"), box: POST_BOX.full },
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
          { id: "top", label: t("post_editor_place_top"), box: textBox("top") },
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
          { id: "full", label: t("post_editor_place_full"), box: POST_BOX.full },
        ];
    }
  });

  const LOOKS = $derived<{ value: PostLook; label: string }[]>([
    { value: "dual", label: t("post_editor_look_dual") },
    { value: "breakdown", label: t("post_editor_look_breakdown") },
    { value: "full", label: t("post_editor_look_full") },
  ]);

  const MOVES_MODES = $derived<
    { value: PostMovesMode; label: string; disabled: boolean }[]
  >([
    { value: "arrows", label: t("post_editor_moves_arrows"), disabled: locked },
    { value: "mandala", label: t("post_editor_moves_mandala"), disabled: locked },
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

  const percent = (value: number) => `${Math.round(value)}`;
  const seconds = (value: number) => value.toFixed(2);
</script>

<div class="item-settings">
  <header class="head">
    <i class="fa-solid {itemIcon(item)} kind-icon" aria-hidden="true"></i>
    <div class="head-text">
      <input
        class="name"
        value={item.label ?? ""}
        placeholder={itemDisplayLabel({ ...item, label: undefined }, editor.project)}
        maxlength={POST_MAX_LABEL_LENGTH}
        aria-label={t("post_editor_item_name")}
        disabled={locked}
        onchange={(event) => rename(event.currentTarget.value)}
      />
      <p class="meta">
        {itemKindLabel(item.kind, item.kind === "moves" ? item.mode : undefined)}
        · {formatTakeClock(item.start)} – {formatTakeClock(itemEnd(item))}
      </p>
    </div>
  </header>

  {#if locked}
    <p class="note" role="status">{t("post_editor_locked_note")}</p>
  {/if}

  <!-- Time -->
  <section class="group" aria-labelledby="{item.id}-time">
    <h3 id="{item.id}-time">{t("post_editor_time")}</h3>
    {#if item.kind === "video" && locked}
      <p class="meta">
        {t("post_editor_in")} {formatTakeClock(item.sourceIn)} · {t(
          "post_editor_out"
        )}
        {formatTakeClock(item.sourceOut)}
      </p>
    {:else if item.kind === "video"}
      <div class="row">
        <ScrubbableNumber
          label={t("post_editor_in")}
          value={item.sourceIn}
          min={0}
          max={Math.max(0, item.sourceOut - POST_MIN_ITEM_SECONDS * item.speed)}
          step={FRAME_SECONDS}
          format={formatTakeClock}
          onchange={(value) => change("sourceIn", { sourceIn: value })}
        />
        <FilterChipBase
          mode="action"
          icon="fa-solid fa-arrow-right-to-bracket"
          label={t("post_editor_in_at_playhead")}
          disabled={locked || !playheadInside}
          onclick={() => trimToPlayhead("start")}
        />
      </div>
      <div class="row">
        <ScrubbableNumber
          label={t("post_editor_out")}
          value={item.sourceOut}
          min={item.sourceIn + POST_MIN_ITEM_SECONDS * item.speed}
          max={take?.durationSeconds ?? item.sourceOut}
          step={FRAME_SECONDS}
          format={formatTakeClock}
          onchange={(value) => change("sourceOut", { sourceOut: value })}
        />
        <FilterChipBase
          mode="action"
          icon="fa-solid fa-arrow-right-from-bracket"
          label={t("post_editor_out_at_playhead")}
          disabled={locked || !playheadInside}
          onclick={() => trimToPlayhead("end")}
        />
      </div>
      <p class="hint">{t("post_editor_in_out_hint")}</p>
    {:else}
      {#if !onMain && !follows && !locked}
        <div class="row">
          <ScrubbableNumber
            label={t("post_editor_start")}
            value={item.start}
            min={0}
            max={Math.max(0, editor.durationSeconds)}
            step={FRAME_SECONDS}
            format={formatTakeClock}
            onchange={setStart}
          />
        </div>
      {/if}
      {#if !follows && !locked}
        <div class="row">
          <ScrubbableNumber
            label={t("post_editor_length")}
            value={item.duration}
            min={POST_MIN_ITEM_SECONDS}
            max={600}
            step={FRAME_SECONDS}
            format={formatTakeClock}
            onchange={(value) => change("duration", { duration: value })}
          />
        </div>
        <div class="chips">
          {#if !onMain}
            <FilterChipBase
              mode="action"
              icon="fa-solid fa-arrow-right-to-bracket"
              label={t("post_editor_start_at_playhead")}
              disabled={!playheadInside}
              onclick={() => trimToPlayhead("start")}
            />
          {/if}
          <FilterChipBase
            mode="action"
            icon="fa-solid fa-arrow-right-from-bracket"
            label={t("post_editor_end_at_playhead")}
            disabled={!playheadInside}
            onclick={() => trimToPlayhead("end")}
          />
        </div>
      {/if}
      {#if !onMain}
        <div class="chips">
          <FilterChipBase
            mode="toggle"
            icon="fa-solid fa-link"
            label={t("post_editor_follow_clip")}
            active={item.fill}
            disabled={locked}
            onclick={toggleFill}
          />
        </div>
        <p class="hint">
          {item.fill
            ? t("post_editor_follow_clip_on_hint")
            : t("post_editor_follow_clip_off_hint")}
        </p>
      {/if}
    {/if}
  </section>

  {#if item.kind === "video"}
    {@const clip = item}
    {#if look !== null}
      <section class="group" aria-labelledby="{item.id}-look">
        <h3 id="{item.id}-look">{t("post_editor_look")}</h3>
        <div class="chips">
          {#each LOOKS as option (option.value)}
            <FilterChipBase
              mode="toggle"
              label={option.label}
              active={look === option.value}
              disabled={locked}
              onclick={() => setLook(option.value)}
            />
          {/each}
        </div>
        <p class="hint">{t("post_editor_look_hint")}</p>
      </section>
    {/if}

    <section class="group" aria-labelledby="{item.id}-beats">
      <h3 id="{item.id}-beats">{t("post_editor_beats")}</h3>
      <p class="hint">{t("post_editor_beats_clip_hint")}</p>
      <div class="row">
        <PanelButton
          onclick={() => onTapBeats(clip)}
          disabled={!editor.mediaUrl(clip.takeId)}
        >
          <i class="fa-solid fa-drum" aria-hidden="true"></i>
          {t("post_editor_tap_beats")}
        </PanelButton>
        <span class="meta">
          {take ? take.label : t("share_studio_deep_take")}
        </span>
      </div>
    </section>

    <section class="group" aria-labelledby="{item.id}-speed">
      <h3 id="{item.id}-speed">{t("post_editor_speed_and_sound")}</h3>
      <div class="row">
        <div class="lockable" inert={locked}>
          <ScrubbableNumber
            label={t("post_editor_speed")}
            value={clip.speed}
            min={POST_MIN_SPEED}
            max={POST_MAX_SPEED}
            step={0.05}
            unit="×"
            onchange={setSpeed}
          />
        </div>
      </div>
      <div class="chips">
        {#each SPEED_PRESETS as speed (speed)}
          <FilterChipBase
            mode="toggle"
            label={`${speed}×`}
            active={Math.abs(clip.speed - speed) < 1e-6}
            disabled={locked}
            onclick={() => setSpeed(speed)}
          />
        {/each}
      </div>
      <div class="row">
        <div class="lockable" inert={locked}>
          <ScrubbableNumber
            label={t("post_editor_volume")}
            value={clip.volume * 100}
            min={0}
            max={POST_MAX_VOLUME * 100}
            step={1}
            unit="%"
            format={percent}
            onchange={(value) => change("volume", { volume: value / 100 })}
          />
        </div>
        <FilterChipBase
          mode="toggle"
          icon="fa-solid fa-volume-xmark"
          label={t("post_editor_mute")}
          active={clip.volume === 0}
          disabled={locked}
          onclick={() => {
            if (locked) return;
            editor.edit((project, ctx) =>
              updateItem(
                project,
                clip.id,
                { volume: clip.volume === 0 ? 1 : 0 },
                ctx
              )
            );
          }}
        />
      </div>
      {#if editor.project.audio === "silent"}
        <p class="hint">{t("post_editor_post_is_silent")}</p>
      {/if}
    </section>

    <section class="group" aria-labelledby="{item.id}-framing">
      <h3 id="{item.id}-framing">{t("post_editor_framing")}</h3>
      <SegmentedControl
        options={[
          { value: "cover", label: t("post_editor_fit_cover"), disabled: locked },
          {
            value: "contain",
            label: t("post_editor_fit_contain"),
            disabled: locked,
          },
        ]}
        value={clip.fit}
        onchange={(fit) => {
          if (locked) return;
          editor.edit((project, ctx) => updateItem(project, clip.id, { fit }, ctx));
        }}
        size="sm"
        ariaLabel={t("post_editor_fit")}
      />
      <div class="grid">
        <div class="lockable" inert={locked}>
          <ScrubbableNumber
            label={t("post_editor_zoom")}
            value={clip.zoom * 100}
            min={POST_MIN_ZOOM * 100}
            max={POST_MAX_ZOOM * 100}
            step={1}
            unit="%"
            format={percent}
            onchange={(value) => change("zoom", { zoom: value / 100 })}
          />
        </div>
        <div class="lockable" inert={locked}>
          <ScrubbableNumber
            label={t("post_editor_rotation")}
            value={clip.rotation}
            min={-180}
            max={180}
            step={1}
            unit="°"
            format={percent}
            onchange={(value) => change("rotation", { rotation: value })}
          />
        </div>
        <div class="lockable" inert={locked}>
          <ScrubbableNumber
            label={t("post_editor_pan_x")}
            value={clip.panX * 100}
            min={-50}
            max={50}
            step={1}
            unit="%"
            format={percent}
            onchange={(value) => change("panX", { panX: value / 100 })}
          />
        </div>
        <div class="lockable" inert={locked}>
          <ScrubbableNumber
            label={t("post_editor_pan_y")}
            value={clip.panY * 100}
            min={-50}
            max={50}
            step={1}
            unit="%"
            format={percent}
            onchange={(value) => change("panY", { panY: value / 100 })}
          />
        </div>
      </div>
      <div class="chips">
        <FilterChipBase
          mode="toggle"
          icon="fa-solid fa-left-right"
          label={t("post_editor_flip")}
          active={clip.flip}
          disabled={locked}
          onclick={() => {
            if (locked) return;
            editor.edit((project, ctx) =>
              updateItem(project, clip.id, { flip: !clip.flip }, ctx)
            );
          }}
        />
        <FilterChipBase
          mode="action"
          icon="fa-solid fa-arrows-rotate"
          label={t("post_editor_reset_framing")}
          disabled={locked ||
            (clip.fit === "cover" &&
              clip.zoom === 1 &&
              clip.panX === 0 &&
              clip.panY === 0 &&
              clip.rotation === 0 &&
              !clip.flip)}
          onclick={() => {
            if (locked) return;
            editor.edit((project, ctx) =>
              updateItem(
                project,
                clip.id,
                {
                  fit: "cover",
                  zoom: 1,
                  panX: 0,
                  panY: 0,
                  rotation: 0,
                  flip: false,
                },
                ctx
              )
            );
          }}
        />
      </div>
    </section>
  {:else if item.kind === "animation"}
    {@const animation = item}
    <section class="group" aria-labelledby="{item.id}-animation">
      <h3 id="{item.id}-animation">{itemKindLabel("animation")}</h3>
      <div class="chips">
        <FilterChipBase
          mode="toggle"
          icon="fa-solid fa-hashtag"
          label={t("share_studio_deep_beat_and_letter")}
          active={animation.overlay}
          disabled={locked}
          onclick={() => {
            if (locked) return;
            editor.edit((project, ctx) =>
              updateItem(
                project,
                animation.id,
                { overlay: !animation.overlay },
                ctx
              )
            );
          }}
        />
      </div>
    </section>
  {:else if item.kind === "moves"}
    {@const moves = item}
    <section class="group" aria-labelledby="{item.id}-moves">
      <h3 id="{item.id}-moves">{t("post_editor_moves_show")}</h3>
      <SegmentedControl
        options={MOVES_MODES}
        value={moves.mode}
        onchange={(mode) => {
          if (locked) return;
          editor.edit((project, ctx) =>
            updateItem(project, moves.id, { mode }, ctx)
          );
        }}
        size="sm"
        ariaLabel={t("post_editor_moves_show")}
      />
    </section>
  {:else if item.kind === "text"}
    {@const text = item}
    <section class="group" aria-labelledby="{item.id}-text">
      <h3 id="{item.id}-text">{itemKindLabel("text")}</h3>
      <textarea
        class="text-field"
        value={text.text}
        maxlength={POST_MAX_TEXT_LENGTH}
        rows="3"
        aria-label={t("post_editor_text_words")}
        disabled={locked}
        oninput={(event) =>
          change("text", { text: event.currentTarget.value })}
      ></textarea>
      <SegmentedControl
        options={TEXT_SIZES}
        value={text.size}
        onchange={(size) => {
          if (locked) return;
          editor.edit((project, ctx) =>
            updateItem(project, text.id, { size }, ctx)
          );
        }}
        size="sm"
        ariaLabel={t("post_editor_text_size")}
      />
    </section>
  {/if}

  <section class="group" aria-labelledby="{item.id}-place">
    <h3 id="{item.id}-place">{t("post_editor_placement")}</h3>
    <div class="chips">
      {#each placements as option (option.id)}
        <FilterChipBase
          mode="toggle"
          label={option.label}
          active={sameBox(item.box, option.box)}
          disabled={locked}
          onclick={() => place(option.box)}
        />
      {/each}
    </div>
    <p class="hint">{t("post_editor_placement_hint")}</p>
    <div class="grid">
      <div class="lockable" inert={locked}>
        <ScrubbableNumber
          label={t("post_editor_opacity")}
          value={item.opacity * 100}
          min={0}
          max={100}
          step={1}
          unit="%"
          format={percent}
          onchange={(value) => change("opacity", { opacity: value / 100 })}
        />
      </div>
      <div class="lockable" inert={locked}>
        <ScrubbableNumber
          label={t("post_editor_fade_in")}
          value={item.fadeIn}
          min={0}
          max={Math.max(0, item.duration / 2)}
          step={0.05}
          unit=" s"
          format={seconds}
          onchange={(value) => change("fadeIn", { fadeIn: value })}
        />
      </div>
      <div class="lockable" inert={locked}>
        <ScrubbableNumber
          label={t("post_editor_fade_out")}
          value={item.fadeOut}
          min={0}
          max={Math.max(0, item.duration / 2)}
          step={0.05}
          unit=" s"
          format={seconds}
          onchange={(value) => change("fadeOut", { fadeOut: value })}
        />
      </div>
    </div>
  </section>
</div>

<style>
  .item-settings,
  .group {
    display: grid;
    gap: 0.625rem;
    min-width: 0;
  }

  .item-settings {
    gap: 1.125rem;
  }

  .head {
    display: flex;
    align-items: flex-start;
    gap: 0.625rem;
    min-width: 0;
  }

  .kind-icon {
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    flex: none;
    border-radius: 0.5rem;
    color: var(--theme-accent, #d4813a);
    background: color-mix(in srgb, var(--theme-accent, #d4813a) 14%, transparent);
  }

  .head-text {
    display: grid;
    gap: 0.125rem;
    min-width: 0;
    flex: 1;
  }

  .name,
  .text-field {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    border: 1px solid var(--theme-stroke, #484755);
    border-radius: 0.5rem;
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg);
    font: inherit;
  }

  .name {
    min-height: var(--min-touch-target, 44px);
    padding: 0 0.625rem;
    font-size: 1rem;
    font-weight: 600;
  }

  .text-field {
    min-height: 5.5rem;
    padding: 0.5rem 0.625rem;
    font-size: 1rem;
    line-height: 1.4;
    resize: vertical;
  }

  .name:focus-visible,
  .text-field:focus-visible {
    outline: 2px solid var(--theme-accent, currentColor);
    outline-offset: 1px;
  }

  h3 {
    margin: 0;
    color: var(--theme-text, #fff);
    font-size: 0.9375rem;
  }

  .row,
  .chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(12rem, 1fr));
    gap: 0.5rem;
    min-width: 0;
  }

  /* Wraps a ScrubbableNumber so a locked item can go read-only: the control
     has no disabled prop of its own, so `inert` blocks its drag, click and
     arrow-key handling instead, and the dimmed opacity matches the disabled
     look of the chip and segmented controls elsewhere in this panel. */
  .lockable {
    display: inline-flex;
    min-width: 0;
  }

  .lockable[inert] {
    opacity: 0.5;
  }

  .meta,
  .hint,
  .note {
    margin: 0;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.8125rem;
    line-height: 1.4;
  }

  .meta {
    font-variant-numeric: tabular-nums;
  }

  .note {
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--semantic-warning, #fbbf24);
    border-radius: 0.5rem;
    color: var(--theme-text, #fff);
  }
</style>
