<script lang="ts">
  import type { Snippet } from "svelte";
  import PanelGroup, {
    type PanelDefinition,
  } from "$lib/shared/panels/PanelGroup.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import DualSourceCrossfade from "$lib/shared/components/DualSourceCrossfade.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import ConstructSection from "../_sections/ConstructSection.svelte";
  import ComposerGenerateDemo from "./ComposerGenerateDemo.svelte";
  import type { ComposerPropAppearance } from "./composer-prop-appearance";

  type PracticeMode = "build" | "generate";

  let {
    sequence,
    onSequenceChange,
    leftPropType,
    rightPropType,
    appearance,
    propControl,
  }: {
    sequence: SequenceData | null;
    onSequenceChange?: (sequence: SequenceData) => void;
    leftPropType?: PropType;
    rightPropType?: PropType;
    appearance?: ComposerPropAppearance;
    propControl?: Snippet;
  } = $props();

  let mode = $state<PracticeMode>("build");
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

  const workspacePanels: PanelDefinition[] = [
    { id: "result", content: practiceResult, defaultSize: 1 },
  ];
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
      embedded={true}
      {leftPropType}
      {rightPropType}
      primaryPropColors={appearance?.primaryPropColors ?? null}
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
      embedded={true}
      {leftPropType}
      {rightPropType}
      {appearance}
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

<section
  class="composer-practice"
  aria-label="Try Composer"
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
  </div>

  <div class="practice-stage">
    <PanelGroup
      direction="horizontal"
      panels={workspacePanels}
      flattened
      gap={0}
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
    display: flex;
    min-width: 0;
  }

  .practice-stage {
    display: flex;
    height: clamp(34rem, 42cqw, 42rem);
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--settings-radius-lg, 0.85rem);
    background: var(--theme-panel-bg);
  }

  .practice-result {
    min-width: 0;
    min-height: 0;
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
  }

  @container (max-width: 42rem) {
    .practice-toolbar :global(.segmented-control) {
      flex: 1 1 14rem;
      width: auto;
      max-width: 22rem;
    }

    .prop-control {
      flex: 0 0 auto;
    }
  }
</style>
