<script lang="ts">
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { TND_BY_FAMILY } from "#lib/features/choreo-card/domain/tnd-element.js";
  import type { TimingDirectionArticle } from "../_data/timing-direction-articles";

  // One of the six mode toggles above the sequence player. It carries both
  // names; the row shows the short code where "Together-Same" would not fit.
  let {
    article,
    pressed,
    onselect,
  }: {
    article: TimingDirectionArticle;
    pressed: boolean;
    onselect: () => void;
  } = $props();
  const element = $derived(TND_BY_FAMILY[article.familyId]);
</script>

<PanelButton
  onclick={onselect}
  ariaPressed={pressed}
  ariaLabel={article.name}
  title={article.name}
  accentColor={element?.accentColor}
  fullWidth
>
  {#if element}
    <img src={element.iconPath} alt="" width="24" height="24" />
  {/if}
  <span class="mode-name">{article.compactName}</span>
  <span class="mode-code">{article.code}</span>
</PanelButton>

<style>
  img {
    object-fit: contain;
    flex-shrink: 0;
  }
  span {
    font-size: 0.875rem;
  }
</style>
