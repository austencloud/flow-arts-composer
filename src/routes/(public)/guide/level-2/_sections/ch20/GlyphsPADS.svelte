<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import GuideSection from "../../../level-1/_components/GuideSection.svelte";
</script>

<GuideSection id="glyphs-pads" title={t("guide_l2_glyphs_title")}>
  <div class="section-body">
    <p>
      {t("guide_l2_glyphs_intro")}
    </p>

    <p>
      {t("guide_l2_glyphs_slots")}
    </p>

    <p>
      <em>{t("guide_l2_glyphs_update_label")}</em> {t("guide_l2_glyphs_update")}
    </p>

    <p>
      {t("guide_l2_glyphs_hybrid")}
    </p>

    <ul>
      <li><strong>{t("guide_l2_high")}</strong> Pro, Anti, Dash</li>
      <li><strong>{t("guide_l2_low")}</strong> Static</li>
    </ul>

    <p>
      {t("guide_l2_glyphs_order_before")} <strong>PADS</strong>{t("guide_l2_glyphs_order_after")}
    </p>

    <p>
      {t("guide_l2_glyphs_st")}
    </p>

    <p>{t("guide_l2_glyphs_five_hybrids")}</p>

    <ul>
      <li><strong class="type-dual-shift">{t("guide_l2_type1_dual_shift")}</strong> (Pro/Anti): C, F, I, L, O, R, U, V</li>
      <li><strong class="type-dual-shift">{t("guide_l2_type2_shift")}</strong> ({t("guide_l2_leading_following")}): S, T</li>
      <li><strong class="type-shift">{t("guide_l2_type3_cross_shift")}</strong> (Shift/Static): W, X, Y, Z, Σ, Δ, Θ, Ω</li>
      <li><strong class="type-cross-shift">{t("guide_l2_type4_dash")}</strong> (Shift/Dash): W-, X-, Y-, Z-, Σ-, Δ-, Θ-, Ω-</li>
      <li><strong class="type-dash">{t("guide_l2_type5")}</strong> (Dash/Static): Φ, Ψ, Λ</li>
    </ul>

    <p>
      {t("guide_l2_glyphs_remaining")}
    </p>

    <p>
      {t("guide_l2_glyphs_letters_include")} A, B, D, E, G, H, J, K, M, N, P, Q, S, T, Φ-, Ψ-, α, β, Γ
    </p>
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
</style>
