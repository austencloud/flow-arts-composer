<!--
  TIKA Welcome State

  Initial welcome screen with suggested questions.
  Accepts optional WelcomeContext for personalized suggestions
  based on mastery data, topic history, and conversation history.
-->
<script lang="ts">
  import type {
    WelcomeContext,
    WelcomeSuggestion,
  } from "../services/tika-welcome-builder";

  let {
    onSubmit,
    isLoading = false,
    welcomeContext,
  }: {
    onSubmit: (question: string) => void;
    isLoading?: boolean;
    welcomeContext?: WelcomeContext;
  } = $props();

  const defaultSuggestions: WelcomeSuggestion[] = [
    {
      icon: "fa-crosshairs",
      text: "What is alpha?",
      question: "What does alpha mean?",
      reason: "explore",
    },
    {
      icon: "fa-crosshairs",
      text: "What is beta?",
      question: "What does beta mean?",
      reason: "explore",
    },
    {
      icon: "fa-crosshairs",
      text: "What is gamma?",
      question: "What does gamma mean?",
      reason: "explore",
    },
    {
      icon: "fa-font",
      text: "What is letter A?",
      question: "What is letter A?",
      reason: "explore",
    },
    {
      icon: "fa-arrows-alt",
      text: "What is shift?",
      question: "What is shift?",
      reason: "explore",
    },
    {
      icon: "fa-layer-group",
      text: "Type 1 letters",
      question: "What are Type 1 letters?",
      reason: "explore",
    },
  ];

  const greeting = $derived(
    welcomeContext?.greeting ??
      "I'm your AI tutor for The Kinetic Alphabet. Ask me anything about:"
  );

  const suggestions = $derived(
    welcomeContext?.suggestions ?? defaultSuggestions
  );

  /** Map suggestion reason to accent CSS class */
  function getReasonClass(reason: WelcomeSuggestion["reason"]): string {
    switch (reason) {
      case "review":
        return "reason-review";
      case "continue":
        return "reason-continue";
      case "next":
        return "reason-next";
      case "explore":
        return "reason-explore";
    }
  }
</script>

<div class="welcome-state">
  <div class="welcome-icon">
    <i class="fas fa-graduation-cap" aria-hidden="true"></i>
  </div>
  <h2>{welcomeContext?.hasHistory ? "Welcome back" : "Welcome to Tika"}</h2>
  <p>{greeting}</p>
  <ul class="suggestion-list">
    {#each suggestions as suggestion}
      <li>
        <button
          aria-label={suggestion.text}
          class={getReasonClass(suggestion.reason)}
          onclick={() => onSubmit(suggestion.question)}
          disabled={isLoading}
        >
          <i class="fas {suggestion.icon}" aria-hidden="true"></i>
          {suggestion.text}
        </button>
      </li>
    {/each}
  </ul>
</div>

<style>
  .welcome-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 32px 16px;
    flex: 1;
  }

  .welcome-icon {
    width: 64px;
    height: 64px;
    border-radius: 16px;
    background: linear-gradient(
      135deg,
      var(--theme-accent, #818cf8) 0%,
      color-mix(in srgb, var(--theme-accent, #6366f1) 85%, black) 100%
    );
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 16px;
  }

  .welcome-icon i {
    font-size: 28px;
    color: white;
  }

  .welcome-state h2 {
    font-size: 20px;
    font-weight: 600;
    color: var(--theme-text, #ffffff);
    margin: 0 0 8px 0;
  }

  .welcome-state p {
    font-size: 14px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    margin: 0 0 16px 0;
  }

  .suggestion-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: 100%;
    max-width: 280px;
  }

  .suggestion-list button {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    color: var(--theme-text, #ffffff);
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    transition:
      background-color var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard),
      color var(--duration-normal) var(--ease-standard),
      opacity var(--duration-normal) var(--ease-standard);
  }

  .suggestion-list button:hover {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-accent, #6366f1);
  }

  .suggestion-list button:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .suggestion-list button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .suggestion-list button i {
    color: var(--theme-accent, #6366f1);
    width: 16px;
  }

  /* Reason-based accent colors */
  .suggestion-list button.reason-review i {
    color: var(--semantic-warning, #f59e0b);
  }

  .suggestion-list button.reason-review:hover {
    border-color: var(--semantic-warning, #f59e0b);
  }

  .suggestion-list button.reason-continue i {
    color: var(--semantic-info, #3b82f6);
  }

  .suggestion-list button.reason-continue:hover {
    border-color: var(--semantic-info, #3b82f6);
  }

  .suggestion-list button.reason-next i {
    color: var(--semantic-success, #10b981);
  }

  .suggestion-list button.reason-next:hover {
    border-color: var(--semantic-success, #10b981);
  }

  .suggestion-list button.reason-explore i {
    color: var(--theme-accent, #8b5cf6);
  }

  .suggestion-list button.reason-explore:hover {
    border-color: var(--theme-accent, #8b5cf6);
  }

  /* Reduced Motion */
  @media (prefers-reduced-motion: reduce) {
    .suggestion-list button {
      transition: none;
    }
  }
</style>
