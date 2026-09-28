<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { PostKeyframeChannel } from "$lib/shared/media-composition/domain/post-project";
  import { channelIcon, channelLabel } from "../post-editor-labels";

  /**
   * The header cell for one keyframe row: the channel's name and its value
   * at the playhead, and a diamond that adds or removes this channel's key
   * there. Pressing the name makes it the row the toolbar diamond and K key.
   */
  interface Props {
    channel: PostKeyframeChannel;
    heightPx: number;
    valueText: string | null;
    focused: boolean;
    hasKeyHere: boolean;
    /** False while the playhead is outside the clip or its track is locked. */
    canKey: boolean;
    onFocus: () => void;
    onToggleKey: () => void;
  }

  let { channel, heightPx, valueText, focused, hasKeyHere, canKey, onFocus, onToggleKey }: Props =
    $props();

  const name = $derived(channelLabel(channel));
</script>

<div class="key-lane-header" class:focused style="height: {heightPx}px">
  <button
    type="button"
    class="lane-name"
    aria-pressed={focused}
    aria-label={t("post_timeline_channel_lane", { channel: name })}
    onclick={onFocus}
  >
    <i class="fa-solid {channelIcon(channel)}" aria-hidden="true"></i>
    <span class="lane-text">
      <span class="lane-label">{name}</span>
      {#if valueText}
        <span class="lane-value">{valueText}</span>
      {/if}
    </span>
  </button>
  <button
    type="button"
    class="lane-key"
    class:active={hasKeyHere}
    aria-pressed={hasKeyHere}
    aria-label={t(
      hasKeyHere ? "post_timeline_channel_key_remove" : "post_timeline_channel_key_add",
      { channel: name }
    )}
    disabled={!canKey}
    onclick={onToggleKey}
  >
    <i class="fa-solid fa-diamond" aria-hidden="true"></i>
  </button>
</div>

<style>
  .key-lane-header {
    display: flex;
    box-sizing: border-box;
    align-items: center;
    gap: 0.15rem;
    padding: 0 0.5rem 0 0.25rem;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    border-left: 3px solid transparent;
    background: color-mix(in srgb, var(--theme-bg, #101018) 70%, #000);
  }

  .key-lane-header.focused {
    border-left-color: var(--theme-accent);
  }

  .lane-name {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
    min-height: var(--min-touch-target, 44px);
    padding: 0 0.35rem;
    border: 0;
    border-radius: 0.4rem;
    background: transparent;
    color: var(--theme-text-dim);
    cursor: pointer;
    font: inherit;
    text-align: left;
  }

  .key-lane-header.focused .lane-name {
    color: var(--theme-text, #fff);
  }

  .lane-name i {
    flex-shrink: 0;
    width: 1rem;
    font-size: 0.75rem;
    text-align: center;
  }

  .key-lane-header.focused .lane-name i {
    color: var(--theme-accent);
  }

  .lane-text {
    display: flex;
    min-width: 0;
    flex-direction: column;
    line-height: 1.15;
  }

  .lane-label,
  .lane-value {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .lane-label {
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
  }

  .lane-value {
    color: var(--theme-text-dim);
    font-size: 0.6875rem;
    font-variant-numeric: tabular-nums;
  }

  @media (hover: hover) {
    .lane-name:hover {
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
      color: var(--theme-text);
    }
  }

  .lane-name:focus-visible,
  .lane-key:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: -2px;
  }

  .lane-key {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    min-width: var(--min-touch-target, 44px);
    min-height: var(--min-touch-target, 44px);
    border: 1px solid transparent;
    border-radius: 0.4rem;
    background: transparent;
    color: var(--theme-text-dim);
    cursor: pointer;
    font-size: 0.8rem;
    transition:
      background-color var(--transition-fast),
      color var(--transition-fast);
  }

  @media (hover: hover) {
    .lane-key:not(:disabled):hover {
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
      color: var(--theme-text);
    }
  }

  .lane-key.active {
    background: color-mix(in srgb, var(--theme-accent) 20%, transparent);
    color: var(--theme-accent);
  }

  .lane-key:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  /* The narrow header keeps the icon and diamond, as track rows keep their
     toggles. */
  @container post-timeline-header (max-width: 7rem) {
    .lane-text {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .lane-key {
      transition: none;
    }
  }
</style>
