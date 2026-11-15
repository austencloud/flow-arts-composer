<!--
BrowseScopeBar.svelte

The top of every Browse sequence grid: one search field that is always open,
and the Source menu that says which pile the search runs over (Everyone,
Saved, Drafts, then each collection you own, share or follow). Changing
scope swaps the pile under the same query, so the words you typed (and the
filters you set) come with you.

The sideways chip strip that used to list the scopes is gone (Wren's
placement for the ask screen, 2026-11-13): on a phone it ran off the right
edge and took a 61px band. Every pile now shows the one Source menu. On a
phone or tablet the search and the Source menu both sit in the Browse header
bar (BrowseModule hands the header the menu), so this bar draws nothing
there and only registers the search.

Composes ExpandableSearchBar (pinned) and BrowseSourceMenu. The bar does not
decide what a scope shows; browse-scope.ts maps scopes to locations and each
grid binds the shared query itself.
-->
<script lang="ts">
  import type { BrowseScope } from "#lib/shared/browse/navigation/browse-scope.js";
  import ExpandableSearchBar from "#lib/shared/browse/components/ExpandableSearchBar.svelte";
  import BrowseSourceMenu from "./BrowseSourceMenu.svelte";
  import { createBrowseScopeChips } from "../state/browse-scope-chips.svelte";

  interface Props {
    /** Null on the collections list: no pile is open, so the All collections
     * chip is current and a search opens Saved (or Everyone when signed out). */
    scope: BrowseScope | null;
    /** False while the bar is leaving, so its search leaves the header bar on
     * the same tap. */
    active?: boolean;
  }

  let { scope, active = true }: Props = $props();

  // The list, the placeholder, choose and search: one owner, shared with the
  // desktop Source menu.
  const scopes = createBrowseScopeChips(() => scope);
  const query = $derived(scopes.query);
  const header = $derived(scopes.header);
  const placeholder = $derived(scopes.placeholder);
  const search = scopes.search;

  // On a phone or tablet the header bar carries the search and the Source
  // menu, and this bar draws nothing.
  const searchInHeader = $derived(header?.compactChrome ?? false);
  $effect(() => {
    if (!searchInHeader || !header || !query) return;
    return header.registerSearch({
      placeholder: () => placeholder,
      value: () => query.search,
      onSearch: search,
      active: () => active,
    });
  });
</script>

{#if !searchInHeader}
  <div class="scope-frame">
    <div class="scope-bar">
      {#if query}
        <div class="scope-search">
          <ExpandableSearchBar
            pinned
            name="browse-search"
            value={query.search}
            {placeholder}
            onSearch={search}
          />
        </div>
      {/if}
      <BrowseSourceMenu {scope} />
    </div>
  </div>
{/if}

<style>
  .scope-frame {
    container-type: inline-size;
    flex: 0 0 auto;
  }

  /* The search and the Source menu share one row. */
  .scope-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 0 0 auto;
    padding: 8px clamp(12px, 2cqi, 28px);
    border-bottom: 1px solid
      color-mix(in srgb, var(--theme-text, #fff) 10%, transparent);
  }

  .scope-search {
    flex: 0 1 420px;
    min-width: 0;
  }

  /* A phone on its side has width to spare and no height: a narrower search,
     so the grid keeps its rows. */
  @media (max-height: 520px) {
    @container (min-width: 560px) {
      .scope-search {
        flex-basis: 300px;
      }
    }
  }

  /* The same phone in Browse's side column (BrowseModule): the Source menu
     sits under the search, both the column's width. */
  @media (max-height: 480px) and (min-width: 700px) {
    @container (max-width: 400px) {
      .scope-bar {
        flex-direction: column;
        align-items: stretch;
        gap: 8px;
        padding: 8px 10px;
        border-bottom: none;
      }

      .scope-search {
        flex: 0 0 auto;
      }

      .scope-bar :global(.source-anchor),
      .scope-bar :global(.source-anchor .filter-chip) {
        width: 100%;
      }
    }
  }
</style>
