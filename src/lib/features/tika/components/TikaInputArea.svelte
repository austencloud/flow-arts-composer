<!--
  TIKA Input Area

  Text input with send/stop buttons for the chat interface.
-->
<script lang="ts">
  let {
    status = "ready",
    onSubmit,
    onStop,
  }: {
    status: "submitted" | "streaming" | "ready" | "error";
    onSubmit: (question: string) => void;
    onStop: () => void;
  } = $props();

  let inputValue = $state("");

  const isLoading = $derived(status === "submitted" || status === "streaming");
  const isStreaming = $derived(status === "streaming");

  function handleSubmit(e: Event) {
    e.preventDefault();
    const question = inputValue.trim();
    if (!question || isLoading) return;

    inputValue = "";
    onSubmit(question);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }
</script>

<form class="input-area" onsubmit={handleSubmit}>
  <div class="input-wrapper">
    <textarea
      bind:value={inputValue}
      onkeydown={handleKeydown}
      placeholder="Ask Tika about TKA..."
      disabled={isLoading}
      rows="1"
    ></textarea>
    {#if isStreaming}
      <!-- Stop button when streaming -->
      <button
        aria-label="Stop generating"
        type="button"
        class="stop-button"
        onclick={onStop}
        title="Stop generating"
      >
        <i class="fas fa-stop" aria-hidden="true"></i>
      </button>
    {:else}
      <!-- Send button -->
      <button
        aria-label={isLoading ? "Sending message" : "Send message"}
        type="submit"
        class="send-button"
        disabled={!inputValue.trim() || isLoading}
        title="Send message"
      >
        {#if status === "submitted"}
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        {:else}
          <i class="fas fa-paper-plane" aria-hidden="true"></i>
        {/if}
      </button>
    {/if}
  </div>
</form>

<style>
  .input-area {
    padding: 16px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .input-wrapper {
    display: flex;
    gap: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 12px;
    padding: 8px 12px;
    transition: border-color var(--duration-normal) var(--ease-standard);
  }

  .input-wrapper:focus-within {
    border-color: var(--theme-accent, #6366f1);
  }

  .input-wrapper textarea {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--theme-text, #ffffff);
    font-size: 14px;
    resize: none;
    line-height: 1.5;
    min-height: 24px;
    max-height: 120px;
  }

  .input-wrapper textarea::placeholder {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
  }

  .send-button,
  .stop-button {
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    border-radius: 8px;
    border: none;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition:
      background-color var(--duration-normal) var(--ease-standard),
      filter var(--duration-normal) var(--ease-standard),
      transform var(--duration-normal) var(--ease-standard);
    flex-shrink: 0;
  }

  .send-button {
    background: var(--theme-accent, #6366f1);
  }

  .stop-button {
    background: var(--semantic-error, #ef4444);
  }

  .send-button:hover:not(:disabled),
  .stop-button:hover {
    transform: scale(1.05);
    filter: brightness(1.1);
  }

  .send-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .send-button:focus-visible,
  .stop-button:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  /* Reduced Motion */
  @media (prefers-reduced-motion: reduce) {
    .send-button,
    .stop-button,
    .input-wrapper {
      transition: none;
    }

    .send-button:hover:not(:disabled),
    .stop-button:hover {
      transform: none;
    }
  }
</style>
