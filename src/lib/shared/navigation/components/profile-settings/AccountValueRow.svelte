<script lang="ts">
  import {
    getBaseLocale,
    getLocale,
    t,
  } from "#lib/shared/i18n/i18n.svelte.js";

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
    // German writes nouns with a capital, so the field name keeps its case there.
    editLabel = t("nav_edit_field", {
      field: getBaseLocale(getLocale()) === "de" ? label : label.toLowerCase(),
    }),
    optional = false,
    empty = false,
    onEdit,
    buttonRef = $bindable(null),
  }: Props = $props();
</script>

<!-- With an edit action the whole row is the control: a press on the label,
     the value or the pen starts editing, under one name ("Edit display name").
     The pen stays as the visible cue. -->
{#if onEdit}
  <button
    bind:this={buttonRef}
    type="button"
    class="account-value-row editable"
    onclick={onEdit}
    aria-label={editLabel}
  >
    {@render copy()}
    <span class="edit-action" aria-hidden="true">
      <i class="fas fa-pen"></i>
      <span class="edit-word">{t("tab_museum_edit")}</span>
    </span>
  </button>
{:else}
  <div class="account-value-row">
    {@render copy()}
  </div>
{/if}

{#snippet copy()}
  <span class="row-copy">
    <span class="row-label">
      {label}
      {#if optional}<span class="optional">{t("nav_ui_optional")}</span>{/if}
    </span>
    <span class="row-value" class:empty>{value}</span>
  </span>
{/snippet}

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

  .editable {
    width: 100%;
    margin: 0;
    padding-inline: 0;
    color: inherit;
    font: inherit;
    text-align: start;
    background: transparent;
    border-width: 0 0 1px;
    border-style: solid;
    border-color: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    cursor: pointer;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }

  .editable:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
    border-radius: 0.5rem;
  }

  .edit-action {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    gap: 0.5em;
    min-width: 5.25em;
    min-height: var(--min-touch-target, 44px);
    padding-inline: 0.9rem;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-min);
    font-weight: 650;
    background: color-mix(in srgb, var(--theme-text) 4%, transparent);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 0.65rem;
    transition:
      background-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard);
  }

  .editable:hover .edit-action,
  .editable:active .edit-action {
    color: var(--theme-text, #fff);
    background: color-mix(in srgb, var(--theme-text) 9%, transparent);
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

    .edit-action {
      min-width: var(--min-touch-target, 44px);
      padding-inline: 0.75rem;
    }

    .edit-word {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .edit-action {
      transition: none;
    }
  }
</style>
