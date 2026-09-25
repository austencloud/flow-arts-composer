<!--
  EmailLinkConfirmModal.svelte

  The confirm step for magic-link (email-link) sign-in. Mounted globally in
  AppShellLoader.svelte so it catches a pending link on any app route.

  Firebase's email-link oobCode is single-use. Completing it automatically on
  page load meant a corporate email link-prescanner (which fetches every link
  in an inbound message to check for malware) could consume the code before
  the human ever clicked, silently breaking sign-in. This modal requires an
  explicit "Finish signing in" click before the code-consuming API
  (completeEmailLinkSignIn) is called at all.

  The link carries short-lived opaque state, so another device can finish the
  same flow without asking for the email address again.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import BaseModal from "$lib/shared/foundation/ui/modal/BaseModal.svelte";
  import {
    isEmailLinkPending,
    getPendingEmailLinkRecipient,
    completeEmailLinkSignIn,
  } from "../services/email-link-completion";
  import { toast } from "$lib/shared/toast/state/toast-state.svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte";

  let pending = $state(false);
  let recipientEmail = $state<string | null>(null);
  let resolvingRecipient = $state(false);
  let loading = $state(false);
  let error = $state<string | null>(null);

  onMount(() => {
    if (isEmailLinkPending()) {
      pending = true;
      resolvingRecipient = true;
      void getPendingEmailLinkRecipient()
        .then((email) => {
          recipientEmail = email;
          if (!email) error = t("auth_link_request_new");
        })
        .catch((err: unknown) => {
          const code = (err as { code?: string })?.code;
          // auth/invalid-action-code reaches here only when the link is
          // cross-device AND this device has no saved address — resolution
          // failures alone now fall back to localStorage rather than throwing.
          error =
            code === "functions/failed-precondition" ||
            code === "auth/invalid-action-code"
              ? t("auth_link_invalid_expired")
              : t("auth_link_check_failed");
        })
        .finally(() => {
          resolvingRecipient = false;
        });
    }
  });

  const canSubmit = $derived(!loading && !resolvingRecipient);

  async function handleConfirm() {
    if (!canSubmit) return;
    loading = true;
    error = null;
    try {
      const result = await completeEmailLinkSignIn();
      if (result.completed) {
        pending = false;
        toast.success(t("auth_link_signed_in"));
      } else if (result.errorCode === "auth/missing-email") {
        error = t("auth_link_request_new");
      } else if (
        result.errorCode === "auth/invalid-action-code" ||
        result.errorCode === "auth/expired-action-code"
      ) {
        error = t("auth_link_invalid_expired");
        toast.error(t("auth_link_invalid_expired"));
      } else if (result.errorCode === "auth/invalid-email") {
        error = t("auth_link_email_mismatch");
      } else if (
        result.errorCode === "auth/credential-already-in-use" ||
        result.errorCode === "auth/email-already-in-use" ||
        result.errorCode === "auth/provider-already-linked"
      ) {
        error = t("auth_link_other_account");
      } else {
        error = result.errorMessage || t("auth_link_signin_failed");
        toast.error(t("auth_link_signin_failed"));
      }
    } catch (err) {
      console.error("❌ [EmailLinkConfirmModal] Unexpected error:", err);
      error = t("auth_link_unexpected_error");
    } finally {
      loading = false;
    }
  }

  function handleClose() {
    pending = false;
  }
</script>

<BaseModal
  open={pending}
  size="fit"
  position="center"
  animation="pop"
  class="email-link-confirm-modal"
  closeOnBackdrop
  closeOnEscape
  onclose={handleClose}
>
  <div class="email-link-confirm-content">
    <h2>{t("auth_link_finish_signin")}</h2>

    {#if resolvingRecipient}
      <p class="email-link-confirm-copy" role="status" aria-live="polite">
        {t("auth_link_checking")}
      </p>
    {:else if recipientEmail}
      <p class="email-link-confirm-copy" role="status" aria-live="polite">
        {t("auth_link_continue_as", { email: recipientEmail })}
      </p>
    {:else}
      <p class="email-link-confirm-copy" role="status" aria-live="polite">
        {t("auth_link_continue_account")}
      </p>
    {/if}

    {#if error}
      <p class="email-link-confirm-error" role="alert">{error}</p>
    {/if}

    <button
      type="button"
      class="email-link-confirm-button"
      onclick={handleConfirm}
      disabled={!canSubmit}
    >
      {loading ? t("auth_link_signing_in") : t("auth_link_finish_signin")}
    </button>
  </div>
</BaseModal>

<style>
  :global(dialog.email-link-confirm-modal) {
    width: min(380px, 92vw);
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-lg, 16px);
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
  }

  .email-link-confirm-content {
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    padding: 1.5rem 1.375rem;
  }

  .email-link-confirm-content h2 {
    margin: 0;
    font-size: var(--font-size-lg, 20px);
    font-weight: 700;
    color: var(--theme-text, #fff);
    text-align: center;
  }

  .email-link-confirm-copy {
    margin: 0;
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
    text-align: center;
    line-height: 1.5;
  }

  .email-link-confirm-copy strong {
    color: var(--theme-text, #fff);
  }

  .email-link-confirm-error {
    margin: 0;
    padding: 0.625rem 0.75rem;
    font-size: var(--font-size-compact, 12px);
    color: #fca5a5;
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 15%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--semantic-error, #ef4444) 30%, transparent);
    border-radius: var(--radius-sm, 6px);
    text-align: center;
  }

  .email-link-confirm-button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    padding: 0.625rem 1rem;
    background: linear-gradient(
      135deg,
      var(--theme-accent, #6366f1) 0%,
      var(--theme-accent-strong, #4f46e5) 100%
    );
    color: #fff;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent-strong, #4f46e5) 70%, transparent);
    border-radius: var(--radius-md, 10px);
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
    transition:
      opacity var(--duration-fast, 150ms) ease,
      transform var(--duration-fast, 150ms) ease;
  }

  .email-link-confirm-button:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  .email-link-confirm-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @media (prefers-reduced-motion: reduce) {
    .email-link-confirm-button {
      transition: none;
    }
    .email-link-confirm-button:hover:not(:disabled) {
      transform: none;
    }
  }
</style>
