<!--
  PostKeyframeControls.svelte

  The previous / diamond / next keyframe navigator and Curve chip for one
  animatable channel (framing, box or opacity) of the selected item. The
  chevrons seek to the nearest in-view keyframe; the diamond adds one at the
  playhead recording the value currently showing, or removes the one already
  there. The Curve chip opens the segment under the playhead: easing presets
  plus PostCurveEditor for fine control.

  Renders nothing while the playhead sits outside the item - the spec calls
  animated values read-only there, and there is nothing to seek to, toggle or
  ease at a time the item isn't even showing.
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
    type PostEasingPresetId,
  } from "$lib/shared/media-composition/domain/post-project-keyframes";
  import { editItemKeyframes } from "$lib/shared/media-composition/domain/post-project-edits";
  import type { PostEditorState } from "$lib/shared/media-composition/state/post-editor-state.svelte";
  import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import ChipPopoverOption from "$lib/shared/browse/components/filter-chips/ChipPopoverOption.svelte";
  import PostCurveEditor from "./PostCurveEditor.svelte";
  import { formatPostClock } from "../builder/post-builder-format";

  interface Props {
    editor: PostEditorState;
    item: PostItem;
    channel: PostKeyframeChannel;
    locked: boolean;
  }

  let { editor, item, channel, locked }: Props = $props();

  const PRESET_IDS = Object.keys(EASING_PRESETS) as PostEasingPresetId[];

  const seconds = $derived(editor.previewSeconds);
  const withinSpan = $derived(
    seconds >= item.start - POST_TIME_EPSILON &&
      seconds <= itemEnd(item) + POST_TIME_EPSILON
  );
  const previous = $derived(adjacentKeyframeSeconds(item, channel, seconds, "previous"));
  const next = $derived(adjacentKeyframeSeconds(item, channel, seconds, "next"));
  const hasKeyframeHere = $derived(keyframeIndexAt(item, channel, seconds) >= 0);
  const segment = $derived(segmentAt(item, channel, seconds));
  const curveLabel = $derived(
    segment
      ? t("post_timeline_item_time_range", {
          start: formatPostClock(segment.fromSeconds),
          end: formatPostClock(segment.toSeconds),
        })
      : ""
  );
  const presetId = $derived(segment ? easingPresetOf(segment.easing) : null);
  const chipLabel = $derived.by(() => {
    const id = presetId;
    if (id === null) return "";
    return id === "custom" ? t("post_curve_custom") : presetLabel(id);
  });

  let curveOpen = $state(false);

  function presetLabel(id: PostEasingPresetId): string {
    switch (id) {
      case "linear":
        return t("post_curve_preset_linear");
      case "ease-in":
        return t("post_curve_preset_ease_in");
      case "ease-out":
        return t("post_curve_preset_ease_out");
      case "ease-in-out":
        return t("post_curve_preset_ease_in_out");
      case "smooth":
        return t("post_curve_preset_smooth");
      case "overshoot":
        return t("post_curve_preset_overshoot");
      case "hold":
        return t("post_curve_preset_hold");
    }
  }

  function seekTo(value: number | null): void {
    if (value === null) return;
    editor.seek(value);
  }

  function toggleHere(): void {
    if (locked || !withinSpan) return;
    editor.edit((project, ctx) =>
      editItemKeyframes(project, item.id, (it) => toggleKeyframe(it, channel, seconds), ctx)
    );
  }

  function choosePreset(id: PostEasingPresetId): void {
    if (locked || !segment) return;
    const easing = EASING_PRESETS[id];
    const at = seconds;
    editor.edit((project, ctx) =>
      editItemKeyframes(project, item.id, (it) => setSegmentEasing(it, channel, at, easing), ctx)
    );
  }
</script>

{#if withinSpan}
  <div class="keyframe-controls">
    <div class="kf-nav" role="group" aria-label={t("post_keyframe_nav")}>
      <button
        class="kf-btn"
        type="button"
        disabled={previous === null}
        onclick={() => seekTo(previous)}
        aria-label={t("post_keyframe_previous")}
      >
        <i class="fa-solid fa-chevron-left" aria-hidden="true"></i>
      </button>
      <button
        class="kf-btn kf-diamond"
        class:active={hasKeyframeHere}
        type="button"
        disabled={locked}
        aria-pressed={hasKeyframeHere}
        aria-label={t(hasKeyframeHere ? "post_keyframe_remove" : "post_keyframe_add")}
        onclick={toggleHere}
      >
        <i class="fa-solid fa-diamond" aria-hidden="true"></i>
      </button>
      <button
        class="kf-btn"
        type="button"
        disabled={next === null}
        onclick={() => seekTo(next)}
        aria-label={t("post_keyframe_next")}
      >
        <i class="fa-solid fa-chevron-right" aria-hidden="true"></i>
      </button>
    </div>
    {#if segment}
      <div class="curve-chip-wrapper">
        <FilterChipBase
          mode="dropdown"
          icon="fa-solid fa-wave-square"
          label={chipLabel}
          ariaLabel={t("post_keyframe_curve_for_range", { range: curveLabel })}
          size="sm"
          disabled={locked}
          expanded={curveOpen}
          onclick={() => (curveOpen = !curveOpen)}
          ondismiss={() => (curveOpen = false)}
        >
          {#snippet children()}
            <div class="curve-popover">
              <p class="curve-range">{curveLabel}</p>
              <div class="preset-list">
                {#each PRESET_IDS as id (id)}
                  <ChipPopoverOption
                    label={presetLabel(id)}
                    selected={presetId === id}
                    onclick={() => choosePreset(id)}
                  />
                {/each}
              </div>
              {#if segment.easing === "hold"}
                <p class="hint">{t("post_curve_hold_hint")}</p>
              {:else}
                <PostCurveEditor {editor} {item} {channel} {segment} {locked} />
              {/if}
            </div>
          {/snippet}
        </FilterChipBase>
      </div>
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
      background: color-mix(in srgb, var(--theme-accent, #d4813a) 10%, transparent);
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

  .kf-diamond.active {
    border-color: color-mix(in srgb, var(--theme-accent, #d4813a) 50%, transparent);
    background: color-mix(in srgb, var(--theme-accent, #d4813a) 18%, transparent);
    color: var(--theme-accent, #d4813a);
  }

  .curve-chip-wrapper {
    position: relative;
  }

  .curve-popover {
    display: grid;
    gap: 0.5rem;
    width: 15rem;
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

  .hint {
    margin: 0;
    padding: 0 0.375rem;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.8125rem;
    line-height: 1.4;
  }

  @media (prefers-reduced-motion: reduce) {
    .kf-btn {
      transition: none;
    }
  }
</style>
