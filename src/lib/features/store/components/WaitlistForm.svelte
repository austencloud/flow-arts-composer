<!--
  WaitlistForm — email capture into shop_waitlist, extracted from ShopComingSoon
  so product-level "not on sale yet" states reuse the same form instead of
  forking it. Reserved-height slot: swapping form -> confirmation never shifts
  the layout below (no-layout-shift rule).
-->
<script lang="ts">
  import { joinWaitlist } from "../services/waitlist";

  interface Props {
    /** Tags which surface captured the email (one collection, many forms). */
    source?: string;
    /** Denser paddings for inline placement (e.g. under a product price). */
    compact?: boolean;
    confirmText?: string;
    buttonText?: string;
  }
  let {
    source = "shop-coming-soon",
    compact = false,
    confirmText = "You're on the list. You'll get an email when the Shop opens.",
    buttonText = "Notify me",
  }: Props = $props();

  let email = $state("");
  let inputEl = $state<HTMLInputElement>();
  let status = $state<"idle" | "submitting" | "done" | "error">("idle");
  let errorMessage = $state("");

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const canSubmit = $derived(
    EMAIL_RE.test(email.trim()) && status !== "submitting"
  );
  const inputId = `waitlist-email-${source.replace(/[^a-z0-9-]/gi, "")}`;

  async function handleSubmit(e: Event) {
    e.preventDefault();
    // Trust the DOM value: a password manager that fills without firing an
    // input event leaves `email` state stale but the field populated. Read the
    // element directly so an autofilled address still submits.
    if (inputEl && inputEl.value !== email) email = inputEl.value;
    if (!EMAIL_RE.test(email.trim())) {
      status = "error";
      errorMessage = "That email doesn't look right.";
      return;
    }
    status = "submitting";
    errorMessage = "";
    try {
      await joinWaitlist(email, source);
      status = "done";
    } catch (err) {
      console.error("[WaitlistForm] waitlist write failed:", err);
      status = "error";
      errorMessage = "Couldn't save that just now. Try again in a moment.";
    }
  }
</script>

<div class="notify-slot" class:compact>
  {#if status === "done"}
    <div class="confirmed" role="status">
      <i class="fas fa-circle-check" aria-hidden="true"></i>
      <span>{confirmText}</span>
    </div>
  {:else}
    <form class="notify" onsubmit={handleSubmit}>
      <label class="sr-only" for={inputId}>Email address</label>
      <input
        bind:this={inputEl}
        id={inputId}
        name="email"
        class="text-input"
        type="email"
        inputmode="email"
        autocomplete="email"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        placeholder="you@email.com"
        bind:value={email}
        aria-invalid={status === "error"}
      />
      <button class="notify-btn" type="submit" disabled={!canSubmit}>
        {#if status === "submitting"}
          <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        {:else}
          <i class="fas fa-bell" aria-hidden="true"></i>
        {/if}
        <span>{buttonText}</span>
      </button>
    </form>
    <!-- error line also reserved so it doesn't push the page -->
    <p class="error-line" class:visible={status === "error"} aria-live="polite">
      {errorMessage}
    </p>
  {/if}
</div>

<style>
  .notify-slot {
    min-height: 96px; /* holds form + error line OR the confirmation */
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }
  .notify-slot.compact {
    min-height: 84px;
    align-items: stretch;
  }

  .notify {
    display: flex;
    gap: 10px;
    width: 100%;
    max-width: 440px;
  }
  .compact .notify {
    max-width: none;
  }

  .text-input {
    flex: 1;
    min-width: 0;
    padding: 14px 18px;
    min-height: var(--min-touch-target, 44px);
    background: rgba(255, 255, 255, 0.06);
    border: 2px solid rgba(255, 255, 255, 0.14);
    border-radius: 12px;
    color: var(--theme-text, #fff);
    font-size: var(--font-size-sm, 0.95rem);
    font-family: inherit;
    transition:
      border-color var(--duration-normal) var(--ease-standard),
      background var(--duration-normal) var(--ease-standard);
  }
  .text-input::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }
  .text-input:focus {
    outline: none;
    border-color: #8b6cff;
    background: rgba(255, 255, 255, 0.09);
  }
  .text-input[aria-invalid="true"] {
    border-color: var(--semantic-error, #ef4444);
  }

  .notify-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 0 22px;
    min-height: var(--min-touch-target, 44px);
    border: none;
    border-radius: 12px;
    background: linear-gradient(135deg, #6f8cff, #8b6cff);
    color: #fff;
    font-size: var(--font-size-sm, 0.95rem);
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
    transition:
      filter var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard);
  }
  .notify-btn:hover:not(:disabled) {
    filter: brightness(1.08);
    transform: translateY(-1px);
  }
  .notify-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .error-line {
    margin: 0;
    min-height: 1.2em; /* reserved so the page never jumps */
    font-size: var(--font-size-sm, 0.85rem);
    color: var(--semantic-error, #ff8a8a);
    opacity: 0;
  }
  .error-line.visible {
    opacity: 1;
  }

  .confirmed {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    padding: 16px 22px;
    border-radius: 14px;
    background: rgba(52, 211, 153, 0.12);
    border: 1px solid rgba(52, 211, 153, 0.4);
    color: #a7f3d0;
    font-size: var(--font-size-sm, 0.95rem);
    font-weight: 600;
  }
  .confirmed i {
    font-size: 1.2rem;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  @media (max-width: 480px) {
    .notify {
      flex-direction: column;
    }
    .notify-slot {
      min-height: 140px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .text-input,
    .notify-btn {
      transition: none;
    }
  }
</style>
