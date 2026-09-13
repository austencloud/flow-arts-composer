<script lang="ts">
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { pictographPreparer } from "$lib/shared/pictograph/shared/services/pictograph-preparer";
  import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import { getBaseMotionColors } from "$lib/shared/animation-engine/services/svg-generator";
  import {
    tunnelPropColor,
    tunnelPerformerPair,
    type TunnelPropColorMode,
    type TunnelPropColorPair,
  } from "$lib/shared/sequence-viewer/tunnel/tunnel-prop-colors";
  import { getTunnelCreatorContext } from "../context/tunnel-creator-context";
  import type { TunnelWorkflowMode } from "../domain/tunnel-creator-draft";
  import { MAX_INTERACTIVE_TUNNEL_PERFORMERS } from "../state/tunnel-creator-state.svelte";
  import TunnelPerformerCard from "./TunnelPerformerCard.svelte";

  interface TunnelPerformerDisplay {
    sequence: SequenceData | null;
    stageTransformLabel: string | null;
    generatedInstanceCount: number;
    stageArms: number[];
  }

  interface CardRef {
    prepareGenerationAnimation: (stepCount: number) => void;
    clearGenerationAnimation: () => void;
  }

  let {
    displays,
    activeStepIndices = {},
    leftPropType,
    rightPropType,
    colorMode,
    customPropColors,
    exactPropColors = null,
    renderedArms = [],
    renderedInstanceCount,
    short = false,
    onCastChange,
    onChoose,
    onChooseShapeMatrix,
    onGenerateNow,
    onEditGeneration,
    onEditRelationship,
    onSelectPerformer,
  }: {
    displays: Record<string, TunnelPerformerDisplay>;
    activeStepIndices?: Readonly<Record<string, number>>;
    leftPropType: PropType;
    rightPropType: PropType;
    colorMode: TunnelPropColorMode;
    customPropColors: TunnelPropColorPair;
    exactPropColors?: TunnelPropColorPair | null;
    renderedArms?: readonly number[];
    renderedInstanceCount: number;
    short?: boolean;
    onCastChange: (count: number) => void;
    onChoose: (performerId: string) => void;
    onChooseShapeMatrix: (performerId: string) => void;
    onGenerateNow: (performerId: string) => void;
    onEditGeneration: (performerId: string) => void;
    onEditRelationship: (performerId: string) => void;
    onSelectPerformer: (performerId: string | null) => void;
  } = $props();

  const componentId = $props.id();
  const performerPanelId = `${componentId}-selected-performer-panel`;
  const creator = getTunnelCreatorContext();
  const animationVisibility = getAnimationVisibilityManager();
  const baseMotionColors = getBaseMotionColors();
  let cardRef = $state<CardRef>();
  let pendingPerformerId = $state<string | null>(null);
  let selectionRequest = 0;
  const workflowOptions = [
    {
      value: "custom" as TunnelWorkflowMode,
      label: "Separate",
      shortLabel: "Separate",
      ariaLabel:
        "Separate sequences. Every performer has their own choreography.",
    },
    {
      value: "seeded" as TunnelWorkflowMode,
      label: "Linked",
      shortLabel: "Linked",
      ariaLabel:
        "Linked sequences. Performer 1 creates choreography for the remaining cast.",
    },
  ];
  const canGrowCast = $derived(
    creator.performerSlots.length < MAX_INTERACTIVE_TUNNEL_PERFORMERS
  );
  const workflowDescription = $derived(
    creator.workflow === "seeded"
      ? "Performer 1 drives the linked cast."
      : "Each performer has their own sequence."
  );
  const selectedIndex = $derived.by(() => {
    const index = creator.performerSlots.findIndex(
      (slot) => slot.id === creator.selectedPerformerId
    );
    return index >= 0 ? index : 0;
  });
  const selectedSlot = $derived(
    creator.performerSlots[selectedIndex] ?? creator.performerSlots[0] ?? null
  );

  function sourceLabel(performerId: string): string | null {
    const performer = creator.performerSlots.find(
      (slot) => slot.id === performerId
    )?.performer;
    if (performer?.source.kind !== "derived") return null;
    const sourcePerformerId = performer.source.performerId;
    return (
      creator.performerSlots.find((slot) => slot.id === sourcePerformerId)
        ?.label ?? "an earlier performer"
    );
  }

  function sequenceFor(performerId: string): SequenceData | null {
    const displayed = displays[performerId]?.sequence;
    if (displayed) return displayed;
    const performer = creator.performerSlots.find(
      (slot) => slot.id === performerId
    )?.performer;
    return performer?.source.kind === "independent"
      ? performer.source.sequence
      : null;
  }

  async function preparePerformer(performerId: string): Promise<void> {
    const sequence = sequenceFor(performerId);
    if (!sequence) return;

    const pictographs = [
      sequence.startPosition ?? sequence.startingPosition ?? null,
      ...sequence.steps,
    ].filter((pictograph): pictograph is PictographData => pictograph !== null);
    const settings = getSettings();
    await pictographPreparer.prepareBatch(pictographs, {
      themeMode: animationVisibility.isDarkMode() ? "dark" : "light",
      leftPropType,
      rightPropType,
      leftBuugengFlipped: settings.leftBuugengFlipped ?? false,
      rightBuugengFlipped: settings.rightBuugengFlipped ?? false,
    });
  }

  async function select(performerId: string): Promise<void> {
    const request = ++selectionRequest;
    if (performerId === creator.selectedPerformerId) {
      pendingPerformerId = null;
      return;
    }

    pendingPerformerId = performerId;
    await preparePerformer(performerId);
    if (request !== selectionRequest) return;

    pendingPerformerId = null;
    if (!creator.selectPerformer(performerId)) return;
    onSelectPerformer(performerId);
  }

  function performerTabId(index: number): string {
    return `${componentId}-performer-tab-${index + 1}`;
  }

  function handleTabKeydown(event: KeyboardEvent, index: number): void {
    const lastIndex = creator.performerSlots.length - 1;
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight")
      nextIndex = index === lastIndex ? 0 : index + 1;
    if (event.key === "ArrowLeft")
      nextIndex = index === 0 ? lastIndex : index - 1;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = lastIndex;
    if (nextIndex === null) return;

    event.preventDefault();
    const nextSlot = creator.performerSlots[nextIndex];
    if (!nextSlot) return;
    void select(nextSlot.id);
    const tabs = event.currentTarget
      ? Array.from(
          (
            event.currentTarget as HTMLElement
          ).parentElement?.querySelectorAll<HTMLButtonElement>(
            '[role="tab"]'
          ) ?? []
        )
      : [];
    tabs[nextIndex]?.focus();
  }

  function add(): void {
    if (!canGrowCast) return;
    const nextCount = creator.performerSlots.length + 1;
    onCastChange(nextCount);
    if (creator.performerSlots.length !== nextCount) return;
    onSelectPerformer(creator.selectedPerformerId);
  }

  function removeReason(performerId: string): string | null {
    if (creator.performerSlots.length <= 1) {
      return "A tunnel needs at least one performer card.";
    }
    const dependants = creator.dependantLabels(performerId);
    if (dependants.length > 0) {
      return `Reassign ${dependants.join(", ")} before removing this source.`;
    }
    return null;
  }

  function stageColorPairs(performerId: string): Array<{
    arm: number;
    left: string;
    right: string;
  }> {
    const arms = displays[performerId]?.stageArms ?? [];
    const layerCount = Math.max(0, renderedInstanceCount - 1);
    return arms.map((arm) => ({
      arm,
      left: exactPropColors
        ? tunnelPerformerPair(exactPropColors, renderedArms.indexOf(arm)).left
        : colorMode === "custom"
          ? customPropColors.left
          : colorMode !== "spectrum" || arm === 0
            ? baseMotionColors.left
            : tunnelPropColor(arm * 2, layerCount).hex,
      right: exactPropColors
        ? tunnelPerformerPair(exactPropColors, renderedArms.indexOf(arm)).right
        : colorMode === "custom"
          ? customPropColors.right
          : colorMode !== "spectrum" || arm === 0
            ? baseMotionColors.right
            : tunnelPropColor(arm * 2 + 1, layerCount).hex,
    }));
  }

  export function prepareGenerationAnimation(
    performerId: string,
    stepCount: number
  ): void {
    if (selectedSlot?.id === performerId) {
      cardRef?.prepareGenerationAnimation(stepCount);
    }
  }

  export function clearGenerationAnimation(performerId: string): void {
    if (selectedSlot?.id === performerId) {
      cardRef?.clearGenerationAnimation();
    }
  }
</script>

<section
  class="performer-roster"
  class:short
  aria-labelledby="performer-roster-title"
>
  <header class="roster-heading">
    <div class="roster-identity">
      <span>Cast</span>
      <h3 id="performer-roster-title">Choreography</h3>
      <p class="roster-summary">
        {creator.performerSlots.length}
        {creator.performerSlots.length === 1 ? "performer" : "performers"} · {creator.authoredPerformerCount}
        ready · {workflowDescription}
      </p>
    </div>
    <div class="roster-heading-actions">
      <div class="workflow-control">
        <span id="tunnel-cast-pattern-label">Sequences</span>
        <SegmentedControl
          options={workflowOptions}
          value={creator.workflow}
          onchange={creator.setWorkflow}
          color="accent"
          density="compact"
          semantics="radiogroup"
          ariaLabelledby="tunnel-cast-pattern-label"
        />
      </div>
      <div class="roster-toolbar">
        <div class="performer-switcher" role="tablist" aria-label="Performers">
          {#each creator.performerSlots as slot, index}
            <button
              id={performerTabId(index)}
              type="button"
              role="tab"
              aria-selected={creator.selectedPerformerId === slot.id}
              aria-busy={pendingPerformerId === slot.id}
              aria-controls={performerPanelId}
              tabindex={creator.selectedPerformerId === slot.id ? 0 : -1}
              onclick={() => void select(slot.id)}
              onkeydown={(event) => handleTabKeydown(event, index)}
            >
              {slot.label.replace("Performer ", "P")}
            </button>
          {/each}
        </div>
        {#if canGrowCast}
          <PanelButton
            variant="secondary"
            onclick={add}
            ariaLabel="Add another performer"
          >
            <i class="fas fa-user-plus" aria-hidden="true"></i>
            <span class="compact-add-count">
              {creator.performerSlots
                .length}/{MAX_INTERACTIVE_TUNNEL_PERFORMERS}
            </span>
          </PanelButton>
        {/if}
      </div>
    </div>
  </header>

  <div
    id={performerPanelId}
    class="roster-scroll"
    role="tabpanel"
    aria-labelledby={performerTabId(selectedIndex)}
  >
    {#if selectedSlot}
      {@const linked = selectedSlot.performer?.source.kind === "derived"}
      {@const display = displays[selectedSlot.id]}
      {@const removeBlockedReason = removeReason(selectedSlot.id)}
      <TunnelPerformerCard
        bind:this={cardRef}
        performer={selectedSlot.performer}
        displaySequence={display?.sequence ?? null}
        activeStepIndex={activeStepIndices[selectedSlot.id] ?? null}
        stageTransformLabel={display?.stageTransformLabel ?? null}
        generatedInstanceCount={display?.generatedInstanceCount ?? 0}
        formationCopy={selectedIndex === 1 && creator.partnerIsFormationCopy}
        label={selectedSlot.label}
        {linked}
        sourcePerformerLabel={sourceLabel(selectedSlot.id)}
        {short}
        sourceOrigin={selectedSlot.origin}
        previousCount={selectedSlot.previousCount}
        {leftPropType}
        {rightPropType}
        stageColors={stageColorPairs(selectedSlot.id)}
        canMoveUp={creator.canMovePerformer(selectedSlot.id, -1)}
        canMoveDown={creator.canMovePerformer(selectedSlot.id, 1)}
        canRemove={creator.canRemovePerformer(selectedSlot.id)}
        {removeBlockedReason}
        onChoose={() => onChoose(selectedSlot.id)}
        onChooseShapeMatrix={() => onChooseShapeMatrix(selectedSlot.id)}
        onGenerateNow={() => onGenerateNow(selectedSlot.id)}
        onEditGeneration={() => onEditGeneration(selectedSlot.id)}
        onPrevious={() => creator.restorePreviousSequence(selectedSlot.id)}
        onEditPairing={selectedIndex > 0
          ? () => onEditRelationship(selectedSlot.id)
          : undefined}
        onMoveUp={() => creator.movePerformer(selectedSlot.id, -1)}
        onMoveDown={() => creator.movePerformer(selectedSlot.id, 1)}
        onRemove={() => {
          if (creator.removePerformer(selectedSlot.id)) {
            onSelectPerformer(creator.selectedPerformerId);
          }
        }}
      />
    {/if}
  </div>
</section>

<style>
  .performer-roster {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    min-width: 0;
    min-height: 0;
    height: 100%;
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--settings-radius-lg, 20px);
    background: var(--theme-panel-bg);
  }

  .roster-heading {
    align-items: center;
    justify-content: space-between;
    gap: var(--settings-spacing-sm, 8px);
    padding: var(--settings-spacing-sm, 8px) var(--settings-spacing-md, 14px);
    background: var(--theme-card-bg);
  }

  .roster-heading {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    border-bottom: 1px solid var(--theme-stroke);
  }

  .roster-identity {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .roster-summary {
    overflow: hidden;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .roster-heading-actions {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--settings-spacing-sm, 8px);
    width: 100%;
    min-width: 0;
  }

  .workflow-control {
    display: grid;
    width: 11.5rem;
    min-width: 10rem;
    gap: 2px;
  }

  .workflow-control > span {
    font-weight: 650;
  }

  .performer-switcher {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .performer-switcher::-webkit-scrollbar {
    display: none;
  }

  .roster-toolbar {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    margin-left: auto;
  }

  .roster-toolbar :global(.panel-btn) {
    min-width: var(--min-touch-target, 48px);
    min-height: var(--min-touch-target, 48px);
    padding-inline: 8px;
  }

  .compact-add-count {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    font-variant-numeric: tabular-nums;
  }

  .performer-switcher button {
    min-width: var(--min-touch-target, 48px);
    min-height: var(--min-touch-target, 48px);
    padding: 6px 10px;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--settings-radius-sm, 10px);
    color: var(--theme-text-dim);
    background: var(--theme-card-bg);
    font-size: var(--font-size-min, 14px);
    font-weight: 750;
    cursor: pointer;
    transition:
      border-color var(--transition-fast),
      color var(--transition-fast),
      background-color var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .performer-switcher button[aria-selected="true"] {
    border-color: color-mix(in srgb, var(--theme-accent) 70%, white 10%);
    color: var(--theme-text);
    background: color-mix(
      in srgb,
      var(--theme-accent) 18%,
      var(--theme-card-bg)
    );
  }

  .performer-switcher button[aria-busy="true"]:not([aria-selected="true"]) {
    border-color: color-mix(in srgb, var(--theme-accent) 45%, transparent);
    color: var(--theme-text);
    box-shadow: inset 0 -2px 0
      color-mix(in srgb, var(--theme-accent) 70%, transparent);
    cursor: progress;
  }

  .performer-switcher button:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .roster-heading span {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
  }

  h3,
  p {
    margin: 0;
  }

  h3 {
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
  }

  .roster-scroll {
    display: grid;
    grid-template: minmax(0, 1fr) / minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
    padding: var(--settings-spacing-sm, 8px);
    overflow: hidden;
  }

  .roster-scroll :global(.source-card) {
    height: 100%;
    min-height: 0;
  }

  @container tunnel (max-width: 719px) {
    .performer-roster {
      min-height: min(26rem, 64dvh);
      max-height: none;
    }

    .roster-heading {
      grid-template-columns: minmax(0, 1fr);
    }

    .roster-heading-actions {
      width: 100%;
      align-items: center;
      justify-content: space-between;
    }

    .workflow-control {
      flex: 1;
      width: auto;
      max-width: 15rem;
    }
  }

  @container tunnel (min-width: 600px) and (max-height: 540px) {
    .performer-roster.short {
      min-height: 0;
    }

    .roster-heading {
      padding-block: 5px;
    }

    .performer-roster.short .roster-identity {
      display: none;
    }

    .performer-roster.short .roster-heading {
      display: flex;
      justify-content: stretch;
      min-height: var(--min-touch-target, 48px);
      padding-block: 0;
    }

    .performer-roster.short .roster-heading-actions {
      flex: 1;
    }

    .performer-roster.short .roster-scroll {
      overflow: hidden;
    }
  }

  @container tunnel (max-width: 430px) {
    .roster-heading {
      gap: 6px;
      padding: 6px 8px;
    }

    .roster-identity > span,
    .roster-summary,
    .workflow-control > span {
      display: none;
    }

    .workflow-control {
      width: 100%;
      min-width: 9rem;
      max-width: none;
    }

    .roster-heading-actions {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      align-items: stretch;
    }

    .roster-toolbar {
      width: 100%;
      margin-left: 0;
    }

    .performer-switcher {
      flex: 1;
    }

    .performer-switcher button {
      min-width: 44px;
      min-height: 44px;
      padding-inline: 8px;
    }

    .roster-toolbar :global(.panel-btn) {
      width: 44px;
      min-width: 44px;
      min-height: 44px;
      padding: 0;
    }

    .compact-add-count {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
      clip-path: inset(50%);
    }
  }
</style>
