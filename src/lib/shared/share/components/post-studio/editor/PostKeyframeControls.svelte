<!--
  PostKeyframeControls.svelte

  The previous / diamond / next keyframe navigator and Curve chip for one
  animatable channel (framing, box or opacity) of the selected item. The
  chevrons seek to the nearest in-view keyframe; the diamond adds one at the
  playhead recording the value currently showing, or removes the one already
  there, and its plus or minus says which a press will do. The Curve chip opens the segment under the playhead: easing presets
  plus PostCurveEditor for fine control, in a popover that closes on Escape
  or a press anywhere outside it.

  The add, seek and curve controls require the playhead inside the item.
  Clearing remains available wherever the playhead is.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import {
    POST_TIME_EPSILON,
    itemEnd,
    type PostItem,
    type PostKeyframeChannel,
  } from "$lib/shared/media-composition/domain/post-project";
  import {
    EASING_PRESETS,
    adjacentKeyframeSeconds,
    easingPresetOf,
    keyframeIndexAt,
    segmentAt,
    setSegmentEasing,
    toggleKeyframe,
    keyframeCount,
    clearChannel,
    type PostEasingPresetId,
  } from "$lib/shared/media-composition/domain/post-project-keyframes";
  import { editItemKeyframes } from "$lib/shared/media-composition/domain/post-project-edits";
  import type { PostEdit } from "$lib/shared/media-composition/state/post-editor-state.svelte";
  import type { PostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
  import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import ChipPopoverOption from "$lib/shared/browse/components/filter-chips/ChipPopoverOption.svelte";
  import PostCurveEditor from "./PostCurveEditor.svelte";
  import { formatPostClock } from "../builder/post-builder-format";
  import { easingPresetLabel } from "./post-editor-labels";

  interface Props {
    editor: PostEditorState;
    item: PostItem;
    channel: PostKeyframeChannel;
    locked: boolean;
    /** Whether the Curve popover is open; a keyframe row's curve opens it. */
    curveOpen?: boolean;
    /** Names the channel beside the buttons where no panel title does. */
    label?: string;
    onCleared: (count: number, edit: PostEdit) => void;
  }

  let {
    editor,
    item,
    channel,
    locked,
    curveOpen = $bindable(false),
    label,
    onCleared,
  }: Props = $props();

  const PRESET_IDS = Object.keys(EASING_PRESETS) as PostEasingPresetId[];

  const seconds = $derived(editor.previewSeconds);
  const count = $derived(keyframeCount(item, channel));
  const withinSpan = $derived(
    seconds >= item.start - POST_TIME_EPSILON &&
      seconds <= itemEnd(item) + POST_TIME_EPSILON
  );
  const previous = $derived(
    adjacentKeyframeSeconds(item, channel, seconds, "previous")
  );
  const next = $derived(
    adjacentKeyframeSeconds(item, channel, seconds, "next")
  );
  const hasKeyframeHere = $derived(
    keyframeIndexAt(item, channel, seconds) >= 0
  );
  const segment = $derived(segmentAt(item, channel, seconds));
  const curveLabel = $derived(
    segment
      ? t("post_timeline_item_time_range", {
          start: formatPostClock(segment.fromSeconds),
          end: formatPostClock(segment.toSeconds),
        })
      : ""
  );
  const curveName = $derived(
    t("post_keyframe_curve_for_range", { range: curveLabel })
  );
  const presetId = $derived(segment ? easingPresetOf(segment.easing) : null);
  const chipLabel = $derived.by(() => {
    const id = presetId;
    if (id === null) return "";
    return id === "custom" ? t("post_curve_custom") : easingPresetLabel(id);
  });

  let curveWrapperEl: HTMLDivElement | null = $state(null);

  // The chip goes away when the playhead leaves the item or its keyframes
  // stop forming a segment; closing then keeps the popover from springing
  // back open by itself when a segment next appears.
  $effect(() => {
    if (curveOpen && (!withinSpan || !segment)) curveOpen = false;
  });

  // A press anywhere outside the chip and its popover closes it, as the
  // browse filter chips do. Capture phase, so a control that stops its own
  // pointerdown from bubbling still counts as outside.
  $effect(() => {
    if (!curveOpen) return;
    function closeOnOutsidePress(event: PointerEvent): void {
      const target = event.target;
      if (target instanceof Node && curveWrapperEl?.contains(target)) return;
      curveOpen = false;
    }
    document.addEventListener("pointerdown", closeOnOutsidePress, true);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePress, true);
  });

  function seekTo(value: number | null): void {
    if (value === null) return;
    editor.seek(value);
  }

  function toggleHere(): void {
    if (locked || !withinSpan) return;
    editor.edit((project, ctx) =>
      editItemKeyframes(
        project,
        item.id,
        (it) => toggleKeyframe(it, channel, seconds),
        ctx
      )
    );
  }

  function commitCurve(next: [number, number, number, number]): void {
    if (locked || !segment) return;
    const index = segment.index;
    editor.editSetting(
      `${item.id}:${channel}:easing:${index}`,
      (project, ctx) =>
        editItemKeyframes(
          project,
          item.id,
          (it) =>
            setSegmentEasing(it, channel, editor.previewSeconds, [...next]),
          ctx
        )
    );
  }

  function choosePreset(id: PostEasingPresetId): void {
    if (locked || !segment) return;
    const easing = EASING_PRESETS[id];
    const at = seconds;
    editor.edit((project, ctx) =>
      editItemKeyframes(
        project,
        item.id,
        (it) => setSegmentEasing(it, channel, at, easing),
        ctx
      )
    );
  }

  function clearKeys(): void {
    if (locked || count === 0) return;
    const edit: PostEdit = (project, ctx) =>
      editItemKeyframes(
        project,
        item.id,
        (it) => clearChannel(it, channel, seconds),
        ctx
      );
    onCleared(count, edit);
  }
</script>

{#if withinSpan || count > 0}
  <div class="keyframe-controls">
    {#if label}
      <span class="kf-label"
        >{label} · {t("post_keyframe_count", { count })}</span
      >
    {/if}
    {#if count > 0}
      <button
        class="kf-clear"
        type="button"
        disabled={locked}
        onclick={clearKeys}
        aria-label={`${t("post_keyframe_clear")} ${label ?? channel}: ${count}`}
        >{t("post_keyframe_clear")}</button
      >
    {/if}
    {#if withinSpan}
      <div class="kf-nav" role="group" aria-label={t("post_keyframe_nav")}>
        <button
          class="kf-btn kf-step"
          type="button"
          disabled={previous === null}
          onclick={() => seekTo(previous)}
          aria-label={t("post_keyframe_previous")}
          title={t("post_keyframe_previous")}
        >
          <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
        </button>
        <button
          class="kf-btn kf-diamond"
          class:active={hasKeyframeHere}
          type="button"
          disabled={locked}
          aria-pressed={hasKeyframeHere}
          aria-label={t(
            hasKeyframeHere ? "post_keyframe_remove" : "post_keyframe_add"
          )}
          title={t(
            hasKeyframeHere ? "post_keyframe_remove" : "post_keyframe_add"
          )}
          onclick={toggleHere}
        >
          <i class="fa-solid fa-diamond" aria-hidden="true"></i>
          <i
            class="kf-badge fa-solid {hasKeyframeHere ? 'fa-minus' : 'fa-plus'}"
            aria-hidden="true"
          ></i>
        </button>
        <button
          class="kf-btn kf-step"
          type="button"
          disabled={next === null}
          onclick={() => seekTo(next)}
          aria-label={t("post_keyframe_next")}
          title={t("post_keyframe_next")}
        >
          <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
        </button>
      </div>
      {#if segment}
        <div class="curve-chip-wrapper" bind:this={curveWrapperEl}>
          <FilterChipBase
            mode="dropdown"
            popupRole="dialog"
            popupLabel={curveName}
            icon="fa-solid fa-wave-square"
            label={chipLabel}
            ariaLabel={curveName}
            size="sm"
            disabled={locked}
            expanded={curveOpen}
            onclick={() => (curveOpen = !curveOpen)}
            ondismiss={() => (curveOpen = false)}
          >
            {#snippet children()}
              <div class="curve-popover">
                <p class="curve-range">{curveLabel}</p>
                <PostCurveEditor
                  easing={segment.easing}
                  {locked}
                  onCommit={commitCurve}
                >
                  {#snippet presets()}
                    <div
                      class="preset-list"
                      role="listbox"
                      aria-label={t("post_curve_presets")}
                    >
                      {#each PRESET_IDS as id (id)}
                        <ChipPopoverOption
                          label={easingPresetLabel(id)}
                          selected={presetId === id}
                          onclick={() => choosePreset(id)}
                        />
                      {/each}
                    </div>
                  {/snippet}
                </PostCurveEditor>
              </div>
            {/snippet}
          </FilterChipBase>
        </div>
      {/if}
    {/if}
  </div>
{/if}

<style>
  .keyframe-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .kf-label {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
    white-space: nowrap;
  }

  .kf-clear {
    border: 0;
    background: none;
    color: var(--theme-text-secondary, #aaa);
    cursor: pointer;
    min-height: var(--min-touch-target, 44px);
    min-width: var(--min-touch-target, 44px);
  }

  .kf-clear:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .kf-clear:focus-visible {
    outline: 2px solid var(--theme-accent, currentColor);
  }

  .kf-nav {
    display: flex;
    align-items: center;
    gap: 0.125rem;
  }

  /* Matches the icon-only round controls used elsewhere in the post-studio
     editor (no shared primitive exists yet - see never-hand-roll.md); kept
     local rather than introducing a new shared component for three buttons. */
  .kf-btn {
    display: grid;
    place-items: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 0.5rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text-dim);
    font-size: 0.9375rem;
    cursor: pointer;
    transition:
      background var(--transition-fast),
      color var(--transition-fast),
      opacity var(--transition-fast);
  }

  @media (hover: hover) {
    .kf-btn:not(:disabled):hover {
      background: color-mix(
        in srgb,
        var(--theme-accent, #d4813a) 10%,
        transparent
      );
      color: var(--theme-text, #fff);
    }
  }

  .kf-btn:focus-visible {
    outline: 2px solid var(--theme-accent, currentColor);
    outline-offset: 1px;
  }

  .kf-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .kf-diamond {
    position: relative;
  }

  .kf-diamond.active {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #d4813a) 50%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--theme-accent, #d4813a) 18%,
      transparent
    );
    color: var(--theme-accent, #d4813a);
  }

  /* Plus adds a keyframe here; minus, on a keyframe, takes it away. */
  .kf-badge {
    position: absolute;
    right: 4px;
    bottom: 4px;
    display: grid;
    place-items: center;
    width: 15px;
    height: 15px;
    border-radius: 50%;
    background: var(--theme-text, #fff);
    color: var(--theme-bg, #101018);
    font-size: 0.5625rem;
  }

  .kf-diamond.active .kf-badge {
    background: var(--semantic-danger, #ff5d5d);
    color: #fff;
  }

  .curve-chip-wrapper {
    position: relative;
  }

  .curve-popover {
    display: grid;
    gap: 0.5rem;
    padding: 0.25rem;
  }

  .curve-range {
    margin: 0;
    padding: 0 0.375rem;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
  }

  .preset-list {
    display: grid;
    gap: 0.125rem;
  }

  @media (prefers-reduced-motion: reduce) {
    .kf-btn {
      transition: none;
    }
  }
</style>
