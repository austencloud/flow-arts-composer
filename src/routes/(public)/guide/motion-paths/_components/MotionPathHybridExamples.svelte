<script lang="ts">
  import SequenceMandala from "$lib/shared/mandala/components/SequenceMandala.svelte";
  import GuidePictograph from "../../level-1/_components/GuidePictograph.svelte";
  import { applySequencePathPreview } from "$lib/shared/sequence-viewer/services/sequence-path-policy";
  import { PATH_SHAPE_COLORS } from "$lib/shared/animation-engine/domain/path-shape-colors";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import type { MandalaPathShape } from "$lib/shared/mandala/domain/mandala-types";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import { motionPathExamples } from "../_data/motion-path-examples";

  // Hybrid chooses between Arc and Concave, so those two flank it. Linear
  // would be the same in every row and only add noise. The drawings trace the
  // hands (tipDx 0), because the path shape is a rule about the hand path;
  // a staff tip would fold the spin back in and hide what the rule changes.
  const PATHS = ["arc", "concave", "hybrid"] as const satisfies readonly MandalaPathShape[];
  const PATH_LABELS: Record<(typeof PATHS)[number], string> = {
    arc: "Arc",
    concave: "Concave",
    hybrid: "Hybrid",
  };

  interface ExampleRow {
    sequence: SequenceData;
    motions: string;
    result: string;
  }

  // The three frozen examples are the three cases: every motion pro, every
  // motion anti, and one of each. Their order in the data is A, B, C.
  const ROWS: readonly ExampleRow[] = [
    {
      sequence: motionPathExamples[0]!,
      motions: "All pro",
      result: "Same as Arc.",
    },
    {
      sequence: motionPathExamples[1]!,
      motions: "All anti",
      result: "Same as Concave.",
    },
    {
      sequence: motionPathExamples[2]!,
      motions: "Left anti, right pro",
      result: "Concave on the left hand, Arc on the right.",
    },
  ];


  function variant(
    sequence: SequenceData,
    path: (typeof PATHS)[number]
  ): SequenceData {
    return applySequencePathPreview(sequence, {
      pathShape: path === "hybrid" ? "arc" : path,
      motionAwarePaths: path === "hybrid",
    })!;
  }
</script>

<section class="hybrid-examples" aria-labelledby="hybrid-examples-heading">
  <header>
    <h2 id="hybrid-examples-heading">What Hybrid does</h2>
    <p>
      Hybrid uses Arc for pro motions and Concave for anti motions. Any motion
      can take any path, so this is a default, not a law. Three sequences show
      where it lands.
    </p>
  </header>

  <div class="table" role="table" aria-label="Three sequences under Arc, Concave, and Hybrid">
    <div class="head" role="row">
      <span class="head-cell steps-head" role="columnheader">Sequence</span>
      {#each PATHS as path (path)}
        <span
          class="head-cell path-head"
          role="columnheader"
          style:--path-color={PATH_SHAPE_COLORS[path]}
        >
          <span class="swatch" aria-hidden="true"></span>
          {PATH_LABELS[path]}
        </span>
      {/each}
    </div>

    {#each ROWS as row (row.sequence.id)}
      <div class="row" role="row">
        <div class="steps" role="cell">
          <span class="motions">{row.motions}</span>
          <!-- The guide's static notation cell; the carousel (StepStrip) is
               a playback surface and would ring a "current" step here. -->
          <div class="strip" role="list" aria-label="Steps">
            {#each row.sequence.steps as step (step.id)}
              <div class="cell" role="listitem">
                <GuidePictograph
                  data={step}
                  size="sm"
                  eager
                  forceTheme="dark"
                  propType={PropType.STAFF}
                />
              </div>
            {/each}
          </div>
          <span class="result">{row.result}</span>
        </div>
        {#each PATHS as path (path)}
          <div class="tile" role="cell" style:--path-color={PATH_SHAPE_COLORS[path]}>
            <SequenceMandala
              sequence={variant(row.sequence, path)}
              pathShape={path}
              size={168}
              mode="gallery"
              darkMode
              leftPropType={PropType.STAFF}
              rightPropType={PropType.STAFF}
              tipEnds={1}
              tipDx={0}
              animate={false}
            />
            <!-- Phone stacks each sequence over its tiles, so the column
                 headers scroll away; the tile carries its own name there. -->
            <span class="tile-label" aria-hidden="true">{PATH_LABELS[path]}</span>
          </div>
        {/each}
      </div>
    {/each}
  </div>
</section>

<style>
  .hybrid-examples {
    width: 100%;
    min-width: 0;
    margin-block: clamp(2rem, 5vw, 3.5rem);
    container-type: inline-size;
    color: var(--theme-text);
  }

  header {
    margin-bottom: var(--spacing-lg, 24px);
  }

  h2 {
    margin: 0 0 var(--spacing-xs, 4px);
    font-size: clamp(1.4rem, 2.2vw, 1.85rem);
    line-height: 1.15;
  }

  header p {
    margin: 0;
    max-width: none;
    font-size: 16px;
    line-height: 1.6;
    color: var(--theme-text-muted);
  }

  .table {
    display: grid;
    gap: var(--spacing-md, 16px);
  }

  /* Phone: the sequence sits above its three tiles, which share the width. */
  .row {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--spacing-sm, 8px) var(--spacing-md, 16px);
    align-items: center;
    padding-block: var(--spacing-md, 16px);
    border-top: 1px solid var(--theme-stroke, color-mix(in srgb, var(--theme-text) 14%, transparent));
  }

  .steps-head,
  .steps {
    grid-column: 1 / -1;
  }

  /* The tiles name themselves on the phone, so the head row waits for the
     wide layout where one header serves every row. */
  .head {
    display: none;
  }

  .head-cell {
    font-size: var(--font-size-min, 0.875rem);
    font-weight: 650;
    text-align: center;
    color: var(--theme-text-muted);
  }

  .path-head {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--spacing-xs, 4px);
  }

  .swatch {
    width: 1.1em;
    height: 3px;
    border-radius: 2px;
    background: var(--path-color);
  }

  .steps {
    min-width: 0;
    display: grid;
    gap: var(--spacing-xs, 4px);
  }

  .motions {
    font-weight: 650;
    line-height: 1.3;
  }

  .result {
    font-size: var(--font-size-min, 0.875rem);
    line-height: 1.5;
    color: var(--theme-text-muted);
  }

  .strip {
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--spacing-xs, 4px);
  }

  .cell {
    min-width: 0;
  }

  /* guide.css fixes the size classes at 7.5rem; these cells share the
     column, so the pictograph follows the cell instead. */
  .cell :global(.guide-pictograph.size-sm .pictograph-wrapper) {
    width: 100%;
    height: auto;
    max-width: none;
  }

  .tile {
    min-width: 0;
    display: grid;
    justify-items: center;
    gap: var(--spacing-xs, 4px);
  }

  .tile :global(.mandala-container) {
    width: 100% !important;
    height: auto !important;
    aspect-ratio: 1;
  }

  .tile :global(svg) {
    width: 100%;
    height: 100%;
  }

  .tile-label {
    font-size: var(--font-size-min, 0.875rem);
    color: var(--theme-text-muted);
  }

  /* Wide: one row per sequence, the notation on the left and the three
     drawings beside it in the same columns as their headers. */
  @container (min-width: 44rem) {
    .head,
    .row {
      grid-template-columns: minmax(14rem, 1.4fr) repeat(3, minmax(0, 1fr));
      gap: var(--spacing-sm, 8px) var(--spacing-md, 16px);
      align-items: center;
    }

    .head {
      display: grid;
    }

    .steps-head,
    .steps {
      grid-column: auto;
    }

    .steps-head {
      text-align: left;
    }

    .tile {
      width: 100%;
      max-width: 14rem;
      justify-self: center;
    }

    .tile-label {
      display: none;
    }
  }
</style>
