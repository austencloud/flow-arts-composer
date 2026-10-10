<!--
QuizLoadingState - Loading spinner for quizzes
-->
<script lang="ts">
  import ProgressRing from "#lib/shared/components/loading/ProgressRing.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
</script>

<div class="loading-state" role="status" aria-live="polite" aria-busy="true">
  <ProgressRing percent={-1} size={32} strokeWidth={3} />
  <p class="loading-text">{t("learn_ui_loading_quiz")}</p>
</div>

<style>
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
  }

  .loading-text {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.8));
    font-size: 0.9375rem;
    font-weight: 500;
    margin: 0;
  }
</style>
