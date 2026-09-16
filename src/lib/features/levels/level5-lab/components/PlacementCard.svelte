<script lang="ts">
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { createMotionData } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import {
    GridLocation,
    type GridMode,
    type GridPlacement,
  } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import {
    MotionType,
    RotationDirection,
    Orientation,
    HandSide,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import type {
    CardOrientations,
    OrientationOption,
  } from "../domain/level5-lab-types";
  import {
    PLACEMENT_LOCATIONS,
    RADIAL_ORIENTATIONS,
    COMPASS_ORIENTATIONS,
    formatPlacement,
    isHandAtCenter,
    isCenterOrientation,
    getGridModeForPlacement,
  } from "../domain/level5-placement-data";

  let {
    placement,
    orientations,
    onOrientationChange,
    leftPropType,
    rightPropType,
  } = $props<{
    placement: GridPlacement;
    orientations: CardOrientations;
    onOrientationChange: (
      placement: GridPlacement,
      hand: "left" | "right",
      value: Orientation
    ) => void;
    leftPropType: PropType;
    rightPropType: PropType;
  }>();

  // Derive hand locations and center status from placement data
  const placementLocations = $derived(
    PLACEMENT_LOCATIONS[placement as keyof typeof PLACEMENT_LOCATIONS]
  );
  const leftLoc = $derived(placementLocations?.[0] ?? GridLocation.CENTER);
  const rightLoc = $derived(placementLocations?.[1] ?? GridLocation.NORTH);
  const leftAtCenter = $derived(isHandAtCenter(placement, "left"));
  const rightAtCenter = $derived(isHandAtCenter(placement, "right"));
  const gridMode = $derived(getGridModeForPlacement(placement));

  // Which orientation options each hand gets
  const leftOptions = $derived<readonly OrientationOption[]>(
    leftAtCenter ? COMPASS_ORIENTATIONS : RADIAL_ORIENTATIONS
  );
  const rightOptions = $derived<readonly OrientationOption[]>(
    rightAtCenter ? COMPASS_ORIENTATIONS : RADIAL_ORIENTATIONS
  );

  // Build pictograph data reactively when orientations change
  const pictograph = $derived.by((): PictographData => {
    const effectiveLeftOri = leftAtCenter
      ? orientations.left
      : isCenterOrientation(orientations.left)
        ? Orientation.IN
        : orientations.left;
    const effectiveRightOri = rightAtCenter
      ? orientations.right
      : isCenterOrientation(orientations.right)
        ? Orientation.IN
        : orientations.right;

    const leftMotion = createMotionData({
      motionType: MotionType.STATIC,
      startLocation: leftLoc,
      endLocation: leftLoc,
      startOrientation: effectiveLeftOri,
      endOrientation: effectiveLeftOri,
      rotationDirection: RotationDirection.NO_ROTATION,
      turns: 0,
      hand: HandSide.LEFT,
      isVisible: true,
      propType: leftPropType,
      arrowLocation: leftLoc,
      gridMode,
    });

    const rightMotion = createMotionData({
      motionType: MotionType.STATIC,
      startLocation: rightLoc,
      endLocation: rightLoc,
      startOrientation: effectiveRightOri,
      endOrientation: effectiveRightOri,
      rotationDirection: RotationDirection.NO_ROTATION,
      turns: 0,
      hand: HandSide.RIGHT,
      isVisible: true,
      propType: rightPropType,
      arrowLocation: rightLoc,
      gridMode,
    });

    return {
      id: `level5-${placement}`,
      startPlacement: placement,
      endPlacement: placement,
      motions: {
        [HandSide.LEFT]: leftMotion,
        [HandSide.RIGHT]: rightMotion,
      },
    };
  });

  function formatLoc(loc: GridLocation): string {
    return loc === GridLocation.CENTER ? "C" : loc.slice(0, 2).toUpperCase();
  }
</script>

<article class="card">
  <div class="pictograph-area">
    <PictographContainer pictographData={pictograph} {gridMode} />
  </div>

  <!-- Per-card orientation pickers -->
  <div class="orientation-row">
    <div class="hand-ori blue">
      <span class="hand-label">B</span>
      <div class="ori-chips" class:compass={leftAtCenter}>
        {#each leftOptions as ori (ori.value)}
          <button
            class="ori-chip"
            class:active={orientations.left === ori.value}
            aria-pressed={orientations.left === ori.value}
            aria-label={ori.label}
            onclick={() => onOrientationChange(placement, "left", ori.value)}
            title={ori.label}
          >
            <i
              class="fas {ori.icon}"
              aria-hidden="true"
              style={ori.rotation
                ? `transform: rotate(${ori.rotation}deg)`
                : ""}
            ></i>
          </button>
        {/each}
      </div>
    </div>
    <div class="hand-ori red">
      <span class="hand-label">R</span>
      <div class="ori-chips" class:compass={rightAtCenter}>
        {#each rightOptions as ori (ori.value)}
          <button
            class="ori-chip"
            class:active={orientations.right === ori.value}
            aria-pressed={orientations.right === ori.value}
            aria-label={ori.label}
            onclick={() => onOrientationChange(placement, "right", ori.value)}
            title={ori.label}
          >
            <i
              class="fas {ori.icon}"
              aria-hidden="true"
              style={ori.rotation
                ? `transform: rotate(${ori.rotation}deg)`
                : ""}
            ></i>
          </button>
        {/each}
      </div>
    </div>
  </div>

  <footer class="card-footer">
    <span class="placement-name">{formatPlacement(placement)}</span>
    <div class="locations">
      <span class="loc blue">{formatLoc(leftLoc)}</span>
      <span class="loc red">{formatLoc(rightLoc)}</span>
    </div>
  </footer>
</article>

<style>
  .card {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 12px;
    overflow: hidden;
    transition: border-color var(--duration-fast) ease;
  }

  .card:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
  }

  .pictograph-area {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    aspect-ratio: 1;
  }

  .orientation-row {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.5rem;
    background: rgba(0, 0, 0, 0.15);
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.05));
  }

  .hand-ori {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .hand-label {
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    width: 1rem;
    text-align: center;
    flex-shrink: 0;
  }

  .hand-ori.blue .hand-label {
    color: #60a5fa;
  }

  .hand-ori.red .hand-label {
    color: #f87171;
  }

  .ori-chips {
    display: flex;
    gap: 2px;
    flex-wrap: wrap;
  }

  .ori-chip {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--theme-text-secondary, #888);
    font-size: 0.625rem;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
    padding: 0;
  }

  .ori-chip:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.08));
    color: var(--theme-text, #fff);
  }

  .ori-chip.active {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.12));
    color: var(--theme-text, #fff);
  }

  .hand-ori.blue .ori-chip.active {
    background: rgba(96, 165, 250, 0.2);
    color: #60a5fa;
  }

  .hand-ori.red .ori-chip.active {
    background: rgba(248, 113, 113, 0.2);
    color: #f87171;
  }

  .ori-chip:focus-visible {
    outline: 2px solid var(--theme-accent, #8b5cf6);
    outline-offset: 1px;
  }

  .ori-chip i {
    font-size: 0.625rem;
  }

  .card-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1rem;
    background: rgba(0, 0, 0, 0.2);
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.05));
  }

  .placement-name {
    font-weight: 600;
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text, #fff);
  }

  .locations {
    display: flex;
    gap: 0.375rem;
  }

  .loc {
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    padding: 0.125rem 0.375rem;
    border-radius: 4px;
  }

  .loc.blue {
    background: rgba(96, 165, 250, 0.15);
    color: #60a5fa;
  }

  .loc.red {
    background: rgba(248, 113, 113, 0.15);
    color: #f87171;
  }

  @media (prefers-reduced-motion: reduce) {
    .card,
    .ori-chip {
      transition: none;
    }
  }
</style>
