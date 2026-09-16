<!--
  Similarity panel — the comparison suite's first visible consumer.

  `src/lib/shared/comparison/` was written, guarded browser-only, and then never
  imported by anything a user could reach. This panel is what finally reads it:
  the two loaded cards go into `SimilarityCalculator.computeSimilarity` and come
  back as one overall score, four component scores, a per-step score row, and a
  breakdown. The point is not the number — it is telling you, before you spend
  700ms on a search, whether the two cards you loaded are near-duplicates whose
  combinations will all read the same.

  WHICH NUMBERS ARE TRUSTWORTHY (read before building anything on this):

    - Word, position, structural: plain arithmetic over the loaded data —
      Levenshtein on the words, position-group equality per step index, and
      length/circularity/word-length ratios. Sound as far as they go.
    - Motion: INFLATED, and the least trustworthy number on the panel. The
      Needleman-Wunsch scaffolding around it is real — it is the only component
      that tolerates a length difference or an insertion — but the scorer under
      it is a stub. `computeTransformedSimilarity`
      (`services/sequence-aligner.ts:249`) takes a `SpatialTransform`, IGNORES
      it, and returns `min(1, directSimilarity × 1.1)`. So every non-exact pair
      is scored about 10% high, and the per-pair `transform` label on each
      aligned pair names whichever transform happened to be tried last rather
      than a relationship anyone verified. Read motion as a rough upper bound,
      never as a measurement, and do not build on the transform labels.
    - Per-step scores: step i against step i, no alignment. A phase-shifted
      copy therefore reads as DIFFERENT, which is correct here — period-2 loop
      phases are genuinely different sequences and must never be collapsed.
    - NOT used, deliberately: `SequenceCanonicalizer`'s hash. It carries three
      documented defects (cited on `contentDedupKey` in
      `combination/services/walk-classifier.ts`) and nothing on this panel
      depends on it. Neither does `SimilarityCalculator`.

  The sliders are native range inputs. That is not the checkbox ban's territory
  — a continuous 0-1 weight has no toggle to be. The closest existing primitive
  is `features/lab/tabs/scene-lab/components/ParamSlider.svelte`, which stacks
  its label above the control and bundles a paired number input; neither fits
  the three-column `label | control | value` grid the dimension bars above
  already establish, and matching that grid is the whole point of the row. The
  weights they hold are normalized at the state seam (`lab-state.svelte.ts`),
  because the calculator sums without dividing.
-->
<script lang="ts">
  import type { SimilarityReport } from "$lib/shared/comparison/services/types";

  import type { SimilarityWeights } from "./lab-state.svelte";

  interface Props {
    report: SimilarityReport | null;
    error: string;
    /** A caveat about a report that DID compute. Not a failure — styled as one
     *  would read as broken when the panel is showing perfectly good numbers. */
    note: string;
    /** Read-only here. Slider moves go back through `onWeightChange`. */
    weights: SimilarityWeights;
    onWeightChange: (key: keyof SimilarityWeights, value: number) => void;
    onReset: () => void;
  }

  // A callback rather than `bind:` on `weights[key]`: the weights object is
  // owned by the page's lab state, and writing into another component's state
  // from here is exactly what Svelte 5's ownership warning is about.
  const { report, error, note, weights, onWeightChange, onReset }: Props =
    $props();

  /** Above this, the two cards are close enough that combining them is dull. */
  const NEAR_DUPLICATE = 0.85;

  const pct = (value: number) => Math.round(value * 100);

  const DIMENSIONS: {
    key: keyof SimilarityWeights;
    label: string;
    read: (r: SimilarityReport) => number;
  }[] = [
    { key: "word", label: "Word", read: (r) => r.wordSimilarity },
    { key: "motion", label: "Motion", read: (r) => r.motionSimilarity },
    { key: "placement", label: "Placement", read: (r) => r.placementSimilarity },
    {
      key: "structural",
      label: "Structural",
      read: (r) => r.structuralSimilarity,
    },
  ];

  const overall = $derived(report ? pct(report.overallScore) : 0);
  const nearDuplicate = $derived(
    report !== null && report.overallScore > NEAR_DUPLICATE
  );
  const beatScores = $derived(report?.stepByBeatScores ?? []);
</script>

<section class="similarity" aria-label="Card similarity">
  <header class="head">
    <h2>Similarity</h2>
    <span class="overall" class:hot={nearDuplicate}>
      {#if report}{overall}{:else}—{/if}<span class="unit">%</span>
    </span>
    <span class="spacer"></span>
    <button type="button" class="btn ghost" onclick={onReset}
      >Reset weights</button
    >
  </header>

  {#if error}
    <p class="banner error">{error}</p>
  {/if}

  {#if note}
    <p class="banner info">{note}</p>
  {/if}

  {#if nearDuplicate}
    <p class="banner warn">
      These cards are {overall}% similar — combinations will feel repetitive.
    </p>
  {/if}

  {#if report}
    <p class="summary">{report.summary}</p>

    <div class="dims" aria-label="Component scores">
      {#each DIMENSIONS as dim (dim.key)}
        {@const value = dim.read(report)}
        <span class="dim-label">{dim.label}</span>
        <span class="track"
          ><span
            class="fill"
            style:width="{Math.min(100, Math.max(0, value * 100))}%"
          ></span></span
        >
        <span class="dim-value">{pct(value)}%</span>
      {/each}
    </div>

    <div class="beats" aria-label="Per-step similarity">
      <span class="section-label">Per step</span>
      <div class="beat-row">
        {#each beatScores as score, i (i)}
          <span
            class="beat"
            title="Step {i + 1}: {pct(score)}%"
            style:--h="{Math.min(100, Math.max(0, score * 100))}%"
          ></span>
        {/each}
      </div>
    </div>

    <dl class="breakdown">
      <div>
        <dt>Length</dt>
        <dd>
          {report.breakdown.lengthMatch
            ? "match"
            : `${report.breakdown.lengthDifference} apart`}
        </dd>
      </div>
      <div>
        <dt>Word edits</dt>
        <dd>{report.breakdown.wordEditDistance}</dd>
      </div>
      <div>
        <dt>Motion types</dt>
        <dd>
          {report.breakdown.motionTypeMatches} / {report.breakdown
            .motionTypeMatches + report.breakdown.motionTypeMismatches}
        </dd>
      </div>
      <div>
        <dt>Perfect steps</dt>
        <dd>{report.breakdown.perfectBeatMatches}</dd>
      </div>
    </dl>
  {/if}

  <div class="weights" aria-label="Component weights">
    <span class="section-label">Weights</span>
    {#each DIMENSIONS as dim (dim.key)}
      <label class="weight-label" for="weight-{dim.key}">{dim.label}</label>
      <input
        id="weight-{dim.key}"
        class="slider"
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={weights[dim.key]}
        oninput={(event) =>
          onWeightChange(dim.key, Number(event.currentTarget.value))}
      />
      <span class="weight-value">{weights[dim.key].toFixed(2)}</span>
    {/each}
  </div>

  <p class="note">
    Weights are normalized before they reach the calculator, so the overall
    score stays a 0-100% blend however far the sliders drift. Per-step scores
    compare step i to step i with no alignment — a phase-shifted copy reads as
    different, which is right: two phases of a period-2 loop are two different
    sequences.
  </p>
</section>

<style>
  .similarity {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    padding: 0.9rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.75rem;
    background: rgba(255, 255, 255, 0.03);
  }

  .head {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
  }
  .head h2 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 700;
    color: #fff;
  }
  .spacer {
    flex: 1 1 auto;
  }

  /* Reserved width for three digits plus the unit: the score changes on every
     slider tick and must not shove the reset button. */
  .overall {
    min-width: 5.5rem;
    font-size: 2rem;
    font-weight: 700;
    line-height: 1;
    color: #a5b4fc;
    font-variant-numeric: tabular-nums;
  }
  .overall.hot {
    color: #fbbf24;
  }
  .unit {
    font-size: 1rem;
    font-weight: 600;
    opacity: 0.6;
  }

  .banner {
    margin: 0;
    padding: 0.6rem 0.8rem;
    border-radius: 0.6rem;
    font-size: 0.85rem;
    line-height: 1.45;
  }
  .banner.warn {
    border: 1px solid rgba(250, 204, 21, 0.3);
    background: rgba(250, 204, 21, 0.08);
    color: #fde68a;
  }
  .banner.error {
    border: 1px solid rgba(248, 113, 113, 0.45);
    background: rgba(248, 113, 113, 0.12);
    color: #fca5a5;
  }
  .banner.info {
    border: 1px solid rgba(147, 197, 253, 0.28);
    background: rgba(96, 165, 250, 0.1);
    color: #bfdbfe;
  }

  .summary {
    margin: 0;
    font-size: 0.82rem;
    line-height: 1.45;
    color: rgba(255, 255, 255, 0.65);
  }

  /* Fixed label column + fixed value column: only the track flexes, so nothing
     moves as the numbers change. */
  .dims,
  .weights {
    display: grid;
    grid-template-columns: 6.5rem minmax(0, 1fr) 3.5rem;
    align-items: center;
    gap: 0.35rem 0.6rem;
  }
  .weights {
    padding-top: 0.3rem;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }
  .section-label {
    grid-column: 1 / -1;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.45);
  }

  .dim-label,
  .weight-label {
    font-size: 0.8rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.7);
  }

  .track {
    height: 0.6rem;
    border-radius: 0.3rem;
    background: rgba(255, 255, 255, 0.07);
    overflow: hidden;
  }
  .fill {
    display: block;
    height: 100%;
    border-radius: 0.3rem;
    background: linear-gradient(90deg, #6366f1, #a5b4fc);
  }

  .dim-value,
  .weight-value {
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.55);
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .slider {
    width: 100%;
    min-height: 1.5rem;
    accent-color: #8b5cf6;
    cursor: pointer;
  }

  /* Reserved height: the row is the same size whether the scores are 0 or 1,
     and whether the pair has 2 steps or 32. */
  .beats {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }
  .beat-row {
    display: flex;
    align-items: flex-end;
    gap: 0.15rem;
    height: 3rem;
    padding: 0.15rem;
    border-radius: 0.4rem;
    background: rgba(0, 0, 0, 0.25);
    overflow-x: auto;
  }
  .beat {
    flex: 1 1 0.6rem;
    min-width: 0.4rem;
    height: var(--h);
    min-height: 2px;
    border-radius: 0.15rem 0.15rem 0 0;
    background: #6366f1;
  }

  .breakdown {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin: 0;
  }
  .breakdown div {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
    padding: 0.2rem 0.55rem;
    border-radius: 0.7rem;
    background: rgba(255, 255, 255, 0.06);
  }
  .breakdown dt {
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: rgba(255, 255, 255, 0.4);
  }
  .breakdown dd {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.7);
    font-variant-numeric: tabular-nums;
  }

  .note {
    margin: 0;
    font-size: 0.75rem;
    line-height: 1.45;
    color: rgba(255, 255, 255, 0.4);
  }

  .btn {
    min-height: 2.75rem;
    padding: 0.4rem 0.9rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 0.5rem;
    background: rgba(255, 255, 255, 0.05);
    color: rgba(255, 255, 255, 0.8);
    font: inherit;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
  }
  .btn:hover {
    background: rgba(139, 92, 246, 0.16);
    color: #fff;
  }
  .btn.ghost {
    background: transparent;
  }
</style>
