<script lang="ts">
  import { t as translate } from "#lib/shared/i18n/i18n.svelte.js";
  /**
   * Codex 2|1 - Type 1 - Level 2 body page 28 (manifest `codex-2-1-t1`), faithful
   * to old p28. Same 32-cell 8×4 structure as p17, but every cell turns BOTH hands
   * asymmetrically: the `²₁` cells are (2,1) [2 high / 1 low], the `¹₂` cells are
   * (1,2). Hybrids (C,F,I,L,O,R) and S/T/U/V carry both; pure letters only `²₁`.
   */
  import CodexGridPage, { type CodexCell } from "../_components/CodexGridPage.svelte";
  import { codexTurnData } from "../_data/codex-turns";

  const hi = (letter: string): CodexCell => ({ data: codexTurnData(letter, 2, 1), letter, sup: "2", sub: "1" });
  const lo = (letter: string): CodexCell => ({ data: codexTurnData(letter, 1, 2), letter, sup: "1", sub: "2" });

  const rows: CodexCell[][] = [
    [hi("A"), hi("B"), hi("C"), lo("C"), hi("D"), hi("E"), hi("F"), lo("F")],
    [hi("G"), hi("H"), hi("I"), lo("I"), hi("J"), hi("K"), hi("L"), lo("L")],
    [hi("M"), hi("N"), hi("O"), lo("O"), hi("P"), hi("Q"), hi("R"), lo("R")],
    [hi("S"), lo("S"), hi("T"), lo("T"), hi("U"), lo("U"), hi("V"), lo("V")],
  ];

  const subParts = [{ t: translate("guide_l2_print_type_1") + " - " }, { t: "Dual", c: "#22b8cf" }, { t: "-Shift", c: "#7048b6" }];
</script>

<CodexGridPage turnLabel="2 | 1" {subParts} {rows} />
