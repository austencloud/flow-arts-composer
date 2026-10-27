<!--
  Settings → Display: the card section. The shared ChoreoCard of the four-step
  example, drawn from the same composition and image-theme managers the viewer's
  card panel writes, with CardContentToggles (the switches that panel shows)
  under it.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import ChoreoCard from "#lib/shared/sequence-viewer/components/ChoreoCard.svelte";
  import ChoreoCardContextMenuHost from "#lib/shared/sequence-viewer/components/choreo-card-context-menu/ChoreoCardContextMenuHost.svelte";
  import CardContentToggles from "#lib/shared/share/components/CardContentToggles.svelte";
  import { getImageCompositionManager } from "#lib/shared/share/state/image-composition-state.svelte.js";
  import {
    DEFAULT_IMAGE_OPTIONS,
    getExportOptionsState,
  } from "#lib/shared/animation-panel/state/export-options-state.svelte.js";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { PUBLIC_SITE_URL } from "#lib/shared/browse/navigation/browse-route-resolver.js";
  import DisplaySection from "./DisplaySection.svelte";
  import type { DisplayExample } from "./display-example-data";

  let { example }: { example: DisplayExample | null } = $props();

  const composition = getImageCompositionManager();
  const exportOptions = getExportOptionsState();

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

  function reset(): void {
    composition.resetDisplayDefaults();
    exportOptions.setImageDarkMode(DEFAULT_IMAGE_OPTIONS.darkMode);
  }

  // The example has no record of its own. Without a link the card would mint
  // a real short code for it (a database write) on every visit, so its QR
  // points at the site instead.
  const exampleQrUrl = PUBLIC_SITE_URL;

  let menuHost: ChoreoCardContextMenuHost | undefined = $state();
</script>

<DisplaySection
  kind="card"
  icon="fas fa-id-card"
  title={t("settings_display_card")}
  caption={t("settings_display_card_caption")}
  onReset={reset}
>
  {#snippet stage()}
    {#if example}
      <div class="card-stage">
        <ChoreoCard
          sequence={example.sequence}
          {...card}
          darkMode={exportOptions.imageDarkMode}
          forceContain
          qrUrl={exampleQrUrl}
          onContextMenu={(x, y) => menuHost?.openContextMenu(x, y)}
        />
      </div>
    {/if}
  {/snippet}
  {#snippet controls()}
    <CardContentToggles />
  {/snippet}
</DisplaySection>

<ChoreoCardContextMenuHost
  bind:this={menuHost}
  stepCount={example?.sequence.steps.length ?? 0}
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

  /* The example card (four steps and a start) draws at about 1.2 : 1. A
     frame of that shape holds it without letterboxing, so the card is as
     large as its column allows, and on a phone its footer band stays tall
     enough for its type. */
  :global([data-display-section="card"]) {
    --stage-ratio: 1.2;
    --stage-max-w: 22rem;
  }
</style>
