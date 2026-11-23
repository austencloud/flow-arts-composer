<script lang="ts">
  /**
   * One spin's flower with its name under it, painted by the Shape Engine's
   * own guide painter the way /guide/ratios paints it. The flower follows the
   * screen's scale (--fit); the name keeps its type role.
   */
  import PathFlower from "../../motion-paths/_components/PathFlower.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { CapSpin } from "#lib/shared/guide-topics/caps-topic.js";

  let {
    spin,
    size = 110,
    caption = true,
  }: { spin: CapSpin; size?: number; caption?: boolean } = $props();

  const SPIN = {
    extension: { style: "pro", turns: 0, word: "guide_caps_spin_extension" },
    antispin: { style: "anti", turns: 1, word: "guide_caps_spin_antispin" },
    prospin: { style: "pro", turns: 1, word: "guide_caps_spin_prospin" },
  } as const;
  const spec = $derived(SPIN[spin]);
</script>

<figure class="cap-flower">
  <PathFlower style={spec.style} turns={spec.turns} label={t(spec.word)} {size} />
  {#if caption}<figcaption>{t(spec.word)}</figcaption>{/if}
</figure>

<style>
  .cap-flower {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    margin: 0;
    width: 100%;
    min-width: 0;
  }
  figcaption {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--theme-text);
    text-align: center;
  }
</style>
