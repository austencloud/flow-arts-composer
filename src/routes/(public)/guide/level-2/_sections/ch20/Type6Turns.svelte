<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import GuideSection from "../../../level-1/_components/GuideSection.svelte";
</script>

<GuideSection id="type-6-turns" title={t("guide_l2_type6_title")}>
  <div class="section-body">
    <p>
      {t("guide_l2_type6_intro")}
    </p>

    <p>
      {t("guide_l2_type6_letters")}
    </p>

    <!-- TODO: add diagram - Alpha-One -->

    <p>
      {t("guide_l2_type6_arrow")}
    </p>

    <!-- TODO: add diagram - Gamma-One opening (◌) / Gamma-One closing (◍) -->

    <p>
      {t("guide_l2_type6_next")}
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
