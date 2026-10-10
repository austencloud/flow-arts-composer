import { describe, it, expect, vi, beforeEach } from "vitest";

// Firestore + app-firebase are only touched by the direct-doc strategy and
// record fetch; mock both so tests control every record shape.
const getDocMock = vi.fn();
vi.mock("firebase/firestore", () => ({
	addDoc: vi.fn(),
	collection: vi.fn(),
	doc: vi.fn((_db: unknown, path: string) => ({ path })),
	getDoc: (ref: unknown) => getDocMock(ref),
	query: vi.fn(),
	where: vi.fn(),
	getDocs: vi.fn(),
	updateDoc: vi.fn(),
	increment: vi.fn(),
	runTransaction: vi.fn(),
}));
vi.mock("#lib/shared/auth/firebase.js", () => ({
	getFirestoreInstance: vi.fn(async () => ({})),
}));
vi.mock("#lib/shared/navigation/services/sequence-encoder.js", () => ({
	encodeSequenceForQR: vi.fn(),
	isInlineEncoded: (s: string) => s.startsWith("s~"),
	decodeSequenceFromQR: vi.fn(async (payload: string) => ({
		id: "",
		word: `decoded:${payload}`,
		steps: [{ id: "step1" }],
	})),
}));

import { ShortCodeManager } from "../short-code-manager";

let directDoc: Record<string, unknown> | null = null;

function makeManager(opts: {
	record: Record<string, unknown> | null;
	publicHit?: Record<string, unknown> | null;
}) {
	const browseLoader = {
		loadFullSequenceData: vi.fn(async () => opts.publicHit ?? null),
	};
	const manager = new ShortCodeManager(
		browseLoader as never,
		undefined,
		{
			get: vi.fn(async () => null),
			getMany: vi.fn(async () => new Map()),
			set: vi.fn(),
		} as never,
	);
	// Drive both Firestore reads the manager performs: the shortcode record
	// (doc path "shortcodes") and the direct sequence doc (path "users/...").
	getDocMock.mockImplementation(async (ref: { path?: string }) => {
		if (ref?.path?.startsWith("users/")) {
			return directDoc
				? { exists: () => true, id: "seq-direct", data: () => directDoc }
				: { exists: () => false };
		}
		return opts.record
			? { exists: () => true, data: () => opts.record }
			: { exists: () => false };
	});
	return { manager, browseLoader };
}

beforeEach(() => {
	getDocMock.mockReset();
	directDoc = null;
	// The static-snapshot fallback fetches real URLs — force it to miss.
	vi.stubGlobal(
		"fetch",
		vi.fn(async () => ({ ok: false, status: 404 })),
	);
});

describe("resolveForImport", () => {
	it("prefers the public index and marks it docBacked", async () => {
		const { manager } = makeManager({
			record: { sequence: "KAKA", sequenceId: "seq-1", encoded: "s~blob" },
			publicHit: { id: "seq-1", word: "KAKA", steps: [{}] },
		});
		const result = await manager.resolveForImport("AB3D", "me");
		expect(result).toEqual({
			sequence: { id: "seq-1", word: "KAKA", steps: [{}] },
			docBacked: true,
		});
	});

	it("falls back to the encoded blob as NOT docBacked, id = code", async () => {
		const { manager } = makeManager({
			record: { sequence: "KAKA", encoded: "s~blob" },
			publicHit: null,
		});
		const result = await manager.resolveForImport("AB3D", "me");
		expect(result?.docBacked).toBe(false);
		expect(result?.sequence.id).toBe("AB3D");
	});

	it("stamps the record's sequenceName onto an encoded-blob import", async () => {
		// Repro of the 2026-07-05 "SS card" bug: the decoded blob is nameless
		// (name "Shared Sequence", word "") — the record's sequenceName is the
		// word printed on the card and must survive onto the imported copy.
		const { manager } = makeManager({
			record: {
				sequence: "ALΦB",
				sequenceName: "ALΦBALΦBALΦBALΦB",
				encoded: "s~blob",
			},
			publicHit: null,
		});
		const result = await manager.resolveForImport("X6DK", "me");
		expect(result?.sequence.word).toBe("ALΦBALΦBALΦBALΦB");
		expect(result?.sequence.name).toBe("ALΦBALΦBALΦBALΦB");
	});

	it("falls back to the record's word-shaped `sequence` field for the stamp", async () => {
		const { manager } = makeManager({
			record: { sequence: "KAKA", encoded: "s~blob" },
			publicHit: null,
		});
		const result = await manager.resolveForImport("AB3D", "me");
		expect(result?.sequence.word).toBe("KAKA");
	});

	it("does NOT stamp when `sequence` holds a legacy encoded blob", async () => {
		const { manager } = makeManager({
			record: { sequence: "iiSS|N,E:S,W|N,S", encoded: "s~blob" },
			publicHit: null,
		});
		const result = await manager.resolveForImport("AB3D", "me");
		// Falls through to whatever the decode produced — no garbage word.
		expect(result?.sequence.word).toBe("decoded:s~blob");
	});

	it("falls back to embedded sequenceData as NOT docBacked", async () => {
		const { manager } = makeManager({
			record: {
				sequence: "KAKA",
				sequenceData: { word: "KAKA", steps: [{ id: "s1" }] },
			},
			publicHit: null,
		});
		const result = await manager.resolveForImport("AB3D", "me");
		expect(result?.docBacked).toBe(false);
		expect(result?.sequence.word).toBe("KAKA");
	});

	it("marks an OWN private direct doc as docBacked", async () => {
		directDoc = { word: "KAKA", visibility: "private", steps: [{}] };
		const { manager } = makeManager({
			record: { sequence: "KAKA", sequenceId: "seq-direct", ownerId: "me" },
			publicHit: null,
		});
		const result = await manager.resolveForImport("AB3D", "me");
		expect(result?.docBacked).toBe(true);
		expect(result?.sequence.id).toBe("seq-direct");
	});

	it("marks a FOREIGN private direct doc as NOT docBacked (copy path)", async () => {
		directDoc = { word: "KAKA", visibility: "private", steps: [{}] };
		const { manager } = makeManager({
			record: {
				sequence: "KAKA",
				sequenceId: "seq-direct",
				ownerId: "someone-else",
			},
			publicHit: null,
		});
		const result = await manager.resolveForImport("AB3D", "me");
		expect(result?.docBacked).toBe(false);
	});

	it("decodes inline s~ payloads directly, NOT docBacked", async () => {
		const { manager } = makeManager({ record: null });
		const result = await manager.resolveForImport("s~r1:xyz", "me");
		expect(result?.docBacked).toBe(false);
		expect(result?.sequence.word).toBe("decoded:s~r1:xyz");
	});

	it("returns null when the code exists nowhere", async () => {
		const { manager } = makeManager({ record: null });
		const result = await manager.resolveForImport("ZZZZ", "me");
		expect(result).toBeNull();
	});
});
