<!--
  SettingsSubpage — the frame for a settings page opened from inside another
  tab (Keyboard shortcuts, Release notes): the back control, then one panel
  the same as Preferences, opened by the shared header band.

  The panel fills the tab's height and never grows past it, so the page
  itself does not scroll; the page's own list or lists scroll inside the
  body. Rows inside can use --settings-row-inline to line up with the band.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import SettingsSectionHeader from "./SettingsSectionHeader.svelte";

  interface Props {
    /** Font Awesome classes for the band's icon tile. */
    icon: string;
    title: string;
    description?: string;
    headingId: string;
    /** Label of the tab the back control returns to. */
    backLabel?: string;
    onBack?: () => void;
    action?: Snippet;
    /** Controls under the band (search, filters); a hairline sets them off. */
    toolbar?: Snippet;
    children: Snippet;
  }

  let {
    icon,
    title,
    description,
    headingId,
    backLabel,
    onBack,
    action,
    toolbar,
    children,
  }: Props = $props();
</script>

<div class="settings-subpage">
  {#if onBack}
    <button
      type="button"
      class="subpage-back"
      onclick={onBack}
      aria-label={t("action_go_back")}
    >
      <i class="fas fa-chevron-left" aria-hidden="true"></i>
      {backLabel}
    </button>
  {/if}

  <section class="subpage-panel" aria-labelledby={headingId}>
    <SettingsSectionHeader {icon} {title} {description} {headingId} {action} />

    {#if toolbar}
      <div class="subpage-toolbar">
        {@render toolbar()}
      </div>
    {/if}

    <div class="subpage-body">
      {@render children()}
    </div>
  </section>
</div>

<style>
  .settings-subpage {
    container: settings-subpage / inline-size;
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    gap: 0.75em;
    width: 100%;
    min-width: 0;
    min-height: 0;
    padding: clamp(0.75em, 1.4cqi, 1.75em) clamp(0.75em, 2cqi, 3em);
  }

  /* Starts at the panel's left edge, however wide the tab is. */
  .subpage-back {
    display: inline-flex;
    flex: 0 0 auto;
    align-self: flex-start;
    align-items: center;
    gap: 0.5rem;
    min-height: var(--min-touch-target, 44px);
    margin-inline-start: max(0px, calc((100% - 84rem) / 2));
    padding: 0.5rem 0.85rem;
    border: 1px solid var(--theme-stroke-strong, var(--theme-stroke));
    border-radius: 999px;
    color: var(--theme-text);
    background: var(--theme-panel-bg);
    font: inherit;
    font-size: max(0.875rem, var(--font-size-min));
    cursor: pointer;
    transition: background var(--duration-fast) ease;
  }

  .subpage-back:hover {
    background: var(--theme-card-hover-bg);
  }

  .subpage-back:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .subpage-panel {
    --settings-row-inline: 1.15em;
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    width: 100%;
    max-width: 84rem;
    min-width: 0;
    min-height: 0;
    margin-inline: auto;
    overflow: hidden;
    border: 1px solid var(--theme-stroke-strong, var(--theme-stroke));
    border-radius: 1.25em;
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, rgba(0, 0, 0, 0.88)) 14%,
      #070b10 86%
    );
    box-shadow: var(--theme-panel-shadow, 0 1rem 3rem rgba(0, 0, 0, 0.35));
    isolation: isolate;
  }

  :global(html[data-theme-luminance="bright"]) .subpage-panel {
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, rgba(255, 255, 255, 0.88)) 14%,
      #f6f7f9 86%
    );
  }

  .subpage-panel > :global(.section-header) {
    flex: 0 0 auto;
  }

  .subpage-toolbar {
    flex: 0 0 auto;
    min-width: 0;
    padding: 0.8em var(--settings-row-inline);
    border-bottom: 1px solid var(--theme-stroke);
    background: color-mix(in srgb, var(--theme-text) 2%, transparent);
  }

  .subpage-body {
    display: flex;
    flex: 1 1 0;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  @container settings-subpage (min-width: 105rem) {
    .subpage-panel {
      --settings-row-inline: 1.35em;
    }
  }

  @container settings-subpage (max-width: 32rem) {
    .settings-subpage {
      padding-inline: 0.65rem;
    }

    .subpage-panel {
      --settings-row-inline: 0.9rem;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .subpage-back {
      transition: none;
    }
  }

  @media (prefers-contrast: more) {
    .subpage-panel {
      border-width: 2px;
    }
  }
</style>
