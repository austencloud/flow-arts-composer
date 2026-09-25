<script lang="ts">
  /**
   * Passwordless Email Link Authentication
   *
   * Sends a branded magic link via Cloud Function + Brevo. Completion (the
   * step that consumes the single-use oobCode) is NOT handled here anymore —
   * it lives entirely in EmailLinkConfirmModal.svelte (mounted globally in
   * AppShellLoader.svelte), which requires an explicit "Finish signing in"
   * click before calling the code-consuming Firebase API. This form used to
   * also auto-complete on mount as a fallback; that was a second unattended
   * consumption path with the same link-prescanner risk the confirm modal
   * exists to close, so it was removed rather than kept as a fallback.
   */

  import { httpsCallable } from "firebase/functions";
  import { signInWithCustomToken } from "firebase/auth";
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import {
    auth,
    configureAuthPersistence,
    getFunctionsInstance,
  } from "../firebase";
  import { t } from "$lib/shared/i18n/i18n.svelte";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";
  import { toast } from "$lib/shared/toast/state/toast-state.svelte";
  import { recordAuthSubmission } from "$lib/shared/auth/services/auth-analytics-bridge";
  import { recordLastAuthMethod } from "$lib/shared/auth/services/last-auth-method.svelte";
  import { trackAuthProviderResult } from "$lib/shared/analytics/auth-events";
  import { getInAppBrowserDetector } from "$lib/shared/auth/get-in-app-browser-detector";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import { db } from "$lib/shared/persistence/database/tka-database";
  import { captureWhenReady } from "$lib/shared/analytics/services/posthog";
  import { firstRunState } from "$lib/shared/onboarding/state/first-run-state.svelte";
  import { isRunningAsStandalone } from "$lib/shared/mobile/services/platform-detector";

  let { compact = false }: { compact?: boolean } = $props();

  let email = $state("");
  let loading = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);
  let submittedEmail = $state("");
  let acceptedRequestId = $state("");
  let signInCode = $state("");
  let codeLoading = $state(false);
  let codeError = $state<string | null>(null);
  let codeCompleted = $state(false);
  let installedApp = $state(false);
  let emailInput: HTMLInputElement;

  const PENDING_REQUEST_KEY = "pendingMagicLinkCode";
  const PENDING_REQUEST_LIFETIME_MS = 30 * 60 * 1000;
  const REQUEST_ID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function clearPendingRequest() {
    window.localStorage.removeItem(PENDING_REQUEST_KEY);
  }

  function persistPendingRequest(requestId: string, recipient: string) {
    window.localStorage.setItem(
      PENDING_REQUEST_KEY,
      JSON.stringify({
        requestId,
        email: recipient,
        expiresAt: Date.now() + PENDING_REQUEST_LIFETIME_MS,
      })
    );
  }

  onMount(() => {
    installedApp = isRunningAsStandalone();
    const raw = window.localStorage.getItem(PENDING_REQUEST_KEY);
    if (!raw) return;

    try {
      const pending = JSON.parse(raw) as {
        requestId?: unknown;
        email?: unknown;
        expiresAt?: unknown;
      };
      if (
        typeof pending.requestId !== "string" ||
        !REQUEST_ID_PATTERN.test(pending.requestId) ||
        typeof pending.email !== "string" ||
        !pending.email ||
        typeof pending.expiresAt !== "number" ||
        pending.expiresAt <= Date.now()
      ) {
        clearPendingRequest();
        return;
      }

      acceptedRequestId = pending.requestId;
      email = pending.email;
      submittedEmail = pending.email;
      success = t("auth_email_sent_to", { email: pending.email });
    } catch {
      clearPendingRequest();
    }
  });

  // Inside an in-app webview this form is not just one option among several —
  // it is the only sign-in method that completes there, because it needs no
  // popup, no redirect, and no sessionStorage. The hint changes to say where
  // the link will actually land, which is a different browser than this one.
  // ?forceIAB is the test hook the whole in-app-browser path is verified with.
  const detector = getInAppBrowserDetector();
  const inAppBrowser = $derived(
    detector.isInAppBrowserOrForced(page.url.searchParams)
  );

  const staysInThisApp = $derived(installedApp || inAppBrowser);
  const hint = $derived(t("auth_email_code_hint"));

  // The link is usually opened in a different browser than the one that
  // requested it, and localStorage does not cross that boundary — so an
  // anonymous guest who built work here finishes sign-in as a brand-new
  // account with their drafts stranded on the webview's uid. Nobody knows yet
  // how often that actually costs someone work, so measure the exposure
  // before building a uid-carry mechanism for a gap that may be theoretical.
  async function hasPendingGuestDrafts(): Promise<boolean> {
    if (!authState.isAnonymous) return false;
    try {
      return (await db.sequences.count()) > 0;
    } catch {
      return false;
    }
  }

  // Warn a guest with unsaved work BEFORE they send a link they'll open in
  // another browser, where a fresh identity is created and the drafts strand.
  // Detached/non-blocking: IndexedDB stalls in webviews, so this resolves into
  // state rather than gating render.
  let pendingGuestDrafts = $state(false);
  $effect(() => {
    if (!inAppBrowser) {
      pendingGuestDrafts = false;
      return;
    }
    let cancelled = false;
    void hasPendingGuestDrafts().then((pending) => {
      if (!cancelled) pendingGuestDrafts = pending;
    });
    return () => {
      cancelled = true;
    };
  });

  async function sendEmailLink() {
    const recipient = email.trim();
    const requestId = crypto.randomUUID();
    const startedAt = performance.now();
    submittedEmail = recipient;
    email = recipient;
    loading = true;
    error = null;
    success = null;
    codeCompleted = false;
    codeError = null;

    recordAuthSubmission("magic_link");
    captureWhenReady("magic_link_request_started", {
      request_id: requestId,
      auth_host: window.location.hostname,
      route: page.url.pathname,
      in_app_browser: inAppBrowser,
    });

    try {
      // Get Functions instance and call Cloud Function
      const functions = await getFunctionsInstance();
      const sendMagicLink = httpsCallable<
        { email: string; continueUrl: string; requestId: string },
        {
          success: boolean;
          message?: string;
          error?: string;
          requestId?: string;
        }
      >(functions, "sendMagicLink");

      // Land the user inside the app after they click the magic link, not on
      // the marketing landing page at "/".
      const result = await sendMagicLink({
        email: recipient,
        continueUrl: window.location.origin + "/create",
        requestId,
      });

      if (result.data.success) {
        // Save the email locally so we can complete sign-in on the same device
        window.localStorage.setItem("emailForSignIn", recipient);
        acceptedRequestId = result.data.requestId || requestId;
        persistPendingRequest(acceptedRequestId, recipient);
        success = `Email sent to ${recipient}.`;
        captureWhenReady("magic_link_provider_accepted", {
          request_id: acceptedRequestId,
          auth_host: window.location.hostname,
          route: page.url.pathname,
          duration_ms: Math.round(performance.now() - startedAt),
        });
        trackAuthProviderResult("magic_link", "accepted");
        if (inAppBrowser) {
          // Detached on purpose. This awaits an IndexedDB count, and in-app
          // webviews are exactly where IndexedDB stalls — awaiting it here
          // holds `loading` true (the finally runs after it), so the button
          // would sit spinning "Sending..." underneath a banner already saying
          // the mail was sent. Telemetry never gates UI state.
          void hasPendingGuestDrafts().then((pending) =>
            captureWhenReady("inapp_auth_magic_link_requested", {
              guest_drafts_pending: pending,
            })
          );
        }
      } else {
        throw new Error(result.data.error || "Failed to send magic link");
      }
    } catch (err: unknown) {
      const details = err as { code?: string; message?: string };

      // Handle Cloud Function errors
      const errorCode = details.code || "";
      const errorMessage = details.message || "";
      let failureCode = "unknown";

      if (
        errorCode.includes("invalid-argument") ||
        errorMessage.includes("Invalid email")
      ) {
        failureCode = "invalid_email";
        error = t("auth_invalid_email_address");
        toast.error(t("auth_invalid_email_address"));
      } else if (errorCode.includes("failed-precondition")) {
        failureCode = "service_not_configured";
        error = t("auth_email_service_unavailable");
        toast.error(t("auth_email_service_unavailable"));
      } else if (errorCode.includes("unavailable")) {
        failureCode = "provider_unavailable";
        error = t("auth_email_service_no_response");
        toast.error(t("auth_email_service_no_response"));
      } else {
        failureCode = errorCode ? "request_failed" : "network_failed";
        error = t("auth_email_send_failed");
        toast.error(t("auth_email_send_failed"));
      }

      console.error("[email-link] Send failed", { code: failureCode });
      trackAuthProviderResult("magic_link", "failed", failureCode);
      captureWhenReady("magic_link_request_failed", {
        request_id: requestId,
        auth_host: window.location.hostname,
        route: page.url.pathname,
        failure_code: failureCode,
        duration_ms: Math.round(performance.now() - startedAt),
      });
    } finally {
      loading = false;
    }
  }

  function handleSubmit() {
    void sendEmailLink();
  }

  function useDifferentEmail() {
    email = "";
    error = null;
    success = null;
    submittedEmail = "";
    acceptedRequestId = "";
    signInCode = "";
    codeError = null;
    codeCompleted = false;
    clearPendingRequest();
    requestAnimationFrame(() => emailInput.focus());
  }

  function updateSignInCode(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    signInCode = input.value.replace(/\D/g, "").slice(0, 6);
  }

  async function redeemSignInCode() {
    if (codeLoading || signInCode.length !== 6 || !acceptedRequestId) {
      return;
    }

    codeLoading = true;
    codeError = null;
    try {
      const functions = await getFunctionsInstance();
      const redeemCode = httpsCallable<
        { action: "redeem-code"; requestId: string; code: string },
        { success: true; customToken: string }
      >(functions, "sendMagicLink");
      const result = await redeemCode({
        action: "redeem-code",
        requestId: acceptedRequestId,
        code: signInCode,
      });

      await configureAuthPersistence(auth);
      await signInWithCustomToken(auth, result.data.customToken);
      window.localStorage.removeItem("emailForSignIn");
      clearPendingRequest();

      recordLastAuthMethod("magic-link");
      trackAuthProviderResult("magic_link", "completed");

      if (auth.currentUser?.uid) {
        firstRunState.markSkipped(auth.currentUser.uid);
      }

      codeCompleted = true;
      acceptedRequestId = "";
      signInCode = "";
      toast.success(t("auth_signed_in_welcome"));
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? "";
      codeError = code.includes("already-exists")
        ? t("auth_email_other_account")
        : t("auth_code_invalid_expired");
      trackAuthProviderResult("magic_link", "failed", "code_redemption_failed");
    } finally {
      codeLoading = false;
    }
  }
</script>

<form
  onsubmit={(e) => {
    e.preventDefault();
    handleSubmit();
  }}
  class="email-link-form"
  class:compact
>
  {#if error}
    <div
      id="magic-link-status"
      class="delivery-card delivery-card--error"
      role="alert"
    >
      <span class="delivery-icon" aria-hidden="true">
        <i class="fas fa-triangle-exclamation"></i>
      </span>
      <span class="delivery-copy">
        <strong>{t("auth_email_not_sent")}</strong>
        <span>{error}</span>
      </span>
    </div>
  {:else if !compact || loading || success}
    <div
      id="magic-link-status"
      class="delivery-card"
      class:delivery-card--sending={loading}
      class:delivery-card--success={!!success}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span
        class="delivery-icon"
        class:delivery-icon--sending={loading}
        aria-hidden="true"
      >
        {#if loading}
          <i class="fas fa-paper-plane"></i>
        {:else if success}
          <i class="fas fa-check"></i>
        {:else}
          <i class="fas fa-envelope"></i>
        {/if}
      </span>
      <span class="delivery-copy">
        {#if loading}
          <strong>{t("auth_sending_code")}</strong>
          <span>{t("auth_sending_email_to", { email: submittedEmail })}</span>
        {:else if success}
          {#if codeCompleted}
            <strong>{t("auth_signed_in")}</strong>
            <span>{t("auth_close_and_continue")}</span>
          {:else if compact}
            <strong>{t("auth_check_email")}</strong>
            <span
              >{t("auth_enter_code_sent_to", { email: submittedEmail })}</span
            >
          {:else}
            <strong>{t("auth_check_email")}</strong>
            {#if staysInThisApp}
              <span
                >{t("auth_code_sent_return", { email: submittedEmail })}</span
              >
            {:else}
              <span
                >{t("auth_code_sent_button", { email: submittedEmail })}</span
              >
            {/if}
          {/if}
        {:else}
          <strong>{t("auth_sign_in_email_code")}</strong>
          <span>{hint}</span>
        {/if}
      </span>
    </div>
  {/if}

  {#if pendingGuestDrafts && !compact}
    <p class="drift-warning" role="status">
      {t("auth_work_stays_in_app")}
    </p>
  {/if}

  <div class="form-group" class:email-sent={compact && !!success}>
    <label for="email-link">{t("form_email")}</label>
    <input
      id="email-link"
      type="email"
      autocomplete="email"
      bind:this={emailInput}
      bind:value={email}
      placeholder={compact
        ? t("auth_email_address")
        : t("form_placeholder_email")}
      required
      disabled={loading || !!success}
      aria-describedby={!compact || loading || success || error
        ? "magic-link-status"
        : undefined}
    />
  </div>

  {#if success && acceptedRequestId}
    <div class="code-entry">
      <label for="email-sign-in-code">{t("auth_six_digit_code")}</label>
      <div class="code-row">
        <input
          id="email-sign-in-code"
          class="code-input"
          type="text"
          inputmode="numeric"
          enterkeyhint="done"
          autocomplete="one-time-code"
          maxlength="6"
          pattern="[0-9]{6}"
          value={signInCode}
          oninput={updateSignInCode}
          disabled={codeLoading}
          aria-describedby={codeError ? "email-sign-in-code-error" : undefined}
        />
        <button
          type="button"
          class="code-submit"
          onclick={() => void redeemSignInCode()}
          disabled={codeLoading || signInCode.length !== 6}
          aria-busy={codeLoading}
        >
          {codeLoading ? t("auth_logging_in") : t("auth_sign_in")}
        </button>
      </div>
      {#if codeError}
        <p id="email-sign-in-code-error" class="code-error" role="alert">
          {codeError}
        </p>
      {/if}
    </div>
  {/if}

  <div class="form-actions" class:form-actions--split={!!success}>
    <button
      type="submit"
      disabled={loading}
      class="submit-button"
      class:submit-button--secondary={!!success}
      aria-busy={loading}
      aria-describedby={!compact || loading || success || error
        ? "magic-link-status"
        : undefined}
    >
      {#if loading}
        <ProgressRing percent={-1} size={24} strokeWidth={2} />
        {t("auth_sending")}
      {:else}
        {#if !compact}
          <i class="fas fa-envelope" aria-hidden="true"></i>
        {/if}
        {success
          ? t("auth_send_another_code")
          : compact
            ? t("auth_send_code")
            : t("auth_send_magic_link")}
      {/if}
    </button>
    {#if success}
      <button
        type="button"
        class="different-email-button"
        onclick={useDifferentEmail}
      >
        {t("auth_use_different_email")}
      </button>
    {/if}
  </div>
</form>

<style>
  .compact .delivery-card {
    min-block-size: 0;
    padding: 0;
    border: 0;
    background: transparent;
  }

  .compact .delivery-icon,
  .compact .email-sent {
    display: none;
  }

  .compact .code-entry {
    padding: 0;
    border: 0;
    background: transparent;
  }

  .compact .code-submit {
    background: var(--theme-text);
    color: var(--theme-panel-bg);
    border-color: transparent;
  }

  .compact .submit-button--secondary,
  .compact .different-email-button {
    padding: 0.5rem 0.25rem;
    border: 0;
    background: transparent;
    box-shadow: none;
    color: var(--theme-text-dim);
    font-weight: 400;
  }

  .compact .form-group label {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }

  .compact input {
    min-height: 48px;
    border-width: 1px;
    box-shadow: none;
    background: var(--theme-card-bg);
  }

  .compact .submit-button:not(.submit-button--secondary) {
    min-height: 48px;
    background: color-mix(
      in srgb,
      var(--theme-text) 88%,
      var(--theme-panel-bg)
    );
    color: var(--theme-panel-bg);
    font-weight: 600;
    box-shadow: none;
    transform: none;
    transition: background var(--duration-fast, 150ms) ease;
  }

  .compact .submit-button:not(.submit-button--secondary):hover:not(:disabled) {
    background: var(--theme-text);
  }

  .email-link-form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 100%;
  }

  .delivery-card {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.75rem;
    min-block-size: 7.5rem;
    padding: 0.875rem;
    color: var(--theme-text, rgba(255, 255, 255, 0.9));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-md, 0.75rem);
  }

  .delivery-card--sending {
    background: color-mix(
      in srgb,
      var(--theme-accent, #7c6af7) 12%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04))
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #7c6af7) 42%,
      transparent
    );
  }

  .delivery-card--success {
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 13%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04))
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 42%,
      transparent
    );
  }

  .delivery-card--error {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 12%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04))
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 40%,
      transparent
    );
  }

  .delivery-icon {
    display: grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.75rem;
    color: var(--theme-accent, #7c6af7);
    background: color-mix(
      in srgb,
      var(--theme-accent, #7c6af7) 18%,
      transparent
    );
  }

  .delivery-card--success .delivery-icon {
    color: var(--semantic-success, #22c55e);
    background: color-mix(
      in srgb,
      var(--semantic-success, #22c55e) 18%,
      transparent
    );
  }

  .delivery-card--error .delivery-icon {
    color: var(--semantic-error, #ef4444);
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 18%,
      transparent
    );
  }

  .delivery-icon--sending {
    animation: delivery-pulse 1.2s ease-in-out infinite;
  }

  .delivery-copy {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  .delivery-copy strong {
    color: var(--theme-text, white);
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 700;
  }

  .drift-warning {
    margin: 0;
    padding: 0.5rem 0.75rem;
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.4;
    text-align: center;
    color: var(--theme-text, rgba(255, 255, 255, 0.9));
    background: var(--semantic-warning-bg, rgba(234, 179, 8, 0.12));
    border: 1px solid var(--semantic-warning, rgba(234, 179, 8, 0.4));
    border-radius: 0.5rem;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .code-entry {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
    background: color-mix(
      in srgb,
      var(--theme-accent, #7c6af7) 8%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04))
    );
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #7c6af7) 32%, transparent);
    border-radius: var(--radius-md, 0.75rem);
  }

  .code-row {
    display: grid;
    grid-template-columns: minmax(8rem, 1fr) minmax(8rem, auto);
    gap: 0.625rem;
  }

  .code-input {
    text-align: center;
    font-family:
      ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: 0.24em;
    font-variant-numeric: tabular-nums;
  }

  .code-submit {
    min-height: var(--min-touch-target, 44px);
    padding: 0.625rem 1rem;
    color: var(--theme-text, white);
    background: var(--theme-accent, #7c6af7);
    border: 1px solid var(--theme-accent-strong, var(--theme-accent, #7c6af7));
    border-radius: var(--radius-sm, 0.5rem);
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 700;
    cursor: pointer;
  }

  .code-submit:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .code-error {
    margin: 0;
    color: var(--semantic-error, #ef4444);
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.4;
  }

  label {
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 600;
    color: color-mix(in srgb, var(--theme-text, white) 85%, transparent);
  }

  input {
    box-sizing: border-box;
    padding: 0.75rem;
    min-height: var(--min-touch-target, 44px);
    border: 2px solid
      var(
        --auth-input-border,
        color-mix(in srgb, var(--theme-text, white) 26%, transparent)
      );
    border-radius: 0.5rem;
    /* Keep touch controls at WebKit's 16px floor so focus does not trigger
       viewport zoom or destabilize the software keyboard. */
    font-size: 16px;
    transition:
      border-color var(--duration-normal, 200ms) ease,
      box-shadow var(--duration-normal, 200ms) ease,
      background var(--duration-normal, 200ms) ease;
    background: var(
      --auth-input-background,
      color-mix(
        in srgb,
        var(--theme-card-bg, rgba(255, 255, 255, 0.04)) 88%,
        var(--theme-text, white) 12%
      )
    );
    color: color-mix(in srgb, var(--theme-text, white) 95%, transparent);
    box-shadow: inset 0 1px 0
      var(
        --auth-input-inset-highlight,
        color-mix(in srgb, var(--theme-text, white) 10%, transparent)
      );
    cursor: text;
  }

  input::placeholder {
    color: var(
      --auth-input-placeholder,
      color-mix(in srgb, var(--theme-text, white) 54%, transparent)
    );
    opacity: 1;
  }

  input:hover:not(:disabled) {
    border-color: var(
      --auth-input-border-hover,
      color-mix(in srgb, var(--theme-text, white) 38%, transparent)
    );
  }

  input:focus {
    outline: 3px solid
      var(
        --auth-input-focus-outline,
        color-mix(in srgb, var(--theme-accent, #7c6af7) 38%, transparent)
      );
    outline-offset: 1px;
    border-color: var(
      --auth-input-focus-border,
      var(--theme-accent-strong, var(--theme-accent, #7c6af7))
    );
    background: var(
      --auth-input-focus-background,
      color-mix(
        in srgb,
        var(--theme-accent, #7c6af7) 10%,
        var(--theme-card-bg, rgba(255, 255, 255, 0.04))
      )
    );
    box-shadow:
      0 0 0 3px
        var(
          --auth-input-focus-shadow,
          color-mix(
            in srgb,
            var(--theme-accent-strong, var(--theme-accent, #7c6af7)) 18%,
            transparent
          )
        ),
      inset 0 1px 0
        var(
          --auth-input-inset-highlight,
          color-mix(in srgb, var(--theme-text, white) 10%, transparent)
        );
  }

  input:disabled {
    opacity: 0.72;
    cursor: not-allowed;
  }

  .form-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 0.625rem;
  }

  .form-actions--split {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .submit-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.75rem 1rem;
    background: linear-gradient(
      135deg,
      var(--theme-accent-strong, var(--theme-accent, #7c6af7)) 0%,
      color-mix(
          in srgb,
          var(--theme-accent-strong, var(--theme-accent, #7c6af7)) 85%,
          #000
        )
        100%
    );
    color: var(--theme-text, white);
    border: none;
    border-radius: 0.5rem;
    font-weight: 600;
    font-size: var(--font-size-min, 0.875rem);
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    min-height: var(--min-touch-target);
    box-shadow: 0 4px 6px
      color-mix(
        in srgb,
        var(--theme-accent-strong, var(--theme-accent, #7c6af7)) 20%,
        transparent
      );
  }

  .submit-button:hover:not(:disabled) {
    background: linear-gradient(
      135deg,
      color-mix(
          in srgb,
          var(--theme-accent-strong, var(--theme-accent, #7c6af7)) 85%,
          #000
        )
        0%,
      color-mix(
          in srgb,
          var(--theme-accent-strong, var(--theme-accent, #7c6af7)) 70%,
          #000
        )
        100%
    );
    box-shadow: 0 6px 8px
      color-mix(
        in srgb,
        var(--theme-accent-strong, var(--theme-accent, #7c6af7)) 30%,
        transparent
      );
    transform: translateY(-1px);
  }

  .submit-button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .submit-button:active:not(:disabled) {
    transform: scale(0.98);
  }

  .submit-button.submit-button--secondary {
    color: var(--theme-text, white);
    background: transparent;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    box-shadow: none;
  }

  .submit-button.submit-button--secondary:hover:not(:disabled) {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.18));
    box-shadow: none;
  }

  .different-email-button {
    min-height: var(--min-touch-target, 44px);
    padding: 0.625rem 1rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 0.5rem;
    background: transparent;
    color: var(--theme-text, white);
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
  }

  .different-email-button:hover {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.05));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.18));
  }

  .submit-button:focus-visible,
  .different-email-button:focus-visible {
    outline: 3px solid
      color-mix(in srgb, var(--theme-accent, #7c6af7) 72%, white);
    outline-offset: 3px;
  }

  @keyframes delivery-pulse {
    0%,
    100% {
      transform: translateX(0);
      opacity: 0.72;
    }
    50% {
      transform: translateX(0.2rem);
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .delivery-icon--sending {
      animation: none;
    }

    input,
    .submit-button,
    .different-email-button {
      transition: none;
    }
  }

  @media (max-width: 30rem) {
    .code-row {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
