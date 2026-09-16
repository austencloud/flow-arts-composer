<!--
  GalleryWorkspace dispatches the active gallery editor. GalleryDrill owns
  navigation and filter behavior; each editor owns its presentation and local
  state; GalleryWorkspaceFrame owns the responsive rules shared by all editors.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import GalleryWorkspaceFrame from "./GalleryWorkspaceFrame.svelte";
  import GalleryChooserEditor from "./value-editors/GalleryChooserEditor.svelte";
  import GalleryCollectionEditor from "./value-editors/GalleryCollectionEditor.svelte";
  import GalleryCreatorEditor from "./value-editors/GalleryCreatorEditor.svelte";
  import GalleryFamilyEditor from "./value-editors/GalleryFamilyEditor.svelte";
  import GalleryGridModeEditor from "./value-editors/GalleryGridModeEditor.svelte";
  import GalleryLengthEditor from "./value-editors/GalleryLengthEditor.svelte";
  import GalleryLetterEditor from "./value-editors/GalleryLetterEditor.svelte";
  import GalleryLevelEditor from "./value-editors/GalleryLevelEditor.svelte";
  import GalleryLoopEditor from "./value-editors/GalleryLoopEditor.svelte";
  import GalleryMaxTurnEditor from "./value-editors/GalleryMaxTurnEditor.svelte";
  import GalleryPlacementEditor from "./value-editors/GalleryPlacementEditor.svelte";
  import GalleryPerformanceEditor from "./value-editors/GalleryPerformanceEditor.svelte";
  import type { GalleryWorkspaceProps } from "./gallery-workspace-types";

  let {
    catalog,
    section,
    drillWidth,
    sheet,
    splitPane = false,
    unifiedFilterChooser,
    adaptiveValueLayout,
    persistentDesktopCatalog,
    chooserTitle,
    chooserHint,
    stackHint,
    isValueApplied,
    activeLoopValues,
    onToggleLoop,
    loopConnective,
    onLoopConnectiveChange,
    activeFamilyValues,
    onToggleFamily,
    familyConnective,
    onFamilyConnectiveChange,
    onBack,
    onPickValue,
    onPickExclusiveValue,
    onPickLoop,
    onPickFamily,
    onApply,
    onSelectCategory,
  }: GalleryWorkspaceProps = $props();
</script>

{#snippet valueHead(title: string, hint?: string, trailing?: Snippet)}
  <!-- Back lives IN the screen header (same spot on every value screen, part
       of the crossfading layer) — a persistent bar above the stage burned
       ~44px on the chooser where Back doesn't exist. A screen's own control
       (Match any / Match all) rides the same row rather than floating centred
       below it, so the header reads as one band. -->
  <header class="drill-head with-back">
    <button
      class="head-back"
      type="button"
      onclick={onBack}
      aria-label={unifiedFilterChooser
        ? "Back to filters"
        : "Back to browse options"}
    >
      <i class="fas fa-arrow-left" aria-hidden="true"></i>
      <!-- Icon-only reads as an anonymous circle when the wide stage strands
           it far from the title — the label makes it unmistakably a button. -->
      <span class="head-back-label">Back</span>
    </button>
    <h2 tabindex="-1">{title}</h2>
    {#if hint}<p>{hint}</p>{/if}
    {#if trailing}
      <div class="head-trailing">{@render trailing()}</div>
    {/if}
  </header>
{/snippet}

<GalleryWorkspaceFrame
  {section}
  {sheet}
  {splitPane}
  {unifiedFilterChooser}
  {adaptiveValueLayout}
  {persistentDesktopCatalog}
>
  {#if section === "chooser"}
    <GalleryChooserEditor
      {catalog}
      {section}
      {sheet}
      {chooserTitle}
      {chooserHint}
      {onSelectCategory}
    />
  {:else if section === "level"}
    <GalleryLevelEditor
      {catalog}
      {drillWidth}
      {splitPane}
      {adaptiveValueLayout}
      {stackHint}
      {isValueApplied}
      {onPickValue}
      {valueHead}
    />
  {:else if section === "length"}
    <GalleryLengthEditor
      {catalog}
      {stackHint}
      {isValueApplied}
      {onPickValue}
      {valueHead}
    />
  {:else if section === "max_turn_intensity"}
    <GalleryMaxTurnEditor
      {catalog}
      {section}
      {adaptiveValueLayout}
      {isValueApplied}
      {onPickExclusiveValue}
      {onApply}
      {valueHead}
    />
  {:else if section === "letter"}
    <GalleryLetterEditor
      {catalog}
      {drillWidth}
      {adaptiveValueLayout}
      {stackHint}
      {isValueApplied}
      {onPickValue}
      {valueHead}
    />
  {:else if section === "placement"}
    <GalleryPlacementEditor
      {catalog}
      {stackHint}
      {isValueApplied}
      {onPickValue}
      {valueHead}
    />
  {:else if section === "author"}
    <GalleryCreatorEditor
      {catalog}
      {drillWidth}
      {splitPane}
      {adaptiveValueLayout}
      {stackHint}
      {isValueApplied}
      {onPickValue}
      {valueHead}
    />
  {:else if section === "gridmode"}
    <GalleryGridModeEditor
      {catalog}
      {stackHint}
      {isValueApplied}
      {onPickValue}
      {valueHead}
    />
  {:else if section === "performance"}
    <GalleryPerformanceEditor
      {catalog}
      {stackHint}
      {isValueApplied}
      {onPickValue}
      {valueHead}
    />
  {:else if section === "loop"}
    <GalleryLoopEditor
      {catalog}
      {activeLoopValues}
      {onToggleLoop}
      {loopConnective}
      {onLoopConnectiveChange}
      {onPickLoop}
      {valueHead}
    />
  {:else if section === "collection"}
    <GalleryCollectionEditor
      {catalog}
      {stackHint}
      {isValueApplied}
      {onPickValue}
      {valueHead}
    />
  {:else if section === "family"}
    <GalleryFamilyEditor
      {catalog}
      {activeFamilyValues}
      {onToggleFamily}
      {familyConnective}
      {onFamilyConnectiveChange}
      {onPickFamily}
      {valueHead}
    />
  {/if}
</GalleryWorkspaceFrame>
