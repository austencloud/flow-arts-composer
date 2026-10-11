<script lang="ts">
  /**
   * NotationReviewPanel — the review half of the real-clip validation harness.
   *
   * Renders the detected notation as a pictograph strip with per-beat
   * confidence (including WHICH tracking component was weakest), lets the
   * user correct a misread beat (SegmentedControl per field — no dropdowns,
   * no checkboxes), and diffs the RAW detection against a pasted ground-truth
   * label via the validation scorecard. Corrections affect the rendered strip
   * only, never the score — the scorecard measures the pipeline, not the human.
   */
  import type { BeatNotation } from "../services/notation-pipeline";
  import type { StaffMotionNotation } from "../domain/notation-3d";
  import { notationToPictographData } from "../services/notation-to-pictograph";
  import { parseGroundTruth } from "../validation/ground-truth";
  import {
    scoreNotation,
    type ScorecardReport,
    type BeatScore,
  } from "../validation/scorecard";
  import type { GridLocation } from "../domain/models";
  import {
    MotionType,
    RotationDirection,
    Orientation,
  } from "../domain/tka-enums";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte";
  import {
    HandSide,
    type HandSide as HandSideValue,
  } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";

  interface Props {
    beats: BeatNotation[];
  }

  let { beats }: Props = $props();

  // --- Corrections (per beat index, per hand, partial field overrides) ---
  type HandOverride = Partial<
    Pick<
      StaffMotionNotation,
      | "motionType"
      | "turns"
      | "rotationDirection"
      | "startOrientation"
      | "endOrientation"
      | "startLocation"
      | "endLocation"
    >
  >;
  type BeatOverride = { left?: HandOverride; right?: HandOverride };

  let corrections = $state<Record<number, BeatOverride>>({});
  let selected = $state<number | null>(null);

  // New notation run = new beats array = stale corrections. Reset.
  $effect(() => {
    void beats;
    corrections = {};
    selected = null;
  });

  function applyHand(
    base: StaffMotionNotation,
    over: HandOverride | undefined
  ): StaffMotionNotation {
    if (!over) return base;
    const merged = { ...base, ...over };
    // Float carries no turn count; keep the pair consistent.
    if (merged.motionType === MotionType.FLOAT) merged.turns = 0;
    return merged;
  }

  const correctedBeats = $derived(
    beats.map((b, i) => ({
      left: applyHand(b.left, corrections[i]?.left),
      right: applyHand(b.right, corrections[i]?.right),
    }))
  );

  // Include a per-beat revision in the pictograph id so a correction remounts
  // (and re-renders) exactly that cell.
  let revisions = $state<Record<number, number>>({});
  const pictographs = $derived(
    correctedBeats.map((b, i) =>
      notationToPictographData(
        b.left,
        b.right,
        `beat-${i}-r${revisions[i] ?? 0}`
      )
    )
  );

  function setField(
    beatIndex: number,
    hand: HandSideValue,
    field: keyof HandOverride,
    value: unknown
  ) {
    const beatOverride: BeatOverride = { ...(corrections[beatIndex] ?? {}) };
    beatOverride[hand] = { ...(beatOverride[hand] ?? {}), [field]: value };
    corrections = { ...corrections, [beatIndex]: beatOverride };
    revisions = { ...revisions, [beatIndex]: (revisions[beatIndex] ?? 0) + 1 };
  }

  function resetBeat(beatIndex: number) {
    const next = { ...corrections };
    delete next[beatIndex];
    corrections = next;
    revisions = { ...revisions, [beatIndex]: (revisions[beatIndex] ?? 0) + 1 };
  }

  function isCorrected(beatIndex: number): boolean {
    return corrections[beatIndex] !== undefined;
  }

  // --- Confidence presentation ---
  function band(conf: number): "good" | "warn" | "bad" {
    return conf >= 0.8 ? "good" : conf >= 0.5 ? "warn" : "bad";
  }

  /** Name the weakest confidence component so the badge says WHY. */
  function weakestComponent(beat: BeatNotation): string | null {
    const details = [
      beat.left.confidenceDetail,
      beat.right.confidenceDetail,
    ].filter((d) => d !== undefined);
    if (details.length === 0) return null;
    let worstName: string | null = null;
    let worst = 1;
    for (const d of details) {
      for (const [name, value] of [
        ["blob", d!.blob],
        ["ends", d!.correspondence],
        ["tilt", d!.orientation],
      ] as const) {
        if (value < worst) {
          worst = value;
          worstName = name;
        }
      }
    }
    return worst < 0.8 ? worstName : null;
  }

  function beatConfidence(beat: BeatNotation): number {
    return Math.min(beat.left.confidence, beat.right.confidence);
  }

  /** The selected beat, narrowed for the template (null-safe editor state). */
  const editing = $derived.by(() => {
    if (selected === null) return null;
    const beat = correctedBeats[selected];
    return beat ? { idx: selected, beat } : null;
  });

  const HANDS = [HandSide.LEFT, HandSide.RIGHT] as const;

  // --- Correction control options ---
  const MOTION_OPTIONS = [
    { value: MotionType.PRO, label: "pro" },
    { value: MotionType.ANTI, label: "anti" },
    { value: MotionType.FLOAT, label: "float" },
    { value: MotionType.DASH, label: "dash" },
    { value: MotionType.STATIC, label: "static" },
  ];
  const ORIENT_OPTIONS = [
    { value: Orientation.IN, label: "in" },
    { value: Orientation.OUT, label: "out" },
    { value: Orientation.CLOCK, label: "clock" },
    { value: Orientation.COUNTER, label: "counter" },
  ];
  const ROTATION_OPTIONS = [
    { value: RotationDirection.CLOCKWISE, label: "cw" },
    { value: RotationDirection.COUNTER_CLOCKWISE, label: "ccw" },
    { value: RotationDirection.NO_ROTATION, label: "none" },
  ];
  const LOCATIONS: GridLocation[] = [
    "n",
    "ne",
    "e",
    "se",
    "s",
    "sw",
    "w",
    "nw",
  ];
  const LOCATION_OPTIONS = LOCATIONS.map((l) => ({ value: l, label: l }));

  function stepTurns(beatIndex: number, hand: HandSideValue, delta: number) {
    const current = correctedBeats[beatIndex]![hand].turns;
    const next = Math.min(3, Math.max(0, current + delta));
    setField(beatIndex, hand, "turns", next);
  }

  // --- Ground-truth scorecard ---
  let groundTruthJson = $state("");
  let parseError = $state<string | null>(null);
  let report = $state<ScorecardReport | null>(null);

  function runScorecard() {
    parseError = null;
    report = null;
    try {
      const truth = parseGroundTruth(groundTruthJson);
      // Score the RAW detection — the machine's answer, not the corrected one.
      report = scoreNotation(beats, truth);
    } catch (err) {
      parseError = err instanceof Error ? err.message : String(err);
    }
  }

  function beatRowLabel(b: BeatScore): string {
    if (b.detectedIndex === null)
      return `missed (truth #${(b.truthIndex ?? 0) + 1})`;
    if (b.truthIndex === null)
      return `extra (detected #${b.detectedIndex + 1})`;
    return `#${b.detectedIndex + 1}`;
  }

  function handSummary(hand: BeatScore["left"]): string {
    if (!hand) return "—";
    if (hand.scored === 0) return "—";
    const misses = hand.fields.filter((f) => !f.match);
    if (misses.length === 0) return `${hand.matched}/${hand.scored}`;
    return misses
      .map((f) => `${f.field}: ${f.detected}≠${f.expected}`)
      .join(", ");
  }
</script>

<div class="notation-review">
  <!-- Pictograph strip with per-beat confidence -->
  <div class="notation-strip" aria-label="Detected beats">
    {#each pictographs as pd, i (pd.id)}
      <button
        class="notation-cell"
        class:selected={selected === i}
        onclick={() => (selected = selected === i ? null : i)}
        aria-pressed={selected === i}
        aria-label="Beat {i + 1}"
      >
        <div class="cell-pictograph">
          <PictographContainer pictographData={pd} disableTransitions />
        </div>
        {#if correctedBeats[i]}
          {@const conf = beatConfidence(beats[i]!)}
          {@const weak = weakestComponent(beats[i]!)}
          <span class="confidence-badge {band(conf)}">
            <span class="conf-value">{Math.round(conf * 100)}%</span>
            <span class="conf-weak" class:visible={weak !== null}
              >{weak ?? "ok"}</span
            >
          </span>
          <span class="corrected-pill" class:visible={isCorrected(i)}
            >edited</span
          >
        {/if}
      </button>
    {/each}
  </div>

  <!-- Correction editor for the selected beat -->
  {#if editing}
    {@const idx = editing.idx}
    <div class="correction-editor">
      <div class="editor-header">
        <h3>Step {idx + 1} — correct a misread</h3>
        <button
          class="reset-btn"
          onclick={() => resetBeat(idx)}
          disabled={!isCorrected(idx)}
        >
          Reset beat
        </button>
      </div>
      {#each HANDS as hand (hand)}
        {@const motion = editing.beat[hand]}
        <div class="hand-section">
          <span class="hand-label {hand}">{hand}</span>
          <div class="field-grid">
            <div class="field">
              <span class="field-label">motion</span>
              <SegmentedControl
                options={MOTION_OPTIONS}
                value={motion.motionType}
                onchange={(v) => setField(idx, hand, "motionType", v)}
                color={hand === HandSide.LEFT ? "blue" : "red"}
                size="sm"
              />
            </div>
            <div class="field">
              <span class="field-label">turns</span>
              <div class="turns-stepper">
                <button
                  class="step-btn"
                  onclick={() => stepTurns(idx, hand, -0.5)}
                  disabled={motion.motionType === MotionType.FLOAT ||
                    motion.turns <= 0}
                  aria-label="Decrease turns"
                >
                  −
                </button>
                <span class="turns-value">
                  {motion.motionType === MotionType.FLOAT ? "fl" : motion.turns}
                </span>
                <button
                  class="step-btn"
                  onclick={() => stepTurns(idx, hand, 0.5)}
                  disabled={motion.motionType === MotionType.FLOAT ||
                    motion.turns >= 3}
                  aria-label="Increase turns"
                >
                  +
                </button>
              </div>
            </div>
            <div class="field">
              <span class="field-label">rotation</span>
              <SegmentedControl
                options={ROTATION_OPTIONS}
                value={motion.rotationDirection}
                onchange={(v) => setField(idx, hand, "rotationDirection", v)}
                color={hand === HandSide.LEFT ? "blue" : "red"}
                size="sm"
              />
            </div>
            <div class="field">
              <span class="field-label">start ori</span>
              <SegmentedControl
                options={ORIENT_OPTIONS}
                value={motion.startOrientation}
                onchange={(v) => setField(idx, hand, "startOrientation", v)}
                color={hand === HandSide.LEFT ? "blue" : "red"}
                size="sm"
              />
            </div>
            <div class="field">
              <span class="field-label">end ori</span>
              <SegmentedControl
                options={ORIENT_OPTIONS}
                value={motion.endOrientation}
                onchange={(v) => setField(idx, hand, "endOrientation", v)}
                color={hand === HandSide.LEFT ? "blue" : "red"}
                size="sm"
              />
            </div>
            <div class="field wide">
              <span class="field-label">start loc</span>
              <SegmentedControl
                options={LOCATION_OPTIONS}
                value={motion.startLocation}
                onchange={(v) => setField(idx, hand, "startLocation", v)}
                color={hand === HandSide.LEFT ? "blue" : "red"}
                size="sm"
              />
            </div>
            <div class="field wide">
              <span class="field-label">end loc</span>
              <SegmentedControl
                options={LOCATION_OPTIONS}
                value={motion.endLocation}
                onchange={(v) => setField(idx, hand, "endLocation", v)}
                color={hand === HandSide.LEFT ? "blue" : "red"}
                size="sm"
              />
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  <!-- Ground-truth scorecard -->
  <div class="scorecard-section">
    <h3>Validate against ground truth</h3>
    <p class="scorecard-hint">
      Paste the performed sequence: harness JSON ({"{"}"beats": [{"{"}"left": …,
      "right": …{"}"}]{"}"}), app sequence data (steps + motions), or a bare
      beat array. Only supplied fields are scored. Corrections above never
      affect the score — it measures the pipeline.
    </p>
    <textarea
      class="truth-input"
      bind:value={groundTruthJson}
      rows="5"
      placeholder={'{"word": "AB", "beats": [{"letter": "A", "left": {"motionType": "pro", "startLocation": "n", "endLocation": "e"}, "right": {…}}]}'}
      aria-label="Ground truth sequence JSON"
    ></textarea>
    <div class="scorecard-actions">
      <button
        class="score-btn"
        onclick={runScorecard}
        disabled={groundTruthJson.trim() === ""}
      >
        <i class="fa fa-scale-balanced" aria-hidden="true"></i>
        Score against ground truth
      </button>
    </div>
    {#if parseError}
      <p class="parse-error">{parseError}</p>
    {/if}
    {#if report}
      <div class="report">
        <div class="report-summary">
          <div class="summary-stat">
            <span class="stat-label">Accuracy</span>
            <span class="stat-value"
              >{(report.overall.accuracy * 100).toFixed(0)}%</span
            >
            <span class="stat-sub"
              >{report.overall.matched}/{report.overall.scored} fields</span
            >
          </div>
          <div class="summary-stat">
            <span class="stat-label">Steps</span>
            <span class="stat-value">{report.detectedBeatCount}</span>
            <span class="stat-sub">truth: {report.truthBeatCount}</span>
          </div>
          <div class="summary-stat">
            <span class="stat-label">Mirrored</span>
            <span class="stat-value"
              >{(report.mirrored.accuracy * 100).toFixed(0)}%</span
            >
            <span class="stat-sub"
              >{report.mirrored.likelyMirrored
                ? "likely mirrored!"
                : "not mirrored"}</span
            >
          </div>
        </div>
        {#if report.notes.length > 0}
          <ul class="report-notes">
            {#each report.notes as note (note)}
              <li>{note}</li>
            {/each}
          </ul>
        {/if}
        <div class="report-table-wrap">
          <table class="report-table">
            <thead>
              <tr>
                <th>Step</th>
                <th>Letter</th>
                <th>Score</th>
                <th>Conf</th>
                <th>Left</th>
                <th>Right</th>
              </tr>
            </thead>
            <tbody>
              {#each report.beats as b, i (i)}
                <tr
                  class:unaligned={b.detectedIndex === null ||
                    b.truthIndex === null}
                >
                  <td>{beatRowLabel(b)}</td>
                  <td>{b.letter ?? "—"}</td>
                  <td class="num">
                    {b.detectedIndex === null || b.truthIndex === null
                      ? "—"
                      : `${(b.score * 100).toFixed(0)}%`}
                  </td>
                  <td class="num"
                    >{b.confidence === null
                      ? "—"
                      : `${(b.confidence * 100).toFixed(0)}%`}</td
                  >
                  <td>{handSummary(b.left)}</td>
                  <td>{handSummary(b.right)}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        <div class="perfield-wrap">
          {#each Object.entries(report.perField) as [field, tally] (field)}
            {#if tally.scored > 0}
              <span
                class="perfield-chip"
                class:weak={tally.matched < tally.scored}
              >
                {field}
                <span class="perfield-count"
                  >{tally.matched}/{tally.scored}</span
                >
              </span>
            {/if}
          {/each}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .notation-review {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .notation-strip {
    display: flex;
    gap: 0.5rem;
    overflow-x: auto;
    padding: 0.5rem;
    background: var(--theme-card-bg);
    border-radius: 8px;
  }

  .notation-cell {
    flex: 0 0 auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem;
    background: none;
    border: 2px solid transparent;
    border-radius: 8px;
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .notation-cell:hover {
    border-color: var(--theme-stroke);
  }

  .notation-cell.selected {
    border-color: var(--theme-accent);
  }

  .cell-pictograph {
    width: 120px;
    aspect-ratio: 1;
  }

  /* Fixed-size badge slot: contents change, box never does (no layout shift). */
  .confidence-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-width: 6.5ch;
    padding: 0.1rem 0.45rem;
    border-radius: 9999px;
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .confidence-badge.good {
    background: color-mix(in srgb, var(--semantic-success) 18%, transparent);
    color: var(--semantic-success);
  }

  .confidence-badge.warn {
    background: color-mix(in srgb, var(--semantic-warning) 18%, transparent);
    color: var(--semantic-warning);
  }

  .confidence-badge.bad {
    background: color-mix(in srgb, var(--semantic-error) 18%, transparent);
    color: var(--semantic-error);
  }

  .conf-value {
    min-width: 3.5ch;
    text-align: right;
  }

  /* Reserved slot; toggles visibility, never display (no layout shift). */
  .conf-weak {
    visibility: hidden;
    min-width: 3ch;
    font-weight: 500;
    opacity: 0.85;
  }

  .conf-weak.visible {
    visibility: visible;
  }

  .corrected-pill {
    visibility: hidden;
    font-size: var(--font-size-compact, 0.7rem);
    color: var(--theme-accent);
    font-weight: 600;
  }

  .corrected-pill.visible {
    visibility: visible;
  }

  .correction-editor {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem;
    background: var(--theme-card-bg);
    border-radius: 8px;
  }

  .editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .editor-header h3 {
    margin: 0;
    font-size: 1rem;
  }

  .reset-btn {
    min-height: var(--min-touch-target, 44px);
    padding: 0.4rem 0.9rem;
    background: var(--theme-stroke);
    color: var(--theme-text);
    border: 1px solid transparent;
    border-radius: 8px;
    font-size: var(--font-size-compact, 0.8rem);
    font-weight: 600;
    cursor: pointer;
    transition:
      border-color 0.15s,
      opacity 0.15s;
  }

  .reset-btn:hover:not(:disabled) {
    border-color: var(--theme-accent);
  }

  .reset-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .hand-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .hand-label {
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .hand-label.blue {
    color: var(--prop-blue, #3b82f6);
  }

  .hand-label.red {
    color: var(--prop-red, #ef4444);
  }

  .field-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 0.5rem 0.75rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .field.wide {
    grid-column: 1 / -1;
  }

  .field-label {
    font-size: var(--font-size-compact, 0.7rem);
    opacity: 0.65;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .turns-stepper {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .step-btn {
    min-width: var(--min-touch-target, 44px);
    min-height: var(--min-touch-target, 44px);
    background: var(--theme-stroke);
    color: var(--theme-text);
    border: 1px solid transparent;
    border-radius: 8px;
    font-size: 1.1rem;
    font-weight: 700;
    cursor: pointer;
    transition:
      border-color 0.15s,
      opacity 0.15s;
  }

  .step-btn:hover:not(:disabled) {
    border-color: var(--theme-accent);
  }

  .step-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .turns-value {
    min-width: 3ch;
    text-align: center;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .scorecard-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
    background: var(--theme-card-bg);
    border-radius: 8px;
  }

  .scorecard-section h3 {
    margin: 0;
    font-size: 1rem;
  }

  .scorecard-hint {
    margin: 0;
    font-size: var(--font-size-compact, 0.8rem);
    opacity: 0.7;
  }

  .truth-input {
    width: 100%;
    padding: 0.5rem;
    background: var(--theme-panel-bg);
    color: var(--theme-text);
    border: 1px solid var(--theme-stroke);
    border-radius: 8px;
    font-family: var(--font-mono, monospace);
    font-size: var(--font-size-compact, 0.8rem);
    resize: vertical;
  }

  .scorecard-actions {
    display: flex;
  }

  .score-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: var(--min-touch-target, 44px);
    padding: 0.6rem 1.25rem;
    background: var(--theme-accent);
    color: white;
    border: none;
    border-radius: 10px;
    font-size: var(--font-size-sm, 0.875rem);
    font-weight: 600;
    cursor: pointer;
    transition:
      transform 0.15s,
      opacity 0.15s;
  }

  .score-btn:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  .score-btn:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .parse-error {
    margin: 0;
    color: var(--semantic-error);
    font-size: var(--font-size-compact, 0.8rem);
  }

  .report {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .report-summary {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }

  .summary-stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0.6rem;
    background: var(--theme-panel-bg);
    border-radius: 8px;
  }

  .stat-label {
    font-size: var(--font-size-compact, 0.7rem);
    opacity: 0.6;
    text-transform: uppercase;
  }

  .stat-value {
    font-size: 1.15rem;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .stat-sub {
    font-size: var(--font-size-compact, 0.7rem);
    opacity: 0.7;
    font-variant-numeric: tabular-nums;
  }

  .report-notes {
    margin: 0;
    padding-left: 1.25rem;
    font-size: var(--font-size-compact, 0.8rem);
    color: var(--semantic-warning);
  }

  .report-table-wrap {
    overflow-x: auto;
  }

  .report-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-compact, 0.8rem);
  }

  .report-table th,
  .report-table td {
    padding: 0.35rem 0.5rem;
    text-align: left;
    border-bottom: 1px solid var(--theme-stroke);
    white-space: nowrap;
  }

  .report-table .num {
    font-variant-numeric: tabular-nums;
    text-align: right;
  }

  .report-table tr.unaligned {
    color: var(--semantic-warning);
  }

  .perfield-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .perfield-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.2rem 0.6rem;
    border-radius: 9999px;
    background: color-mix(in srgb, var(--semantic-success) 14%, transparent);
    color: var(--semantic-success);
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 600;
  }

  .perfield-chip.weak {
    background: color-mix(in srgb, var(--semantic-warning) 14%, transparent);
    color: var(--semantic-warning);
  }

  .perfield-count {
    font-variant-numeric: tabular-nums;
  }
</style>
