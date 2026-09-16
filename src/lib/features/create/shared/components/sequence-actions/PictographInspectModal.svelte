<!--
  PictographInspectModal.svelte

  Developer debug modal showing full pictograph metadata.
  Designed for widescreen desktop use with easy copy-paste for AI agents.
-->
<script lang="ts">
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import {
    HandSide,
    type HandSide as HandSideValue,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import { generateOrientationKey } from "$lib/shared/pictograph/arrow/positioning/key-generation/services/special-placement-ori-key-generator";
  import { deriveGridMode } from "$lib/shared/pictograph/grid/services/grid-mode-deriver";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { calculateAllArrowPoints } from "$lib/shared/pictograph/arrow/orchestration/services/arrow-positioning-orchestrator";
  import { specialPlacer } from "$lib/shared/pictograph/arrow/positioning/placement/services/special-placer";
  import { generateRotationAngleOverrideKey } from "$lib/shared/pictograph/arrow/positioning/key-generation/services/rotation-angle-override-key-generator";
  import { turnsTupleGenerator } from "$lib/shared/pictograph/arrow/positioning/placement/services/turns-tuple-generator";

  import type { PipelineDiagnostics } from "$lib/shared/pictograph/arrow/positioning/calculation/domain/pipeline-diagnostics";
  import { arrowAdjustmentCalculator } from "$lib/shared/pictograph/arrow/positioning/calculation/services/arrow-adjustment-calculator";
  import { arrowLocationCalculator } from "$lib/shared/pictograph/arrow/positioning/calculation/services/arrow-location-calculator";

  import InspectModalHeader from "./pictograph-inspect/InspectModalHeader.svelte";
  import BasicInfoBar from "./pictograph-inspect/BasicInfoBar.svelte";
  import MotionColumn from "./pictograph-inspect/MotionColumn.svelte";
  import { formatAllForAI } from "./pictograph-inspect/formatters";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import PipelineEditorDock from "./pictograph-inspect/PipelineEditorDock.svelte";
  import { selectedArrowState } from "$lib/shared/create/state/selected-arrow-state.svelte";

  interface Props {
    show: boolean;
    stepData: StepData | null;
    onClose: () => void;
    /** When set, the editor dock shows a single "Done" button that persists the
        edit then calls this (one-shot flows like choreo-card Fix Arrows). */
    onDone?: () => void;
  }

  let { show, stepData, onClose, onDone }: Props = $props();

  // Calculated data with arrow positions populated
  let calculatedData = $state<StepData | null>(null);
  let pictographDataState = $state<PictographData | null>(null);
  let isCalculating = $state(false);

  // Rotation override status for each hand (only applies to STATIC/DASH)
  let leftRotationOverride = $state<{ hasOverride: boolean } | null>(null);
  let rightRotationOverride = $state<{ hasOverride: boolean } | null>(null);

  let leftDiagnostics = $state<PipelineDiagnostics | null>(null);
  let rightDiagnostics = $state<PipelineDiagnostics | null>(null);

  // Lookup keys for debugging
  let lookupKeys = $state<{
    gridMode: string;
    oriKey: string;
    turnsTuple: string;
    leftRotationOverrideKey: string | null;
    rightRotationOverrideKey: string | null;
  } | null>(null);

  // Accordion open state — all collapsed on open (spec: AAA, no overload)
  let leftOpen = $state(false);
  let rightOpen = $state(false);

  // When an arrow is clicked in the live pictograph, expand + edit that section.
  // Driven imperatively via the selection observer (same pattern ArrowSvg uses),
  // NOT a reactive $effect — reading the global selection inside an effect that
  // also writes open-state participates in cross-component update loops.
  let lastSelectedHand: HandSideValue | null = null;
  $effect(() => {
    const unsubscribe = selectedArrowState.subscribe(() => {
      const hand = selectedArrowState.selectedArrow?.hand ?? null;
      if (hand === lastSelectedHand) return;
      lastSelectedHand = hand;
      if (hand === HandSide.LEFT) {
        leftOpen = true;
      } else if (hand === HandSide.RIGHT) {
        rightOpen = true;
      }
    });
    return unsubscribe;
  });

  // Calculate arrow positions when modal opens. Reset stale state on the OPEN
  // transition (these writes aren't effect deps, so they don't re-trigger).
  // Close-side teardown — especially the GLOBAL selectedArrowState.clearSelection()
  // — must NOT live here: mutating global state inside a reactive effect fires
  // observers mid-flush, re-entering the effect graph and throwing
  // effect_update_depth_exceeded. Teardown lives in requestClose() instead.
  $effect(() => {
    if (show && stepData) {
      calculatedData = null;
      pictographDataState = null;
      leftRotationOverride = null;
      rightRotationOverride = null;
      lookupKeys = null;
      leftDiagnostics = null;
      rightDiagnostics = null;
      // Wide desktop / 4K: the columns pack side-by-side, so start everything
      // expanded — no reason to make the user click through on a big screen.
      // Narrow: start collapsed to avoid a tall scroll tower.
      const wide =
        typeof window !== "undefined" &&
        window.matchMedia("(min-width: 1600px)").matches;
      leftOpen = wide;
      rightOpen = wide;
      lastSelectedColor = null;
      calculateArrowPositions();
    }
  });

  // Imperative close: clear global selection + collapse sections, THEN ask the
  // parent to hide. Runs in an event handler (not a reactive flush), so the
  // global notifyObservers() cascade is processed in a normal, non-re-entrant
  // update cycle.
  function requestClose() {
    selectedArrowState.clearSelection();
    leftOpen = false;
    rightOpen = false;
    lastSelectedColor = null;
    onClose();
  }

  async function calculateArrowPositions() {
    if (!stepData) return;

    isCalculating = true;
    try {
      const pictographData: PictographData = {
        id: stepData.id,
        letter: stepData.letter,
        startPlacement: stepData.startPlacement,
        endPlacement: stepData.endPlacement,
        motions: stepData.motions,
      };

      // Store for use in formatAllForAI
      pictographDataState = pictographData;

      const calculated = await calculateAllArrowPoints(pictographData);

      // Arrow-point calculation returns partial motions (it only computes
      // present/visible hands); keep the step's original motion for any hand
      // it skipped so the both-required Step shape holds.
      calculatedData = {
        ...stepData,
        motions: {
          left: calculated.motions.left ?? stepData.motions.left,
          right: calculated.motions.right ?? stepData.motions.right,
        },
      };

      await checkRotationOverrides(pictographData);
      calculateLookupKeys(pictographData);
      await calculateDiagnostics(pictographData);
    } catch (err) {
      console.error("Failed to calculate arrow positions:", err);
      calculatedData = stepData;
    } finally {
      isCalculating = false;
    }
  }

  async function calculateDiagnostics(pictographData: PictographData) {
    const leftMotionData = pictographData.motions?.[HandSide.LEFT];
    const rightMotionData = pictographData.motions?.[HandSide.RIGHT];

    if (leftMotionData) {
      try {
        const location = arrowLocationCalculator.calculateLocation(
          leftMotionData,
          pictographData
        );
        leftDiagnostics = await arrowAdjustmentCalculator.getDiagnostics(
          pictographData,
          leftMotionData,
          pictographData.letter || "",
          location,
          HandSide.LEFT
        );
      } catch (err) {
        console.error("Left diagnostics failed:", err);
        leftDiagnostics = null;
      }
    }

    if (rightMotionData) {
      try {
        const location = arrowLocationCalculator.calculateLocation(
          rightMotionData,
          pictographData
        );
        rightDiagnostics = await arrowAdjustmentCalculator.getDiagnostics(
          pictographData,
          rightMotionData,
          pictographData.letter || "",
          location,
          HandSide.RIGHT
        );
      } catch (err) {
        console.error("Right diagnostics failed:", err);
        rightDiagnostics = null;
      }
    }
  }

  async function refreshDiagnostics() {
    if (pictographDataState) {
      await calculateDiagnostics(pictographDataState);
    }
  }

  function calculateLookupKeys(pictographData: PictographData) {
    try {
      const leftMotionData = pictographData.motions?.[HandSide.LEFT];
      const rightMotionData = pictographData.motions?.[HandSide.RIGHT];

      let gridMode = GridMode.DIAMOND;
      if (leftMotionData && rightMotionData) {
        gridMode = deriveGridMode(leftMotionData, rightMotionData);
      }

      let oriKey = "unknown";
      if (leftMotionData) {
        oriKey = generateOrientationKey(leftMotionData, pictographData);
      }

      const turnsTuple = turnsTupleGenerator.generateTurnsTuple(pictographData);

      let leftRotationOverrideKey = null;
      let rightRotationOverrideKey = null;

      if (leftMotionData) {
        const motionType = leftMotionData.motionType?.toLowerCase();
        if (motionType === "static" || motionType === "dash") {
          leftRotationOverrideKey = generateRotationAngleOverrideKey(
            leftMotionData,
            pictographData
          );
        }
      }

      if (rightMotionData) {
        const motionType = rightMotionData.motionType?.toLowerCase();
        if (motionType === "static" || motionType === "dash") {
          rightRotationOverrideKey = generateRotationAngleOverrideKey(
            rightMotionData,
            pictographData
          );
        }
      }

      lookupKeys = {
        gridMode,
        oriKey,
        turnsTuple,
        leftRotationOverrideKey,
        rightRotationOverrideKey,
      };
    } catch (err) {
      console.error("Failed to calculate lookup keys:", err);
      lookupKeys = null;
    }
  }

  async function checkRotationOverrides(pictographData: PictographData) {
    try {
      const leftMotionData = pictographData.motions?.[HandSide.LEFT];
      if (leftMotionData) {
        const motionType = leftMotionData.motionType?.toLowerCase();
        if (motionType === "static" || motionType === "dash") {
          const leftKey = generateRotationAngleOverrideKey(
            leftMotionData,
            pictographData
          );
          const leftHasOverride = await specialPlacer.hasRotationAngleOverride(
            leftMotionData,
            pictographData,
            leftKey
          );
          leftRotationOverride = { hasOverride: leftHasOverride };
        } else {
          leftRotationOverride = null;
        }
      }

      const rightMotionData = pictographData.motions?.[HandSide.RIGHT];
      if (rightMotionData) {
        const motionType = rightMotionData.motionType?.toLowerCase();
        if (motionType === "static" || motionType === "dash") {
          const rightKey = generateRotationAngleOverrideKey(
            rightMotionData,
            pictographData
          );
          const rightHasOverride = await specialPlacer.hasRotationAngleOverride(
            rightMotionData,
            pictographData,
            rightKey
          );
          rightRotationOverride = { hasOverride: rightHasOverride };
        } else {
          rightRotationOverride = null;
        }
      }
    } catch (err) {
      console.error("Failed to check rotation overrides:", err);
    }
  }

  // The currently-selected arrow hand, used to dim the non-selected motion
  // so focus sits on the one being edited. Pure read — safe in a $derived
  // (the warned-against case is reading selection inside an effect that writes).
  const selectedHand = $derived(selectedArrowState.selectedArrow?.hand ?? null);

  // Select a motion by clicking anywhere in its column — easier than hitting the
  // small arrow in the pictograph. Mirrors what an arrow-click selects (same
  // motionData + pictographData), so isSelected() stays consistent.
  function selectMotion(hand: HandSideValue) {
    if (!stepData) return;
    const motion = hand === HandSide.LEFT ? leftMotion : rightMotion;
    if (!motion) return;
    const pictographData: PictographData = pictographDataState ?? {
      id: stepData.id,
      letter: stepData.letter,
      startPlacement: stepData.startPlacement,
      endPlacement: stepData.endPlacement,
      motions: stepData.motions,
    };
    selectedArrowState.selectArrow(motion, hand, pictographData);
  }

  function handleRailKeydown(e: KeyboardEvent, hand: HandSideValue) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectMotion(hand);
    }
  }

  // Derived display values
  const displayData = $derived(calculatedData ?? stepData);
  const leftMotion = $derived(displayData?.motions?.[HandSide.LEFT]);
  const rightMotion = $derived(displayData?.motions?.[HandSide.RIGHT]);

  // Prop type for the rendered pictograph. Two callers, opposite needs:
  //  - Choreo-card Fix Arrows (onDone set) stamps the card's EFFECTIVE prop onto
  //    motion.propType via withEffectivePropTypes, so the stored value IS the
  //    prop to render — pass it through so the preview matches the card bake.
  //  - Step Editor (onDone unset) passes raw sequence data whose motion.propType
  //    is the baked/stored prop (often staff), NOT the user's live selection.
  //    Passing it would override the live prop (e.g. club). Leave undefined so
  //    PictographContainer falls back to global settings — identical to how the
  //    Step Editor's own PictographContainer resolves the prop.
  const leftPropTypeForRender = $derived(
    onDone ? stepData?.motions?.[HandSide.LEFT]?.propType : undefined
  );
  const rightPropTypeForRender = $derived(
    onDone ? stepData?.motions?.[HandSide.RIGHT]?.propType : undefined
  );

  // Get formatted data for AI
  async function getCopyAllData(): Promise<string> {
    return await formatAllForAI(
      displayData,
      leftMotion,
      rightMotion,
      leftRotationOverride,
      rightRotationOverride,
      pictographDataState ?? undefined
    );
  }

  // Get raw JSON data
  function getCopyJsonData(): string {
    return JSON.stringify(displayData ?? stepData, null, 2);
  }

  // Track copied section for visual feedback
  let copiedSection = $state<string | null>(null);

  async function copyToClipboard(text: string, section: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      copiedSection = section;
      setTimeout(() => {
        copiedSection = null;
      }, 2000);
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
    }
  }

  // No click-outside close any more: the panel fills its host edge to edge, so
  // there is no "outside" left to click — a backdrop handler here would just be
  // a way to dismiss the editor by clicking its own background. Escape and the
  // header's close button are the exits.

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (selectedArrowState.selectedArrow) {
        selectedArrowState.clearSelection();
      } else {
        requestClose();
      }
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if show && stepData}
  <div
    class="inspect-surface"
    onkeydown={handleKeydown}
    role="dialog"
    aria-modal="true"
    aria-label="Pictograph Inspector"
    tabindex="-1"
  >
    <div class="modal-content">
      <InspectModalHeader
        {displayData}
        {stepData}
        {isCalculating}
        {getCopyAllData}
        {getCopyJsonData}
        onClose={requestClose}
      />

      <BasicInfoBar
        {displayData}
        {leftMotion}
        {rightMotion}
        {lookupKeys}
        {copiedSection}
        onCopy={copyToClipboard}
      />

      <div class="modal-body">
        <div class="inspect-layout">
          <!-- Blue left · pictograph center · red right. The non-selected
               motion dims so the eye lands on the one being edited. Clicking
               anywhere in a column selects that motion (no need to hit the
               small arrow in the pictograph). -->
          <div
            class="motion-rail"
            class:dimmed={selectedHand === HandSide.RIGHT}
            class:selected={selectedHand === HandSide.LEFT}
            role="button"
            tabindex="0"
            aria-pressed={selectedHand === HandSide.LEFT}
            aria-label="Select left motion"
            onclick={() => selectMotion(HandSide.LEFT)}
            onkeydown={(e) => handleRailKeydown(e, HandSide.LEFT)}
          >
            <MotionColumn
              hand={HandSide.LEFT}
              motion={leftMotion}
              rotationOverride={leftRotationOverride}
              diagnostics={leftDiagnostics}
              {copiedSection}
              onCopy={copyToClipboard}
              open={leftOpen}
              onToggle={(next) => (leftOpen = next)}
            />
          </div>

          <div class="pictograph-rail">
            {#if displayData}
              <div class="pictograph-frame">
                <PictographContainer
                  pictographData={displayData}
                  arrowsClickable={true}
                  disableTransitions={true}
                  leftPropTypeOverride={leftPropTypeForRender}
                  rightPropTypeOverride={rightPropTypeForRender}
                />
              </div>
            {/if}
          </div>

          <div
            class="motion-rail"
            class:dimmed={selectedHand === HandSide.LEFT}
            class:selected={selectedHand === HandSide.RIGHT}
            role="button"
            tabindex="0"
            aria-pressed={selectedHand === HandSide.RIGHT}
            aria-label="Select right motion"
            onclick={() => selectMotion(HandSide.RIGHT)}
            onkeydown={(e) => handleRailKeydown(e, HandSide.RIGHT)}
          >
            <MotionColumn
              hand={HandSide.RIGHT}
              motion={rightMotion}
              rotationOverride={rightRotationOverride}
              diagnostics={rightDiagnostics}
              {copiedSection}
              onCopy={copyToClipboard}
              open={rightOpen}
              onToggle={(next) => (rightOpen = next)}
            />
          </div>
        </div>
      </div>

      <PipelineEditorDock
        {stepData}
        {leftDiagnostics}
        {rightDiagnostics}
        onDiagnosticsChanged={refreshDiagnostics}
        {onDone}
      />
    </div>
  </div>
{/if}

<style>
  /*
   * A VIEW, not a dialog.
   *
   * This was a `position: fixed` modal with its own scrim, size caps and
   * centering — rendered inside the step-editor drawer, whose <dialog> carries
   * transform + will-change and therefore captures fixed positioning. So it was
   * a viewport-modal that could never reach the viewport: it dimmed a surface
   * that was already dimmed glass, sized itself against a viewport it wasn't in,
   * and centered the result in a column a fifth that width. The empty bands, the
   * 280px hero, the dead responsive tier and the near-black stack were all
   * downstream of that one mistake.
   *
   * It now fills its host and nothing else. `fixed` already resolves to the
   * drawer's <dialog> (transform + will-change make it the containing block) and
   * to the viewport in the choreo card host — so one rule serves both, and the
   * containing block that used to be the trap becomes the feature.
   */
  .inspect-surface {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    display: flex;
    animation: fadeIn var(--duration-fast, 0.15s) ease-out;
  }

  .modal-content {
    /* The panel token is translucent (0.75), which was fine under a scrim and is
       not fine without one — the step editor behind it stayed legible and the two
       headers overlapped. Blurring the backdrop destroys the text underneath
       while keeping the scene's colour, so the panel reads as frosted depth
       rather than as a second opaque slab. */
    background: var(--theme-panel-bg, rgba(13, 17, 23, 0.98));
    backdrop-filter: blur(22px) saturate(115%);
    -webkit-backdrop-filter: blur(22px) saturate(115%);
    width: 100%;
    height: 100%;
    overflow: hidden;
    /* Everything below sizes off THIS box, not the viewport. Without it the
       responsive tier keyed to the panel's own width can never fire. */
    container-type: inline-size;
    container-name: inspect;
    display: flex;
    flex-direction: column;
  }

  .modal-body {
    /* Take the space between the info bar and the dock. The old rule hugged
       content to avoid letterboxing — correct back when nothing inside could
       grow. Now the pictograph absorbs the slack, so filling is the right call
       and the dead band is gone. */
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: 16px;
    scrollbar-width: thin;
    scrollbar-color: var(--theme-stroke, #30363d) transparent;
  }

  /*
   * DEFAULT: hero left, the two motion columns standing in a side rail.
   *
   * Three-across used to be the default and is now reserved for a genuinely wide
   * host. In the step-editor drawer — the panel's usual home, ~900-1000px — it
   * put a short blue column, a floating square, and a short red column in one
   * ragged row and left a dead band under all three. Side-rail bounds the square
   * by the wider axis and stacks the reference data to fill the height.
   */
  .inspect-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(280px, 320px);
    grid-template-areas:
      "picto blue"
      "picto red";
    grid-template-rows: auto auto;
    gap: 20px;
    align-content: start;
    /* Claim the body's full height so the pictograph has something to grow into. */
    height: 100%;
    min-height: 0;
  }
  .inspect-layout > .motion-rail:first-child {
    grid-area: blue;
  }
  .inspect-layout > .motion-rail:last-child {
    grid-area: red;
  }
  .motion-rail {
    min-width: 0;
    cursor: pointer;
    border-radius: 16px;
    padding: 4px;
    /* Same white-lift reasoning as the pictograph frame: these read as distinct
       surfaces instead of dissolving into the panel. Kept below the frame's lift
       so the hero still sits highest. */
    background: rgba(255, 255, 255, 0.03);
    /* Click anywhere in the column to select; ring marks the selected one. */
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    transition:
      opacity var(--duration-normal, 0.3s) ease,
      border-color var(--duration-fast, 0.15s) ease;
  }
  .motion-rail.selected {
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #58a6ff) 55%,
      transparent
    );
  }
  .motion-rail:focus-visible {
    outline: 2px solid var(--theme-accent, #58a6ff);
    outline-offset: 2px;
  }
  /* The motion not currently selected recedes so focus stays on the edited one. */
  .motion-rail.dimmed {
    opacity: 0.4;
  }
  /* Center the pictograph against the taller motion columns so the focal
     element sits balanced instead of pinned to the top with a void beneath.
     Sticky keeps it in view if the sides ever scroll. */
  .pictograph-rail {
    grid-area: picto;
    align-self: center;
    /* Size to whichever of the two axes runs out first, so the pictograph is as
       large as the panel allows and still square. */
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 0;
    height: 100%;
    /* A size container so the frame can read this rail's HEIGHT in CSS (cqh).
       Without it the square has no way to know which axis runs out first: a
       width-driven rule stretched to 826x722 once the panel passed ~1050px,
       and a height-driven one stretched to 458x618 when the panel was narrow. */
    container-type: size;
  }
  .pictograph-frame {
    /* A WHITE lift, not the card token. In dark mode `--theme-card-bg` resolves
       to the same rgba(0,0,0,0.75) as the panel it sits on, and nested alpha can
       only darken — so a black-on-black child can never read as elevated no
       matter how the opacities are tuned. Lifting is the only direction that
       works here. */
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.14));
    border-radius: 16px;
    padding: 16px;
    aspect-ratio: 1 / 1;
    display: flex;
    align-items: center;
    justify-content: center;
    /* The largest square that fits BOTH axes, stated once: the smaller of the
       column's width and the rail's height. `aspect-ratio` then supplies the
       height, so no rule can fight it into a rectangle. */
    width: min(100%, 100cqh);
    height: auto;
    margin-inline: auto;
  }

  /*
   * Three columns need ~940px of PANEL width. The old rule asked the VIEWPORT,
   * which is ~1900px while this panel is ~840px inside the drawer — so it never
   * fired and all three columns sat crushed on their minmax floors, rendering
   * the pictograph at its 280px minimum. Asking the container is the fix.
   *
   * Narrow: the pictograph takes the full width on top (the tall drawer has
   * height to spare) and the two motion columns share the row beneath, which is
   * how they both fit at a readable width instead of at 300px.
   */
  /*
   * Hero beside the data, not above it. Stacking the pictograph on top consumed
   * the height but left ~570px of empty rail either side of the square — the same
   * dead-space complaint on the other axis. Standing the two motion columns in a
   * side rail means the square is bounded by the wider of the two axes and BOTH
   * get consumed: measured 280px -> 470px on the same panel.
   */
  /*
   * Three-across earns its keep only when all three columns can be full-width at
   * once — roughly 1200px of PANEL. Below that it degrades into the ragged row
   * described above, which is exactly what the drawer was getting.
   */
  @container inspect (min-width: 1200px) {
    .inspect-layout {
      /* Ratios, not a hard cap. A `min(40cqw, 46vh)` middle column collapsed the
         hero from 706px to 462px the instant this tier took over — a visible
         cliff at the boundary. The frame's own cqh rule already guarantees the
         square, so the column only has to claim its share. */
      grid-template-columns:
        minmax(280px, 1fr)
        minmax(360px, 1.6fr)
        minmax(280px, 1fr);
      grid-template-areas: "blue picto red";
      grid-template-rows: minmax(0, 1fr);
      /* Center the row rather than pinning it to the top — a short blue column,
         a square, and a short red column hugging the top is what left the dead
         band underneath. */
      align-content: center;
      align-items: center;
    }
  }
  /* One column only when even two motion columns can't be read side by side. */
  @container inspect (max-width: 560px) {
    .inspect-layout {
      grid-template-columns: 1fr;
      grid-template-areas:
        "picto"
        "blue"
        "red";
      grid-template-rows: auto auto auto;
    }
    /* Rows are content-sized here, so the base `height: 100%` on the rail has
       nothing definite to resolve against and collapsed the square to 283x33.
       Let content drive the height and let the body scroll. */
    /* Rows are content-sized here, so the base `height: 100%` on the rail has
       nothing definite to resolve against and collapsed the square to 283x33.
       Content drives the height and the body scrolls — which also means the rail
       has no definite height, so `cqh` would resolve to 0. Width alone governs. */
    .pictograph-rail {
      height: auto;
      container-type: normal;
    }
    .pictograph-frame {
      width: 100%;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .motion-rail {
      transition: none;
    }
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  /* The old `slideUp` keyframes and the 600px card-shape tier went with the
     dialog shell: a view that fills its host has no card to round off and no
     off-centre position to rise from. */

  @media (prefers-reduced-motion: reduce) {
    .inspect-surface {
      animation: none;
    }
  }
</style>
