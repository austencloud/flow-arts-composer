<script lang="ts">
  import { onDestroy } from "svelte";
  import DrawerHeader from "#lib/shared/foundation/ui/DrawerHeader.svelte";
  import { growFade } from "#lib/shared/transitions/motion.js";
  import type {
    TikaDirectorConversationMessage,
    TikaDirectorResponse,
  } from "../domain/tika-director";

  import type { TikaDirectorSubmitResult } from "../state/tika-director-session";

  let {
    onClose,
    active = true,
    compact = false,
    prompt = $bindable(""),
    messages = $bindable([]),
    sceneName,
    performerCount,
    currentBeat,
    onSubmit,
  }: {
    onClose: () => void;
    active?: boolean;
    compact?: boolean;
    prompt?: string;
    messages?: TikaDirectorConversationMessage[];
    sceneName: string;
    performerCount: number;
    currentBeat: number;
    onSubmit: (
      prompt: string,
      conversation: readonly TikaDirectorConversationMessage[],
      signal: AbortSignal
    ) => Promise<TikaDirectorSubmitResult>;
  } = $props();

  let submitting = $state(false);
  let error = $state<string | null>(null);
  let undoLatest = $state<(() => boolean) | null>(null);
  let pendingRequest: AbortController | null = null;
  onDestroy(() => pendingRequest?.abort());
  $effect(() => {
    if (!active) {
      pendingRequest?.abort();
      pendingRequest = null;
      submitting = false;
      undoLatest = null;
    }
  });

  const suggestions = [
    "Give every performer a different prop",
    "Make every avatar different",
    "Put them in a V shape, then transition to a circle over 4 beats",
  ] as const;

  function responseText(response: TikaDirectorResponse): string {
    if (response.kind === "apply") return response.summary;
    if (response.kind === "clarify") return response.question;
    return response.message;
  }

  async function submitDirection() {
    const nextPrompt = prompt.trim();
    if (!nextPrompt || submitting) return;
    // Never silently discard old constraints to make room for a new command.
    const history = [...messages];
    messages.push({ role: "user", content: nextPrompt });
    prompt = "";
    submitting = true;
    error = null;
    const request = new AbortController();
    pendingRequest = request;
    try {
      const result = await onSubmit(nextPrompt, history, request.signal);
      if (request.signal.aborted) return;
      messages.push({
        role: "assistant",
        content: responseText(result.response),
      });
      if (result.undo) undoLatest = result.undo;
    } catch (cause) {
      if (request.signal.aborted) return;
      error =
        cause instanceof Error
          ? cause.message
          : "TIKA could not direct the scene.";
    } finally {
      if (pendingRequest === request) {
        pendingRequest = null;
        submitting = false;
      }
    }
  }

  function useSuggestion(suggestion: string) {
    prompt = suggestion;
  }

  function closePanel() {
    pendingRequest?.abort();
    pendingRequest = null;
    submitting = false;
    undoLatest = null;
    onClose();
  }

  function handlePromptKeydown(event: KeyboardEvent) {
    if (event.key !== "Enter" || (!event.metaKey && !event.ctrlKey)) return;
    event.preventDefault();
    void submitDirection();
  }

  function undoTikaChanges() {
    const undone = undoLatest?.() ?? false;
    undoLatest = null;
    if (!undone) {
      error =
        "The scene changed after that direction. Use the scene's Undo controls to step back through those edits.";
      return;
    }
    messages.push({
      role: "assistant",
      content: "Undid the last TIKA direction.",
    });
  }
</script>

<section
  class="director-shell"
  class:compact
  aria-label="Direct the Stage with TIKA"
>
  {#if !compact}
    <DrawerHeader
      title="Direct with TIKA"
      subtitle={`${sceneName} · ${performerCount} ${performerCount === 1 ? "performer" : "performers"} · Beat ${Math.round(currentBeat)}`}
      icon="fa-wand-magic-sparkles"
      onClose={closePanel}
    />
  {/if}

  <div class="director-body">
    <section
      class="conversation"
      aria-label="Direction conversation"
      aria-live="polite"
    >
      {#if messages.length === 0}
        <div class="welcome">
          <div class="tika-mark" aria-hidden="true">
            <i class="fas fa-wand-magic-sparkles"></i>
          </div>
          <div>
            <h3>Tell me what should change.</h3>
            <p>
              I can direct this live cast’s avatars, props, and formation
              timing. If your intent is ambiguous, I’ll ask before touching the
              scene.
            </p>
          </div>
        </div>
        <div class="suggestions" aria-label="Example directions">
          {#each suggestions as suggestion}
            <button
              type="button"
              onclick={() => useSuggestion(suggestion)}
              disabled={submitting}
            >
              {suggestion}
            </button>
          {/each}
        </div>
      {:else}
        {#each messages as message, index (`${message.role}-${index}`)}
          <article
            class:from-user={message.role === "user"}
            class="message"
            in:growFade
          >
            <span>{message.role === "user" ? "You" : "TIKA"}</span>
            <p>{message.content}</p>
          </article>
        {/each}
      {/if}

      {#if submitting}
        <div class="thinking" in:growFade>
          <i class="fas fa-circle-notch fa-spin" aria-hidden="true"></i>
          Reading the live scene…
        </div>
      {/if}

      {#if error}
        <div class="error" role="alert" in:growFade>
          <i class="fas fa-triangle-exclamation" aria-hidden="true"></i>
          <span>{error}</span>
        </div>
      {/if}
    </section>

    {#if undoLatest}
      <button
        class="undo"
        type="button"
        onclick={undoTikaChanges}
        disabled={submitting}
        in:growFade
      >
        <i class="fas fa-rotate-left" aria-hidden="true"></i>
        Undo TIKA changes
      </button>
    {/if}

    <form
      class="composer"
      onsubmit={(event) => {
        event.preventDefault();
        void submitDirection();
      }}
    >
      <label for="tika-stage-direction">Your direction</label>
      <textarea
        id="tika-stage-direction"
        bind:value={prompt}
        onkeydown={handlePromptKeydown}
        placeholder="Try: transition to a circle over 8 beats"
        rows="3"
        maxlength="2000"
        disabled={submitting}
      ></textarea>
      <div class="composer-footer">
        <span>Ctrl/⌘ + Enter to send</span>
        <button
          class="send"
          type="submit"
          disabled={submitting || !prompt.trim()}
        >
          <i
            class:fa-circle-notch={submitting}
            class:fa-spin={submitting}
            class:fa-arrow-up={!submitting}
            class="fas"
            aria-hidden="true"
          ></i>
          {submitting ? "Directing…" : "Direct scene"}
        </button>
      </div>
    </form>
  </div>
</section>

<style>
  .director-shell {
    display: flex;
    height: 100%;
    min-height: 0;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: 1rem;
    background: var(--theme-panel-bg);
    color: var(--theme-text, #fff);
  }
  .director-shell.compact {
    height: min(32rem, 60dvh);
    border: 0;
    border-radius: 0;
  }
  .compact .director-body {
    overflow-y: auto;
  }
  .compact .conversation {
    flex: none;
    overflow: visible;
    min-height: 0;
  }
  .compact .composer {
    flex-shrink: 0;
  }

  .director-body {
    display: flex;
    min-height: 0;
    flex: 1;
    flex-direction: column;
    gap: 0.875rem;
    padding: 1rem;
  }

  .conversation {
    display: flex;
    min-height: 10rem;
    flex: 1;
    flex-direction: column;
    gap: 0.75rem;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .welcome {
    display: grid;
    grid-template-columns: 3rem minmax(0, 1fr);
    gap: 0.875rem;
    padding: 1rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-lg, 0.75rem);
    background: var(--theme-card-bg, #121520);
  }

  .tika-mark {
    display: grid;
    width: 3rem;
    height: 3rem;
    place-items: center;
    border-radius: var(--radius-md, 0.625rem);
    background: color-mix(
      in srgb,
      var(--theme-accent, #4a9eff) 18%,
      var(--theme-panel-bg, #0c0e16)
    );
    color: var(--theme-accent, #4a9eff);
  }

  h3,
  p {
    margin: 0;
  }

  h3 {
    font-size: 1rem;
    line-height: 1.35;
  }

  .welcome p {
    margin-top: 0.35rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .suggestions {
    display: grid;
    gap: 0.5rem;
  }

  .suggestions button,
  .undo {
    min-height: var(--min-touch-target, 44px);
    padding: 0.7rem 0.875rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-md, 0.625rem);
    background: var(--theme-card-bg, #121520);
    color: var(--theme-text, #fff);
    font: inherit;
    font-size: 0.875rem;
    text-align: left;
    cursor: pointer;
    transition:
      background-color var(--transition-normal),
      border-color var(--transition-normal),
      color var(--transition-normal);
  }

  .suggestions button:hover,
  .suggestions button:focus-visible,
  .undo:hover,
  .undo:focus-visible {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.24));
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
  }

  .message {
    align-self: flex-start;
    max-width: min(90%, 34rem);
    padding: 0.75rem 0.875rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-lg, 0.75rem);
    background: var(--theme-card-bg, #121520);
  }

  .message.from-user {
    align-self: flex-end;
    background: color-mix(
      in srgb,
      var(--theme-accent, #4a9eff) 14%,
      var(--theme-card-bg, #121520)
    );
  }

  .message span {
    display: block;
    margin-bottom: 0.25rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.64));
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .message p,
  .thinking,
  .error {
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .thinking,
  .error {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    min-height: var(--min-touch-target, 44px);
    padding: 0.625rem 0.75rem;
    border-radius: var(--radius-md, 0.625rem);
  }

  .thinking {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
  }

  .error {
    border: 1px solid
      color-mix(in srgb, var(--color-error, #ef4444) 45%, transparent);
    background: color-mix(
      in srgb,
      var(--color-error, #ef4444) 11%,
      transparent
    );
    color: var(--theme-text, #fff);
  }

  .undo {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    align-self: flex-start;
    gap: 0.5rem;
  }

  .composer {
    display: grid;
    flex: 0 0 auto;
    gap: 0.5rem;
    padding: 0.875rem;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.18));
    border-radius: var(--radius-lg, 0.75rem);
    background: var(--theme-panel-bg, #0c0e16);
  }

  .composer label {
    font-size: 0.875rem;
    font-weight: 650;
  }

  textarea {
    box-sizing: border-box;
    width: 100%;
    min-height: 5.5rem;
    resize: vertical;
    padding: 0.75rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-md, 0.625rem);
    background: var(--theme-input-bg, rgba(0, 0, 0, 0.24));
    color: var(--theme-text, #fff);
    font: inherit;
    font-size: 1rem;
    line-height: 1.45;
  }

  textarea::placeholder {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.56));
  }

  textarea:focus-visible {
    outline: 2px solid var(--theme-accent, #4a9eff);
    outline-offset: 2px;
  }

  .composer-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }

  .composer-footer > span {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: 0.75rem;
  }

  .send {
    display: inline-flex;
    min-width: 8.5rem;
    min-height: var(--min-touch-target, 44px);
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.65rem 0.875rem;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #4a9eff) 55%, transparent);
    border-radius: var(--radius-md, 0.625rem);
    background: var(--theme-accent, #4a9eff);
    color: var(--theme-on-accent, #07111f);
    font: inherit;
    font-size: 0.875rem;
    font-weight: 750;
    cursor: pointer;
    transition:
      filter var(--transition-normal),
      opacity var(--transition-normal),
      transform var(--transition-fast);
  }

  .send:hover:not(:disabled) {
    filter: brightness(1.08);
  }

  .send:active:not(:disabled) {
    transform: scale(0.97);
  }

  button:disabled,
  textarea:disabled {
    cursor: wait;
    opacity: 0.58;
  }

  @media (max-width: 35rem) {
    .director-body {
      padding: 0.75rem;
    }

    .composer-footer {
      align-items: stretch;
      flex-direction: column;
    }

    .send {
      width: 100%;
    }
  }

  @media (max-height: 34rem) and (min-width: 35.01rem) {
    .director-body {
      gap: 0.5rem;
      padding: 0.625rem 0.75rem;
    }

    .conversation {
      min-height: 0;
    }

    .composer {
      gap: 0.375rem;
      padding: 0.625rem;
    }

    textarea {
      min-height: 3.75rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .send,
    .suggestions button,
    .undo {
      transition: none;
    }

    .send:active:not(:disabled) {
      transform: none;
    }
  }
</style>
