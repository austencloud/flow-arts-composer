<!--
BrowseScopeBar.svelte

The top of every Browse sequence grid: one search field that is always open,
and a row of scope chips that says which pile the search runs over —
Everyone, Saved, Drafts, then each collection you own, share or follow.
Changing scope swaps the pile under the same query, so the words you typed
(and the filters you set) come with you.

Composes ExpandableSearchBar (pinned) and FilterChipBase (current) — the
search and chip owners Browse already uses. The bar does not decide what a
scope shows; browse-scope.ts maps scopes to locations and each grid binds the
shared query itself.

With `sourceMenu` (desktop Sequences' front door) the chip strip gives way to
the Source menu the desktop grid's row uses, so the scopes wrap in a popover
instead of running off the edge.
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import {
    scopeKey,
    type BrowseScope,
  } from "#lib/shared/browse/navigation/browse-scope.js";
  import ExpandableSearchBar from "#lib/shared/browse/components/ExpandableSearchBar.svelte";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import BrowseSourceMenu from "./BrowseSourceMenu.svelte";
  import {
    ALL_COLLECTIONS_KEY,
    createBrowseScopeChips,
  } from "../state/browse-scope-chips.svelte";

  interface Props {
    /** Null on the collections list: no pile is open, so the All collections
     * chip is current and a search opens Saved (or Everyone when signed out). */
    scope: BrowseScope | null;
    /** Show the scopes as the Source menu instead of a chip strip. */
    sourceMenu?: boolean;
  }

  let { scope, sourceMenu = false }: Props = $props();

  // The list, the placeholder, choose and search: one owner, shared with the
  // desktop Source menu.
  const scopes = createBrowseScopeChips(() => scope);
  const query = $derived(scopes.query);
  const header = $derived(scopes.header);
  const chips = $derived(scopes.chips);
  const currentKey = $derived(scopes.currentKey);
  const fixedCount = $derived(scopes.fixedCount);
  const hasLibrarySession = $derived(scopes.hasLibrarySession);
  const placeholder = $derived(scopes.placeholder);
  const choose = scopes.choose;
  const search = scopes.search;

  // On a phone or tablet the chips keep the band and the header bar carries
  // the search.
  const searchInHeader = $derived(header?.compactChrome ?? false);
  $effect(() => {
    if (!searchInHeader || !header || !query) return;
    return header.registerSearch({
      placeholder: () => placeholder,
      value: () => query.search,
      onSearch: search,
    });
  });

  // Keep the current chip in view when the scope changes from elsewhere
  // (a collection card, Back). `nearest` leaves an already-visible chip alone.
  let track = $state<HTMLElement | null>(null);
  $effect(() => {
    const key = currentKey;
    const el = track?.querySelector<HTMLElement>(
      `[data-scope-key="${CSS.escape(key)}"]`
    );
    el?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
</script>

{#snippet allCollectionsChip()}
  <span class="chip-slot" data-scope-key={ALL_COLLECTIONS_KEY}>
    <FilterChipBase
      mode="action"
      size="sm"
      labelScale="readable"
      label={t("browse_scope_all_collections")}
      icon="fas fa-folder-open"
      current={currentKey === ALL_COLLECTIONS_KEY}
      onclick={scopes.viewCollections}
    />
  </span>
{/snippet}

<div class="scope-frame">
  <div class="scope-bar" class:source-menu={sourceMenu}>
    {#if query && !searchInHeader}
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
    {#if sourceMenu}
      <BrowseSourceMenu {scope} />
    {:else}
      <nav class="scope-chips" aria-label={t("browse_scope_nav")}>
        <div class="chip-track" bind:this={track}>
          {#each chips as chip, index (scopeKey(chip.scope))}
            {#if index === fixedCount && hasLibrarySession}
              {@render allCollectionsChip()}
            {/if}
            <span class="chip-slot" data-scope-key={scopeKey(chip.scope)}>
              <FilterChipBase
                mode="action"
                size="sm"
                labelScale="readable"
                label={chip.label}
                icon={chip.icon}
                current={scopeKey(chip.scope) === currentKey}
                onclick={() => choose(chip.scope)}
              />
            </span>
          {/each}
        </div>
      </nav>
    {/if}
  </div>
</div>

<style>
  .scope-frame {
    container-type: inline-size;
    flex: 0 0 auto;
  }

  .scope-bar {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 0 0 auto;
    padding: 8px clamp(12px, 2cqi, 28px);
    border-bottom: 1px solid
      color-mix(in srgb, var(--theme-text, #fff) 10%, transparent);
  }

  .scope-search {
    min-width: 0;
  }

  .scope-chips {
    min-width: 0;
    /* Bleed the scroller to the bar's edges so chips slide under the gutter
       instead of being clipped inside it. */
    margin-inline: calc(-1 * clamp(12px, 2cqi, 28px));
  }

  .chip-track {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
    padding-inline: clamp(12px, 2cqi, 28px);
    scroll-padding-inline: clamp(12px, 2cqi, 28px);
  }

  .chip-track::-webkit-scrollbar {
    display: none;
  }

  .chip-slot {
    display: flex;
    flex: 0 0 auto;
  }

  /* Wide panes: the search and the scopes share one row. */
  @container (min-width: 900px) {
    .scope-bar {
      flex-direction: row;
      align-items: center;
      gap: 16px;
    }

    .scope-search {
      flex: 0 1 420px;
    }

    .scope-chips {
      flex: 1 1 auto;
      margin-inline: 0 calc(-1 * clamp(12px, 2cqi, 28px));
    }

    .chip-track {
      padding-inline-start: 0;
    }
  }

  /* The Source menu is one button, so it sits beside the search at every
     width the desktop front door has. */
  .scope-bar.source-menu {
    flex-direction: row;
    align-items: center;
    gap: 12px;
  }

  .scope-bar.source-menu .scope-search {
    flex: 0 1 420px;
  }

  /* A phone on its side has width to spare and no height: one row there
     too, with a narrower search, so the grid keeps its rows. */
  @media (max-height: 520px) {
    @container (min-width: 560px) {
      .scope-bar {
        flex-direction: row;
        align-items: center;
        gap: 12px;
      }

      .scope-search {
        flex: 0 1 300px;
      }

      .scope-chips {
        flex: 1 1 auto;
        margin-inline: 0 calc(-1 * clamp(12px, 2cqi, 28px));
      }

      .chip-track {
        padding-inline-start: 0;
      }
    }
  }

  /* The same phone in Browse's side column (BrowseModule): a narrow bar that
     owns the column's remaining height. The chips wrap into lines instead of
     a sideways strip, and only the chip list scrolls when the collections
     outgrow the column. */
  @media (max-height: 480px) and (min-width: 700px) {
    @container (max-width: 400px) {
      .scope-bar {
        height: 100%;
        box-sizing: border-box;
        padding: 8px 10px;
        border-bottom: none;
      }

      .scope-chips {
        flex: 1 1 auto;
        min-height: 0;
        margin-inline: 0;
        overflow-y: auto;
        overscroll-behavior-y: contain;
        scrollbar-width: thin;
        scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
      }

      .chip-track {
        flex-wrap: wrap;
        overflow-x: visible;
        padding-inline: 0;
      }

      .chip-slot {
        flex: 0 1 auto;
        min-width: 0;
        max-width: 100%;
      }
    }
  }
</style>
