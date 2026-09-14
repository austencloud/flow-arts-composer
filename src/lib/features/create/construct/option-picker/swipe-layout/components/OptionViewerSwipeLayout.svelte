<!--
OptionViewerSwipeLayout.svelte - Horizontal swipe panel navigation

Displays option sections as swipeable panels using HorizontalSwipeContainer.
Each section becomes a full-width panel that users can swipe through.

Features:
- Horizontal panel swiping
- Panel position persistence in sessionStorage
- In-place pictograph transitions on option change
- Content area bounds for optimal sizing
-->

<script lang="ts">
  import { Collapsible, Popover } from "bits-ui";
  import type { EmblaCarouselType } from "embla-carousel";
  import type { Snippet } from "svelte";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import HorizontalSwipeContainer from "$lib/shared/foundation/ui/HorizontalSwipeContainer.svelte";
  import { runAtBackgroundPriority } from "$lib/shared/foundation/utils/background-scheduling";
  import { bootProfiler } from "$lib/shared/analytics/boot-profiler";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { flyFade } from "$lib/shared/transitions/motion";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import LetterTypeGuide from "../../components/LetterTypeGuide.svelte";
  import OptionPickerIconButton from "../../components/OptionPickerIconButton.svelte";
  import type { OrganizedSection } from "../../domain/option-picker-types";
  import {
    getLetterTypeGroupDescriptor,
    getLetterTypeGroupPresentation,
    LETTER_TYPE_GROUP_DESCRIPTORS,
    type LetterTypeGroupDescriptor,
    type LetterTypeGroupKey,
  } from "../../services/section-title-formatter";
  import OptionPicker456Group from "./OptionViewer456Group.svelte";
  import OptionViewerSection from "./OptionViewerSection.svelte";

  const {
    organizedPictographs = [],
    onPictographSelected = () => {},
    onSectionChange = () => {},
    layoutConfig,
    currentSequence = [],
    onSlotClicked,
    getContinuationIndex,
    onLetterTypeGroupSelected = () => {},
    settingsEnabled = false,
    settingsContent,
    settingsHasTurnRows = true,
    openIntoWorkspace = false,
  } = $props<{
    organizedPictographs?: OrganizedSection[];
    onPictographSelected?: (pictograph: PictographData) => void;
    onSectionChange?: (sectionIndex: number) => void;
    layoutConfig?: {
      optionsPerRow: number;
      pictographSize: number;
      spacing: number;
      containerWidth: number;
      containerHeight: number;
      gridColumns: string;
      gridGap: string;
    };
    currentSequence?: PictographData[];
    onSlotClicked?: (typeSection: string, slotIndex: number) => void;
    getContinuationIndex?: (sectionTitle: string) => number | null;
    onLetterTypeGroupSelected?: (
      group: LetterTypeGroupKey,
      source: "selector" | "carousel"
    ) => void;
    settingsEnabled?: boolean;
    settingsContent?: Snippet;
    settingsHasTurnRows?: boolean;
    openIntoWorkspace?: boolean;
  }>();

  type UtilityPanel = "settings" | "info";

  const PANEL_STORAGE_KEY = "tka-option-picker-panel";
  const componentId = $props.id();
  const defaultGroup = LETTER_TYPE_GROUP_DESCRIPTORS[0]!;
  const utilityPanelId = `${componentId}-utility-panel`;
  const settingsTriggerId = `${componentId}-settings-trigger`;
  const infoTriggerId = `${componentId}-info-trigger`;

  // Load panel position from storage (non-reactive, only read once on initialization)
  function getInitialPanelIndex(): number {
    if (typeof window !== "undefined") {
      try {
        const stored = sessionStorage.getItem(PANEL_STORAGE_KEY);
        const panelIndex = stored ? parseInt(stored, 10) : 0;
        return isNaN(panelIndex)
          ? 0
          : Math.min(
              LETTER_TYPE_GROUP_DESCRIPTORS.length - 1,
              Math.max(0, panelIndex)
            );
      } catch {
        return 0;
      }
    }
    return 0;
  }

  const initialPanelIndex = getInitialPanelIndex();

  // ===== State =====
  let contentAreaBounds = $state<{
    left: number;
    right: number;
    width: number;
  } | null>(null);
  let emblaApi = $state<EmblaCarouselType | undefined>();
  let activePanelIndex = $state(initialPanelIndex);
  let mountedPanels = $state<number[]>([initialPanelIndex]);
  let pendingPanelIndex = $state<number | null>(null);
  let pendingDirectPanelIndex: number | null = null;
  let activeUtilityPanel = $state<UtilityPanel | null>(null);
  let renderedUtilityPanel = $state<UtilityPanel>("info");
  let utilityAnchor = $state<HTMLElement | null>(null);

  // Only render section content when bounds are ready to prevent size burst
  const boundsReady = $derived(() => {
    const ready = contentAreaBounds !== null && contentAreaBounds.width > 0;
    return ready;
  });
  const activePanel = $derived(
    organizedPictographs[activePanelIndex] ?? organizedPictographs[0]
  );
  const canWarmPanels = $derived(boundsReady());

  function mountPanel(index: number) {
    if (!mountedPanels.includes(index))
      mountedPanels = [...mountedPanels, index];
  }

  function prepareForNavigation() {
    mountedPanels = organizedPictographs.map((_, index) => index);
  }

  // Give the selected pictographs a paint before preparing each hidden group.
  // Keep the slide boxes present throughout so swipe distances never change.
  $effect(() => {
    if (!canWarmPanels) return;
    const count = organizedPictographs.length;
    const finish = bootProfiler.startSpan("construct:carousel-mount", {
      panels: count,
    });
    let cancelled = false;
    let frame = 0;

    function scheduleNextPanel() {
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          bootProfiler.milestone("construct:carousel-yielded");
          runAtBackgroundPriority(() => {
            if (cancelled) return;
            const next = Array.from(
              { length: count },
              (_, index) => index
            ).find((index) => !mountedPanels.includes(index));
            if (next === undefined) {
              finish();
              return;
            }
            mountPanel(next);
            scheduleNextPanel();
          });
        });
      });
    }

    scheduleNextPanel();
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      finish("cancelled");
    };
  });

  $effect(() => {
    const api = emblaApi;
    if (!api) return;
    // A drag may cross several slides before background warming has finished.
    // Prepare them on pointer-down, before the first movement can expose one.
    api.on("pointerDown", prepareForNavigation);
    return () => {
      api.off("pointerDown", prepareForNavigation);
    };
  });
  const activeGroup = $derived(
    getLetterTypeGroupDescriptor(activePanel?.title ?? "") ?? defaultGroup
  );
  const groupPresentations = $derived(
    new Map(
      LETTER_TYPE_GROUP_DESCRIPTORS.map((group) => [
        group.key,
        getLetterTypeGroupPresentation(group, (descriptor) =>
          t(descriptor.translationKey)
        ),
      ])
    )
  );
  function getLocalizedGroupPresentation(group: LetterTypeGroupDescriptor) {
    return (
      groupPresentations.get(group.key) ??
      getLetterTypeGroupPresentation(group, (descriptor) =>
        t(descriptor.translationKey)
      )
    );
  }
  const activeGroupKey = $derived(activeGroup.key);
  const activeGroupPresentation = $derived(
    getLocalizedGroupPresentation(activeGroup)
  );
  const activeOptionCount = $derived(activePanel?.pictographs.length ?? 0);
  const utilityOpen = $derived(activeUtilityPanel !== null);
  const utilityPanelLabel = $derived(
    renderedUtilityPanel === "settings"
      ? "Option settings"
      : "Letter type guide"
  );
  const typeOptions = $derived(
    LETTER_TYPE_GROUP_DESCRIPTORS.map((group, index) => {
      const presentation = getLocalizedGroupPresentation(group);
      const optionCount =
        organizedPictographs.find(
          (section: OrganizedSection) => section.title === group.key
        )?.pictographs.length ?? 0;
      return {
        value: group.key,
        label: presentation.accessibleName,
        ariaLabel: `${presentation.accessibleName}, ${optionCount} ${
          optionCount === 1 ? "option" : "options"
        }`,
        id: `${componentId}-type-tab-${index}`,
        controls: `${componentId}-type-panel-${index}`,
      };
    })
  );

  $effect(() => {
    if (!emblaApi || pendingPanelIndex === null) return;
    emblaApi.scrollTo(pendingPanelIndex);
    pendingPanelIndex = null;
  });

  $effect(() => {
    if (!settingsEnabled && activeUtilityPanel === "settings") {
      activeUtilityPanel = null;
    }
  });

  // ===== Event Handlers =====
  function handlePanelChange(panelIndex: number) {
    mountPanel(panelIndex);
    const previousPanelIndex = activePanelIndex;
    activePanelIndex =
      organizedPictographs.length === 0
        ? 0
        : Math.min(organizedPictographs.length - 1, Math.max(0, panelIndex));

    const wasDirectSelection =
      pendingDirectPanelIndex !== null &&
      pendingDirectPanelIndex === activePanelIndex;
    if (pendingDirectPanelIndex !== null) {
      pendingDirectPanelIndex = null;
    }
    if (!wasDirectSelection && activePanelIndex !== previousPanelIndex) {
      const selectedGroup = getLetterTypeGroupDescriptor(
        organizedPictographs[activePanelIndex]?.title ?? ""
      );
      if (selectedGroup) {
        onLetterTypeGroupSelected(selectedGroup.key, "carousel");
      }
    }

    // Save panel position to sessionStorage
    if (typeof window !== "undefined") {
      try {
        sessionStorage.setItem(PANEL_STORAGE_KEY, panelIndex.toString());
      } catch (error) {
        console.error(
          "❌ Failed to save panel position to sessionStorage:",
          error
        );
      }
    }

    // Notify parent of section change for header update
    onSectionChange(panelIndex);
  }

  function handleTypeSelect(type: LetterTypeGroupKey) {
    const panelIndex = organizedPictographs.findIndex(
      (section: OrganizedSection) => section.title === type
    );
    if (panelIndex === -1) return;
    // A direct jump can expose intermediate slides along its animated path.
    prepareForNavigation();

    onLetterTypeGroupSelected(type, "selector");
    pendingDirectPanelIndex = panelIndex;
    if (emblaApi) {
      emblaApi.scrollTo(panelIndex);
    } else {
      pendingPanelIndex = panelIndex;
    }
  }

  function handleContentAreaChange(bounds: {
    left: number;
    right: number;
    width: number;
  }) {
    contentAreaBounds = bounds;
  }

  function toggleUtilityPanel(panel: UtilityPanel) {
    if (activeUtilityPanel === panel) {
      activeUtilityPanel = null;
      return;
    }

    renderedUtilityPanel = panel;
    activeUtilityPanel = panel;
  }

  function handlePopoverOpenChange(open: boolean) {
    if (!open) {
      activeUtilityPanel = null;
    }
  }

  function handleUtilityKeydown(event: KeyboardEvent) {
    if (event.key !== "Escape" || activeUtilityPanel === null) return;

    event.preventDefault();
    const triggerId =
      activeUtilityPanel === "settings" ? settingsTriggerId : infoTriggerId;
    activeUtilityPanel = null;
    requestAnimationFrame(() => document.getElementById(triggerId)?.focus());
  }
</script>

{#snippet letterTypeGroupLabel(groupKey: LetterTypeGroupKey)}
  {@const group = getLetterTypeGroupDescriptor(groupKey) ?? defaultGroup}
  {@const presentation = getLocalizedGroupPresentation(group)}
  <span class="letter-type-group-label" aria-hidden="true">
    <span class="letter-type-group-compact">
      <span class="letter-type-group-number">{group.shortLabel}</span>
      <span class="letter-type-group-palette">
        {#each presentation.paletteColors as color}
          <span
            class="letter-type-group-palette-color"
            style:background-color={color}
          ></span>
        {/each}
      </span>
    </span>
  </span>
{/snippet}

{#snippet typeNavigation()}
  <div class="type-navigation">
    <div class="type-navigation-edge">
      {#if settingsEnabled && settingsContent}
        <OptionPickerIconButton
          id={settingsTriggerId}
          icon="fa-sliders"
          density="compact"
          active={activeUtilityPanel === "settings"}
          aria-label="Option settings"
          title="Option settings"
          aria-expanded={activeUtilityPanel === "settings"}
          aria-controls={utilityPanelId}
          onclick={() => toggleUtilityPanel("settings")}
          onkeydown={handleUtilityKeydown}
        />
      {/if}
    </div>

    <div class="type-navigation-selector">
      <SegmentedControl
        options={typeOptions}
        value={activeGroupKey}
        onchange={handleTypeSelect}
        color="accent"
        size="sm"
        density="compact"
        semantics="tabs"
        ariaLabel="Letter type"
        optionContent={letterTypeGroupLabel}
      />
    </div>

    <div class="type-navigation-edge">
      <OptionPickerIconButton
        id={infoTriggerId}
        icon="fa-circle-info"
        density="compact"
        active={activeUtilityPanel === "info"}
        aria-label="Explain letter types"
        title="Letter type guide"
        aria-expanded={activeUtilityPanel === "info"}
        aria-controls={utilityPanelId}
        onclick={() => toggleUtilityPanel("info")}
        onkeydown={handleUtilityKeydown}
      />
    </div>

    <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">
      {activeGroupPresentation.accessibleName}, {activeOptionCount}
      {activeOptionCount === 1 ? "option" : "options"}
    </p>
  </div>
{/snippet}

{#snippet utilityPanelContents()}
  <div
    class="utility-stage"
    class:settings-stage={renderedUtilityPanel === "settings"}
    class:single-row-settings-stage={renderedUtilityPanel === "settings" &&
      !settingsHasTurnRows}
  >
    <Crossfade key={renderedUtilityPanel} duration={DURATION.normal} fill>
      {#if renderedUtilityPanel === "settings" && settingsContent}
        <div class="settings-panel themed-scrollbar">
          {@render settingsContent()}
        </div>
      {:else}
        <LetterTypeGuide />
      {/if}
    </Crossfade>
  </div>
{/snippet}

<div class="swipe-layout">
  <div
    class="utility-shell"
    class:expanded={utilityOpen}
    class:workspace-placement={openIntoWorkspace}
  >
    {#if openIntoWorkspace}
      <Popover.Root open={utilityOpen} onOpenChange={handlePopoverOpenChange}>
        <div class="utility-surface" bind:this={utilityAnchor}>
          {@render typeNavigation()}
        </div>

        <Popover.Portal>
          <Popover.Content
            customAnchor={utilityAnchor}
            side="top"
            align="center"
            sideOffset={0}
            avoidCollisions={false}
            forceMount
          >
            {#snippet child({ open: contentOpen, wrapperProps, props })}
              <div {...wrapperProps}>
                {#if contentOpen}
                  <div
                    {...props}
                    id={utilityPanelId}
                    class="workspace-utility-panel"
                    role="region"
                    aria-label={utilityPanelLabel}
                    onkeydown={handleUtilityKeydown}
                    transition:flyFade={{ y: 8, duration: DURATION.normal }}
                  >
                    {@render utilityPanelContents()}
                  </div>
                {/if}
              </div>
            {/snippet}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    {:else}
      <Collapsible.Root open={utilityOpen}>
        <div class="utility-surface">
          {@render typeNavigation()}

          <Collapsible.Content id={utilityPanelId}>
            {#snippet child({ props })}
              <div
                {...props}
                class="utility-disclosure"
                role="region"
                aria-label={utilityPanelLabel}
                onkeydown={handleUtilityKeydown}
              >
                {@render utilityPanelContents()}
              </div>
            {/snippet}
          </Collapsible.Content>
        </div>
      </Collapsible.Root>
    {/if}
  </div>

  <div class="carousel-area">
    <HorizontalSwipeContainer
      showIndicators={false}
      {initialPanelIndex}
      onPanelChange={handlePanelChange}
      onContentAreaChange={handleContentAreaChange}
      freezeNavigation={false}
      loop={true}
      height="100%"
      width="100%"
      preservePosition={true}
      storageKey={PANEL_STORAGE_KEY}
      bind:emblaApiRef={emblaApi}
    >
      {#each organizedPictographs as section, index (section.title)}
        <div
          id={`${componentId}-type-panel-${index}`}
          class="panel"
          data-panel-index={index}
          data-section-type={section.type || "individual"}
          role="tabpanel"
          aria-labelledby={`${componentId}-type-tab-${index}`}
          aria-hidden={index !== activePanelIndex}
          inert={index !== activePanelIndex}
          tabindex={index === activePanelIndex ? 0 : -1}
        >
          <div class="option-viewer-body">
            {#if section.pictographs.length === 0}
              <!-- Empty feedback does not need measurements, so it appears on the first frame. -->
              <div class="empty-type-group" role="status">
                <p>
                  No pictographs in {getLocalizedGroupPresentation(
                    getLetterTypeGroupDescriptor(section.title) ?? defaultGroup
                  ).accessibleName} match these settings.
                </p>
                <span
                  >Try another letter type or adjust the option settings.</span
                >
              </div>
            {:else if boundsReady() && (index === activePanelIndex || mountedPanels.includes(index))}
              <!-- Wait for bounds before rendering pictographs to prevent size burst on mobile -->
              {#if section.title === "Types 4-6" || section.type === "grouped"}
                <!-- Grouped section (Types 4-6) -->
                <OptionPicker456Group
                  pictographs={section.pictographs}
                  {onPictographSelected}
                  containerWidth={contentAreaBounds?.width ||
                    layoutConfig?.containerWidth ||
                    800}
                  containerHeight={layoutConfig?.containerHeight || 600}
                  pictographSize={layoutConfig?.pictographSize || 144}
                  gridGap={layoutConfig?.gridGap || "8px"}
                  {currentSequence}
                  {contentAreaBounds}
                />
              {:else}
                <!-- Individual section (Types 1-3) -->
                <OptionViewerSection
                  letterType={section.title}
                  pictographs={section.pictographs}
                  {onPictographSelected}
                  {layoutConfig}
                  {currentSequence}
                  {contentAreaBounds}
                  showHeader={true}
                  {onSlotClicked}
                  continuationIndex={getContinuationIndex?.(section.title) ??
                    null}
                />
              {/if}
            {/if}
          </div>
        </div>
      {/each}
    </HorizontalSwipeContainer>
  </div>
</div>

<style>
  .swipe-layout {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
  }

  .utility-shell {
    position: relative;
    z-index: 20;
    flex: 0 0 auto;
    width: min(calc(100% - 8px), 23rem);
    margin-inline: auto;
    transition: width var(--duration-emphasis, 280ms) var(--ease-out, ease-out);
  }

  .utility-shell.expanded {
    width: min(calc(100% - 8px), 36rem);
  }

  .utility-surface {
    position: relative;
  }

  .type-navigation {
    position: relative;
    display: grid;
    grid-template-columns:
      var(--min-touch-target, 44px) minmax(0, 1fr)
      var(--min-touch-target, 44px);
    align-items: center;
    justify-content: center;
    gap: 4px;
    width: 100%;
    min-height: calc(var(--min-touch-target, 44px) + 4px);
    padding: 1px;
    box-sizing: border-box;
    background-color: #12141c;
    background-image: linear-gradient(
      var(--theme-panel-bg, rgba(10, 18, 30, 0.98)),
      var(--theme-panel-bg, rgba(10, 18, 30, 0.98))
    );
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: var(--radius-lg, 12px);
    box-shadow: 0 4px 16px var(--theme-shadow, rgba(0, 0, 0, 0.26));
    transition:
      border-radius var(--duration-normal, 200ms) var(--ease-out, ease-out),
      border-color var(--duration-normal, 200ms) var(--ease-out, ease-out);
  }

  .expanded .type-navigation {
    border-bottom-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    border-radius: var(--radius-lg, 12px) var(--radius-lg, 12px) 0 0;
  }

  .workspace-placement.expanded .type-navigation {
    border-top-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    border-bottom-color: var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: 0 0 var(--radius-lg, 12px) var(--radius-lg, 12px);
  }

  .workspace-utility-panel {
    position: relative;
    z-index: var(--z-dropdown, 1000);
    box-sizing: border-box;
    width: min(
      36rem,
      calc(100vw - 8px),
      var(--bits-popover-anchor-width, 36rem),
      var(--bits-popover-content-available-width, 36rem)
    );
    max-height: min(
      21rem,
      var(--bits-popover-content-available-height, calc(100dvh - 8px))
    );
    min-height: 0;
    overflow: hidden;
    color: var(--theme-text, #ffffff);
    background-color: #12141c;
    background-image: linear-gradient(
      var(--theme-panel-bg, rgba(10, 18, 30, 0.98)),
      var(--theme-panel-bg, rgba(10, 18, 30, 0.98))
    );
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    border-bottom: 0;
    border-radius: var(--radius-xl, 16px) var(--radius-xl, 16px) 0 0;
    box-shadow:
      0 -18px 48px var(--theme-shadow, rgba(0, 0, 0, 0.48)),
      inset 0 1px 0
        color-mix(in srgb, var(--theme-accent, #22b8db) 24%, transparent);
    transform-origin: var(
      --bits-popover-content-transform-origin,
      bottom center
    );
    container-type: inline-size;
  }

  .workspace-utility-panel .utility-stage {
    height: min(
      var(--settings-utility-stage-height),
      var(--bits-popover-content-available-height, calc(100dvh - 8px))
    );
  }

  .utility-disclosure {
    position: absolute;
    top: calc(var(--min-touch-target, 44px) + 4px);
    right: 0;
    left: 0;
    z-index: 3;
    box-sizing: border-box;
    height: var(--bits-collapsible-content-height);
    overflow: hidden;
    background-color: #12141c;
    background-image: linear-gradient(
      var(--theme-panel-bg, rgba(10, 18, 30, 0.98)),
      var(--theme-panel-bg, rgba(10, 18, 30, 0.98))
    );
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    border-top: 0;
    border-radius: 0 0 var(--radius-xl, 16px) var(--radius-xl, 16px);
    box-shadow: 0 18px 48px var(--theme-shadow, rgba(0, 0, 0, 0.48));
    opacity: 1;
    transition:
      height var(--duration-emphasis, 280ms) var(--ease-out, ease-out),
      opacity var(--duration-normal, 200ms) var(--ease-out, ease-out);
  }

  .utility-disclosure[data-starting-style],
  .utility-disclosure[data-ending-style] {
    height: 0;
    opacity: 0;
  }

  .utility-stage {
    --settings-utility-stage-height: 21rem;

    width: 100%;
    height: min(var(--settings-utility-stage-height), calc(100cqh - 48px));
    min-height: 0;
    container-type: size;
    transition: height var(--duration-emphasis, 280ms) var(--ease-out, ease-out);
  }

  /* Levels 2–3 need both turn rows. This height fits the complete Level 3
     palette on a 327px phone without leaving the guide's extra reading space
     below it. */
  .utility-stage.settings-stage {
    --settings-utility-stage-height: 14.5rem;
  }

  /* Level 1 has no turn rows, so its tray hugs the Options/Level row instead
     of preserving space for controls that are not present. */
  .utility-stage.single-row-settings-stage {
    --settings-utility-stage-height: 5.5rem;
  }

  .settings-panel {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .type-navigation-edge {
    display: flex;
    width: 40px;
    height: 38px;
    align-items: center;
    justify-content: center;
  }

  .type-navigation-selector {
    width: 100%;
    min-width: 0;
  }

  .type-navigation-selector :global(.segmented-control) {
    box-sizing: border-box;
  }

  .letter-type-group-label {
    display: flex;
    min-width: 0;
    align-items: center;
    justify-content: center;
    line-height: 1.1;
  }

  .letter-type-group-compact {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    font-weight: 750;
    line-height: 1;
  }

  .letter-type-group-number {
    font-variant-numeric: tabular-nums;
  }

  .letter-type-group-palette {
    display: flex;
    width: 28px;
    height: 3px;
    overflow: hidden;
    border-radius: 999px;
    opacity: 0.58;
    transition:
      opacity var(--duration-fast),
      box-shadow var(--duration-fast);
  }

  .letter-type-group-palette-color {
    flex: 1;
    min-width: 0;
  }

  .type-navigation :global(.segmented-control.accent .indicator) {
    background: color-mix(in srgb, var(--theme-text) 14%, var(--theme-card-bg));
    box-shadow: inset 0 0 0 1px
      color-mix(in srgb, var(--theme-text) 18%, transparent);
  }

  .type-navigation :global(.segment.selected) {
    color: var(--theme-text);
  }

  :global(.segment.selected) .letter-type-group-palette {
    opacity: 1;
    box-shadow: 0 0 5px color-mix(in srgb, var(--theme-text) 24%, transparent);
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .carousel-area {
    position: relative;
    z-index: 1;
    flex: 1 1 auto;
    width: 100%;
    min-height: 0;
  }

  .panel {
    width: 100%;
    height: 100%;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
  }

  .option-viewer-body {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: center; /* Center content vertically */
    /* Dynamic offset calculated per-panel based on actual header heights */
    /* Uses CSS custom property set by applyCentering action */
    /* Removed transition to prevent layout shifts during option changes */
  }

  .empty-type-group {
    width: min(100%, 28rem);
    margin: auto;
    padding: 1rem;
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    background: var(--theme-card-bg);
    color: var(--theme-text);
    text-align: center;
  }

  .empty-type-group p {
    margin: 0 0 0.35rem;
    font-size: var(--font-size-sm);
    font-weight: 600;
  }

  .empty-type-group span {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
  }

  @container (min-width: 32rem) {
    .utility-stage {
      --settings-utility-stage-height: 14rem;
    }

    .utility-stage.settings-stage {
      --settings-utility-stage-height: 14.5rem;
    }

    .utility-stage.single-row-settings-stage {
      --settings-utility-stage-height: 5.5rem;
    }
  }

  /* Tall inline pickers have room to dedicate to the open utility tray. Short
     inline pickers layer it over the grid. Stacked phones use the workspace
     popover above the header instead of this disclosure. */
  @container (min-height: 40rem) {
    .utility-disclosure {
      position: relative;
      top: auto;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .utility-shell,
    .type-navigation,
    .utility-stage,
    .utility-disclosure,
    .workspace-utility-panel {
      transition: none;
    }
  }
</style>
