<!--
  Debug Pictograph Overlay

  Mount once in root layout. Call from browser console:

  Compact shorthand (what Claude uses):
    __dp({
      letter: "X", beat: 2,
      start: "gamma13", end: "alpha5",
      blue: { type: "anti", from: "w", to: "n", turns: 1, rot: "ccw" },
      red: { type: "static", at: "s", turns: 1, rot: "cw", startOri: "in", endOri: "out" }
    })

  Full StepData (pass-through):
    __dp({ id: "...", stepNumber: 2, letter: "X", motions: { blue: {...}, red: {...} }, ... })

  No args = last used data, or a default test case:
    __dp()

  Close: Escape key, click backdrop, or __dp.close()
-->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import {
    MotionType,
    RotationDirection,
    HandSide,
    Orientation,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import {
    GridLocation,
    GridMode,
  } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
  import { createStepData } from "$lib/shared/foundation/domain/factories/create-step-data";

  let visible = $state(false);
  let stepData: StepData | null = $state(null);
  let lastData: StepData | null = null;

  // --- Shorthand → Full StepData expansion ---

  const MOTION_TYPES: Record<string, MotionType> = {
    pro: MotionType.PRO,
    anti: MotionType.ANTI,
    float: MotionType.FLOAT,
    dash: MotionType.DASH,
    static: MotionType.STATIC,
  };

  const ROT_DIRS: Record<string, RotationDirection> = {
    cw: RotationDirection.CLOCKWISE,
    ccw: RotationDirection.COUNTER_CLOCKWISE,
    none: RotationDirection.NO_ROTATION,
    noRotation: RotationDirection.NO_ROTATION,
  };

  const LOCATIONS: Record<string, GridLocation> = {
    n: GridLocation.NORTH,
    e: GridLocation.EAST,
    s: GridLocation.SOUTH,
    w: GridLocation.WEST,
    ne: GridLocation.NORTHEAST,
    se: GridLocation.SOUTHEAST,
    sw: GridLocation.SOUTHWEST,
    nw: GridLocation.NORTHWEST,
  };

  const ORIENTATIONS: Record<string, Orientation> = {
    in: Orientation.IN,
    out: Orientation.OUT,
    clock: Orientation.CLOCK,
    counter: Orientation.COUNTER,
  };

  function loc(s: string): GridLocation {
    return LOCATIONS[s?.toLowerCase()] ?? GridLocation.NORTH;
  }

  function ori(s: string | undefined, fallback: Orientation): Orientation {
    if (!s) return fallback;
    return ORIENTATIONS[s.toLowerCase()] ?? fallback;
  }

  function expandMotion(
    m: any,
    color: HandSide,
    gridMode: GridMode
  ) {
    // "at" is shorthand for static/dash where start === end
    const startLoc = loc(m.from ?? m.at ?? "n");
    const endLoc = loc(m.to ?? m.at ?? "n");

    // Derive arrow location from start/end for shifts, use location for static
    const motionType = MOTION_TYPES[m.type?.toLowerCase()] ?? MotionType.STATIC;
    const arrowLoc = m.arrow
      ? loc(m.arrow)
      : motionType === MotionType.STATIC || motionType === MotionType.DASH
        ? startLoc
        : GridLocation.NORTH; // ArrowLocationCalculator handles shifts

    return createMotionData({
      motionType,
      rotationDirection:
        ROT_DIRS[m.rot?.toLowerCase()] ?? RotationDirection.NO_ROTATION,
      startLocation: startLoc,
      endLocation: endLoc,
      turns: m.turns ?? 0,
      startOrientation: ori(m.startOri, Orientation.IN),
      endOrientation: ori(m.endOri, Orientation.IN),
      arrowLocation: arrowLoc,
      color,
      gridMode,
      propType: PropType.STAFF,
      isVisible: true,
    });
  }

  function isFullStepData(data: any): data is StepData {
    return data && "motions" in data && typeof data.motions === "object";
  }

  function expandShorthand(input: any): StepData {
    if (isFullStepData(input)) return input;

    const gridMode = input.grid === "box" ? GridMode.BOX : GridMode.DIAMOND;

    // Factory fills any missing hand with an invisible placeholder
    // (both-required canonical Step shape).
    return createStepData({
      id: "debug-" + Date.now(),
      stepNumber: input.beat ?? 1,
      letter: (input.letter ?? "?") as any,
      startPlacement: input.start ?? null,
      endPlacement: input.end ?? null,
      gridMode,
      duration: input.duration ?? 1,
      leftReversal: input.leftReversal ?? false,
      rightReversal: input.rightReversal ?? false,
      isBlank: false,
      motions: {
        ...(input.left
          ? { left: expandMotion(input.left, HandSide.LEFT, gridMode) }
          : {}),
        ...(input.right
          ? { right: expandMotion(input.right, HandSide.RIGHT, gridMode) }
          : {}),
      },
    });
  }

  // Default: the X beat that exposed the arrow placement bug
  const DEFAULT_SHORTHAND = {
    letter: "X",
    beat: 2,
    start: "gamma13",
    end: "alpha5",
    left: { type: "anti", from: "w", to: "n", turns: 1, rot: "ccw" },
    right: {
      type: "static",
      at: "s",
      turns: 1,
      rot: "cw",
      startOri: "in",
      endOri: "out",
    },
  };

  function show(data?: any) {
    if (data) {
      stepData = expandShorthand(data);
      lastData = stepData;
    } else {
      stepData = lastData ?? expandShorthand(DEFAULT_SHORTHAND);
    }
    visible = true;
  }

  function close() {
    visible = false;
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && visible) close();
  }

  onMount(() => {
    const api = show as any;
    api.close = close;
    (window as any).__dp = api;
    // Also keep the long name for discoverability
    (window as any).__debugPictograph = api;
  });

  onDestroy(() => {
    delete (window as any).__dp;
    delete (window as any).__debugPictograph;
  });
</script>

<svelte:window onkeydown={onKeydown} />

{#if visible && stepData}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="overlay" onclick={close} role="dialog" aria-label="Pictograph detail overlay" tabindex="-1">
    <div class="content" onclick={(e) => e.stopPropagation()} role="presentation">
      <button class="close-btn" onclick={close}>✕</button>
      <div class="pictograph-frame">
        <PictographContainer
          pictographData={stepData}
          showTKA={true}
          showReversals={true}
        />
      </div>
      <div class="meta">
        Beat {stepData.stepNumber} | Letter {stepData.letter} |
        {stepData.gridMode ?? "diamond"} mode
      </div>
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.85);
    z-index: var(--z-debug);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .content {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .close-btn {
    position: absolute;
    top: -40px;
    right: -40px;
    background: #444;
    color: white;
    border: none;
    padding: 6px 14px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 16px;
  }

  .close-btn:hover {
    background: #666;
  }

  .pictograph-frame {
    width: 500px;
    height: 500px;
    border: 1px solid #333;
    border-radius: 8px;
    overflow: hidden;
    background: #111122;
  }

  .meta {
    font-size: 14px;
    color: #aaa;
    font-family: "Consolas", monospace;
  }
</style>
