<!--
  Settings → Display: the card section. The shared ChoreoCard of the example
  loop, drawn from the same composition, image-theme and pictograph managers
  the viewer's card panel writes, with CardContentToggles (the switches that
  panel shows) under it.

  Columns, the start lane and the info-cell choice are stored per step count,
  so a length chooser (4 · 8 · 16) decides which card the switches edit and
  shows the multi-cell case. It is a view choice, not a preference: it is not
  stored.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import ChoreoCard from "#lib/shared/sequence-viewer/components/ChoreoCard.svelte";
  import ChoreoCardContextMenuHost from "#lib/shared/sequence-viewer/components/choreo-card-context-menu/ChoreoCardContextMenuHost.svelte";
  import CardContentToggles from "#lib/shared/share/components/CardContentToggles.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { getImageCompositionManager } from "#lib/shared/share/state/image-composition-state.svelte.js";
  import {
    CARD_VISIBILITY_KEYS,
    getVisibilityStateManager,
  } from "#lib/shared/pictograph/shared/state/visibility-state.svelte.js";
  import {
    DEFAULT_IMAGE_OPTIONS,
    getExportOptionsState,
  } from "#lib/shared/animation-panel/state/export-options-state.svelte.js";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { PUBLIC_SITE_URL } from "#lib/shared/browse/navigation/browse-route-resolver.js";
  import type { ResolvedAutoLayout } from "#lib/shared/render/services/container-aware-layout.js";
  import DisplaySection from "./DisplaySection.svelte";
  import {
    CARD_LENGTHS,
    type CardLength,
    type DisplayExample,
  } from "./display-example-data";

  let {
    example,
    onBack,
  }: { example: DisplayExample | null; onBack?: () => void } = $props();

  const composition = getImageCompositionManager();
  const exportOptions = getExportOptionsState();
  const vm = getVisibilityStateManager();

  let length = $state<CardLength>(4);
  const sequence = $derived(example?.cards[length] ?? null);
  // The live card reports the grid Auto picked, which decides its info cells.
  let autoLayout = $state<ResolvedAutoLayout | null>(null);

  let version = $state(0);
  onMount(() => {
    const bump = () => version++;
    composition.registerObserver(bump);
    return () => composition.unregisterObserver(bump);
  });

  const card = $derived.by(() => {
    void version;
    return {
      showWord: composition.addWord,
      showStepNumbers: composition.addStepNumbers,
      showDifficultyLevel: composition.addDifficultyLevel,
      showLoopGlyph: composition.showLoopGlyph,
      includeStartPlacement: composition.includeStartPlacement,
      // Same gate as the card panel: guests cannot mint a scannable QR.
      showQRCode: composition.showQRCode && authState.isAuthenticated,
      showMandala: composition.showMandala,
    };
  });

  /** What the card shows goes back to its defaults: the card's own switches,
   *  its theme, and the two pictograph-manager marks only a card draws. */
  function reset(): void {
    composition.resetDisplayDefaults();
    exportOptions.setImageDarkMode(DEFAULT_IMAGE_OPTIONS.darkMode);
    vm.resetKeysToDefaults(CARD_VISIBILITY_KEYS);
  }

  const lengthOptions = CARD_LENGTHS.map((value) => ({
    value: String(value),
    label: String(value),
  }));

  // The example has no record of its own. Without a link the card would mint
  // a real short code for it (a database write) on every visit, so its QR
  // points at the site instead.
  const exampleQrUrl = PUBLIC_SITE_URL;

  let menuHost: ChoreoCardContextMenuHost | undefined = $state();
  const uid = $props.id();
</script>

<DisplaySection
  kind="card"
  icon="fas fa-id-card"
  title={t("settings_display_card")}
  caption={t("settings_display_card_caption")}
  onReset={reset}
  {onBack}
>
  {#snippet stage()}
    {#if sequence}
      <div class="card-stage">
        <ChoreoCard
          {sequence}
          {...card}
          darkMode={exportOptions.imageDarkMode}
          forceContain
          qrUrl={exampleQrUrl}
          onAutoLayoutResolved={(layout) => (autoLayout = layout)}
          onContextMenu={(x, y) => menuHost?.openContextMenu(x, y)}
        />
      </div>
    {/if}
  {/snippet}
  {#snippet controls()}
    <CardContentToggles stepCount={length} resolvedAutoLayout={autoLayout}>
      {#snippet lead()}
        <span class="group-label" id="{uid}-length"
          >{t("settings_display_card_length")}</span
        >
        <SegmentedControl
          options={lengthOptions}
          value={String(length)}
          onchange={(value) => (length = Number(value) as CardLength)}
          color="accent"
          ariaLabelledby="{uid}-length"
        />
      {/snippet}
    </CardContentToggles>
  {/snippet}
</DisplaySection>

<ChoreoCardContextMenuHost
  bind:this={menuHost}
  stepCount={length}
  isExportMode
  {exportOptions}
/>

<style>
  /* The card picks its column count from this box, so the box is pinned to
     the frame rather than sized by the card it holds. */
  .card-stage {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: 0.5rem;
  }

  .group-label {
    color: var(--theme-text-dim);
    font-size: var(--font-size-xs, 0.75rem);
    font-weight: 600;
    text-align: center;
  }

  /* One frame for all three lengths, so a length change never moves the
     switches; each card contains itself in it and crossfades its own
     content. The shape is measured against the three cards (see the spec's
     audit revision). */
  :global([data-display-section="card"]) {
    --stage-ratio: 1.2;
    --stage-max-w: 22rem;
  }
</style>
