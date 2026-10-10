import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
import { isPreviewReadOnly } from "#lib/shared/debug/state/user-preview-state.svelte.js";
import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";
import type { LibraryCollection } from "#lib/shared/library/domain/models/collection.js";
import {
	followCollection,
	subscribeToFollowedCollections,
	unfollowCollection,
	type FollowedCollectionRef,
} from "#lib/shared/library/services/followed-collections.js";
import type { CollectionFollowSource } from "#lib/shared/analytics/social-events.js";
import { getPublicCollection } from "#lib/features/library/services/public-collection-loader.js";
import { getUserDisplayNames } from "#lib/shared/community/services/user-repository.js";
import {
	readFollowedMirror,
	writeFollowedMirror,
} from "#lib/features/library/services/collection-cache-mirror.js";

export interface FollowedCollection {
	readonly collection: LibraryCollection;
	readonly ownerId: string;
	readonly ownerName: string;
}

/**
 * followed-collections-state - live view of collections you follow.
 *
 * Mirrors collections-state: a single subscription over the follow refs;
 * each snapshot resolves refs to their live public collection docs + owner
 * names. A follow whose collection was deleted or unpublished resolves to
 * null and silently drops out — the follow doc stays, so re-publishing
 * brings it back.
 */
class FollowedCollectionsState {
	items = $state<FollowedCollection[]>([]);
	loading = $state(false);

	// $state so isFollowed() recomputes in reactive positions (the foreign
	// detail Follow/Unfollow button) when a snapshot rewrites the refs.
	private refs = $state<FollowedCollectionRef[]>([]);
	private unsubscribe: (() => void) | null = null;
	private startedFor: string | null = null;
	private resolveEpoch = 0;

	ensureStarted(): void {
		const uid = authState.effectiveUserId;
		if (!uid) {
			this.teardown();
			return;
		}
		if (this.startedFor === uid) return;

		this.teardown();
		this.startedFor = uid;

		// Synchronous paint: seed the followed shelf from the local mirror before
		// the refs subscription + per-owner resolves land. A non-empty seed skips
		// the skeleton; resolve() reconciles.
		const seed = readFollowedMirror(uid) ?? [];
		this.items = seed;
		this.loading = seed.length === 0;

		void subscribeToFollowedCollections((refs) => {
			this.refs = refs;
			void this.resolve(refs);
		})
			.then((unsub) => {
				// A teardown can race the async subscribe — drop the late sub.
				if (this.startedFor === uid) {
					this.unsubscribe = unsub;
				} else {
					unsub();
				}
			})
			.catch((err) => {
				if (this.startedFor !== uid) return;
				console.error("[followed-collections] subscribe failed:", err);
				this.loading = false;
			});
	}

	teardown(): void {
		this.unsubscribe?.();
		this.unsubscribe = null;
		this.startedFor = null;
		this.refs = [];
		this.items = [];
		this.loading = false;
		this.resolveEpoch++;
	}

	isFollowed(ownerId: string, collectionId: string): boolean {
		return this.refs.some(
			(r) => r.ownerId === ownerId && r.collectionId === collectionId,
		);
	}

	async follow(
		ownerId: string,
		collectionId: string,
		source: CollectionFollowSource,
	): Promise<void> {
		if (isPreviewReadOnly()) {
			toast.warning("This library is read-only while previewing another user.");
			return;
		}
		try {
			await followCollection(ownerId, collectionId, source);
		} catch (err) {
			console.error("[followed-collections] follow failed:", err);
			toast.error("Couldn't follow that collection. Try again.");
		}
	}

	async unfollow(
		ownerId: string,
		collectionId: string,
		source: CollectionFollowSource,
	): Promise<void> {
		if (isPreviewReadOnly()) {
			toast.warning("This library is read-only while previewing another user.");
			return;
		}
		try {
			await unfollowCollection(ownerId, collectionId, source);
		} catch (err) {
			console.error("[followed-collections] unfollow failed:", err);
			toast.error("Couldn't unfollow that collection. Try again.");
		}
	}

	private async resolve(refs: FollowedCollectionRef[]): Promise<void> {
		const epoch = ++this.resolveEpoch;

		try {
			// Collection docs live at per-owner paths, so each is its own read (no
			// cross-path batch get exists) — but they fetch in parallel. A single
			// read that rejects (network, or a rule that DENIES a now-private
			// collection instead of returning it) must drop only THAT entry, so
			// each read is caught to null — Promise.all is all-or-nothing and one
			// rejection would otherwise take down the whole followed list.
			const cols = await Promise.all(
				refs.map((ref) =>
					getPublicCollection(ref.ownerId, ref.collectionId).catch(() => null),
				),
			);

			const surviving = refs
				.map((ref, i) => ({ ref, col: cols[i] }))
				.filter((r): r is { ref: FollowedCollectionRef; col: LibraryCollection } => r.col !== null);

			// Owner names resolve in ONE batched pass over the surviving owners,
			// not one profile read per follow.
			const names = await getUserDisplayNames(surviving.map((s) => s.ref.ownerId));

			// A newer snapshot's resolution may have started while this one awaited.
			if (epoch !== this.resolveEpoch) return;
			// sequenceCount is already normalized to public members by the loader
			// (see the public-collection-loader module invariant).
			this.items = surviving.map(
				({ ref, col }): FollowedCollection => ({
					collection: col,
					ownerId: ref.ownerId,
					ownerName: names.get(ref.ownerId) ?? "Someone",
				}),
			);
			// Persist the resolved shelf so the next open paints it synchronously.
			const uid = this.startedFor;
			if (uid) writeFollowedMirror(uid, this.items);
		} catch (err) {
			// Batched name lookup failed; keep the last good items rather than
			// wedging. The next snapshot re-resolves.
			if (epoch === this.resolveEpoch) {
				console.error("[followed-collections] resolve failed:", err);
			}
		} finally {
			// Always clear loading for the newest resolve so the "Following"
			// section can render (or fall back to empty) instead of spinning
			// forever.
			if (epoch === this.resolveEpoch) this.loading = false;
		}
	}
}

export const followedCollectionsState = new FollowedCollectionsState();
