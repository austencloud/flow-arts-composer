<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte";
  /**
   * EmptyConversations
   *
   * Illustrated empty state for conversations list
   */
</script>

<div class="empty-state" role="status" aria-label={t("inbox_ui_no_messages")}>
  <div class="illustration">
    <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Chat bubbles -->
      <rect x="20" y="30" width="50" height="35" rx="10" class="bubble-bg" />
      <rect
        x="50"
        y="55"
        width="50"
        height="35"
        rx="10"
        class="bubble-accent"
      />

      <!-- Dots in first bubble -->
      <circle cx="35" cy="47" r="3" class="dot" />
      <circle cx="45" cy="47" r="3" class="dot" />
      <circle cx="55" cy="47" r="3" class="dot" />

      <!-- Lines in second bubble -->
      <rect x="58" y="67" width="30" height="4" rx="2" class="line" />
      <rect x="58" y="75" width="20" height="4" rx="2" class="line" />
    </svg>
  </div>
  <h3>{t("inbox_ui_no_messages_yet")}</h3>
  <p>{t("inbox_ui_start_a_conversation_by_clicking_new_message")}</p>
</div>

<style>
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 48px 24px;
    text-align: center;
  }

  .illustration {
    width: 120px;
    height: 120px;
    animation: float 3s ease-in-out infinite;
  }

  @keyframes float {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-8px);
    }
  }

  .illustration svg {
    width: 100%;
    height: 100%;
  }

  .bubble-bg {
    fill: var(--theme-card-bg);
    stroke: var(--theme-stroke);
    stroke-width: 1;
  }

  .bubble-accent {
    fill: color-mix(
      in srgb,
      var(--theme-accent, var(--semantic-info)) 20%,
      transparent
    );
    stroke: color-mix(
      in srgb,
      var(--theme-accent, var(--semantic-info)) 40%,
      transparent
    );
    stroke-width: 1;
  }

  .dot {
    fill: var(--theme-text-dim);
    animation: pulse 1.5s ease-in-out infinite;
  }

  .dot:nth-child(2) {
    animation-delay: var(--duration-normal);
  }

  .dot:nth-child(3) {
    animation-delay: var(--duration-dramatic);
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.4;
    }
    50% {
      opacity: 0.8;
    }
  }

  .line {
    fill: rgba(255, 255, 255, 0.3);
  }

  h3 {
    margin: 0;
    font-size: var(--font-size-base);
    font-weight: 600;
    color: var(--theme-text);
  }

  p {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  @media (prefers-reduced-motion: reduce) {
    .illustration,
    .dot {
      animation: none !important;
    }
  }
</style>
