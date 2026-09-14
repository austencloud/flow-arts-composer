<script lang="ts">
  import AnimationPanel from "$lib/shared/animation-panel/components/AnimationPanel.svelte";
  import { getViewerStudioSurfaces } from "$lib/shared/sequence-viewer/context/viewer-studio-surfaces-context";
  import type { ExportOptionsStateManager } from "$lib/shared/animation-panel/state/export-options-state.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { getMediaCompositionContext } from "$lib/shared/media-composition/state/media-composition-context";
  import type { ResolvedAutoLayout } from "$lib/shared/render/services/container-aware-layout";
  import ExportImagePanel from "$lib/shared/sequence-viewer/components/ExportImagePanel.svelte";
  import ArtSettingsPanel from "$lib/shared/sequence-viewer/components/ArtSettingsPanel.svelte";
  import { getPostStudioArtContext } from "./post-studio-art-context.svelte";

  let {
    sequence,
    exportOptions,
    selectedPropType,
    onPropChange,
    resolvedAutoLayout = null,
  }: {
    sequence: SequenceData;
    exportOptions: ExportOptionsStateManager;
    selectedPropType: PropType;
    onPropChange: (propType: PropType) => void;
    resolvedAutoLayout?: ResolvedAutoLayout | null;
  } = $props();

  const composition = getMediaCompositionContext();
  const shared = getViewerStudioSurfaces();
  function inspectorDestination(node: HTMLElement) {
    return { destroy: shared?.requestInspector(node) };
  }
  const selectedBinding = $derived(composition.selectedBinding);

  // The tunnel and mandala controls are the sequence viewer's, unchanged — the
  // same panel, on the same controllers the slots render from. Export is off:
  // the studio's Render button makes the post, and an "Export MP4" of one layer
  // inside it would be a second, quieter answer to the same question.
  const art = getPostStudioArtContext();
  const artType = $derived(
    selectedBinding?.renderMode === "tunnel" ? "tunnel" : "mandala"
  );
</script>

{#if selectedBinding?.renderMode === "sequence-animation"}
  <!-- Tempo and continuous/step both live in the timeline transport, next to
       the clock they belong to and visible from every inspector page. Showing
       either here as well put one setting in two places. `playbackMode` still
       comes in so the panel's own copy reads the live value. -->
  <div
    class="animation-settings"
    use:inspectorDestination
    data-studio-inspector-destination
  >
    {#if !shared?.inspectorAvailable}
      <AnimationPanel
        layout="sidebar"
        isExporting={false}
        isPlaying={composition.isPlaying}
        bpm={composition.tempoBpm ?? 60}
        onPlaybackToggle={composition.togglePlayback}
        onBpmChange={composition.tempoBpm === null
          ? undefined
          : composition.setTempoBpm}
        showTempoControls={false}
        playbackMode={composition.animationPlaybackMode}
        showEffectsPlayback={false}
        {selectedPropType}
        {onPropChange}
      />
    {/if}
  </div>
{:else if selectedBinding?.renderMode === "choreo-card" && !shared?.externalInspectorTarget}
  <div class="card-settings">
    <ExportImagePanel
      {exportOptions}
      layout="inline"
      stepCount={sequence.steps.length}
      {resolvedAutoLayout}
    />
  </div>
{:else if selectedBinding?.renderMode === "tunnel" || selectedBinding?.renderMode === "mandala"}
  <div class="art-settings">
    <ArtSettingsPanel
      {artType}
      controller={art.tunnel}
      mandalaController={art.mandala}
      layout="sidebar"
      onExport={() => {}}
      showExport={false}
      showTitle={false}
      bpm={composition.tempoBpm ?? 60}
      isPlaying={composition.isPlaying}
      onBpmChange={composition.tempoBpm === null
        ? undefined
        : composition.setTempoBpm}
      onPlaybackToggle={composition.togglePlayback}
      leftPropType={selectedPropType}
      {onPropChange}
    />
  </div>
{/if}

<style>
  /* No border, no card background. The inspector rail already separates itself
     from the canvas with its own border-left and panel background, so a card
     inside it was a box drawn inside a box — the same controls the 2D animation
     view presents flat against the rail. The two are the same AnimationPanel
     and now read as the same system. */
  .animation-settings {
    container-name: post-studio-animation-settings;
    container-type: inline-size;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .animation-settings :global(.export-panel.sidebar) {
    background: transparent;
  }

  /* Same reasoning as .animation-settings — the rail is the surface. */
  .card-settings {
    height: 100%;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .card-settings :global(.export-panel.inline) {
    background: transparent;
  }

  .art-settings {
    height: 100%;
    min-height: 0;
    display: flex;
  }

  /* The viewer's art panel is a fixed-width card because it sits in a right
     rail beside the art. Here it IS the rail, so it takes the whole inspector
     column and drops the clamp that would otherwise cap it at 420px in a
     region three times that wide at 4K. */
  .art-settings :global(.art-settings-panel) {
    width: 100%;
    min-width: 0;
    flex: 1;
  }

  /* Same centering the animation panel needed releasing: the shared section
     sets `margin: auto 0`, which floats the controls in the middle of the rail
     — 76px of nothing above the first control and the same below it. A property
     panel starts at the top. */
  .art-settings :global(.panel-center-inner) {
    max-width: none;
    margin-block: 0;
    align-self: stretch;
  }

  .art-settings :global(.icon-rail) {
    justify-content: flex-start;
  }

  /* The studio chrome steps up at 105rem / 180rem (PostStudio.svelte), but the
     embedded sequence-viewer panels size themselves from the global type and
     touch-target tokens, so at 4K the rails grew and their contents stayed at
     12px / 44px. Redefining the tokens on the wrapper carries the step through
     every chip, label and row inside without forking the shared panel CSS. */
  @container post-studio (min-width: 105rem) {
    .card-settings,
    .art-settings {
      --font-size-compact: 0.8125rem;
      --font-size-min: 0.9375rem;
      --min-touch-target: 3rem;
    }
  }

  @container post-studio (min-width: 180rem) {
    .card-settings,
    .art-settings {
      --font-size-compact: 1.0625rem;
      --font-size-min: 1.25rem;
      --min-touch-target: 3.75rem;
    }
  }
</style>
