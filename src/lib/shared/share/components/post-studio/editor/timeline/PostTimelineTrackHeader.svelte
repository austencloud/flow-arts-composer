<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  /**
   * One track's header cell: its name plus hide/lock. Lives in the sticky
   * header column, so `heightPx` always has to match the row it labels.
   * `container-type: inline-size` on that column (set by the parent) is what
   * lets `hide-label` below react to the column's own width rather than the
   * viewport's - a phone-width timeline still has a full-width header column
   * relative to itself.
   */
  interface Props {
    name: string;
    hidden?: boolean;
    locked?: boolean;
    heightPx: number;
    /** A row without these, such as the music's, shows no hide or lock. */
    onToggleHidden?: () => void;
    onToggleLocked?: () => void;
  }

  let {
    name,
    hidden = false,
    locked = false,
    heightPx,
    onToggleHidden,
    onToggleLocked,
  }: Props = $props();
</script>

<div
  class="track-header"
  class:toggleless={!(onToggleHidden && onToggleLocked)}
  style="height: {heightPx}px"
>
  <span class="track-name">{name}</span>
  {#if onToggleHidden && onToggleLocked}
    <div class="track-toggles">
      <button
        type="button"
        class="track-toggle"
        class:active={hidden}
        aria-pressed={hidden}
        aria-label={t(
          hidden ? "post_timeline_show_track" : "post_timeline_hide_track",
          { track: name }
        )}
        onclick={onToggleHidden}
      >
        <i
          class="fa-solid {hidden ? 'fa-eye-slash' : 'fa-eye'}"
          aria-hidden="true"
        ></i>
      </button>
      <button
        type="button"
        class="track-toggle"
        class:active={locked}
        aria-pressed={locked}
        aria-label={t(
          locked ? "post_timeline_unlock_track" : "post_timeline_lock_track",
          { track: name }
        )}
        onclick={onToggleLocked}
      >
        <i
          class="fa-solid {locked ? 'fa-lock' : 'fa-lock-open'}"
          aria-hidden="true"
        ></i>
      </button>
    </div>
  {/if}
</div>

<style>
  .track-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0 0.5rem;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
  }

  .track-name {
    overflow: hidden;
    flex: 1;
    min-width: 0;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .track-toggles {
    display: flex;
    flex-shrink: 0;
    gap: 0.15rem;
  }

  .track-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
    border: 1px solid transparent;
    border-radius: 0.4rem;
    background: transparent;
    color: var(--theme-text-dim);
    cursor: pointer;
    font-size: 0.8rem;
    transition:
      background-color var(--duration-fast, 150ms) ease,
      color var(--duration-fast, 150ms) ease;
  }

  @media (hover: hover) {
    .track-toggle:hover {
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
      color: var(--theme-text);
    }
  }

  .track-toggle:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .track-toggle.active {
    background: color-mix(in srgb, var(--theme-accent) 20%, transparent);
    color: var(--theme-accent);
  }

  /* A narrow column keeps the hide and lock buttons and drops the name. A
     row without them, such as the music's, keeps its name. */
  @container post-timeline-header (max-width: 7rem) {
    .track-header:not(.toggleless) .track-name {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .track-toggle {
      transition: none;
    }
  }
</style>
