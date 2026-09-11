<script lang="ts">
  import { onMount } from "svelte";
  import type { BrowseViewMode } from "$lib/shared/browse/domain/browse-view-mode";
  import { loopStartPickTarget } from "$lib/features/create/shared/services/choose-start-analyzer";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import OverflowMenu from "$lib/shared/ui/components/OverflowMenu.svelte";
  import FuseVtgPathPicker from "./FuseVtgPathPicker.svelte";
  import FuseSoloLoopPicker from "./FuseSoloLoopPicker.svelte";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import ChoreoCard from "$lib/shared/sequence-viewer/components/ChoreoCard.svelte";
  import ChoreoCardContextMenuHost from "$lib/shared/sequence-viewer/components/choreo-card-context-menu/ChoreoCardContextMenuHost.svelte";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import FuseLivePathGrid from "./FuseLivePathGrid.svelte";
  import FuseSourceActionPopover from "./FuseSourceActionPopover.svelte";
  import CardInspectModal from "$lib/features/choreo-card/components/CardInspectModal.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { getSoloPropSaveOrchestrator } from "$lib/features/library/get-solo-prop-save-orchestrator";
  import { ensureGuestIdentity } from "$lib/shared/auth/services/guest-identity";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import { showToast } from "$lib/shared/toast/state/toast-state.svelte";
  import { getFuseContext } from "../context/fuse-context";
  import LOOPIconStrip from "$lib/shared/components/LOOPIconStrip.svelte";
  import {
    fuseRuleGlyph,
    fuseRuleTint,
  } from "../domain/fuse-transform-presentation";
  import { fuseRuleLabel } from "../domain/fuse-rule";
  import type { FuseSourceAdjustment } from "../state/fuse-state.svelte";
  import type { FuseSide } from "../state/fuse-shuffle-pool.svelte";
  import { resolveFusePictographMotionFrame } from "../services/fuse-pictograph-motion-frame";
  import { createCircularFuseSoloSequence } from "../services/fuse-solo-sequence";
  import {
    FUSE_LIVE_GRID_GAP,
    getBestFuseStepColumns,
    getFittedFuseCellSize,
  } from "../services/fuse-workspace-split";

  let {
    side,
    full = false,
    compactHero = false,
    toolbarOnly = false,
    stepCols = null,
    onChooseFirstStep,
    onBuildPath,
    firstStepPickerActive = false,
    onFirstStepComplete,
    onCancelFirstStep,
    onEditPairing,
  }: {
    side: FuseSide;
    // Big desktop only: render the complete choreo card — start position plus
    // the solo-colored mandala — instead of the lean steps-only view. Gated by
    // FuseLayout on cell size so the extra cells never shrink the pictographs.
    full?: boolean;
    /** Full-bleed current-step preview used by the phone workspace. */
    compactHero?: boolean;
    /** Compact source identity and actions without a second pictograph. The
     * shared decomposed animator owns the live hand view in this mode. */
    toolbarOnly?: boolean;
    // The stacked desktop solver coordinates this with its draggable seam.
    // A null value lets a full-height side card fit itself from its own stage.
    stepCols?: number | null;
    onChooseFirstStep: (side: FuseSide) => void;
    onBuildPath: (side: FuseSide) => void;
    firstStepPickerActive?: boolean;
    onFirstStepComplete?: (side: FuseSide) => void;
    onCancelFirstStep?: () => void;
    /** Opens the Pairing editor. The follower's footer is the obvious place to
     * click when you want to change the rule that built it, so when a host can
     * open that editor the footer becomes the button rather than dead text. */
    onEditPairing?: () => void;
  } = $props();

  const { state: fuseState } = getFuseContext();
  const settings = getSettings();
  const source = $derived(side === "left" ? fuseState.left : fuseState.right);
  const label = $derived(side === "left" ? "Left" : "Right");
  const viewMode = $derived<BrowseViewMode>({
    subject: "props",
    granularity: "solo",
    hand: side,
  });
  // The notation stage's live size. ChoreoCard's autoFit reads a landscape
  // stage as "one long row" — 8 tiny cells with dead space above and below.
  // Instead we measure the real stage and pick the column count that maximizes
  // pictograph size, the same optimization the desktop seam runs. A stacked
  // full card keeps FuseLayout's seam-aware count; a side card fits itself.
  let stageEl = $state<HTMLDivElement | null>(null);
  let stageW = $state(0);
  let stageH = $state(0);
  const startLayout = $derived<"row" | "column" | null>(full ? "column" : null);
  const sourceControlsDisabled = $derived(
    fuseState.isLoadingLength ||
      fuseState.pendingSide !== null ||
      fuseState.isFusing
  );
  let isSavingLoop = $state(false);
  let inspectedSequence = $state<SequenceData | null>(null);
  let cardContextMenuHost: ChoreoCardContextMenuHost | undefined = $state();

  // Symmetry mode: the driver keeps its source + controls; the follower renders
  // the derived result (fuseState.symmetryPreview) read-only, so this card shows the
  // fused follower hand and hides Back/Shuffle/overflow while symmetry is on.
  // While the pairing editor holds a draft, follow the draft: picking a rule
  // rebuilds this card's steps under the cursor instead of only the fused
  // canvas, and switching the driver moves which card is the derived one.
  const isSymmetryFollower = $derived(
    (fuseState.isPreviewingRelationship || fuseState.mode === "symmetry") &&
      side !== fuseState.previewDriverSide
  );
  const displaySequence = $derived.by(() => {
    if (!isSymmetryFollower) return source.sequence;

    const preview = fuseState.symmetryPreview;
    const solo =
      side === "left" ? preview?.leftSoloProp : preview?.rightSoloProp;
    if (!solo) return null;

    return createCircularFuseSoloSequence(side, solo);
  });
  const followerTransformLabel = $derived(fuseRuleLabel(fuseState.previewRule));
  const driverLabel = $derived(
    fuseState.previewDriverSide === "left" ? "Left" : "Right"
  );
  const followerGlyph = $derived(fuseRuleGlyph(fuseState.previewRule));
  const followerTransformTint = $derived(fuseRuleTint(fuseState.previewRule));

  // The playing beat, mapped to a 0-based step index, so the card cell for the
  // step currently on the animation canvas lights up in lockstep. The shared
  // Fuse clock is a continuous float; floor(step % length) is the same index
  // FuseAnimationPreview paints.
  const stepCount = $derived(displaySequence?.steps.length ?? 0);
  const highlightIndex = $derived(
    stepCount > 0
      ? Math.floor(
          ((fuseState.currentStep % stepCount) + stepCount) % stepCount
        )
      : null
  );

  // The stacked desktop passes its seam-aware count. Full-height side cards and
  // lean cards solve from their own measured stage, so moving Left and Right
  // beside the result makes the notation taller instead of merely narrower.
  const STAGE_COL_CANDIDATES = [2, 4, 6, 8] as const;
  function bestStageCols(w: number, h: number, steps: number): number {
    if (w <= 0 || h <= 0 || steps <= 0) return Math.min(4, Math.max(1, steps));
    let best = Math.min(STAGE_COL_CANDIDATES[0], steps);
    let bestCell = -1;
    for (const cols of STAGE_COL_CANDIDATES) {
      if (cols > steps) continue;
      const rows = Math.ceil(steps / cols);
      const cell = Math.min(w / cols, h / rows);
      if (cell > bestCell) {
        bestCell = cell;
        best = cols;
      }
    }
    return best;
  }
  const stepColumns = $derived(
    full
      ? (stepCols ?? getBestFuseStepColumns(stageW, stageH, stepCount, 0))
      : bestStageCols(stageW, stageH, stepCount)
  );
  const liveGridColumns = $derived(Math.max(1, stepColumns ?? 1));
  const liveGridRows = $derived(
    Math.max(1, Math.ceil(stepCount / liveGridColumns), full ? 2 : 1)
  );
  const liveGridTotalColumns = $derived(liveGridColumns + (full ? 1 : 0));
  const liveCellSize = $derived(
    Math.max(
      1,
      Math.floor(
        getFittedFuseCellSize(
          stageW,
          stageH,
          liveGridTotalColumns,
          liveGridRows,
          FUSE_LIVE_GRID_GAP
        )
      )
    )
  );

  // Phone cards keep one canonical pictograph renderer mounted. Fuse's shared
  // clock drives the same motion geometry used by the Construct arrival stage,
  // so props travel through the beat and arrows reveal with that motion instead
  // of relying on a CSS transition between static pictographs.
  const compactMotionFrame = $derived(
    resolveFusePictographMotionFrame(displaySequence, fuseState.currentStep)
  );
  const compactStep = $derived(compactMotionFrame?.step ?? null);
  const compactStepLabel = $derived(
    compactMotionFrame
      ? `${compactMotionFrame.stepIndex + 1} / ${stepCount}`
      : ""
  );
  let systemPrefersReducedMotion = $state(false);
  const compactMotionProgress = $derived(
    (settings.reducedMotion ?? false) || systemPrefersReducedMotion
      ? null
      : (compactMotionFrame?.motionProgress ?? null)
  );
  const compactArrowOpacity = $derived(
    compactMotionProgress === null ? 1 : compactMotionProgress
  );

  onMount(() => {
    if (!compactHero) return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = (event: MediaQueryListEvent) => {
      systemPrefersReducedMotion = event.matches;
    };
    systemPrefersReducedMotion = query.matches;
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  });

  // Measure the notation stage so the non-full column choice tracks the real
  // card size (tablet side-by-side, portrait, etc.) rather than ChoreoCard's
  // aspect-only autoFit.
  $effect(() => {
    const el = stageEl;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => {
      const box = entry?.contentRect;
      if (box) {
        stageW = Math.round(box.width);
        stageH = Math.round(box.height);
      }
    });
    ro.observe(el);
    stageW = Math.round(el.clientWidth);
    stageH = Math.round(el.clientHeight);
    return () => ro.disconnect();
  });

  // The next candidate this side's Shuffle will land on, hydrated ahead of time
  // by the pool. Rendering it in a hidden card now bakes its pictographs into
  // the shared cell cache, so the visible swap on Shuffle is a cache hit instead
  // of a cold render. Same props as the live card => identical cache keys.
  const nextSequence = $derived(source.nextSequence);

  // Saved-source selection is solo-only. The picker rejects ordinary two-hand
  // sequences and any solo path without a recognized, seamless LOOP.
  let pickerOpen = $state(false);

  async function openLibraryPicker(): Promise<void> {
    await ensureGuestIdentity();
    pickerOpen = true;
  }

  async function handleLibrarySelect(sequence: SequenceData): Promise<void> {
    await fuseState.setSource(side, sequence, {
      kind: "library",
      id: sequence.id,
      word: sequence.word,
      name: sequence.name,
    });
  }

  async function saveCurrentLoop(
    sequence: SequenceData | null = source.sequence
  ): Promise<void> {
    if (isSavingLoop || !sequence) return;
    const solo =
      side === "left" ? sequence.leftSoloProp : sequence.rightSoloProp;
    if (!solo) {
      showToast("This path is not ready to save yet", "info");
      return;
    }

    isSavingLoop = true;
    try {
      await ensureGuestIdentity();
      const result = await getSoloPropSaveOrchestrator().save(solo, {
        name: `${label} ${solo.length}-step LOOP`,
        notes: "Created in Fuse",
        authoredHand: side,
        ownerId: authState.effectiveUserId ?? undefined,
        ownerDisplayName: authState.user?.displayName ?? undefined,
      });
      showToast(
        result.reusedExisting
          ? "That one-hand LOOP is already saved"
          : `${label} one-hand LOOP saved`,
        "success"
      );
    } catch (failure) {
      console.error(`[FuseSourceCard] Failed to save ${side} LOOP`, failure);
      showToast("Couldn't save that one-hand LOOP. Try again.", "error");
    } finally {
      isSavingLoop = false;
    }
  }

  // VTG source pick: open the flower picker, then inject the chosen single-hand
  // solo path. buildFlowerSequence already returns this side's solo, so
  // setSource extracts it directly. Gated with {#if} so the shape-matrix load
  // only fires on open.
  let vtgOpen = $state(false);

  function openVtgPicker(): void {
    vtgOpen = true;
  }

  function apply(adjustment: FuseSourceAdjustment): void {
    void fuseState.adjustSource(side, adjustment);
  }

  function viewChoreoCard(): void {
    if (!source.sequence) return;
    inspectedSequence = source.sequence;
  }

  function openCardContextMenu(event: MouseEvent): void {
    if (!displaySequence) return;
    event.preventDefault();
    cardContextMenuHost?.openContextMenu(event.clientX, event.clientY);
  }

  /**
   * Choose Start: the tapped tile is the pose after that step, so the step
   * after it becomes step 1. The last step's pose is already the LOOP start.
   */
  async function chooseInlineStartPose(stepIndex: number): Promise<void> {
    if (!firstStepPickerActive) return;
    const stepCount = displaySequence?.steps.length ?? 0;
    const step = loopStartPickTarget(stepCount, stepIndex + 1);
    if (step !== null) {
      await fuseState.adjustSource(side, { kind: "first-step", step });
    }
    onFirstStepComplete?.(side);
  }

  async function handleVtgSelect(
    sequence: SequenceData,
    label: string
  ): Promise<void> {
    await fuseState.setSource(side, sequence, { kind: "vtg", label });
  }

  const sourceMenuItems = $derived([
    {
      label: "Choose saved LOOP",
      icon: "fas fa-book",
      action: () => void openLibraryPicker(),
    },
    {
      label: "Choose a shape",
      icon: "fas fa-fan",
      action: openVtgPicker,
    },
    {
      label: "Build a custom path",
      icon: "fas fa-route",
      action: (): void => onBuildPath(side),
    },
    {
      label: "View Choreo Card",
      icon: "fas fa-id-card",
      action: viewChoreoCard,
      disabled: !source.sequence,
    },
    {
      label: isSavingLoop ? "Saving to library..." : "Save to library",
      icon: isSavingLoop ? "fas fa-spinner fa-spin" : "fas fa-bookmark",
      action: (): void => {
        void saveCurrentLoop();
      },
      disabled: isSavingLoop || !source.sequence,
    },
  ]);
  const compactSourceMenuItems = $derived([
    ...(source.canGoBack
      ? [
          {
            label: "Previous path",
            icon: "fas fa-arrow-rotate-left",
            action: (): void => {
              fuseState.previous(side);
            },
          },
        ]
      : []),
    ...sourceMenuItems,
  ]);
</script>

<section
  class="source-card {side}-source"
  data-fuse-layout-region="source-{side}"
  class:loading={source.isLoading}
  class:compact-hero={compactHero}
  class:compact-toolbar={toolbarOnly}
  class:full-card={full}
  class:first-step-picker={firstStepPickerActive}
  aria-label="{label} path"
  aria-busy={source.isLoading}
>
  {#if toolbarOnly}
    <div class="compact-toolbar-identity">
      <span class="source-dot" aria-hidden="true"></span>
      <strong>{label}</strong>
      <span class="toolbar-step">{compactStepLabel}</span>
    </div>
  {:else if !compactHero}
    <h3 class="source-identity">
      <span class="source-dot" aria-hidden="true"></span>
      {label} path
    </h3>
  {/if}

  <div
    class="notation-stage"
    bind:this={stageEl}
    oncontextmenu={openCardContextMenu}
    role="group"
    aria-label="{label} path notation"
  >
    {#if compactHero && compactStep}
      <div class="compact-live-pictograph">
        <PictographContainer
          pictographData={compactStep}
          disableTransitions={true}
          showGrid={true}
          showTKA={false}
          showReversals={true}
          showNonRadialPoints={false}
          showTnD={false}
          showElemental={false}
          showPositions={false}
          showHandPoints={true}
          visibleHand={side}
          darkMode={true}
          leftPropTypeOverride={settings.leftPropType}
          rightPropTypeOverride={settings.rightPropType}
          stepNumberOverride={false}
          cellIndex={0}
          transitionKey={`fuse-${side}-compact`}
          motionStartData={compactMotionFrame?.motionStartData ?? null}
          motionProgress={compactMotionProgress}
          arrowOpacity={compactArrowOpacity}
        />
      </div>
    {:else if displaySequence}
      <div class="notation-scroll themed-scrollbar">
        <FuseLivePathGrid
          sequence={displaySequence}
          {side}
          columns={liveGridColumns}
          cellSize={liveCellSize}
          includeStart={full}
          showMandala={full}
          highlightedStepIndex={highlightIndex}
          leftPropType={settings.leftPropType}
          rightPropType={settings.rightPropType}
          onStepClick={firstStepPickerActive
            ? (stepIndex) => void chooseInlineStartPose(stepIndex)
            : undefined}
          posePicker={firstStepPickerActive}
        />
      </div>
    {:else if source.isLoading || isSymmetryFollower}
      <div class="notation-skeleton" aria-hidden="true"></div>
    {:else}
      <p class="notation-empty">No notation to show.</p>
    {/if}

    {#if compactHero && displaySequence}
      <span class="compact-step-position" aria-hidden="true">
        {compactStepLabel}
      </span>
    {/if}

    {#if source.isLoading && displaySequence && !isSymmetryFollower}
      <div class="notation-loading" aria-hidden="true">
        <i class="fas fa-spinner fa-spin"></i>
      </div>
    {/if}
  </div>

  {#if compactHero}
    {#if isSymmetryFollower}
      <svelte:element
        this={onEditPairing ? "button" : "span"}
        class="compact-derived-indicator"
        class:interactive={Boolean(onEditPairing)}
        type={onEditPairing ? "button" : undefined}
        role={onEditPairing ? undefined : "status"}
        onclick={onEditPairing}
        title="{followerTransformLabel} of {driverLabel}"
        aria-label={onEditPairing
          ? `Change pairing — currently ${followerTransformLabel} of ${driverLabel}`
          : `${followerTransformLabel} of ${driverLabel}`}
      >
        <LOOPIconStrip
          activeComponents={followerGlyph.components}
          reflectionAxis={followerGlyph.reflectionAxis}
          rotationPeriod={followerGlyph.rotationPeriod}
          size={18}
          showFreeformWhenEmpty={false}
        />
      </svelte:element>
    {:else}
      <div class="compact-source-tools">
        <FuseSourceActionPopover
          {side}
          compactTrigger={true}
          disabled={sourceControlsDisabled || !source.sequence}
          {onChooseFirstStep}
        />
        <OverflowMenu
          items={compactSourceMenuItems}
          disabled={sourceControlsDisabled}
          ariaLabel="{label} path options"
          placement="bottom"
          align={side}
        />
      </div>
    {/if}
  {/if}

  {#if isSymmetryFollower && !compactHero}
    <svelte:element
      this={onEditPairing ? "button" : "div"}
      class="follower-note"
      class:interactive={Boolean(onEditPairing)}
      type={onEditPairing ? "button" : undefined}
      role={onEditPairing ? undefined : "status"}
      onclick={onEditPairing}
      aria-label={onEditPairing
        ? `Change pairing — currently ${followerTransformLabel} of ${driverLabel}`
        : undefined}
    >
      <span class="note-glyph" style={followerTransformTint}>
        <LOOPIconStrip
          activeComponents={followerGlyph.components}
          reflectionAxis={followerGlyph.reflectionAxis}
          rotationPeriod={followerGlyph.rotationPeriod}
          size={16}
          showFreeformWhenEmpty={false}
        />
      </span>
      <span class="note-copy">
        <span class="note-role">Rebuilt from {driverLabel}</span>
        <strong>{followerTransformLabel}</strong>
      </span>
      {#if onEditPairing}
        <i class="fas fa-pen-to-square note-edit" aria-hidden="true"></i>
      {/if}
    </svelte:element>
  {:else if !compactHero}
    {#if firstStepPickerActive}
      <div class="first-step-toolbar" role="status" aria-live="polite">
        <div>
          <i class="fas fa-arrow-pointer" aria-hidden="true"></i>
          <span
            ><strong>Choose the start.</strong> Tap the pose above you want to start
            from.</span
          >
        </div>
        <PanelButton variant="secondary" onclick={onCancelFirstStep}>
          Cancel
        </PanelButton>
      </div>
    {:else}
      <div class="source-actions">
        <PanelButton
          variant="secondary"
          fullWidth={true}
          disabled={sourceControlsDisabled || !source.canGoBack}
          onclick={() => fuseState.previous(side)}
        >
          Previous
        </PanelButton>
        <!-- The one button most people will press, and the only way to get a
             new path without deciding anything first. It was the smallest thing
             in the row — same ghost variant as its six neighbours and shorter
             than all of them. Primary, and no shorter than what it sits with. -->
        <div class="shuffle-slot">
          <PanelButton
            variant="primary"
            fullWidth={true}
            disabled={sourceControlsDisabled || !source.sequence}
            onclick={() => void fuseState.shuffle(side)}
          >
            <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
            Regenerate
          </PanelButton>
        </div>
        <FuseSourceActionPopover
          {side}
          disabled={sourceControlsDisabled || !source.sequence}
          {onChooseFirstStep}
        />
        <div class="source-more">
          <OverflowMenu
            items={sourceMenuItems}
            disabled={sourceControlsDisabled}
            ariaLabel="More {label} path actions"
            align="right"
            triggerPresentation="labelled"
          >
            {#snippet trigger()}
              <span>More</span>
              <i class="fas fa-chevron-down" aria-hidden="true"></i>
            {/snippet}
          </OverflowMenu>
        </div>
      </div>
    {/if}
  {/if}
</section>

{#if displaySequence}
  <ChoreoCardContextMenuHost
    bind:this={cardContextMenuHost}
    sequence={displaySequence}
    onSaveToLibrary={() => saveCurrentLoop(displaySequence)}
    includePictographSection={false}
  />
{/if}

{#if nextSequence && !isSymmetryFollower && !toolbarOnly}
  {#key nextSequence}
    <div class="prewarm" aria-hidden="true">
      <ChoreoCard
        sequence={nextSequence}
        browseViewMode={viewMode}
        columnCount={stepColumns}
        startPositionLayoutOverride={startLayout}
        includeStartPosition={full}
        showMandala={full}
        showWord={false}
        showStepNumbers={true}
        showDifficultyLevel={false}
        showNotes={false}
        showLoopGlyph={false}
        darkMode={true}
        leftPropType={settings.leftPropType}
        rightPropType={settings.rightPropType}
        hideSoloHeader={true}
        fitWidth={true}
      />
    </div>
  {/key}
{/if}

{#if pickerOpen}
  <FuseSoloLoopPicker
    open
    {side}
    length={fuseState.appliedLength ?? 0}
    onSelect={handleLibrarySelect}
    onClose={() => (pickerOpen = false)}
  />
{/if}

{#if vtgOpen}
  <FuseVtgPathPicker
    {side}
    onSelect={handleVtgSelect}
    onClose={() => (vtgOpen = false)}
  />
{/if}

{#if inspectedSequence}
  <CardInspectModal
    sequence={inspectedSequence}
    presentation="live"
    browseViewMode={viewMode}
    leftPropType={settings.leftPropType}
    rightPropType={settings.rightPropType}
    onClose={() => (inspectedSequence = null)}
  />
{/if}

<style>
  .source-card {
    --source-color: var(--prop-blue, #2196f3);
    container: fuse-source / inline-size;
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--settings-spacing-sm, 10px);
    min-width: 0;
    padding: var(--settings-spacing-md, 16px);
    overflow: hidden;
    border: 1px solid
      color-mix(in srgb, var(--source-color) 32%, var(--theme-stroke));
    border-radius: var(--settings-radius-lg, 20px);
    background:
      linear-gradient(
        145deg,
        color-mix(in srgb, var(--source-color) 8%, transparent),
        transparent 42%
      ),
      var(--theme-card-bg, rgba(255, 255, 255, 0.045));
  }

  .left-source {
    grid-area: left;
  }

  .right-source {
    --source-color: var(--prop-red, #f44336);
    grid-area: right;
  }

  .source-card.loading {
    border-style: dashed;
  }

  .source-card.first-step-picker {
    border-color: color-mix(in srgb, var(--source-color) 72%, white);
    box-shadow:
      inset 0 0 0 1px color-mix(in srgb, var(--source-color) 35%, transparent),
      0 0 28px color-mix(in srgb, var(--source-color) 18%, transparent);
  }

  .notation-empty {
    display: grid;
    place-items: center;
    width: 100%;
    height: 100%;
    min-height: 150px;
    padding: 18px;
    margin: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.58));
    font-size: var(--font-size-min, 14px);
    text-align: center;
  }

  .notation-skeleton {
    background: color-mix(in srgb, var(--theme-text, white) 8%, transparent);
    animation: loading-pulse 1.4s ease-in-out infinite;
  }

  .notation-stage {
    position: relative;
    isolation: isolate;
    flex: 1 1 180px;
    min-height: 150px;
    overflow: hidden;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--settings-radius-md, 14px);
    background: var(--theme-panel-bg);
  }

  .source-identity {
    display: flex;
    align-items: center;
    gap: 7px;
    min-height: 20px;
    margin: 0;
    color: var(--theme-text, white);
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    line-height: 1;
  }

  .notation-scroll {
    position: relative;
    z-index: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .compact-live-pictograph {
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .compact-step-position {
    position: absolute;
    z-index: 2;
    bottom: 7px;
    left: 7px;
    min-width: 7ch;
    padding: 4px 6px;
    border-radius: 999px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.72));
    background: var(--theme-panel-bg);
    font-size: var(--font-size-min, 14px);
    font-variant-numeric: tabular-nums;
    font-weight: 700;
    white-space: nowrap;
  }

  .compact-source-tools,
  .compact-derived-indicator {
    position: absolute;
    z-index: 4;
    top: 14px;
    right: 14px;
  }

  .compact-source-tools {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .compact-derived-indicator {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    border: 1px solid
      color-mix(in srgb, var(--source-color) 62%, var(--theme-stroke));
    border-radius: 50%;
    color: color-mix(in srgb, var(--source-color) 70%, white);
    background: color-mix(
      in srgb,
      var(--source-color) 17%,
      var(--theme-panel-bg)
    );
    font-size: var(--font-size-min, 14px);
  }

  .compact-derived-indicator.interactive {
    cursor: pointer;
  }

  .compact-derived-indicator.interactive:focus-visible {
    outline: 2px solid var(--source-color);
    outline-offset: 2px;
  }

  .notation-skeleton {
    width: 100%;
    height: 100%;
  }

  /* Instant response to Shuffle: the old card stays put while the next path
     loads, with a colored spinner over it so the tap registers immediately. */
  .notation-loading {
    position: absolute;
    z-index: 3;
    top: 8px;
    right: 8px;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    color: color-mix(in srgb, var(--source-color) 85%, white);
    background: var(--theme-panel-bg);
    font-size: 14px;
  }

  .source-actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--settings-spacing-sm, 8px);
    margin-top: auto;
  }

  .source-more,
  .source-more :global(.overflow-menu) {
    width: 100%;
    min-width: 0;
  }

  .source-more :global(.overflow-dropdown) {
    min-width: 230px;
  }

  .source-actions :global(.panel-btn) {
    width: 100%;
    min-width: 0;
    padding-inline: 10px;
    white-space: nowrap;
  }

  .first-step-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: var(--min-touch-target, 44px);
    margin-top: auto;
    padding: 6px 8px 6px 14px;
    border: 1px solid
      color-mix(in srgb, var(--source-color) 58%, var(--theme-stroke));
    border-radius: var(--settings-radius-md, 14px);
    background: color-mix(
      in srgb,
      var(--source-color) 12%,
      var(--theme-panel-bg)
    );
  }

  .first-step-toolbar > div {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.72));
    font-size: var(--font-size-min, 14px);
  }

  .first-step-toolbar i,
  .first-step-toolbar strong {
    color: color-mix(in srgb, var(--source-color) 76%, white);
  }

  /* Footer for the derived follower in symmetry mode. Occupies the same slot the
     action row would, at the touch-target height, so swapping in and out of
     symmetry doesn't resize the card. When the host can open the Pairing editor
     this IS that button — a solid border and a hover, not dashed hint text. */
  .follower-note {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    margin-top: auto;
    padding: 6px 12px;
    border: 1px solid
      color-mix(in srgb, var(--source-color) 46%, var(--theme-stroke));
    border-radius: var(--settings-radius-md, 14px);
    color: var(--theme-text, #fff);
    background: color-mix(
      in srgb,
      var(--source-color) 12%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04))
    );
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    text-align: left;
  }

  .follower-note.interactive {
    cursor: pointer;
    transition:
      border-color var(--duration-fast, 120ms) ease,
      background var(--duration-fast, 120ms) ease;
  }

  .follower-note.interactive:hover {
    border-color: color-mix(in srgb, var(--source-color) 82%, transparent);
    background: color-mix(
      in srgb,
      var(--source-color) 22%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04))
    );
  }

  .follower-note.interactive:focus-visible {
    outline: 2px solid var(--source-color);
    outline-offset: 2px;
  }

  /* The rule's own LOOP colour, the same glyph and sweep the Pairing tiles use,
     so the footer names the rule you picked instead of a generic link icon. */
  .note-glyph {
    --c1: var(--loop-c1, var(--theme-accent, #8b5cf6));
    --c2: var(--loop-c2, var(--c1));
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    width: 30px;
    height: 30px;
    border: 1.5px solid color-mix(in srgb, var(--c1) 58%, transparent);
    border-radius: 9px;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--c1) 26%, transparent) 0%,
      color-mix(in srgb, var(--c2) var(--loop-c2-mix, 9%), transparent) 100%
    );
    color: var(--c1);
    font-size: var(--font-size-min, 14px);
  }

  .note-copy {
    display: grid;
    gap: 1px;
    min-width: 0;
  }

  .note-role {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.62));
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
  }

  .note-copy strong {
    overflow: hidden;
    font-weight: 750;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* Absolute so the identity stays centred in the bar; a right auto-margin
     would drag it to the left edge and leave the middle empty. */
  .note-edit {
    position: absolute;
    right: 12px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
  }

  .follower-note.interactive:hover .note-edit {
    color: var(--theme-text, #fff);
  }

  /* Regenerate is the primary action, tinted in the path's color; the word
     "Blue" / "Red" is redundant with the tint, so the label is just the verb.
     The slot is a grid so the button fills the row's height — the neighbours
     wrap to two lines and grew to 72px while this one sat at 48, which made
     the most important control the smallest thing in the row. */
  .shuffle-slot {
    display: grid;
  }

  .shuffle-slot :global(.panel-btn) {
    height: 100%;
    border-color: color-mix(in srgb, var(--source-color) 78%, transparent);
    background: color-mix(
      in srgb,
      var(--source-color) 34%,
      var(--theme-card-bg, #161821)
    );
    color: var(--theme-text, #fff);
    font-weight: 700;
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--source-color) 45%, transparent),
      0 6px 18px color-mix(in srgb, var(--source-color) 22%, transparent);
  }

  .shuffle-slot :global(.panel-btn:focus-visible) {
    outline: 2px solid var(--source-color);
    outline-offset: 2px;
  }

  /* Hidden pre-render of the next Shuffle candidate — off-screen, no hit
     testing, fixed size so the cells actually rasterize into the cache. */
  .prewarm {
    position: absolute;
    left: -10000px;
    top: 0;
    width: 240px;
    height: 300px;
    overflow: hidden;
    opacity: 0;
    pointer-events: none;
  }

  @keyframes loading-pulse {
    0%,
    100% {
      opacity: 0.45;
    }
    50% {
      opacity: 0.9;
    }
  }

  @media (hover: hover) and (pointer: fine) {
    .shuffle-slot :global(.panel-btn:hover:not(:disabled)) {
      background: color-mix(
        in srgb,
        var(--source-color) 46%,
        var(--theme-card-bg, #161821)
      );
    }
  }

  .source-card.compact-hero {
    height: 100%;
    min-height: 0;
    gap: 0;
    padding: 7px;
    overflow: visible;
    border-color: color-mix(
      in srgb,
      var(--source-color) 52%,
      var(--theme-stroke, transparent)
    );
    border-radius: var(--settings-radius-md, 14px);
    /* The prop identity belongs to the whole card — border, wash, and a full
       ring — never a bar down one edge. See no-left-edge-accent-bar.md. */
    box-shadow: 0 0 0 1px
      color-mix(in srgb, var(--source-color) 40%, transparent);
    background:
      linear-gradient(
        145deg,
        color-mix(in srgb, var(--source-color) 13%, transparent),
        transparent 50%
      ),
      var(--theme-card-bg, rgba(255, 255, 255, 0.045));
  }

  .source-card.compact-hero.compact-toolbar {
    flex-direction: row;
    align-items: center;
    height: var(--min-touch-target, 48px);
    min-height: var(--min-touch-target, 48px);
    padding: 3px 2px 3px 6px;
    overflow: visible;
  }

  .compact-toolbar .notation-stage {
    display: none;
  }

  .compact-toolbar-identity {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    column-gap: 4px;
    min-width: 0;
    color: var(--theme-text, white);
  }

  .compact-toolbar-identity strong {
    min-width: 0;
    overflow: hidden;
    font-size: var(--font-size-min, 14px);
    line-height: 1.05;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .source-dot {
    grid-row: 1 / span 2;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--source-color);
    box-shadow: 0 0 10px
      color-mix(in srgb, var(--source-color) 72%, transparent);
  }

  .toolbar-step {
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    font-variant-numeric: tabular-nums;
    line-height: 1;
    white-space: nowrap;
  }

  .compact-toolbar .compact-source-tools,
  .compact-toolbar .compact-derived-indicator {
    position: static;
    flex: 0 0 auto;
    margin-left: auto;
  }

  .compact-toolbar .compact-source-tools {
    gap: 4px;
  }

  .compact-toolbar .compact-derived-indicator {
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
  }

  /* The compact menu is intentionally local to its source card. Raise that
     card while the trigger/menu owns focus so adjacent controls cannot paint
     over the lower transform actions. */
  .source-card.compact-hero:focus-within {
    z-index: 30;
  }

  .compact-hero .notation-stage {
    flex: 1 1 0;
    min-height: 0;
    border-color: color-mix(
      in srgb,
      var(--source-color) 24%,
      var(--theme-stroke, transparent)
    );
    border-radius: calc(var(--settings-radius-md, 14px) - 3px);
  }

  .compact-hero .notation-scroll {
    overflow: hidden;
  }

  .compact-hero .notation-loading {
    top: 50%;
    right: auto;
    left: 50%;
    transform: translate(-50%, -50%);
  }

  .compact-hero :global(.overflow-trigger) {
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    border-color: color-mix(
      in srgb,
      var(--source-color) 38%,
      var(--theme-stroke, transparent)
    );
    background: color-mix(
      in srgb,
      var(--source-color) 12%,
      var(--theme-card-bg, #161821)
    );
  }

  .compact-hero :global(.overflow-dropdown) {
    min-width: 210px;
  }

  @container fuse (max-width: 599px) {
    .source-card {
      padding: 14px;
      gap: 10px;
    }

    .source-actions {
      margin-top: 0;
    }
  }

  @container fuse (min-width: 600px) and (max-width: 1500px) {
    .first-step-toolbar {
      min-height: calc(var(--min-touch-target, 44px) * 2 + 8px);
    }
  }

  /* FuseLayout owns the full-card breakpoint and passes it as a prop. These
     mode styles follow that same decision so browser zoom cannot leave full
     markup with the compact card geometry. */
  .source-card.full-card {
    min-height: 0;
    gap: 8px;
    padding: 12px;
  }

  .full-card .notation-stage {
    min-height: 64px;
  }

  @container fuse (min-width: 1100px) and (max-width: 1500px) and (min-height: 780px) {
    .source-card {
      gap: 8px;
      padding: 12px;
    }
  }

  /* The toolbar responds to the source card, not the whole Fuse workspace.
     This matters around split-pane and browser-zoom seams where the page can
     be wide while the card itself is still too narrow for seven labels. */
  @container fuse-source (min-width: 520px) {
    .source-actions {
      grid-template-columns:
        minmax(0, 0.8fr) minmax(0, 1.25fr) minmax(0, 1fr)
        minmax(0, 0.8fr);
    }
  }

  @container fuse (min-width: 1680px) and (min-height: 900px) {
    .source-actions :global(.panel-btn) {
      min-width: 0;
      padding-inline: 12px;
      font-size: 16px;
      white-space: nowrap;
    }

    .follower-note {
      font-size: 16px;
    }
  }

  /* One-page fit layouts only (mirrors FuseLayout's fr-row conditions).
     min-height: 0 lets the card shrink inside its fr row; anywhere else it
     zeroes the card's minimum contribution and collapses the auto grid rows.
     The fitted pictographs shrink with the stage instead of making it scroll. */
  @container fuse (min-width: 600px) and (min-height: 600px) {
    .source-card {
      min-height: 0;
    }

    .notation-stage {
      min-height: 64px;
    }
  }

  @container fuse (min-width: 1100px) {
    .source-card {
      padding: clamp(14px, 1.4cqw, 22px);
    }
  }

  /* Locked desktop columns get their taller notation floor back. */
  @container fuse (min-width: 1100px) and (min-height: 780px) {
    .notation-stage {
      min-height: 120px;
    }
  }

  @container fuse (min-width: 1100px) and (max-width: 1500px) and (min-height: 780px) {
    .notation-stage {
      min-height: 64px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .notation-skeleton,
    .change-flash,
    .notation-loading .fa-spin {
      animation: none;
    }
  }
</style>
