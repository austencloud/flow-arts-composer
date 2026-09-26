<script lang="ts">
  import { getFuseContext } from "../context/fuse-context";
  import { checkFuseTnD } from "../domain/fuse-tnd-check";
  import {
    classifyFuseRule,
    DEFAULT_TND_SELECTION,
    fuseTnDModeLabel,
  } from "../domain/fuse-tnd-rule";
  import FuseTransformPicker from "./FuseTransformPicker.svelte";

  const { state: fuseState } = getFuseContext();
  const selection = $derived(
    classifyFuseRule(fuseState.rule) ?? DEFAULT_TND_SELECTION
  );
  const rewindNote = $derived.by(() => {
    if (!selection.rewind || !fuseState.previewSequence) return null;
    const sequence = fuseState.previewSequence;
    const mismatch = checkFuseTnD(sequence, selection.mode).firstMismatchBeat;
    if (mismatch === null) {
      return {
        text: "Timing and direction still hold on every beat.",
        breaks: false,
      };
    }

    const follower = fuseState.driverSide === "left" ? "Right" : "Left";
    const leader = fuseState.driverSide === "left" ? "Left" : "Right";
    const pairedBeat = sequence.steps.length + 1 - mismatch;
    return {
      text: `Rewind pairs ${follower}'s beat ${mismatch} with ${leader}'s beat ${pairedBeat}. They don't line up, so ${fuseTnDModeLabel(selection.mode)} breaks at beat ${mismatch}.`,
      breaks: true,
    };
  });
</script>

<section class="linked-rule-panel" aria-label="Linked rule">
  <FuseTransformPicker inline {rewindNote} />
  {#if fuseState.ruleAdjusted}
    <p class="rule-note" role="status">Rule adjusted to the nearest timing.</p>
  {/if}
</section>

<style>
  .linked-rule-panel {
    container-type: inline-size;
    min-width: 0;
    padding: 8px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--settings-radius-md, 14px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.045));
  }

  .rule-note {
    margin: 6px 0 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-compact, 12px);
  }

  @media (max-width: 480px) {
    .linked-rule-panel {
      padding: 6px;
    }
  }
</style>
