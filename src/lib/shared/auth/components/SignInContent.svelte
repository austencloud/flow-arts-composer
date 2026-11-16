<!--
  SignInContent - the one sign-in content, shown by both hosts.

  On a phone it fills the sign-in screen (SignInScreen); on a wider window it
  sits in the centred box (ContextualAuthPrompt inside AuthModal). Top to
  bottom: the title, one sentence (a gate's reason takes its place), Google,
  "or", the email field with "Email me a code", a row of pills for the other
  ways in, and one small line for people who are new. It never opens on a
  password: Google and the emailed code lead, because an account made with
  Google has no password at all.

  With a field focused and the on-screen keyboard up, the keyboard-open frame
  (`#lib/shared/mobile/utils/keyboard-open-frame.ts`) leaves only the field or
  fields and the one main action; everything else steps aside and comes back
  when the keyboard drops. The host measures the keyboard; this decides.
-->
<script lang="ts" module>
  export type SignInView = "code" | "password" | "phone";
</script>

<script lang="ts">
  import { browser } from "$app/env";
  import { page } from "$app/state";
  import { onDestroy, tick, untrack } from "svelte";
  import type {
    AuthMode,
    AuthPromptContent,
  } from "#lib/shared/auth/domain/auth-nudge-trigger.js";
  import { authPromptCopy } from "../domain/auth-prompt-copy";
  import { offersPhoneSignIn } from "../phone-sign-in/where.js";
  import {
    createPhoneSignInSession,
    type PhoneSignInSession,
  } from "../phone-sign-in/phone-sign-in-session.svelte.js";
  import { isNative } from "#lib/shared/platform/services/platform-detector.js";
  import { Crossfade, growFade } from "#lib/shared/transitions/motion.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { computeKeyboardOpenFrame } from "#lib/shared/mobile/utils/keyboard-open-frame.js";
  import SocialAuthCompact from "./SocialAuthCompact.svelte";
  import EmailLinkAuth from "./EmailLinkAuth.svelte";
  import EmailPasswordAuth from "./EmailPasswordAuth.svelte";

  interface Props {
    /** The gate's copy; its body replaces the standing sentence. */
    content?: AuthPromptContent | null;
    mode?: AuthMode;
    /** False while the host is closed: the next opening is a new encounter. */
    active?: boolean;
    idPrefix?: string;
    /** Where the content starts. Always "code" in the app. */
    initialView?: SignInView;
    /** The view on screen, read by hosts that react to it. */
    view?: SignInView;
    /** The phone screen lays the content out for a phone and its keyboard. */
    layout?: "screen" | "box";
    /** Keyboard height from the host's `createKeyboardInset`. */
    keyboardHeight?: number;
    isIOSPlatform?: boolean;
    isTouchDevice?: boolean;
    /** The internal auth lab shows the keyboard-open frame on demand. */
    forceKeyboardFrame?: boolean;
    /** True while the keyboard-open frame is showing (read by the host). */
    keyboardFrame?: boolean;
    facebookError?: string | null;
    onFacebookAuth?: () => void;
  }

  let {
    content = null,
    mode = $bindable("signup"),
    active = true,
    idPrefix = "sign-in",
    initialView = "code",
    view = $bindable("code"),
    layout = "box",
    keyboardHeight = 0,
    isIOSPlatform = false,
    isTouchDevice = false,
    forceKeyboardFrame = false,
    keyboardFrame = $bindable(false),
    facebookError = null,
    onFacebookAuth,
  }: Props = $props();

  // One address for the code and the password forms, so switching never
  // retypes it.
  let email = $state("");
  let sendCodeOnOpen = $state(false);
  let codeStage = $state<"idle" | "sending" | "sent">("idle");
  let fieldFocused = $state(false);
  let root = $state<HTMLElement>();

  const titleId = $derived(`${idPrefix}-title`);
  const descriptionId = $derived(`${idPrefix}-description`);
  const sentence = $derived(
    content ? authPromptCopy(content.body) : t("auth_prompt_save_any_device")
  );
  const contentKey = $derived(content?.key ?? "generic");
  const isOpen = $derived(active);

  // Every opening, and every new gate, starts on the code view.
  $effect(() => {
    if (!isOpen) {
      untrack(dropPhoneSession);
      return;
    }
    contentKey;
    untrack(() => {
      view = initialView;
      // The password view signs in; making an account with one is its pill.
      if (initialView === "password") mode = "signin";
      sendCodeOnOpen = false;
      if (initialView !== "phone") dropPhoneSession();
      else openPhoneSignIn();
    });
  });

  const phoneOffered = $derived(
    browser && offersPhoneSignIn(page.url, isNative())
  );
  // Pointing at the choice loads the panel; only pressing it asks for a code,
  // because a request can ring the owner's phone. One session per opening.
  let phoneSession = $state.raw<PhoneSignInSession | null>(null);
  let phonePanel = $state.raw<Promise<
    typeof import("../phone-sign-in/PhoneSignInPanel.svelte")
  > | null>(null);

  function warmPhoneSignIn() {
    phonePanel ??= import("../phone-sign-in/PhoneSignInPanel.svelte");
  }

  function openPhoneSignIn() {
    warmPhoneSignIn();
    phoneSession ??= createPhoneSignInSession();
    void phoneSession.start();
    view = "phone";
  }

  function dropPhoneSession() {
    phoneSession?.dispose();
    phoneSession = null;
  }

  onDestroy(dropPhoneSession);

  async function show(next: SignInView, { focus = true } = {}) {
    if (next === "phone") openPhoneSignIn();
    else view = next;
    if (next === "password") mode = "signin";
    if (!focus) return;
    await tick();
    focusFirstField();
  }

  function useCodeInstead() {
    sendCodeOnOpen = true;
    void show("code");
  }

  function showCode() {
    sendCodeOnOpen = false;
    void show("code");
  }

  function togglePasswordMode() {
    mode = mode === "signup" ? "signin" : "signup";
  }

  /** Puts the cursor in the form's first empty box. */
  export function focusFirstField() {
    if (!root) return;
    const inputs = [
      ...root.querySelectorAll<HTMLInputElement>(
        ".sign-in-form input:not([disabled])"
      ),
    ];
    (inputs.find((input) => !input.value) ?? inputs[0])?.focus();
  }

  function isTypingField(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLInputElement &&
      !["button", "checkbox", "radio", "submit"].includes(target.type)
    );
  }

  function handleFocusIn(event: FocusEvent) {
    fieldFocused = isTypingField(event.target);
  }

  function handleFocusOut(event: FocusEvent) {
    // Moving between the email and password fields keeps the frame.
    if (!isTypingField(event.relatedTarget)) fieldFocused = false;
  }

  const frame = $derived(
    layout === "screen" &&
      view !== "phone" &&
      (forceKeyboardFrame ||
        computeKeyboardOpenFrame({
          isInputFocused: fieldFocused,
          isSubmitting: false,
          isIOSPlatform,
          isTouchDevice,
          keyboardHeight,
        }))
  );

  $effect(() => {
    keyboardFrame = frame;
  });

  // Once a code is on its way the other ways in have nothing more to offer.
  const codeOnItsWay = $derived(view === "code" && codeStage !== "idle");
  const showOthers = $derived(!frame && !codeOnItsWay);
</script>

<section
  bind:this={root}
  class="sign-in-content layout-{layout}"
  class:frame
  aria-labelledby={titleId}
  aria-describedby={descriptionId}
  onfocusin={handleFocusIn}
  onfocusout={handleFocusOut}
>
  <div class="lead">
    {#if !frame}
      <div class="copy" transition:growFade>
        <h2 id={titleId} class="title">{t("auth_sign_in_or_create")}</h2>
        <div id={descriptionId} class="sentence">
          <Crossfade key={sentence} animateHeight>{sentence}</Crossfade>
        </div>
      </div>
    {:else}
      <!-- The frame keeps the names for screen readers only. -->
      <h2 id={titleId} class="visually-hidden">
        {t("auth_sign_in_or_create")}
      </h2>
      <p id={descriptionId} class="visually-hidden">{sentence}</p>
    {/if}

    {#if showOthers}
      <div class="google" transition:growFade>
        <SocialAuthCompact {mode} {onFacebookAuth} />
        {#if facebookError}
          <p class="provider-error" role="alert" transition:growFade>
            {facebookError}
          </p>
        {/if}
      </div>
    {/if}
  </div>

  <div class="rest">
    {#if showOthers && view !== "phone"}
      <div class="or" transition:growFade>
        <span>{t("auth_escape_or")}</span>
      </div>
    {/if}

    <div class="sign-in-form">
      <Crossfade key={view} animateHeight>
        {#if view === "code"}
          <EmailLinkAuth
            plain
            bind:email
            sendOnOpen={sendCodeOnOpen}
            onStageChange={(stage) => (codeStage = stage)}
          />
        {:else if view === "password"}
          <EmailPasswordAuth
            bind:mode
            bind:email
            showModeSwitch={false}
            waysOutInError
            onUseCode={useCodeInstead}
          />
        {:else if phonePanel && phoneSession}
          {#await phonePanel then mod}
            <mod.default session={phoneSession} part="both" />
          {/await}
        {/if}
      </Crossfade>
    </div>

    {#if showOthers}
      <div class="pills" transition:growFade>
        {#if view !== "code"}
          <button class="pill" type="button" onclick={showCode}>
            {t("auth_send_magic_link")}
          </button>
        {/if}
        {#if view !== "password"}
          <button
            class="pill"
            type="button"
            onclick={() => void show("password")}
          >
            {t("auth_use_password")}
          </button>
        {/if}
        {#if view === "password"}
          <button class="pill" type="button" onclick={togglePasswordMode}>
            <Crossfade key={mode}>
              {mode === "signin"
                ? t("auth_need_account")
                : t("auth_have_account_signin")}
            </Crossfade>
          </button>
        {/if}
        {#if view === "code" && phoneOffered}
          <button
            class="pill"
            type="button"
            onpointerenter={warmPhoneSignIn}
            onpointerdown={warmPhoneSignIn}
            onfocus={warmPhoneSignIn}
            onclick={() => void show("phone", { focus: false })}
          >
            {t("auth_phone_use_your_phone")}
          </button>
        {/if}
      </div>
      {#if view !== "password"}
        <p class="new-here" transition:growFade>{t("auth_same_steps_new")}</p>
      {/if}
    {/if}
  </div>
</section>

<style>
  .sign-in-content {
    --min-touch-target: 44px;
    --gap: clamp(0.5rem, 1.6svh, 1rem);

    display: flex;
    flex-direction: column;
    gap: var(--gap);
    width: 100%;
    min-width: 0;
    color: var(--theme-text, #f8fafc);
  }

  .lead,
  .rest {
    display: flex;
    flex-direction: column;
    gap: var(--gap);
    min-width: 0;
  }

  .copy {
    display: flex;
    flex-direction: column;
    gap: clamp(0.375rem, 1svh, 0.75rem);
  }

  .title {
    margin: 0;
    font-size: clamp(var(--font-size-2xl), 1.2rem + 1.4cqw, var(--font-size-3xl));
    font-weight: 780;
    line-height: 1.12;
    letter-spacing: -0.03em;
    text-wrap: balance;
  }

  .sentence {
    margin: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.72));
    font-size: var(--font-size-sm);
    line-height: 1.45;
    text-wrap: pretty;
  }

  /* An upright window too short for the whole screen, with no keyboard up:
     the sentence is the first part to step out. */
  @media (orientation: portrait) and (max-height: 480px) {
    .layout-screen .sentence {
      display: none;
    }
  }

  .or {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-compact);
  }

  .or::before,
  .or::after {
    content: "";
    flex: 1;
    height: 1px;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.12));
  }

  .sign-in-form {
    min-width: 0;
  }

  /* The forms bring their own cards for the box; on the screen and in the
     box alike the field sits straight on the surface, as pictured. */
  .sign-in-form :global(.email-link-form) {
    gap: clamp(0.5rem, 1.4svh, 0.875rem);
  }

  .sign-in-form :global(.form-group label),
  .sign-in-form :global(.label) {
    font-size: var(--font-size-sm);
  }

  .sign-in-form :global(button[type="submit"]) {
    min-height: var(--min-touch-target);
  }

  .pills {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 8.5rem), 1fr));
    gap: 0.5rem;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: var(--min-touch-target);
    padding: 0.5rem 1rem;
    color: var(--theme-text, #f8fafc);
    font-size: var(--font-size-min);
    font-weight: 650;
    text-align: center;
    background: transparent;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.18));
    border-radius: 999px;
    cursor: pointer;
    transition:
      background var(--duration-fast) var(--ease-standard),
      border-color var(--duration-fast) var(--ease-standard);
  }

  .pill:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
  }

  .pill:focus-visible {
    outline: 3px solid
      color-mix(in srgb, var(--theme-accent, #4155d8) 72%, white);
    outline-offset: 2px;
  }

  .pill :global(.crossfade > .layer) {
    display: flex;
    justify-content: center;
  }

  .new-here {
    margin: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    font-size: var(--font-size-compact);
    line-height: 1.4;
    text-align: center;
  }

  .provider-error {
    margin: 0.5rem 0 0;
    color: var(--semantic-error, #ef4444);
    font-size: var(--font-size-min);
    text-align: center;
  }

  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  /* Short phones: the gaps give way before anything is cut. */
  @media (max-height: 640px) {
    .layout-screen {
      --gap: clamp(0.375rem, 1.2svh, 0.75rem);
    }

    .layout-screen .title {
      font-size: var(--font-size-2xl);
    }
  }

  /* A phone on its side: title, sentence and Google on the left; the email,
     its main action and the pills on the right. */
  @media (orientation: landscape) and (max-height: 600px) {
    .layout-screen:not(.frame) {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      align-items: center;
      column-gap: clamp(1.5rem, 5vw, 3rem);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pill {
      transition: none;
    }
  }
</style>
