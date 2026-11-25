<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
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
        text: t("fuse_rule_rewind_holds"),
        breaks: false,
      };
    }

    const pairedBeat = sequence.steps.length + 1 - mismatch;
    return {
      text: t(
        fuseState.driverSide === "left"
          ? "fuse_rule_rewind_breaks_left_leads"
          : "fuse_rule_rewind_breaks_right_leads",
        {
          beat: mismatch,
          paired: pairedBeat,
          mode: fuseTnDModeLabel(selection.mode),
        }
      ),
      breaks: true,
    };
  });
</script>

<section class="linked-rule-panel" aria-label={t("fuse_rule_linked_aria")}>
  <FuseTransformPicker inline {rewindNote} />
  {#if fuseState.ruleAdjusted}
    <p class="rule-note" role="status">{t("fuse_rule_adjusted_note")}</p>
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
