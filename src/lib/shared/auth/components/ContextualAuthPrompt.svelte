<!--
  ContextualAuthPrompt - the centred sign-in box on wider windows.

  The person's own background with a sequence playing on it, the brand and a
  close button, and SignInContent: the same content the phone's sign-in
  screen shows. Every provider flow stays inside SignInContent's parts.
-->
<script lang="ts">
  import type {
    AuthMode,
    AuthPromptContent,
  } from "#lib/shared/auth/domain/auth-nudge-trigger.js";
  import { popIn } from "#lib/shared/transitions/motion.js";
  import ThemePreview from "#lib/shared/settings/components/tabs/background/ThemePreview.svelte";
  import { getSettings } from "#lib/shared/application/state/app-state.svelte.js";
  import { BackgroundType } from "@austencloud/backgrounds";
  import {
    BACKGROUND_CARD_REGISTRY,
    getCardMetadata,
  } from "@austencloud/backgrounds/card";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import SignInContent, { type SignInView } from "./SignInContent.svelte";

  interface Props {
    /** The gate's copy, or null for a plain Sign in. */
    content?: AuthPromptContent | null;
    mode?: AuthMode;
    active?: boolean;
    idPrefix?: string;
    showClose?: boolean;
    initialView?: SignInView;
    facebookError?: string | null;
    onClose?: () => void;
    onFacebookAuth?: () => void;
    /** The sequence being saved or shared; the art plays it when given. */
    artifact?: SequenceData | null;
  }

  let {
    content = null,
    mode = $bindable("signup"),
    active = true,
    idPrefix = "contextual-auth",
    showClose = false,
    initialView = "code",
    facebookError = null,
    onClose,
    onFacebookAuth,
    artifact = null,
  }: Props = $props();

  let prompt = $state<{ focusFirstField: () => void }>();

  const backgroundType = $derived(
    getSettings().backgroundType || BackgroundType.COSMIC
  );
  const backgroundFallback = $derived(
    (getCardMetadata(backgroundType) ?? BACKGROUND_CARD_REGISTRY[0])
      ?.gradient ?? "#0b0d12"
  );
  const showcase = import("./AuthShowcase.svelte");

  /** Puts the cursor in the form's first empty box. */
  export function focusFirstField() {
    prompt?.focusFirstField();
  }
</script>

<div
  class="contextual-auth-prompt split"
  style:--art-fallback={backgroundFallback}
>
  <div class="art-canvas" aria-hidden="true">
    <ThemePreview type={backgroundType} fallback={backgroundFallback} />
  </div>
  <div class="art-stage">
    <div class="art-sequence" aria-hidden="true">
      {#await showcase then mod}
        <mod.default sequence={artifact} />
      {/await}
    </div>
  </div>

  <div class="sign-in-column">
    <header class="prompt-header">
      <div class="brand-lockup">
        <span class="brand-mark">
          <img src="/branding/logo.jpg" alt="" width="56" height="56" />
        </span>
        <span class="brand-name">Flow Arts Composer</span>
      </div>

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

    <div class="prompt-body">
      <SignInContent
        bind:this={prompt}
        bind:mode
        {content}
        {active}
        {idPrefix}
        {initialView}
        {facebookError}
        {onFacebookAuth}
        layout="box"
      />
    </div>
  </div>
</div>

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
    border: 0;
  }

  /* The sheet's edge is drawn over the art and the column alike. A border on
     the sheet itself showed the fallback gradient through it, so it changed
     color around the edge and all but vanished along the bottom. */
  .contextual-auth-prompt.split::after {
    content: "";
    position: absolute;
    inset: 0;
    z-index: 2;
    border-radius: inherit;
    box-shadow: inset 0 0 0 1px
      var(--theme-stroke-strong, rgba(255, 255, 255, 0.16));
    pointer-events: none;
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

  .art-sequence {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
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

    .art-stage {
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

  .prompt-body {
    padding-top: clamp(1rem, 3cqw, 2rem);
  }

  .close-button:focus-visible {
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
  }

  @media (max-height: 35rem) and (min-width: 48rem) {
    .contextual-auth-prompt {
      padding-block: 1rem;
    }

    .brand-mark {
      width: 2.75rem;
    }

    .prompt-body {
      padding-top: 0.5rem;
    }
  }


  @media (prefers-reduced-motion: reduce) {
    .close-button,
    .art-stage {
      transition: none;
    }

    .close-button:hover {
      transform: none;
    }
  }
</style>
