import { describe, it, expect, vi, beforeEach } from "vitest";
import type { LibraryCollection } from "#lib/shared/library/domain/models/collection.js";
import { writeOwnMirror } from "#lib/features/library/services/collection-cache-mirror.js";

// The local mirror is intentionally NOT mocked — this test exercises the real
// localStorage round-trip that makes Library paint synchronously.

const mocks = vi.hoisted(() => ({
	ensureSystemCollections: vi.fn(() => Promise.resolve()),
	subscribeToCollections: vi.fn(() => () => {}),
	snapshotCb: null as ((cols: LibraryCollection[]) => void) | null,
}));

vi.mock("#lib/shared/library/services/collection-manager.js", () => ({
	addSequenceToCollection: vi.fn(),
	removeSequenceFromCollection: vi.fn(),
	createUserCollection: vi.fn(),
	createSmartUserCollection: vi.fn(),
	updateCollectionFilterSpec: vi.fn(),
	syncSmartCollectionCount: vi.fn(),
	ensureSystemCollections: mocks.ensureSystemCollections,
	subscribeToCollections: (cb: (cols: LibraryCollection[]) => void) => {
		mocks.snapshotCb = cb;
		return mocks.subscribeToCollections();
	},
	updateCollection: vi.fn(),
	deleteCollection: vi.fn(),
}));
vi.mock("#lib/shared/toast/state/toast-state.svelte.js", () => ({
	toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
	authState: {
		user: { uid: "u1" },
		effectiveUserId: "u1",
	},
}));

import { collectionsState } from "../collections-state.svelte";

function col(id: string, name: string): LibraryCollection {
	return {
		id,
		name,
		ownerId: "u1",
		sequenceIds: ["s1", "s2"],
		sequenceCount: 2,
		isPublic: false,
		sortOrder: 0,
		icon: "fa-folder",
		createdAt: new Date("2026-07-01T00:00:00.000Z"),
		updatedAt: new Date("2026-07-01T00:00:00.000Z"),
	};
}

beforeEach(() => {
	collectionsState.teardown();
	localStorage.clear();
	vi.clearAllMocks();
	mocks.snapshotCb = null;
});

describe("collectionsState — mirror seed", () => {
	it("seeds collections synchronously from the mirror before any snapshot", () => {
		writeOwnMirror("u1", [col("c1", "Faves"), col("c2", "Trip")]);

		collectionsState.ensureStarted();

		// No snapshot has fired yet — these came straight from localStorage.
		expect(mocks.snapshotCb).not.toBeNull();
		expect(collectionsState.collections).toHaveLength(2);
		expect(collectionsState.collections[0]!.name).toBe("Faves");
		// A non-empty seed means we skip the skeleton.
		expect(collectionsState.loading).toBe(false);
	});

	it("shows the skeleton (loading) when the mirror is empty", () => {
		collectionsState.ensureStarted();
		expect(collectionsState.collections).toHaveLength(0);
		expect(collectionsState.loading).toBe(true);
	});

	it("overwrites the seed and re-writes the mirror when a snapshot lands", () => {
		writeOwnMirror("u1", [col("c1", "Stale")]);
		collectionsState.ensureStarted();
		expect(collectionsState.collections[0]!.name).toBe("Stale");

		mocks.snapshotCb?.([col("c1", "Fresh"), col("c9", "New")]);

		expect(collectionsState.loading).toBe(false);
		expect(collectionsState.collections).toHaveLength(2);
		expect(collectionsState.collections[0]!.name).toBe("Fresh");

		// The mirror now holds the fresh snapshot for the next open.
		const raw = localStorage.getItem("tka:collections-mirror:own:u1");
		expect(raw).toContain("Fresh");
		expect(raw).toContain("New");
		expect(raw).not.toContain("Stale");
	});
});
