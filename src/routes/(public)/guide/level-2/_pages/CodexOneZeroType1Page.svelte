<script lang="ts">
  import { t as translate } from "$lib/shared/i18n/i18n.svelte.js";
  /**
   * Codex 1|0 - Type 1 - Level 2 body page 17 (manifest `codex-1-0-t1`), faithful
   * to old p17. Every Type-1 letter (A–V) with a single turn on one hand: `¹` = turn
   * on the high slot, `₁` = turn on the low slot. Pure pro/anti letters have only a
   * `¹`; hybrids (C,F,I,L,O,R) and the quarter-same group (S,T,U,V) carry both.
   * Portrait-reflowed 8×4 grid (see CodexGridPage). Cell data + turn arrows come
   * from the shared codex path (see codex-turns.ts).
   */
  import CodexGridPage, { type CodexCell } from "../_components/CodexGridPage.svelte";
  import { codexSlotData } from "../_data/codex-turns";

  const hi = (letter: string): CodexCell => ({ data: codexSlotData(letter, "high"), letter, slot: "high" });
  const lo = (letter: string): CodexCell => ({ data: codexSlotData(letter, "low"), letter, slot: "low" });

  const rows: CodexCell[][] = [
    [hi("A"), hi("B"), hi("C"), lo("C"), hi("D"), hi("E"), hi("F"), lo("F")],
    [hi("G"), hi("H"), hi("I"), lo("I"), hi("J"), hi("K"), hi("L"), lo("L")],
    [hi("M"), hi("N"), hi("O"), lo("O"), hi("P"), hi("Q"), hi("R"), lo("R")],
    [hi("S"), lo("S"), hi("T"), lo("T"), hi("U"), lo("U"), hi("V"), lo("V")],
  ];

  const names = ["A-One", "B-One", "C-High-One", "C-Low-One"];
  const subParts = [{ t: translate("guide_l2_print_type_1") + " - " }, { t: "Dual", c: "#22b8cf" }, { t: "-Shift", c: "#7048b6" }];
</script>

<CodexGridPage turnLabel="1 | 0" {subParts} {rows} {names} />
