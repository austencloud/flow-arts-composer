<script lang="ts">
  /**
   * EmailPasswordAuth
   *
   * Email/password sign-in and sign-up.
   */

  import {
    createUserWithEmailAndPassword,
    sendEmailVerification,
    signInWithEmailAndPassword,
    updateProfile,
  } from "firebase/auth";
  import { onDestroy } from "svelte";
  import { auth, configureAuthPersistence } from "../firebase";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import {
    captureAnonymousDrafts,
    upgradeAnonymousWithEmail,
  } from "$lib/shared/auth/services/anonymous-upgrade";
  import { promptAnonymousImport } from "$lib/shared/auth/state/anonymous-import-prompt.svelte";
  import { recordAuthSubmission } from "$lib/shared/auth/services/auth-analytics-bridge";
  import { trackAuthProviderResult } from "$lib/shared/analytics/auth-events";

  let {
    mode = $bindable("signin" as "signin" | "signup"),
    showModeSwitch = true,
  } = $props();

  let email = $state("");
  let password = $state("");
  let name = $state("");
  let showPassword = $state(false);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let success = $state<string | null>(null);

  // Lightweight client-side rate limiting
  const MAX_ATTEMPTS = 5;
  const LOCKOUT_DURATION = 60; // seconds
  let failedAttempts = $state(0);
  let lockoutEndTime = $state<number | null>(null);
  let lockoutRemaining = $state(0);
  let lockoutInterval: ReturnType<typeof setInterval> | null = null;

  const isLockedOut = $derived(
    lockoutEndTime !== null && Date.now() < lockoutEndTime
  );

  function startLockoutTimer() {
    if (lockoutInterval) clearInterval(lockoutInterval);
    lockoutInterval = setInterval(() => {
      if (!lockoutEndTime) return;
      const remaining = Math.ceil((lockoutEndTime - Date.now()) / 1000);
      if (remaining <= 0) {
        lockoutEndTime = null;
        lockoutRemaining = 0;
        failedAttempts = 0;
        if (lockoutInterval) clearInterval(lockoutInterval);
        lockoutInterval = null;
      } else {
        lockoutRemaining = remaining;
      }
    }, 1000);
  }

  function recordFailedAttempt() {
    failedAttempts++;
    if (failedAttempts >= MAX_ATTEMPTS) {
      lockoutEndTime = Date.now() + LOCKOUT_DURATION * 1000;
      lockoutRemaining = LOCKOUT_DURATION;
      startLockoutTimer();
    }
  }

  function resetAttempts() {
    failedAttempts = 0;
    lockoutEndTime = null;
    lockoutRemaining = 0;
    if (lockoutInterval) clearInterval(lockoutInterval);
    lockoutInterval = null;
  }

  onDestroy(() => {
    if (lockoutInterval) clearInterval(lockoutInterval);
  });

  async function handleSubmit() {
    if (isLockedOut) {
      error = `Too many failed attempts. Please wait ${lockoutRemaining} seconds.`;
      return;
    }

    loading = true;
    error = null;
    success = null;
    recordAuthSubmission("password", mode);

    try {
      await configureAuthPersistence(auth);

      // recordAuthSubmission has to land the instant the credential resolves,
      // never after. Firebase's onAuthStateChanged fires within milliseconds
      // and that's what emits user_signed_up — anything registered later
      // (notably after the 1200ms success pause below) misses the event it was
      // meant to enrich, and then lingers on unrelated events for the rest of
      // the session. So it goes immediately after each credential call, ahead
      // of profile updates and verification mail.
      if (mode === "signup") {
        if (auth.currentUser?.isAnonymous) {
          const upgrade = await upgradeAnonymousWithEmail(email, password);
          if (upgrade.status === "linked") {
            if (name.trim() && auth.currentUser) {
              await updateProfile(auth.currentUser, {
                displayName: name.trim(),
              });
            }
            if (auth.currentUser && !auth.currentUser.emailVerified) {
              await sendEmailVerification(auth.currentUser);
            }
          } else if (upgrade.status === "collision-signed-in") {
            // The email already had an account and they're now signed into it:
            // a sign-in outcome, not a new account.
            promptAnonymousImport(
              upgrade.importable ?? [],
              upgrade.destinationUid
            );
          }
        } else {
          const result = await createUserWithEmailAndPassword(
            auth,
            email,
            password
          );
          if (name.trim()) {
            await updateProfile(result.user, { displayName: name.trim() });
          }
          await sendEmailVerification(result.user);
        }
        success = t("auth_account_created");
        resetAttempts();
        await new Promise((resolve) => setTimeout(resolve, 1200));
      } else {
        // If a guest with a just-saved (Dexie-only, SP1) sequence signs into an
        // EXISTING account here, signInWithEmailAndPassword swaps the session
        // uid out from under the anonymous one — the guest's local sequence
        // would otherwise be silently abandoned. Capture before the swap, same
        // as the collision branch in upgradeAnonymousWithEmail, then offer the
        // import after sign-in succeeds.
        const anonUid = auth.currentUser?.isAnonymous
          ? auth.currentUser.uid
          : null;
        const drafts = anonUid ? await captureAnonymousDrafts(anonUid) : [];
        const signedIn = await signInWithEmailAndPassword(
          auth,
          email,
          password
        );
        resetAttempts();
        if (drafts.length > 0) {
          // The account this sign-in actually landed on, taken from the auth
          // result itself — the offer is about THAT account, not whichever one
          // is current by the time the user answers the dialog.
          promptAnonymousImport(drafts, signedIn.user.uid);
        }
      }

      trackAuthProviderResult("password", "completed");

      // Don't navigate on success. The wrapping AuthDrawer/AuthSheet closes
      // itself when `isAuthenticated` flips true, leaving the user on the app
      // page they opened it from. Routing to "/" used to dump them on the
      // marketing landing.
    } catch (err: any) {
      trackAuthProviderResult("password", "failed", err?.code ?? "unknown");
      // Record failed attempt (only credential errors)
      if (
        mode === "signin" &&
        (err?.code === "auth/user-not-found" ||
          err?.code === "auth/wrong-password" ||
          err?.code === "auth/invalid-credential")
      ) {
        recordFailedAttempt();
      }

      if (err?.code === "auth/email-already-in-use") {
        error = t("auth_error_email_in_use");
        mode = "signin";
      } else if (err?.code === "auth/weak-password") {
        error = t("auth_error_weak_password");
      } else if (err?.code === "auth/invalid-email") {
        error = t("auth_error_invalid_email");
      } else if (
        err?.code === "auth/user-not-found" ||
        err?.code === "auth/wrong-password" ||
        err?.code === "auth/invalid-credential"
      ) {
        const attemptsLeft = MAX_ATTEMPTS - failedAttempts;
        error =
          attemptsLeft > 0
            ? `${t("auth_error_invalid_credential")} ${attemptsLeft} attempt${
                attemptsLeft === 1 ? "" : "s"
              } remaining.`
            : `${t("auth_error_too_many_attempts")} ${lockoutRemaining}s`;
      } else if (err?.code === "auth/too-many-requests") {
        error = t("auth_error_too_many_attempts");
      } else if (err?.code === "auth/multi-factor-auth-required") {
        error =
          "This account has authenticator 2FA enabled, which is no longer supported in the app. Disable it from your account settings or contact support.";
      } else {
        error = t("auth_error_generic");
      }
    } finally {
      loading = false;
    }
  }

  function toggleMode() {
    mode = mode === "signin" ? "signup" : "signin";
    error = null;
    success = null;
    if (mode === "signin") name = "";
  }
</script>

<div class="auth">
  <form
    class="form"
    data-form-type={mode === "signup" ? "register" : "login"}
    onsubmit={(e) => (e.preventDefault(), void handleSubmit())}
  >
    {#if mode === "signup"}
      <label class="label">
        {t("auth_name")}
        <input
          class="input"
          name="name"
          bind:value={name}
          autocomplete="name"
          data-form-type="name"
        />
      </label>
    {/if}

    <label class="label">
      {t("auth_email")}
      <input
        class="input"
        type="email"
        name="email"
        bind:value={email}
        autocomplete="username"
        data-form-type={mode === "signup" ? "email" : "email,username"}
        required
      />
    </label>

    <label class="label">
      {t("auth_password")}
      <div class="password-row">
        <input
          class="input"
          type={showPassword ? "text" : "password"}
          name="password"
          bind:value={password}
          autocomplete={mode === "signin" ? "current-password" : "new-password"}
          data-form-type={mode === "signin" ? "password" : "password,new"}
          required
        />
        <button
          type="button"
          class="toggle"
          onclick={() => (showPassword = !showPassword)}
          aria-label={showPassword
            ? t("auth_hide_password")
            : t("auth_show_password")}
        >
          <i
            class="fas {showPassword ? 'fa-eye-slash' : 'fa-eye'}"
            aria-hidden="true"
          ></i>
        </button>
      </div>
    </label>

    {#if error}
      <p class="message error" role="alert">{error}</p>
    {/if}

    {#if success}
      <p class="message success" role="status">{success}</p>
    {/if}

    <button
      class="submit"
      type="submit"
      data-form-type={mode === "signin" ? "action,login" : "action,register"}
      disabled={loading}
    >
      {#if loading}
        {mode === "signin" ? t("auth_logging_in") : t("auth_creating_account")}
      {:else}
        {mode === "signin" ? t("auth_sign_in") : t("auth_sign_up")}
      {/if}
    </button>

    {#if showModeSwitch}
      <button
        class="switch"
        type="button"
        onclick={toggleMode}
        disabled={loading}
      >
        {mode === "signin"
          ? t("auth_need_account")
          : t("auth_have_account_signin")}
      </button>
    {/if}
  </form>
</div>

<style>
  .auth {
    width: 100%;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: clamp(8px, 1.5vh, 12px);
    width: 100%;
  }

  .label {
    display: flex;
    flex-direction: column;
    gap: clamp(4px, 0.8vh, 8px);
    font-size: clamp(0.6875rem, 1.5vh, var(--font-size-compact));
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-weight: 600;
  }

  .input {
    box-sizing: border-box;
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    padding: clamp(8px, 1.5vh, 12px) clamp(10px, 2vw, 14px);
    border-radius: clamp(6px, 1vh, 10px);
    background: var(--auth-input-background, var(--theme-card-bg));
    border: 2px solid var(--auth-input-border, var(--theme-stroke));
    color: var(--theme-text);
    /* WebKit's touch keyboard is reliable at the platform's 16px form-control
       floor. Keep the compact treatment only for a real desktop pointer. */
    font-size: 16px;
    box-shadow: inset 0 1px 0
      var(--auth-input-inset-highlight, rgba(255, 255, 255, 0.1));
    cursor: text;
    transition:
      border-color var(--duration-normal, 200ms) ease,
      box-shadow var(--duration-normal, 200ms) ease,
      background var(--duration-normal, 200ms) ease;
  }

  .input::placeholder {
    color: var(--auth-input-placeholder, var(--theme-text-dim));
    opacity: 1;
  }

  .input:hover:not(:disabled) {
    border-color: var(--auth-input-border-hover, var(--theme-stroke-strong));
  }

  .input:focus {
    outline: 3px solid
      var(--auth-input-focus-outline, var(--theme-accent, #7c6af7));
    outline-offset: 1px;
    border-color: var(
      --auth-input-focus-border,
      var(--theme-accent-strong, var(--theme-accent, #7c6af7))
    );
    background: var(--auth-input-focus-background, var(--theme-card-bg));
    box-shadow:
      0 0 0 3px
        var(
          --auth-input-focus-shadow,
          color-mix(in srgb, var(--theme-accent, #7c6af7) 18%, transparent)
        ),
      inset 0 1px 0 var(--auth-input-inset-highlight, rgba(255, 255, 255, 0.1));
  }

  .password-row {
    position: relative;
    display: flex;
    align-items: center;
  }

  .toggle {
    position: absolute;
    right: 6px;
    width: clamp(36px, 5vh, var(--min-touch-target));
    height: clamp(36px, 5vh, var(--min-touch-target));
    border: none;
    border-radius: clamp(6px, 1vh, 10px);
    background: transparent;
    color: var(--theme-text-dim);
    cursor: pointer;
  }

  .message {
    margin: 0;
    padding: clamp(6px, 1vh, 10px) clamp(8px, 1.5vw, 12px);
    border-radius: clamp(6px, 1vh, 10px);
    border: 1px solid transparent;
    font-size: clamp(0.6875rem, 1.5vh, var(--font-size-compact));
    line-height: 1.4;
  }

  .message.error {
    color: var(--semantic-error, var(--semantic-error));
    border-color: color-mix(
      in srgb,
      var(--semantic-error, var(--semantic-error)) 60%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--semantic-error, var(--semantic-error)) 12%,
      transparent
    );
  }

  .message.success {
    color: var(--semantic-success, var(--semantic-success));
    border-color: color-mix(
      in srgb,
      var(--semantic-success, var(--semantic-success)) 60%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--semantic-success, var(--semantic-success)) 12%,
      transparent
    );
  }

  .submit {
    width: 100%;
    min-height: clamp(36px, 5vh, var(--min-touch-target));
    border-radius: clamp(8px, 1.2vh, 12px);
    border: none;
    background: linear-gradient(
      135deg,
      var(--theme-accent, var(--theme-accent)),
      color-mix(in srgb, var(--theme-accent, var(--theme-accent)) 70%, #000)
    );
    color: #fff;
    font-weight: 800;
    font-size: clamp(0.75rem, 1.8vh, var(--font-size-sm));
    cursor: pointer;
  }

  .submit:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .switch {
    width: 100%;
    border: 1px solid var(--theme-stroke);
    background: transparent;
    color: var(--theme-text);
    border-radius: clamp(8px, 1.2vh, 12px);
    padding: clamp(8px, 1.5vh, 12px) clamp(10px, 2vw, 14px);
    cursor: pointer;
    font-weight: 700;
    font-size: clamp(0.75rem, 1.8vh, var(--font-size-sm));
  }

  .switch:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @media (min-width: 30rem) and (hover: hover) and (pointer: fine) {
    .input {
      font-size: clamp(0.75rem, 1.8vh, var(--font-size-sm));
    }
  }
</style>
