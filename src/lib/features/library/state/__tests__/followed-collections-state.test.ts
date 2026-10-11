import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LibraryCollection } from "#lib/shared/library/domain/models/collection.js";
import type { FollowedCollectionRef } from "#lib/shared/library/services/followed-collections.js";

// Captured snapshot callback so a test can emit follow refs like onSnapshot would.
const mocks = vi.hoisted(() => ({
	followCollection: vi.fn(),
	unfollowCollection: vi.fn(),
	getPublicCollection: vi.fn(),
	getUserDisplayNames: vi.fn(),
	toastError: vi.fn(),
	toastWarning: vi.fn(),
	snapshotCb: null as ((refs: FollowedCollectionRef[]) => void) | null,
	previewReadOnly: false,
	authState: {
		user: { uid: "me" },
		effectiveUserId: "me" as string | null,
	},
	unsubscribes: [] as Array<ReturnType<typeof vi.fn>>,
	subscribeToFollowedCollections: vi.fn(
		(cb: (refs: FollowedCollectionRef[]) => void) => {
			mocks.snapshotCb = cb;
			const unsubscribe = vi.fn();
			mocks.unsubscribes.push(unsubscribe);
			return Promise.resolve(unsubscribe);
		},
	),
}));

vi.mock("#lib/shared/library/services/followed-collections.js", () => ({
	followCollection: mocks.followCollection,
	unfollowCollection: mocks.unfollowCollection,
	subscribeToFollowedCollections: mocks.subscribeToFollowedCollections,
}));
vi.mock("#lib/features/library/services/public-collection-loader.js", () => ({
	getPublicCollection: mocks.getPublicCollection,
}));
vi.mock("#lib/shared/community/services/user-repository.js", () => ({
	getUserDisplayNames: mocks.getUserDisplayNames,
}));
vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
	authState: mocks.authState,
}));
vi.mock("#lib/shared/debug/state/user-preview-state.svelte.js", () => ({
	isPreviewReadOnly: () => mocks.previewReadOnly,
}));
vi.mock("#lib/shared/toast/state/toast-state.svelte.js", () => ({
	toast: {
		error: mocks.toastError,
		success: vi.fn(),
		warning: mocks.toastWarning,
	},
}));

import { followedCollectionsState } from "../followed-collections-state.svelte";

function col(id: string, opts: Partial<LibraryCollection> = {}): LibraryCollection {
	return {
		id,
		name: id.toUpperCase(),
		ownerId: "o",
		sequenceIds: [],
		sequenceCount: 0,
		isPublic: true,
		sortOrder: 0,
		icon: "fa-folder",
		createdAt: new Date(),
		updatedAt: new Date(),
		...opts,
	};
}

/** Drive one snapshot through resolve() and wait for it to settle. */
async function emit(refs: FollowedCollectionRef[]): Promise<void> {
	followedCollectionsState.ensureStarted();
	// ensureStarted subscribes asynchronously; let the resolved promise register.
	await Promise.resolve();
	mocks.snapshotCb?.(refs);
	await vi.waitFor(() => expect(followedCollectionsState.loading).toBe(false));
}

beforeEach(() => {
	followedCollectionsState.teardown();
	// The state now seeds synchronously from the localStorage mirror; clear it so
	// one test's resolved items don't seed the next (and leave loading=false,
	// which would let emit()'s waitFor pass before resolve runs).
	localStorage.clear();
	vi.clearAllMocks();
	mocks.snapshotCb = null;
	mocks.unsubscribes = [];
	mocks.previewReadOnly = false;
	mocks.authState.effectiveUserId = "me";
	mocks.getUserDisplayNames.mockResolvedValue(new Map<string, string>());
});

describe("followedCollectionsState", () => {
	it("restarts its follow subscription for the effective preview identity", async () => {
		followedCollectionsState.ensureStarted();
		await Promise.resolve();

		mocks.previewReadOnly = true;
		mocks.authState.effectiveUserId = "preview-user";
		followedCollectionsState.ensureStarted();
		await Promise.resolve();

		expect(mocks.subscribeToFollowedCollections).toHaveBeenCalledTimes(2);
		expect(mocks.unsubscribes[0]).toHaveBeenCalledOnce();
	});

	it("blocks follow writes while previewing another user", async () => {
		mocks.previewReadOnly = true;

		await followedCollectionsState.follow(
			"owner",
			"collection",
			"community_collection",
		);
		await followedCollectionsState.unfollow(
			"owner",
			"collection",
			"followed_collection",
		);

		expect(mocks.followCollection).not.toHaveBeenCalled();
		expect(mocks.unfollowCollection).not.toHaveBeenCalled();
		expect(mocks.toastWarning).toHaveBeenCalledTimes(2);
	});

	it("keeps the surviving collections when one ref's read rejects", async () => {
		mocks.getPublicCollection.mockImplementation((ownerId: string, colId: string) =>
			colId === "c1" ? Promise.resolve(col("c1")) : Promise.reject(new Error("denied")),
		);
		mocks.getUserDisplayNames.mockResolvedValue(new Map([["o1", "Alice"]]));

		await emit([
			{ ownerId: "o1", collectionId: "c1" },
			{ ownerId: "o2", collectionId: "c2" },
		]);

		// The rejecting ref drops out; the whole list is NOT wedged.
		expect(followedCollectionsState.items).toHaveLength(1);
		const [survivor] = followedCollectionsState.items;
		expect(survivor?.collection.id).toBe("c1");
		expect(survivor?.ownerName).toBe("Alice");
		expect(followedCollectionsState.loading).toBe(false);
	});

	it("passes the loader's normalized sequenceCount through untouched", async () => {
		// The loader owns public-count normalization (module invariant); the
		// rail must not re-derive or patch it. Owner stores 4 ids, loader
		// already normalized the count to 1 — the rail shows 1.
		mocks.getPublicCollection.mockResolvedValue(
			col("c1", { sequenceIds: ["a", "b", "c", "d"], sequenceCount: 1 }),
		);
		mocks.getUserDisplayNames.mockResolvedValue(new Map([["o1", "Alice"]]));

		await emit([{ ownerId: "o1", collectionId: "c1" }]);

		expect(followedCollectionsState.items[0]?.collection.sequenceCount).toBe(1);
	});

	it("drops a follow whose collection is null (deleted/unpublished)", async () => {
		mocks.getPublicCollection.mockResolvedValue(null);

		await emit([{ ownerId: "o1", collectionId: "gone" }]);

		expect(followedCollectionsState.items).toHaveLength(0);
		expect(followedCollectionsState.loading).toBe(false);
	});

	it("resolves loading even when the batched name lookup rejects", async () => {
		mocks.getPublicCollection.mockResolvedValue(col("c1"));
		mocks.getUserDisplayNames.mockRejectedValue(new Error("network"));

		await emit([{ ownerId: "o1", collectionId: "c1" }]);

		// Never stuck spinning; last-good items preserved (empty here).
		expect(followedCollectionsState.loading).toBe(false);
	});

	it("falls back to 'Someone' when an owner name is missing", async () => {
		mocks.getPublicCollection.mockResolvedValue(col("c1"));
		mocks.getUserDisplayNames.mockResolvedValue(new Map());

		await emit([{ ownerId: "ghost", collectionId: "c1" }]);

		const [item] = followedCollectionsState.items;
		expect(item?.ownerName).toBe("Someone");
	});

	it("isFollowed reflects the emitted refs", async () => {
		mocks.getPublicCollection.mockResolvedValue(col("c1"));

		await emit([{ ownerId: "o1", collectionId: "c1" }]);

		expect(followedCollectionsState.isFollowed("o1", "c1")).toBe(true);
		expect(followedCollectionsState.isFollowed("o1", "other")).toBe(false);
	});
});
