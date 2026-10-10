<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import GuideSection from "../../../level-1/_components/GuideSection.svelte";
</script>

<GuideSection id="type-5-turns" title={t("guide_l2_type5_title")}>
  <div class="section-body">
    <p>
      {t("guide_l2_type5_intro")}
    </p>

    <p>
      {t("guide_l2_type5_letters")}
    </p>

    <!-- TODO: add diagram - Psi-Dash-One -->

    <p>
      {t("guide_l2_type5_slots")}
    </p>

    <!-- TODO: add diagram - Lam-Dash-One opening (◌) / Lam-Dash-One closing (◍) -->

    <p>
      {t("guide_l2_type5_practice")}
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
