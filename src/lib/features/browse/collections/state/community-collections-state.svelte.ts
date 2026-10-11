import type { LibraryCollection } from "#lib/shared/library/domain/models/collection.js";
import { getVisibleOwnerNames } from "#lib/shared/community/services/user-repository.js";
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

class CommunityCollectionsState {
	items = $state<CommunityCollection[]>([]);
	loading = $state(false);
	error = $state<string | null>(null);

	private started = false;
	private unsubscribe: (() => void) | null = null;
	private updateEpoch = 0;

	/**
	 * Start once per session. EVERY public collection is here, including your
	 * own and including empty ones. Publishing something and not seeing it in
	 * Community reads as a bug, so the feed shows exactly what the flag says.
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
	private async applySnapshot(withOwners: PublicCollectionWithOwner[]): Promise<void> {
		const epoch = ++this.updateEpoch;
		try {
			const names = await getVisibleOwnerNames(withOwners.map((item) => item.ownerId));
			if (epoch !== this.updateEpoch) return;

			this.items = withOwners
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
		this.items = [];
		this.loading = false;
		this.error = null;
	}
}

export const communityCollectionsState = new CommunityCollectionsState();
