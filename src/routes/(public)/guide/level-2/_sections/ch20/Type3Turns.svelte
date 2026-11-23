<script lang="ts">
  import Sentences from "../../../_components/Sentences.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import GuideSection from "../../../level-1/_components/GuideSection.svelte";
  import TwoHandStrip from "../../_components/TwoHandStrip.svelte";
  import {
    TYPE3_HIGH,
    TYPE3_OPP,
    TYPE3_SAME,
  } from "../../_data/type-strips";
</script>

<GuideSection id="type-3-turns" title={t("guide_l2_type3_title")}>
  <div class="section-body">
    <p><Sentences text={t("guide_l2_type3_intro")} /></p>
    <p><Sentences text={t("guide_l2_type3_slots")} /></p>
  </div>
  <TwoHandStrip id="type3-high" word={TYPE3_HIGH.word} left={TYPE3_HIGH.left} right={TYPE3_HIGH.right} />
  <div class="section-body">
    <p><Sentences text={t("guide_l2_type3_halfway")} /></p>
    <p><Sentences text={t("guide_l2_type3_dash_turn")} /></p>
  </div>
  <TwoHandStrip id="type3-same" word={TYPE3_SAME.word} left={TYPE3_SAME.left} right={TYPE3_SAME.right} />
  <TwoHandStrip id="type3-opp" word={TYPE3_OPP.word} left={TYPE3_OPP.left} right={TYPE3_OPP.right} />
  <div class="section-body">
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
