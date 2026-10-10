<script lang="ts">
  import { t as translate } from "#lib/shared/i18n/i18n.svelte.js";
  /**
   * Codex 2|0 - Type 1 - Level 2 body page 25 (manifest `codex-2-0-t1`), faithful
   * to old p25. Identical structure to p17 (every Type-1 letter A–V, `²` = 2 turns
   * on the high slot, `₂` = 2 on the low slot) but two turns instead of one.
   */
  import CodexGridPage, { type CodexCell } from "../_components/CodexGridPage.svelte";
  import { codexSlotData } from "../_data/codex-turns";

  const hi = (letter: string): CodexCell => ({ data: codexSlotData(letter, "high", 2), letter, sup: "2" });
  const lo = (letter: string): CodexCell => ({ data: codexSlotData(letter, "low", 2), letter, sub: "2" });

  const rows: CodexCell[][] = [
    [hi("A"), hi("B"), hi("C"), lo("C"), hi("D"), hi("E"), hi("F"), lo("F")],
    [hi("G"), hi("H"), hi("I"), lo("I"), hi("J"), hi("K"), hi("L"), lo("L")],
    [hi("M"), hi("N"), hi("O"), lo("O"), hi("P"), hi("Q"), hi("R"), lo("R")],
    [hi("S"), lo("S"), hi("T"), lo("T"), hi("U"), lo("U"), hi("V"), lo("V")],
  ];

  const subParts = [{ t: translate("guide_l2_print_type_1") + " - " }, { t: "Dual", c: "#22b8cf" }, { t: "-Shift", c: "#7048b6" }];
</script>

<CodexGridPage turnLabel="2 | 0" {subParts} {rows} />
