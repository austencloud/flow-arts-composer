<script lang="ts">
  /**
   * Tika Assistant Component
   *
   * Floating AI assistant for learning TKA.
   * Features:
   * - Floating button that expands to chat panel
   * - Question input with auto-suggestions
   * - Pictograph display for letter questions
   * - Feedback buttons for A/B testing
   */

  import { onDestroy } from "svelte";

  // Response type from the server API
  interface AssistantResponse {
    explanation: string;
    showPictograph: boolean;
    pictographLetter?: string;
    pictographVariation?: number;
    source: "template" | "api";
    provider?: "deepseek" | "haiku";
    latencyMs: number;
    recognized: boolean;
    questionType: string;
  }

  // Props
  interface Props {
    /** User ID for A/B test assignment */
    userId: string;
    /** Completed concept IDs from progress tracker */
    completedConcepts: string[];
    /** Language for responses */
    language?: string;
  }

  let { userId, completedConcepts, language = "en" }: Props = $props();

  // Ask Tika via server API (keeps API keys secure)
  async function askTika(question: string): Promise<AssistantResponse> {
    const response = await fetch("/api/tika/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        userId,
        completedConcepts,
        language,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to get response");
    }

    return response.json();
  }

  // State
  let isOpen = $state(false);
  let question = $state("");
  let isLoading = $state(false);
  let response = $state<AssistantResponse | null>(null);
  let error = $state<string | null>(null);
  let conversationHistory = $state<
    Array<{
      question: string;
      response: AssistantResponse;
      pictographImage?: string;
    }>
  >([]);

  // Cache for loaded pictographs
  const pictographCache = new Map<string, string>();

  // Fetch pictograph from API
  async function fetchPictograph(
    letter: string,
    variation: number = 0
  ): Promise<string | null> {
    const cacheKey = `${letter}-${variation}`;
    if (pictographCache.has(cacheKey)) {
      return pictographCache.get(cacheKey)!;
    }

    try {
      const response = await fetch("/api/tika/pictograph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          letter,
          variation,
          options: {
            darkMode: true,
            size: 300,
            showTKA: true,
            showGrid: true,
          },
        }),
      });

      if (!response.ok) {
        console.warn(
          "[Tika] Failed to fetch pictograph:",
          await response.text()
        );
        return null;
      }

      const data = await response.json();
      const imageDataUrl = `data:image/png;base64,${data.imageBase64}`;
      pictographCache.set(cacheKey, imageDataUrl);
      return imageDataUrl;
    } catch (err) {
      console.warn("[Tika] Pictograph fetch error:", err);
      return null;
    }
  }

  // Suggested questions for new users
  const SUGGESTED_QUESTIONS = [
    "What is the letter A?",
    "What does alpha mean?",
    "What is a shift?",
    "Show me the letter X",
    "What is pro vs anti?",
  ];

  // Handle submit
  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (!question.trim() || isLoading) return;

    isLoading = true;
    error = null;

    try {
      const result = await askTika(question.trim());

      // Fetch pictograph if needed
      let pictographImage: string | undefined;
      if (result.showPictograph && result.pictographLetter) {
        const image = await fetchPictograph(
          result.pictographLetter,
          result.pictographVariation ?? 0
        );
        pictographImage = image ?? undefined;
      }

      response = result;
      conversationHistory = [
        ...conversationHistory,
        { question: question.trim(), response: result, pictographImage },
      ];
      question = "";
    } catch (err) {
      error =
        err instanceof Error
          ? err.message
          : "Tika couldn't respond. Try asking again.";
    } finally {
      isLoading = false;
    }
  }

  // Handle suggested question click
  function handleSuggestion(suggestion: string) {
    question = suggestion;
  }

  // Handle feedback
  function handleFeedback(type: "positive" | "negative" | "inaccurate") {
    if (!response) return;

    // TODO: Save feedback to Firebase with provider info for A/B analysis

    // Visual feedback
    if (type === "positive") {
      // Show thumbs up animation
    } else if (type === "negative") {
      // Show thumbs down animation
    }
  }

  // Toggle panel
  function togglePanel() {
    isOpen = !isOpen;
  }

  // Close panel
  function closePanel() {
    isOpen = false;
  }

  // Copy conversation to clipboard
  let copyTimer: ReturnType<typeof setTimeout> | null = null;
  let copySuccess = $state(false);

  onDestroy(() => {
    if (copyTimer !== null) clearTimeout(copyTimer);
  });
  async function copyConversation() {
    if (conversationHistory.length === 0) return;

    const formatted = conversationHistory
      .map((item, i) => {
        let text = `--- Exchange ${i + 1} ---\n`;
        text += `USER: ${item.question}\n\n`;
        text += `TIKA (${item.response.source}${item.response.provider ? "/" + item.response.provider : ""}, ${item.response.latencyMs}ms):\n`;
        text += item.response.explanation;
        if (item.response.pictographLetter) {
          text += `\n[Pictograph shown: ${item.response.pictographLetter}]`;
        }
        return text;
      })
      .join("\n\n");

    const header = `=== Tika Conversation Export ===
User ID: ${userId}
Completed Concepts: ${completedConcepts.length > 0 ? completedConcepts.join(", ") : "none"}
Timestamp: ${new Date().toISOString()}
\n`;

    try {
      await navigator.clipboard.writeText(header + formatted);
      copySuccess = true;
      copyTimer = setTimeout(() => {
        copyTimer = null;
        copySuccess = false;
      }, 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }
</script>

<!-- Floating Button -->
<button
  class="tika-fab"
  class:open={isOpen}
  onclick={togglePanel}
  aria-label={isOpen ? "Close Tika assistant" : "Open Tika assistant"}
>
  {#if isOpen}
    <i class="fas fa-times"></i>
  {:else}
    <i class="fas fa-robot"></i>
  {/if}
</button>

<!-- Chat Panel -->
{#if isOpen}
  <div class="tika-panel" role="dialog" aria-label="Tika AI Assistant">
    <!-- Header -->
    <header class="tika-header">
      <div class="tika-title">
        <i class="fas fa-robot"></i>
        <span>Tika</span>
      </div>
      <div class="header-actions">
        <button
          class="header-btn copy-btn"
          class:success={copySuccess}
          onclick={copyConversation}
          disabled={conversationHistory.length === 0}
          aria-label="Copy conversation"
          title="Copy conversation to clipboard"
        >
          {#if copySuccess}
            <i class="fas fa-check"></i>
          {:else}
            <i class="fas fa-copy"></i>
          {/if}
        </button>
        <button
          class="header-btn close-btn"
          onclick={closePanel}
          aria-label="Close"
        >
          <i class="fas fa-times"></i>
        </button>
      </div>
    </header>

    <!-- Conversation Area -->
    <div class="tika-conversation">
      {#if conversationHistory.length === 0}
        <!-- Welcome State -->
        <div class="welcome-state">
          <div class="welcome-icon">
            <i class="fas fa-graduation-cap"></i>
          </div>
          <h3>Hi! I'm Tika</h3>
          <p>
            I'm here to help you learn The Kinetic Alphabet. Ask me about any
            letter, term, or concept!
          </p>

          <div class="suggestions">
            <span class="suggestions-label">Try asking:</span>
            {#each SUGGESTED_QUESTIONS as suggestion}
              <button
                class="suggestion-chip"
                onclick={() => handleSuggestion(suggestion)}
              >
                {suggestion}
              </button>
            {/each}
          </div>
        </div>
      {:else}
        <!-- Conversation History -->
        {#each conversationHistory as item}
          <!-- User Question -->
          <div class="message user-message">
            <div class="message-content">
              {item.question}
            </div>
          </div>

          <!-- Assistant Response -->
          <div class="message assistant-message">
            {#if item.response.showPictograph && item.response.pictographLetter}
              <div class="pictograph-container">
                {#if item.pictographImage}
                  <img
                    src={item.pictographImage}
                    alt="Pictograph for letter {item.response.pictographLetter}"
                    class="pictograph-image"
                  />
                {:else}
                  <!-- Fallback placeholder if image failed to load -->
                  <div class="pictograph-placeholder">
                    <span class="letter-preview"
                      >{item.response.pictographLetter}</span
                    >
                  </div>
                {/if}
              </div>
            {/if}

            <div class="message-content">
              {item.response.explanation}
            </div>

            <!-- Response metadata -->
            <div class="response-meta">
              <span
                class="source-badge"
                class:api={item.response.source === "api"}
              >
                {item.response.source === "api"
                  ? item.response.provider
                  : "template"}
              </span>
              <span class="latency">{item.response.latencyMs}ms</span>
            </div>

            <!-- Feedback buttons (only for API responses) -->
            {#if item.response.source === "api"}
              <div class="feedback-buttons">
                <span class="feedback-label">Was this helpful?</span>
                <button
                  class="feedback-btn positive"
                  onclick={() => handleFeedback("positive")}
                  aria-label="Helpful"
                >
                  <i class="fas fa-thumbs-up"></i>
                </button>
                <button
                  class="feedback-btn negative"
                  onclick={() => handleFeedback("negative")}
                  aria-label="Not helpful"
                >
                  <i class="fas fa-thumbs-down"></i>
                </button>
                <button
                  class="feedback-btn inaccurate"
                  onclick={() => handleFeedback("inaccurate")}
                  aria-label="Flag as inaccurate"
                >
                  <i class="fas fa-flag"></i>
                </button>
              </div>
            {/if}
          </div>
        {/each}
      {/if}

      <!-- Loading State -->
      {#if isLoading}
        <div class="message assistant-message loading">
          <div class="typing-indicator">
            <span></span>
            <span></span>
            <span></span>
          </div>
        </div>
      {/if}

      <!-- Error State -->
      {#if error}
        <div class="error-message">
          <i class="fas fa-exclamation-circle"></i>
          <span>{error}</span>
        </div>
      {/if}
    </div>

    <!-- Input Area -->
    <form class="tika-input" onsubmit={handleSubmit}>
      <input
        type="text"
        bind:value={question}
        placeholder="Ask about any letter or concept..."
        disabled={isLoading}
      />
      <button
        type="submit"
        disabled={isLoading || !question.trim()}
        aria-label={isLoading ? "Sending..." : "Send question"}
      >
        {#if isLoading}
          <i class="fas fa-spinner fa-spin"></i>
        {:else}
          <i class="fas fa-paper-plane"></i>
        {/if}
      </button>
    </form>
  </div>
{/if}

<style>
  /* Floating Action Button */
  .tika-fab {
    position: fixed;
    bottom: var(--spacing-lg, 24px);
    right: var(--spacing-lg, 24px);
    width: 56px;
    height: 56px;
    border-radius: 50%;
    background: var(--theme-accent, #6366f1);
    color: white;
    border: none;
    cursor: pointer;
    box-shadow: 0 4px 12px
      color-mix(in srgb, var(--theme-panel-bg, #000) 30%, transparent);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
    transition:
      transform var(--duration-normal),
      background var(--duration-normal);
    z-index: var(--z-modal);
  }

  .tika-fab:hover {
    transform: scale(1.05);
    background: var(--theme-accent-hover, #4f46e5);
  }

  .tika-fab.open {
    background: var(--theme-card-bg, #2a2a3a);
  }

  /* Chat Panel */
  .tika-panel {
    position: fixed;
    bottom: calc(var(--spacing-lg, 24px) + 70px);
    right: var(--spacing-lg, 24px);
    width: 380px;
    max-width: calc(100vw - 48px);
    height: 500px;
    max-height: calc(100vh - 140px);
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-lg, 16px);
    display: flex;
    flex-direction: column;
    box-shadow: 0 8px 32px
      color-mix(in srgb, var(--theme-panel-bg, #000) 40%, transparent);
    z-index: calc(var(--z-modal) - 1);
    overflow: hidden;
  }

  /* Header */
  .tika-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-md, 16px);
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .tika-title {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    font-weight: 600;
    font-size: var(--font-size-md, 16px);
    color: var(--theme-text, #ffffff);
  }

  .tika-title i {
    color: var(--theme-accent, #6366f1);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: var(--spacing-xs, 4px);
  }

  .header-btn {
    background: transparent;
    border: none;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    padding: var(--spacing-xs, 4px) var(--spacing-sm, 8px);
    border-radius: var(--radius-sm, 4px);
    transition:
      color var(--duration-normal),
      background var(--duration-normal);
    font-size: var(--font-size-sm, 14px);
  }

  .header-btn:hover:not(:disabled) {
    color: var(--theme-text, #ffffff);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
  }

  .header-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .copy-btn.success {
    color: var(--semantic-success, #22c55e);
  }

  /* Conversation Area */
  .tika-conversation {
    flex: 1;
    overflow-y: auto;
    padding: var(--spacing-md, 16px);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md, 16px);
  }

  /* Welcome State */
  .welcome-state {
    text-align: center;
    padding: var(--spacing-lg, 24px);
  }

  .welcome-icon {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    background: var(--theme-accent, #6366f1);
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto var(--spacing-md, 16px);
  }

  .welcome-icon i {
    font-size: 1.5rem;
    color: white;
  }

  .welcome-state h3 {
    margin: 0 0 var(--spacing-sm, 8px);
    font-size: var(--font-size-lg, 18px);
    color: var(--theme-text, #ffffff);
  }

  .welcome-state p {
    margin: 0 0 var(--spacing-lg, 24px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-min, 14px);
  }

  /* Suggestions */
  .suggestions {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-sm, 8px);
  }

  .suggestions-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
  }

  .suggestion-chip {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-md, 8px);
    padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-min, 14px);
    cursor: pointer;
    transition:
      background var(--duration-normal),
      border-color var(--duration-normal);
    text-align: left;
  }

  .suggestion-chip:hover {
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
  }

  /* Messages */
  .message {
    max-width: 90%;
  }

  .user-message {
    align-self: flex-end;
  }

  .user-message .message-content {
    background: var(--theme-accent, #6366f1);
    color: white;
    border-radius: var(--radius-md, 8px) var(--radius-md, 8px) 0
      var(--radius-md, 8px);
    padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
    font-size: var(--font-size-min, 14px);
  }

  .assistant-message {
    align-self: flex-start;
  }

  .assistant-message .message-content {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-md, 8px) var(--radius-md, 8px)
      var(--radius-md, 8px) 0;
    padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-min, 14px);
    line-height: 1.5;
  }

  /* Pictograph Container */
  .pictograph-container {
    margin-bottom: var(--spacing-sm, 8px);
  }

  .pictograph-image {
    width: 200px;
    height: 200px;
    object-fit: contain;
    border-radius: var(--radius-md, 8px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .pictograph-placeholder {
    width: 200px;
    height: 200px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-md, 8px);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .letter-preview {
    font-size: 3rem;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
  }

  /* Response Metadata */
  .response-meta {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    margin-top: var(--spacing-xs, 4px);
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
  }

  .source-badge {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    padding: 2px 6px;
    border-radius: var(--radius-sm, 4px);
    text-transform: uppercase;
    font-size: var(--font-size-compact, 12px);
  }

  .source-badge.api {
    background: var(--theme-accent, #6366f1);
    color: white;
  }

  /* Feedback Buttons */
  .feedback-buttons {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    margin-top: var(--spacing-sm, 8px);
  }

  .feedback-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
  }

  .feedback-btn {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-sm, 4px);
    padding: var(--spacing-xs, 4px) var(--spacing-sm, 8px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    transition:
      border-color var(--duration-normal),
      color var(--duration-normal);
  }

  .feedback-btn:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
  }

  .feedback-btn.positive:hover {
    color: var(--semantic-success, #22c55e);
    border-color: var(--semantic-success, #22c55e);
  }

  .feedback-btn.negative:hover {
    color: var(--semantic-error, #ef4444);
    border-color: var(--semantic-error, #ef4444);
  }

  .feedback-btn.inaccurate:hover {
    color: var(--semantic-warning, #f59e0b);
    border-color: var(--semantic-warning, #f59e0b);
  }

  /* Loading State */
  .loading .typing-indicator {
    display: flex;
    gap: 4px;
    padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
  }

  .typing-indicator span {
    width: 8px;
    height: 8px;
    background: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    border-radius: 50%;
    animation: typing 1.4s infinite both;
  }

  .typing-indicator span:nth-child(2) {
    animation-delay: var(--duration-normal);
  }

  .typing-indicator span:nth-child(3) {
    animation-delay: var(--duration-dramatic);
  }

  @keyframes typing {
    0%,
    60%,
    100% {
      transform: translateY(0);
      opacity: 0.4;
    }
    30% {
      transform: translateY(-4px);
      opacity: 1;
    }
  }

  /* Error State */
  .error-message {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
    padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 10%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--semantic-error, #ef4444) 30%, transparent);
    border-radius: var(--radius-md, 8px);
    color: var(--semantic-error, #ef4444);
    font-size: var(--font-size-min, 14px);
  }

  /* Input Area */
  .tika-input {
    display: flex;
    gap: var(--spacing-sm, 8px);
    padding: var(--spacing-md, 16px);
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .tika-input input {
    flex: 1;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-md, 8px);
    padding: var(--spacing-sm, 8px) var(--spacing-md, 16px);
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-min, 14px);
    outline: none;
    transition: border-color var(--duration-normal);
  }

  .tika-input input:focus {
    border-color: var(--theme-accent, #6366f1);
  }

  .tika-input input::placeholder {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
  }

  .tika-input button {
    width: 40px;
    height: 40px;
    background: var(--theme-accent, #6366f1);
    border: none;
    border-radius: var(--radius-md, 8px);
    color: white;
    cursor: pointer;
    transition: background var(--duration-normal);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tika-input button:hover:not(:disabled) {
    background: var(--theme-accent-hover, #4f46e5);
  }

  .tika-input button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Mobile Responsive */
  @media (max-width: 480px) {
    .tika-panel {
      bottom: 0;
      right: 0;
      width: 100%;
      max-width: 100%;
      height: 100%;
      max-height: 100%;
      border-radius: 0;
    }

    .tika-fab {
      bottom: 16px;
      right: 16px;
    }
  }
</style>
