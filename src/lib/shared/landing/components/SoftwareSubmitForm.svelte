<script lang="ts">
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { submitSoftware } from "../services/software-submissions";

  interface Props {
    source?: string;
  }

  let { source = "roots-software" }: Props = $props();

  let name = $state("");
  let url = $state("");
  let notes = $state("");
  let website = $state("");
  let status = $state<"idle" | "submitting" | "done" | "error">("idle");
  let errorMessage = $state("");

  const idPrefix = $derived(`software-${source.replace(/[^a-z0-9-]/gi, "")}`);
  const nameId = $derived(`${idPrefix}-name`);
  const urlId = $derived(`${idPrefix}-url`);
  const notesId = $derived(`${idPrefix}-notes`);
  const errorId = $derived(`${idPrefix}-error`);
  const canSubmit = $derived(name.trim().length > 1 && status !== "submitting");
  const view = $derived(status === "done" ? "done" : "form");

  async function handleSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    if (name.trim().length < 2) {
      status = "error";
      errorMessage = "Give the tool a name.";
      return;
    }

    status = "submitting";
    errorMessage = "";
    try {
      await submitSoftware(name, url, notes, website);
      status = "done";
    } catch (error) {
      console.error("[SoftwareSubmitForm] submission failed:", error);
      status = "error";
      errorMessage =
        error instanceof Error && error.message
          ? error.message
          : "Couldn't save that just now. Try again in a moment.";
    }
  }
</script>

<div class="submit-slot">
  <Crossfade key={view} duration={DURATION.normal} animateHeight>
    {#if status === "done"}
      <div class="confirmed" role="status">
        <i class="fas fa-circle-check" aria-hidden="true"></i>
        <span
          >Got it. Every submission gets reviewed, and additions are credited.</span
        >
      </div>
    {:else}
      <form
        class="submit-form"
        onsubmit={handleSubmit}
        aria-busy={status === "submitting"}
      >
        <label class="field" for={nameId}>
          <span class="field-label">Tool name</span>
          <input
            id={nameId}
            name="name"
            class="text-input"
            type="text"
            autocomplete="off"
            bind:value={name}
            required
            minlength="2"
            maxlength="120"
            placeholder="What is it called?"
            aria-invalid={status === "error" && name.trim().length < 2}
            aria-describedby={status === "error" ? errorId : undefined}
          />
        </label>

        <label class="field" for={urlId}>
          <span class="field-label">Link <span>(optional)</span></span>
          <input
            id={urlId}
            name="url"
            class="text-input"
            type="url"
            inputmode="url"
            autocomplete="url"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            bind:value={url}
            maxlength="500"
            placeholder="https://"
          />
        </label>

        <label class="field" for={notesId}>
          <span class="field-label"
            >Anything we should know <span>(optional)</span></span
          >
          <textarea
            id={notesId}
            name="notes"
            class="text-input"
            rows="4"
            bind:value={notes}
            maxlength="2000"
            placeholder="Who built it, what it does, where it lives now"
          ></textarea>
        </label>

        <label class="honeypot" aria-hidden="true">
          Website
          <input
            name="website"
            autocomplete="off"
            tabindex="-1"
            bind:value={website}
          />
        </label>

        <button class="submit-btn" type="submit" disabled={!canSubmit}>
          {#if status === "submitting"}
            <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
          {:else}
            <i class="fas fa-paper-plane" aria-hidden="true"></i>
          {/if}
          <span>{status === "submitting" ? "Sending…" : "Submit it"}</span>
        </button>

        <p
          id={errorId}
          class="error-line"
          class:visible={status === "error"}
          aria-live="polite"
        >
          {errorMessage}
        </p>
      </form>
    {/if}
  </Crossfade>
</div>

<style>
  .submit-slot,
  .submit-form {
    width: 100%;
    min-width: 0;
  }

  .submit-form {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md, 1rem);
    max-width: 34rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .field-label {
    color: var(--theme-text, #fff);
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 650;
  }

  .field-label span {
    color: var(--theme-text-dim, #a7a8b5);
    font-weight: 520;
  }

  .text-input {
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    padding: 0.8rem 1rem;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: var(--radius-2026-md, 14px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #fff);
    font-family: inherit;
    font-size: var(--font-size-sm, 0.875rem);
    transition:
      border-color var(--transition-normal),
      background var(--transition-normal),
      outline-color var(--transition-normal);
  }

  textarea.text-input {
    min-height: 7rem;
    resize: vertical;
  }

  .text-input::placeholder {
    color: color-mix(in oklch, var(--theme-text-dim, #a7a8b5) 72%, transparent);
  }

  .text-input:focus-visible {
    border-color: var(--theme-accent, #8b6cff);
    outline: 3px solid
      color-mix(in oklch, var(--theme-accent, #8b6cff) 32%, transparent);
    outline-offset: 2px;
    background: color-mix(
      in oklch,
      var(--theme-accent, #8b6cff) 6%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04))
    );
  }

  .text-input[aria-invalid="true"] {
    border-color: var(--semantic-error, #ef4444);
  }

  .submit-btn {
    display: inline-flex;
    align-self: flex-start;
    min-width: 8.5rem;
    min-height: var(--min-touch-target, 44px);
    align-items: center;
    justify-content: center;
    gap: 0.55rem;
    padding-inline: 1.4rem;
    border: 1px solid
      color-mix(in oklch, var(--theme-accent, #8b6cff) 75%, transparent);
    border-radius: var(--radius-2026-md, 14px);
    background: var(--theme-accent, #7c5cff);
    color: #fff;
    cursor: pointer;
    font-family: inherit;
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 720;
    transition:
      transform var(--transition-fast),
      filter var(--transition-fast),
      opacity var(--transition-fast);
  }

  .submit-btn:hover:not(:disabled) {
    filter: brightness(1.08);
    transform: translateY(-1px);
  }

  .submit-btn:focus-visible {
    outline: 3px solid
      color-mix(in oklch, var(--theme-accent, #8b6cff) 42%, transparent);
    outline-offset: 3px;
  }

  .submit-btn:disabled {
    cursor: not-allowed;
    opacity: 0.52;
  }

  .error-line {
    min-height: 1.4em;
    margin: 0;
    color: var(--semantic-error, #ff8a8a);
    font-size: var(--font-size-sm, 0.875rem);
    line-height: 1.4;
    opacity: 0;
    transition: opacity var(--transition-fast);
  }

  .error-line.visible {
    opacity: 1;
  }

  .confirmed {
    display: inline-flex;
    max-width: 34rem;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1.2rem;
    border: 1px solid
      color-mix(in oklch, var(--semantic-success, #34d399) 52%, transparent);
    border-radius: var(--radius-2026-md, 14px);
    background: color-mix(
      in oklch,
      var(--semantic-success, #34d399) 12%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04))
    );
    color: var(--theme-text, #fff);
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 620;
    line-height: 1.5;
  }

  .confirmed i {
    color: var(--semantic-success, #34d399);
    font-size: 1.15rem;
  }

  .honeypot {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }

  @media (prefers-reduced-motion: reduce) {
    .text-input,
    .submit-btn,
    .error-line {
      transition: none;
    }

    .submit-btn:hover:not(:disabled) {
      transform: none;
    }
  }
</style>
