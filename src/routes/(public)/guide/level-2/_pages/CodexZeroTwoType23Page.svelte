<script lang="ts">
  import { t as translate } from "#lib/shared/i18n/i18n.svelte.js";
  /**
   * Codex 0/2 - Type 2/3 - Level 2 body page 26 (manifest `codex-0-2-t23`),
   * faithful to old p26. Same split-column layout as p18 but with 2 turns on the
   * low slot (`₂`), Same (rows 1–2) and Opp (rows 3–4).
   */
  import CodexGridPage, { type CodexCell } from "../_components/CodexGridPage.svelte";
  import { codexRelData } from "../_data/codex-turns";

  const cell = (letter: string, rel: "same" | "opp"): CodexCell => ({
    data: codexRelData(letter, 0, 2, rel),
    letter,
    sub: "2",
    dot: rel,
  });

  const T2a = ["W", "X", "Y", "Z"];
  const T2b = ["Σ", "Δ", "Θ", "Ω"];
  const T3a = ["W-", "X-", "Y-", "Z-"];
  const T3b = ["Σ-", "Δ-", "Θ-", "Ω-"];

  const rows: CodexCell[][] = [
    [...T2a.map((l) => cell(l, "same")), ...T3a.map((l) => cell(l, "same"))],
    [...T2b.map((l) => cell(l, "same")), ...T3b.map((l) => cell(l, "same"))],
    [...T2a.map((l) => cell(l, "opp")), ...T3a.map((l) => cell(l, "opp"))],
    [...T2b.map((l) => cell(l, "opp")), ...T3b.map((l) => cell(l, "opp"))],
  ];

  const leftHeader = [{ t: translate("guide_l2_print_type_2") + " - " }, { t: "Shift", c: "#7048b6" }];
  const rightHeader = [{ t: translate("guide_l2_print_type_3") + " - " }, { t: "Cross", c: "#2f9e44" }, { t: "-Shift", c: "#7048b6" }];
</script>

<CodexGridPage turnLabel="0 / 2" {leftHeader} {rightHeader} {rows} />
