<!--
  Settings → Display: the card stage. The shared ChoreoCard of one example
  loop, drawn from the same composition and image-theme managers the viewer's
  card panel writes. The card section's stage and the tab's drill-down box
  thumbnail both mount it, so the thumbnail follows every switch (its theme
  included) the section flips.

  The card picks its column count from this box, so the box is pinned to its
  frame rather than sized by the card it holds.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import ChoreoCard from "#lib/shared/sequence-viewer/components/ChoreoCard.svelte";
  import { getImageCompositionManager } from "#lib/shared/share/state/image-composition-state.svelte.js";
  import { getExportOptionsState } from "#lib/shared/animation-panel/state/export-options-state.svelte.js";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { PUBLIC_SITE_URL } from "#lib/shared/browse/navigation/browse-route-resolver.js";
  import type { ResolvedAutoLayout } from "#lib/shared/render/services/container-aware-layout.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

  let {
    sequence,
    onAutoLayoutResolved,
    onContextMenu,
  }: {
    sequence: SequenceData;
    onAutoLayoutResolved?: (layout: ResolvedAutoLayout) => void;
    onContextMenu?: (x: number, y: number) => void;
  } = $props();

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

  // The example has no record of its own. Without a link the card would mint
  // a real short code for it (a database write) on every visit, so its QR
  // points at the site instead.
  const exampleQrUrl = PUBLIC_SITE_URL;
</script>

<div class="card-stage">
  <ChoreoCard
    {sequence}
    {...card}
    darkMode={exportOptions.imageDarkMode}
    forceContain
    qrUrl={exampleQrUrl}
    {onAutoLayoutResolved}
    {onContextMenu}
  />
</div>

<style>
  .card-stage {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    padding: var(--card-stage-pad, 0.5rem);
  }
</style>
