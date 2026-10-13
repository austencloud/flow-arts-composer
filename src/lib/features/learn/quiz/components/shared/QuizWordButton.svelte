<script lang="ts">
  let {
    word,
    state,
    disabled,
    onclick,
    subtitle = null,
    ariaLabel = null,
  }: {
    word: string;
    state: "default" | "correct" | "incorrect" | "dimmed";
    disabled: boolean;
    onclick: () => void;
    subtitle?: string | null;
    ariaLabel?: string | null;
  } = $props();
</script>

<button
  type="button"
  class="word-btn"
  class:correct={state === "correct"}
  class:incorrect={state === "incorrect"}
  class:dimmed={state === "dimmed"}
  {onclick}
  {disabled}
  aria-label={ariaLabel ?? `Answer: ${word}`}
>
  <span class="word-text">{word}</span>
  {#if subtitle}
    <span class="word-subtitle">{subtitle}</span>
  {/if}
  {#if state === "correct"}
    <span class="result-icon correct-icon">✓</span>
  {:else if state === "incorrect"}
    <span class="result-icon incorrect-icon">✗</span>
  {/if}
</button>

<style>
  .word-btn {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.2rem;
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    padding: 0.875rem 1.25rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 14px;
    cursor: pointer;
    transition:
      background var(--duration-normal) var(--ease-out),
      border-color var(--duration-normal) var(--ease-out),
      transform var(--duration-normal) var(--ease-out),
      box-shadow var(--duration-normal) var(--ease-out),
      opacity var(--duration-normal) var(--ease-out);
  }

  .word-btn:hover:not(:disabled) {
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-color: color-mix(in srgb, var(--theme-accent) 40%, transparent);
    transform: translateY(-3px);
    box-shadow: 0 8px 24px
      color-mix(in srgb, var(--theme-accent) 20%, transparent);
  }

  .word-btn:active:not(:disabled) {
    transform: translateY(-1px) scale(0.98);
  }

  .word-btn:focus-visible {
    outline: 2px solid var(--game-accent, var(--theme-accent));
    outline-offset: 3px;
  }

  .word-text {
    font-size: 1.5rem;
    font-weight: 800;
    color: var(--theme-text, #ffffff);
    font-family: "JetBrains Mono", "Fira Code", "SF Mono", monospace;
    letter-spacing: 0.15em;
    text-shadow: 0 2px 8px
      color-mix(in srgb, var(--theme-panel-bg) 60%, transparent);
  }

  .word-subtitle {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    letter-spacing: 0;
  }

  .word-btn.correct {
    background: color-mix(in srgb, var(--semantic-success) 20%, transparent);
    border-color: color-mix(in srgb, var(--semantic-success) 60%, transparent);
    animation: correctPulse
      calc(var(--duration-dramatic) + var(--duration-fast)) var(--ease-spring);
  }

  @keyframes correctPulse {
    0% {
      transform: scale(1);
      box-shadow: 0 0 0 0
        color-mix(in srgb, var(--semantic-success) 40%, transparent);
    }
    50% {
      transform: scale(1.02);
      box-shadow: 0 0 0 10px transparent;
    }
    100% {
      transform: scale(1);
      box-shadow: 0 0 0 0 transparent;
    }
  }

  .word-btn.incorrect {
    background: color-mix(in srgb, var(--semantic-error) 20%, transparent);
    border-color: color-mix(in srgb, var(--semantic-error) 60%, transparent);
    animation: incorrectShake var(--duration-dramatic) var(--ease-standard-out);
  }

  @keyframes incorrectShake {
    0%,
    100% {
      transform: translateX(0);
    }
    20%,
    60% {
      transform: translateX(-5px);
    }
    40%,
    80% {
      transform: translateX(5px);
    }
  }

  .word-btn.dimmed {
    opacity: 0.35;
    cursor: default;
  }

  .word-btn:disabled {
    cursor: default;
  }

  .result-icon {
    position: absolute;
    top: 8px;
    right: 10px;
    font-size: 0.9rem;
    font-weight: bold;
    animation: iconPop var(--duration-emphasis) var(--ease-spring);
  }

  @keyframes iconPop {
    from {
      transform: scale(0);
      opacity: 0;
    }
    to {
      transform: scale(1);
      opacity: 1;
    }
  }

  .correct-icon {
    color: var(--semantic-success);
  }
  .incorrect-icon {
    color: var(--semantic-error);
  }

  @media (min-width: 600px) {
    .word-btn {
      padding: 1rem 1.5rem;
      border-radius: 16px;
    }
    .word-text {
      font-size: 1.75rem;
    }
  }

  @media (min-width: 900px) {
    .word-btn {
      padding: 1.125rem 1.75rem;
      border-radius: 18px;
    }
    .word-text {
      font-size: 2rem;
    }
  }

  @media (min-width: 1440px) {
    .word-btn {
      padding: 1.375rem 2rem;
      border-radius: 20px;
    }
    .word-text {
      font-size: 2.25rem;
    }
  }

  @media (min-width: 1920px) {
    .word-btn {
      padding: 1.625rem 2.25rem;
      border-radius: 22px;
    }
    .word-text {
      font-size: 2.5rem;
    }
  }

  @media (min-width: 2560px) {
    .word-btn {
      padding: 2.25rem 2.75rem;
      border-radius: 24px;
    }
    .word-text {
      font-size: 2.75rem;
      letter-spacing: 0.12em;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .word-btn.correct,
    .word-btn.incorrect,
    .result-icon {
      animation: none;
    }
    .word-btn {
      transition:
        background var(--duration-fast) var(--ease-standard),
        border-color var(--duration-fast) var(--ease-standard);
    }
  }
</style>
