<!--
  AuthSheet.svelte - Authentication Bottom Sheet

  Modern panel-based authentication (no routing!)
  Supports: Facebook, Google, Email/Password
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import { signInWithFacebook } from "#lib/shared/auth/services/authenticator.js";
  import {
    trackAuthModalAbandoned,
    trackAuthProviderResult,
    trackAuthSurfaceOpened,
  } from "#lib/shared/analytics/auth-events.js";
  import {
    clearAuthSubmissionBridge,
    recordAuthSubmission,
  } from "#lib/shared/auth/services/auth-analytics-bridge.js";
  import Drawer from "../../foundation/ui/Drawer.svelte";
  import type { HapticFeedback } from "../../application/services/haptic-feedback";
  import { onMount } from "svelte";
  import AuthFooter from "../../auth/components/AuthFooter.svelte";
  import AuthHeader from "../../auth/components/AuthHeader.svelte";
  import EmailAuthTabs from "../../auth/components/EmailAuthTabs.svelte";
  import SocialAuthCompact from "../../auth/components/SocialAuthCompact.svelte";
  import { authState } from "../../auth/state/auth-state.svelte";

  // Props
  let { isOpen = false, onClose } = $props<{
    isOpen?: boolean;
    onClose: () => void;
  }>();

  // Services
  let hapticService: HapticFeedback | null = null;

  // Track auth mode to update UI accordingly
  let authMode = $state<"signin" | "signup">("signin");

  // Facebook sign-in failure surfaced inline, mirroring the Google error
  // handling inside SocialAuthCompact.
  let facebookError = $state<string | null>(null);
  let encounterOpen = false;

  $effect(() => {
    if (isOpen && !encounterOpen) {
      encounterOpen = true;
      trackAuthSurfaceOpened({
        surface: "auth_sheet",
        origin: "sheet_query_or_navigation",
        auth_mode: authMode,
      });
    } else if (!isOpen) {
      encounterOpen = false;
    }
  });

  onMount(async () => {
    try {
      hapticService = getHapticFeedback();
    } catch (error) {
      console.error("❌ [AuthSheet] Failed to resolve services:", error);
    }
  });

  // Auto-close when user becomes authenticated
  $effect(() => {
    if (!authState.isAuthenticated || !isOpen) return;
    const closeTimer = setTimeout(() => {
      clearAuthSubmissionBridge();
      onClose();
    }, 300);
    return () => clearTimeout(closeTimer);
  });

  function handleClose() {
    hapticService?.trigger("selection");
    trackAuthModalAbandoned("close_button");
    clearAuthSubmissionBridge();
    onClose();
  }

  function handleDismiss() {
    trackAuthModalAbandoned("backdrop_or_escape");
    clearAuthSubmissionBridge();
    onClose();
  }

  async function handleFacebookAuth() {
    hapticService?.trigger("selection");
    facebookError = null;
    recordAuthSubmission("facebook", authMode);
    try {
      await signInWithFacebook();
      trackAuthProviderResult("facebook", "completed");
    } catch (error: unknown) {
      console.error("❌ Facebook auth failed:", error);
      hapticService?.trigger("error");

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
        facebookError = "Popup was blocked. Please allow popups for this site.";
      } else if (errorCode === "auth/popup-closed-by-user") {
        facebookError = "Sign-in cancelled. Please try again.";
      } else if (errorCode === "auth/cancelled-popup-request") {
        facebookError = null; // Silent - user just clicked away
      } else if (
        errorCode === "auth/account-exists-with-different-credential"
      ) {
        // Pending Facebook credential is stashed (authenticator.ts). Guide the
        // user to their existing method; auth-state auto-links Facebook on the
        // next successful sign-in.
        facebookError =
          "This email is already registered. Sign in with your original method (Google or email) and we'll connect Facebook automatically.";
      } else {
        facebookError =
          error instanceof Error ? error.message : t("nav_facebook_failed");
      }
    }
  }
</script>

<Drawer
  {isOpen}
  labelledBy="auth-sheet-title"
  onclose={handleDismiss}
  class="auth-sheet"
  backdropClass="auth-sheet__backdrop"
>
  <div class="auth-sheet__container">
    <!-- Header -->
    <AuthHeader mode={authMode} onClose={handleClose} />

    <!-- Content -->
    <div class="auth-sheet__content themed-scrollbar">
      <!-- Social Auth Buttons - Compact side-by-side layout -->
      <SocialAuthCompact mode={authMode} onFacebookAuth={handleFacebookAuth} />

      {#if facebookError}
        <p class="auth-sheet__error" role="alert">{facebookError}</p>
      {/if}

      <!-- Divider -->
      <div class="auth-sheet__divider">
        <span
          >{authMode === "signin"
            ? t("nav_email_signin")
            : t("nav_email_signup")}</span
        >
      </div>

      <!-- Email Auth (code or password) -->
      <div class="auth-sheet__email">
        <EmailAuthTabs bind:mode={authMode} />
      </div>
    </div>

    <!-- Footer -->
    <AuthFooter />
  </div>
</Drawer>

<style>
  .auth-sheet__container {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-height: min(
      90dvh,
      700px
    ); /* Use dvh for better mobile keyboard support */
    height: auto;
    background: linear-gradient(
      135deg,
      rgba(20, 25, 35, 0.98) 0%,
      rgba(15, 20, 30, 0.95) 100%
    );
    overflow: hidden;
  }

  .auth-sheet__content {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
    min-height: 0; /* Important for flex scrolling */

    /* Smooth scrolling */
    scroll-behavior: smooth;
    -webkit-overflow-scrolling: touch;
  }

  .auth-sheet__divider {
    display: flex;
    align-items: center;
    text-align: center;
    margin: 8px 0;
  }

  .auth-sheet__divider::before,
  .auth-sheet__divider::after {
    content: "";
    flex: 1;
    border-bottom: 1px solid
      var(--theme-stroke-strong, var(--theme-stroke-strong));
  }

  .auth-sheet__divider span {
    padding: 0 16px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: var(--font-size-sm);
    font-weight: 500;
  }

  .auth-sheet__email {
    width: 100%;
  }

  .auth-sheet__error {
    margin: 8px 0 0;
    font-size: var(--font-size-compact);
    color: var(--semantic-error, #ef4444);
    text-align: center;
  }

  @media (max-width: 480px) {
    .auth-sheet__container {
      max-height: 95dvh; /* More space on mobile */
    }

    .auth-sheet__content {
      padding: 16px;
      gap: 16px;
    }
  }

  /* iPhone SE 2/3 and similar (667px height) - use full viewport height */
  @media (max-height: 700px) {
    .auth-sheet__container {
      max-height: 100dvh; /* Full height on small devices - no scrolling */
    }

    .auth-sheet__content {
      padding: 10px 16px;
      gap: 12px;
    }

    .auth-sheet__divider {
      margin: 6px 0;
    }
  }

  /* Small screens - additional layout adjustments */
  @media (max-height: 600px) {
    .auth-sheet__container {
      max-height: 98dvh;
    }

    .auth-sheet__content {
      padding: 10px 14px;
      gap: 10px;
    }

    .auth-sheet__divider {
      margin: 4px 0;
    }
  }

  /* iPhone SE 1st gen and very small devices (568px height) */
  @media (max-height: 568px) {
    .auth-sheet__container {
      max-height: 100dvh;
    }

    .auth-sheet__content {
      padding: 8px 12px;
      gap: 8px;
    }

    .auth-sheet__divider {
      margin: 2px 0;
    }

    .auth-sheet__divider span {
      font-size: var(--font-size-compact);
      padding: 0 12px;
    }
  }

  @media (prefers-contrast: high) {
    .auth-sheet__container {
      background: rgba(0, 0, 0, 0.98);
      border: 2px solid white;
    }

    .auth-sheet__divider::before,
    .auth-sheet__divider::after {
      border-color: white;
    }
  }
</style>
