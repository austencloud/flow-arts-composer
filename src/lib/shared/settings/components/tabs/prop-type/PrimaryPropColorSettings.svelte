<script lang="ts">
  import LabeledColorPairPicker from "$lib/shared/ui/components/LabeledColorPairPicker.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import BaseModal from "$lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ModalHeader from "$lib/shared/foundation/ui/modal/ModalHeader.svelte";
  import PropCompositionPreview from "$lib/shared/pictograph/prop/components/PropCompositionPreview.svelte";
  import {
    resolveViewerCustomColorPair,
    type ViewerCustomColorPair,
  } from "$lib/shared/sequence-viewer/domain/viewer-custom-colors";
  import { getMotionColor } from "$lib/shared/utils/svg-color-utils";
  import { HandSide } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

  let {
    colors,
    darkMode = true,
    leftPropType,
    rightPropType,
    compact = false,
    onchange,
  }: {
    colors?: ViewerCustomColorPair | null;
    darkMode?: boolean;
    /** When both are given, the picker shows the real props in the chosen colors. */
    leftPropType?: PropType;
    rightPropType?: PropType;
    /** A color-pair button that opens the full editor outside a short picker. */
    compact?: boolean;
    onchange: (colors: ViewerCustomColorPair | null) => void;
  } = $props();

  let editorOpen = $state(false);
  const modalTitleId = $props.id();

  const palette = $derived(
    resolveViewerCustomColorPair(colors, {
      left: getMotionColor(HandSide.LEFT, darkMode ? "dark" : "light"),
      right: getMotionColor(HandSide.RIGHT, darkMode ? "dark" : "light"),
    })
  );
</script>

{#snippet propPreview(pair: { left: string; right: string })}
  {#if leftPropType && rightPropType}
    <PropCompositionPreview
      propType={leftPropType}
      {rightPropType}
      size={96}
      pairedGlyph
      darkBackground={darkMode}
      colors={pair}
    />
  {/if}
{/snippet}

{#snippet colorEditor()}
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
      preview={leftPropType && rightPropType ? propPreview : undefined}
      onchange={(hand, value) => onchange({ ...palette, [hand]: value })}
      onswap={() =>
        onchange({ ...palette, left: palette.right, right: palette.left })}
    />
  </section>
{/snippet}

{#if compact}
  <button
    type="button"
    class="compact-color-button"
    aria-label="Edit prop colors"
    aria-haspopup="dialog"
    aria-expanded={editorOpen}
    onclick={() => (editorOpen = true)}
  >
    <span class="compact-swatches" aria-hidden="true">
      <span style:background={palette.left}></span>
      <span style:background={palette.right}></span>
    </span>
    <span>Colors</span>
  </button>
  <BaseModal
    bind:open={editorOpen}
    size="sm"
    labelledBy={modalTitleId}
    onclose={() => (editorOpen = false)}
  >
    {#snippet header()}
      <ModalHeader
        title="Prop colors"
        id={modalTitleId}
        onClose={() => (editorOpen = false)}
      />
    {/snippet}
    <div class="modal-color-editor">{@render colorEditor()}</div>
  </BaseModal>
{:else}
  {@render colorEditor()}
{/if}

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
  .compact-color-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: var(--min-touch-target, 44px);
    padding: 6px 12px;
    border: 1px solid var(--theme-stroke);
    border-radius: 100px;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font: inherit;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
  }
  .compact-color-button:hover,
  .compact-color-button[aria-expanded="true"] {
    border-color: var(--theme-stroke-strong);
    background: var(--theme-card-hover-bg);
  }
  .compact-color-button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }
  .compact-swatches {
    display: flex;
    align-items: center;
    padding-left: 4px;
  }
  .compact-swatches span {
    display: block;
    width: 18px;
    height: 18px;
    margin-left: -4px;
    border: 1px solid var(--theme-panel-bg);
    border-radius: 50%;
  }
  .modal-color-editor {
    max-height: min(70dvh, 620px);
    overflow-y: auto;
    padding: 12px 16px 20px;
  }
</style>
