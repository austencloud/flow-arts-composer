<!--
  SettingsSectionHeader — the header band that opens each section of a
  settings workspace panel (Account, Preferences): icon tile, title, optional
  description and an optional action on the right.

  Narrow and wide tweaks follow the nearest size container, which is the
  settings tab itself.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    /** Font Awesome classes for the icon tile, e.g. "fas fa-user". */
    icon: string;
    title: string;
    description?: string;
    /** Id for the heading, so the section can be labelled by it. */
    headingId?: string;
    /** Rich description, e.g. a Crossfade when the text follows a switch. */
    details?: Snippet;
    action?: Snippet;
  }

  let { icon, title, description, headingId, details, action }: Props =
    $props();
</script>

<header class="section-header" class:title-only={!description && !details}>
  <span class="section-icon"><i class={icon} aria-hidden="true"></i></span>
  <span class="section-heading">
    <h2 id={headingId}>{title}</h2>
    {#if details}
      <div class="section-details">{@render details()}</div>
    {:else if description}
      <p>{description}</p>
    {/if}
  </span>
  {#if action}
    <span class="section-action">{@render action()}</span>
  {/if}
</header>

<style>
  .section-header {
    display: flex;
    align-items: center;
    gap: 0.75em;
    min-height: 4.5em;
    padding: 0.85em 1.15em;
    border-bottom: 1px solid var(--theme-stroke);
    background: color-mix(in srgb, var(--theme-text) 3%, transparent);
  }

  .section-heading {
    flex: 1 1 auto;
    min-width: 0;
  }

  .section-action {
    flex: 0 0 auto;
  }

  .section-action :global(.panel-btn) {
    min-width: 7.25em;
  }

  .section-icon {
    display: grid;
    width: 2.5em;
    height: 2.5em;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 0.7em;
    color: var(--theme-accent-text, var(--theme-accent));
    background: color-mix(in srgb, var(--theme-accent) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--theme-accent) 22%, transparent);
  }

  h2,
  p {
    margin: 0;
  }

  h2 {
    color: var(--theme-text);
    font-size: max(1.125rem, var(--font-size-lg));
    font-weight: 750;
    line-height: 1.25;
  }

  p,
  .section-details {
    margin-top: 0.2em;
    color: var(--theme-text-dim);
    font-size: max(0.875rem, var(--font-size-min));
    line-height: 1.35;
  }

  @container (min-width: 105rem) {
    .section-header {
      min-height: 4.75em;
      padding: 0.95em 1.35em;
    }
  }

  @container (max-width: 32rem) {
    .section-header {
      align-items: flex-start;
      min-height: 0;
      padding: 0.9rem;
    }

    .section-header.title-only {
      align-items: center;
    }

    .section-action :global(.panel-btn) {
      min-width: var(--min-touch-target, 44px);
      padding-inline: 0.75rem;
    }

    .section-action :global(.panel-btn span) {
      display: none;
    }
  }
</style>
