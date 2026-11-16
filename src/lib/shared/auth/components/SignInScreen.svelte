<!--
  SignInScreen - the phone host for SignInContent: a screen of its own.

  A back arrow at the top left and the sign-in content below it. Nothing
  swipes it away and there is no outside to tap; the arrow, the phone's Back
  and Escape close it (AuthModal owns those paths). With a field focused and
  the keyboard up, the header slims to the arrow and "Sign in", and the field
  and its one main action sit directly above the keys.

  Keyboard height comes only from `createKeyboardInset`. Where the
  VirtualKeyboard API is present the keyboard overlays the page, so the
  screen lifts its content by that height; elsewhere the visual viewport
  already shrinks (`--viewport-height`), so nothing is added twice.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import type {
    AuthMode,
    AuthPromptContent,
  } from "#lib/shared/auth/domain/auth-nudge-trigger.js";
  import { createKeyboardInset } from "#lib/shared/mobile/utils/keyboard-inset.svelte.js";
  import { detectPlatform } from "#lib/shared/mobile/services/platform-detector.js";
  import { getDeviceDetector } from "#lib/shared/device/get-device-detector.js";
  import { popIn } from "#lib/shared/transitions/motion.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getSettings } from "#lib/shared/application/state/app-state.svelte.js";
  import { BackgroundType } from "@austencloud/backgrounds";
  import {
    BACKGROUND_CARD_REGISTRY,
    getCardMetadata,
  } from "@austencloud/backgrounds/card";
  import SignInContent, { type SignInView } from "./SignInContent.svelte";

  interface Props {
    content?: AuthPromptContent | null;
    mode?: AuthMode;
    active?: boolean;
    idPrefix?: string;
    initialView?: SignInView;
    forceKeyboardFrame?: boolean;
    facebookError?: string | null;
    onBack: () => void;
    onFacebookAuth?: () => void;
  }

  let {
    content = null,
    mode = $bindable("signup"),
    active = true,
    idPrefix = "sign-in-screen",
    initialView = "code",
    forceKeyboardFrame = false,
    facebookError = null,
    onBack,
    onFacebookAuth,
  }: Props = $props();

  const keyboard = createKeyboardInset(() => active);
  let isIOSPlatform = $state(false);
  let isTouchDevice = $state(false);
  let keyboardFrame = $state(false);
  let prompt = $state<{ focusFirstField: () => void }>();

  onMount(() => {
    isIOSPlatform = detectPlatform() === "ios";
    try {
      isTouchDevice = getDeviceDetector().isTouchDevice();
    } catch {
      isTouchDevice = false;
    }
  });

  // The panel colour is see-through in most themes. A screen of its own
  // paints it over the person's background colours, as the wide box does,
  // so the page behind never shows through.
  const screenBase = $derived(
    (getCardMetadata(getSettings().backgroundType || BackgroundType.COSMIC) ??
      BACKGROUND_CARD_REGISTRY[0])?.gradient ?? "#0b0d12"
  );

  const keyboardLift = $derived(
    keyboard.hasVirtualKeyboardAPI ? keyboard.height : 0
  );

  export function focusFirstField() {
    prompt?.focusFirstField();
  }
</script>

<div
  class="sign-in-screen"
  class:frame={keyboardFrame}
  style:--keyboard-lift="{keyboardLift}px"
  style:--screen-base={screenBase}
>
  <header class="screen-header">
    <button
      class="back-button"
      type="button"
      onclick={onBack}
      aria-label={t("common_back")}
    >
      <i class="fas fa-arrow-left" aria-hidden="true"></i>
    </button>
    {#if keyboardFrame}
      <span class="screen-title" transition:popIn>{t("auth_sign_in")}</span>
    {/if}
  </header>

  <div class="screen-body">
    <SignInContent
      bind:this={prompt}
      bind:mode
      bind:keyboardFrame
      {content}
      {active}
      {idPrefix}
      {initialView}
      {forceKeyboardFrame}
      {facebookError}
      {onFacebookAuth}
      {isIOSPlatform}
      {isTouchDevice}
      keyboardHeight={keyboard.height}
      layout="screen"
    />
  </div>
</div>

<style>
  .sign-in-screen {
    position: relative;
    container-type: inline-size;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    padding: max(0.5rem, env(safe-area-inset-top, 0px))
      max(1rem, env(safe-area-inset-right, 0px))
      calc(
        max(0.75rem, env(safe-area-inset-bottom, 0px)) +
          var(--keyboard-lift, 0px)
      )
      max(1rem, env(safe-area-inset-left, 0px));
    overflow: hidden;
    color: var(--theme-text, #f8fafc);
    background:
      linear-gradient(
        var(--theme-panel-elevated-bg, #0b0d12),
        var(--theme-panel-elevated-bg, #0b0d12)
      ),
      var(--screen-base, #0b0d12);
  }

  .screen-header {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 0.5rem;
    height: 44px;
  }

  .back-button {
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    width: 44px;
    height: 44px;
    padding: 0;
    color: var(--theme-text, #f8fafc);
    font-size: var(--font-size-lg);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 0.75rem;
    cursor: pointer;
  }

  .back-button:focus-visible {
    outline: 3px solid
      color-mix(in srgb, var(--theme-accent, #4155d8) 72%, white);
    outline-offset: 2px;
  }

  .screen-title {
    font-size: var(--font-size-base);
    font-weight: 700;
  }

  /* Reach first: the content sits low, the leading actions in the lower two
     thirds. With the keyboard up the main action rests directly on it.
     The space above and below is two spacers that give way first when the
     window is too short. After that the content scrolls from the top, so
     nothing slides under the back arrow. The side padding keeps focus rings
     inside the scrolling box. */
  .screen-body {
    --space-above: 0.75rem;
    --space-below: clamp(0rem, 6svh, 3rem);

    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    align-self: center;
    min-height: 0;
    width: min(100% + 1rem, 31rem);
    padding-inline: 0.5rem;
    overflow-y: auto; /* scrolls: the sign-in choices, only when the window is too short to hold them */
  }

  .screen-body::before,
  .screen-body::after {
    content: "";
    min-height: 0;
  }

  .screen-body::before {
    flex: 1 1 var(--space-above);
  }

  .screen-body::after {
    flex: 0 1 var(--space-below);
  }

  .screen-body > :global(*) {
    flex-shrink: 0;
  }

  .frame .screen-body {
    --space-above: 0.5rem;
    --space-below: 0rem;
  }

  /* The dialog is the whole visible viewport on every phone tier, including
     a phone on its side, where the stock full-size rule (520px) misses. */
  :global(dialog.base-modal.chromeless.sign-in-screen-shell[data-size="full"]) {
    position: fixed;
    inset: var(--viewport-offset-top, 0px) 0 auto 0;
    width: 100vw;
    max-width: none;
    height: var(--viewport-height, 100dvh);
    max-height: none;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    overflow: hidden;
    background: #0b0d12;
  }

  :global(dialog.sign-in-screen-shell .modal-content-wrapper),
  :global(dialog.sign-in-screen-shell .modal-body) {
    height: 100%;
    max-height: none;
    padding: 0;
    overflow: hidden;
  }

  @media (orientation: landscape) and (max-height: 600px) {
    .screen-body {
      --space-above: 0rem;
      --space-below: 0rem;

      width: min(100% + 1rem, 57rem);
    }

    /* Both spacers grow, so the content sits in the middle. */
    .screen-body::after {
      flex-grow: 1;
    }
  }
</style>
