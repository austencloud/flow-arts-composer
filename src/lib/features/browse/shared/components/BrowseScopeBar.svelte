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
-->
<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { collectionsState } from "#lib/features/library/state/collections-state.svelte.js";
  import { followedCollectionsState } from "#lib/features/library/state/followed-collections-state.svelte.js";
  import { getBrowseNavigationContext } from "#lib/shared/browse/context/browse-navigation-context.js";
  import { tryGetBrowseQueryContext } from "#lib/shared/browse/state/browse-query-state.svelte.js";
  import { tryGetBrowseHeaderContext } from "#lib/shared/browse/context/browse-header-context.js";
  import {
    locationForScope,
    scopeKey,
    type BrowseScope,
  } from "#lib/shared/browse/navigation/browse-scope.js";
  import ExpandableSearchBar from "#lib/shared/browse/components/ExpandableSearchBar.svelte";
  import FilterChipBase from "#lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import {
    FOUNDING_SMART_COLLECTIONS,
    toSyntheticCollection,
  } from "#lib/features/browse/collections/config/founding-collections.js";
  import {
    readCollectionSortPreference,
    sortCollections,
  } from "#lib/features/browse/collections/services/collection-sort.js";
  import { getSharedCollectionsContext } from "#lib/features/browse/collections/context/shared-collections-context.js";

  interface Props {
    /** Null on the collections list: no pile is open, so the All collections
     * chip is current and a search opens Saved (or Everyone when signed out). */
    scope: BrowseScope | null;
  }

  let { scope }: Props = $props();

  const ALL_COLLECTIONS_KEY = "all-collections";

  const browseNavigationState = getBrowseNavigationContext();
  const query = tryGetBrowseQueryContext();
  const sharedCollectionsState = getSharedCollectionsContext();
  // An open collection registers its name with the header bar once it
  // loads; a link carries no name, so the bar borrows it from there.
  const header = tryGetBrowseHeaderContext();

  const hasLibrarySession = $derived(!!authState.effectiveUserId);
  const currentKey = $derived(scope ? scopeKey(scope) : ALL_COLLECTIONS_KEY);
  const searchScope = $derived<BrowseScope>(
    scope ?? (hasLibrarySession ? { kind: "saved" } : { kind: "everyone" })
  );

  interface ScopeChip {
    scope: BrowseScope;
    label: string;
    icon: string;
  }

  function faClass(icon: string | undefined, fallback: string): string {
    const name = icon || fallback;
    return name.startsWith("fa-") ? `fas ${name}` : name;
  }

  const foundingChips: ScopeChip[] = FOUNDING_SMART_COLLECTIONS.map(
    toSyntheticCollection
  ).map((c) => ({
    scope: { kind: "collection", id: c.id, name: c.name },
    label: c.name,
    icon: faClass(c.icon, "fa-book"),
  }));

  // Everyone, Saved (signed in) and Drafts; the All collections chip
  // follows them.
  const fixedCount = $derived(hasLibrarySession ? 3 : 2);
  const chips = $derived.by<ScopeChip[]>(() => {
    const fixed: ScopeChip[] = [
      {
        scope: { kind: "everyone" },
        label: t("browse_scope_everyone"),
        icon: "fas fa-globe",
      },
    ];
    if (hasLibrarySession) {
      fixed.push({
        scope: { kind: "saved" },
        label: t("browse_scope_saved"),
        icon: "fas fa-layer-group",
      });
    }
    fixed.push({
      scope: { kind: "drafts" },
      label: t("tab_browse_drafts"),
      icon: "fas fa-pen-to-square",
    });

    const collections: ScopeChip[] = [];
    if (hasLibrarySession) {
      for (const c of sortCollections(
        collectionsState.collections,
        readCollectionSortPreference()
      )) {
        collections.push({
          scope: { kind: "collection", id: c.id, name: c.name },
          label: c.name,
          icon: faClass(
            c.icon,
            c.kind === "smart" ? "fa-wand-magic-sparkles" : "fa-folder"
          ),
        });
      }
      for (const item of sharedCollectionsState.items) {
        collections.push({
          scope: {
            kind: "collection",
            id: item.grant.collectionId,
            ownerId: item.grant.ownerId,
            name: item.collection.name,
            ownerName: item.ownerName,
          },
          label: item.collection.name,
          icon: "fas fa-user-group",
        });
      }
      for (const item of followedCollectionsState.items) {
        collections.push({
          scope: {
            kind: "collection",
            id: item.collection.id,
            ownerId: item.ownerId,
            name: item.collection.name,
            ownerName: item.ownerName,
          },
          label: item.collection.name,
          icon: "fas fa-bookmark",
        });
      }
    }
    collections.push(...foundingChips);

    // A collection opened from somewhere the row does not list (a public
    // collection, a link) still gets a chip, right after the fixed scopes, so
    // the row always shows where you are.
    const listed = [...fixed, ...collections].some(
      (chip) => scopeKey(chip.scope) === currentKey
    );
    const current: ScopeChip[] =
      !listed && scope?.kind === "collection"
        ? [
            {
              scope,
              label:
                scope.name ?? header?.leaf ?? t("browse_scope_this_collection"),
              icon: scope.community ? "fas fa-users" : "fas fa-folder",
            },
          ]
        : [];
    return [...fixed, ...current, ...collections];
  });

  const placeholder = $derived.by(() => {
    const scope = searchScope;
    switch (scope.kind) {
      case "everyone":
        return t("browse_scope_search_everyone");
      case "saved":
        return t("browse_scope_search_saved");
      case "drafts":
        return t("browse_scope_search_drafts");
      case "collection": {
        // A location opened without its name (a link, a reload) still
        // matches a listed chip that knows it.
        const listed = chips.find(
          (chip) => scopeKey(chip.scope) === scopeKey(scope)
        );
        return t("browse_scope_search_collection", {
          name:
            scope.name ??
            listed?.label ??
            header?.leaf ??
            t("browse_scope_this_collection"),
        });
      }
    }
  });

  function choose(next: BrowseScope) {
    if (scopeKey(next) === currentKey) return;
    browseNavigationState.navigateTo(locationForScope(next));
  }

  function search(text: string) {
    if (!query) return;
    query.setSearch(text);
    // Typing on the collections list means "find a sequence": open the pile
    // the placeholder named, carrying the words along.
    if (!scope && text) choose(searchScope);
  }

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
      onclick={() => {
        if (currentKey !== ALL_COLLECTIONS_KEY)
          browseNavigationState.viewCollections();
      }}
    />
  </span>
{/snippet}

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
</style>
