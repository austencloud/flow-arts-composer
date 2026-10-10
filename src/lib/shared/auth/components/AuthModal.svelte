<!--
  Account creation and sign-in modal.

  BaseModal owns the dialog behavior. Its external-overlay mode keeps password
  manager suggestions interactive without changing this approved visual
  surface. ContextualAuthPrompt changes its copy to match the action that
  opened it. The existing provider components still own every authentication
  flow.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import { page } from "$app/state";
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
  import type { GuestEncorePrompt } from "../domain/auth-nudge-trigger";

  interface Props {
    open: boolean;
    inline?: boolean;
    initialMode?: AuthMode;
    reason?: AuthNudgeTrigger | null;
    attempt?: number;
    encore?: GuestEncorePrompt;
    onAcceptEncore?: () => void;
    onClose: () => void;
  }

  let {
    open,
    inline = false,
    initialMode = "signup",
    reason = null,
    attempt = 1,
    encore = null,
    onAcceptEncore,
    onClose,
  }: Props = $props();

  let authMode = $state<AuthMode>("signup");
  let facebookError = $state<string | null>(null);
  let prompt = $state<{ focusFirstField: () => void }>();

  const promptContent = $derived(
    getAuthPromptContent(reason, authMode, attempt, encore)
  );
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

  // Someone who pressed "Sign in" gets the cursor in the email form when it is
  // already open. A prompt raised by an action does not grab the keyboard.
  function handleOpened() {
    if (!reason) prompt?.focusFirstField();
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

  $effect(() => {
    if (!inline || !open) return;
    // The drawer already owns focus containment; only move into a form that
    // was opened automatically for a returning email user.
    queueMicrotask(() => prompt?.focusFirstField());
  });
</script>

{#snippet authPrompt()}
  <ContextualAuthPrompt
    bind:this={prompt}
    content={promptContent}
    encoreOffer={encore === "offer"}
    {onAcceptEncore}
    bind:mode={authMode}
    active={open}
    idPrefix={inline ? "navigation-auth" : "auth-modal"}
    showClose={!inline}
    embedded={inline}
    {inAppBrowser}
    {facebookError}
    onClose={handleCloseButtonClick}
    onFacebookAuth={handleFacebookAuth}
  />
{/snippet}

{#if inline}
  {@render authPrompt()}
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
    {@render authPrompt()}
  </BaseModal>
{/if}
