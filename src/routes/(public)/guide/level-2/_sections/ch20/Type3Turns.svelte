<script lang="ts">
  import Sentences from "../../../_components/Sentences.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import GuideSection from "../../../level-1/_components/GuideSection.svelte";
</script>

<GuideSection id="type-3-turns" title={t("guide_l2_type3_title")}>
  <div class="section-body">
    <p><Sentences text={t("guide_l2_type3_intro")} /></p>

    <p><Sentences text={t("guide_l2_type3_slots")} /></p>

    <!-- TODO: add diagram - Z-Dash High-One (affects the shift only) -->

    <p><Sentences text={t("guide_l2_type3_halfway")} /></p>

    <p><Sentences text={t("guide_l2_type3_dash_turn")} /></p>

    <!-- TODO: add diagram - Z-Dash Same Low-One -->
    <!-- TODO: add diagram - Z-Dash Opp Low-One -->

    <p><Sentences text={t("guide_l2_type3_center")} /></p>

    <p><Sentences text={t("guide_l2_type3_code")} /></p>
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
