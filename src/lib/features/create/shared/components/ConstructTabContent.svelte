<!--
  ConstructTabContent.svelte

  Pure UI component that displays StartPlacementPicker or OptionPicker
  based on the current sequence state. Receives all state and handlers as props.

  Flow: Start Placement Picker → Option Viewer

  Uses instant content swap - the workspace expansion is the "hero" animation.
-->
<script lang="ts">
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import OptionPicker from "$lib/features/create/construct/option-picker/components/OptionPicker.svelte";
  import StartPlacementPicker from "$lib/features/create/construct/start-placement-picker/components/StartPlacementPicker.svelte";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import type { SimplifiedStartPlacementState } from "$lib/shared/create/state/start-placement-state.svelte";
  import ConstructTutorialGuide from "../../construct/tutorial/components/ConstructTutorialGuide.svelte";
  import ConstructGuideEntry from "../../construct/tutorial/components/ConstructGuideEntry.svelte";
  import type { StartPlacementPath } from "../../construct/services/construct-analytics";
  import { getCreateModuleContext } from "../context/create-module-context";

  const { constructTutorialState, panelState } = getCreateModuleContext();
  // Props
  let {
    shouldShowStartPlacementPicker,
    startPlacementState,
    onOptionSelected,
    currentSequence = [],
    currentGridMode = GridMode.DIAMOND,
    initialStartPlacement = null,
    lockStartGridMode = false,
    startPlacementValidationMessage = null,
    onStartPlacementNavigateToAdvanced,
    onStartPlacementNavigateToDefault,
    isSideBySideLayout = () => false,
    onOpenFilters = () => {},
    onCloseFilters = () => {},
    isContinuousOnly = false,
    isFilterPanelOpen = false,
    onToggleContinuous = () => {},
    onStartPlacementSubmitted = () => {},
  } = $props<{
    shouldShowStartPlacementPicker: boolean;
    startPlacementState?: SimplifiedStartPlacementState | null;
    onOptionSelected: (option: PictographData) => Promise<void>;
    currentSequence?: PictographData[];
    currentGridMode?: GridMode;
    initialStartPlacement?: PictographData | null;
    lockStartGridMode?: boolean;
    startPlacementValidationMessage?: string | null;
    onStartPlacementNavigateToAdvanced?: () => void;
    onStartPlacementNavigateToDefault?: () => void;
    isSideBySideLayout?: () => boolean;
    onOpenFilters?: () => void;
    onCloseFilters?: () => void;
    isContinuousOnly?: boolean;
    isFilterPanelOpen?: boolean;
    onToggleContinuous?: (value: boolean) => void;
    onStartPlacementSubmitted?: (
      placement: PictographData,
      path: StartPlacementPath
    ) => void;
  }>();
</script>

{#snippet startPlacementHeading()}
  <ConstructGuideEntry />
{/snippet}

<div
  class="construct-tab-content"
  data-testid="construct-tab-content"
  data-picker-mode={shouldShowStartPlacementPicker
    ? "start-placement"
    : "options"}
>
  <ConstructTutorialGuide />
  <div class="content-container" inert={!!panelState.workspacePlayback}>
    <div class="construct-scroll-area transparent-scroll">
      <!-- Start placement → option picker is one continuous construct flow, so
           it transitions in place rather than cutting (crossfade-primitive.md).
           SWAP, not overlap: these two pickers share no chrome — a true
           crossfade superimposes the letter-type tabs, the α/β/γ cards and the
           guide banner on top of each other for the whole overlap, which reads
           as a broken frame rather than a transition. Sequential fade keeps one
           coherent picture on screen at every instant. -->
      <div class="picker-wrapper">
        <Crossfade
          key={shouldShowStartPlacementPicker ? "start-placement" : "options"}
          duration={DURATION.normal}
          mode="swap"
          fill
        >
          {#if shouldShowStartPlacementPicker}
            <StartPlacementPicker
              {startPlacementState}
              {initialStartPlacement}
              lockedGridMode={lockStartGridMode ? currentGridMode : undefined}
              validationMessage={startPlacementValidationMessage}
              onNavigateToAdvanced={onStartPlacementNavigateToAdvanced}
              onNavigateToDefault={onStartPlacementNavigateToDefault}
              {isSideBySideLayout}
              onPlacementSubmitted={onStartPlacementSubmitted}
              heading={startPlacementHeading}
              suppressHeading={constructTutorialState.isActive}
            />
          {:else}
            <OptionPicker
              {onOptionSelected}
              {currentSequence}
              {currentGridMode}
              {isSideBySideLayout}
              {isContinuousOnly}
              {onToggleContinuous}
            />
          {/if}
        </Crossfade>
      </div>
    </div>
  </div>
</div>

<style>
  .construct-tab-content {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    height: 100%;
    width: 100%;
    container-type: inline-size;
  }

  .content-container {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
  }

  .content-container[inert] {
    opacity: 0.45;
  }

  .construct-scroll-area {
    flex: 1;
    overflow: hidden;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .construct-scroll-area.transparent-scroll {
    background: transparent;
  }

  .picker-wrapper {
    flex: 1;
    position: relative;
    overflow: hidden;
    min-height: 0;
  }
</style>
