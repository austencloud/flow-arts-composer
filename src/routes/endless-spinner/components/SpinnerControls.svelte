<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  interface Props {
    isPlaying: boolean;
    animationReady: boolean;
    viewMode: "strip" | "grid";
    showHistory: boolean;
    onToggleView: () => void;
    onTogglePause: () => void;
    onSkip: () => void;
    onToggleHistory: () => void;
  }

  let {
    isPlaying,
    animationReady,
    viewMode,
    showHistory,
    onToggleView,
    onTogglePause,
    onSkip,
    onToggleHistory,
  }: Props = $props();
</script>

<div
  class="controls"
  role="group"
  aria-label={t("landing_spinner_playback_controls")}
>
  <div class="zone left">
    <button
      type="button"
      class="control-btn secondary"
      onclick={onToggleView}
      aria-pressed={viewMode === "grid"}
      aria-label={viewMode === "grid"
        ? t("landing_spinner_view_strip")
        : t("landing_spinner_view_grid")}
    >
      {#if viewMode === "grid"}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <rect x="3" y="10" width="18" height="4" rx="1" />
          <rect x="6" y="3" width="12" height="3" rx="1" opacity="0.5" />
          <rect x="6" y="18" width="12" height="3" rx="1" opacity="0.5" />
        </svg>
      {:else}
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      {/if}
    </button>

    <button
      type="button"
      class="control-btn secondary"
      class:active={showHistory}
      onclick={onToggleHistory}
      aria-pressed={showHistory}
      aria-label={showHistory
        ? t("landing_spinner_hide_history")
        : t("landing_spinner_show_history")}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    </button>
  </div>

  <button
    type="button"
    class="control-btn primary"
    onclick={onTogglePause}
    disabled={!animationReady}
    aria-label={isPlaying
      ? t("landing_spinner_pause")
      : t("landing_spinner_play")}
  >
    {#if isPlaying}
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <rect x="6" y="4" width="4" height="16" rx="1" />
        <rect x="14" y="4" width="4" height="16" rx="1" />
      </svg>
    {:else}
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M8 5v14l11-7z" />
      </svg>
    {/if}
  </button>

  <div class="zone right">
    <button
      type="button"
      class="control-btn secondary"
      onclick={onSkip}
      disabled={!animationReady}
      aria-label={t("landing_spinner_skip")}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M6 4v16l10-8z" />
        <rect x="16" y="4" width="2" height="16" />
      </svg>
    </button>
  </div>
</div>

<style>
  .controls {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    column-gap: clamp(0.75rem, 1.5vw, 1.25rem);
    width: 100%;
  }

  .zone {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .zone.left {
    justify-content: flex-end;
  }

  .zone.right {
    justify-content: flex-start;
  }

  .control-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    transition: all var(--duration-normal);
  }

  .control-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .control-btn.primary {
    width: 4rem;
    height: 4rem;
    background: linear-gradient(
      135deg,
      var(--theme-accent, #6366f1),
      var(--theme-accent-strong, #8b5cf6)
    );
    color: #fff;
    box-shadow: 0 4px 20px
      color-mix(in srgb, var(--theme-accent, #6366f1) 40%, transparent);
  }

  .control-btn.primary:hover:not(:disabled) {
    transform: scale(1.05);
    box-shadow: 0 6px 28px
      color-mix(in srgb, var(--theme-accent, #6366f1) 50%, transparent);
  }

  .control-btn.primary svg {
    width: 1.75rem;
    height: 1.75rem;
  }

  .control-btn.secondary {
    /* rem so the 4K root ramp grows them; px floor keeps the touch target. */
    width: max(2.75rem, var(--min-touch-target, 44px));
    height: max(2.75rem, var(--min-touch-target, 44px));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .control-btn.secondary:hover:not(:disabled) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.12));
    color: var(--theme-text, #fff);
  }

  .control-btn.secondary svg {
    width: 1.25rem;
    height: 1.25rem;
  }

  .control-btn.active {
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 20%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 40%,
      transparent
    );
    color: var(--theme-accent-text, #a5b4fc);
  }

  .control-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .control-btn.primary:focus-visible {
    outline-color: #fff;
  }

  @media (max-width: 380px) {
    .controls {
      gap: 0.5rem;
    }

    .control-btn.primary {
      width: 3.5rem;
      height: 3.5rem;
    }
  }

  @media (min-width: 700px) and (max-height: 600px) {
    .controls {
      gap: 0.625rem;
    }

    .control-btn.primary {
      width: 3.5rem;
      height: 3.5rem;
    }
  }
</style>
