<script lang="ts">
  import type {
    AuthMode,
    AuthPromptContent,
  } from "#lib/shared/auth/domain/auth-nudge-trigger.js";
  import { getLastAuthMethod } from "#lib/shared/auth/services/last-auth-method.svelte.js";
  import EmailAuthTabs from "./EmailAuthTabs.svelte";
  import LastUsedBadge from "#lib/shared/components/LastUsedBadge.svelte";
  import { Crossfade } from "#lib/shared/transitions/motion.js";
  import SocialAuthCompact from "./SocialAuthCompact.svelte";
  import { browser } from "$app/env";
  import { page } from "$app/state";
  import { isNative } from "#lib/shared/platform/services/platform-detector.js";
  import { offersPhoneSignIn } from "../phone-sign-in/where.js";
  import {
    createPhoneSignInSession,
    type PhoneSignInSession,
  } from "../phone-sign-in/phone-sign-in-session.svelte.js";
  import { growFade, popIn } from "#lib/shared/transitions/motion.js";
  import DualSourceCrossfade from "#lib/shared/components/DualSourceCrossfade.svelte";
  import ThemePreview from "#lib/shared/settings/components/tabs/background/ThemePreview.svelte";
  import { getSettings } from "#lib/shared/application/state/app-state.svelte.js";
  import { BackgroundType } from "@austencloud/backgrounds";
  import {
    BACKGROUND_CARD_REGISTRY,
    getCardMetadata,
  } from "@austencloud/backgrounds/card";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { authPromptCopy } from "../domain/auth-prompt-copy";
  import { getMaxSteps } from "../domain/access-tier";
  import { ENCORE_STEPS } from "../state/guest-encore-state.svelte";
  import { onDestroy, tick, untrack } from "svelte";

  interface Props {
    content: AuthPromptContent;
    mode?: AuthMode;
    active?: boolean;
    idPrefix?: string;
    showClose?: boolean;
    embedded?: boolean;
    inAppBrowser?: boolean;
    facebookError?: string | null;
    onClose?: () => void;
    onFacebookAuth?: () => void;
    encoreOffer?: boolean;
    onAcceptEncore?: () => void;
    /** The sequence being saved or shared; the art plays it when given. */
    artifact?: SequenceData | null;
  }

  let {
    content,
    mode = $bindable("signup"),
    active = true,
    idPrefix = "contextual-auth",
    showClose = false,
    embedded = false,
    inAppBrowser = false,
    facebookError = null,
    onClose,
    onFacebookAuth,
    encoreOffer = false,
    onAcceptEncore,
    artifact = null,
  }: Props = $props();

  let showEmailAuth = $state(false);
  let showOtherProviders = $state(false);
  let showPhoneSignIn = $state(false);
  let emailFlow = $state<HTMLElement>();
  const lastMethod = $derived(getLastAuthMethod());
  // The copy object is rebuilt on every mode switch; only opening or a new key
  // is a new encounter, so the reset below watches these derived values, which
  // wake it only when they actually change.
  const isOpen = $derived(active);
  const contentKey = $derived(content.key);
  const compact = $derived(contentKey === "step-cap-guest");
  const lastUsedEmail = $derived(
    lastMethod === "magic-link" || lastMethod === "password"
  );

  // Every opening and every action context starts as a fresh encounter. A
  // previous email form should never leak into the next thing the user tries.
  // Someone who signed in by email on this device last time skips the choice
  // and lands on the form; "Other sign-in options" is one press away.
  $effect(() => {
    // A closed sheet stops asking the server about its code.
    if (!isOpen) {
      untrack(dropPhoneSession);
      return;
    }
    contentKey;
    showEmailAuth = untrack(() => lastUsedEmail);
    showOtherProviders = false;
    showPhoneSignIn = false;
    untrack(dropPhoneSession);
  });

  // "Use your phone" is offered only on Austen's own copies of the app.
  const phoneOffered = $derived(
    browser && offersPhoneSignIn(page.url, isNative())
  );
  // One phone sign-in per opening of the sheet. Pointing at the choice already
  // asks for a code, so it is usually on screen by the time the panel arrives.
  // The server allows a few codes per address in ten minutes, which is why
  // merely opening the sheet does not ask, and why going back keeps the code.
  let phoneSession = $state.raw<PhoneSignInSession | null>(null);
  let phonePanel = $state.raw<Promise<
    typeof import("../phone-sign-in/PhoneSignInPanel.svelte")
  > | null>(null);

  function warmPhoneSignIn() {
    phonePanel ??= import("../phone-sign-in/PhoneSignInPanel.svelte");
    if (!phoneSession) {
      phoneSession = createPhoneSignInSession();
      void phoneSession.start();
    }
  }

  function openPhoneSignIn() {
    warmPhoneSignIn();
    // A code warmed long ago may have run out; this asks for a new one then,
    // and does nothing while one is on its way or showing.
    void phoneSession?.start();
    showPhoneSignIn = true;
  }

  function dropPhoneSession() {
    phoneSession?.dispose();
    phoneSession = null;
  }

  onDestroy(dropPhoneSession);

  // The sheet sits on the person's own background, with a sequence playing
  // beside the sign-in choices. The navigation panel stays plain: it already
  // sits inside the app's chrome.
  const withArt = $derived(!embedded);
  const backgroundType = $derived(
    getSettings().backgroundType || BackgroundType.COSMIC
  );
  const backgroundFallback = $derived(
    (getCardMetadata(backgroundType) ?? BACKGROUND_CARD_REGISTRY[0])
      ?.gradient ?? "#0b0d12"
  );
  const showcase = $derived(withArt ? import("./AuthShowcase.svelte") : null);

  // The step-cap prompt draws the limit: the steps the person made, lit, out of
  // the 64 an account allows. A one-time extension marks the steps it adds.
  const ACCOUNT_STEPS = getMaxSteps("user");
  const stepsMade = $derived(
    Math.min(ACCOUNT_STEPS, artifact?.steps.length || getMaxSteps("guest"))
  );

  const titleId = $derived(`${idPrefix}-title`);
  const descriptionId = $derived(`${idPrefix}-description`);

  // Switching between signing in and creating an account keeps the email form
  // open. Sending the person back to the method choice cost two more presses.
  function toggleMode() {
    mode = mode === "signup" ? "signin" : "signup";
  }

  /** Puts the cursor in the email form's first empty box, if the form shows. */
  export function focusFirstField() {
    if (!showEmailAuth || !emailFlow) return;
    const inputs = [
      ...emailFlow.querySelectorAll<HTMLInputElement>("input:not([disabled])"),
    ];
    (inputs.find((input) => !input.value) ?? inputs[0])?.focus();
  }

  // The pressed button leaves the page with the choice it offered, so focus
  // moves into the form instead of falling to the page body.
  async function openEmailAuth() {
    showEmailAuth = true;
    await tick();
    focusFirstField();
  }
</script>

<section
  class="contextual-auth-prompt"
  class:compact
  class:embedded
  class:split={withArt}
  class:phone-up={withArt && showPhoneSignIn}
  class:more-open={compact && showOtherProviders}
  class:encore-offer={encoreOffer}
  aria-labelledby={titleId}
  aria-describedby={descriptionId}
  style:--art-fallback={withArt ? backgroundFallback : null}
>
  {#if withArt}
    <div class="art-canvas" aria-hidden="true">
      <ThemePreview type={backgroundType} fallback={backgroundFallback} />
    </div>
    <div class="art-stage">
      <DualSourceCrossfade active={showPhoneSignIn ? "second" : "first"}>
        {#snippet first()}
          <div class="art-sequence" aria-hidden="true">
            {#if showcase}
              {#await showcase then mod}
                <mod.default sequence={artifact} />
              {/await}
            {/if}
          </div>
        {/snippet}
        {#snippet second()}
          <div class="art-code">
            {#if phonePanel && phoneSession}
              {#await phonePanel then mod}
                <div class="code-card">
                  <mod.default session={phoneSession} part="code" />
                </div>
              {/await}
            {/if}
          </div>
        {/snippet}
      </DualSourceCrossfade>
    </div>
  {/if}

  <div class="sign-in-column">
    {#if !embedded}
      <header class="prompt-header">
        {#if !compact}
          <div class="brand-lockup" transition:growFade>
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
            aria-label={t("common_close")}
            transition:popIn
          >
            <i class="fas fa-times" aria-hidden="true"></i>
          </button>
        {/if}
      </header>
    {/if}

    <div class="prompt-copy">
      {#if compact}
        <div class="fac-signature">
          <img src="/branding/logo.jpg" alt="" width="28" height="28" />
          {#if encoreOffer}<span transition:growFade={{ axis: "x" }}
              >{t("auth_one_time_extension")}</span
            >{/if}
        </div>
      {/if}
      <div id={titleId} class="prompt-heading" role="heading" aria-level="2">
        <Crossfade key={content.title}>
          {authPromptCopy(content.title)}
        </Crossfade>
      </div>
      <div id={descriptionId} class="prompt-description">
        <Crossfade key={content.body} animateHeight>
          {authPromptCopy(content.body)}
        </Crossfade>
      </div>
      {#if compact}
        <div class="step-meter" aria-hidden="true">
          {#each { length: ACCOUNT_STEPS }, index (index)}
            <span
              class="step-cell"
              class:made={index < stepsMade}
              style:--along={index / Math.max(1, stepsMade - 1)}
              class:offered={encoreOffer &&
                index >= stepsMade &&
                index < ENCORE_STEPS}
            ></span>
          {/each}
        </div>
      {/if}
    </div>

    <div class="auth-methods">
      <Crossfade
        key={encoreOffer
          ? "encore"
          : compact
            ? "compact"
            : inAppBrowser
              ? "browser"
              : showPhoneSignIn
                ? "phone"
                : showEmailAuth
                  ? "email"
                  : "providers"}
        animateHeight
      >
        {#if compact && encoreOffer}
          <button class="encore-button" type="button" onclick={onAcceptEncore}>
            {t("auth_keep_going")}
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
            <Crossfade key={showOtherProviders}>
              {showOtherProviders
                ? t("auth_fewer_options")
                : t("auth_more_sign_in_options")}
            </Crossfade>
          </button>
          {#if showOtherProviders}
            <div
              transition:growFade
              onoutrostart={(event) =>
                ((event.currentTarget as HTMLElement).inert = true)}
              onintrostart={(event) =>
                ((event.currentTarget as HTMLElement).inert = false)}
            >
              <SocialAuthCompact {mode} {onFacebookAuth} />
            </div>
          {/if}
        {:else if inAppBrowser}
          <div class="email-flow">
            <div class="email-divider">
              <span>{t("auth_continue_by_email")}</span>
            </div>
            <EmailAuthTabs bind:mode {compact} showModeSwitch={false} />
          </div>

          <p class="provider-warning">
            {t("auth_social_blocked_browser")}
          </p>
          <SocialAuthCompact {mode} {onFacebookAuth} />
        {:else if showPhoneSignIn}
          <div class="email-flow phone-flow">
            <button
              class="email-back"
              type="button"
              onclick={() => (showPhoneSignIn = false)}
            >
              <i class="fas fa-arrow-left" aria-hidden="true"></i>
              {t("auth_other_sign_in_options")}
            </button>
            {#if phonePanel && phoneSession}
              {#await phonePanel then mod}
                <mod.default
                  session={phoneSession}
                  part={withArt ? "words" : "both"}
                />
              {/await}
            {/if}
          </div>
        {:else if showEmailAuth}
          <div class="email-flow" bind:this={emailFlow}>
            <button
              class="email-back"
              type="button"
              onclick={() => (showEmailAuth = false)}
            >
              <i class="fas fa-arrow-left" aria-hidden="true"></i>
              {t("auth_other_sign_in_options")}
            </button>
            <EmailAuthTabs bind:mode {compact} showModeSwitch={false} />
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
                onclick={openEmailAuth}
                aria-label={lastUsedEmail
                  ? t("auth_continue_email_last_used")
                  : t("auth_continue_email")}
              >
                {#if lastUsedEmail}
                  <LastUsedBadge />
                {/if}
                <i class="fas fa-envelope" aria-hidden="true"></i>
                <span>{t("auth_continue_email")}</span>
              </button>
            </div>

            {#if phoneOffered}
              <button
                class="phone-method"
                type="button"
                onpointerenter={warmPhoneSignIn}
                onpointerdown={warmPhoneSignIn}
                onfocus={warmPhoneSignIn}
                onclick={openPhoneSignIn}
              >
                <i class="fa-solid fa-qrcode" aria-hidden="true"></i>
                <span>Use your phone</span>
              </button>
            {/if}
          </div>
        {/if}
      </Crossfade>

      {#if facebookError}
        <p class="provider-error" role="alert" transition:growFade>
          {facebookError}
        </p>
      {/if}
    </div>

    {#if !encoreOffer && (!compact || showOtherProviders)}
      <button
        class="mode-toggle"
        type="button"
        onclick={toggleMode}
        transition:growFade
        onoutrostart={(event) =>
          ((event.currentTarget as HTMLElement).inert = true)}
        onintrostart={(event) =>
          ((event.currentTarget as HTMLElement).inert = false)}
      >
        <Crossfade key={mode}>
          {#if mode === "signup"}
            <span>{t("auth_already_have_account")}</span>
            <strong>{t("auth_sign_in")}</strong>
          {:else}
            <span>{t("auth_new_here")}</span>
            <strong>{t("auth_create_account")}</strong>
          {/if}
        </Crossfade>
      </button>
    {/if}
  </div>
</section>

<style>
  .contextual-auth-prompt.embedded {
    width: 100%;
    padding: 0;
    overflow: visible;
    background: transparent;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }

  .embedded .prompt-copy {
    min-height: 0;
    padding-block: 0 1.25rem;
  }

  .embedded .prompt-heading {
    font-size: clamp(1.5rem, 1.3rem + 1cqw, 2rem);
  }

  .embedded .prompt-description {
    min-height: 0;
  }

  .embedded .mode-toggle {
    flex-wrap: wrap;
  }

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
    background: var(--theme-panel-elevated-bg, #0b0d12);
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.16));
    border-radius: clamp(1rem, 1.4cqw, 1.5rem);
    box-shadow:
      0 2rem 5rem rgba(0, 0, 0, 0.48),
      inset 0 1px 0 rgba(255, 255, 255, 0.05);
  }

  .sign-in-column {
    position: relative;
    container-type: inline-size;
    min-width: 0;
  }

  /* The full sheet: the person's own background behind everything, a sequence
     playing on it, and the sign-in choices on the app's panel color beside it.
     Below 45rem the art is a band across the top. */
  .contextual-auth-prompt.split {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto;
    width: min(calc(100vw - 2rem), 32rem);
    padding: 0;
    background: var(--art-fallback, #0b0d12);
  }

  .art-canvas {
    position: absolute;
    inset: 0;
    z-index: 0;
    pointer-events: none;
  }

  .art-stage {
    position: relative;
    z-index: 1;
    display: grid;
    min-width: 0;
    height: clamp(9rem, 24svh, 14rem);
    padding: 0.75rem;
    box-sizing: border-box;
    transition:
      height var(--duration-normal) var(--ease-standard),
      padding var(--duration-normal) var(--ease-standard);
  }

  /* On a phone the step-cap sheet folds its band away while the other sign-in
     choices are open, so they fit without scrolling. */
  @media (width < 45rem) {
    .more-open .art-stage {
      height: 0;
      padding-block: 0;
      overflow: hidden;
    }
  }

  /* The code needs its full square, so the band opens up for it. */
  .phone-up .art-stage {
    height: 18.5rem;
  }

  .art-sequence,
  .art-code {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
  }

  .code-card {
    padding: 1rem 1rem 0.5rem;
    background: var(--theme-panel-bg, rgba(0, 0, 0, 0.75));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-lg, 1rem);
    box-shadow: var(--theme-panel-shadow, 0 1rem 3rem rgba(0, 0, 0, 0.35));
  }

  .split .sign-in-column {
    z-index: 1;
    padding: 1.25rem;
    background: var(--theme-panel-bg, rgba(0, 0, 0, 0.75));
  }

  @media (min-width: 45rem) {
    .contextual-auth-prompt.split {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      grid-template-rows: minmax(0, 1fr);
      width: min(calc(100vw - 2rem), clamp(52rem, 46vw, 72rem));
      min-height: min(clamp(34rem, 55vh, 40rem), calc(100dvh - 3rem));
    }

    .art-stage,
    .phone-up .art-stage {
      height: auto;
      padding: clamp(1rem, 2.5vw, 2.5rem);
    }

    .split .sign-in-column {
      display: flex;
      flex-direction: column;
      justify-content: center;
      padding: clamp(1.5rem, 3vw, 3rem);
    }
  }

  /* Short landscape screens: the column gives up padding before it scrolls. */
  @media (max-height: 35rem) and (min-width: 45rem) {
    .split .sign-in-column {
      padding-block: 0.5rem;
    }

    .split .mode-toggle {
      margin-top: 0.5rem;
    }
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
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard),
      transform var(--duration-fast) var(--ease-standard);
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

  .prompt-heading {
    margin: 0;
    color: var(--theme-text, #f8fafc);
    font-size: clamp(1.75rem, 1.25rem + 2.1cqw, 3rem);
    font-weight: 780;
    line-height: 1.05;
    letter-spacing: -0.035em;
    text-wrap: balance;
  }

  .prompt-description {
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
      background var(--duration-normal) var(--ease-standard),
      box-shadow var(--duration-normal) var(--ease-standard),
      transform var(--duration-normal) var(--ease-standard);
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

  /* A quieter third choice under the two main ones, across both columns. */
  .phone-method {
    grid-column: 1 / -1;
    justify-self: center;
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    min-height: var(--min-touch-target);
    padding: 0.5rem 1rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.72));
    font-size: var(--font-size-min);
    background: transparent;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 999px;
    cursor: pointer;
    transition:
      color var(--duration-fast) var(--ease-standard),
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard);
  }

  .phone-method:hover {
    color: var(--theme-text, #f8fafc);
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.18));
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
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard);
  }

  .mode-toggle :global(.crossfade > .layer) {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    flex-wrap: wrap;
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
  .phone-method:focus-visible,
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

    .prompt-heading {
      font-size: 1.55rem;
    }

    .prompt-description {
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
    .mode-toggle,
    .art-stage {
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

  /* The step-cap sheet carries less, so its split is narrower and shorter. */
  .contextual-auth-prompt.split.compact {
    width: min(calc(100vw - 2rem), 28rem);
  }

  .split.compact .sign-in-column {
    padding: 1.25rem 1.25rem 0.75rem;
  }

  @media (min-width: 45rem) {
    .contextual-auth-prompt.split.compact {
      width: min(calc(100vw - 2rem), clamp(44rem, 38vw, 60rem));
      min-height: min(clamp(28rem, 46vh, 34rem), calc(100dvh - 3rem));
    }

    .split.compact .sign-in-column {
      padding: clamp(1.5rem, 3vw, 2.75rem);
    }

    .split.compact .prompt-heading {
      font-size: 1.875rem;
      font-weight: 700;
      line-height: 1.15;
    }
  }

  /* Sixteen across, four down: one lit stretch of eight in a field of 64. */
  .step-meter {
    display: grid;
    grid-template-columns: repeat(16, minmax(0, 1fr));
    gap: 0.25rem;
    margin-top: 1.25rem;
  }

  /* Short landscape screens: the step-cap sheet tightens before it scrolls. */
  @media (max-height: 35rem) and (min-width: 45rem) {
    .split.compact .sign-in-column {
      padding-block: 0.5rem;
    }

    .split.compact .fac-signature {
      margin-bottom: 0.5rem;
    }

    .split.compact .prompt-heading {
      font-size: 1.5rem;
    }

    .split.compact .prompt-copy {
      padding-bottom: 0.75rem;
    }

    .split.compact .step-meter {
      margin-top: 0.75rem;
    }
  }

  .step-cell {
    aspect-ratio: 1;
    background: color-mix(in srgb, var(--theme-text, #f8fafc) 6%, transparent);
    border: 1px solid
      color-mix(in srgb, var(--theme-text, #f8fafc) 16%, transparent);
    border-radius: 0.2rem;
  }

  .step-cell.made {
    /* The lit run fades from blue to red, one prop to the other. */
    background: color-mix(
      in oklab,
      var(--prompt-blue),
      var(--prompt-red) calc(var(--along) * 100%)
    );
    border-color: transparent;
  }

  .step-cell.offered {
    background: color-mix(in srgb, var(--prompt-blue) 22%, transparent);
    border-color: color-mix(in srgb, var(--prompt-blue) 60%, white);
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

  .compact .prompt-heading {
    padding-right: 1.75rem;
    font-size: 1.5rem;
    font-weight: 600;
    line-height: 1.25;
    letter-spacing: -0.025em;
    text-wrap: pretty;
  }

  .compact .prompt-description {
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
