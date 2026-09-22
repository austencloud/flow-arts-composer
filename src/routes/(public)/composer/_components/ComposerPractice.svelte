<script lang="ts">
  import type { Snippet } from "svelte";
  import PanelGroup, {
    type PanelDefinition,
  } from "$lib/shared/panels/PanelGroup.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import DualSourceCrossfade from "$lib/shared/components/DualSourceCrossfade.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import ConstructSection from "../_sections/ConstructSection.svelte";
  import ComposerGenerateDemo from "./ComposerGenerateDemo.svelte";

  type PracticeMode = "build" | "generate";

  let {
    sequence,
    onSequenceChange,
    leftPropType,
    rightPropType,
    propControl,
    inlinePropPicker,
    onOpenProps,
  }: {
    sequence: SequenceData | null;
    onSequenceChange?: (sequence: SequenceData) => void;
    leftPropType?: PropType;
    rightPropType?: PropType;
    propControl?: Snippet;
    inlinePropPicker?: Snippet;
    onOpenProps?: () => void;
  } = $props();

  let mode = $state<PracticeMode>("build");
  let practiceWidth = $state(0);
  const options = [
    {
      value: "build" as const,
      label: "Build",
      id: "composer-practice-build-tab",
      controls: "composer-practice-build-panel",
    },
    {
      value: "generate" as const,
      label: "Generate",
      id: "composer-practice-generate-tab",
      controls: "composer-practice-generate-panel",
    },
  ];

  const workspacePanels = $derived<PanelDefinition[]>(
    inlinePropPicker && practiceWidth > 896
      ? [
          { id: "result", content: practiceResult, defaultSize: 1 },
          {
            id: "props",
            content: practiceProps,
            fixedSize: "min(22rem, 36%)",
            minSize: 240,
            maxSize: 352,
            resizable: false,
          },
        ]
      : [{ id: "result", content: practiceResult, defaultSize: 1 }]
  );
</script>

{#snippet buildPanel()}
  <div
    id="composer-practice-build-panel"
    class="practice-panel"
    role="tabpanel"
    aria-labelledby="composer-practice-build-tab"
  >
    <ConstructSection
      presentationMode="guided-build"
      active={mode === "build"}
      {leftPropType}
      {rightPropType}
      onVisitorComposed={onSequenceChange}
    />
  </div>
{/snippet}

{#snippet generatePanel()}
  <div
    id="composer-practice-generate-panel"
    class="practice-panel"
    role="tabpanel"
    aria-labelledby="composer-practice-generate-tab"
  >
    <ComposerGenerateDemo
      {sequence}
      active={mode === "generate"}
      {leftPropType}
      {rightPropType}
      onGenerated={onSequenceChange}
    />
  </div>
{/snippet}

{#snippet practiceResult()}
  <div class="practice-result">
    <DualSourceCrossfade
      active={mode === "build" ? "first" : "second"}
      first={buildPanel}
      second={generatePanel}
    />
  </div>
{/snippet}

{#snippet practiceProps()}
  <aside
    class="practice-inline-props"
    aria-label="Props for the practice result"
  >
    {@render inlinePropPicker?.()}
  </aside>
{/snippet}

<section
  class="composer-practice"
  aria-label="Try Composer"
  bind:clientWidth={practiceWidth}
>
  <div class="practice-toolbar">
    <SegmentedControl
      {options}
      value={mode}
      onchange={(next) => (mode = next)}
      color="accent"
      semantics="tabs"
      ariaLabel="Composer practice mode"
    />
    {#if propControl}
      <div class="prop-control">{@render propControl()}</div>
    {/if}
    {#if onOpenProps && !inlinePropPicker}
      <div class="desktop-prop-control">
        <PanelButton onclick={onOpenProps}>Choose props</PanelButton>
      </div>
    {/if}
  </div>

  <div class="practice-stage">
    <PanelGroup
      direction="horizontal"
      panels={workspacePanels}
      flattened={workspacePanels.length === 1}
      gap={16}
    />
  </div>
</section>

<style>
  .practice-panel {
    height: 100%;
    min-height: 0;
  }

  .composer-practice {
    container-type: inline-size;
    display: grid;
    gap: 1rem;
  }

  .practice-toolbar {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    gap: 0.75rem;
  }

  .practice-toolbar :global(.segmented-control) {
    width: min(100%, 22rem);
  }

  .prop-control {
    display: none;
    min-width: 0;
  }

  .practice-stage {
    display: flex;
    height: clamp(34rem, 42cqw, 42rem);
    min-height: 0;
  }

  .practice-result,
  .practice-inline-props {
    min-width: 0;
    min-height: 0;
  }

  @media (max-width: 895.98px) {
    .desktop-prop-control {
      display: none;
    }
  }

  @container (max-width: 69rem) {
    .practice-stage {
      height: clamp(52rem, 110cqw, 62rem);
    }
  }

  @container (max-width: 56rem) {
    .practice-stage {
      height: clamp(52rem, 170cqw, 74rem);
    }

    .practice-inline-props {
      display: none;
    }

    .prop-control {
      display: block;
    }

    .desktop-prop-control {
      display: none;
    }
  }

  @container (max-width: 42rem) {
    .practice-toolbar {
      align-items: stretch;
      flex-direction: column;
    }

    .practice-toolbar :global(.segmented-control),
    .prop-control {
      width: 100%;
    }
  }
</style>
