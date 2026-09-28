<script lang="ts">
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { LearnConcept, ConceptStatus } from "../domain/types";
  import ConceptPreview from "./ConceptPreview.svelte";
  import { tDynamic } from "$lib/shared/i18n/i18n.svelte.js";
  import { localizedConcept } from "../domain/localized-concept";

  let {
    concept,
    status,
    premiumGated = false,
    prominent = false,
    onClick,
  } = $props<{
    concept: LearnConcept;
    status: ConceptStatus;
    premiumGated?: boolean;
    prominent?: boolean;
    onClick?: (concept: LearnConcept) => void;
  }>();

  const haptic = getHapticFeedback();
  const action = $derived(
    status === "completed"
      ? tDynamic("learn_card_review")
      : status === "in-progress"
        ? tDynamic("learn_card_continue")
        : status === "locked"
          ? tDynamic("learn_card_locked")
          : tDynamic("learn_card_start")
  );

  function openLesson() {
    if (status === "locked") return;
    haptic?.trigger("selection");
    onClick?.(concept);
  }
</script>

<button
  class="concept-card"
  class:prominent
  class:in-progress={status === "in-progress"}
  onclick={openLesson}
  disabled={status === "locked"}
  aria-label={`${action}: ${localizedConcept(concept, "name")}`}
>
  <span class="preview"><ConceptPreview conceptId={concept.id} /></span>
  <span class="lesson-info">
    {#if prominent}<span class="recommendation"
        >{status === "in-progress"
          ? tDynamic("learn_card_resume")
          : tDynamic("learn_card_up_next")}</span
      >{/if}
    <span class="name">{localizedConcept(concept, "name")}</span>
    <span class="description">{localizedConcept(concept, "description")}</span>
    <span class="meta">
      <span>{tDynamic("learn_card_minutes", { minutes: concept.estimatedMinutes })}</span>
      {#if status === "completed"}
        <span class="completion"
          ><i class="fa-solid fa-check" aria-hidden="true"></i> {tDynamic("learn_card_completed")}</span
        >
      {:else if premiumGated}
        <span><i class="fa-solid fa-crown" aria-hidden="true"></i> {tDynamic("learn_card_premium")}</span
        >
      {/if}
    </span>
  </span>
  <span class="action" aria-hidden="true">
    <span>{action}</span>
    <i class="fa-solid fa-arrow-right"></i>
  </span>
</button>

<style>
  .concept-card {
    display: grid;
    grid-template-columns: 6.5rem minmax(0, 1fr);
    grid-template-rows: 1fr auto;
    column-gap: 1.125rem;
    row-gap: 0.625rem;
    align-items: start;
    width: 100%;
    min-height: 11rem;
    padding: 1.125rem;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--radius-lg, 0.75rem);
    background: var(--theme-card-bg);
    color: var(--theme-text);
    text-align: left;
    cursor: pointer;
    transition:
      background var(--transition-fast),
      border-color var(--transition-fast);
  }
  .concept-card:hover:not(:disabled) {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong, var(--theme-text-dim));
  }
  .concept-card:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 3px;
  }
  .concept-card:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }
  .preview {
    grid-row: 1 / -1;
    align-self: center;
    min-width: 0;
  }
  .lesson-info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .name {
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.3;
    text-wrap: balance;
  }
  .description {
    margin-top: 0.375rem;
    color: var(--theme-text-dim);
    font-size: 0.875rem;
    line-height: 1.45;
    text-wrap: pretty;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.375rem 0.875rem;
    margin-top: 0.625rem;
    color: var(--theme-text-dim);
    font-size: 0.75rem;
    line-height: 1.4;
    font-variant-numeric: tabular-nums;
  }
  .meta > span {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    white-space: nowrap;
  }
  .completion {
    color: var(--semantic-success);
  }
  .action {
    grid-column: 2;
    display: inline-flex;
    align-items: center;
    justify-self: start;
    gap: 0.5rem;
    font-size: 0.875rem;
    font-weight: 650;
    line-height: 1.4;
    white-space: nowrap;
  }
  .action i {
    font-size: 0.75rem;
  }
  .prominent {
    border-color: var(--theme-accent);
    grid-template-columns: 7rem minmax(0, 1fr);
    padding: 1.25rem;
  }
  .prominent .name {
    font-size: 1.25rem;
  }
  .recommendation {
    margin-bottom: 0.5rem;
    color: var(--theme-text-dim);
    font-size: 0.875rem;
  }
  .in-progress .action {
    color: var(--theme-accent);
  }
  @container learn-tab (max-width: 620px) {
    .concept-card {
      grid-template-columns: 4.5rem minmax(0, 1fr);
      column-gap: 0.875rem;
      padding: 1rem;
      min-height: 10rem;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .concept-card {
      transition: none;
    }
  }
</style>
