<script lang="ts">
  import type { Snippet } from "svelte";
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import BentoPropGrid from "#lib/shared/settings/components/tabs/prop-type/BentoPropGrid.svelte";
  import PropCompositionPreview from "#lib/shared/pictograph/prop/components/PropCompositionPreview.svelte";
  import { getPropTypeDisplayInfo } from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";
  import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { FanAppearance } from "#lib/shared/pictograph/prop/domain/fan-appearance.js";
  import type { PropLook } from "#lib/shared/pictograph/prop/domain/prop-look.js";
  import type { PropChiralitySeam } from "#lib/shared/settings/components/tabs/prop-type/prop-chirality-seam.js";
  import type { ViewerCustomColorPair } from "#lib/shared/sequence-viewer/domain/viewer-custom-colors.js";

  let {
    open,
    selectedPropType,
    onSelect,
    onOpenChange,
    preview,
    fanAppearance,
    onFanAppearanceChange,
    propLook,
    onPropLookChange,
    chirality,
    primaryPropColors,
    onPrimaryPropColorsChange,
  }: {
    open: boolean;
    selectedPropType: PropType;
    onSelect: (prop: PropType, look?: PropLook) => void;
    onOpenChange: (open: boolean) => void;
    preview: Snippet;
    fanAppearance: FanAppearance;
    onFanAppearanceChange: (appearance: FanAppearance) => void;
    propLook: PropLook;
    onPropLookChange: (look: PropLook) => void;
    chirality: PropChiralitySeam;
    primaryPropColors: ViewerCustomColorPair | null;
    onPrimaryPropColorsChange: (colors: ViewerCustomColorPair | null) => void;
  } = $props();

  const propName = $derived(getPropTypeDisplayInfo(selectedPropType).label);
</script>

<BaseModal
  {open}
  size="xl"
  class="composer-prop-modal"
  labelledBy="composer-prop-picker-title"
  onclose={() => onOpenChange(false)}
>
  {#snippet header()}
    <div class="picker-header">
      <div class="picker-heading">
        <h2 id="composer-prop-picker-title">Choose your props</h2>
        <p>See each choice in the live sequence.</p>
      </div>
      <div class="picker-header-actions">
        <button
          class="picker-close"
          type="button"
          aria-label="Close prop chooser"
          onclick={() => onOpenChange(false)}
        >
          <i class="fas fa-xmark" aria-hidden="true"></i>
        </button>
      </div>
    </div>
  {/snippet}

  <div class="picker-workspace">
    <section class="picker-preview" aria-label="Selected prop preview">
      <div class="preview-stage">{@render preview()}</div>
      <div class="preview-identity">
        <PropCompositionPreview
          propType={selectedPropType}
          size={48}
          useSavedOverrides={false}
          colors={primaryPropColors}
        />
        <div>
          <span class="preview-eyebrow">Now playing</span>
          <strong>{propName}</strong>
        </div>
      </div>
    </section>

    <section class="picker-catalog" aria-label="Prop catalog">
      <BentoPropGrid
        {selectedPropType}
        variant="inline"
        flat
        tileDensity="comfortable"
        scrollMode="internal"
        fill={false}
        compactColors
        {primaryPropColors}
        {onPrimaryPropColorsChange}
        isActive={open}
        {fanAppearance}
        {onFanAppearanceChange}
        {propLook}
        {onPropLookChange}
        {chirality}
        {onSelect}
      />
    </section>
  </div>
</BaseModal>

<style>
  :global(dialog.base-modal.composer-prop-modal) {
    width: min(1120px, calc(100vw - 32px));
    height: min(780px, calc(100dvh - 32px));
    max-height: calc(100dvh - 32px);
    background: var(--theme-panel-bg, #171820);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
  }

  :global(dialog.composer-prop-modal .modal-body) {
    display: flex;
    overflow: hidden;
  }

  .picker-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1.15rem 1.4rem;
    border-bottom: 1px solid var(--theme-stroke);
  }

  .picker-heading h2 {
    margin: 0;
    color: var(--theme-text);
    font-size: clamp(1.35rem, 2vw, 1.75rem);
    line-height: 1.2;
  }

  .picker-heading p {
    margin: 0.25rem 0 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 0.875rem);
  }

  .picker-header-actions {
    display: flex;
    align-items: center;
    gap: 0.65rem;
    flex-shrink: 0;
  }

  .picker-close {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border: 1px solid var(--theme-stroke);
    border-radius: 10px;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    font: inherit;
    cursor: pointer;
  }

  .picker-close:hover,
  .picker-close:focus-visible {
    background: var(--theme-hover-bg, var(--theme-card-bg));
    outline-color: var(--theme-accent);
  }

  .picker-workspace {
    display: grid;
    grid-template-columns: minmax(15rem, 0.85fr) minmax(0, 1.7fr);
    flex: 1;
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  .picker-preview {
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 1rem;
    min-width: 0;
    min-height: 0;
    padding: clamp(1rem, 2.5vw, 2rem);
    border-right: 1px solid var(--theme-stroke);
    background: var(--theme-card-bg);
  }

  .preview-stage {
    width: min(100%, 19rem, 46dvh);
    aspect-ratio: 1;
    align-self: center;
    --hero-demo-max-width: 100%;
    --hero-demo-wide-max-width: 100%;
  }

  .preview-stage :global(.hero-demo) {
    margin: 0;
  }

  .preview-stage :global(figcaption) {
    display: none;
  }

  .preview-stage :global(.demo-stage) {
    border-radius: 14px;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .preview-identity {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    min-height: 3.5rem;
    color: var(--theme-text);
  }

  .preview-identity > div {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .preview-eyebrow {
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 0.875rem);
  }

  .preview-identity strong {
    font-size: 1.2rem;
    line-height: 1.2;
  }

  .picker-catalog {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    padding: 0.8rem;
  }

  .picker-catalog :global(.prop-grid-root) {
    flex: 1;
    min-height: 0;
  }

  .picker-catalog :global(.flat-grid.comfortable:not(.fill)) {
    grid-template-columns: repeat(auto-fit, minmax(8.75rem, 1fr));
    gap: 0.8rem;
  }

  .picker-catalog :global(.flat-grid.comfortable .prop-button) {
    min-height: 8rem;
  }

  .picker-catalog :global(.prop-selection-button .prop-label),
  .picker-catalog :global(.prop-selection-button.selected .prop-label) {
    color: var(--theme-text);
    opacity: 1;
  }

  @media (max-width: 700px) {
    :global(dialog.base-modal.composer-prop-modal) {
      width: 100%;
      height: 100dvh;
      max-height: 100dvh;
      margin: 0;
      border: 0;
      border-radius: 0;
    }

    .picker-header {
      padding: 0.75rem 1rem;
    }

    .picker-heading p {
      display: none;
    }

    .picker-workspace {
      grid-template-columns: 1fr;
      grid-template-rows: auto minmax(0, 1fr);
    }

    .picker-preview {
      flex-direction: row;
      justify-content: flex-start;
      align-items: center;
      gap: 1rem;
      padding: 0.75rem 1rem;
      border-right: 0;
      border-bottom: 1px solid var(--theme-stroke);
    }

    .preview-stage {
      width: clamp(10rem, 44vw, 11rem);
      flex: 0 0 auto;
    }

    .preview-identity {
      justify-content: flex-start;
      min-width: 0;
    }

    .preview-identity > :global(.prop-composition-preview) {
      display: none;
    }

    .picker-catalog {
      padding: 0.4rem;
    }

    .picker-catalog :global(.flat-grid.comfortable:not(.fill)) {
      grid-template-columns: repeat(auto-fit, minmax(8rem, 1fr));
      gap: 0.6rem;
    }
  }

  @media (max-width: 700px) and (max-height: 500px) {
    .preview-stage {
      width: min(7.5rem, 28dvh);
    }
  }
</style>
