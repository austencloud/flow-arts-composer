<!--
  DurationPatternView.svelte

  Chrome-free duration-pattern editor body, rendered INLINE inside the Sequence
  Actions panel as a drill-down view (no Drawer wrapper). Single-lane duration
  binding via PatternStripEditor; Apply tiles the strip to a DurationPattern and
  runs the proven duration-pattern-manager.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { onMount } from "svelte";
  import PatternStripEditor from "#lib/shared/create/components/pattern-strip/PatternStripEditor.svelte";
  import type {
    StripBinding,
    StripValue,
  } from "#lib/shared/create/components/pattern-strip/pattern-strip-types.js";
  import { DURATION_RHYTHMS } from "#lib/shared/create/domain/rhythm/rhythm-catalog.js";
  import { stripToDurationPattern } from "../../domain/pattern-strip-apply";
  import * as durationPatternManager from "#lib/features/create/shared/services/duration-pattern-manager.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

  type DurationResult = {
    sequence: SequenceData;
    warnings?: readonly string[];
  };

  interface Props {
    sequence: SequenceData | null;
    onPreview: (result: DurationResult) => void;
    onApply: (result: DurationResult) => void;
  }

  let { sequence, onPreview, onApply }: Props = $props();

  const DUR_VALUES: StripValue[] = [1, 1.25, 1.5, 2, 4];
  const fmtDur = (v: StripValue) => (v === 1 ? "1×" : `${v}×`);
  const binding: StripBinding = {
    lanes: 1,
    rhythms: DURATION_RHYTHMS,
    valueList: DUR_VALUES,
    amountList: [1.25, 1.5, 2, 4],
    base: 1,
    format: fmtDur,
    laneColors: ["accent"],
    laneLabels: ["Hold"],
    // "Hold" is the right word above a row of cells and the wrong one at the
    // head of a sentence — "Hold holds 2× on every other step" names nothing.
    // The steps are what does the holding, so the sentence says so and the
    // strip keeps its short label.
    sentence: { verb: "hold", subject: ["Steps"] },
  };

  const seqLen = $derived(sequence?.steps.length ?? 8);
  const initPeriod = $derived(seqLen % 4 === 0 ? 4 : seqLen % 2 === 0 ? 2 : 1);

  let strip = $state<StripValue[][]>([[1, 1, 1, 1]]);

  // Seed from the sequence's ACTUAL durations so entering the view previews
  // no change. A canned downbeat-2× seed used to show step 1 at 2× the moment
  // the view opened, misrepresenting the loaded sequence. Durations outside
  // the editor's value list snap to the nearest supported value.
  function snapToStripValue(duration: number): StripValue {
    return DUR_VALUES.reduce((best, v) =>
      Math.abs(v - duration) < Math.abs(best - duration) ? v : best
    );
  }

  onMount(() => {
    const seeded = Array.from({ length: initPeriod }, (_, i) =>
      snapToStripValue(sequence?.steps[i]?.duration ?? 1)
    );
    strip = [seeded];
  });

  function applyValues(values: StripValue[][]): DurationResult | null {
    if (!sequence) return null;
    const pattern = stripToDurationPattern(
      values[0]! as number[],
      sequence.steps.length
    );
    const result = durationPatternManager.applyPattern(pattern, sequence);
    if (result.success && result.sequence) {
      return { sequence: result.sequence, warnings: result.warnings };
    }
    return null;
  }

  function previewStrip(nextStrip: StripValue[][]) {
    strip = nextStrip;
    const result = applyValues(nextStrip);
    if (result) onPreview(result);
  }

  function applyStrip() {
    const result = applyValues(strip);
    if (result) onApply(result);
  }
</script>

<div class="pattern-view-body">
  <div class="pattern-editor-scroll">
    <div class="pattern-view-inner">
      <PatternStripEditor
        {binding}
        sequenceLength={seqLen}
        value={strip}
        onChange={previewStrip}
        fitAvailableHeight
      />
    </div>
  </div>
  <div class="pattern-action-footer">
    <button
      class="apply-btn duration"
      onclick={applyStrip}
      disabled={!sequence}
    >
      {t("create_review_apply_to_sequence")}
    </button>
  </div>
</div>

<style>
  .pattern-view-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .pattern-editor-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 10px 12px 6px;
    display: flex;
    flex-direction: column;
  }

  /* Centered content column — see TurnPatternView for rationale. It grows into
     the scroller rather than floating in the middle of it, and never shrinks
     below its own content, so a pane shorter than the editor scrolls instead
     of clipping. */
  .pattern-view-inner {
    flex: 1 0 auto;
    margin-inline: auto;
    width: 100%;
    /* Grows with the panel instead of stopping at a laptop's width — a hard
       820px cap leaves two thirds of a 4K drawer as rail. */
    max-width: min(1180px, 100%);
    display: flex;
    flex-direction: column;
    justify-content: safe center;
  }

  /* The editor is sized by what it holds — no growing. Its panels hug their
     contents, so any height handed to it past that would open as black space
     inside the cards rather than under them. `0 0` and not `0 1`: a pane
     shorter than the editor scrolls instead of squashing it. */
  .pattern-view-inner :global(.pse) {
    flex: 0 0 auto;
  }

  .pattern-action-footer {
    flex: 0 0 auto;
    padding: 6px 12px 10px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    background: color-mix(
      in srgb,
      var(--theme-panel-bg, #10131a) 94%,
      transparent
    );
  }

  .apply-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #2dd4bf);
    outline-offset: 2px;
  }

  .apply-btn {
    width: 100%;
    display: block;
    max-width: 820px;
    min-height: var(--min-touch-target, 44px);
    margin: 0 auto;
    padding: 0 14px;
    border: none;
    border-radius: 12px;
    font: inherit;
    font-weight: 700;
    cursor: pointer;
    background: linear-gradient(135deg, var(--theme-accent, #2dd4bf), #0e8f80);
    color: #fff;
  }

  .apply-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @container sequence-action-subview (max-width: 599px) and (max-height: 430px) {
    .pattern-editor-scroll {
      padding: 8px 10px 4px;
    }

    .pattern-action-footer {
      padding: 4px 10px;
    }
  }

  @container sequence-action-subview (min-width: 600px) and (max-height: 540px) {
    .pattern-editor-scroll {
      padding: 6px 10px;
    }

    /* min-height, not height: the column still fills the short foldable drawer,
       but grows past it rather than hiding the overflow from the scroller. */
    .pattern-view-inner {
      min-height: 100%;
    }

    .apply-btn {
      min-height: var(--min-touch-target, 44px);
      border-radius: 10px;
    }
  }
</style>
