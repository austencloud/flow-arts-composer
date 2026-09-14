<script lang="ts">
  import LabeledColorPairPicker from "$lib/shared/ui/components/LabeledColorPairPicker.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import {
    resolveViewerCustomColorPair,
    type ViewerCustomColorPair,
  } from "$lib/shared/sequence-viewer/domain/viewer-custom-colors";
  import { getMotionColor } from "$lib/shared/utils/svg-color-utils";
  import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";

  let {
    colors,
    darkMode = true,
    onchange,
  }: {
    colors?: ViewerCustomColorPair | null;
    darkMode?: boolean;
    onchange: (colors: ViewerCustomColorPair | null) => void;
  } = $props();

  const palette = $derived(
    resolveViewerCustomColorPair(colors, {
      left: getMotionColor(HandSide.LEFT, darkMode ? "dark" : "light"),
      right: getMotionColor(HandSide.RIGHT, darkMode ? "dark" : "light"),
    })
  );
</script>

<section class="primary-colors" aria-label="Primary prop colors">
  <div class="color-heading">
    <h4>Primary prop colors</h4>
    <PanelButton disabled={!colors} onclick={() => onchange(null)}
      >Use default colors</PanelButton
    >
  </div>
  <LabeledColorPairPicker
    left={palette.left}
    right={palette.right}
    onchange={(hand, value) => onchange({ ...palette, [hand]: value })}
  />
</section>

<style>
  .primary-colors {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 8px;
    min-width: 0;
  }
  h4 {
    margin: 0;
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
  }
  .color-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
</style>
