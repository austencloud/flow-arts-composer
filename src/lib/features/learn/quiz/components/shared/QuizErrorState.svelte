<!--
QuizErrorState - Error display with retry for quizzes
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  let {
    error,
    onRetry,
  }: {
    error: string;
    onRetry: () => void;
  } = $props();
</script>

<div class="error-state" role="alert" aria-live="assertive">
  <p class="error-text">{error}</p>
  <button class="retry-btn" onclick={onRetry}>{t("learn_ui_try_again")}</button>
</div>

<style>
  .error-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
  }

  .error-text {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.8));
    font-size: 0.9375rem;
    font-weight: 500;
    margin: 0;
  }

  .retry-btn {
    padding: 0.625rem 1.5rem;
    background: var(--theme-accent);
    border: none;
    border-radius: 10px;
    color: white;
    font-weight: 600;
    font-size: 0.9375rem;
    cursor: pointer;
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease;
  }

  .retry-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px
      color-mix(in srgb, var(--theme-accent) 40%, transparent);
  }
</style>
