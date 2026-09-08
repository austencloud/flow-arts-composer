<script lang="ts">
  import type {
    AuthMode,
    AuthPromptContent,
  } from "$lib/shared/auth/domain/auth-nudge-trigger";
  import { getLastAuthMethod } from "$lib/shared/auth/services/last-auth-method.svelte";
  import EmailAuthTabs from "./EmailAuthTabs.svelte";
  import LastUsedBadge from "$lib/shared/components/LastUsedBadge.svelte";
  import SocialAuthCompact from "./SocialAuthCompact.svelte";
  import { growFade } from "$lib/shared/transitions/motion";

  interface Props {
    content: AuthPromptContent;
    mode?: AuthMode;
    active?: boolean;
    idPrefix?: string;
    showClose?: boolean;
    inAppBrowser?: boolean;
    facebookError?: string | null;
    onClose?: () => void;
    onFacebookAuth?: () => void;
    encoreOffer?: boolean;
    onAcceptEncore?: () => void;
  }

  let {
    content,
    mode = $bindable("signup"),
    active = true,
    idPrefix = "contextual-auth",
    showClose = false,
    inAppBrowser = false,
    facebookError = null,
    onClose,
    onFacebookAuth,
    encoreOffer = false,
    onAcceptEncore,
  }: Props = $props();

  let showEmailAuth = $state(false);
  let showOtherProviders = $state(false);
  const lastMethod = getLastAuthMethod();
  const compact = $derived(content.key === "step-cap-guest");
  const lastUsedEmail = $derived(
    lastMethod === "magic-link" || lastMethod === "password"
  );

  // Every opening and every action context starts as a fresh encounter. A
  // previous email form should never leak into the next thing the user tries.
  $effect(() => {
    if (!active) return;
    content.key;
    showEmailAuth = false;
    showOtherProviders = false;
  });

  const titleId = $derived(`${idPrefix}-title`);
  const descriptionId = $derived(`${idPrefix}-description`);

  function toggleMode() {
    mode = mode === "signup" ? "signin" : "signup";
    showEmailAuth = false;
  }
</script>

<section
  class="contextual-auth-prompt"
  class:compact
  class:encore-offer={encoreOffer}
  aria-labelledby={titleId}
  aria-describedby={descriptionId}
>
  <header class="prompt-header">
    {#if !compact}
      <div class="brand-lockup">
        <span class="brand-mark">
          <img src="/branding/logo.jpg" alt="" width="56" height="56" />
        </span>
        <span class="brand-name">Flow Arts Composer</span>
      </div>
    {/if}

    {#if showClose}
      <button
        class="close-button"
        type="button"
        onclick={onClose}
        aria-label="Close"
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    {/if}
  </header>

  <div class="prompt-copy">
    {#if compact}
      <div class="fac-signature">
        <img src="/branding/logo.jpg" alt="" width="28" height="28" />
        {#if encoreOffer}<span>One-time extension</span>{/if}
      </div>
    {/if}
    <h2 id={titleId}>{content.title}</h2>
    <p id={descriptionId}>{content.body}</p>
  </div>

  <div class="auth-methods">
    {#if compact && encoreOffer}
      <button class="encore-button" type="button" onclick={onAcceptEncore}>
        Keep going
        <i class="fas fa-arrow-right" aria-hidden="true"></i>
      </button>
    {:else if compact}
      <EmailAuthTabs bind:mode compact showMethods={showOtherProviders} />
      <button
        class="more-methods"
        type="button"
        aria-expanded={showOtherProviders}
        onclick={() => (showOtherProviders = !showOtherProviders)}
      >
        {showOtherProviders ? "Fewer options" : "More sign-in options"}
      </button>
      {#if showOtherProviders}
        <div transition:growFade>
          <SocialAuthCompact {mode} {onFacebookAuth} />
        </div>
      {/if}
    {:else if inAppBrowser}
      <div class="email-flow">
        <div class="email-divider"><span>Continue by email</span></div>
        <EmailAuthTabs bind:mode {compact} />
      </div>

      <p class="provider-warning">
        Social sign-in is blocked inside this browser.
      </p>
      <SocialAuthCompact {mode} {onFacebookAuth} />
    {:else if showEmailAuth}
      <div class="email-flow">
        <button
          class="email-back"
          type="button"
          onclick={() => (showEmailAuth = false)}
        >
          <i class="fas fa-arrow-left" aria-hidden="true"></i>
          Other sign-in options
        </button>
        <EmailAuthTabs bind:mode {compact} />
      </div>
    {:else}
      <div class="method-grid">
        <div class="google-method">
          <SocialAuthCompact {mode} {onFacebookAuth} />
        </div>

        <div class="email-method-slot">
          <button
            class="email-method"
            type="button"
            onclick={() => (showEmailAuth = true)}
            aria-label={lastUsedEmail
              ? "Continue with email, last used on this device"
              : "Continue with email"}
          >
            {#if lastUsedEmail}
              <LastUsedBadge />
            {/if}
            <i class="fas fa-envelope" aria-hidden="true"></i>
            <span>Continue with email</span>
          </button>
        </div>
      </div>
    {/if}

    {#if facebookError}
      <p class="provider-error" role="alert">{facebookError}</p>
    {/if}
  </div>

  {#if !encoreOffer && (!compact || showOtherProviders)}
    <button class="mode-toggle" type="button" onclick={toggleMode}>
      {#if mode === "signup"}
        <span>Already have an account?</span>
        <strong>Sign in</strong>
      {:else}
        <span>New here?</span>
        <strong>Create an account</strong>
      {/if}
    </button>
  {/if}
</section>

<style>
  .contextual-auth-prompt {
    --prompt-blue: var(--prop-blue, #4155d8);
    --prompt-red: var(--prop-red, #ef3340);
    --theme-accent: var(--prompt-blue);
    --theme-accent-strong: color-mix(in srgb, var(--prompt-blue) 78%, white);
    --min-touch-target: clamp(44px, 2.2rem + 0.22vw, 56px);
    --font-size-min: clamp(0.875rem, 0.82rem + 0.06vw, 1.0625rem);
    --font-size-compact: clamp(0.75rem, 0.71rem + 0.04vw, 0.875rem);

    position: relative;
    container-type: inline-size;
    box-sizing: border-box;
    width: min(calc(100vw - 2rem), clamp(46rem, 34vw, 60rem));
    max-width: 100%;
    padding: clamp(1.35rem, 3.2cqw, 3.25rem);
    overflow: hidden;
    color: var(--theme-text, #f8fafc);
    background: var(--theme-panel-bg, #0b0d12);
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.16));
    border-radius: clamp(1rem, 1.4cqw, 1.5rem);
    box-shadow:
      0 2rem 5rem rgba(0, 0, 0, 0.48),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  .prompt-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .brand-lockup {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: clamp(0.75rem, 1.5cqw, 1.125rem);
  }

  .brand-mark {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    width: clamp(3rem, 6cqw, 4.25rem);
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: 50%;
    background: #ffffff;
    border: 1px solid rgba(255, 255, 255, 0.78);
    box-shadow: 0 0 0 0.25rem rgba(255, 255, 255, 0.04);
  }

  .brand-mark img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .brand-name {
    overflow: hidden;
    color: var(--theme-text, #f8fafc);
    font-size: clamp(1rem, 1rem + 0.3cqw, 1.375rem);
    font-weight: 650;
    letter-spacing: -0.015em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .close-button {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    width: var(--min-touch-target);
    min-height: var(--min-touch-target);
    padding: 0;
    color: var(--theme-text, #f8fafc);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 0.75rem;
    cursor: pointer;
    transition:
      background var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease,
      transform var(--duration-fast, 150ms) ease;
  }

  .close-button:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.09));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    transform: translateY(-1px);
  }

  .prompt-copy {
    width: min(100%, 42rem);
    min-height: clamp(5.5rem, 12cqw, 8rem);
    margin-inline: auto;
    padding-block: clamp(1.75rem, 4cqw, 3.5rem) clamp(1.25rem, 2.6cqw, 2.25rem);
  }

  h2 {
    margin: 0;
    color: var(--theme-text, #f8fafc);
    font-size: clamp(1.75rem, 1.25rem + 2.1cqw, 3rem);
    font-weight: 780;
    line-height: 1.05;
    letter-spacing: -0.035em;
    text-wrap: balance;
  }

  .prompt-copy p {
    max-width: 43rem;
    min-height: 2.96em;
    margin: clamp(0.65rem, 1.2cqw, 1rem) 0 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.72));
    font-size: clamp(0.9375rem, 0.82rem + 0.65cqw, 1.25rem);
    line-height: 1.48;
    text-wrap: pretty;
  }

  .auth-methods {
    width: min(100%, 42rem);
    margin-inline: auto;
  }

  .method-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: clamp(0.75rem, 1.6cqw, 1.25rem);
  }

  .google-method,
  .email-method-slot {
    min-width: 0;
  }

  .email-method-slot {
    padding-top: 0.75rem;
  }

  .email-method {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    width: 100%;
    min-height: var(--min-touch-target);
    padding: 0.75rem 1rem;
    color: var(--theme-text, #f8fafc);
    font-size: var(--font-size-min);
    font-weight: 650;
    background:
      linear-gradient(
          var(--theme-panel-bg, #0b0d12),
          var(--theme-panel-bg, #0b0d12)
        )
        padding-box,
      linear-gradient(100deg, var(--prompt-blue), var(--prompt-red)) border-box;
    border: 1px solid transparent;
    border-radius: var(--radius-md, 0.625rem);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.24);
    cursor: pointer;
    transition:
      background var(--duration-normal, 200ms) ease,
      box-shadow var(--duration-normal, 200ms) ease,
      transform var(--duration-normal, 200ms) ease;
  }

  .email-method:hover {
    background:
      linear-gradient(
          var(--theme-card-hover-bg, rgba(255, 255, 255, 0.07)),
          var(--theme-card-hover-bg, rgba(255, 255, 255, 0.07))
        )
        padding-box,
      linear-gradient(100deg, var(--prompt-blue), var(--prompt-red)) border-box;
    box-shadow: 0 0.4rem 1.2rem rgba(0, 0, 0, 0.3);
    transform: translateY(-1px);
  }

  .email-method i {
    font-size: 1rem;
  }

  .email-flow {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: clamp(1rem, 2.2cqw, 1.5rem);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.035));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-lg, 1rem);
  }

  .email-divider {
    display: flex;
    align-items: center;
    gap: 0.8rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-compact);
  }

  .email-divider::before,
  .email-divider::after {
    content: "";
    flex: 1;
    height: 1px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .email-back {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: 0.5rem;
    min-height: var(--min-touch-target);
    padding: 0.5rem 0.75rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.72));
    background: transparent;
    border: 0;
    border-radius: var(--radius-sm, 0.5rem);
    font-size: var(--font-size-min);
    cursor: pointer;
  }

  .email-back:hover {
    color: var(--theme-text, #f8fafc);
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
  }

  .provider-warning,
  .provider-error {
    margin: 0.75rem 0 0;
    font-size: var(--font-size-min);
    line-height: 1.45;
    text-align: center;
  }

  .provider-warning {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.72));
  }

  .provider-error {
    color: var(--semantic-error, #ef4444);
  }

  .mode-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    width: min(100%, 20rem);
    min-height: var(--min-touch-target);
    margin: clamp(1rem, 2.2cqw, 1.5rem) auto 0;
    padding: 0.65rem 1rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    background: color-mix(
      in srgb,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04)) 72%,
      transparent
    );
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-md, 0.75rem);
    font-size: var(--font-size-min);
    cursor: pointer;
    transition:
      background var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease;
  }

  .mode-toggle:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.18));
  }

  .mode-toggle strong {
    color: color-mix(in srgb, var(--prompt-blue) 72%, white);
    font-weight: 700;
  }

  .contextual-auth-prompt :global(.social-compact-button),
  .contextual-auth-prompt :global(.email-auth-tabs button),
  .email-method,
  .mode-toggle {
    min-height: var(--min-touch-target);
  }

  .close-button:focus-visible,
  .email-method:focus-visible,
  .email-back:focus-visible,
  .mode-toggle:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--prompt-blue) 72%, white);
    outline-offset: 3px;
  }

  :global(dialog.base-modal.contextual-auth-shell.chromeless[data-size="fit"]) {
    width: fit-content;
    max-width: calc(100vw - 2rem);
    height: fit-content;
  }

  @container (max-width: 34rem) {
    .contextual-auth-prompt {
      padding: 1.25rem;
    }

    .prompt-copy {
      width: 100%;
      min-height: 0;
      padding-block: 1.5rem 1.25rem;
    }

    .method-grid {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.25rem;
    }

    .email-method-slot {
      padding-top: 0;
    }
  }

  @media (max-height: 35rem) and (min-width: 48rem) {
    .contextual-auth-prompt {
      padding-block: 1rem;
    }

    .brand-mark {
      width: 2.75rem;
    }

    .prompt-copy {
      min-height: 0;
      padding-block: 0.8rem;
    }

    h2 {
      font-size: 1.55rem;
    }

    .prompt-copy p {
      min-height: 0;
      margin-top: 0.4rem;
      font-size: 0.875rem;
    }

    .mode-toggle {
      margin-top: 0.6rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .close-button,
    .email-method,
    .mode-toggle {
      transition: none;
    }

    .close-button:hover,
    .email-method:hover {
      transform: none;
    }
  }

  .compact {
    --min-touch-target: 44px;
    --font-size-min: 0.875rem;
    width: min(calc(100vw - 2rem), 24rem);
    padding: 2rem 1.5rem 1rem;
    border-color: var(--theme-stroke);
    box-shadow: 0 1rem 3rem rgba(0, 0, 0, 0.25);
  }

  .fac-signature {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    min-height: 28px;
    margin-bottom: 0.875rem;
  }

  .fac-signature img {
    border-radius: 50%;
  }

  .fac-signature span {
    color: var(--theme-text-dim);
    font-size: 0.75rem;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .encore-button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    width: 100%;
    min-height: 48px;
    padding: 0.75rem 1rem;
    color: var(--theme-panel-bg);
    background: var(--theme-text);
    border: 1px solid transparent;
    border-radius: var(--radius-sm, 0.5rem);
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 600;
    cursor: pointer;
  }

  .encore-button:hover {
    background: color-mix(
      in srgb,
      var(--theme-text) 88%,
      var(--theme-panel-bg)
    );
  }

  .encore-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 3px;
  }

  .compact .close-button {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    background: transparent;
    border: 0;
    color: var(--theme-text-dim);
  }

  .compact .prompt-copy {
    min-height: 0;
    padding: 0 0 1.5rem;
  }

  .compact h2 {
    padding-right: 1.75rem;
    font-size: 1.5rem;
    font-weight: 600;
    line-height: 1.25;
    letter-spacing: -0.025em;
    text-wrap: pretty;
  }

  .compact .prompt-copy p {
    min-height: 0;
    margin-top: 0.625rem;
    font-size: 0.9375rem;
    line-height: 1.4;
  }

  .more-methods {
    display: block;
    margin: 0.5rem auto 0;
    min-height: 44px;
    padding: 0.5rem 0.75rem;
    border: 0;
    border-radius: var(--radius-sm, 0.5rem);
    background: transparent;
    color: var(--theme-text-dim);
    font-size: var(--font-size-min);
    cursor: pointer;
  }

  .more-methods:hover {
    color: var(--theme-text);
    background: var(--theme-card-bg);
  }

  .more-methods:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .compact .mode-toggle {
    margin-top: 0.5rem;
    padding-inline: 0.5rem;
    flex-wrap: wrap;
    background: transparent;
    border: 0;
  }
</style>
