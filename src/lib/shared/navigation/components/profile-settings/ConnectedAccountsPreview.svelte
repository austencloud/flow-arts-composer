<!--
  ConnectedAccountsPreview Component

  Read-only display of a user's connected OAuth providers.
  Used in admin preview mode to view another user's linked accounts.
-->
<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { PreviewAuthProvider } from "../../../debug/state/user-preview-state.svelte";
  import { PROVIDERS, type ProviderId } from "./connected-accounts.providers";
  import ProviderStatusRow from "./ProviderStatusRow.svelte";

  interface Props {
    providers?: PreviewAuthProvider[];
    emailVerified?: boolean;
    loading?: boolean;
  }

  let {
    providers = [],
    emailVerified = false,
    loading = false,
  }: Props = $props();

  // Map Firebase provider IDs to our config
  function getProviderConfig(providerId: string) {
    return PROVIDERS[providerId as ProviderId] ?? null;
  }
</script>

<div class="connected-accounts-preview" aria-busy={loading}>
  {#if loading}
    <div class="loading-state">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      <span>{t("nav_ui_loading_sign_in_methods")}</span>
    </div>
  {:else if providers.length > 0}
    <div class="providers-list">
      {#each providers as provider}
        {@const config = getProviderConfig(provider.providerId)}
        {@const emailNeedsVerification =
          provider.providerId === "password" && !emailVerified}
        <ProviderStatusRow
          providerId={provider.providerId}
          name={config?.name ?? provider.providerId}
          detail={provider.email ?? t("nav_ui_connected")}
          accent={config?.color ?? "#9ca3af"}
          status={emailNeedsVerification
            ? t("nav_ui_not_verified")
            : t("nav_ui_connected")}
          statusTone={emailNeedsVerification ? "warning" : "connected"}
        />
      {/each}
    </div>
  {:else}
    <div class="empty-state">
      <i class="fas fa-unlink" aria-hidden="true"></i>
      <p>{t("nav_ui_no_sign_in_methods_found")}</p>
    </div>
  {/if}
</div>

<style>
  .connected-accounts-preview {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .loading-state {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.625rem;
    min-height: 5rem;
    padding: 1rem;
    color: var(--theme-text-dim);
    font-size: var(--font-size-sm);
  }

  .loading-state i {
    font-size: var(--font-size-lg);
    color: var(--theme-accent);
  }

  .providers-list {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    min-height: 6rem;
    padding: 1.25rem 1rem;
    color: var(--theme-text-dim);
  }

  .empty-state i {
    font-size: var(--font-size-3xl);
    opacity: 0.5;
  }

  .empty-state p {
    margin: 0;
    font-size: var(--font-size-sm);
  }
</style>
