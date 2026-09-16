<!--
  DisassembleTransition.svelte

  Renders three synchronized CanvasSurface leaves in the disassembled layout.
  Stays mounted for all non-assembled states (disassembling, disassembled, reassembling)
  to avoid canvas re-initialization flashes.

  Renders the non-recursive CanvasSurface leaf (NOT AnimatorCanvas) to avoid the
  AnimatorCanvas -> DisassembleTransition -> AnimatorCanvas import cycle. The FLIP
  entrance/exit animation wraps the same three-canvas render as DisassembleCanvasView;
  the slot divs carry bind:this refs for FLIP measurement so the views are kept as
  two independent repoints rather than composed.

  Animates entrance/exit using FLIP technique with Web Animations API.
  When direction is "idle", just renders the static disassembled layout.
-->
<script lang="ts">
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import type { StartPlacementData } from "$lib/shared/foundation/domain/models/start-placement-data";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { Letter } from "$lib/shared/foundation/domain/models/letter";
  import type { PropState } from "$lib/shared/foundation/domain/types/prop-state";
  import type { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import type { FireOverlayConfig } from "../domain/types/fire-types";
  import type { LedOverlayConfig } from "../domain/types/led-types";
  import CanvasSurface from "./CanvasSurface.svelte";
  import SegmentedSequenceProgressBar from "./layers/SegmentedSequenceProgressBar.svelte";
  import { untrack } from "svelte";

  interface Props {
    direction: "disassemble" | "reassemble" | "idle";
    assembledRect: DOMRect | null;
    leftProp: PropState | null;
    rightProp: PropState | null;
    gridVisible?: boolean;
    gridMode?: GridMode | null;
    backgroundAlpha?: number;
    letter?: Letter | null;
    stepData?: StartPlacementData | StepData | null;
    sequenceData?: SequenceData | null;
    currentStep?: number;
    isPlaying?: boolean;
    word?: string | null;
    fireConfig?: Partial<FireOverlayConfig>;
    ledConfig?: Partial<LedOverlayConfig>;
    oncomplete: () => void;
  }

  let {
    direction,
    assembledRect,
    leftProp,
    rightProp,
    gridVisible = true,
    gridMode = null,
    backgroundAlpha = 0,
    letter = null,
    stepData = null,
    sequenceData = null,
    currentStep = 0,
    isPlaying = false,
    word = null,
    fireConfig = undefined,
    ledConfig = undefined,
    oncomplete,
  }: Props = $props();

  // Shared props for all three CanvasSurface leaves.
  // Shell-only props (word/focused/hideProgressBar/fillContainer) live on
  // AnimatorCanvas, not CanvasSurface, so they are intentionally omitted here.
  const shared = $derived({
    gridVisible,
    gridMode,
    backgroundAlpha,
    letter,
    stepData,
    sequenceData,
    currentStep,
    isPlaying,
    fireConfig,
    ledConfig,
  });

  // Element references for FLIP measurement
  let viewElement: HTMLDivElement;
  let heroSlotEl: HTMLDivElement;
  let smallLeftSlotEl: HTMLDivElement;
  let smallRightSlotEl: HTMLDivElement;
  let progressSlotEl = $state<HTMLDivElement>();

  const DURATION = 600;
  const EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

  function getAssembledRect(containerRect: DOMRect): {
    left: number;
    top: number;
    width: number;
    height: number;
  } {
    if (assembledRect) return assembledRect;
    // Fallback: estimate a centered square (75% of height to account for chrome)
    const side = Math.min(containerRect.width, containerRect.height * 0.75);
    return {
      left: containerRect.left + (containerRect.width - side) / 2,
      top: containerRect.top + (containerRect.height - side) / 2,
      width: side,
      height: side,
    };
  }

  function calcFlipTransform(
    slotRect: DOMRect,
    targetRect: { left: number; top: number; width: number; height: number }
  ) {
    const slotW = slotRect.width || 1;
    const slotH = slotRect.height || 1;
    const slotCenterX = slotRect.left + slotW / 2;
    const slotCenterY = slotRect.top + slotH / 2;
    const targetCenterX = targetRect.left + (targetRect.width || slotW) / 2;
    const targetCenterY = targetRect.top + (targetRect.height || slotH) / 2;

    return {
      tx: targetCenterX - slotCenterX,
      ty: targetCenterY - slotCenterY,
      sx: (targetRect.width || slotW) / slotW,
      sy: (targetRect.height || slotH) / slotH,
    };
  }

  function animateDisassemble(
    assembled: { left: number; top: number; width: number; height: number }
  ) {
    const heroRect = heroSlotEl.getBoundingClientRect();
    const leftRect = smallLeftSlotEl.getBoundingClientRect();
    const rightRect = smallRightSlotEl.getBoundingClientRect();

    const heroFlip = calcFlipTransform(heroRect, assembled);
    const leftFlip = calcFlipTransform(leftRect, assembled);
    const rightFlip = calcFlipTransform(rightRect, assembled);

    const opts = { duration: DURATION, easing: EASING, fill: "both" as FillMode };

    // Hero: translate+scale from assembled to natural position
    heroSlotEl.animate(
      [
        {
          transform: `translate(${heroFlip.tx}px, ${heroFlip.ty}px) scale(${heroFlip.sx}, ${heroFlip.sy})`,
        },
        { transform: "translate(0, 0) scale(1)" },
      ],
      opts
    );

    // Blue-only: translate+scale from assembled to bottom-left
    smallLeftSlotEl.animate(
      [
        {
          transform: `translate(${leftFlip.tx}px, ${leftFlip.ty}px) scale(${leftFlip.sx}, ${leftFlip.sy})`,
        },
        { transform: "translate(0, 0) scale(1)" },
      ],
      opts
    );
    // Blue-only: fade in during first 25%
    smallLeftSlotEl.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: DURATION * 0.25,
      easing: "ease-out",
      fill: "both" as FillMode,
    });

    // Red-only: translate+scale from assembled to bottom-right
    const mainAnim = smallRightSlotEl.animate(
      [
        {
          transform: `translate(${rightFlip.tx}px, ${rightFlip.ty}px) scale(${rightFlip.sx}, ${rightFlip.sy})`,
        },
        { transform: "translate(0, 0) scale(1)" },
      ],
      opts
    );
    // Red-only: fade in during first 25%
    smallRightSlotEl.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: DURATION * 0.25,
      easing: "ease-out",
      fill: "both" as FillMode,
    });

    // Progress bar: fade in during second half
    if (progressSlotEl) {
      progressSlotEl.animate([{ opacity: 0 }, { opacity: 0 }, { opacity: 1 }], {
        duration: DURATION,
        easing: "ease-out",
        fill: "both" as FillMode,
      });
    }

    mainAnim.finished.then(() => {
      // Cancel all fill:both animations so the elements return to their natural state
      // (prevents stale transforms from lingering when the component stays mounted)
      cancelAllAnimations();
      oncomplete();
    });
  }

  function animateReassemble(
    assembled: { left: number; top: number; width: number; height: number }
  ) {
    const heroRect = heroSlotEl.getBoundingClientRect();
    const leftRect = smallLeftSlotEl.getBoundingClientRect();
    const rightRect = smallRightSlotEl.getBoundingClientRect();

    const heroFlip = calcFlipTransform(heroRect, assembled);
    const leftFlip = calcFlipTransform(leftRect, assembled);
    const rightFlip = calcFlipTransform(rightRect, assembled);

    const opts = { duration: DURATION, easing: EASING, fill: "both" as FillMode };

    // Hero: from natural position to assembled
    const mainAnim = heroSlotEl.animate(
      [
        { transform: "translate(0, 0) scale(1)" },
        {
          transform: `translate(${heroFlip.tx}px, ${heroFlip.ty}px) scale(${heroFlip.sx}, ${heroFlip.sy})`,
        },
      ],
      opts
    );

    // Blue-only: from bottom-left to assembled
    smallLeftSlotEl.animate(
      [
        { transform: "translate(0, 0) scale(1)" },
        {
          transform: `translate(${leftFlip.tx}px, ${leftFlip.ty}px) scale(${leftFlip.sx}, ${leftFlip.sy})`,
        },
      ],
      opts
    );
    // Blue-only: fade out during last 25%
    smallLeftSlotEl.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: DURATION * 0.25,
      delay: DURATION * 0.75,
      easing: "ease-in",
      fill: "both" as FillMode,
    });

    // Red-only: from bottom-right to assembled
    smallRightSlotEl.animate(
      [
        { transform: "translate(0, 0) scale(1)" },
        {
          transform: `translate(${rightFlip.tx}px, ${rightFlip.ty}px) scale(${rightFlip.sx}, ${rightFlip.sy})`,
        },
      ],
      opts
    );
    // Red-only: fade out during last 25%
    smallRightSlotEl.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: DURATION * 0.25,
      delay: DURATION * 0.75,
      easing: "ease-in",
      fill: "both" as FillMode,
    });

    // Progress bar: stays visible during reassembly so the end state matches the
    // assembled view (which has its own progress bar in the same position).
    // Fading it out caused a visible snap when the assembled view appeared with
    // a progress bar that wasn't in the FLIP end state.

    mainAnim.finished.then(() => {
      cancelAllAnimations();
      oncomplete();
    });
  }

  // Cancel all Web Animations on animated elements so fill:both values don't linger
  function cancelAllAnimations() {
    for (const el of [heroSlotEl, smallLeftSlotEl, smallRightSlotEl, progressSlotEl]) {
      if (el) {
        for (const anim of el.getAnimations()) {
          anim.cancel();
        }
      }
    }
  }

  // React to direction changes - triggers animation when direction becomes
  // "disassemble" or "reassemble", does nothing when "idle"
  $effect(() => {
    const dir = direction;
    if (dir === "idle") return;

    // Read all non-direction dependencies outside the reactive tracking
    return untrack(() => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        oncomplete();
        return;
      }

      const frameId = requestAnimationFrame(() => {
        if (!viewElement || !heroSlotEl || !smallLeftSlotEl || !smallRightSlotEl) {
          oncomplete();
          return;
        }

        const containerRect = viewElement.getBoundingClientRect();
        const assembled = getAssembledRect(containerRect);

        if (dir === "disassemble") {
          animateDisassemble(assembled);
        } else {
          animateReassemble(assembled);
        }
      });

      return () => cancelAnimationFrame(frameId);
    });
  });
</script>

<div class="disassemble-view" bind:this={viewElement}>
  <div class="disassemble-unit">
    <div class="hero-slot" bind:this={heroSlotEl}>
      <CanvasSurface
        {leftProp}
        {rightProp}
        {...shared}
      />
    </div>

    <div class="small-slots">
      <div class="small-slot" bind:this={smallLeftSlotEl}>
        <CanvasSurface
          {leftProp}
          rightProp={null}
          {...shared}
          hideTkaGlyph={true}
          hideStepNumbers={true}
        />
      </div>

      <div class="small-slot" bind:this={smallRightSlotEl}>
        <CanvasSurface
          leftProp={null}
          {rightProp}
          {...shared}
          hideTkaGlyph={true}
          hideStepNumbers={true}
        />
      </div>
    </div>

    {#if sequenceData?.steps?.length}
      <div class="progress-slot" bind:this={progressSlotEl}>
        <SegmentedSequenceProgressBar
          steps={sequenceData.steps}
          {currentStep}
          visible={true}
          variant="gradient"
        />
      </div>
    {/if}
  </div>
</div>

<style>
  .disassemble-view {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    container-type: size;
  }

  .disassemble-unit {
    --chrome: 50px;
    width: min(100cqw, calc((100cqh - var(--chrome)) * 2 / 3));
    display: flex;
    flex-direction: column;
  }

  .hero-slot {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1;
    overflow: hidden;
    z-index: 2;
  }

  .small-slots {
    display: flex;
    width: 100%;
  }

  .small-slot {
    position: relative;
    width: 50%;
    aspect-ratio: 1 / 1;
    overflow: hidden;
    z-index: 1;
  }

  .progress-slot {
    width: 100%;
  }

  .progress-slot :global(.segmented-progress-container) {
    padding: 2px 0;
  }

  .progress-slot :global(.segments-track) {
    height: 12px;
  }

  .progress-slot :global(.segment-divider) {
    border-right-color: var(
      --theme-stroke-strong,
      rgba(255, 255, 255, 0.8)
    ) !important;
  }
</style>
