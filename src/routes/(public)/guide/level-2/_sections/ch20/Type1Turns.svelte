<script lang="ts">
  import Sentences from "../../../_components/Sentences.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import GuideSection from "../../../level-1/_components/GuideSection.svelte";
  import TwoHandStrip from "../../_components/TwoHandStrip.svelte";
  import {
    TYPE1_A,
    TYPE1_B,
    TYPE1_C_HIGH,
    TYPE1_C_LOW,
  } from "../../_data/type-strips";
</script>

<GuideSection id="type-1-turns" title={t("guide_l2_type1_title")}>
  <div class="section-body">
    <p><Sentences text={t("guide_l2_type1_same")} /></p>
  </div>
  <TwoHandStrip id="type1-a" word={TYPE1_A.word} left={TYPE1_A.left} right={TYPE1_A.right} />
  <TwoHandStrip id="type1-b" word={TYPE1_B.word} left={TYPE1_B.left} right={TYPE1_B.right} />
  <div class="section-body">
    <p><Sentences text={t("guide_l2_type1_hybrids")} /></p>
    <p><Sentences text={t("guide_l2_type1_slots")} /></p>
  </div>
  <TwoHandStrip id="type1-c-high" word={TYPE1_C_HIGH.word} left={TYPE1_C_HIGH.left} right={TYPE1_C_HIGH.right} />
  <TwoHandStrip id="type1-c-low" word={TYPE1_C_LOW.word} left={TYPE1_C_LOW.left} right={TYPE1_C_LOW.right} />
  <div class="section-body">
    <p><Sentences text={t("guide_l2_type1_code")} /></p>
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
