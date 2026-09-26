<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte";
  /**
   * EmptyNotifications
   *
   * Illustrated empty state for notifications list
   */
</script>

<div class="empty-state" role="status" aria-label={t("notifications_none")}>
  <div class="illustration">
    <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- Bell -->
      <g class="bell">
        <path
          d="M60 20C60 20 45 25 45 45V65L35 80H85L75 65V45C75 25 60 20 60 20Z"
          class="bell-body"
        />
        <circle cx="60" cy="88" r="8" class="bell-clapper" />
        <circle cx="60" cy="20" r="4" class="bell-top" />
      </g>

      <!-- Sparkles -->
      <g class="sparkles">
        <path d="M25 35L28 40L25 45L22 40Z" class="sparkle sparkle-1" />
        <path d="M95 45L98 50L95 55L92 50Z" class="sparkle sparkle-2" />
        <path d="M30 70L33 75L30 80L27 75Z" class="sparkle sparkle-3" />
      </g>

      <!-- Check mark (all caught up) -->
      <circle cx="85" cy="35" r="12" class="check-bg" />
      <path d="M80 35L84 39L91 31" class="check-mark" />
    </svg>
  </div>
  <h3>{t("notifications_caught_up")}</h3>
  <p>{t("notifications_no_new")}</p>
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
  }

  .illustration svg {
    width: 100%;
    height: 100%;
  }

  .bell {
    animation: sway 3s ease-in-out infinite;
    transform-origin: 60px 20px;
  }

  @keyframes sway {
    0%,
    100% {
      transform: rotate(0deg);
    }
    25% {
      transform: rotate(-5deg);
    }
    75% {
      transform: rotate(5deg);
    }
  }

  .bell-body {
    fill: var(--theme-card-bg);
    stroke: var(--theme-stroke);
    stroke-width: 2;
  }

  .bell-clapper {
    fill: var(--theme-text-dim);
  }

  .bell-top {
    fill: var(--theme-text-dim);
  }

  .sparkle {
    fill: var(--theme-accent, var(--semantic-info));
    opacity: 0;
  }

  .sparkle-1 {
    animation: twinkle 2s ease-in-out infinite;
  }

  .sparkle-2 {
    animation: twinkle 2s ease-in-out infinite 0.5s;
  }

  .sparkle-3 {
    animation: twinkle 2s ease-in-out infinite 1s;
  }

  @keyframes twinkle {
    0%,
    100% {
      opacity: 0;
      transform: scale(0.5);
    }
    50% {
      opacity: 0.8;
      transform: scale(1);
    }
  }

  .check-bg {
    fill: color-mix(
      in srgb,
      var(--semantic-success, var(--semantic-success)) 20%,
      transparent
    );
  }

  .check-mark {
    stroke: var(--semantic-success, var(--semantic-success));
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    fill: none;
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
    .bell,
    .sparkle {
      animation: none !important;
    }
    .sparkle {
      opacity: 0.5;
    }
  }
</style>
