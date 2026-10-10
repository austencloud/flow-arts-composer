<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import GuideSection from "../../../level-1/_components/GuideSection.svelte";
</script>

<GuideSection id="type-1-turns" title={t("guide_l2_type1_title")}>
  <div class="section-body">
    <p>
      {t("guide_l2_type1_same")}
    </p>

    <!-- TODO: add diagram - A¹ breakdown: "A-One" start thumbs: in → halfway → end mixed -->
    <!-- TODO: add diagram - B¹ breakdown: "B-One" start thumbs: in → halfway → end mixed -->

    <p>
      {t("guide_l2_type1_hybrids")}
    </p>

    <p>
      {t("guide_l2_type1_slots")}
    </p>

    <!-- TODO: add diagram - C-High-One (prospin gets the turn) -->
    <!-- TODO: add diagram - C-Low-One (antispin gets the turn) -->

    <p>
      {t("guide_l2_type1_code")}
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
  .section-body :global(p:last-child) {
    margin-bottom: 0;
  }
</style>
