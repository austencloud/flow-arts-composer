<script lang="ts">
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import Crossfade from "$lib/shared/components/Crossfade.svelte";
  import OverflowMenu from "$lib/shared/ui/components/OverflowMenu.svelte";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { TunnelPerformer } from "$lib/shared/sequence-viewer/tunnel/tunnel-composition";
  import { copyOpsLabel } from "$lib/shared/sequence-viewer/tunnel/tunnel-composition";
  import StepGrid from "$lib/features/create/shared/workspace-panel/sequence-display/components/StepGrid.svelte";
  import SequenceMetadataRail from "$lib/features/create/shared/workspace-panel/sequence-display/components/SequenceMetadataRail.svelte";
  import WordLabel from "$lib/features/create/shared/workspace-panel/sequence-display/components/WordLabel.svelte";
  import { tryGetLoopDisplayResolver } from "$lib/shared/loop-labeler/get-loop-display-resolver";
  import { DURATION } from "$lib/shared/transitions/transitions";
  import type { TunnelSourceOrigin } from "../domain/tunnel-creator-draft";

  let {
    performer,
    displaySequence = null,
    activeStepIndex = null,
    stageTransformLabel = null,
    formationCopy = false,
    label,
    linked = false,
    short = false,
    generatedInstanceCount = 0,
    sourcePerformerLabel = null,
    leftPropType,
    rightPropType,
    stageColors = [],
    sourceOrigin = null,
    previousCount = 0,
    onChoose,
    onChooseShapeMatrix,
    onGenerateNow,
    onEditGeneration,
    onPrevious,
    onEditPairing,
    onMoveUp,
    onMoveDown,
    onRemove,
    canMoveUp = false,
    canMoveDown = false,
    canRemove = false,
    removeBlockedReason = null,
  }: {
    performer: TunnelPerformer | null;
    displaySequence?: SequenceData | null;
    activeStepIndex?: number | null;
    stageTransformLabel?: string | null;
    /** A reconstructed legacy arm: visible for performed-result inspection,
     * but absent from the authored composition until the user edits it. */
    formationCopy?: boolean;
    label: string;
    linked?: boolean;
    short?: boolean;
    generatedInstanceCount?: number;
    sourcePerformerLabel?: string | null;
    leftPropType?: PropType;
    rightPropType?: PropType;
    stageColors?: Array<{ arm: number; left: string; right: string }>;
    sourceOrigin?: TunnelSourceOrigin | null;
    previousCount?: number;
    onChoose: () => void;
    onChooseShapeMatrix?: () => void;
    onGenerateNow?: () => void;
    onEditGeneration?: () => void;
    onPrevious?: () => void;
    onEditPairing?: () => void;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
    onRemove?: () => void;
    canMoveUp?: boolean;
    canMoveDown?: boolean;
    canRemove?: boolean;
    removeBlockedReason?: string | null;
  } = $props();

  const componentId = $props.id();
  const ownSequence = $derived(
    performer?.source.kind === "independent" ? performer.source.sequence : null
  );
  const previewSequence = $derived(displaySequence ?? ownSequence);
  const activeStepNumber = $derived.by(() => {
    if (activeStepIndex === null) return null;
    return (
      previewSequence?.steps[activeStepIndex]?.stepNumber ?? activeStepIndex + 1
    );
  });
  const displayWord = $derived(
    previewSequence
      ? simplifyRepeatedWord(
          previewSequence.displayName ??
            previewSequence.intendedWord ??
            previewSequence.word ??
            ""
        )
      : ""
  );
  const loopDisplay = $derived.by(() => {
    if (!previewSequence) return null;
    return tryGetLoopDisplayResolver()?.(previewSequence) ?? null;
  });
  const sourceLabel = $derived(
    performer?.source.kind === "derived"
      ? copyOpsLabel(performer.source.transforms)
      : null
  );
  const sourceDescriptor = $derived.by(() => {
    if (linked) return null;
    const provenance =
      performer?.source.kind === "independent"
        ? performer.source.provenance
        : null;
    if (provenance?.kind === "shape-matrix-realization") {
      return `Shape Matrix ${provenance.mode}`;
    }
    if (provenance?.kind === "library-sequence") {
      return provenance.scope === "personal"
        ? "Yours"
        : provenance.scope === "public"
          ? "Public"
          : "Library";
    }
    return sourceOrigin === "generated" ? "Generated" : null;
  });
  const primaryStageColors = $derived(stageColors[0] ?? null);
  const compactActions = $derived.by(() => {
    const items: Array<{
      label: string;
      icon: string;
      action: () => void;
      variant?: "danger";
      disabled?: boolean;
      hint?: string;
    }> = [];

    if (onEditPairing) {
      items.push({
        label: linked ? "Edit relationship" : `Link ${label}`,
        icon: "fas fa-link",
        action: onEditPairing,
      });
    }
    if (previousCount > 0 && onPrevious) {
      items.push({
        label: "Previous sequence",
        icon: "fas fa-clock-rotate-left",
        action: onPrevious,
      });
    }
    if (onEditGeneration) {
      items.push({
        label: "Change generation settings",
        icon: "fas fa-sliders",
        action: onEditGeneration,
      });
    }
    items.push({
      label: "Browse sequences",
      icon: "fas fa-folder-open",
      action: onChoose,
    });
    if (onChooseShapeMatrix) {
      items.push({
        label: "Use Shape Matrix",
        icon: "fas fa-shapes",
        action: onChooseShapeMatrix,
      });
    }
    if (canMoveUp) {
      items.push({
        label: "Move earlier",
        icon: "fas fa-arrow-up",
        action: () => onMoveUp?.(),
      });
    }
    if (canMoveDown) {
      items.push({
        label: "Move later",
        icon: "fas fa-arrow-down",
        action: () => onMoveDown?.(),
      });
    }
    if (onRemove && canRemove) {
      items.push({
        label: `Remove ${label}`,
        icon: "fas fa-user-minus",
        action: onRemove,
        variant: "danger",
      });
    }
    return items;
  });

  let gridRef = $state<ReturnType<typeof StepGrid>>();

  export function prepareGenerationAnimation(stepCount: number): void {
    gridRef?.prepareGenerationAnimation(stepCount);
  }

  export function clearGenerationAnimation(): void {
    gridRef?.clearGenerationAnimation();
  }
</script>

<section
  class="source-card selected"
  class:short
  aria-label={`${label} sequence`}
>
  <header class="source-heading">
    <div class="identity-transition">
      <Crossfade key={performer?.id ?? label} duration={DURATION.fast}>
        <div class="source-identity">
          <div class="identity-row">
            <h3>{label}</h3>
            <SequenceMetadataRail
              sequence={previewSequence}
              {loopDisplay}
              presentation="inline"
            />
          </div>
          <p class="source-meta">
            {#if previewSequence}
              <span>{previewSequence.steps.length} steps</span>
              {#if sourceDescriptor}<span>{sourceDescriptor}</span>{/if}
              {#if linked && sourceLabel}
                <span
                  >Linked to {sourcePerformerLabel ?? "earlier performer"}</span
                >
              {/if}
              {#if formationCopy}
                <span>Formation copy (not authored)</span>
              {/if}
              {#if generatedInstanceCount > 0}
                <span
                  title={stageTransformLabel
                    ? `Stage placement: ${stageTransformLabel}`
                    : undefined}
                >
                  {generatedInstanceCount} on stage
                </span>
              {/if}
            {:else if linked}
              <span
                >Follows {sourcePerformerLabel ?? "an earlier performer"}</span
              >
            {:else}
              <span>Complete two-prop sequence</span>
            {/if}
          </p>
        </div>
      </Crossfade>
    </div>

    <div
      class="hand-key"
      aria-label={primaryStageColors
        ? `${label} stage colors: Left ${primaryStageColors.left}, Right ${primaryStageColors.right}${stageColors.length > 1 ? `; ${stageColors.length} generated color pairs` : ""}`
        : `${label} hand identity: Left and Right`}
    >
      <span
        class="hand"
        style:--hand-color={primaryStageColors?.left ??
          "var(--prop-blue, #2e8bf0)"}><i aria-hidden="true"></i><b>L</b></span
      >
      <span
        class="hand"
        style:--hand-color={primaryStageColors?.right ??
          "var(--prop-red, #ed1c24)"}><i aria-hidden="true"></i><b>R</b></span
      >
      {#if stageColors.length > 1}
        <span
          class="pair-count"
          title={`${stageColors.length} stage instances use distinct spectrum pairs`}
          >×{stageColors.length}</span
        >
      {/if}
    </div>

    <div
      class="compact-source-actions"
      aria-label={`${label} sequence actions`}
    >
      {#if onGenerateNow}
        <PanelButton
          variant="primary"
          onclick={onGenerateNow}
          ariaLabel={`Generate a new ${label} sequence with the current settings`}
        >
          <i class="fas fa-dice" aria-hidden="true"></i>
          <span class="compact-generate-label">Generate</span>
        </PanelButton>
      {/if}
      <OverflowMenu
        items={compactActions}
        placement="bottom"
        ariaLabel={`More ${label} actions`}
        triggerPresentation="labelled"
      >
        {#snippet trigger()}
          <span class="compact-more-label">More</span>
          <i class="fas fa-chevron-down compact-more-chevron" aria-hidden="true"
          ></i>
          <i
            class="fas fa-ellipsis-vertical compact-more-icon"
            aria-hidden="true"
          ></i>
        {/snippet}
      </OverflowMenu>
    </div>
  </header>

  <div class="workbench-stage">
    {#if displayWord}
      <div class="word-rail">
        <Crossfade
          key={`${performer?.id ?? label}:${displayWord}`}
          duration={DURATION.fast}
          fill
        >
          <WordLabel word={displayWord} scrollMode={false} />
        </Crossfade>
      </div>
    {/if}
    <div class="live-grid">
      <StepGrid
        bind:this={gridRef}
        steps={previewSequence?.steps ?? []}
        startPlacement={previewSequence?.startPlacement ??
          previewSequence?.startingPlacement ??
          null}
        selectedStepNumber={activeStepNumber}
        autoFocusSelectedStep={false}
        activeMode={null}
        isTimelineMode={false}
        fitAllSteps={true}
        sizingProfile="preview"
        stepIdentityMode="slot"
        stepIdentityPrefix={`${componentId}-selected-performer`}
        narrowMaxColumns={3}
        preferWidthSizingOnNarrow={true}
        leftPropTypeOverride={leftPropType}
        rightPropTypeOverride={rightPropType}
        leftColorOverride={primaryStageColors?.left}
        rightColorOverride={primaryStageColors?.right}
        sequenceWord={displayWord}
      />
    </div>

    {#if !previewSequence}
      <div class="source-empty">
        <i class="fas fa-book-open" aria-hidden="true"></i>
        <div>
          <strong
            >{linked
              ? `Waiting for ${sourcePerformerLabel ?? "source performer"}`
              : "Choose a sequence"}</strong
          >
          <span>
            {linked
              ? `${label} will resolve from ${sourcePerformerLabel ?? "its source"}.`
              : "Pick from your library or the community."}
          </span>
        </div>
      </div>
    {/if}
  </div>
</section>

<style>
  .source-card {
    container-type: inline-size;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: 1px solid var(--theme-stroke);
    border-radius: var(--settings-radius-lg, 20px);
    background: var(--theme-panel-bg);
  }

  .source-card.selected {
    border-color: color-mix(in srgb, var(--theme-accent) 70%, white 10%);
    box-shadow: 0 0 0 1px
      color-mix(in srgb, var(--theme-accent) 35%, transparent);
  }

  .source-heading {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    justify-content: space-between;
    gap: var(--settings-spacing-sm, 8px);
    min-height: 3.5rem;
    padding: var(--settings-spacing-sm, 8px) var(--settings-spacing-md, 14px);
    border-bottom: 1px solid var(--theme-stroke);
  }

  .source-identity {
    display: grid;
    align-content: center;
    gap: 2px;
    min-width: 0;
  }

  .identity-transition {
    min-width: 0;
  }

  .identity-row {
    display: flex;
    align-items: center;
    gap: var(--settings-spacing-xs, 6px);
    min-width: 0;
    min-height: 20px;
  }

  .hand-key {
    display: flex;
    align-items: center;
    gap: var(--settings-spacing-xs, 6px);
  }

  .hand-key {
    flex: 0 0 auto;
  }

  .hand {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 1.75rem;
    padding: 2px 7px;
    border: 1px solid var(--theme-stroke);
    border-radius: 999px;
    color: var(--theme-text-dim);
    background: var(--theme-card-bg);
    font-size: var(--font-size-compact, 12px);
    white-space: nowrap;
  }

  .hand i {
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 50%;
    background: var(--hand-color);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--hand-color) 70%, white);
  }

  .hand b {
    color: var(--theme-text);
  }

  .pair-count {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  h3,
  p {
    margin: 0;
  }

  h3 {
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
    font-weight: 750;
  }

  p {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
  }

  .source-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 1px 10px;
    line-height: 1.25;
  }

  .source-meta span {
    position: relative;
    white-space: nowrap;
  }

  .source-meta span + span::before {
    position: absolute;
    left: -7px;
    content: "·";
  }

  .workbench-stage {
    position: relative;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: color-mix(in srgb, var(--theme-card-bg) 72%, black);
  }

  .word-rail {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: 2.25rem;
    padding: 2px var(--settings-spacing-sm, 8px);
    border-bottom: 1px solid var(--theme-stroke);
  }

  .word-rail :global(.word-label) {
    width: 100%;
  }

  .live-grid {
    min-width: 0;
    min-height: 0;
    padding: var(--settings-spacing-xs, 6px);
    overflow: hidden;
  }

  .compact-source-actions {
    display: flex;
    align-items: center;
    gap: var(--settings-spacing-xs, 6px);
    width: auto;
  }

  .compact-source-actions :global(.panel-btn),
  .compact-source-actions :global(.overflow-trigger) {
    min-height: var(--min-touch-target, 48px);
  }

  .compact-source-actions :global(.overflow-trigger) {
    width: auto;
    height: auto;
    padding: 10px 14px;
    color: var(--theme-text);
  }

  .compact-more-icon {
    display: none;
  }

  .source-empty {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: grid;
    align-content: center;
    justify-items: center;
    gap: var(--settings-spacing-md, 14px);
    min-height: 11rem;
    padding: var(--settings-spacing-lg, 20px);
    color: var(--theme-text-dim);
    text-align: center;
    background: color-mix(in srgb, var(--theme-card-bg) 94%, black);
  }

  .source-empty > i {
    font-size: var(--font-size-2xl, 24px);
    opacity: 0.7;
  }

  .source-empty > div {
    display: grid;
    gap: 4px;
  }

  .source-empty strong,
  .source-empty span {
    display: block;
  }

  .source-empty strong {
    color: var(--theme-text);
    font-size: var(--font-size-min, 14px);
  }

  .source-empty span {
    color: var(--theme-text-dim);
    font-size: var(--font-size-min, 14px);
    line-height: 1.4;
  }

  @container (max-width: 22rem) {
    .source-heading {
      align-items: flex-start;
    }

    .source-heading :global(.panel-btn) {
      min-width: var(--min-touch-target, 44px);
      padding-inline: 12px;
    }

    .hand {
      padding-inline: 6px;
    }

    .hand:not(b) {
      font-size: 0;
    }

    .hand b,
    .hand i {
      font-size: var(--font-size-compact, 12px);
    }
  }

  /* Width may rearrange the toolbar, but it must never introduce a different
     action inventory. Generate stays primary and the labelled More menu owns
     every secondary sequence action at every size, matching Fuse's source
     cards instead of turning a wide Tunnel card into a second settings rail. */
  @container (max-width: 56rem) {
    .source-heading {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto auto;
      align-items: center;
      gap: 4px 6px;
      min-height: 3.5rem;
      padding: 3px var(--settings-spacing-sm, 8px);
    }

    .source-identity {
      min-height: var(--min-touch-target, 48px);
      overflow: hidden;
    }

    .source-meta {
      max-height: 1.25em;
      overflow: hidden;
      flex-wrap: nowrap;
    }

    .compact-source-actions :global(.panel-btn) {
      flex: 0 0 auto;
    }

    .compact-source-actions :global(.overflow-dropdown) {
      max-height: min(12rem, 34dvh);
      overflow-y: auto;
      overscroll-behavior: contain;
    }
  }

  @container (max-width: 22rem) {
    .identity-row h3 {
      white-space: nowrap;
    }

    /* The prop colors are already visible in every pictograph. On a phone the
       L/R chips compete with the performer name, difficulty, LOOP state, and
       primary actions, so the action menu remains the compact source of truth. */
    .hand-key {
      display: none;
    }

    .source-meta span:not(:first-child) {
      display: none;
    }

    .compact-source-actions :global(.panel-btn) {
      width: var(--min-touch-target, 48px);
      padding-inline: 0;
    }

    .compact-source-actions :global(.overflow-trigger) {
      width: var(--min-touch-target, 48px);
      padding-inline: 0;
    }

    .compact-more-label,
    .compact-more-chevron {
      display: none;
    }

    .compact-more-icon {
      display: inline-block;
    }

    .compact-generate-label {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
      clip-path: inset(50%);
    }
  }

  .source-card.short .source-heading {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 4px;
    min-height: var(--min-touch-target, 48px);
    padding: 3px 6px;
  }

  .source-card.short .source-identity {
    flex-basis: auto;
    min-height: var(--min-touch-target, 48px);
  }

  .source-card.short .source-meta {
    max-height: 1.25em;
    overflow: hidden;
  }

  .source-card.short .word-rail {
    display: none;
  }

  .source-card.short .compact-source-actions {
    width: auto;
  }

  .source-card.short .compact-source-actions :global(.panel-btn) {
    flex: 0 0 var(--min-touch-target, 48px);
    width: var(--min-touch-target, 48px);
    padding-inline: 0;
  }

  .source-card.short .compact-source-actions :global(.overflow-trigger) {
    width: var(--min-touch-target, 48px);
    padding-inline: 0;
  }

  .source-card.short .compact-more-label,
  .source-card.short .compact-more-chevron {
    display: none;
  }

  .source-card.short .compact-more-icon {
    display: inline-block;
  }

  .source-card.short .compact-generate-label {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    clip-path: inset(50%);
  }

  .source-card.short .workbench-stage {
    grid-template-rows: minmax(0, 1fr);
  }
</style>
