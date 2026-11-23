<script lang="ts">
  import Sentences from "../../../_components/Sentences.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import GuideSection from "../../../level-1/_components/GuideSection.svelte";
  import GlyphTurnsFigure from "../../_components/GlyphTurnsFigure.svelte";
  import PadsOrderFigure from "../../_components/PadsOrderFigure.svelte";
  import GlyphCard from "../../_components/GlyphCard.svelte";
  import GlyphLetterRow from "../../_components/GlyphLetterRow.svelte";
  import {
    GLYPH_A_TURN,
    EX_C,
    EX_S,
    EX_W,
    EX_SIGMA_DASH,
    EX_PHI,
  } from "../../_data/glyph-examples";
</script>

<GuideSection id="glyphs-pads" title={t("guide_l2_glyphs_title")}>
  <div class="section-body">
    <p><Sentences text={t("guide_l2_glyphs_intro")} /></p>

    <p><Sentences text={t("guide_l2_glyphs_slots")} /></p>
  </div>

  <GlyphTurnsFigure data={GLYPH_A_TURN} label={t("guide_l2_turn_breakdown")} />

  <div class="section-body">
    <p>
      <Sentences text={t("guide_l2_glyphs_update")}
        >{#snippet lead()}<em>{t("guide_l2_glyphs_update_label")}</em
          >{" "}{/snippet}</Sentences
      >
    </p>

    <p><Sentences text={t("guide_l2_glyphs_hybrid")} /></p>

    <ul>
      <li><strong>{t("guide_l2_high")}</strong> Pro, Anti, Dash</li>
      <li><strong>{t("guide_l2_low")}</strong> Static</li>
    </ul>

    <p>
      <Sentences text={t("guide_l2_glyphs_order_before")}
        >{#snippet tail()}{" "}<strong>PADS</strong>{t(
            "guide_l2_glyphs_order_after"
          )}{/snippet}</Sentences
      >
    </p>
  </div>

  <PadsOrderFigure />

  <div class="section-body">
    <p><Sentences text={t("guide_l2_glyphs_st")} /></p>
  </div>

  <GlyphCard
    data={EX_S}
    both={t("guide_l2_leading_following")}
    letters={["S", "T"]}
  />

  <div class="section-body">
    <p><Sentences text={t("guide_l2_glyphs_five_hybrids")} /></p>
  </div>

  <GlyphCard
    data={EX_C}
    hi={t("guide_eightstep_motion_pro")}
    lo={t("guide_eightstep_motion_anti")}
    letters={["C", "F", "I", "L", "O", "R", "U", "V"]}
  >
    <strong class="type-dual-shift">{t("guide_l2_type1_dual_shift")}</strong> (Pro/Anti): C, F, I, L, O, R, U, V
  </GlyphCard>

  <GlyphCard
    data={EX_S}
    both={t("guide_l2_leading_following")}
    letters={["S", "T"]}
  >
    <strong class="type-dual-shift">{t("guide_l2_type2_shift")}</strong> ({t("guide_l2_leading_following")}): S, T
  </GlyphCard>

  <GlyphCard
    data={EX_W}
    hi={t("guide_codex_shift")}
    lo={t("guide_codex_static")}
    letters={["W", "X", "Y", "Z", "Σ", "Δ", "Θ", "Ω"]}
  >
    <strong class="type-shift">{t("guide_l2_type3_cross_shift")}</strong> (Shift/Static): W, X, Y, Z, Σ, Δ, Θ, Ω
  </GlyphCard>

  <GlyphCard
    data={EX_SIGMA_DASH}
    hi={t("guide_codex_shift")}
    lo={t("guide_codex_dash")}
    letters={["W-", "X-", "Y-", "Z-", "Σ-", "Δ-", "Θ-", "Ω-"]}
  >
    <strong class="type-cross-shift">{t("guide_l2_type4_dash")}</strong> (Shift/Dash): W-, X-, Y-, Z-, Σ-, Δ-, Θ-, Ω-
  </GlyphCard>

  <GlyphCard
    data={EX_PHI}
    hi={t("guide_codex_dash")}
    lo={t("guide_codex_static")}
    letters={["Φ", "Ψ", "Λ"]}
  >
    <strong class="type-dash">{t("guide_l2_type5")}</strong> (Dash/Static): Φ, Ψ, Λ
  </GlyphCard>

  <div class="section-body">
    <p><Sentences text={t("guide_l2_glyphs_remaining")} /></p>

    <p>
      {t("guide_l2_glyphs_letters_include")} A, B, D, E, G, H, J, K, M, N, P, Q, S,
      T, Φ-, Ψ-, α, β, Γ
    </p>
  </div>

  <div class="letters-figure">
    <GlyphLetterRow
      letters={["A", "B", "D", "E", "G", "H", "J", "K", "M", "N", "P", "Q", "S", "T", "Φ-", "Ψ-", "α", "β", "γ"]}
      height={26}
    />
  </div>
</GuideSection>

<style>
  /* GuideSection owns text width; these rules set paragraph rhythm. */
  .section-body :global(p) {
    margin: 0 auto 1.1rem;
    text-align: center;
    text-wrap: balance;
  }
  .section-body :global(ul) {
    margin: 0 auto 1.1rem;
  }
  .section-body :global(p:last-child),
  .section-body :global(ul:last-child) {
    margin-bottom: 0;
  }
  .letters-figure {
    grid-column: full-start / full-end;
    justify-self: center;
    margin: 1.2rem 0;
    max-width: 34rem;
    padding: 0 1rem;
  }
</style>
