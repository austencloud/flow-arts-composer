<!--
  DangerZone Component

  Handles account deletion with collapsible disclosure pattern.
  User must expand section before seeing deletion option.
  Includes GitHub-style text confirmation barrier.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { HapticFeedback } from "../../../application/services/haptic-feedback";
  import type { DeleteReauth } from "#lib/shared/auth/services/account-manager.js";
  import { getProfileSettingsContext } from "../../state/profile-settings-context.svelte";
  import FacebookIcon from "#lib/shared/auth/components/icons/FacebookIcon.svelte";
  import GoogleIcon from "#lib/shared/auth/components/icons/GoogleIcon.svelte";
  import InstagramIcon from "#lib/shared/auth/components/icons/InstagramIcon.svelte";
  import Crossfade from "#lib/shared/components/Crossfade.svelte";
  import { DURATION } from "#lib/shared/transitions/transitions.js";
  import { growFade } from "#lib/shared/transitions/motion.js";

  const ctx = getProfileSettingsContext();

  let { onDeleteAccount, hapticService, userIdentifier, providerIds, isAdmin } =
    $props<{
      onDeleteAccount: (reauth: DeleteReauth, reason?: string) => Promise<void>;
      hapticService: HapticFeedback | null;
      userIdentifier: string;
      providerIds: string[];
      isAdmin: boolean;
    }>();

  let isExpanded = $state(false);
  let confirmationText = $state("");
  let deletePassword = $state("");
  let deleteReason = $state("");
  let deleteError = $state("");
  let isDeleting = $state(false);

  // Which reauth methods this account actually has. OAuth accounts (Google /
  // Facebook / Instagram / magic-link upgrades) have no password, so they reauthenticate
  // via a popup instead of a password field.
  let hasGoogle = $derived(providerIds.includes("google.com"));
  let hasFacebook = $derived(providerIds.includes("facebook.com"));
  let hasInstagram = $derived(providerIds.includes("instagram.com"));
  let hasOAuth = $derived(hasGoogle || hasFacebook || hasInstagram);

  // The GitHub-style barrier: type your username/email. OAuth reauth needs only
  // this match (the popup proves identity); password reauth also needs a password.
  let usernameMatches = $derived(
    confirmationText.toLowerCase().trim() ===
      userIdentifier.toLowerCase().trim()
  );
  let isConfirmationValid = $derived(
    usernameMatches && (hasOAuth || deletePassword.length > 0)
  );

  async function runDelete(reauth: DeleteReauth) {
    if (!usernameMatches || isDeleting) return;
    hapticService?.trigger("warning");
    isDeleting = true;
    deleteError = "";
    try {
      await onDeleteAccount(reauth, deleteReason.trim() || undefined);
    } catch (e: unknown) {
      deleteError =
        e instanceof Error ? e.message : t("nav_ui_failed_to_delete_account");
      hapticService?.trigger("error");
    } finally {
      isDeleting = false;
    }
  }

  function toggleExpanded() {
    hapticService?.trigger("selection");
    isExpanded = !isExpanded;
    if (!isExpanded) {
      ctx.ui.showDeleteConfirmation = false;
      confirmationText = "";
      deletePassword = "";
      deleteReason = "";
      deleteError = "";
    }
  }

  function handleShowConfirmation() {
    hapticService?.trigger("selection");
    ctx.ui.showDeleteConfirmation = true;
  }

  function handleCancel() {
    hapticService?.trigger("selection");
    ctx.ui.showDeleteConfirmation = false;
    confirmationText = "";
    deletePassword = "";
    deleteReason = "";
    deleteError = "";
  }
</script>

<div class="danger-section">
  <!-- Collapsible trigger -->
  <button
    class="disclosure-button"
    onclick={toggleExpanded}
    aria-expanded={isExpanded}
    aria-controls="danger-zone-content"
  >
    <i
      class="fas fa-chevron-right"
      class:expanded={isExpanded}
      aria-hidden="true"
    ></i>
    <span>{t("nav_ui_delete_account")}</span>
  </button>

  {#if isExpanded}
    <div id="danger-zone-content" class="danger-content" transition:growFade>
      {#if isAdmin}
        <p class="warning-text">
          <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
          Admin accounts can't be deleted in-app. Manage account removal through the
          Firebase console.
        </p>
      {:else}
        <p class="warning-text">
          <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
          {t(
            "nav_ui_deleting_your_account_is_permanent_and_cannot_be_undone_all_your_progress_and_data_wi"
          )}
        </p>

        <Crossfade
          key={ctx.ui.showDeleteConfirmation}
          duration={DURATION.emphasis}
          animateHeight
        >
          {#if !ctx.ui.showDeleteConfirmation}
            <div>
              <button
                class="button button--danger"
                onclick={handleShowConfirmation}
              >
                <i class="fas fa-trash-alt" aria-hidden="true"></i>
                {t("nav_ui_continue_to_deletion")}
              </button>
            </div>
          {:else}
            <div class="confirmation-box">
              <p class="confirmation-text">
                <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
                {t("nav_ui_deleting_this_account_is_permanent")}
              </p>

              <div class="confirmation-input-section">
                <label for="delete-confirmation" class="confirmation-label">
                  {t("nav_delete_confirmation")}
                  <strong>{userIdentifier}</strong>
                </label>
                <input
                  id="delete-confirmation"
                  type="text"
                  class="confirmation-input"
                  class:valid={isConfirmationValid}
                  placeholder={userIdentifier}
                  bind:value={confirmationText}
                  autocomplete="off"
                  spellcheck="false"
                />
              </div>

              <div class="confirmation-input-section">
                <label for="delete-reason" class="confirmation-label">
                  {t("nav_ui_why_are_you_leaving_optional")}
                </label>
                <textarea
                  id="delete-reason"
                  class="confirmation-input reason-input"
                  placeholder={t("nav_ui_share_what_went_wrong")}
                  bind:value={deleteReason}
                  maxlength="500"
                  rows="2"
                  disabled={isDeleting}
                ></textarea>
              </div>

              {#if hasOAuth}
                <p class="confirmation-label reauth-hint">
                  {t(
                    "nav_ui_confirm_with_your_linked_account_to_permanently_delete"
                  )}
                </p>
              {:else}
                <div class="confirmation-input-section">
                  <label for="delete-password" class="confirmation-label">
                    {t("nav_delete_password")}
                  </label>
                  <input
                    id="delete-password"
                    type="password"
                    class="confirmation-input"
                    class:valid={deletePassword.length > 0}
                    placeholder={t("nav_ui_your_current_password")}
                    bind:value={deletePassword}
                    autocomplete="current-password"
                    disabled={isDeleting}
                  />
                </div>
              {/if}

              {#if deleteError}
                <p class="error-message" role="alert" transition:growFade>
                  <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
                  {deleteError}
                </p>
              {/if}

              <div class="button-row">
                <button class="button button--secondary" onclick={handleCancel}>
                  {t("action_cancel")}
                </button>
                {#if hasOAuth}
                  {#if hasGoogle}
                    <button
                      class="button button--danger-confirm"
                      onclick={() => runDelete({ method: "google" })}
                      disabled={!usernameMatches || isDeleting}
                    >
                      <span class="reauth-provider-icon"><GoogleIcon /></span>
                      {isDeleting
                        ? t("feedback_deleting")
                        : t("nav_ui_confirm_with_google")}
                    </button>
                  {/if}
                  {#if hasFacebook}
                    <button
                      class="button button--danger-confirm"
                      onclick={() => runDelete({ method: "facebook" })}
                      disabled={!usernameMatches || isDeleting}
                    >
                      <span class="reauth-provider-icon facebook"
                        ><FacebookIcon /></span
                      >
                      {isDeleting
                        ? t("feedback_deleting")
                        : t("nav_ui_confirm_with_facebook")}
                    </button>
                  {/if}
                  {#if hasInstagram}
                    <button
                      class="button button--danger-confirm"
                      onclick={() => runDelete({ method: "instagram" })}
                      disabled={!usernameMatches || isDeleting}
                    >
                      <span class="reauth-provider-icon instagram"
                        ><InstagramIcon /></span
                      >
                      {isDeleting
                        ? t("feedback_deleting")
                        : t("nav_ui_confirm_with_instagram")}
                    </button>
                  {/if}
                {:else}
                  <button
                    class="button button--danger-confirm"
                    onclick={() =>
                      runDelete({
                        method: "password",
                        password: deletePassword,
                      })}
                    disabled={!isConfirmationValid || isDeleting}
                  >
                    <i class="fas fa-trash-alt" aria-hidden="true"></i>
                    {isDeleting
                      ? t("feedback_deleting")
                      : t("nav_ui_delete_forever")}
                  </button>
                {/if}
              </div>
            </div>
          {/if}
        </Crossfade>
      {/if}
    </div>
  {/if}
</div>

<style>
  .danger-section {
    width: 100%;
    max-width: none;
    margin: 0;
    border-top: 1px solid var(--theme-stroke, var(--theme-stroke));
    padding-top: 0.9rem;
  }

  /* Disclosure Button */
  .disclosure-button {
    width: auto;
    display: inline-flex;
    align-items: center;
    gap: 12px;
    min-height: var(--min-touch-target, 44px);
    padding: 0.65rem 0.9rem;
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 5%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--semantic-error, #ef4444) 20%, transparent);
    border-radius: 10px;
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 80%, transparent);
    font-size: var(--font-size-sm);
    font-weight: 650;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
  }

  .disclosure-button:hover {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 10%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 30%,
      transparent
    );
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 95%, transparent);
  }

  .disclosure-button i {
    font-size: var(--font-size-compact);
    transition: transform var(--duration-normal) ease;
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 70%, transparent);
  }

  .disclosure-button i.expanded {
    transform: rotate(90deg);
  }

  /* Danger Content */
  .danger-content {
    margin-top: 0.75rem;
    padding: 1rem;
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 4%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--semantic-error, #ef4444) 15%, transparent);
    border-radius: 12px;
  }

  .warning-text {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, var(--theme-text-dim));
    line-height: 1.6;
    margin: 0 0 16px 0;
  }

  .warning-text i {
    font-size: var(--font-size-base);
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 70%, transparent);
    margin-top: 2px;
    flex-shrink: 0;
  }

  .confirmation-box {
    background: var(--theme-panel-bg);
    border-radius: 10px;
    padding: 16px;
    margin-top: 12px;
  }

  .confirmation-text {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: var(--font-size-sm);
    color: var(--semantic-error);
    margin: 0 0 16px 0;
    font-weight: 500;
  }

  .confirmation-text i {
    font-size: var(--font-size-lg);
    flex-shrink: 0;
  }

  /* Confirmation Input */
  .confirmation-input-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
  }

  .confirmation-label {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, var(--theme-text-dim));
    line-height: 1.5;
  }

  .reauth-hint {
    margin: 0 0 16px 0;
  }

  .confirmation-label strong {
    color: var(--semantic-error);
    font-family:
      ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 15%,
      transparent
    );
    padding: 2px 6px;
    border-radius: 4px;
    font-size: var(--font-size-compact);
    letter-spacing: 0.5px;
  }

  .confirmation-input {
    width: 100%;
    padding: 12px 14px;
    font-size: var(--font-size-sm);
    font-family:
      ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
    letter-spacing: 0.5px;
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, #12121c) 90%,
      var(--theme-text, #fff) 10%
    );
    border: 2px solid
      color-mix(in srgb, var(--semantic-error, #ef4444) 25%, transparent);
    border-radius: 8px;
    color: var(--theme-text);
    outline: none;
    transition: all var(--duration-normal) ease;
  }

  .confirmation-input::placeholder {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
    font-family: inherit;
  }

  .reason-input {
    font-family: inherit;
    letter-spacing: normal;
    resize: vertical;
    min-height: var(--min-touch-target);
  }

  .confirmation-input:focus {
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 50%,
      transparent
    );
    box-shadow: 0 0 0 3px
      color-mix(in srgb, var(--semantic-error, #ef4444) 10%, transparent);
  }

  .confirmation-input.valid {
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 60%,
      transparent
    );
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 8%,
      transparent
    );
  }

  /* Buttons */
  .button {
    width: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 12px 20px;
    min-height: var(--min-touch-target);
    border-radius: 8px;
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    border: none;
  }

  .button i {
    font-size: var(--font-size-sm);
  }

  .button--secondary {
    background: var(--theme-card-hover-bg, var(--theme-card-bg));
    color: var(--theme-text, var(--theme-text));
    border: 1px solid var(--theme-stroke-strong, var(--theme-stroke-strong));
  }

  .button--secondary:hover:not(:disabled) {
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke-strong);
  }

  .button--danger {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 10%,
      transparent
    );
    color: color-mix(in srgb, var(--semantic-error, #ef4444) 90%, transparent);
    border: 1px solid
      color-mix(in srgb, var(--semantic-error, #ef4444) 25%, transparent);
  }

  .button--danger:hover:not(:disabled) {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 15%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 40%,
      transparent
    );
  }

  .button--danger-confirm {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 20%,
      transparent
    );
    color: var(--semantic-error);
    border: 2px solid
      color-mix(in srgb, var(--semantic-error, #ef4444) 40%, transparent);
  }

  .button--danger-confirm:hover:not(:disabled) {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 30%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 60%,
      transparent
    );
  }

  .button:active:not(:disabled) {
    transform: scale(0.98);
  }

  .button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none !important;
  }

  .button-row {
    display: flex;
    gap: 12px;
  }

  .button-row .button {
    flex: 1;
  }

  .reauth-provider-icon {
    display: grid;
    width: 1.1rem;
    height: 1.1rem;
    place-items: center;
  }

  .reauth-provider-icon :global(svg) {
    width: 1.1rem;
    height: 1.1rem;
  }

  .reauth-provider-icon.facebook {
    color: #1877f2;
  }

  .reauth-provider-icon.instagram {
    color: #e4405f;
  }

  /* Mobile Responsive */
  @media (max-width: 480px) {
    .danger-section {
      padding-top: 0.75rem;
    }

    .button-row {
      flex-direction: column;
    }

    .button-row .button {
      width: 100%;
    }

    .button--danger {
      width: 100%;
    }
  }

  /* Accessibility - Focus Indicators */
  .disclosure-button:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--theme-accent) 90%, transparent);
    outline-offset: 2px;
  }

  .button:focus-visible {
    outline: 3px solid color-mix(in srgb, var(--theme-accent) 90%, transparent);
    outline-offset: 2px;
  }

  .button--danger:focus-visible,
  .button--danger-confirm:focus-visible {
    outline: 3px solid
      color-mix(in srgb, var(--semantic-error, #ef4444) 90%, transparent);
    outline-offset: 2px;
  }

  /* Accessibility - Reduced Motion */
  @media (prefers-reduced-motion: reduce) {
    .disclosure-button i,
    .button {
      transition: none;
    }

    .button:hover,
    .button:active {
      transform: none;
    }
  }

  /* Accessibility - High Contrast */
  @media (prefers-contrast: high) {
    .disclosure-button:focus-visible,
    .button:focus-visible {
      outline: 3px solid white;
    }
  }

  .error-message {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 12px 0;
    padding: 10px 14px;
    border-radius: 8px;
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 12%,
      transparent
    );
    color: var(--semantic-error);
    font-size: var(--font-size-compact);
  }

  .error-message i {
    flex-shrink: 0;
  }
</style>
