/**
 * The scopes a Browse sequence search can run over: Everyone, Saved, Drafts,
 * then each collection you own, share or follow, then the founding decks.
 *
 * One owner for the list, the search placeholder and what choosing a scope
 * or typing a search does. Two presentations read it: the scope bar's chip
 * row (BrowseScopeBar, phones and tablets) and the desktop menu row's Source
 * menu (BrowseSourceMenu). Call it during component setup: it reads the
 * Browse navigation, query and header contexts.
 */
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
import {
  FOUNDING_SMART_COLLECTIONS,
  toSyntheticCollection,
} from "#lib/features/browse/collections/config/founding-collections.js";
import {
  readCollectionSortPreference,
  sortCollections,
} from "#lib/features/browse/collections/services/collection-sort.js";
import { getSharedCollectionsContext } from "#lib/features/browse/collections/context/shared-collections-context.js";

export const ALL_COLLECTIONS_KEY = "all-collections";

export interface ScopeChip {
  scope: BrowseScope;
  label: string;
  icon: string;
}

/** `getScope` returns null on the collections list: no pile is open, so All
 * collections is current and a search opens Saved (or Everyone when signed
 * out). */
export function createBrowseScopeChips(getScope: () => BrowseScope | null) {
  const scope = $derived(getScope());
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


  return {
    get hasLibrarySession() {
      return hasLibrarySession;
    },
    get currentKey() {
      return currentKey;
    },
    /** How many fixed scopes lead the list (Everyone, Saved, Drafts). The All
     * collections entry follows them when signed in. */
    get fixedCount() {
      return fixedCount;
    },
    get chips() {
      return chips;
    },
    get placeholder() {
      return placeholder;
    },
    get searchScope() {
      return searchScope;
    },
    /** The open search query (null outside a Browse query owner). */
    get query() {
      return query;
    },
    get header() {
      return header;
    },
    choose,
    search,
    viewCollections() {
      if (currentKey !== ALL_COLLECTIONS_KEY) browseNavigationState.viewCollections();
    },
  };
}

export type BrowseScopeChips = ReturnType<typeof createBrowseScopeChips>;
