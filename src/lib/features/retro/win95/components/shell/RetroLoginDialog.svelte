<!--
  RetroLoginDialog -- Win95-styled modal login dialog

  Gates the desktop until Firebase authentication succeeds.
  Appears after the boot sequence completes, before the desktop
  becomes interactive. Skipped entirely if the user already has
  an active Firebase session.

  Domain: Retro Desktop Shell
-->
<script lang="ts">
  import { signInWithEmail, signInWithGoogle } from "#lib/shared/auth/services/authenticator.js";
  import { desktopState } from "../../state/desktop-state.svelte";
  import RetroButton from "../primitives/RetroButton.svelte";

  /* Props                                                               */

  let {
    onsuccess = undefined,
    onfail = undefined,
  }: {
    onsuccess?: () => void;
    onfail?: () => void;
  } = $props();

  /* Local state                                                         */

  let email = $state("");
  let password = $state("");
  let errorMessage = $state("");
  let isSubmitting = $state(false);

  /* Auth handler helpers                                                */

  function handleSuccess() {
    // authState watcher in RetroDesktop will populate display name / email
    // once the Firebase user object updates. We just flip the gate here.
    desktopState.isAuthenticated = true;
    onsuccess?.();
  }

  /* Email / password sign-in                                            */

  async function handleEmailSignIn() {
    if (!email.trim() || !password) return;

    isSubmitting = true;
    errorMessage = "";

    try {
      await signInWithEmail(email.trim(), password);
      handleSuccess();
    } catch (error) {
      errorMessage =
        error instanceof Error
          ? error.message
          : "Sign-in failed. Check your credentials and try again.";
      onfail?.();
    } finally {
      isSubmitting = false;
    }
  }

  /* Google sign-in                                                       */

  async function handleGoogleSignIn() {
    isSubmitting = true;
    errorMessage = "";

    try {
      await signInWithGoogle();
      handleSuccess();
    } catch (error) {
      errorMessage =
        error instanceof Error
          ? error.message
          : "Google sign-in failed. Please try again.";
      onfail?.();
    } finally {
      isSubmitting = false;
    }
  }

  /* Keyboard: Enter submits                                              */

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "Enter" && !isSubmitting) {
      handleEmailSignIn();
    }
  }
</script>

<!-- Modal overlay -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="login-overlay">
  <!-- Dialog window -->
  <div class="login-dialog" role="dialog" aria-label="Log On to TKA Notation System">
    <!-- Title bar -->
    <div class="title-bar">
      <div class="title-bar-text">Log On to TKA Notation System</div>
    </div>

    <!-- Dialog body -->
    <div class="dialog-body">
      <!-- Icon + instructions row -->
      <div class="instructions-row">
        <div class="key-icon">
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <rect x="2" y="12" width="28" height="14" rx="2" fill="#808080" stroke="#000" stroke-width="1"/>
            <circle cx="12" cy="19" r="4" fill="#c0c0c0" stroke="#000" stroke-width="1"/>
            <circle cx="12" cy="19" r="1.5" fill="#000"/>
            <rect x="16" y="4" width="4" height="12" rx="1" fill="#808080" stroke="#000" stroke-width="1"/>
            <rect x="18" y="4" width="4" height="3" rx="1" fill="#808080" stroke="#000" stroke-width="1"/>
          </svg>
        </div>
        <p class="instructions">
          Type a user name and password to log on to TKA-OS.
        </p>
      </div>

      <!-- Form fields -->
      <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
      <div class="field-grid" onkeydown={handleKeydown}>
        <label for="login-email" class="field-label">User name:</label>
        <input
          id="login-email"
          type="text"
          class="retro-input"
          bind:value={email}
          disabled={isSubmitting}
          autocomplete="username"
          placeholder=""
        />

        <label for="login-password" class="field-label">Password:</label>
        <input
          id="login-password"
          type="password"
          class="retro-input"
          bind:value={password}
          disabled={isSubmitting}
          autocomplete="current-password"
          placeholder=""
        />
      </div>

      <!-- Error message -->
      {#if errorMessage}
        <div class="error-area">
          <p class="error-text">{errorMessage}</p>
        </div>
      {/if}

      <!-- Separator -->
      <hr class="separator" />

      <!-- Google sign-in -->
      <div class="google-row">
        <RetroButton
          label="Sign in with Google"
          onclick={handleGoogleSignIn}
          disabled={isSubmitting}
        />
      </div>

      <!-- Button row -->
      <div class="button-row">
        <RetroButton
          label="OK"
          isDefault={true}
          onclick={handleEmailSignIn}
          disabled={isSubmitting || !email.trim() || !password}
        />
        <RetroButton
          label="Cancel"
          disabled={true}
        />
      </div>
    </div>
  </div>
</div>

<style>
  /* Modal overlay -- dims the desktop behind the dialog                  */
  .login-overlay {
    position: absolute;
    inset: 0;
    z-index: 8000;
    background: rgba(0, 0, 0, 0.45);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Dialog window -- classic Win95 look                                  */
  .login-dialog {
    width: 380px;
    max-width: 90%;
    background: #c0c0c0;
    border: 2px solid;
    border-color: #dfdfdf #000 #000 #dfdfdf;
    box-shadow: inset 1px 1px 0 #fff, inset -1px -1px 0 #808080;
  }

  /* Title bar                                                            */
  .title-bar {
    background: linear-gradient(90deg, #000080, #1084d0);
    padding: 2px 4px;
    display: flex;
    align-items: center;
    user-select: none;
  }

  .title-bar-text {
    color: #fff;
    font-weight: bold;
    font-size: 11px;
    font-family: var(--retro-font-family, "Microsoft Sans Serif", Arial, sans-serif);
  }

  /* Dialog body                                                          */
  .dialog-body {
    padding: 12px;
  }

  /* Instructions row (icon + text)                                       */
  .instructions-row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 12px;
  }

  .key-icon {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
  }

  .instructions {
    margin: 0;
    font-size: 11px;
    color: #000;
    line-height: 1.4;
  }

  /* Form field grid                                                      */
  .field-grid {
    display: grid;
    grid-template-columns: 80px 1fr;
    gap: 6px 8px;
    align-items: center;
    margin-bottom: 8px;
  }

  .field-label {
    font-size: 11px;
    color: #000;
    text-align: right;
  }

  /* Match RetroTextInput styling for the password field */
  .retro-input {
    font-family: var(--retro-font-family, "Microsoft Sans Serif", Arial, sans-serif);
    font-size: var(--retro-font-size, 11px);
    color: var(--retro-field-text, #000);
    background: var(--retro-field-bg, #fff);
    width: 100%;
    box-sizing: border-box;
    padding: 2px 4px;
    border: none;
    /* 98.css sunken field look */
    box-shadow: inset -1px -1px 0 #dfdfdf, inset 1px 1px 0 #808080,
      inset -2px -2px 0 #c0c0c0, inset 2px 2px 0 #000;
  }

  .retro-input:disabled {
    color: #808080;
    background: #c0c0c0;
  }

  .retro-input:focus-visible {
    outline: none;
  }

  /* Error area                                                           */
  .error-area {
    margin-bottom: 8px;
    padding: 4px 6px;
    background: #fff;
    border: 1px solid #808080;
  }

  .error-text {
    margin: 0;
    font-size: 11px;
    color: #cc0000;
    line-height: 1.3;
  }

  /* Separator                                                            */
  .separator {
    border: none;
    border-top: 1px solid #808080;
    border-bottom: 1px solid #fff;
    margin: 10px 0;
  }

  /* Google sign-in row                                                   */
  .google-row {
    display: flex;
    justify-content: center;
    margin-bottom: 12px;
  }

  /* OK / Cancel button row                                               */
  .button-row {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }
</style>
