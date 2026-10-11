<!--
QuizMisconceptionSummary - Groups detected gaps by confusion pair
and shows counts + explanations on the results screen.

Only renders if there are actual type-confusion gaps to report.
-->
<script lang="ts">
  import { compare } from "#lib/features/learn/services/letter-breakdown-generator.js";
  import type { DetectedGap } from "../../services/types";
  import { handleModuleChange } from "#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js";
  import { browser } from "$app/env";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";

  let { gaps }: { gaps: DetectedGap[] } = $props();

  function openInTika(group: ConfusionGroup) {
    if (!browser) return;

    const comparison = compare(
      group.correctLabel,
      group.chosenLabel
    );

    let question: string;
    if (comparison) {
      question =
        `${tDynamic("learn_controls_tika_confused_intro", { correct: group.correctLabel, chosen: group.chosenLabel, count: group.count })}\n\n` +
        `${tDynamic("learn_controls_tika_letter_type", { summary: comparison.letterA.summary, number: comparison.letterA.typeNumber, name: comparison.letterA.typeName })}\n` +
        `${tDynamic("learn_controls_tika_letter_type", { summary: comparison.letterB.summary, number: comparison.letterB.typeNumber, name: comparison.letterB.typeName })}\n\n` +
        tDynamic("learn_controls_tika_key_difference", { explanation: comparison.explanation });
    } else {
      question = tDynamic("learn_controls_tika_confused_question", { correct: group.correctLabel, chosen: group.chosenLabel, count: group.count });
    }

    sessionStorage.setItem("tika-seed-message", question);
    handleModuleChange("tika");
  }

  interface ConfusionGroup {
    correctLabel: string;
    chosenLabel: string;
    count: number;
    explanation?: string;
  }

  const groupedGaps = $derived.by(() => {
    const groups = new Map<string, ConfusionGroup>();

    for (const gap of gaps) {
      const key =
        gap.correctLabel < gap.chosenLabel
          ? `${gap.correctLabel}|${gap.chosenLabel}`
          : `${gap.chosenLabel}|${gap.correctLabel}`;

      const existing = groups.get(key);
      if (existing) {
        existing.count++;
      } else {
        groups.set(key, {
          correctLabel: gap.correctLabel,
          chosenLabel: gap.chosenLabel,
          count: 1,
          explanation: gap.confusionExplanation,
        });
      }
    }

    return Array.from(groups.values()).sort((a, b) => b.count - a.count);
  });
</script>

{#if groupedGaps.length > 0}
  <div class="misconception-summary">
    <h4 class="summary-title">{tDynamic("learn_controls_areas_to_review")}</h4>
    <div class="confusion-list">
      {#each groupedGaps as group}
        <button
          class="confusion-item"
          class:known={!!group.explanation}
          onclick={() => openInTika(group)}
          aria-label={tDynamic("learn_controls_ask_tika_pair", { correct: group.correctLabel, chosen: group.chosenLabel })}
        >
          <div class="confusion-content">
            <div class="confusion-header">
              <span class="confusion-pair">
                {tDynamic("learn_controls_pair_versus", { correct: group.correctLabel, chosen: group.chosenLabel })}
              </span>
              {#if group.count > 1}
                <span class="confusion-count">{group.count}x</span>
              {/if}
            </div>
            {#if group.explanation}
              <p class="confusion-explanation">{group.explanation}</p>
            {/if}
          </div>
          <span class="confusion-arrow" aria-hidden="true">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </span>
        </button>
      {/each}
    </div>
  </div>
{/if}

<style>
  .misconception-summary {
    padding: var(--spacing-lg, 1rem);
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .summary-title {
    margin: 0 0 0.75rem 0;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .confusion-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .confusion-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.625rem 0.75rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 8px;
    cursor: pointer;
    text-align: left;
    transition: filter var(--duration-fast, 150ms) ease;
  }

  .confusion-item:hover {
    filter: brightness(1.15);
  }

  .confusion-item:active {
    filter: brightness(0.95);
  }

  .confusion-item.known {
    border-color: color-mix(in srgb, var(--semantic-info, #3b82f6) 30%, transparent);
    background: color-mix(in srgb, var(--semantic-info, #3b82f6) 5%, transparent);
  }

  .confusion-content {
    flex: 1;
    min-width: 0;
  }

  .confusion-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .confusion-arrow {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .confusion-pair {
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    color: var(--theme-text, #ffffff);
  }

  .confusion-count {
    font-size: var(--font-size-compact, 12px);
    color: var(--semantic-warning, #f59e0b);
    font-weight: 600;
  }

  .confusion-explanation {
    margin: 0.375rem 0 0 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    line-height: 1.4;
  }
</style>
