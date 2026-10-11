<script lang="ts">
  import { t as translate } from "#lib/shared/i18n/i18n.svelte.js";
  /**
   * Codex 2|2 - Type 1 - Level 2 body page 32 (manifest `codex-2-2-t1`), faithful
   * to old p32. Same 22-letter 6-column structure as p20, but two turns on each hand
   * (`²₂`). Symmetric turns, so no high/low split and no Same/Opp dot.
   */
  import CodexGridPage, { type CodexCell } from "../_components/CodexGridPage.svelte";
  import { codexTurnData } from "../_data/codex-turns";

  const cell = (letter: string): CodexCell => ({ data: codexTurnData(letter, 2, 2), letter, sup: "2", sub: "2" });

  const rows: CodexCell[][] = [
    ["A", "B", "C", "D", "E", "F"].map(cell),
    ["G", "H", "I", "J", "K", "L"].map(cell),
    ["M", "N", "O", "P", "Q", "R"].map(cell),
    ["S", "T", "U", "V"].map(cell),
  ];

  const subParts = [{ t: translate("guide_l2_print_type_1") + " - " }, { t: "Dual", c: "#22b8cf" }, { t: "-Shift", c: "#7048b6" }];
</script>

<CodexGridPage turnLabel="2 | 2" {subParts} {rows} cols={6} />
