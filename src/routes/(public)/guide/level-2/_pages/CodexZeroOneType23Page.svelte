<script lang="ts">
  import { t as translate } from "#lib/shared/i18n/i18n.svelte.js";
  /**
   * Codex 0/1 - Type 2/3 - Level 2 body page 18 (manifest `codex-0-1-t23`),
   * faithful to old p18. Every Type-2 (shift+static) and Type-3 (shift+dash) letter
   * with the turn on the LOW slot (`₁`), shown in both Same (dot above, rows 1–2)
   * and Opp (dot below, rows 3–4) rotational relationships. Two half-page columns
   * (Type 2 left, Type 3 right) split by a vertical divider. Cell data + turn arrows
   * from the shared codex path (codex-turns.ts); Same/Opp steers the turning hand's
   * spin direction relative to the shift.
   */
  import CodexGridPage, { type CodexCell } from "../_components/CodexGridPage.svelte";
  import { codexRelData } from "../_data/codex-turns";

  const cell = (letter: string, rel: "same" | "opp"): CodexCell => ({
    data: codexRelData(letter, 0, 1, rel),
    letter,
    slot: "low",
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

<CodexGridPage turnLabel="0 / 1" {leftHeader} {rightHeader} {rows} />
