<script lang="ts">
  import Sentences from "../../../_components/Sentences.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import GuideSection from "../../../level-1/_components/GuideSection.svelte";
  import TwoHandStrip from "../../_components/TwoHandStrip.svelte";
  import {
    TYPE6_ALPHA,
    TYPE6_GAMMA_CLOSE,
    TYPE6_GAMMA_OPEN,
  } from "../../_data/type-strips";
</script>

<GuideSection id="type-6-turns" title={t("guide_l2_type6_title")}>
  <div class="section-body">
    <p><Sentences text={t("guide_l2_type6_intro")} /></p>
    <p><Sentences text={t("guide_l2_type6_letters")} /></p>
  </div>
  <TwoHandStrip id="type6-alpha" word={TYPE6_ALPHA.word} left={TYPE6_ALPHA.left} right={TYPE6_ALPHA.right} />
  <div class="section-body">
    <p><Sentences text={t("guide_l2_type6_arrow")} /></p>
  </div>
  <TwoHandStrip id="type6-gamma-open" word={TYPE6_GAMMA_OPEN.word} left={TYPE6_GAMMA_OPEN.left} right={TYPE6_GAMMA_OPEN.right} />
  <TwoHandStrip id="type6-gamma-close" word={TYPE6_GAMMA_CLOSE.word} left={TYPE6_GAMMA_CLOSE.left} right={TYPE6_GAMMA_CLOSE.right} />
  <div class="section-body">
    <p><Sentences text={t("guide_l2_type6_next")} /></p>
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
