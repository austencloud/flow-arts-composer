<script lang="ts">
  import type { Snippet } from "svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import DualSourceCrossfade from "$lib/shared/components/DualSourceCrossfade.svelte";
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
  }: {
    sequence: SequenceData | null;
    onSequenceChange?: (sequence: SequenceData) => void;
    leftPropType?: PropType;
    rightPropType?: PropType;
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

<section class="composer-practice" aria-label="Try Composer">
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
    <DualSourceCrossfade
      active={mode === "build" ? "first" : "second"}
      first={buildPanel}
      second={generatePanel}
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
    min-width: 0;
  }

  .practice-stage {
    height: clamp(34rem, 42cqw, 42rem);
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
