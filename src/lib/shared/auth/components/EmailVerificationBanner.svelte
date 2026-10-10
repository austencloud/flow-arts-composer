<!--
  EmailVerificationBanner Component

  Displays a non-intrusive banner prompting users to verify their email.
  Only shows for email/password users who haven't verified their email.
-->
<script lang="ts">
  import { authState } from "../state/auth-state.svelte";
  import { sendEmailVerification } from "firebase/auth";
  import { auth } from "../firebase";
  import { slide } from "svelte/transition";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";

  let sending = $state(false);
  let sent = $state(false);
  let error = $state<string | null>(null);
  let dismissed = $state(false);

  // Check if we should show the banner
  // Only show for email/password users with unverified email
  const shouldShow = $derived(() => {
    if (dismissed || !authState.user) return false;

    // Check if user has email/password provider
    const hasEmailProvider = authState.user.providerData.some(
      (provider) => provider.providerId === "password"
    );

    // Only show banner for email/password users who haven't verified
    return hasEmailProvider && !authState.user.emailVerified;
  });

  async function resendVerification() {
    if (!authState.user || sending) return;

    sending = true;
    error = null;

    try {
      await sendEmailVerification(authState.user);
      sent = true;
    } catch (err: any) {
      if (err.code === "auth/too-many-requests") {
        error = t("auth_verify_wait_before_resend");
      } else {
        error = t("auth_verify_send_failed");
      }
    } finally {
      sending = false;
    }
  }

  async function checkVerification() {
    if (!auth.currentUser) return;

    try {
      await auth.currentUser.reload();
      if (auth.currentUser.emailVerified) {
        // Refresh the page to update auth state
        window.location.reload();
      } else {
        error = t("auth_verify_not_yet");
      }
    } catch {
      error = t("auth_verify_check_failed");
    }
  }

  function dismiss() {
    dismissed = true;
  }
</script>

{#if shouldShow()}
  <div class="verification-banner" transition:slide={{ duration: 300 }}>
    <div class="banner-content">
      <i class="fas fa-envelope-open-text banner-icon" aria-hidden="true"></i>

      <div class="banner-text">
        {#if sent}
          <strong>{t("auth_verify_sent")}</strong>
          <span>{t("auth_verify_click_link")}</span>
        {:else if error}
          <strong>{t("auth_verify_email")}</strong>
          <span class="error-text" role="alert">{error}</span>
        {:else}
          <strong>{t("auth_verify_please")}</strong>
          <span>{t("auth_verify_inbox_secure")}</span>
        {/if}
      </div>

      <div class="banner-actions">
        {#if sent}
          <button class="action-button" onclick={checkVerification}>
            {t("auth_verify_done")}
          </button>
        {:else}
          <button
            class="action-button"
            onclick={resendVerification}
            disabled={sending}
          >
            {sending ? t("auth_sending") : t("auth_verify_resend")}
          </button>
        {/if}
        <button
          class="dismiss-button"
          onclick={dismiss}
          aria-label={t("auth_verify_dismiss")}
        >
          <i class="fas fa-times" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .verification-banner {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: var(--z-modal);
    background: linear-gradient(
      135deg,
      var(--semantic-warning, var(--semantic-warning)) 0%,
      #d97706 100%
    );
    color: var(--theme-text, white);
    padding: 12px 16px;
  }

  .banner-content {
    display: flex;
    align-items: center;
    gap: 12px;
    max-width: 1200px;
    margin: 0 auto;
  }

  .banner-icon {
    font-size: var(--font-size-xl);
    flex-shrink: 0;
  }

  .banner-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: var(--font-size-sm);
  }

  .banner-text strong {
    font-weight: 600;
  }

  .banner-text span {
    opacity: 0.9;
    font-size: var(--font-size-compact);
  }

  .error-text {
    color: #fef3c7 !important;
  }

  .banner-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .action-button {
    background: color-mix(in srgb, var(--theme-text, white) 20%, transparent);
    border: 1px solid
      color-mix(in srgb, var(--theme-text, white) 30%, transparent);
    color: var(--theme-text, white);
    padding: 8px 16px;
    border-radius: 6px;
    font-size: var(--font-size-compact);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    white-space: nowrap;
  }

  .action-button:hover:not(:disabled) {
    background: color-mix(in srgb, var(--theme-text, white) 30%, transparent);
  }

  .action-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .dismiss-button {
    background: transparent;
    border: none;
    color: var(--theme-text, white);
    padding: 8px;
    border-radius: 4px;
    cursor: pointer;
    opacity: 0.7;
    transition: opacity var(--duration-normal) ease;
  }

  .dismiss-button:hover {
    opacity: 1;
  }

  /* Mobile adjustments */
  @media (max-width: 600px) {
    .banner-content {
      flex-wrap: wrap;
    }

    .banner-text {
      flex-basis: calc(100% - 44px);
    }

    .banner-actions {
      flex-basis: 100%;
      margin-top: 8px;
    }

    .action-button {
      flex: 1;
    }
  }
</style>
