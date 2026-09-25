<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import FacebookIcon from "$lib/shared/auth/components/icons/FacebookIcon.svelte";
  import GoogleIcon from "$lib/shared/auth/components/icons/GoogleIcon.svelte";
  import InstagramIcon from "$lib/shared/auth/components/icons/InstagramIcon.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";

  interface Props {
    providerId: string;
    name: string;
    detail: string;
    accent?: string;
    status?: string;
    statusTone?: "connected" | "warning" | "neutral";
    actionLabel?: string;
    actionAriaLabel?: string;
    busyLabel?: string;
    busy?: boolean;
    disabled?: boolean;
    onAction?: () => void;
  }

  let {
    providerId,
    name,
    detail,
    accent = "var(--theme-accent)",
    status,
    statusTone = "neutral",
    actionLabel,
    actionAriaLabel,
    busyLabel,
    busy = false,
    disabled = false,
    onAction,
  }: Props = $props();

  const visibleActionLabel = $derived(
    busy ? (busyLabel ?? t("nav_ui_working")) : actionLabel
  );
</script>

<div class="provider-row" style:--provider-color={accent}>
  <span class="provider-mark" aria-hidden="true">
    {#if providerId === "google.com"}
      <GoogleIcon />
    {:else if providerId === "facebook.com"}
      <FacebookIcon />
    {:else if providerId === "instagram.com"}
      <InstagramIcon />
    {:else if providerId === "password"}
      <i class="fas fa-envelope"></i>
    {:else}
      <i class="fas fa-plug"></i>
    {/if}
  </span>

  <span class="provider-copy">
    <span class="provider-name">{name}</span>
    <span class="provider-detail" title={detail}>{detail}</span>
  </span>

  {#if actionLabel && onAction}
    <span class="provider-action">
      <PanelButton
        variant="secondary"
        onclick={onAction}
        disabled={disabled || busy}
        ariaBusy={busy}
        ariaLabel={actionAriaLabel ?? actionLabel}
      >
        {#if busy}<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>{/if}
        <span>{visibleActionLabel}</span>
      </PanelButton>
    </span>
  {:else if status}
    <span class="provider-status {statusTone}">
      {#if statusTone === "connected"}
        <i class="fas fa-check-circle" aria-hidden="true"></i>
      {:else if statusTone === "warning"}
        <i class="fas fa-circle-exclamation" aria-hidden="true"></i>
      {/if}
      <span>{status}</span>
    </span>
  {/if}
</div>

<style>
  .provider-row {
    display: grid;
    grid-template-columns: 2.5em minmax(0, 1fr) 9.25em;
    align-items: center;
    gap: 0.75em;
    min-height: 4.25em;
    padding: 0.65em 0;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .provider-mark {
    display: grid;
    width: 2.5em;
    height: 2.5em;
    place-items: center;
    color: var(--provider-color);
    background: color-mix(in srgb, var(--provider-color) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--provider-color) 24%, transparent);
    border-radius: 0.65em;
  }

  .provider-mark :global(svg),
  .provider-mark i {
    width: 1.25em;
    height: 1.25em;
    font-size: 1.1em;
  }

  .provider-copy {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 0.15em;
  }

  .provider-name {
    color: var(--theme-text, #fff);
    font-size: max(0.875rem, var(--font-size-sm));
    font-weight: 700;
  }

  .provider-detail {
    overflow: hidden;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
    font-size: max(0.75rem, var(--font-size-compact));
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .provider-action {
    display: flex;
    min-width: 9.25em;
    justify-content: flex-end;
  }

  .provider-action :global(.panel-btn) {
    min-width: 7.75em;
  }

  .provider-status {
    display: inline-flex;
    min-width: 9.25em;
    align-items: center;
    justify-content: flex-end;
    gap: 0.4em;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 650;
    white-space: nowrap;
  }

  .provider-status.connected {
    color: var(--semantic-success, #22c55e);
  }

  .provider-status.warning {
    color: var(--semantic-warning, #f59e0b);
  }

  @container profile-tab (max-width: 32rem) {
    .provider-row {
      grid-template-columns: 2.75rem minmax(0, 1fr);
    }

    .provider-action,
    .provider-status {
      grid-column: 2;
      min-width: 0;
      justify-self: start;
      justify-content: flex-start;
    }

    .provider-detail {
      white-space: normal;
      overflow-wrap: anywhere;
    }
  }
</style>
