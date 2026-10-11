<!--
  FloatingControlGroup.svelte - Floating controls for Practice tab

  Minimal glassmorphism buttons positioned at bottom-right:
  - Sequence: Opens sequence browser
  - View: Cycles display views (camera+canvas, camera+grid, all three)
  - Mode: Shows/changes practice mode (adaptive, step, timed)
  - Settings: Opens mode settings sheet
-->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { PracticeMode } from "../../domain/enums/train-enums";
  import type { DisplayView } from "../../state/train-practice-state.svelte";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  interface Props {
    displayView: DisplayView;
    practiceMode: PracticeMode;
    hasSequence?: boolean;
    onSequenceClick?: () => void;
    onViewCycle?: () => void;
    onModeClick?: () => void;
    onSettingsClick?: () => void;
  }

  let {
    displayView,
    practiceMode,
    hasSequence = false,
    onSequenceClick,
    onViewCycle,
    onModeClick,
    onSettingsClick,
  }: Props = $props();

  const hapticService = getHapticFeedback();

  const viewIcon = $derived(() => {
    switch (displayView) {
      case "camera-canvas":
        return "fa-film";
      case "camera-grid":
        return "fa-th";
      case "camera-canvas-grid":
        return "fa-columns";
      default:
        return "fa-th";
    }
  });

  const viewLabel = $derived(() => {
    switch (displayView) {
      case "camera-canvas":
        return t('train_view_canvas');
      case "camera-grid":
        return t('train_view_grid');
      case "camera-canvas-grid":
        return t('train_view_both');
      default:
        return t('train_view_label');
    }
  });

  const modeIcon = $derived(() => {
    switch (practiceMode) {
      case PracticeMode.ADAPTIVE:
        return "fa-brain";
      case PracticeMode.STEP_BY_STEP:
        return "fa-shoe-prints";
      case PracticeMode.TIMED:
        return "fa-stopwatch";
      default:
        return "fa-stopwatch";
    }
  });

  const modeLabel = $derived(() => {
    switch (practiceMode) {
      case PracticeMode.ADAPTIVE:
        return t('train_mode_adaptive');
      case PracticeMode.STEP_BY_STEP:
        return t('train_mode_step');
      case PracticeMode.TIMED:
        return t('train_mode_timed');
      default:
        return t('train_mode_label');
    }
  });

  function handleSequence() {
    hapticService?.trigger("selection");
    onSequenceClick?.();
  }

  function handleView() {
    hapticService?.trigger("selection");
    onViewCycle?.();
  }

  function handleMode() {
    hapticService?.trigger("selection");
    onModeClick?.();
  }

  function handleSettings() {
    hapticService?.trigger("selection");
    onSettingsClick?.();
  }
</script>

<div class="floating-control-group">
  <!-- Settings Button -->
  <button
    class="floating-btn"
    onclick={handleSettings}
    aria-label="Mode settings"
  >
    <i class="fas fa-cog" aria-hidden="true"></i>
  </button>

  <!-- Mode Button -->
  <button
    class="floating-btn mode-btn"
    onclick={handleMode}
    aria-label="Change practice mode: {modeLabel()}"
  >
    <i class="fas {modeIcon()}" aria-hidden="true"></i>
    <span class="btn-label">{modeLabel()}</span>
  </button>

  <!-- View Toggle Button -->
  <button
    class="floating-btn view-btn"
    onclick={handleView}
    aria-label="Change view: {viewLabel()}"
  >
    <i class="fas {viewIcon()}" aria-hidden="true"></i>
    <span class="btn-label">{viewLabel()}</span>
  </button>

  <!-- Sequence Button -->
  <button
    class="floating-btn sequence-btn"
    class:has-sequence={hasSequence}
    onclick={handleSequence}
    aria-label={hasSequence ? "Change sequence" : "Select sequence"}
  >
    <i
      class="fas {hasSequence ? 'fa-exchange-alt' : 'fa-folder-open'}"
      aria-hidden="true"
    ></i>
  </button>
</div>

<style>
  .floating-control-group {
    position: absolute;
    bottom: 12px;
    right: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    z-index: 100;
  }

  .floating-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
    padding: 0.75rem;
    background: var(--theme-panel-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-2026-md, 14px);
    box-shadow: var(--shadow-2026-md, 0 2px 8px rgba(0, 0, 0, 0.08));
    color: color-mix(in srgb, var(--theme-text, white) 85%, transparent);
    font-size: 1rem;
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    transition: all var(--duration-emphasis) cubic-bezier(0.4, 0, 0.2, 1);
  }

  .btn-label {
    font-size: 0.75rem;
    font-weight: 500;
    letter-spacing: 0.02em;
  }

  /* Hover effects */
  @media (hover: hover) {
    .floating-btn:hover {
      background: var(--theme-card-hover-bg);
      border-color: color-mix(
        in srgb,
        var(--semantic-info, var(--semantic-info)) 40%,
        transparent
      );
      box-shadow: 0 4px 12px
        color-mix(
          in srgb,
          var(--semantic-info, var(--semantic-info)) 20%,
          transparent
        );
      transform: translateY(-2px);
      color: var(--semantic-info);
    }
  }

  /* Active/pressed state */
  .floating-btn:active {
    transform: translateY(0) scale(0.95);
    transition: transform var(--duration-instant) cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* Sequence button with sequence loaded */
  .sequence-btn.has-sequence {
    background: color-mix(
      in srgb,
      var(--semantic-success, var(--semantic-success)) 15%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-success, var(--semantic-success)) 30%,
      transparent
    );
    color: color-mix(in srgb, var(--semantic-success) 90%, transparent);
  }

  .sequence-btn.has-sequence:hover {
    background: color-mix(
      in srgb,
      var(--semantic-success, var(--semantic-success)) 25%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-success, var(--semantic-success)) 50%,
      transparent
    );
    box-shadow: 0 4px 12px
      color-mix(
        in srgb,
        var(--semantic-success, var(--semantic-success)) 20%,
        transparent
      );
  }

  /* Mode button accent colors based on mode */
  .mode-btn {
    padding-left: 1rem;
    padding-right: 1rem;
  }

  /* View button accent */
  .view-btn {
    padding-left: 1rem;
    padding-right: 1rem;
  }

  /* Responsive: hide labels on very small screens */
  @media (max-width: 400px) {
    .btn-label {
      display: none;
    }

    .mode-btn,
    .view-btn {
      padding: 0.75rem;
    }
  }
</style>
