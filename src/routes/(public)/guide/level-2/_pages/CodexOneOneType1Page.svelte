<script lang="ts">
  import { t as translate } from "#lib/shared/i18n/i18n.svelte.js";
  /**
   * Codex 1|1 - Type 1 - Level 2 body page 20 (manifest `codex-1-1-t1`), faithful
   * to old p20. Every Type-1 letter (A–V) with one turn on EACH hand (`¹₁`, high
   * slot red over low slot blue). No Same/Opp dot: for dual-shift letters the
   * rotational relationship is intrinsic to the letter, not a free modifier. 6-column
   * portrait grid (the original is already portrait). Both hands are shifts, so the
   * direction args are ignored - a plain `codexTurnData(letter, 1, 1)` is exact.
   */
  import CodexGridPage, { type CodexCell } from "../_components/CodexGridPage.svelte";
  import { codexTurnData } from "../_data/codex-turns";

  const cell = (letter: string): CodexCell => ({ data: codexTurnData(letter, 1, 1), letter, slot: "both" });

  const rows: CodexCell[][] = [
    ["A", "B", "C", "D", "E", "F"].map(cell),
    ["G", "H", "I", "J", "K", "L"].map(cell),
    ["M", "N", "O", "P", "Q", "R"].map(cell),
    ["S", "T", "U", "V"].map(cell),
  ];

  const subParts = [{ t: translate("guide_l2_print_type_1") + " - " }, { t: "Dual", c: "#22b8cf" }, { t: "-Shift", c: "#7048b6" }];
</script>

<CodexGridPage turnLabel="1 | 1" {subParts} {rows} cols={6} />
