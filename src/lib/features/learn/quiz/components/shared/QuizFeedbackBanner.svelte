<!--
QuizFeedbackBanner - Feedback banner after answer

Features:
- Supportive messaging for both correct and incorrect
- Streak awareness for extra encouragement
- Varied incorrect messages (never discouraging)
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  let {
    isCorrect,
    correctMessage,
    incorrectMessage,
    streakCount = 0,
  }: {
    isCorrect: boolean;
    correctMessage: string;
    incorrectMessage: string;
    streakCount?: number;
  } = $props();

  // Supportive phrases for incorrect answers (rotate based on time)
  const supportivePhrases = [
    t("learn_ui_almost"),
    t("learn_ui_keep_going"),
    t("learn_ui_you_got_this"),
    t("learn_ui_close_one"),
    t("learn_ui_learning_moment"),
  ];

  // Pick a phrase based on current second (pseudo-random but consistent per answer)
  const supportivePrefix = $derived(
    supportivePhrases[Math.floor(Date.now() / 1000) % supportivePhrases.length]
  );

  // Streak encouragement for correct answers
  const streakMessage = $derived(
    streakCount >= 5
      ? t("learn_ui_on_fire")
      : streakCount >= 3
        ? t("learn_ui_great_streak")
        : ""
  );

  const displayMessage = $derived(
    isCorrect
      ? `${correctMessage}${streakMessage ? ` ${streakMessage}` : ""}`
      : `${supportivePrefix} ${incorrectMessage}`
  );
</script>

<div
  class="feedback-banner"
  class:correct={isCorrect}
  class:streak={isCorrect && streakCount >= 3}
>
  <span class="feedback-text">
    {displayMessage}
  </span>
</div>

<style>
  .feedback-banner {
    position: fixed;
    bottom: calc(var(--primary-nav-height, 64px) + 1rem);
    left: 50%;
    transform: translateX(-50%);
    padding: 0.75rem 1.25rem;
    background: color-mix(in srgb, var(--semantic-error) 90%, transparent);
    border-radius: 12px;
    text-align: center;
    animation: bannerFadeIn var(--duration-emphasis)
      cubic-bezier(0.16, 1, 0.3, 1);
    white-space: nowrap;
    z-index: var(--z-sidebar);
  }

  .feedback-banner.correct {
    background: color-mix(in srgb, var(--semantic-success) 90%, transparent);
  }

  .feedback-banner.streak {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--semantic-success) 90%, transparent) 0%,
      color-mix(in srgb, var(--semantic-warning) 90%, transparent) 100%
    );
    box-shadow: 0 0 20px
      color-mix(in srgb, var(--semantic-warning) 40%, transparent);
  }

  @keyframes bannerFadeIn {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0);
    }
  }

  .feedback-text {
    color: var(--theme-text, #ffffff);
    font-size: 0.9375rem;
    font-weight: 600;
    letter-spacing: 0.01em;
  }

  @media (min-width: 900px) {
    .feedback-banner {
      padding: 0.875rem 1.5rem;
    }

    .feedback-text {
      font-size: 1rem;
    }
  }

  @media (min-width: 2560px) {
    .feedback-banner {
      padding: 1.125rem 2rem;
      border-radius: 16px;
    }

    .feedback-text {
      font-size: 1.25rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .feedback-banner {
      animation: none;
    }
  }
</style>
