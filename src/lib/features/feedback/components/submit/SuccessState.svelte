<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  const { onSubmitAnother } = $props<{
    onSubmitAnother: () => void;
  }>();
</script>

<div class="success-state">
  <div class="success-icon">
    <i class="fas fa-check" aria-hidden="true"></i>
  </div>
  <h2 class="success-title">{t("feedback_submitted_title")}</h2>
  <p class="success-message">
    {t("feedback_submitted_message")}
  </p>
  <button type="button" class="success-action" onclick={onSubmitAnother}>
    <i class="fas fa-plus" aria-hidden="true"></i>
    {t("feedback_submit_another")}
  </button>
</div>

<style>
  .success-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 40px 20px;
    min-height: 300px;
    animation: successEnter var(--duration-emphasis) ease-out;
  }

  @keyframes successEnter {
    from {
      opacity: 0;
      transform: scale(0.95) translateY(10px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  .success-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    background: linear-gradient(
      135deg,
      color-mix(
          in srgb,
          var(--semantic-success, var(--semantic-success)) 80%,
          white
        )
        0%,
      var(--semantic-success, var(--semantic-success)) 100%
    );
    border-radius: 50%;
    margin-bottom: 16px;
    box-shadow: 0 4px 16px
      color-mix(
        in srgb,
        var(--semantic-success, var(--semantic-success)) 25%,
        transparent
      );
  }

  .success-icon i {
    font-size: var(--font-size-3xl);
    color: white;
  }

  .success-title {
    margin: 0 0 8px 0;
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--theme-text);
    letter-spacing: -0.02em;
  }

  .success-message {
    margin: 0 0 24px 0;
    font-size: 0.9375rem;
    color: var(--theme-text-dim, var(--theme-text-dim));
    line-height: 1.5;
    max-width: 320px;
  }

  .success-action {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: var(--min-touch-target);
    padding: 0 20px;
    background: color-mix(
      in srgb,
      var(--semantic-success, var(--semantic-success)) 15%,
      transparent
    );
    border: 1px solid
      color-mix(
        in srgb,
        var(--semantic-success, var(--semantic-success)) 30%,
        transparent
      );
    border-radius: 10px;
    color: color-mix(
      in srgb,
      var(--semantic-success, var(--semantic-success)) 80%,
      white
    );
    font-size: 0.9375rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
  }

  .success-action:hover {
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
  }

  .success-action:active {
    transform: scale(0.98);
  }

  .success-action i {
    font-size: 0.875rem;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .success-state {
      animation-duration: 0.01ms !important;
    }
  }
</style>
