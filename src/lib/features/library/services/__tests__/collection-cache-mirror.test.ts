import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { LibraryCollection } from "#lib/shared/library/domain/models/collection.js";
import type { FollowedCollection } from "#lib/features/library/state/followed-collections-state.svelte.js";
import {
	readOwnMirror,
	writeOwnMirror,
	readFollowedMirror,
	writeFollowedMirror,
	clearMirror,
} from "../collection-cache-mirror";

const UID = "user-1";
const OWN_KEY = `tka:collections-mirror:own:${UID}`;
const FOLLOWED_KEY = `tka:collections-mirror:followed:${UID}`;

function col(overrides: Partial<LibraryCollection> = {}): LibraryCollection {
	return {
		id: "c1",
		name: "Faves",
		ownerId: UID,
		sequenceIds: ["a", "b"],
		sequenceCount: 2,
		icon: "fa-folder",
		isPublic: false,
		sortOrder: 0,
		createdAt: new Date("2026-07-01T12:00:00.000Z"),
		updatedAt: new Date("2026-07-02T12:00:00.000Z"),
		...overrides,
	};
}

beforeEach(() => {
	localStorage.clear();
	vi.restoreAllMocks();
});

afterEach(() => {
	localStorage.clear();
});

describe("collection-cache-mirror — own collections", () => {
	it("round-trips a collection list", () => {
		const cols = [col(), col({ id: "c2", name: "Trip", sequenceCount: 5 })];
		writeOwnMirror(UID, cols);
		const back = readOwnMirror(UID);
		expect(back).toHaveLength(2);
		expect(back![0]!.name).toBe("Faves");
		expect(back![1]!.sequenceCount).toBe(5);
	});

	it("revives Date fields to real Dates", () => {
		writeOwnMirror(UID, [col()]);
		const first = readOwnMirror(UID)![0]!;
		expect(first.createdAt).toBeInstanceOf(Date);
		expect(first.createdAt.toISOString()).toBe("2026-07-01T12:00:00.000Z");
		expect(first.updatedAt).toBeInstanceOf(Date);
	});

	it("returns null on a missing key", () => {
		expect(readOwnMirror(UID)).toBeNull();
	});

	it("returns null on corrupt JSON", () => {
		localStorage.setItem(OWN_KEY, "{not json");
		expect(readOwnMirror(UID)).toBeNull();
	});

	it("returns null on a wrong-version envelope", () => {
		localStorage.setItem(OWN_KEY, JSON.stringify({ v: 999, data: [] }));
		expect(readOwnMirror(UID)).toBeNull();
	});

	it("returns null when a date can't be revived", () => {
		localStorage.setItem(
			OWN_KEY,
			JSON.stringify({ v: 1, data: [{ ...col(), createdAt: "garbage", updatedAt: "garbage" }] }),
		);
		expect(readOwnMirror(UID)).toBeNull();
	});

	it("swallows quota errors on write", () => {
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new DOMException("quota", "QuotaExceededError");
		});
		expect(() => writeOwnMirror(UID, [col()])).not.toThrow();
	});
});

describe("collection-cache-mirror — followed collections", () => {
	function followed(): FollowedCollection {
		return { collection: col({ id: "f1", name: "Shared" }), ownerId: "owner-9", ownerName: "Paul" };
	}

	it("round-trips followed items with owner metadata", () => {
		writeFollowedMirror(UID, [followed()]);
		const back = readFollowedMirror(UID);
		expect(back).toHaveLength(1);
		const item = back![0]!;
		expect(item.ownerName).toBe("Paul");
		expect(item.ownerId).toBe("owner-9");
		expect(item.collection.createdAt).toBeInstanceOf(Date);
	});

	it("returns null on corrupt followed blob", () => {
		localStorage.setItem(FOLLOWED_KEY, "nope");
		expect(readFollowedMirror(UID)).toBeNull();
	});
});

describe("collection-cache-mirror — clear", () => {
	it("removes both own and followed keys for the uid", () => {
		writeOwnMirror(UID, [col()]);
		writeFollowedMirror(UID, [
			{ collection: col(), ownerId: "o", ownerName: "n" },
		]);
		expect(localStorage.getItem(OWN_KEY)).not.toBeNull();
		expect(localStorage.getItem(FOLLOWED_KEY)).not.toBeNull();

		clearMirror(UID);

		expect(localStorage.getItem(OWN_KEY)).toBeNull();
		expect(localStorage.getItem(FOLLOWED_KEY)).toBeNull();
	});
});
