<!--
  ConnectedAccounts Component

  Displays linked OAuth providers and allows users to:
  - View currently linked accounts (Google, Facebook, Instagram, Email/Password)
  - Link new providers to their account
  - Unlink providers (if more than one is linked)
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";
  import {
    linkFacebookAccount,
    linkGoogleAccount,
    linkInstagramAccount,
    unlinkInstagramAccount,
    unlinkProvider,
  } from "#lib/shared/auth/services/authenticator.js";
  import { authState } from "../../../auth/state/auth-state.svelte";
  import type { HapticFeedback } from "../../../application/services/haptic-feedback";
  import { onMount } from "svelte";
  import EmailLinkingDrawer from "../../../auth/components/EmailLinkingDrawer.svelte";
  import {
    getAvailableProviderIds,
    PROVIDERS,
    type ProviderId,
  } from "./connected-accounts.providers";
  import ProviderStatusRow from "./ProviderStatusRow.svelte";
  import {
    FACEBOOK_LOGIN_ENABLED,
    INSTAGRAM_LOGIN_ENABLED,
  } from "#lib/shared/auth/services/auth-providers.config.js";
  import { browser } from "$app/env";
  import { isNative } from "#lib/shared/platform/services/platform-detector.js";
  import ConfirmDialog from "../../../foundation/ui/ConfirmDialog.svelte";
  import {
    getInstagramAuthErrorMessage,
    hasInstagramAccount,
  } from "#lib/shared/auth/services/instagram-auth.js";

  let { onInstagramChange, managing = false } = $props<{
    onInstagramChange?: (linked: boolean) => void;
    managing?: boolean;
  }>();

  // Services
  let hapticService = $state<HapticFeedback | null>(null);

  // UI State
  let linkingProvider = $state<ProviderId | null>(null);
  let unlinkingProvider = $state<ProviderId | null>(null);
  let errorMessage = $state<string | null>(null);
  let instagramLinked = $state(false);

  // Email linking drawer state
  let showEmailLinkingDrawer = $state(false);

  // Unlink confirmation dialog state
  let showUnlinkConfirm = $state(false);
  let providerToUnlink = $state<ProviderId | null>(null);

  async function refreshInstagramLink(forceRefresh = false): Promise<void> {
    const user = authState.user;
    instagramLinked = user
      ? await hasInstagramAccount(user, forceRefresh).catch(() => false)
      : false;
    onInstagramChange?.(instagramLinked);
  }

  onMount(() => {
    hapticService = getHapticFeedback();
    void refreshInstagramLink();
  });

  // Derived state
  const linkedProviderIds = $derived([
    ...new Set([
      ...(authState.user?.providerData?.map((p) => p.providerId) ?? []),
      ...(instagramLinked ? ["instagram.com"] : []),
    ]),
  ]);

  const linkedProviders = $derived(
    (Object.keys(PROVIDERS) as ProviderId[]).filter((providerId) =>
      linkedProviderIds.includes(providerId)
    )
  );

  const availableProviders = $derived(
    getAvailableProviderIds(linkedProviderIds, {
      facebookEnabled: FACEBOOK_LOGIN_ENABLED,
      instagramEnabled: INSTAGRAM_LOGIN_ENABLED,
      native: browser && isNative(),
    })
  );

  const canUnlink = $derived(linkedProviderIds.length > 1);

  // Get provider details from providerData
  function getProviderEmail(providerId: string): string | null {
    const provider = authState.user?.providerData?.find(
      (p) => p.providerId === providerId
    );
    return provider?.email ?? null;
  }

  function getLinkedProviderDetail(providerId: ProviderId): string {
    if (providerId === "instagram.com") return t("nav_ui_connected");
    if (providerId === "password") {
      const email = getProviderEmail(providerId) ?? authState.user?.email;
      if (!email)
        return isEmailVerified
          ? t("nav_ui_verified_email")
          : t("nav_ui_email_not_verified");
      return isEmailVerified ? email : `${email} · Not verified`;
    }
    return getProviderEmail(providerId) ?? t("nav_ui_connected");
  }

  function getAvailableProviderDetail(providerId: ProviderId): string {
    return providerId === "password"
      ? t("nav_ui_add_email_and_password_sign_in")
      : t("nav_ui_not_connected");
  }

  // Link a new provider
  async function linkProvider(providerId: ProviderId) {
    // Prevent double-clicking
    if (linkingProvider) return;

    linkingProvider = providerId;
    errorMessage = null;
    hapticService?.trigger("selection");

    try {
      if (providerId === "google.com") {
        await linkGoogleAccount();
      } else if (providerId === "facebook.com") {
        await linkFacebookAccount();
      } else if (providerId === "instagram.com") {
        await linkInstagramAccount();
      }
      // Note: Email/password linking requires a separate flow with password input

      // Popup completed successfully - refresh auth state to pick up new provider
      await authState.refreshUser();
      if (providerId === "instagram.com") await refreshInstagramLink(true);
      hapticService?.trigger("success");
      linkingProvider = null;
    } catch (error: unknown) {
      console.error(`Failed to link ${providerId}:`, error);
      const message =
        error instanceof Error ? error.message : t("nav_ui_unknown_error");

      if (providerId === "instagram.com") {
        errorMessage =
          getInstagramAuthErrorMessage(error) ??
          t("nav_ui_instagram_connection_was_cancelled");
        hapticService?.trigger("error");
        linkingProvider = null;
        return;
      }

      // Handle specific Firebase errors
      if (message.includes("already linked")) {
        errorMessage = t("nav_provider_linked", {
          provider: PROVIDERS[providerId].name,
        });
      } else if (message.includes("credential-already-in-use")) {
        errorMessage = t("nav_provider_other_user", {
          provider: PROVIDERS[providerId].name,
        });
      } else if (message.includes("No user is currently signed in")) {
        errorMessage = t("nav_ui_you_must_be_signed_in_to_link_accounts");
      } else {
        errorMessage = t("nav_provider_link_failed", {
          provider: PROVIDERS[providerId].name,
        });
      }

      hapticService?.trigger("error");
      linkingProvider = null;
    }
  }

  // Request to unlink a provider (shows confirmation dialog)
  function requestUnlinkProvider(providerId: ProviderId) {
    if (unlinkingProvider || !canUnlink) return;
    providerToUnlink = providerId;
    showUnlinkConfirm = true;
  }

  // Actually unlink the provider (called after confirmation)
  async function confirmUnlinkProvider() {
    if (!providerToUnlink) return;

    const providerId = providerToUnlink;
    const providerName = PROVIDERS[providerId].name;

    unlinkingProvider = providerId;
    errorMessage = null;

    try {
      if (providerId === "instagram.com") {
        await unlinkInstagramAccount();
        await refreshInstagramLink(true);
      } else {
        await unlinkProvider(providerId);
        await authState.refreshUser();
      }
      hapticService?.trigger("success");
    } catch (error: unknown) {
      console.error(`Failed to unlink ${providerId}:`, error);
      const message =
        error instanceof Error ? error.message : t("nav_ui_unknown_error");

      if (providerId === "instagram.com") {
        errorMessage = getInstagramAuthErrorMessage(error);
      } else if (message.includes("only authentication method")) {
        errorMessage = t("nav_ui_cannot_disconnect_your_only_sign_in_method");
      } else {
        errorMessage = t("nav_provider_unlink_failed", {
          provider: providerName,
        });
      }

      hapticService?.trigger("error");
    } finally {
      unlinkingProvider = null;
      providerToUnlink = null;
    }
  }

  // Cancel unlinking
  function cancelUnlinkProvider() {
    providerToUnlink = null;
  }

  function dismissError() {
    errorMessage = null;
  }

  // Email linking drawer functions
  function openEmailLinkingDrawer() {
    showEmailLinkingDrawer = true;
    hapticService?.trigger("selection");
  }

  function handleEmailLinkingSuccess() {
    // The drawer handles closing itself
    // We just need to show feedback if needed
    hapticService?.trigger("success");
  }

  // Check if email is verified
  const isEmailVerified = $derived(authState.user?.emailVerified ?? false);
</script>

<div class="connected-accounts">
  {#if errorMessage}
    <div class="error-banner" role="alert">
      <span>{errorMessage}</span>
      <button
        type="button"
        class="dismiss-btn"
        onclick={dismissError}
        aria-label={t("nav_ui_dismiss_account_connection_error")}
      >
        <i class="fas fa-times" aria-hidden="true"></i>
      </button>
    </div>
  {/if}

  <div class="providers-list">
    {#each linkedProviders as providerId}
      {@const config = PROVIDERS[providerId]}
      {@const isUnlinking = unlinkingProvider === providerId}
      <ProviderStatusRow
        {providerId}
        name={config.name}
        detail={getLinkedProviderDetail(providerId)}
        accent={config.color}
        status={!managing
          ? t("nav_ui_connected")
          : canUnlink
            ? undefined
            : t("nav_ui_required")}
        statusTone="connected"
        actionLabel={managing && canUnlink ? t("nav_ui_disconnect") : undefined}
        actionAriaLabel={managing && canUnlink
          ? t("nav_provider_disconnect", { provider: config.name })
          : undefined}
        busyLabel={t("nav_ui_disconnecting")}
        busy={isUnlinking}
        disabled={unlinkingProvider !== null && !isUnlinking}
        onAction={managing && canUnlink
          ? () => requestUnlinkProvider(providerId)
          : undefined}
      />
    {/each}

    {#each availableProviders as providerId}
      {@const config = PROVIDERS[providerId]}
      {@const isLinking = linkingProvider === providerId}
      <ProviderStatusRow
        {providerId}
        name={config.name}
        detail={getAvailableProviderDetail(providerId)}
        accent={config.color}
        status={managing ? undefined : t("train_filter_available")}
        statusTone="neutral"
        actionLabel={managing ? t("module_connect") : undefined}
        actionAriaLabel={managing
          ? t("nav_provider_connect", { provider: config.name })
          : undefined}
        busyLabel={t("connect_connecting")}
        busy={isLinking}
        disabled={linkingProvider !== null && !isLinking}
        onAction={managing
          ? () =>
              providerId === "password"
                ? openEmailLinkingDrawer()
                : linkProvider(providerId)
          : undefined}
      />
    {/each}
  </div>

  {#if managing && !canUnlink && linkedProviderIds.length === 1}
    <p class="hint">
      {t("nav_ui_connect_another_sign_in_method_before_disconnecting_this_one")}
    </p>
  {/if}
</div>

<!-- Email Linking Drawer -->
<EmailLinkingDrawer
  bind:isOpen={showEmailLinkingDrawer}
  onSuccess={handleEmailLinkingSuccess}
/>

<!-- Unlink Confirmation Dialog -->
{#if providerToUnlink}
  {@const config = PROVIDERS[providerToUnlink]}
  <ConfirmDialog
    bind:isOpen={showUnlinkConfirm}
    title={t("nav_provider_disconnect_title", { provider: config.name })}
    message={t("nav_provider_disconnect_message", { provider: config.name })}
    confirmText={t("nav_ui_disconnect")}
    cancelText={t("nav_ui_keep_connected")}
    variant="warning"
    confirmDelay={5}
    onConfirm={confirmUnlinkProvider}
    onCancel={cancelUnlinkProvider}
  />
{/if}

<style>
  .connected-accounts {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .error-banner {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: var(--min-touch-target, 44px);
    padding: 0.625rem 0.75rem;
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 12%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--semantic-error, #ef4444) 28%, transparent);
    border-radius: 0.625rem;
    color: var(--semantic-error, #ef4444);
    font-size: var(--font-size-min, 0.875rem);
  }

  .error-banner span {
    flex: 1;
  }

  .dismiss-btn {
    display: grid;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    flex: 0 0 auto;
    place-items: center;
    padding: 0;
    background: transparent;
    border: 1px solid transparent;
    color: var(--theme-text-dim);
    cursor: pointer;
    border-radius: 0.5rem;
  }

  .dismiss-btn:hover {
    color: var(--theme-text);
    background: var(--theme-card-hover-bg);
    border-color: var(--theme-stroke);
  }

  .providers-list {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .hint {
    font-size: var(--font-size-min, 0.875rem);
    color: var(--theme-text-dim);
    margin: 0;
    padding-inline: 0.25rem;
    line-height: 1.45;
  }

  .dismiss-btn:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }
</style>
