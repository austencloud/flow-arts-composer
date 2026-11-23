<script lang="ts">
  import Sentences from "../../../_components/Sentences.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import GuideSection from "../../../level-1/_components/GuideSection.svelte";
  import TwoHandStrip from "../../_components/TwoHandStrip.svelte";
  import {
    TYPE4_HIGH,
    TYPE4_LOW,
  } from "../../_data/type-strips";
</script>

<GuideSection id="type-4-turns" title={t("guide_l2_type4_title")}>
  <div class="section-body">
    <p><Sentences text={t("guide_l2_type4_intro")} /></p>
    <p><Sentences text={t("guide_l2_type4_slots")} /></p>
  </div>
  <TwoHandStrip id="type4-high" word={TYPE4_HIGH.word} left={TYPE4_HIGH.left} right={TYPE4_HIGH.right} />
  <TwoHandStrip id="type4-low" word={TYPE4_LOW.word} left={TYPE4_LOW.left} right={TYPE4_LOW.right} />
  <div class="section-body">
    <p><Sentences text={t("guide_l2_type4_code")} /></p>
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
