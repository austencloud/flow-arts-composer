<script lang="ts">
  import { onDestroy } from "svelte";
  import { DEFAULT_VIEWER_CUSTOM_COLORS } from "$lib/shared/sequence-viewer/domain/viewer-custom-colors";
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import TKAWordGlyph from "$lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import SequenceTransformActions from "$lib/shared/create/components/SequenceTransformActions.svelte";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { getToggledGridMode } from "$lib/shared/create/services/rotation-helpers";
  import { createPropPlacementMotionState } from "$lib/shared/pictograph/grid/state/prop-placement-motion.svelte";
  import {
    buildPlacementTransformTransition,
    type PlacementTransition,
  } from "$lib/shared/pictograph/grid/services/prop-placement-view-model";
  import { RotationDirection } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import { reducedMotion } from "$lib/shared/transitions/motion";
  import {
    POSITION_KINDS,
    POSITION_LETTERS,
    positionExample,
    positionPairPreview,
    transformPosition,
  } from "../positions/hand-position-lesson";

  let gridMode = $state(GridMode.DIAMOND);
  let pairs = $state(
    POSITION_KINDS.map((kind) => positionExample(kind, GridMode.DIAMOND))
  );
  let announcement = $state("");
  let betaSwapped = $state(false);
  let transitions = $state<PlacementTransition[]>([]);
  let epoch = $state(0);
  let gridRotation = $state(0);
  let gridRotationStart = $state(0);
  const motion = createPropPlacementMotionState();
  const animatedGridRotation = $derived(
    motion.active
      ? gridRotationStart + (gridRotation - gridRotationStart) * motion.progress
      : gridRotation
  );
  const ready = new Set<number>();
  type Action = "rotate" | "mirror" | "flip" | "swap";
  const pending: { action: Action; rotationSteps: number }[] = [];
  onDestroy(() => motion.destroy());
  const descriptions = {
    alpha: "Opposite points",
    beta: "The same point",
    gamma: "A right angle apart",
  };
  const examples = $derived(
    POSITION_KINDS.map((kind, index) => ({
      kind,
      data: { ...positionPairPreview(pairs[index]!, gridMode), betaSwapped },
    }))
  );

  function transform(action: Action, rotationSteps = 1) {
    pending.push({ action, rotationSteps });
    playNext();
  }

  function playNext() {
    if (motion.active) return;
    const next = pending.shift();
    if (!next) return;
    const { action, rotationSteps } = next;
    const previous = examples.map((example) => example.data);
    gridRotationStart = gridRotation;
    pairs = pairs.map((pair) =>
      transformPosition(
        pair.left,
        pair.right,
        action === "flip" ? "mirror" : action,
        {
          rotationSteps,
          reflectionAxis: action === "flip" ? 2 : 0,
        }
      )
    );
    if (action === "rotate") {
      gridRotation += 45 * rotationSteps;
      gridMode = getToggledGridMode(gridMode, rotationSteps);
    }
    if (action === "swap") betaSwapped = !betaSwapped;
    announcement = `${action === "rotate" ? "Rotated 45 degrees" : action === "mirror" ? "Mirrored left and right" : action === "flip" ? "Flipped up and down" : "Hands swapped"}. Alpha, Beta and Gamma are unchanged. ${gridMode === GridMode.BOX ? "Box" : "Diamond"} grid.`;
    if (reducedMotion()) {
      playNext();
      return;
    }
    transitions = examples.map((example, index) =>
      buildPlacementTransformTransition(
        previous[index]!,
        example.data,
        action === "mirror" || action === "flip" ? "linear" : "arc",
        rotationSteps < 0
          ? RotationDirection.COUNTER_CLOCKWISE
          : RotationDirection.CLOCKWISE
      )
    );
    ready.clear();
    epoch += 1;
    motion.prepare(transitions[0]!, () => {
      transitions = [];
      playNext();
    });
  }

  function pictographReady(index: number) {
    if (!motion.active) return;
    ready.add(index);
    if (ready.size === examples.length) motion.start();
  }
</script>

<div class="placement-comparison">
  <div class="position-examples" role="group" aria-label="Placement examples">
    {#each examples as example, index (example.kind)}
      <section class="position-example" aria-label={`${example.kind} position`}>
        <div class="pictograph">
          <PictographContainer
            leftColorOverride={DEFAULT_VIEWER_CUSTOM_COLORS.left}
            rightColorOverride={DEFAULT_VIEWER_CUSTOM_COLORS.right}
            pictographData={example.data}
            motionStartData={transitions[index]?.startData}
            motionStep={transitions[index]?.transitionStep}
            motionProgress={motion.active ? motion.progress : null}
            gridRotation={animatedGridRotation}
            readyEpoch={epoch}
            onReady={() => pictographReady(index)}
            disableTransitions
            {gridMode}
            darkMode
            showGrid
            showHandPoints
            showLeftMotion
            showRightMotion
            showTKA={false}
            showArrow={false}
            showTnD={false}
            showElemental={false}
            showPositions={false}
            showReversals={false}
            showNonRadialPoints={false}
            stepNumberOverride={false}
            leftPropTypeOverride={PropType.HAND}
            rightPropTypeOverride={PropType.HAND}
          />
        </div>
        <div class="position-caption">
          <h2>
            <TKAWordGlyph
              word={POSITION_LETTERS[example.kind]}
              height={36}
              darkMode
            /><span
              >{example.kind[0]!.toUpperCase() + example.kind.slice(1)}</span
            >
          </h2>
          <p>{descriptions[example.kind]}</p>
        </div>
      </section>
    {/each}
  </div>
  <div
    class="transform-bar"
    role="group"
    aria-label="Transform all three positions"
  >
    <SequenceTransformActions
      toolbar
      hasSequence={true}
      hasSelection={false}
      isTransforming={false}
      showEditInConstructor={false}
      actionSubject="all positions"
      rotationDegrees={45}
      onMirror={() => transform("mirror")}
      onFlip={() => transform("flip")}
      onSwap={() => transform("swap")}
      onRotateCCW={() => transform("rotate", -1)}
      onRotateCW={() => transform("rotate", 1)}
    />
  </div>
  <p class="grid-label">
    {gridMode === GridMode.BOX ? "Box" : "Diamond"} grid
    <span aria-hidden="true">·</span> Each rotation is 45°
  </p>
  <span class="sr-only" aria-live="polite">{announcement}</span>
</div>

<style>
  .placement-comparison {
    width: 100%;
  }
  .position-examples {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: clamp(1rem, 3cqw, 3rem);
  }
  .position-example {
    min-width: 0;
    display: grid;
    justify-items: center;
    gap: 1.25rem;
  }
  .pictograph {
    width: 100%;
    max-width: min(clamp(28rem, 18vw, 42rem), max(10rem, calc(100cqh - 15rem)));
    aspect-ratio: 1;
    border: 1px solid var(--theme-stroke);
    border-radius: 1rem;
    overflow: hidden;
    background: var(--theme-panel-bg);
  }
  .position-caption {
    text-align: center;
  }
  h2 {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    font-size: clamp(1.35rem, 1.7cqw, 2rem);
    margin: 0;
    line-height: 1.2;
  }
  p {
    margin: 0.65rem 0 0;
    font-size: clamp(1rem, 1.15cqw, 1.25rem);
    line-height: 1.4;
    color: var(--theme-text-dim);
    text-wrap: balance;
  }
  .transform-bar {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 0.75rem 1.5rem;
    margin-top: clamp(1.5rem, 3cqw, 2.5rem);
  }
  .grid-label {
    text-align: center;
    margin-top: 1rem;
    font-size: 0.875rem;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  @container examples (max-width: 650px) {
    .position-examples {
      grid-template-columns: 1fr;
      gap: 1rem;
    }
    .position-example {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      align-items: center;
      gap: 1rem;
    }
    .pictograph {
      max-width: 14rem;
    }
    h2 {
      flex-direction: column;
      gap: 0.4rem;
    }
    .transform-bar {
      gap: 0.75rem;
    }
  }

  @container examples (max-height: 360px) and (min-width: 651px) {
    .position-example {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      align-items: center;
      gap: 0.75rem;
    }
    .pictograph {
      max-width: 6rem;
    }
    h2 {
      font-size: 1.125rem;
      gap: 0.4rem;
    }
    .transform-bar {
      margin-top: 0.75rem;
    }
    .grid-label {
      margin-top: 0.35rem;
    }
  }

  @media (min-width: 2400px) {
    h2 {
      font-size: 2.25rem;
    }
    p {
      font-size: 1.5rem;
    }
    .grid-label {
      font-size: 1.25rem;
    }
  }
</style>
