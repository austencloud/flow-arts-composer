<script lang="ts">
  import Sentences from "../../../_components/Sentences.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import GuideSection from "../../../level-1/_components/GuideSection.svelte";
  import TwoHandStrip from "../../_components/TwoHandStrip.svelte";
  import {
    TYPE5_LAM_CLOSE,
    TYPE5_LAM_OPEN,
    TYPE5_PSI,
  } from "../../_data/type-strips";
</script>

<GuideSection id="type-5-turns" title={t("guide_l2_type5_title")}>
  <div class="section-body">
    <p><Sentences text={t("guide_l2_type5_intro")} /></p>
    <p><Sentences text={t("guide_l2_type5_letters")} /></p>
  </div>
  <TwoHandStrip id="type5-psi" word={TYPE5_PSI.word} left={TYPE5_PSI.left} right={TYPE5_PSI.right} />
  <div class="section-body">
    <p><Sentences text={t("guide_l2_type5_slots")} /></p>
  </div>
  <TwoHandStrip id="type5-lam-open" word={TYPE5_LAM_OPEN.word} left={TYPE5_LAM_OPEN.left} right={TYPE5_LAM_OPEN.right} />
  <TwoHandStrip id="type5-lam-close" word={TYPE5_LAM_CLOSE.word} left={TYPE5_LAM_CLOSE.left} right={TYPE5_LAM_CLOSE.right} />
  <div class="section-body">
    <p><Sentences text={t("guide_l2_type5_practice")} /></p>
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
