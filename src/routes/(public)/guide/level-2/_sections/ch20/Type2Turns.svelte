<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import GuideSection from "../../../level-1/_components/GuideSection.svelte";
</script>

<GuideSection id="type-2-turns" title={t("guide_l2_type2_title")}>
  <div class="section-body">
    <p>
      {t("guide_l2_type2_intro")}
    </p>

    <p>
      {t("guide_l2_type2_slots")}
    </p>

    <!-- TODO: add diagram - W-High-One (static hand is still, should be simple to execute) -->

    <p>
      {t("guide_l2_type2_relationship")}
    </p>

    <!-- TODO: add diagram - W-Same Low-One (same-dot variant) -->
    <!-- TODO: add diagram - W-Opp Low-One (opp-dot variant) -->

    <p>
      {t("guide_l2_type2_code")}
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
