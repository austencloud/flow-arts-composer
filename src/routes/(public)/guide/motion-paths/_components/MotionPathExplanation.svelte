<script lang="ts">
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import SequenceMandala from "$lib/shared/mandala/components/SequenceMandala.svelte";
  import StepStrip from "$lib/shared/timeline/StepStrip.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import {
    DARK_MOTION_BLUE_STROKE,
    DARK_MOTION_RED_STROKE,
  } from "$lib/shared/mandala/domain/mandala-constants";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { shapeMatrixTipPoint } from "$lib/shared/shape-matrix/services/shape-matrix-flowers";
  import {
    comparisonChoices,
    comparisonVariants,
    comparisonPoint,
    comparisonRoute,
    comparisonFrame,
  } from "../_data/motion-path-comparison";

  let {
    sequence,
    trace = "tips",
  }: { sequence: SequenceData; trace?: "hands" | "tips" } = $props();
  let selected = $state("");
  let progress = $state(0.5);
  let mandalaSize = $state(0);
  const choices = $derived(comparisonChoices(sequence));
  const choice = $derived(
    choices.find((item) => item.key === selected) ??
      choices.find((item) => item.changes) ??
      choices[0]
  );
  const variants = $derived(comparisonVariants(sequence));
  const routeShapes = $derived.by(() => {
    if (!choice) return [];
    return (["arc", "concave"] as const).map((path) => {
      const step = variants[path].steps[choice.index]!;
      return {
        path,
        label: path === "arc" ? "Arc" : "Concave",
        step,
        d: comparisonRoute(step, choice.hand),
      };
    });
  });
  const routes = $derived(
    routeShapes.map((route) => ({
      ...route,
      point: comparisonPoint(route.step, choice!.hand, progress)!,
    }))
  );
  const frame = $derived(
    choice
      ? comparisonFrame(
          routeShapes.map((route) => route.step),
          choice.hand
        )
      : "-140 -140 280 280"
  );
  const endpoints = $derived(
    choice
      ? [0, 1].map(
          (t) =>
            comparisonPoint(variants.arc.steps[choice.index]!, choice.hand, t)!
        )
      : []
  );
  const color = $derived(
    choice
      ? (getSettings().primaryPropColors?.[choice.hand] ??
          (choice.hand === "left"
            ? DARK_MOTION_BLUE_STROKE
            : DARK_MOTION_RED_STROKE))
      : DARK_MOTION_BLUE_STROKE
  );
  const tipDx = $derived(
    trace === "hands" ? 0 : shapeMatrixTipPoint(PropType.STAFF)?.dx
  );
  const handColors = $derived({
    left: getSettings().primaryPropColors?.left ?? DARK_MOTION_BLUE_STROKE,
    right: getSettings().primaryPropColors?.right ?? DARK_MOTION_RED_STROKE,
  });

  function chooseStep(stepNumber: number): void {
    const index = stepNumber - 1;
    const next =
      choices.find(
        (item) => item.index === index && item.hand === choice?.hand
      ) ?? choices.find((item) => item.index === index);
    if (next) selected = next.key;
  }
</script>

<section
  class="explanation"
  aria-labelledby="route-explanation-heading"
  style:--hand-color={color}
>
  <header>
    <h2 id="route-explanation-heading">Same endpoints, different routes</h2>
    <p>Compare one movement from your sequence above.</p>
  </header>

  {#if choice}
    <div class="comparison-layout">
      <div class="movement">
        <div class="movement-choice">
          <div class="choice-heading">
            <h3>Step {choice.index + 1}</h3>
            <div
              class="hand-choice"
              style:--dm-motion-blue={handColors.left}
              style:--dm-motion-red={handColors.right}
            >
              <SegmentedControl
                options={[
                  {
                    value: "left",
                    label: "Left hand",
                    tone: "blue",
                    disabled: !choices.some(
                      (item) =>
                        item.index === choice.index && item.hand === "left"
                    ),
                  },
                  {
                    value: "right",
                    label: "Right hand",
                    tone: "red",
                    disabled: !choices.some(
                      (item) =>
                        item.index === choice.index && item.hand === "right"
                    ),
                  },
                ]}
                value={choice.hand}
                onchange={(hand) => (selected = `${choice.index}:${hand}`)}
                semantics="radiogroup"
                ariaLabel="Hand to compare"
              />
            </div>
          </div>
          <div class="step-picker" role="group" aria-label="Choose a movement">
            <StepStrip
              {sequence}
              includeStartPosition={false}
              currentStep={choice.index + 1}
              bpm={48}
              density="compact"
              presentation="strip"
              fillHeight
              leftPropType={PropType.STAFF}
              rightPropType={PropType.STAFF}
              onCellClick={chooseStep}
            />
          </div>
        </div>

        <div class="route-key" aria-label="Route line styles">
          <span><i class="solid"></i>Arc</span>
          <span><i class="dashed"></i>Concave</span>
        </div>
        <svg
          class="route-diagram"
          viewBox={frame}
          role="img"
          aria-label={`${choice.label}: Arc and Concave hand routes at ${Math.round(progress * 100)} percent`}
        >
          <circle class="orbit" r="100" />
          <circle class="center" r="2" />
          {#each routes as route (route.path)}
            <path
              class:concave={route.path === "concave"}
              class="route"
              d={route.d}
            />
          {/each}
          {#each endpoints as point, index}
            <circle class="endpoint" cx={point.x} cy={point.y} r="4" />
            {#if index === 0 || Math.hypot(point.x - endpoints[0]!.x, point.y - endpoints[0]!.y) > 1}
              <text
                x={point.x * 1.23}
                y={point.y * 1.23}
                dominant-baseline="middle"
                text-anchor="middle"
                >{index === 0
                  ? choice.motionType === "static"
                    ? "Start / end"
                    : "Start"
                  : "End"}</text
              >
            {/if}
          {/each}
          {#each routes as route (route.path)}
            <circle
              class="hand"
              class:concave={route.path === "concave"}
              cx={route.point.x}
              cy={route.point.y}
              r={route.path === "concave" ? 7 : 5}
            />
          {/each}
        </svg>

        <label class="scrubber">
          <span
            >Drag to follow the hand <output
              >{Math.round(progress * 100)}%</output
            ></span
          >
          <input
            type="range"
            min="0"
            max="1"
            step="0.005"
            bind:value={progress}
            aria-label="Progress through the movement"
            aria-valuetext={`${Math.round(progress * 100)} percent through the movement`}
          />
        </label>
        <p class="observation" aria-live="polite">
          {choice.changes
            ? "The hand reaches the same endpoint by a different route."
            : choice.motionType === "dash"
              ? "This is a dash. Both settings keep its route straight."
              : "This hand stays at its grid point with either setting."}
        </p>
      </div>

      <div class="result">
        <h3>Across the whole sequence</h3>
        <p>
          {trace === "hands"
            ? "The same hand’s complete trace."
            : "The same hand, tracing one staff tip."}
        </p>
        <div class="mandalas">
          {#each routeShapes as route (route.path)}
            <figure>
              <figcaption>{route.label}</figcaption>
              <div class="mandala" bind:clientWidth={mandalaSize}>
                <SequenceMandala
                  sequence={variants[route.path]}
                  pathShape={route.path}
                  show={choice.hand}
                  size={Math.max(1, Math.floor(mandalaSize))}
                  darkMode
                  leftPropType={PropType.STAFF}
                  rightPropType={PropType.STAFF}
                  tipEnds={1}
                  {tipDx}
                />
              </div>
            </figure>
          {/each}
        </div>
        <p class="connection">
          {trace === "hands"
            ? "Each movement contributes to the full drawing."
            : "The staff keeps its rotation as the hand takes a different route."}
        </p>
      </div>
    </div>
  {:else}
    <p>Choose a sequence with visible motion to compare its routes.</p>
  {/if}
</section>

<style>
  .explanation {
    margin-top: var(--spacing-2xl, 48px);
    padding-block: var(--spacing-xl, 32px);
    border-top: 1px solid var(--theme-stroke);
    container-type: inline-size;
  }
  header {
    margin-bottom: var(--spacing-xl, 32px);
  }
  h2,
  h3,
  p,
  figure {
    margin: 0;
  }
  h2 {
    font-size: clamp(22px, 2.6cqw, 30px);
    line-height: 1.3;
  }
  h3 {
    font-size: var(--font-size-base, 16px);
    line-height: 1.5;
  }
  p {
    color: var(--theme-text-dim);
    line-height: 1.5;
    font-size: var(--font-size-min, 14px);
  }
  header p,
  .result > p {
    margin-top: var(--spacing-xs, 4px);
  }
  .comparison-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
    gap: clamp(24px, 5cqw, 72px);
    align-items: center;
  }
  .movement,
  .result {
    min-width: 0;
  }
  .movement-choice {
    display: grid;
    gap: var(--spacing-sm, 8px);
    min-width: 0;
  }
  .choice-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-sm, 8px);
  }
  .choice-heading h3 {
    white-space: nowrap;
  }
  .hand-choice {
    width: min(100%, 280px);
    min-width: 0;
  }
  .step-picker {
    height: 100px;
    min-width: 0;
  }
  .route-key {
    display: flex;
    justify-content: center;
    gap: var(--spacing-lg, 24px);
    margin-top: var(--spacing-md, 16px);
    font-size: var(--font-size-min, 14px);
  }
  .route-key span {
    display: flex;
    align-items: center;
    gap: var(--spacing-sm, 8px);
  }
  .route-key i {
    width: 28px;
    border-top: 2px solid var(--hand-color);
  }
  .route-key .dashed {
    border-top-style: dashed;
  }
  .route-diagram {
    display: block;
    width: min(100%, 340px);
    margin-inline: auto;
    overflow: hidden;
  }
  .orbit {
    fill: none;
    stroke: var(--theme-stroke);
    stroke-width: 1;
  }
  .center {
    fill: var(--theme-text-dim);
  }
  .route {
    fill: none;
    stroke: var(--hand-color);
    stroke-width: 2.5;
  }
  .route.concave {
    stroke-dasharray: 5 4;
  }
  .endpoint {
    fill: var(--theme-text);
  }
  text {
    fill: var(--theme-text-dim);
    font-size: 12px;
  }
  .hand {
    fill: var(--hand-color);
    stroke: var(--theme-panel-bg);
    stroke-width: 2;
  }
  .hand.concave {
    fill: var(--theme-panel-bg);
    stroke: var(--hand-color);
    stroke-width: 2.5;
  }
  .scrubber {
    display: block;
    font-size: var(--font-size-min, 14px);
  }
  .scrubber span {
    display: flex;
    justify-content: space-between;
    gap: var(--spacing-sm, 8px);
  }
  output {
    font-variant-numeric: tabular-nums;
    color: var(--theme-text-dim);
  }
  input {
    width: 100%;
    min-height: 44px;
    margin: 0;
    accent-color: var(--hand-color);
    cursor: ew-resize;
  }
  input:focus-visible {
    outline: 2px solid var(--theme-accent);
    outline-offset: 3px;
  }
  .observation {
    min-height: 3em;
  }
  .mandalas {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--spacing-lg, 24px);
    margin-top: var(--spacing-lg, 24px);
  }
  figcaption {
    text-align: center;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    margin-bottom: var(--spacing-sm, 8px);
  }
  .mandala {
    aspect-ratio: 1;
    min-width: 0;
    display: grid;
    place-items: center;
  }
  .mandala :global(.mandala-container) {
    width: 100%;
    height: 100%;
  }
  .result .connection {
    margin-top: var(--spacing-lg, 24px);
  }
  @container (max-width: 640px) {
    .comparison-layout {
      grid-template-columns: 1fr;
      gap: var(--spacing-lg, 24px);
    }
    .result {
      padding-top: var(--spacing-lg, 24px);
      border-top: 1px solid var(--theme-stroke);
    }
    .mandalas {
      max-width: 480px;
      margin-inline: auto;
    }
    .observation {
      min-height: 0;
    }
  }
</style>
