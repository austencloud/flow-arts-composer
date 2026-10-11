<!--
  SequenceInfoPanel.svelte - Sequence info panel for Practice tab

  Rich gradient background showing current sequence name and beat count.
  Compact on mobile. Click to open sequence browser.
-->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type { HapticFeedback } from "#lib/shared/application/services/haptic-feedback.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  interface Props {
    sequence: SequenceData | null;
    totalSteps?: number;
    onBrowseSequences?: () => void;
  }

  let { sequence = null, totalSteps = 0, onBrowseSequences }: Props = $props();

  const hapticService = getHapticFeedback();

  function handleClick() {
    hapticService?.trigger("selection");
    onBrowseSequences?.();
  }
</script>

<button
  class="sequence-info-panel"
  class:has-sequence={!!sequence}
  onclick={handleClick}
  aria-label={sequence
    ? `Current sequence: ${sequence.word || sequence.name}`
    : "Select sequence"}
>
  {#if sequence}
    <div class="sequence-content">
      <span class="sequence-name">{sequence.word || sequence.name}</span>
      <span class="sequence-steps">{t('train_step_count', { count: totalSteps })}</span>
    </div>
  {:else}
    <div class="sequence-content">
      <i class="fas fa-folder-open" aria-hidden="true"></i>
      <span class="sequence-name">{t('train_select_sequence_short')}</span>
    </div>
  {/if}
</button>

<style>
  /* ============================================
	   SEQUENCE INFO PANEL - 2026 Design
	   ============================================ */
  .sequence-info-panel {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-2026-sm, 12px);
    background: linear-gradient(
      135deg,
      color-mix(
          in srgb,
          var(--semantic-info, var(--semantic-info)) 12%,
          transparent
        )
        0%,
      color-mix(
          in srgb,
          var(--theme-accent, var(--theme-accent)) 8%,
          transparent
        )
        100%
    );
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-2026-md, 14px);
    box-shadow: var(--shadow-2026-md, 0 2px 8px rgba(0, 0, 0, 0.08));
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    transition:
      background var(--duration-2026-fast, 150ms)
        var(--ease-2026-out, cubic-bezier(0.33, 1, 0.68, 1)),
      border-color var(--duration-2026-fast, 150ms)
        var(--ease-2026-out, cubic-bezier(0.33, 1, 0.68, 1)),
      transform var(--duration-2026-instant, 100ms)
        var(--ease-2026-out, cubic-bezier(0.33, 1, 0.68, 1));
    color: color-mix(in srgb, var(--theme-text, white) 85%, transparent);
    width: 100%;
  }

  .sequence-info-panel:hover {
    background: linear-gradient(
      135deg,
      color-mix(
          in srgb,
          var(--semantic-info, var(--semantic-info)) 20%,
          transparent
        )
        0%,
      color-mix(
          in srgb,
          var(--theme-accent, var(--theme-accent)) 15%,
          transparent
        )
        100%
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-info, var(--semantic-info)) 25%,
      transparent
    );
    transform: translateY(-1px);
  }

  .sequence-info-panel:active {
    transform: translateY(0) scale(0.98);
    transition-duration: var(--duration-2026-instant, 100ms);
  }

  .sequence-info-panel.has-sequence {
    background: linear-gradient(
      135deg,
      color-mix(
          in srgb,
          var(--semantic-success, var(--semantic-success)) 12%,
          transparent
        )
        0%,
      color-mix(
          in srgb,
          var(--semantic-success, var(--semantic-success)) 8%,
          transparent
        )
        100%
    );
  }

  .sequence-info-panel.has-sequence:hover {
    background: linear-gradient(
      135deg,
      color-mix(
          in srgb,
          var(--semantic-success, var(--semantic-success)) 20%,
          transparent
        )
        0%,
      color-mix(
          in srgb,
          var(--semantic-success, var(--semantic-success)) 15%,
          transparent
        )
        100%
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-success, var(--semantic-success)) 25%,
      transparent
    );
  }

  .sequence-content {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    align-items: center;
  }

  .sequence-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: color-mix(in srgb, var(--theme-text, white) 95%, transparent);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 200px;
  }

  .sequence-steps {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-weight: 500;
  }

  /* ============================================
	   MOBILE (< 768px)
	   ============================================ */
  @media (max-width: 767px) {
    .sequence-info-panel {
      padding: var(--space-2026-xs, 6px) var(--space-2026-sm, 12px);
    }

    .sequence-name {
      font-size: 0.75rem;
      max-width: 120px;
    }

    .sequence-steps {
      font-size: var(--font-size-compact, 12px);
    }
  }

  /* ============================================
	   TABLET (768px - 1023px)
	   ============================================ */
  @media (min-width: 768px) and (max-width: 1023px) {
    .sequence-content {
      flex-direction: row;
      gap: var(--space-2026-sm, 12px);
    }

    .sequence-name {
      max-width: 152px;
    }

    .sequence-steps::before {
      content: "•";
      margin-right: var(--space-2026-xs, 6px);
      color: color-mix(in srgb, var(--theme-text, white) 30%, transparent);
    }
  }

  /* ============================================
	   DESKTOP (≥ 1024px) - LARGER & MORE DETAILS
	   ============================================ */
  @media (min-width: 1024px) {
    .sequence-info-panel {
      padding: var(--space-2026-md, 20px) var(--space-2026-lg, 28px);
    }

    .sequence-content {
      flex-direction: row;
      gap: var(--space-2026-md, 20px);
      width: 100%;
      justify-content: space-between;
    }

    .sequence-name {
      font-size: 1.125rem;
      font-weight: 600;
      max-width: none;
      flex: 1;
      text-align: left;
    }

    .sequence-steps {
      font-size: 0.875rem;
      font-weight: 500;
    }

    .sequence-steps::before {
      content: "•";
      margin-right: var(--space-2026-sm, 12px);
      color: color-mix(in srgb, var(--theme-text, white) 30%, transparent);
    }

    /* Icon sizing */
    .sequence-content i {
      font-size: 1.125rem;
    }
  }
</style>
