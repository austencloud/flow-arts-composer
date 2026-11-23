<script lang="ts">
  import Sentences from "../../../_components/Sentences.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import GuideSection from "../../../level-1/_components/GuideSection.svelte";
  import TwoHandStrip from "../../_components/TwoHandStrip.svelte";
  import {
    TYPE2_HIGH,
    TYPE2_OPP,
    TYPE2_SAME,
  } from "../../_data/type-strips";
</script>

<GuideSection id="type-2-turns" title={t("guide_l2_type2_title")}>
  <div class="section-body">
    <p><Sentences text={t("guide_l2_type2_intro")} /></p>
    <p><Sentences text={t("guide_l2_type2_slots")} /></p>
  </div>
  <TwoHandStrip id="type2-high" word={TYPE2_HIGH.word} left={TYPE2_HIGH.left} right={TYPE2_HIGH.right} />
  <div class="section-body">
    <p><Sentences text={t("guide_l2_type2_relationship")} /></p>
  </div>
  <TwoHandStrip id="type2-same" word={TYPE2_SAME.word} left={TYPE2_SAME.left} right={TYPE2_SAME.right} />
  <TwoHandStrip id="type2-opp" word={TYPE2_OPP.word} left={TYPE2_OPP.left} right={TYPE2_OPP.right} />
  <div class="section-body">
    <p><Sentences text={t("guide_l2_type2_code")} /></p>
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
