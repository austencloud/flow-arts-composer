<script lang="ts">
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { TND_BY_FAMILY } from "$lib/features/choreo-card/domain/tnd-element";
  import type { TimingDirectionArticle } from "../_data/timing-direction-articles";

  let { article }: { article: TimingDirectionArticle } = $props();
  const element = $derived(TND_BY_FAMILY[article.familyId]);
</script>

<PanelButton
  href={`/timing-and-direction/${article.slug}`}
  accentColor={element?.accentColor}
>
  {#if element}
    <img src={element.iconPath} alt="" width="32" height="32" />
  {/if}
  <span>{article.compactName}</span>
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
