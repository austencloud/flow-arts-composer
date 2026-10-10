<!-- Notification topic surface: section context followed by descriptive rows. -->
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
    layout?: "stack" | "grid-2" | "grid-3";
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
    layout = "stack",
  }: Props = $props();
</script>

<section
  class="preference-group"
  class:grid-layout={layout !== "stack"}
  class:grid-two={layout === "grid-2"}
  class:grid-three={layout === "grid-3"}
>
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
        surface={layout === "stack" ? "plain" : "card"}
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

  .preference-group:not(.grid-layout)
    .preference-items
    :global(.setting-toggle + .setting-toggle) {
    border-top: 1px solid var(--theme-stroke);
  }

  .grid-layout .preference-items {
    display: grid;
    gap: 0.6em;
    padding: 0.6em;
  }

  @container preference-group (min-width: 38rem) {
    .grid-two .preference-items {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  /* Three-across only when each column gets real room; a 3-item group can't
     drop to two columns without orphaning the last card, so it stacks below. */
  @container preference-group (min-width: 54rem) {
    .grid-three .preference-items {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (prefers-contrast: more) {
    .preference-group {
      border-width: 2px;
    }
  }
</style>
