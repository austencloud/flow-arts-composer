<script lang="ts">
  import PictographContainer from "$lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import type { GridPlacement } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { calculateEndOrientation } from "$lib/shared/pictograph/prop/services/orientation-calculator";
  import { getArrowSvgPath } from "$lib/shared/pictograph/arrow/rendering/services/arrow-path-resolver";
  import {
    HandSide,
    RotationDirection,
    type MotionType,
    type Orientation,
  } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
  import type { GridLocation } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
  import {
    createMotionData,
    type MotionData,
  } from "$lib/shared/pictograph/shared/domain/models/motion-data";
  import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
  import type { Letter } from "$lib/shared/foundation/domain/models/letter";
  import fixture from "../../../../docs/research/spiroanim/editor-v9-quarter-turn-club-loop.json";

  interface RawMotion {
    color: string;
    motionType: string;
    rotationDirection: string;
    startLocation: string;
    endLocation: string;
    turns: number;
    startOrientation: string;
    endOrientation: string;
  }

  interface RawStep {
    stepNumber: number;
    letter: string;
    startPlacement: string;
    endPlacement: string;
    /** Legacy checked-in fixture shape. Normalized as it enters the route. */
    motions: { blue: RawMotion; red: RawMotion };
  }

  const steps = fixture.steps as unknown as RawStep[];

  function toMotion(raw: RawMotion, color: HandSide): MotionData {
    return createMotionData({
      motionType: raw.motionType as MotionType,
      rotationDirection:
        raw.rotationDirection === "no_rot"
          ? RotationDirection.NO_ROTATION
          : (raw.rotationDirection as RotationDirection),
      startLocation: raw.startLocation as GridLocation,
      endLocation: raw.endLocation as GridLocation,
      arrowLocation: raw.endLocation as GridLocation,
      startOrientation: raw.startOrientation as Orientation,
      endOrientation: raw.endOrientation as Orientation,
      turns: raw.turns,
      hand: color,
      propType: PropType.CLUB,
      gridMode: GridMode.DIAMOND,
    });
  }

  function toPictograph(step: RawStep): PictographData {
    return {
      id: `qta-step-${step.stepNumber}`,
      letter: step.letter as Letter,
      startPlacement: step.startPlacement as GridPlacement,
      endPlacement: step.endPlacement as GridPlacement,
      gridMode: GridMode.DIAMOND,
      motions: {
        left: toMotion(step.motions.blue, HandSide.LEFT),
        right: toMotion(step.motions.red, HandSide.RIGHT),
      },
    };
  }

  /** Same step re-run through the production orientation calculator at other turn values. */
  function withTurns(source: PictographData, turns: number): PictographData {
    const retuned = (motion: MotionData | undefined) => {
      if (!motion) return motion;
      const next = { ...motion, turns };
      return { ...next, endOrientation: calculateEndOrientation(next, next.hand) };
    };
    return {
      ...source,
      id: `${source.id}-t${turns}`,
      motions: {
        left: retuned(source.motions.left),
        right: retuned(source.motions.right),
      },
    };
  }

  const pictographs = steps.map(toPictograph);
  let selectedIndex = $state(0);

  const selected = $derived(pictographs[selectedIndex]!);
  const selectedStep = $derived(steps[selectedIndex]!);
  const trio = $derived([
    { label: "0 turns — legacy art", data: withTurns(selected, 0) },
    { label: "0.25 turns — current art (rejected)", data: selected },
    { label: "0.5 turns — legacy art", data: withTurns(selected, 0.5) },
  ]);
  const quarterAssetPath = $derived(getArrowSvgPath(selected.motions.left));

  function motionSummary(m: RawMotion): string {
    const dir =
      m.rotationDirection === "no_rot" ? "no rotation" : m.rotationDirection;
    return `${m.motionType} ${dir} · ${m.startOrientation} → ${m.endOrientation}`;
  }
</script>

<svelte:head>
  <title>Quarter-Turn Arrow Review Lab</title>
</svelte:head>

<main class="lab">
  <header class="lab-header">
    <h1>Quarter-Turn Arrow Review Lab</h1>
    <p>
      The 24-step SpiroAnim Club loop ({fixture.word}) rendered as real
      pictographs through the production renderer. Every arrow below with a
      0.25 tuple uses the current (rejected) quarter-turn art. Select any step
      to see it between its 0-turn and half-turn neighbors — the approved
      visual language has to read as belonging between them.
    </p>
  </header>

  <section class="detail" aria-label="Selected step in context">
    <div class="detail-head">
      <h2>
        Step {selectedStep.stepNumber} · {selectedStep.letter} ·
        {selectedStep.startPlacement} → {selectedStep.endPlacement}
      </h2>
      <p class="motion-line">
        Both hands: {motionSummary(selectedStep.motions.blue)} · quarter asset:
        <code>{quarterAssetPath}</code>
      </p>
    </div>
    <div class="trio">
      {#each trio as variant (variant.data.id)}
        <figure class="trio-cell" class:current={variant.data === selected}>
          <div class="picto large">
            <PictographContainer pictographData={variant.data} />
          </div>
          <figcaption>{variant.label}</figcaption>
        </figure>
      {/each}
    </div>
  </section>

  <section class="sequence" aria-label="All 24 steps">
    <h2>The full loop, step by step</h2>
    <div class="grid">
      {#each pictographs as pictograph, i (pictograph.id)}
        <button
          type="button"
          class="step-card"
          class:selected={i === selectedIndex}
          aria-pressed={i === selectedIndex}
          onclick={() => (selectedIndex = i)}
        >
          <div class="picto">
            <PictographContainer pictographData={pictograph} />
          </div>
          <span class="step-label">
            {steps[i]!.stepNumber} · {steps[i]!.letter} ·
            {steps[i]!.motions.blue.turns} turns
          </span>
        </button>
      {/each}
    </div>
  </section>
</main>

<style>
  .lab {
    min-height: 100vh;
    padding: 2rem clamp(1.5rem, 4vw, 4rem) 4rem;
    background: #14161d;
    color: #e8eaf2;
    font-family: system-ui, sans-serif;
  }

  .lab-header {
    max-width: none;
    margin-bottom: 2rem;
  }

  h1 {
    margin: 0 0 0.5rem;
    font-size: 1.75rem;
  }

  h2 {
    margin: 0 0 0.75rem;
    font-size: 1.25rem;
  }

  .lab-header p {
    margin: 0;
    color: #aab0c0;
    line-height: 1.5;
  }

  .detail {
    margin-bottom: 2.5rem;
    padding: 1.25rem;
    border: 1px solid #2b2f3d;
    border-radius: 12px;
    background: #1a1d27;
  }

  .motion-line {
    margin: 0 0 1rem;
    color: #aab0c0;
  }

  .motion-line code {
    color: #cdd4ea;
    background: #232736;
    padding: 0.1em 0.4em;
    border-radius: 4px;
  }

  .trio {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1.25rem;
  }

  .trio-cell {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .trio-cell figcaption {
    text-align: center;
    color: #aab0c0;
    font-size: 0.9rem;
  }

  .trio-cell.current figcaption {
    color: #ffd479;
    font-weight: 600;
  }

  .picto {
    aspect-ratio: 1;
    width: 100%;
    background: #fff;
    border-radius: 8px;
    overflow: hidden;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 1rem;
  }

  @media (min-width: 1680px) {
    .grid {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
  }

  @media (min-width: 2600px) {
    .grid {
      grid-template-columns: repeat(8, minmax(0, 1fr));
    }
  }

  @media (max-width: 900px) {
    .grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .trio {
      grid-template-columns: 1fr;
    }
  }

  .step-card {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.6rem;
    border: 1px solid #2b2f3d;
    border-radius: 10px;
    background: #1a1d27;
    color: inherit;
    cursor: pointer;
    transition: border-color 120ms ease, box-shadow 120ms ease;
  }

  .step-card:hover {
    border-color: #4a5168;
  }

  .step-card.selected {
    border-color: #ffd479;
    box-shadow: 0 0 0 1px color-mix(in srgb, #ffd479 55%, transparent);
  }

  .step-label {
    font-size: 0.85rem;
    color: #aab0c0;
    text-align: center;
  }

  .step-card.selected .step-label {
    color: #ffd479;
  }
</style>
