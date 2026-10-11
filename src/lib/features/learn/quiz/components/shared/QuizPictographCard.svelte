<!--
QuizPictographCard - Question pictograph display
-->
<script lang="ts">
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import type { PictographData } from "#lib/shared/pictograph/shared/domain/models/pictograph-data.js";

  let {
    pictograph,
    showArrow = false,
  }: {
    pictograph: PictographData;
    showArrow?: boolean;
  } = $props();
</script>

<div class="pictograph-section">
  <div class="pictograph-card question-card">
    <PictographContainer pictographData={pictograph} showTKA={false} />
  </div>
  {#if showArrow}
    <div class="arrow-indicator">
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M5 12h14M12 5l7 7-7 7" />
      </svg>
    </div>
  {/if}
</div>

<style>
  .pictograph-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    animation: pictographEntrance var(--duration-dramatic) cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes pictographEntrance {
    from {
      opacity: 0;
      transform: scale(0.92) translateY(10px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  .pictograph-card {
    width: 200px;
    height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
    /* No background - pictograph has its own dark background */
    background: transparent;
    border-radius: 14px;
    /* Subtle glow effect instead of white background */
    box-shadow: 0 0 60px -20px color-mix(in srgb, var(--theme-accent) 25%, transparent);
    overflow: hidden;
  }

  .question-card {
    /* Subtle accent border on the pictograph itself */
    border: 1.5px solid color-mix(in srgb, var(--theme-accent) 40%, transparent);
  }

  .arrow-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.75));
    animation: arrowPulse 2s ease-in-out infinite;
  }

  .arrow-indicator svg {
    width: 20px;
    height: 20px;
  }

  @keyframes arrowPulse {
    0%,
    100% {
      opacity: 0.4;
      transform: translateY(0);
    }
    50% {
      opacity: 0.7;
      transform: translateY(3px);
    }
  }

  @media (min-width: 600px) {
    .pictograph-card {
      width: 240px;
      height: 240px;
      border-radius: 16px;
    }

    .arrow-indicator svg {
      width: 24px;
      height: 24px;
    }
  }

  @media (min-width: 900px) {
    .pictograph-card {
      width: 280px;
      height: 280px;
      border-radius: 18px;
      box-shadow: 0 0 100px -30px color-mix(in srgb, var(--theme-accent) 30%, transparent);
    }

    .arrow-indicator svg {
      width: 28px;
      height: 28px;
    }
  }

  @media (min-width: 1200px) {
    .pictograph-card {
      width: 320px;
      height: 320px;
      border-radius: 20px;
    }
  }

  @media (min-width: 1920px) {
    .pictograph-card {
      width: 360px;
      height: 360px;
      border-radius: 22px;
    }

    .arrow-indicator svg {
      width: 32px;
      height: 32px;
    }
  }

  @media (min-width: 2560px) {
    .pictograph-card {
      width: clamp(440px, 30vw, 560px);
      height: clamp(440px, 30vw, 560px);
      border-radius: 26px;
    }

    .arrow-indicator svg {
      width: 40px;
      height: 40px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pictograph-section,
    .arrow-indicator {
      animation: none;
    }
  }
</style>
