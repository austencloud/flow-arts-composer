<script lang="ts">
  import { useStrings } from "@austencloud/video-editor/strings";
  import type {
  PostKeyframeChannel,
} from "@austencloud/video-editor/core";
  import { channelIcon, channelLabel } from "@austencloud/video-editor/ui";
  import { Icon, faDiamond } from "@austencloud/video-editor/icons";

  const t = useStrings();

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

  const name = $derived(channelLabel(t, channel));
</script>

<div class="key-lane-header" class:focused style="height: {heightPx}px">
  <button
    type="button"
    class="lane-name"
    aria-pressed={focused}
    aria-label={t("post_timeline_channel_lane", { channel: name })}
    onclick={onFocus}
  >
    <Icon icon={channelIcon(channel)} />
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
    <Icon icon={faDiamond} />
  </button>
</div>

<style>
  .key-lane-header {
    --lane-header-bg: color-mix(in srgb, var(--ve-theme-bg, #101018) 70%, #000);
    display: flex;
    box-sizing: border-box;
    align-items: center;
    gap: 0.15rem;
    padding: 0 0.5rem 0 0.4375rem;
    border-bottom: 1px solid var(--ve-theme-stroke, rgba(255, 255, 255, 0.06));
    background: var(--lane-header-bg);
  }

  /* The focused row's header takes the same tint as its span in the lane
     beside it, so the whole row reads as the one the diamond keys. */
  .key-lane-header.focused {
    background: color-mix(
      in srgb,
      var(--ve-theme-accent) 12%,
      var(--lane-header-bg)
    );
  }

  .lane-name {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 0.4rem;
    min-width: 0;
    min-height: var(--ve-min-touch-target, 44px);
    padding: 0 0.35rem;
    border: 0;
    border-radius: 0.4rem;
    background: transparent;
    color: var(--ve-theme-text-dim);
    cursor: pointer;
    font: inherit;
    text-align: left;
  }

  .key-lane-header.focused .lane-name {
    color: var(--ve-theme-text, #fff);
  }

  .lane-name :global(.ve-icon) {
    flex-shrink: 0;
    width: 1rem;
    font-size: 0.75rem;
    text-align: center;
  }

  .key-lane-header.focused .lane-name :global(.ve-icon) {
    color: var(--ve-theme-accent);
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
    font-size: var(--ve-font-size-compact, 0.75rem);
    font-weight: 600;
  }

  .lane-value {
    color: var(--ve-theme-text-dim);
    font-size: 0.6875rem;
    font-variant-numeric: tabular-nums;
  }

  @media (hover: hover) {
    .lane-name:hover {
      background: var(--ve-theme-card-hover-bg, rgba(255, 255, 255, 0.08));
      color: var(--ve-theme-text);
    }
  }

  .lane-name:focus-visible,
  .lane-key:focus-visible {
    outline: 2px solid var(--ve-theme-accent);
    outline-offset: -2px;
  }

  .lane-key {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    min-width: var(--ve-min-touch-target, 44px);
    min-height: var(--ve-min-touch-target, 44px);
    border: 1px solid transparent;
    border-radius: 0.4rem;
    background: transparent;
    color: var(--ve-theme-text-dim);
    cursor: pointer;
    font-size: 0.8rem;
    transition:
      background-color var(--ve-transition-fast),
      color var(--ve-transition-fast);
  }

  @media (hover: hover) {
    .lane-key:not(:disabled):hover {
      background: var(--ve-theme-card-hover-bg, rgba(255, 255, 255, 0.08));
      color: var(--ve-theme-text);
    }
  }

  .lane-key.active {
    background: color-mix(in srgb, var(--ve-theme-accent) 20%, transparent);
    color: var(--ve-theme-accent);
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
