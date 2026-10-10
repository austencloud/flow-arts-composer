<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import GuideSection from "../../../level-1/_components/GuideSection.svelte";
</script>

<GuideSection id="type-4-turns" title={t("guide_l2_type4_title")}>
  <div class="section-body">
    <p>
      {t("guide_l2_type4_intro")}
    </p>

    <p>
      {t("guide_l2_type4_slots")}
    </p>

    <!-- TODO: add diagram - Phi-High-One (only one prop rotating, no rotational relationship) -->

    <!-- TODO: add diagram - Phi-Low-One (pause at halfway, hand-to-end relationship with left hand and right pinky end) -->

    <p>
      {t("guide_l2_type4_code")}
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
