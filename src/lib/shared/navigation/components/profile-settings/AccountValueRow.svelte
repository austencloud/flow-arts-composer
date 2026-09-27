<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";

  interface Props {
    label: string;
    value: string;
    editLabel?: string;
    optional?: boolean;
    empty?: boolean;
    onEdit?: () => void;
    buttonRef?: HTMLButtonElement | null;
  }

  let {
    label,
    value,
    editLabel = `Edit ${label.toLowerCase()}`,
    optional = false,
    empty = false,
    onEdit,
    buttonRef = $bindable(null),
  }: Props = $props();
</script>

<div class="account-value-row">
  <span class="row-copy">
    <span class="row-label">
      {label}
      {#if optional}<span class="optional">{t("nav_ui_optional")}</span>{/if}
    </span>
    <span class="row-value" class:empty>{value}</span>
  </span>

  {#if onEdit}
    <span class="edit-action">
      <PanelButton
        bind:ref={buttonRef}
        variant="secondary"
        onclick={onEdit}
        ariaLabel={editLabel}
      >
        <i class="fas fa-pen" aria-hidden="true"></i>
        <span>{t("tab_museum_edit")}</span>
      </PanelButton>
    </span>
  {/if}
</div>

<style>
  .account-value-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    flex: 1 1 auto;
    align-items: center;
    gap: 1em;
    min-height: 5em;
    padding: 0.75em 0;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
  }

  .row-copy {
    display: grid;
    grid-template-columns: minmax(7em, 0.72fr) minmax(0, 1.28fr);
    min-width: 0;
    align-items: center;
    gap: 1em;
  }

  .row-label {
    display: flex;
    align-items: baseline;
    gap: 0.5em;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
    font-size: max(0.875rem, var(--font-size-min));
    font-weight: 600;
  }

  .optional {
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 500;
  }

  .row-value {
    overflow: hidden;
    color: var(--theme-text, #fff);
    font-size: max(1rem, var(--font-size-base));
    font-weight: 650;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .row-value.empty {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
    font-weight: 500;
  }

  .edit-action {
    flex: 0 0 auto;
  }

  .edit-action :global(.panel-btn) {
    min-width: 5.25em;
    border-color: var(--theme-stroke);
    color: var(--theme-text-dim);
    background: color-mix(in srgb, var(--theme-text) 4%, transparent);
    box-shadow: none;
  }

  .edit-action :global(.panel-btn:hover:not(:disabled)) {
    border-color: var(--theme-stroke-strong);
    color: var(--theme-text);
    background: color-mix(in srgb, var(--theme-text) 8%, transparent);
  }

  @container profile-tab (max-width: 28rem) {
    .account-value-row {
      align-items: flex-start;
    }

    .row-copy {
      grid-template-columns: minmax(0, 1fr);
      gap: 0.2rem;
    }

    .row-value {
      white-space: normal;
      overflow-wrap: anywhere;
    }

    .edit-action :global(.panel-btn) {
      min-width: var(--min-touch-target, 44px);
      padding-inline: 0.75rem;
    }

    .edit-action :global(.panel-btn span) {
      display: none;
    }
  }
</style>
