<script lang="ts">
  /**
   * The Level 2 guide as ONE ordered page sequence - the level-2 counterpart of
   * level-1's GuideDocument. Both the print route (stacked pages) and the
   * compare/book route render this, so the two can never drift.
   *
   * Front matter is just the cover (the original Level 2 has no drink-water /
   * support / read-me / TOC pages - it goes cover → divider → content). Body
   * pages come from LEVEL2_BODY_PAGES; unbuilt ids render the shared
   * placeholder. Back matter is parked per the rebuild tracker.
   */
  import type { Snippet, Component } from "svelte";
  import { t as translate } from "#lib/shared/i18n/i18n.svelte.js";
  import { tDynamic } from "#lib/shared/i18n/i18n.svelte.js";
  import GuideCover from "../../level-1/_components/GuideCover.svelte";
  import PagePlaceholder from "../../level-1/_components/PagePlaceholder.svelte";
  import type { GuidePageMeta } from "../../level-1/_data/guide-manifest";
  import { LEVEL2_BODY_PAGES } from "../_data/guide-manifest";

  let {
    page,
    built = {},
  }: {
    page: Snippet<[GuidePageMeta]>;
    /** Built per-page components keyed by manifest id; rest render a placeholder. */
    built?: Record<string, Component>;
  } = $props();
</script>

<!-- Same locked cover design as Level 1, with the Level 2 badge (facelift -
     the original v0.5 pictograph-diamond cover is superseded, as Level 1's was). -->
{#snippet coverContent()}
  <div class="cover-fill"><GuideCover theme="navy" level="2" /></div>
{/snippet}

<!-- Front matter (unnumbered cover), then the numbered body pages. -->
{@render page({ kind: "cover", fullBleed: true, label: translate("guide_l2_print_cover_label"), content: coverContent })}
{#each LEVEL2_BODY_PAGES as entry, i}
  {#snippet bodyContent()}
    {@const Built = built[entry.id]}
    {#if Built}<Built />{:else}<PagePlaceholder />{/if}
  {/snippet}
  {@render page({
    kind: "body",
    title: entry.selfTitled ? undefined : tDynamic(`guide_l2_print_manifest_${entry.id.replaceAll("-", "_")}`),
    fullBleed: !!built[entry.id],
    pageNumber: i + 1,
    label: `${translate("guide_l2_print_body_page")} ${i + 1}: ${tDynamic(`guide_l2_print_manifest_${entry.id.replaceAll("-", "_")}`)}`,
    content: bodyContent,
  })}
{/each}

<style>
  .cover-fill {
    width: 100%;
    aspect-ratio: 8.5 / 11;
  }
</style>
