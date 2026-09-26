<!--
  SourceControls.svelte

  Sequence source mode selector (pick/library/infinite),
  action buttons (pick/skip/shuffle), and current sequence info.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { SourceMode } from "$lib/shared/animation-engine/services/sequence-chaining-orchestrator";
  import { simplifyAndTruncate } from "$lib/shared/foundation/utils/word-simplifier";
  import CopyForAIButton from "$lib/shared/foundation/ui/CopyForAIButton.svelte";

  interface Props {
    sourceMode: SourceMode;
    sequence: SequenceData | null;
    isChainingNow: boolean;
    onSourceChange: (mode: SourceMode) => void;
    onPick: () => void;
    onSkip: () => void;
    onShuffle: () => void;
    getDebugData?: () => string | Promise<string>;
    onSave?: () => void;
  }

  let {
    sourceMode,
    sequence,
    isChainingNow,
    onSourceChange,
    onPick,
    onSkip,
    onShuffle,
    getDebugData,
    onSave,
  }: Props = $props();
</script>

<div class="source-controls">
  <h3>{t("effect_deep_source")}</h3>
  <div
    class="source-toggle"
    role="radiogroup"
    aria-label={t("effect_deep_sequence_source")}
  >
    <button
      role="radio"
      class="source-btn"
      class:active={sourceMode === "pick"}
      aria-checked={sourceMode === "pick"}
      onclick={() => onSourceChange("pick")}
    >
      <i class="fas fa-hand-pointer" aria-hidden="true"></i>
      {t("effect_deep_pick")}
    </button>
    <button
      role="radio"
      class="source-btn"
      class:active={sourceMode === "library"}
      aria-checked={sourceMode === "library"}
      onclick={() => onSourceChange("library")}
    >
      <i class="fas fa-book" aria-hidden="true"></i>
      {t("effect_deep_library")}
    </button>
    <button
      role="radio"
      class="source-btn"
      class:active={sourceMode === "infinite"}
      aria-checked={sourceMode === "infinite"}
      onclick={() => onSourceChange("infinite")}
    >
      <i class="fas fa-infinity" aria-hidden="true"></i>
      {t("effect_deep_infinite")}
    </button>
  </div>

  {#if sourceMode === "pick"}
    <div class="auto-actions">
      <button
        class="action-btn"
        onclick={onPick}
        aria-label={sequence
          ? t("effect_deep_change_current_sequence")
          : t("effect_deep_pick_sequence_to_load")}
      >
        <i class="fas fa-folder-open" aria-hidden="true"></i>
        {sequence
          ? t("effect_deep_change_sequence")
          : t("effect_deep_pick_sequence")}
      </button>
      {#if sequence}
        <div class="util-actions">
          {#if getDebugData}
            <CopyForAIButton
              getData={getDebugData}
              variant="icon-only"
              size="md"
              ariaLabel={t("effect_deep_copy_sequence_data")}
              useToast
              labels={{
                success: t("effect_deep_sequence_copied"),
                error: t("effect_deep_copy_failed"),
              }}
            />
          {/if}
          {#if onSave}
            <button
              data-save-shortcut
              class="icon-btn save-btn"
              onclick={onSave}
              aria-label={t("effect_deep_save_sequence")}
              title={t("effect_deep_save_to_library")}
            >
              <i class="fas fa-bookmark" aria-hidden="true"></i>
            </button>
          {/if}
        </div>
      {/if}
    </div>
  {:else}
    <div class="auto-actions">
      <button
        class="action-btn skip-btn"
        onclick={onSkip}
        disabled={isChainingNow || !sequence}
        aria-label={t("effect_deep_skip_to_next")}
      >
        <i class="fas fa-forward" aria-hidden="true"></i>
        {t("effect_deep_skip")}
      </button>
      {#if sourceMode === "infinite"}
        <button
          class="action-btn shuffle-btn"
          onclick={onShuffle}
          disabled={isChainingNow || !sequence}
          aria-label={t("effect_deep_shuffle_to_random")}
        >
          <i class="fas fa-random" aria-hidden="true"></i>
          {t("effect_deep_shuffle")}
        </button>
      {/if}
      {#if sequence}
        <div class="util-actions">
          {#if getDebugData}
            <CopyForAIButton
              getData={getDebugData}
              variant="icon-only"
              size="md"
              ariaLabel={t("effect_deep_copy_sequence_data")}
              useToast
              labels={{
                success: t("effect_deep_sequence_copied"),
                error: t("effect_deep_copy_failed"),
              }}
            />
          {/if}
          {#if onSave}
            <button
              data-save-shortcut
              class="icon-btn save-btn"
              onclick={onSave}
              aria-label={t("effect_deep_save_sequence")}
              title={t("effect_deep_save_to_library")}
            >
              <i class="fas fa-bookmark" aria-hidden="true"></i>
            </button>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  <!-- Always render the slot so space is reserved and conditional hydration
       of `sequence` doesn't shift the EffectsPanel below (CLS). -->
  <div
    class="sequence-info"
    data-empty={!sequence || undefined}
    aria-hidden={!sequence || undefined}
  >
    {#if sequence}
      <span class="seq-name"
        >{simplifyAndTruncate(
          sequence.word || sequence.name || t("effect_deep_unnamed")
        )}</span
      >
      <span class="seq-meta">
        <span class="seq-beats"
          >{t("effect_deep_step_count", {
            count: sequence.steps?.length || 0,
          })}</span
        >
      </span>
    {:else}
      <span class="seq-name seq-placeholder">&nbsp;</span>
      <span class="seq-meta"><span class="seq-beats">&nbsp;</span></span>
    {/if}
  </div>
</div>

<style>
  .source-controls {
    --flame-orange-mid: rgba(249, 115, 22, 0.15);
    --flame-orange-bright: #fb923c;

    padding: var(--spacing-md, 16px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--border-radius-lg, 12px);
  }

  h3 {
    margin: 0 0 var(--spacing-sm, 8px);
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text, white);
  }

  .source-toggle {
    display: flex;
    gap: 2px;
    background: color-mix(in srgb, var(--theme-text) 3%, transparent);
    border-radius: var(--border-radius-md, 8px);
    padding: 3px;
    margin-bottom: var(--spacing-sm, 8px);
  }

  .source-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 10px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    cursor: pointer;
    transition: all 150ms ease;
    min-height: var(--min-touch-target);
  }

  .source-btn:hover {
    color: var(--theme-text, white);
    background: color-mix(in srgb, var(--theme-text) 6%, transparent);
  }

  .source-btn.active {
    background: var(--flame-orange-mid);
    color: var(--flame-orange-bright);
    box-shadow: 0 1px 3px var(--theme-overlay-dark, rgba(0, 0, 0, 0.2));
  }

  .source-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: -2px;
  }

  .source-btn i {
    font-size: var(--font-size-compact, 12px);
  }

  .action-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-xs, 4px);
    min-height: var(--min-touch-target);
    padding: 10px 16px;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--border-radius-md, 8px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, white);
    font-size: var(--font-size-min, 14px);
    cursor: pointer;
    transition: all 150ms ease;
  }

  .action-btn:hover {
    background: color-mix(in srgb, var(--theme-text) 10%, transparent);
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .auto-actions {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .auto-actions .action-btn {
    flex: 1;
  }

  .util-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  .icon-btn {
    width: 44px;
    height: 44px;
    min-width: var(--min-touch-target);
    min-height: var(--min-touch-target);
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    color: var(--theme-text, white);
    cursor: pointer;
    transition: all 150ms ease;
    font-size: var(--font-size-min, 14px);
  }

  .icon-btn:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
  }

  .icon-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .icon-btn:active {
    transform: scale(0.95);
  }

  .skip-btn:disabled,
  .shuffle-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .sequence-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: var(--spacing-sm, 8px);
    padding: var(--spacing-xs, 4px) var(--spacing-sm, 8px);
    background: color-mix(in srgb, var(--theme-text) 3%, transparent);
    border-radius: var(--border-radius-sm, 4px);
    /* Reserve height so populating `sequence` asynchronously doesn't shift
       sibling panels downward (CLS). Matches rendered height: font-size-min
       line-height (~20px) + 8px vertical padding. */
    min-height: calc(var(--font-size-min, 14px) * 1.4 + 8px);
  }

  .sequence-info[data-empty] {
    background: transparent;
  }

  .seq-placeholder {
    visibility: hidden;
  }

  .seq-name {
    font-weight: 500;
    color: var(--theme-text, white);
    font-size: var(--font-size-min, 14px);
  }

  .seq-meta {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .seq-beats {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  @media (prefers-reduced-motion: reduce) {
    .source-btn,
    .action-btn {
      transition: none;
    }
  }
</style>
