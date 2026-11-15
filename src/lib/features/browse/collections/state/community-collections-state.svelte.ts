import type { LibraryCollection } from "#lib/shared/library/domain/models/collection.js";
import { getVisibleOwnerNames } from "#lib/shared/community/services/user-repository.js";
import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
import { collectionsState } from "#lib/features/library/state/collections-state.svelte.js";
import {
  subscribeToAllPublicCollections,
  type PublicCollectionWithOwner,
} from "#lib/features/library/services/public-collection-loader.js";

/**
 * community-collections-state - everyone's public collections, flattened.
 *
 * The Community sub-view of Browse > Collections shows public collections from
 * every creator as one grid. One live collection-group query pulls them all
 * (newest first, capped), then a single batched pass resolves owner display
 * names. This scales with the number of public
 * collections, not the user count. A Firestore listener keeps this singleton
 * current when another device creates, renames, publishes, or edits one.
 *
 * A public collection with its owner attached — the card needs a name to
 * credit, and opening one read-only needs the owner's uid to find it.
 */
export interface CommunityCollection {
  collection: LibraryCollection;
  ownerId: string;
  ownerName: string;
}

/** The signed-in person, as the feed credits them on their own cards. */
export interface FeedOwner {
  id: string;
  name: string;
}

/**
 * The feed with the viewer's own public collections guaranteed present.
 *
 * The cross-user listener is the source of truth for everyone else, but for
 * your own collections it is one more round trip (server snapshot, count
 * normalization, owner-name lookup) between "Make public" and the card
 * appearing under Explore > Collections. Your own library state already knows
 * the flag the instant it flips, so any public collection of yours the feed
 * has not delivered yet is filled in from there. Once the feed's copy lands
 * it wins: that copy carries the public-member count a visitor will see.
 *
 * System collections and smart collections never appear in the feed, so they
 * are skipped here too. The result keeps the feed's newest-first order.
 */
export function withOwnPublicCollections(
  feed: CommunityCollection[],
  own: readonly LibraryCollection[],
  owner: FeedOwner | null
): CommunityCollection[] {
  if (!owner) return feed;

  const inFeed = new Set(
    feed.map((item) => `${item.ownerId}/${item.collection.id}`)
  );
  const missing = own
    .filter(
      (collection) =>
        collection.isPublic &&
        !collection.systemType &&
        collection.kind !== "smart" &&
        !inFeed.has(`${collection.ownerId || owner.id}/${collection.id}`)
    )
    .map(
      (collection): CommunityCollection => ({
        collection,
        ownerId: collection.ownerId || owner.id,
        ownerName: owner.name,
      })
    );
  if (missing.length === 0) return feed;

  return [...feed, ...missing].sort(
    (a, b) =>
      b.collection.updatedAt.getTime() - a.collection.updatedAt.getTime()
  );
}

/**
 * The public shelf: collections a visitor can pick from.
 *
 * A public collection with nothing a visitor can see reads as broken when
 * someone taps it, so it stays off the shelf, except for its owner, who still
 * sees their own (publishing something and not finding it would read as a bug).
 * `sequenceCount` on a feed item is already the number of members a visitor
 * can see. The input order is kept.
 */
export function visibleOnShelf(
  items: CommunityCollection[],
  viewerId: string | null | undefined
): CommunityCollection[] {
  return items.filter(
    (item) =>
      item.collection.sequenceCount > 0 ||
      (!!viewerId && item.ownerId === viewerId)
  );
}

class CommunityCollectionsState {
  /** What the cross-user listener has delivered, owners resolved. */
  private feed = $state<CommunityCollection[]>([]);
  loading = $state(false);
  error = $state<string | null>(null);

  /**
   * Every public collection: the feed plus the viewer's own (see
   * withOwnPublicCollections), empty ones included. Use this to look a
   * collection up by id, so a direct link to an empty one still opens. Lists
   * people pick from read `shelfItems`. Never read `feed`.
   */
  items = $derived.by(() =>
    withOwnPublicCollections(
      this.feed,
      collectionsState.collections,
      currentOwner()
    )
  );

  /**
   * What the public shelf lists: `items` without other people's empty
   * collections (see visibleOnShelf).
   */
  shelfItems = $derived.by(() =>
    visibleOnShelf(this.items, currentOwner()?.id)
  );

  private started = false;
  private unsubscribe: (() => void) | null = null;
  private updateEpoch = 0;

  /**
   * Start once per session. The feed holds EVERY public collection, empty
   * ones included, so any of them opens by id or link. The shelf
   * (`shelfItems`) leaves out empty ones for everyone but their owner.
   */
  async ensureLoaded(): Promise<void> {
    if (this.started) return;

    this.started = true;
    this.loading = true;
    this.error = null;
    this.unsubscribe = subscribeToAllPublicCollections(
      (withOwners) => void this.applySnapshot(withOwners),
      (err) => {
        console.error("[community-collections] Live load failed:", err);
        this.error = "Couldn't load community collections.";
        this.loading = false;
      }
    );
  }

  /**
   * Resolve creator visibility in one batched pass for each collection
   * snapshot. An epoch guard prevents a slower name lookup from overwriting a
   * newer Firestore snapshot.
   */
  private async applySnapshot(
    withOwners: PublicCollectionWithOwner[]
  ): Promise<void> {
    const epoch = ++this.updateEpoch;
    try {
      const names = await getVisibleOwnerNames(
        withOwners.map((item) => item.ownerId)
      );
      if (epoch !== this.updateEpoch) return;

      this.feed = withOwners
        .filter((item) => names.has(item.ownerId))
        .map(
          ({ collection, ownerId }): CommunityCollection => ({
            collection,
            ownerId,
            ownerName: names.get(ownerId) ?? "Someone",
          })
        );
      this.error = null;
    } catch (err) {
      if (epoch !== this.updateEpoch) return;
      console.error("[community-collections] Owner lookup failed:", err);
      this.error = "Couldn't load community collections.";
    } finally {
      if (epoch === this.updateEpoch) this.loading = false;
    }
  }

  /**
   * Local mutations already reach the listener, but restarting also forces a
   * fresh public-member normalization after an explicit visibility action.
   */
  invalidate(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.started = false;
    this.updateEpoch++;
    void this.ensureLoaded();
  }

  teardown(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.started = false;
    this.updateEpoch++;
    this.feed = [];
    this.loading = false;
    this.error = null;
  }
}

/**
 * Who the viewer is for crediting their own cards. The effective id follows
 * an admin's user preview so the previewed library's public collections are
 * the ones filled in; the name is only ever the signed-in account's.
 */
function currentOwner(): FeedOwner | null {
  const id = authState.effectiveUserId;
  if (!id) return null;
  return { id, name: authState.user?.displayName || "You" };
}

export const communityCollectionsState = new CommunityCollectionsState();
