<script lang="ts">
  /**
   * tkaflowarts.com/start — the festival signup funnel.
   *
   * The signup card in every sample pack carries a QR that lands here. Austen
   * has already made the pitch in person, so this page is signup-first: brand,
   * one line, account creation, done. Three states swap in one centered card:
   *
   *   signup  → ContextualAuthPrompt (Google primary, magic link secondary)
   *             + the guest hatch underneath
   *   member  → "You're in." success beat: install the PWA, scan a card
   *   guest   → same beat, deadpan guest flavor
   *
   * Magic-link completions finish in the app shell at /create (the confirm
   * modal only mounts there), so the success beat here is reached by Google
   * sign-ups, already-signed-in visitors, and guests. SiteHeader/SiteFooter
   * and the background come from the persistent MarketingChrome (root layout).
   */
  import ContextualAuthPrompt from "$lib/shared/auth/components/ContextualAuthPrompt.svelte";
  import EnhancedPWAInstallGuide from "$lib/shared/mobile/components/EnhancedPWAInstallGuide.svelte";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import { ensureGuestIdentity } from "$lib/shared/auth/services/guest-identity";
  import { captureWhenReady } from "$lib/shared/analytics/services/posthog";
  import type {
    AuthMode,
    AuthPromptContent,
  } from "$lib/shared/auth/domain/auth-nudge-trigger";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";
  import { onDestroy, onMount } from "svelte";
  import {
    trackAuthAlternativeSelected,
    trackAuthModalAbandoned,
    trackAuthSurfaceOpened,
  } from "$lib/shared/analytics/auth-events";
  import { clearAuthSubmissionBridge } from "$lib/shared/auth/services/auth-analytics-bridge";

  const signupContent: AuthPromptContent = {
    key: "festival-start",
    title: "Create your free account",
    body: "Everything you build saves to your library, and the cards in your pack come alive in the animator.",
  };

  // Bound (not passed as a literal): ContextualAuthPrompt's signin/signup
  // toggle writes this $bindable back, which throws on an unbound prop.
  let authMode = $state<AuthMode>("signup");

  let guestLoading = $state(false);
  let guestEntered = $state(false);
  let showInstallGuide = $state(false);

  type StartMode = "signup" | "member" | "guest";
  const mode: StartMode = $derived(
    authState.isFullAccount ? "member" : guestEntered ? "guest" : "signup"
  );

  onMount(() => {
    trackAuthSurfaceOpened({
      surface: "festival_start",
      origin: "festival_qr_or_direct",
      auth_mode: "signup",
    });
  });

  onDestroy(() => {
    if (mode === "signup") trackAuthModalAbandoned("unmounted");
    clearAuthSubmissionBridge();
  });

  async function enterAsGuest() {
    if (guestLoading) return;
    guestLoading = true;
    trackAuthAlternativeSelected("continue_as_guest");
    captureWhenReady("start_page_guest_entered", {});
    try {
      // Swallows offline/provider failures internally; the guest continues
      // either way and the app provisions identity on first persistable action.
      await ensureGuestIdentity();
    } finally {
      guestLoading = false;
      guestEntered = true;
    }
  }

  function openInstallGuide() {
    captureWhenReady("start_page_install_opened", { mode });
    showInstallGuide = true;
  }
</script>

<svelte:head>
  <title>Get Started · Flow Arts Composer</title>
  <!-- The festival QR signup card: an account form, not a search landing page. -->
  <meta name="robots" content="noindex" />
  <meta
    name="description"
    content="Create your Flow Arts Composer account. Build, animate, and save flow arts sequences with The Kinetic Alphabet."
  />
</svelte:head>

<div class="start-wrap">
  <main class="start">
    <Crossfade key={mode} duration={DURATION.normal}>
      {#if mode === "signup"}
        <div class="start-column">
          <ContextualAuthPrompt content={signupContent} bind:mode={authMode} />
          <div class="guest-hatch">
            <button
              class="guest-button"
              type="button"
              onclick={enterAsGuest}
              disabled={guestLoading}
            >
              {#if guestLoading}
                <ProgressRing percent={-1} size={20} strokeWidth={2} />
                Entering...
              {:else}
                Continue without an account
              {/if}
            </button>
            <p class="guest-note">
              Nothing you make will be saved. We accept your decision.
            </p>
          </div>
        </div>
      {:else}
        <section class="success-card" aria-labelledby="start-success-title">
          <h1 id="start-success-title">
            {mode === "member" ? "You're in." : "You're in as a guest."}
          </h1>
          <p class="success-body">
            {#if mode === "member"}
              Two moves and you're set for the weekend.
            {:else}
              Nothing you make will be saved. When you're ready to keep
              something, the app will ask.
            {/if}
          </p>

          <div class="success-actions">
            <button
              class="install-button"
              type="button"
              onclick={openInstallGuide}
            >
              <i class="fas fa-mobile-screen-button" aria-hidden="true"></i>
              Add it to your home screen
            </button>
            <a class="open-app-button" href="/create">
              <i class="fas fa-arrow-right" aria-hidden="true"></i>
              Open Flow Arts Composer
            </a>
          </div>

          <p class="scan-hint">
            Then point your camera at any card in your pack. The sequence
            plays.
          </p>
        </section>
      {/if}
    </Crossfade>
  </main>
</div>

<EnhancedPWAInstallGuide bind:showGuide={showInstallGuide} />

<style>
  .start-wrap {
    /* One dynamic viewport, card centered; the shared SiteFooter follows below
       the fold like every public page. dvh tracks mobile browser chrome. */
    min-height: 100vh;
    min-height: 100dvh;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .start {
    flex: 0 1 auto;
    min-height: 0;
    box-sizing: border-box;
    /* Top clears the 64px fixed SiteHeader. */
    padding: clamp(70px, 8vh, 84px) 1.375rem clamp(28px, 5vh, 52px);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .start-column {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  /* Short landscape (folded Z Fold, phone rotated): trim the page chrome and
     the column gap so the card plus guest hatch clear the fold. */
  @media (max-height: 480px) {
    .start {
      padding-top: 68px;
      padding-bottom: 16px;
    }

    .start-column {
      gap: 0.5rem;
    }
  }


  .guest-hatch {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
  }

  .guest-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: var(--min-touch-target, 44px);
    padding: 0.65rem 1.5rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.72));
    font-size: var(--font-size-min, 0.9375rem);
    font-weight: 600;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-md, 0.75rem);
    cursor: pointer;
    transition:
      background var(--duration-fast, 150ms) ease,
      color var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease;
  }

  .guest-button:hover:not(:disabled) {
    color: var(--theme-text, #f8fafc);
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
  }

  .guest-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .guest-note {
    margin: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.55));
    font-size: var(--font-size-compact, 0.8125rem);
    text-align: center;
  }


  .success-card {
    box-sizing: border-box;
    width: min(calc(100vw - 2rem), 34rem);
    padding: clamp(1.75rem, 4vw, 3rem);
    text-align: center;
    color: var(--theme-text, #f8fafc);
    background: var(--theme-panel-bg, #0b0d12);
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.16));
    border-radius: clamp(1rem, 1.4vw, 1.5rem);
    box-shadow:
      0 2rem 5rem rgba(0, 0, 0, 0.48),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  .success-card h1 {
    margin: 0;
    font-size: clamp(1.9rem, 1.4rem + 2vw, 3rem);
    font-weight: 780;
    line-height: 1.05;
    letter-spacing: -0.03em;
  }

  .success-body {
    margin: 0.85rem 0 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.72));
    font-size: clamp(0.9375rem, 0.85rem + 0.4vw, 1.125rem);
    line-height: 1.5;
    text-wrap: pretty;
  }

  .success-actions {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 1.75rem;
  }

  .install-button,
  .open-app-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    min-height: var(--min-touch-target, 48px);
    padding: 0.85rem 1.25rem;
    font-size: var(--font-size-min, 1rem);
    font-weight: 650;
    border-radius: var(--radius-md, 0.75rem);
    cursor: pointer;
    text-decoration: none;
    transition:
      background var(--duration-fast, 150ms) ease,
      transform var(--duration-fast, 150ms) ease,
      box-shadow var(--duration-fast, 150ms) ease;
  }

  .install-button {
    color: #ffffff;
    background: linear-gradient(
      100deg,
      var(--prop-blue, #4155d8),
      color-mix(
        in srgb,
        var(--prop-blue, #4155d8) 55%,
        var(--prop-red, #ef3340)
      )
    );
    border: 1px solid transparent;
    box-shadow: 0 0.4rem 1.2rem rgba(0, 0, 0, 0.32);
  }

  .install-button:hover {
    transform: translateY(-1px);
    box-shadow: 0 0.55rem 1.5rem rgba(0, 0, 0, 0.38);
  }

  .open-app-button {
    color: var(--theme-text, #f8fafc);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
  }

  .open-app-button:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.09));
    transform: translateY(-1px);
  }

  .scan-hint {
    margin: 1.5rem 0 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-compact, 0.875rem);
    line-height: 1.5;
  }

  .guest-button:focus-visible,
  .install-button:focus-visible,
  .open-app-button:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--prop-blue, #4155d8) 72%, white);
    outline-offset: 3px;
  }

  @media (prefers-reduced-motion: reduce) {
    .guest-button,
    .install-button,
    .open-app-button {
      transition: none;
    }

    .install-button:hover,
    .open-app-button:hover {
      transform: none;
    }
  }
</style>
