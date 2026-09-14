<!--
  TurnPatternView.svelte

  Chrome-free turn-pattern editor body, rendered INLINE inside the Sequence
  Actions panel as a drill-down view (no Drawer wrapper). The strip is the
  source of truth: Length × Rhythm × Amount edits a 2-lane (blue/red) turn
  strip, which Apply converts to a TurnPattern and runs through the proven
  turn-pattern-manager.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import PatternStripEditor from "$lib/shared/create/components/pattern-strip/PatternStripEditor.svelte";
  import type {
    StripBinding,
    StripValue,
  } from "$lib/shared/create/components/pattern-strip/pattern-strip-types";
  import { PER_HAND_RHYTHMS } from "$lib/shared/create/domain/rhythm/rhythm-catalog";
  import { stampPerHand } from "$lib/shared/create/domain/rhythm/rhythm-mask";
  import { stripToTurnPattern } from "../../domain/pattern-strip-apply";
  import type { TurnValue } from "$lib/shared/create/domain/turn-pattern-data";
  import * as turnPatternManager from "$lib/shared/create/services/turn-pattern-manager";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

  interface Props {
    sequence: SequenceData | null;
    onApply: (result: {
      sequence: SequenceData;
      warnings?: readonly string[];
    }) => void;
  }

  let { sequence, onApply }: Props = $props();

  const TURN_VALUES: StripValue[] = [0, 0.5, 1, 1.5, 2, 2.5, 3, "fl"];
  const fmtTurn = (v: StripValue) => (v === "fl" ? "fl" : String(v));
  const binding: StripBinding = {
    lanes: 2,
    rhythms: PER_HAND_RHYTHMS,
    valueList: TURN_VALUES,
    amountList: [0.5, 1, 1.5, 2, 2.5, 3],
    base: 0,
    format: fmtTurn,
    laneColors: ["blue", "red"],
    // Labels match the APPLY TO / HandSelector convention (blue=Left, red=Right);
    // colour coding stays via laneColors.
    laneLabels: ["Left", "Right"],
    sentence: { verb: "turns" },
  };

  const seqLen = $derived(sequence?.steps.length ?? 8);
  const initPeriod = $derived(seqLen % 4 === 0 ? 4 : seqLen % 2 === 0 ? 2 : 1);

  let strip = $state<StripValue[][]>([
    [0, 1],
    [1, 0],
  ]);

  // Seed once when the view mounts (entering the drill-down). Re-mounts on each
  // entry, so edits are not clobbered by sequence-length changes while open.
  onMount(() => {
    const alt = stampPerHand(PER_HAND_RHYTHMS[2]!, initPeriod, 1, 1, 0); // alternating x1
    strip = [alt.left, alt.right];
  });

  function applyStrip() {
    if (!sequence) return;
    // StripValue widens to boolean for toggle-style strips; this binding's
    // TURN_VALUES only ever hold numbers and "fl", so the narrow is safe.
    const pattern = stripToTurnPattern(
      strip[0]! as TurnValue[],
      strip[1]! as TurnValue[],
      sequence.steps.length
    );
    const result = turnPatternManager.applyPattern(pattern, sequence, "both");
    if (result.success && result.sequence) {
      onApply({ sequence: result.sequence, warnings: result.warnings });
    }
  }
</script>

<div class="pattern-view-body">
  <div class="pattern-editor-scroll">
    <div class="pattern-view-inner">
      <PatternStripEditor
        {binding}
        sequenceLength={seqLen}
        value={strip}
        onChange={(v) => (strip = v)}
      />
    </div>
  </div>
  <div class="pattern-action-footer">
    <button class="apply-btn turn" onclick={applyStrip} disabled={!sequence}>
      Apply to sequence
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

  /* One shared content column, centered horizontally, taking the pane's height
     and never shrinking below its own content — so a pane shorter than the
     editor scrolls instead of clipping. `safe center` parks the editor in the
     middle of the leftover height once its panels stop accepting more (see the
     `.pse` ceiling below); without it a tall drawer strands the whole thing at
     the top with a screen of dead space under the strip. */
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
    /* The hand colour itself. A gradient toward white put a lighter blue at
       the top edge, which on the same screen as the blue lane reads as two
       different blues. */
    background: var(--dm-motion-blue);
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
