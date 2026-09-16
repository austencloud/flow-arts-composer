<!--
StaffQuizTypeBadge - Question type indicator badge
-->
<script lang="ts">
  import type { QuestionType } from "../../../../domain/constants/staff-quiz-questions";

  let { type }: { type: QuestionType } = $props();
</script>

<div
  class="question-type-badge"
  class:placement={type === "placement"}
  class:thumb={type === "thumb"}
  class:rotation={type === "rotation"}
>
  {#if type === "placement"}
    <i class="fa-solid fa-crosshairs" aria-hidden="true"></i>
    <span>Placement</span>
  {:else if type === "thumb"}
    <i class="fa-solid fa-hand-point-up" aria-hidden="true"></i>
    <span>Thumb</span>
  {:else}
    <i class="fa-solid fa-sync-alt" aria-hidden="true"></i>
    <span>Rotation</span>
  {/if}
</div>

<style>
  .question-type-badge {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.375rem 0.875rem;
    border-radius: 16px;
    font-size: 0.8125rem;
    font-weight: 600;
  }

  .question-type-badge.placement {
    background: color-mix(in srgb, var(--semantic-error) 15%, transparent);
    color: var(--semantic-error);
  }

  .question-type-badge.thumb {
    background: color-mix(in srgb, var(--semantic-info, #3b82f6) 15%, transparent);
    color: var(--semantic-info);
  }

  .question-type-badge.rotation {
    background: color-mix(in srgb, var(--theme-accent, #22d3ee) 15%, transparent);
    color: var(--theme-accent, #22d3ee);
  }
</style>
