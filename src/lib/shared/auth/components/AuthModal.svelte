<!--
  The one sign-in surface. Every door in the app opens this.

  On phone tiers (the same signal that gives the app its bottom bar or, on a
  phone on its side, its side rail) it is a screen of its own: a back arrow,
  no swipe, nothing outside to tap. The arrow, the phone's Back and Escape
  close it and leave the page behind exactly as it was; it is an overlay, not
  a route, and its one history entry leaves with it. Wider windows keep the
  centred box. Both hold SignInContent.

  BaseModal owns the dialog behavior (focus in and back to the opener, the
  focus trap, Escape and the system Back). Its external-overlay mode keeps
  password manager suggestions interactive. The provider components still own
  every authentication flow.
-->
<script lang="ts">
  import { onDestroy, onMount, untrack } from "svelte";
  import { page } from "$app/state";
  import { mutateCurrentUrl } from "#lib/shared/navigation/services/url-state.js";
  import { getDeviceDetector } from "#lib/shared/device/get-device-detector.js";
  import { captureWhenReady } from "#lib/shared/analytics/services/posthog.js";
  import {
    trackAuthModalAbandoned,
    trackAuthProviderResult,
  } from "#lib/shared/analytics/auth-events.js";
  import type {
    AuthMode,
    AuthNudgeTrigger,
  } from "#lib/shared/auth/domain/auth-nudge-trigger.js";
  import { getAuthPromptContent } from "#lib/shared/auth/domain/auth-nudge-trigger.js";
  import { getInAppBrowserDetector } from "#lib/shared/auth/get-in-app-browser-detector.js";
  import {
    clearAuthSubmissionBridge,
    recordAuthSubmission,
  } from "#lib/shared/auth/services/auth-analytics-bridge.js";
  import { signInWithFacebook } from "#lib/shared/auth/services/authenticator.js";
  import { getLastAuthMethod } from "#lib/shared/auth/services/last-auth-method.svelte.js";
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { authDrawerState } from "../state/auth-drawer-state.svelte";
  import ContextualAuthPrompt from "./ContextualAuthPrompt.svelte";
  import SignInScreen from "./SignInScreen.svelte";
  import type { SignInView } from "./SignInContent.svelte";

  interface Props {
    open: boolean;
    initialMode?: AuthMode;
    reason?: AuthNudgeTrigger | null;
    /** The internal auth lab opens a given view; every door opens on the code. */
    initialView?: SignInView;
    /** The internal auth lab shows the keyboard-open frame without a keyboard. */
    forceKeyboardFrame?: boolean;
    onClose: () => void;
  }

  let {
    open,
    initialMode = "signup",
    reason = null,
    initialView = "code",
    forceKeyboardFrame = false,
    onClose,
  }: Props = $props();

  let authMode = $state<AuthMode>("signup");
  let facebookError = $state<string | null>(null);
  let prompt = $state<{ focusFirstField: () => void }>();

  // A gate's copy replaces the standing sentence; a plain Sign in has none.
  const promptContent = $derived(
    reason ? getAuthPromptContent(reason, authMode) : null
  );

  // Phone tier: the signal that picks the bottom bar (or a phone on its side's
  // rail) over the desktop layout. Read once and on every capability change.
  let phoneTier = $state(false);
  onMount(() => {
    try {
      const detector = getDeviceDetector();
      const read = () => {
        const settings = detector.getResponsiveSettings();
        phoneTier = settings.isMobile || settings.isLandscapeMobile;
      };
      read();
      return detector.onCapabilitiesChanged(read);
    } catch {
      phoneTier = false;
      return undefined;
    }
  });

  // The screen's one history entry. Opening adds it, so the phone's Back (or
  // the browser's) lands on the page behind; closing any other way takes it
  // back off, so no stray entry is left.
  let entryWritten = false;
  let entrySeen = false;
  const entryShowing = $derived(page.state.signInScreen === true);

  $effect(() => {
    if (!open || !phoneTier || entryWritten) return;
    entryWritten = true;
    entrySeen = false;
    mutateCurrentUrl(() => {}, {
      mode: "push",
      state: { signInScreen: true },
    });
  });

  $effect(() => {
    const showing = entryShowing;
    untrack(() => {
      if (!entryWritten) return;
      if (showing) {
        entrySeen = true;
        // Closed before its entry landed: take it off now.
        if (!open) removeEntry();
        return;
      }
      if (entrySeen && open) {
        // Back took the entry off: close to match.
        entryWritten = false;
        entrySeen = false;
        trackAuthModalAbandoned("backdrop_or_escape");
        clearAuthSubmissionBridge();
        onClose();
      }
    });
  });

  $effect(() => {
    if (open) return;
    untrack(() => {
      if (entryWritten && entrySeen && entryShowing) removeEntry();
    });
  });

  function removeEntry() {
    entryWritten = false;
    entrySeen = false;
    history.back();
  }

  // Signing in unmounts the surface; its entry goes with it.
  onDestroy(() => {
    if (entryWritten && entrySeen && page.state.signInScreen === true) {
      entryWritten = false;
      history.back();
    }
  });
  const inAppBrowser = $derived(
    getInAppBrowserDetector().isInAppBrowserOrForced(page.url.searchParams)
  );

  // Reopening the dialog starts from the mode requested by the action that
  // launched it, unless this device has signed in before: then the person
  // already has an account, and a sign-up form is one more thing to click past.
  // Provider errors belong only to that encounter.
  $effect(() => {
    if (!open) return;
    authDrawerState.dismissGuestSaveNudge();
    authMode = untrack(getLastAuthMethod) ? "signin" : initialMode;
    facebookError = null;
  });

  // In webviews, email is promoted because provider popups cannot complete.
  // Keep the measurement fire-once without making it reactive state.
  let promotedFired = false;
  $effect(() => {
    if (!open) {
      promotedFired = false;
      return;
    }
    if (!inAppBrowser || promotedFired) return;
    promotedFired = true;
    captureWhenReady("inapp_auth_magic_link_promoted", {
      route: page.url.pathname,
    });
  });

  async function handleFacebookAuth() {
    facebookError = null;
    recordAuthSubmission("facebook", authMode);
    try {
      await signInWithFacebook();
      trackAuthProviderResult("facebook", "completed");
    } catch (error: unknown) {
      console.error("[AuthModal] Facebook auth failed", error);
      const errorCode = (error as { code?: string })?.code;
      const interrupted =
        errorCode === "auth/popup-closed-by-user" ||
        errorCode === "auth/cancelled-popup-request";
      trackAuthProviderResult(
        "facebook",
        interrupted ? "interrupted" : "failed",
        errorCode ?? "unknown"
      );

      if (errorCode === "auth/popup-blocked") {
        facebookError = t("auth_facebook_popup_blocked");
      } else if (interrupted) {
        facebookError = null;
      } else if (
        errorCode === "auth/account-exists-with-different-credential"
      ) {
        facebookError = t("auth_facebook_existing_account");
      } else {
        facebookError = t("auth_facebook_signin_failed");
      }
    }
  }

  // In the box, someone who pressed "Sign in" and last signed in by email
  // here gets the cursor in the email field. A prompt raised by an action does
  // not grab the keyboard, and on a phone focus stays on the screen itself:
  // a keyboard rising unasked would cover the choices.
  function handleOpened() {
    if (phoneTier || reason) return;
    const last = untrack(getLastAuthMethod);
    if (last === "magic-link" || last === "password") prompt?.focusFirstField();
  }

  function handleCloseButtonClick() {
    trackAuthModalAbandoned("close_button");
    clearAuthSubmissionBridge();
    onClose();
  }

  function handleModalDismiss() {
    trackAuthModalAbandoned("backdrop_or_escape");
    clearAuthSubmissionBridge();
    onClose();
  }
</script>

{#if phoneTier}
  <BaseModal
    {open}
    size="full"
    position="center"
    animation="slide"
    class="chromeless sign-in-screen-shell"
    labelledBy="auth-screen-title"
    describedBy="auth-screen-description"
    closeOnBackdrop={false}
    closeOnEscape
    allowExternalOverlays
    onclose={handleModalDismiss}
    onopened={handleOpened}
  >
    <SignInScreen
      bind:this={prompt}
      bind:mode={authMode}
      content={promptContent}
      active={open}
      idPrefix="auth-screen"
      {initialView}
      {forceKeyboardFrame}
      {facebookError}
      onBack={handleCloseButtonClick}
      onFacebookAuth={handleFacebookAuth}
    />
  </BaseModal>
{:else}
  <BaseModal
    {open}
    size="fit"
    position="center"
    animation="pop"
    class="chromeless contextual-auth-shell"
    labelledBy="auth-modal-title"
    describedBy="auth-modal-description"
    closeOnBackdrop
    closeOnEscape
    allowExternalOverlays
    onclose={handleModalDismiss}
    onopened={handleOpened}
  >
    <ContextualAuthPrompt
      bind:this={prompt}
      content={promptContent}
      bind:mode={authMode}
      active={open}
      idPrefix="auth-modal"
      showClose
      {initialView}
      artifact={authDrawerState.artifact}
      {facebookError}
      onClose={handleCloseButtonClick}
      onFacebookAuth={handleFacebookAuth}
    />
  </BaseModal>
{/if}
