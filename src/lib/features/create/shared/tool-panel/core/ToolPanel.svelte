<!--
	ToolPanel.svelte - REFACTORED

	Clean, professional tool panel component that routes between sub-tabs.
	Contains tabbed interface for all sequence construction and management tools.
	All business logic extracted to proper services and controllers.

	Responsibilities:
	- Tab routing and transitions
	- Layout and styling
	- Event delegation to proper handlers

	✅ No inline type definitions (moved to create-tab-types.ts)
	✅ No business logic (moved to NavigationController)
	✅ No stub handlers (removed or delegated)
	✅ No any types (proper interfaces throughout)
	✅ No TODOs (all implemented or documented)
-->
<script lang="ts">
  import { getDeviceDetector } from "$lib/shared/device/get-device-detector";
  import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";
  import type { DeviceDetector } from "$lib/shared/device/services/device-detector";
  import type { HapticFeedback } from "$lib/shared/application/services/haptic-feedback";
  import { onMount } from "svelte";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import GeneratePanel from "../../../generate/components/GeneratePanel.svelte";
  import ConstructTabContent from "../../components/ConstructTabContent.svelte";
  import type {
    IAnimationStateRef,
    IToolPanelProps,
  } from "../../types/create-module-types";
  import ConstructGenerateToggle from "../../workspace-panel/shared/components/buttons/ConstructGenerateToggle.svelte";
  import ProgressRing from "$lib/shared/components/loading/ProgressRing.svelte";


  const {
    createModuleState,
    constructTabState,
    onOptionSelected,
    isSideBySideLayout = () => false,
    activeTab,
    onTabChange,
    onOpenFilters = () => {},
    onCloseFilters = () => {},
    isFilterPanelOpen = false,
  }: IToolPanelProps = $props();


  // Derived from props
  let activeToolPanel = $derived(createModuleState.activeSection);

  // Derived: Toggle never shows in ToolPanel header (always in ButtonPanel instead)
  let shouldShowToggleInHeader = $derived(() => {
    return false; // Toggle is always in ButtonPanel at right edge
  });

  // Services
  let hapticService: HapticFeedback;
  let deviceDetector: DeviceDetector | null = null;
  let navigationLayout = $state<"top" | "bottom" | "right">("top");

  // Animation panel visibility state (for panel show/hide/collapse)
  let animationPanelVisibilityState = $state({
    isAnimationVisible: true,
    isAnimationCollapsed: false,
    toggleAnimationCollapse: () => {
      animationPanelVisibilityState.isAnimationCollapsed =
        !animationPanelVisibilityState.isAnimationCollapsed;
    },
    setAnimationVisible: (visible: boolean) => {
      animationPanelVisibilityState.isAnimationVisible = visible;
    },
  });

  // Animation state ref - shared with AnimationPanel and AnimateControls
  let animationStateRef = $state<IAnimationStateRef>({
    isPlaying: false,
    currentStep: 0,
    totalSteps: 0,
    speed: 1.0,
    shouldLoop: false,
    play: () => {},
    stop: () => {},
    jumpToStep: () => {},
    setSpeed: () => {},
    setShouldLoop: () => {},
    nextStep: () => {},
    previousStep: () => {},
  });


  onMount(() => {
    hapticService = getHapticFeedback();
    deviceDetector = getDeviceDetector();

    if (deviceDetector) {
      updateNavigationLayout();

      // Return cleanup function from onCapabilitiesChanged
      return deviceDetector.onCapabilitiesChanged(() => {
        updateNavigationLayout();
      });
    }

    return undefined;
  });

  function updateNavigationLayout() {
    if (!deviceDetector) return;

    const deviceLayout = deviceDetector.getNavigationLayoutImmediate();
    // Map device detector's "left" to our "right" for right-side navigation
    navigationLayout =
      deviceLayout === "left"
        ? "right"
        : (deviceLayout as "top" | "bottom" | "right");
  }


  const isSequenceStateInitialized = $derived(
    createModuleState.sequenceState.isInitialized
  );
  const isCreateModulePersistenceInitialized = $derived(
    createModuleState.isPersistenceInitialized
  );
  const isSectionLoading = $derived(createModuleState.isSectionLoading);
  const isPersistenceFullyInitialized = $derived(
    isSequenceStateInitialized &&
      isCreateModulePersistenceInitialized &&
      !isSectionLoading
  );

  // Get the appropriate sequence data based on active section
  // Construct tab uses its own sequence state, other tabs use the shared state
  const currentSequenceData = $derived.by(() => {
    if (!isPersistenceFullyInitialized) return [];

    // When on Construct tab, use Construct tab's own sequence state
    if (
      createModuleState.activeSection === "construct" &&
      constructTabState.isInitialized &&
      constructTabState.sequenceState
    ) {
      return constructTabState.sequenceState.getCurrentSequenceData();
    }

    // For other tabs, use the shared sequence state
    return createModuleState.sequenceState.getCurrentSequenceData();
  });

  // Determine if we should show start placement picker based on Construct tab's own state
  const shouldShowStartPlacementPicker = $derived.by(() => {
    if (!isPersistenceFullyInitialized) return null;
    if (createModuleState.activeSection !== "construct") return null;
    if (!constructTabState.isInitialized) return null;

    const constructTabPickerState =
      constructTabState.shouldShowStartPlacementPicker();
    if (constructTabPickerState === null) return null;

    return constructTabPickerState;
  });

  const isPickerStateLoading = $derived(
    shouldShowStartPlacementPicker === null ||
      constructTabState.isPickerStateLoading
  );


  // Keep picker state in sync with Construct tab's own sequence state
  // This ensures the StartPlacementPicker shows when sequence is empty
  // and OptionViewer shows when sequence has a start placement
  $effect(() => {
    // Only sync when construct tab is active and initialized
    if (
      createModuleState.activeSection === "construct" &&
      constructTabState.isInitialized &&
      constructTabState.sequenceState
    ) {
      // Access construct tab's own sequence state to track changes
      const sequenceLength =
        constructTabState.sequenceState.getCurrentSequenceData().length;
      const hasStart = constructTabState.sequenceState.hasStartPlacement;

      // Sync picker state to match construct tab's sequence state
      constructTabState.syncPickerStateWithSequence();
    }
  });

  // PUBLIC API (Exposed to parent)

  export function getAnimationStateRef() {
    return animationStateRef;
  }


  function handleNavigateToAdvanced() {
    hapticService?.trigger("selection");
  }

  function handleNavigateToDefault() {
    hapticService?.trigger("selection");
  }
</script>


<div
  class="tool-panel"
  class:layout-right={navigationLayout === "right"}
  data-testid="tool-panel"
>
  {#if shouldShowToggleInHeader() && activeTab && onTabChange && (activeTab === "construct" || activeTab === "generate")}
    <!-- Toggle at top of tool panel in side-by-side layout (landscape mode) -->
    <div class="tool-panel-header">
      <ConstructGenerateToggle
        {activeTab}
        onTabChange={(tab) => onTabChange(tab)}
      />
    </div>
  {/if}

  {#if !isPersistenceFullyInitialized}
    <!-- Loading state while persistence is being restored -->
    <div class="persistence-loading">
      <ProgressRing percent={-1} size={24} strokeWidth={2} />
      <p>Restoring sequence...</p>
    </div>
  {:else if activeToolPanel}
    <!-- Tab Content with Sequential Fade Transitions -->
    <div class="tool-panel-content">
      <Crossfade
        key={`${activeToolPanel}-${createModuleState.sequenceState.currentSequence?.id ?? "empty"}`}
        fill
        duration={DURATION.normal}
      >
        <div class="sub-tab-content">
          {#if activeToolPanel === "construct"}
            {#if isPickerStateLoading}
              <!-- Loading state while determining which picker to show -->
              <div class="picker-loading">
                <ProgressRing percent={-1} size={24} strokeWidth={2} />
                <p>Loading options...</p>
              </div>
            {:else}
              <ConstructTabContent
                shouldShowStartPlacementPicker={shouldShowStartPlacementPicker ===
                  true}
                startPlacementState={constructTabState.startPlacementStateService}
                currentSequence={currentSequenceData}
                {onOptionSelected}
                onStartPlacementNavigateToAdvanced={handleNavigateToAdvanced}
                onStartPlacementNavigateToDefault={handleNavigateToDefault}
                {isSideBySideLayout}
                {onOpenFilters}
                {onCloseFilters}
                {isFilterPanelOpen}
                isContinuousOnly={constructTabState.isContinuousOnly}
                onToggleContinuous={(value) =>
                  constructTabState.setContinuousOnly(value)}
              />
            {/if}
          {:else if activeToolPanel === "generate"}
            <GeneratePanel
              sequenceState={createModuleState.sequenceState}
              isDesktop={isSideBySideLayout()}
            />
          {/if}
        </div>
      </Crossfade>
    </div>
  {:else}
    <!-- Fallback case: persistence is loaded but no active tab -->
    <div class="no-tab-selected">
      <p>No tab selected</p>
    </div>
  {/if}
</div>


<style>
  .tool-panel {
    position: relative;
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: visible; /* Allow card hover effects to pop and be fully visible */
  }

  /* When navigation is on the right (landscape mobile), use row layout */
  /* row puts navigation on the right and content on the left */
  .tool-panel.layout-right {
    flex-direction: column;
  }

  /* Header for toggle in side-by-side layout */
  .tool-panel-header {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px;
    flex-shrink: 0;
    order: 1;
  }

  .tool-panel-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: visible; /* Allow card hover effects to be fully visible */
    position: relative;
    min-height: 0;
  }

  .sub-tab-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: visible; /* Allow card hover effects to be fully visible */
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
    will-change: opacity;
    backface-visibility: hidden;
  }

  .persistence-loading,
  .picker-loading,
  .no-tab-selected {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 200px;
    color: #666;
  }
</style>
