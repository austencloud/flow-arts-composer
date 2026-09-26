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
  import type { ComposerPropAppearance } from "./composer-prop-appearance";

  type PracticeMode = "build" | "generate";

  let {
    sequence,
    onSequenceChange,
    leftPropType,
    rightPropType,
    appearance,
    propControl,
    inlinePropPicker,
    onOpenProps,
  }: {
    sequence: SequenceData | null;
    onSequenceChange?: (sequence: SequenceData) => void;
    leftPropType?: PropType;
    rightPropType?: PropType;
    appearance?: ComposerPropAppearance;
    propControl?: Snippet;
    inlinePropPicker?: Snippet<[boolean?]>;
    onOpenProps?: () => void;
  } = $props();

  let mode = $state<PracticeMode>("build");
  let practiceWidth = $state(0);
  let resultWidth = $state(0);
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
  // Construct changes from its wide two-column workspace to a stacked layout
  // at 1100px of its own container. The prop dock reduces that container while
  // the overall practice surface remains wide, so size the shared stage from
  // the result panel rather than from the outer surface.
  const needsCompactResultStage = $derived(
    resultWidth > 0 && resultWidth < 1100
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
  <div class="practice-result" bind:clientWidth={resultWidth}>
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
    {@render inlinePropPicker?.(true)}
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

  <div
    class="practice-stage"
    class:compact-result-stage={needsCompactResultStage}
  >
    <PanelGroup
      direction="horizontal"
      panels={workspacePanels}
      flattened={workspacePanels.length === 1}
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
    display: none;
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

  .practice-result,
  .practice-inline-props {
    min-width: 0;
    min-height: 0;
  }

  .practice-stage
    :global(.panel-wrapper + .resize-handle-slot + .panel-wrapper),
  .practice-stage :global(.panel-wrapper + .panel-wrapper) {
    border-left: 1px solid var(--theme-stroke);
  }

  /* This is driven by the allocated result panel, not the outer practice
     width. A 352px dock leaves a 938px constructor at a 1293px surface; the
     constructor stacks at that inner width and needs the same tall stage as a
     truly narrow practice surface. Both tabs remain mounted in this one frame. */
  .practice-stage.compact-result-stage {
    height: clamp(52rem, 90svh, 62rem);
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
