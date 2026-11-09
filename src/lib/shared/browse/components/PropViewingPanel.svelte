<!--
  PropViewingPanel.svelte

  Which props sequences are drawn with: two tiles, each showing the props it
  would actually use, so the choice needs no explaining. A tap applies at
  once and the viewer behind it changes. Hosts: the viewer's dots menu and
  PropViewingControl's popover. Each host decides where "Change my props"
  leads: the phone menu drills, and a popover opens the wide prop dialog.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import {
    resolveViewingProps,
    type PropViewingMode,
  } from "#lib/shared/foundation/services/prop-viewing.js";
  import type { ResolvedPropConfig } from "#lib/shared/foundation/services/recorded-prop-intent.js";
  import PropCompositionPreview from "#lib/shared/pictograph/prop/components/PropCompositionPreview.svelte";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { localizedPropName } from "#lib/shared/settings/components/tabs/prop-type/localized-prop-name.js";
  import type { AppSettings } from "#lib/shared/settings/domain/app-settings.js";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";

  let {
    settings,
    sequence = null,
    collectionPropType = null,
    title,
    onUpdate,
    onChangeProps,
  }: {
    settings: AppSettings;
    sequence?: SequenceData | null;
    collectionPropType?: PropType | null;
    /** Names the choice for screen readers; the host shows it as a heading. */
    title: string;
    onUpdate: (patch: Partial<AppSettings>) => void | Promise<void>;
    onChangeProps: () => void;
  } = $props();

  const artSize = 72;
  const mixedArtSize = 34;
  const mixedArt = [PropType.STAFF, PropType.FAN, PropType.CLUB];

  const mine = $derived(
    resolveViewingProps(settings, sequence, collectionPropType, "my-props")
  );
  const saved = $derived(
    resolveViewingProps(settings, sequence, collectionPropType, "as-saved")
  );
  // A gallery has no one saved prop: each thumbnail uses its own.
  const eachOwn = $derived(!sequence && !collectionPropType);
  // Saved props are a standing preference, so this tile stays pickable on a
  // sequence that recorded none; that sequence simply draws with yours.
  const noneSaved = $derived(!eachOwn && saved.source === "My props");

  function pairName(config: ResolvedPropConfig): string {
    const left = localizedPropName(config.leftPropType);
    return config.leftPropType === config.rightPropType
      ? left
      : `${left} / ${localizedPropName(config.rightPropType)}`;
  }

  const mineName = $derived(pairName(mine.config));
  const savedLabel = $derived(
    saved.source === "Collection"
      ? t("browse_audit_collection")
      : t("browse_audit_as_saved")
  );
  const savedName = $derived(
    eachOwn
      ? t("browse_audit_each_sequences_own")
      : noneSaved
        ? t("browse_audit_none_saved")
        : pairName(saved.config)
  );
</script>

{#snippet art(config: ResolvedPropConfig)}
  <PropCompositionPreview
    propType={config.leftPropType}
    rightPropType={config.rightPropType}
    pairedGlyph={config.leftPropType !== config.rightPropType}
    size={artSize}
    darkBackground={settings.darkMode ?? true}
  />
{/snippet}

{#snippet optionContent(mode: PropViewingMode)}
  <span class="option">
    {#if mode === "my-props"}
      <span class="art">{@render art(mine.config)}</span>
      <span class="mode">{t("browse_audit_my_props")}</span>
      <span class="name">{mineName}</span>
    {:else}
      <span class="art" class:faded={noneSaved} class:mixed={eachOwn}>
        {#if eachOwn}
          {#each mixedArt as propType (propType)}
            <PropCompositionPreview
              {propType}
              size={mixedArtSize}
              darkBackground={settings.darkMode ?? true}
            />
          {/each}
        {:else}
          {@render art(saved.config)}
        {/if}
      </span>
      <span class="mode">{savedLabel}</span>
      <span class="name">{savedName}</span>
    {/if}
  </span>
{/snippet}

<div class="prop-viewing-panel">
  <SegmentedControl
    options={[
      {
        value: "my-props",
        label: t("browse_audit_my_props"),
        ariaLabel: `${t("browse_audit_my_props")}, ${mineName}`,
        tone: "accent",
      },
      {
        value: "as-saved",
        label: savedLabel,
        ariaLabel: `${savedLabel}, ${savedName}`,
        tone: "accent",
      },
    ]}
    value={settings.propViewingMode ?? "my-props"}
    onchange={(mode: PropViewingMode) =>
      void onUpdate({ propViewingMode: mode })}
    semantics="radiogroup"
    ariaLabel={title}
    {optionContent}
  />
  <button
    type="button"
    class="change-row"
    data-props-change
    onclick={onChangeProps}
  >
    <span class="change-label">{t("browse_audit_change_my_props")}</span>
    <i class="fas fa-chevron-right" aria-hidden="true"></i>
  </button>
</div>

<style>
  .prop-viewing-panel {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }

  /* Two tiles, not a track: each stands alone with its own edge, so the
     selected one reads by its whole surface. */
  .prop-viewing-panel :global(.segmented-control) {
    gap: 8px;
    padding: 0;
    border: none;
    background: none;
  }

  .prop-viewing-panel :global(.segment) {
    min-width: 0;
    padding: 10px 8px 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-md, 12px);
  }

  .prop-viewing-panel :global(.segment[data-selected="true"]) {
    border-color: var(--theme-accent);
    box-shadow: inset 0 0 0 1px var(--theme-accent);
  }

  .prop-viewing-panel :global(.segment-label) {
    width: 100%;
    min-width: 0;
  }

  .option {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 0;
    text-align: center;
  }

  /* Reserved, so a tile keeps its shape whichever art it shows. */
  .art {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 72px;
    margin-bottom: 8px;
  }

  .art.faded {
    opacity: 0.35;
  }

  .art.mixed {
    gap: 2px;
  }

  .mode {
    color: var(--theme-text);
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    line-height: 1.3;
  }

  .name {
    display: -webkit-box;
    max-width: 100%;
    overflow: hidden;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    font-size: var(--font-size-compact, 13px);
    font-weight: 500;
    line-height: 1.3;
    overflow-wrap: anywhere;
    text-wrap: balance;
  }

  .change-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    box-sizing: border-box;
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    padding: 0 12px;
    border: none;
    border-radius: var(--radius-sm, 8px);
    background: transparent;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    cursor: pointer;
    font: inherit;
    font-size: var(--font-size-sm, 14px);
    font-weight: 500;
    transition:
      background-color var(--duration-fast) var(--ease-standard),
      color var(--duration-fast) var(--ease-standard);
  }

  .change-row:is(:hover, :focus-visible) {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, white);
  }

  .change-row:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: -2px;
  }

  .change-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .change-row i {
    flex: 0 0 auto;
    font-size: 12px;
  }

  @media (prefers-reduced-motion: reduce) {
    .change-row {
      transition: none;
    }
  }
</style>
