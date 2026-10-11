<!-- Notification topic group: a heading followed by switch rows. Framed, it is
     a card of its own (Pulse); unframed, it is one section of a settings panel
     and takes its row padding from --settings-row-inline. -->
<script lang="ts">
  import type { NotificationPreferences } from "#lib/shared/feedback/domain/models/notification-models.js";
  import PreferenceItemCard from "./PreferenceItemCard.svelte";
  import type { PreferenceItem } from "./preference-item";

  interface Props {
    title: string;
    description: string;
    icon?: string;
    items: PreferenceItem[];
    preferences: NotificationPreferences;
    isBusyKey: (key: keyof NotificationPreferences) => boolean;
    onToggle: (key: keyof NotificationPreferences) => void;
    disabled?: boolean;
    framed?: boolean;
  }

  let {
    title,
    description,
    icon = "fa-bell",
    items,
    preferences,
    isBusyKey,
    onToggle,
    disabled = false,
    framed = true,
  }: Props = $props();
</script>

<section class="preference-group" class:flush={!framed}>
  <header class="group-header">
    <span class="group-icon" aria-hidden="true">
      <i class={`fas ${icon}`}></i>
    </span>
    <span class="group-heading">
      <h3>{title}</h3>
      <p>{description}</p>
    </span>
  </header>

  <div class="preference-items">
    {#each items as item (item.key)}
      <PreferenceItemCard
        label={item.label}
        description={item.description}
        enabled={preferences[item.key]}
        isBusy={isBusyKey(item.key)}
        {disabled}
        surface="plain"
        onToggle={() => onToggle(item.key)}
      />
    {/each}
  </div>
</section>

<style>
  .preference-group {
    container: preference-group / inline-size;
    min-width: 0;
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: 0.9em;
    background: var(--theme-card-bg);
  }

  .group-header {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    gap: 0.75em;
    min-height: 4.25em;
    padding: 0.75em 1em;
    border-bottom: 1px solid var(--theme-stroke);
    background: color-mix(in srgb, var(--theme-text) 3%, transparent);
  }

  .group-icon {
    display: grid;
    width: 2.35em;
    height: 2.35em;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--theme-accent) 22%, transparent);
    border-radius: 0.65em;
    color: var(--theme-accent-text, var(--theme-accent));
    background: color-mix(in srgb, var(--theme-accent) 11%, transparent);
  }

  .group-heading {
    min-width: 0;
  }

  .group-heading h3,
  .group-heading p {
    margin: 0;
  }

  .group-heading h3 {
    color: var(--theme-text);
    font-size: max(0.9375rem, var(--font-size-base));
    font-weight: 725;
    line-height: 1.25;
  }

  .group-heading p {
    margin-top: 0.15em;
    color: var(--theme-text-dim);
    font-size: max(0.75rem, var(--font-size-compact));
    line-height: 1.35;
  }

  .preference-items {
    display: flex;
    min-width: 0;
    flex-direction: column;
  }

  .preference-items :global(.setting-toggle + .setting-toggle) {
    border-top: 1px solid var(--theme-stroke);
  }

  /* Unframed: no card; a hairline above every group but the first, a quieter
     heading than the panel's section bands, and rows aligned with the panel. */
  .preference-group.flush {
    overflow: visible;
    border: 0;
    border-radius: 0;
    background: none;
  }

  .preference-group.flush:not(:first-of-type) {
    border-top: 1px solid var(--theme-stroke);
  }

  .flush .group-header {
    min-height: 0;
    padding: 1em var(--settings-row-inline, 1.15em) 0.4em;
    border-bottom: 0;
    background: none;
  }

  .flush .group-icon {
    width: 2em;
    height: 2em;
    border-radius: 0.55em;
  }

  .flush .preference-items :global(.setting-toggle) {
    padding-inline: var(--settings-row-inline, 1.15em);
  }

  @media (prefers-contrast: more) {
    .preference-group {
      border-width: 2px;
    }
  }
</style>
