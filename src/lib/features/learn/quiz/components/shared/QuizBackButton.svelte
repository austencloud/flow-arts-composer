<!--
QuizBackButton - Back navigation button for quizzes
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  let { onclick }: { onclick: () => void } = $props();
</script>

<button
  class="back-button"
  {onclick}
  aria-label={t("learn_ui_back_to_quizzes")}
>
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M19 12H5M12 19l-7-7 7-7" />
  </svg>
</button>

<style>
  .back-button {
    position: absolute;
    top: 1rem;
    left: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke);
    border-radius: 12px;
    color: var(--theme-text-dim);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    z-index: 10;
  }

  .back-button:hover {
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: var(--theme-text);
    transform: translateX(-2px);
  }

  .back-button:active {
    transform: translateX(-1px) scale(0.98);
  }
</style>
