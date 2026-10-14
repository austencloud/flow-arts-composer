# Scan Card to Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Point the camera at a printed choreo card's QR from inside an open collection and the sequence is added instantly — continuous filing, card after card.

**Architecture:** A `ScanCardSheet` Drawer hosts a rear-camera viewfinder (existing `CameraManager`) and a ~200ms detection loop (`barcode-detector` ponyfill, self-hosted WASM). Each hit: extract the short code (pure `extractScanCode`), resolve identity-first (`ShortCodeManager.resolveForImport` — real sequence doc before embedded blob), then either add the doc id as a collection reference or silently save a private copy to My Library first. No rejection state.

**Tech Stack:** Svelte 5 runes, `barcode-detector` (Sec-ant ponyfill / ZXing-C++ WASM), Firebase Firestore, vitest.

**Spec:** `docs/superpowers/specs/active/2026-07-02-scan-card-to-collection-design.md`

**Project ground rules (non-negotiable):**
- All work on `main`. NEVER create a branch or worktree.
- Commit ONLY the files each task names, always with an explicit pathspec: `git commit -m "..." -- <paths>`. The working tree carries other sessions' uncommitted work — never `git add -A`/`.`, never bare `git commit`.
- Port 5173 is the user's dev server. Never run `npm run dev`. Verify with `npm run check:fast` and `curl -sk https://localhost:5173/browse`.
- Unit tests: `npx vitest run <file>`.

---

## File map

| File | Role |
|---|---|
| Create `src/lib/shared/qr/services/extract-scan-code.ts` | Pure fn: QR rawValue → short code (or inline `s~` payload) or null |
| Create `src/lib/shared/qr/services/__tests__/extract-scan-code.test.ts` | Its tests |
| Modify `src/lib/shared/qr/services/types.ts` | Add `ImportResolution` |
| Modify `src/lib/shared/qr/services/short-code-manager.ts` | Add `resolveForImport(code, currentUserId)` |
| Create `src/lib/shared/qr/services/__tests__/resolve-for-import.test.ts` | Strategy-order + fork tests |
| Create `src/lib/shared/qr/services/tka-qr-detector.ts` | barcode-detector wrapper, WASM locateFile → `/zxing/` |
| Create `static/zxing/zxing_reader.wasm` | Self-hosted decoder binary (copied from node_modules) |
| Create `src/lib/features/browse/collections/components/ScanCardSheet.svelte` | The Drawer: camera, loop, add pipeline |
| Modify `src/lib/features/browse/collections/components/CollectionDetailView.svelte` | Scan button (header + empty state), sheet mount |

---

### Task 1: `extractScanCode` (pure function, TDD)

**Files:**
- Create: `src/lib/shared/qr/services/extract-scan-code.ts`
- Test: `src/lib/shared/qr/services/__tests__/extract-scan-code.test.ts`

Card QRs encode `HTTPS://TKA.RUN/{CODE}` with optional `?bp/rp/vm` params (see `short-code-manager.ts` `buildUrlWithOptions`). Codes are 4–6 char base36 uppercase. Legacy self-contained payloads start `s~` and must pass through untouched (the resolver decodes them directly).

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/shared/qr/services/__tests__/extract-scan-code.test.ts
import { describe, it, expect } from "vitest";
import { extractScanCode } from "../extract-scan-code";

describe("extractScanCode", () => {
	it("extracts the code from the canonical card URL", () => {
		expect(extractScanCode("HTTPS://TKA.RUN/AB3D")).toBe("AB3D");
	});

	it("tolerates lowercase and prop/view params", () => {
		expect(extractScanCode("https://tka.run/ab3d?bp=S&rp=F&vm=hsb")).toBe("AB3D");
	});

	it("tolerates the /q/ spotlight route form", () => {
		expect(extractScanCode("https://tka.run/q/AB3D")).toBe("AB3D");
	});

	it("accepts 5- and 6-char bumped codes", () => {
		expect(extractScanCode("https://tka.run/AB3DE")).toBe("AB3DE");
		expect(extractScanCode("https://tka.run/AB3DEF")).toBe("AB3DEF");
	});

	it("passes inline s~ payloads through unchanged (no uppercasing)", () => {
		expect(extractScanCode("s~r1:abcXYZ")).toBe("s~r1:abcXYZ");
		expect(extractScanCode("https://tka.run/s~r1:abcXYZ")).toBe("s~r1:abcXYZ");
	});

	it("accepts a bare code", () => {
		expect(extractScanCode("ab3d")).toBe("AB3D");
	});

	it("rejects foreign hosts", () => {
		expect(extractScanCode("https://evil.com/AB3D")).toBeNull();
	});

	it("rejects non-code content", () => {
		expect(extractScanCode("hello world")).toBeNull();
		expect(extractScanCode("")).toBeNull();
		expect(extractScanCode("https://tka.run/")).toBeNull();
		expect(extractScanCode("ABC")).toBeNull(); // 3 chars — below minimum
		expect(extractScanCode("ABCDEFG")).toBeNull(); // 7 chars — above maximum
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/shared/qr/services/__tests__/extract-scan-code.test.ts`
Expected: FAIL — cannot resolve `../extract-scan-code`

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/shared/qr/services/extract-scan-code.ts
/**
 * Turn whatever a scanned QR contains into something the short-code resolver
 * understands. Printed TKA cards encode HTTPS://TKA.RUN/{CODE} (optionally
 * with ?bp/rp/vm prop params); legacy offline QRs carried a self-contained
 * "s~..." payload. Anything else — someone pointed the scanner at a random
 * QR — returns null and the scan loop just keeps looking.
 */

const TKA_HOSTS = new Set(["tka.run", "www.tka.run"]);

/** Short codes are 4–6 char base36 (see short-code-manager MIN_CODE_LENGTH). */
function isValidCode(candidate: string): boolean {
	return /^[0-9a-zA-Z]{4,6}$/.test(candidate);
}

export function extractScanCode(rawValue: string): string | null {
	const raw = rawValue.trim();
	if (!raw) return null;

	// Self-contained payload, bare. Case matters inside — never uppercase it.
	if (raw.toLowerCase().startsWith("s~")) return raw;

	let url: URL | null = null;
	try {
		url = new URL(raw);
	} catch {
		url = null;
	}

	if (url) {
		if (!TKA_HOSTS.has(url.hostname.toLowerCase())) return null;
		const segments = url.pathname.split("/").filter(Boolean);
		// Both TKA.RUN/{code} and tka.run/q/{code} appear in the wild.
		const candidate = segments[0]?.toLowerCase() === "q" ? (segments[1] ?? "") : (segments[0] ?? "");
		if (candidate.toLowerCase().startsWith("s~")) return candidate;
		return isValidCode(candidate) ? candidate.toUpperCase() : null;
	}

	return isValidCode(raw) ? raw.toUpperCase() : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/shared/qr/services/__tests__/extract-scan-code.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/qr/services/extract-scan-code.ts src/lib/shared/qr/services/__tests__/extract-scan-code.test.ts
git commit -m "feat(qr): extractScanCode — QR rawValue to short code" -- src/lib/shared/qr/services/extract-scan-code.ts src/lib/shared/qr/services/__tests__/extract-scan-code.test.ts
```

---

### Task 2: `ShortCodeManager.resolveForImport` (TDD)

**Files:**
- Modify: `src/lib/shared/qr/services/types.ts` (append at end)
- Modify: `src/lib/shared/qr/services/short-code-manager.ts` (add method after `resolveShortCode`, ~line 524)
- Test: `src/lib/shared/qr/services/__tests__/resolve-for-import.test.ts`

Why a second resolver: `resolveShortCode` prefers the self-contained encoded blob (fastest for VIEWING) and returns `id: code` — useless as a collection member, because `getCollectionSequences` resolves members against own + public Firestore sequence docs. Filing wants IDENTITY: doc-backed strategies first, blob last. A direct-doc hit is only referenceable when the member-loader will actually find it later — own doc or public doc; a foreign private doc would become an invisible member, so it feeds the copy path instead.

- [ ] **Step 1: Add the `ImportResolution` type**

Append to `src/lib/shared/qr/services/types.ts`:

```ts

// --- resolveForImport ---
export interface ImportResolution {
	/** Fully hydrated sequence. When docBacked, its id is a Firestore sequence
	 *  doc id a collection can reference directly. */
	sequence: import("$lib/shared/foundation/domain/models/sequence-data").SequenceData;
	/** True when a referenceable doc backs this card (own or public). False =
	 *  self-contained data only; the caller must import a copy before filing. */
	docBacked: boolean;
}
```

- [ ] **Step 2: Write the failing test**

```ts
// src/lib/shared/qr/services/__tests__/resolve-for-import.test.ts
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
vi.mock("$lib/shared/auth/firebase", () => ({
	getFirestoreInstance: vi.fn(async () => ({})),
}));
vi.mock("$lib/shared/navigation/services/sequence-encoder", () => ({
	encodeSequenceForQR: vi.fn(),
	isInlineEncoded: (s: string) => s.startsWith("s~"),
	decodeSequenceFromQR: vi.fn(async (payload: string) => ({
		id: "",
		word: `decoded:${payload}`,
		steps: [{ id: "step1" }],
	})),
}));

import { ShortCodeManager } from "../short-code-manager";

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
		{ get: vi.fn(async () => null), getMany: vi.fn(async () => new Map()), set: vi.fn() } as never,
	);
	// Drive the record via the Firestore doc read the manager performs.
	getDocMock.mockImplementation(async (ref: { path?: string }) => {
		if (ref?.path?.startsWith("users/")) {
			// direct-doc strategy — configured per-test via directDoc
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

let directDoc: Record<string, unknown> | null = null;

beforeEach(() => {
	getDocMock.mockReset();
	directDoc = null;
});

describe("resolveForImport", () => {
	it("prefers the public index and marks it docBacked", async () => {
		const { manager } = makeManager({
			record: { sequence: "KAKA", sequenceId: "seq-1", encoded: "s~blob" },
			publicHit: { id: "seq-1", word: "KAKA", steps: [{}] },
		});
		const result = await manager.resolveForImport("AB3D", "me");
		expect(result).toEqual({ sequence: { id: "seq-1", word: "KAKA", steps: [{}] }, docBacked: true });
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

	it("falls back to embedded sequenceData as NOT docBacked", async () => {
		const { manager } = makeManager({
			record: { sequence: "KAKA", sequenceData: { word: "KAKA", steps: [{ id: "s1" }] } },
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
			record: { sequence: "KAKA", sequenceId: "seq-direct", ownerId: "someone-else" },
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
		// static snapshot fetch will also fail in the test env (no fetch of real URLs)
		const result = await manager.resolveForImport("ZZZZ", "me");
		expect(result).toBeNull();
	});
});
```

Note: the static-snapshot fallback calls `fetch` — in vitest (node env) those URLs fail and the method returns null, which is what the last test asserts. If the suite's environment stubs `fetch` globally, add `vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })))` in `beforeEach`.

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run src/lib/shared/qr/services/__tests__/resolve-for-import.test.ts`
Expected: FAIL — `resolveForImport is not a function`

- [ ] **Step 4: Implement `resolveForImport`**

In `src/lib/shared/qr/services/short-code-manager.ts`:

Extend the types import at the top of the file:

```ts
import type { ShortCodeRecord, CreateShortCodeResult, ShortCodeURLOptions, ImportResolution } from "./types";
```

Insert this method directly AFTER `resolveShortCode` (after its closing brace, before `resolveFromFirestore`):

```ts
	/**
	 * Resolve a scanned card for FILING into a collection, not viewing.
	 *
	 * resolveShortCode prefers the self-contained encoded blob (fastest to
	 * show) and returns id = code — but a collection member must be a
	 * Firestore sequence doc the member-loader can find later (own or
	 * public). So this resolver runs identity-first: public index, then
	 * sequenceId-as-word, then direct doc load; the blob and embedded data
	 * come last and are flagged docBacked: false so the caller knows to
	 * import a copy before filing.
	 */
	async resolveForImport(
		code: string,
		currentUserId: string | null
	): Promise<ImportResolution | null> {
		// Self-contained payload: nothing to reference, always a copy.
		if (isInlineEncoded(code)) {
			try {
				return { sequence: await decodeSequenceFromQR(code), docBacked: false };
			} catch (error) {
				console.error("[ShortCode] Failed to decode inline sequence:", error);
				return null;
			}
		}

		let data: ShortCodeData | null = null;
		try {
			data = await this.resolveFromFirestore(code);
		} catch (error) {
			console.warn(`[ShortCode] Firebase unavailable for "${code}", trying static fallback:`, error);
		}
		if (!data) data = await this.resolveFromStaticSnapshot(code);
		if (!data) return null;

		// Strategy: public index by stored word + sequenceId.
		try {
			const bySeq = await this.browseLoader.loadFullSequenceData(data.sequence, data.sequenceId);
			if (bySeq) return { sequence: bySeq, docBacked: true };
		} catch {
			// fall through
		}

		// Strategy: sequenceId as the (simplified) word.
		if (data.sequenceId && data.sequenceId !== data.sequence) {
			try {
				const byId = await this.browseLoader.loadFullSequenceData(data.sequenceId, data.sequenceId);
				if (byId) return { sequence: byId, docBacked: true };
			} catch {
				// fall through
			}
		}

		// Strategy: direct doc load. Referenceable only when the collection
		// member-loader will find it later — the user's own doc, or a public
		// one. A foreign private doc would file as an invisible member, so it
		// feeds the copy path instead (we still use its full data).
		if (data.ownerId && data.sequenceId) {
			try {
				const firestore = await this.ensureFirestore();
				const directSnap = await getDoc(
					doc(firestore, `users/${data.ownerId}/sequences/${data.sequenceId}`)
				);
				if (directSnap.exists()) {
					const seqData = directSnap.data();
					const referenceable =
						data.ownerId === currentUserId || seqData["visibility"] === "public";
					return {
						sequence: { ...seqData, id: directSnap.id, ownerId: data.ownerId } as SequenceData,
						docBacked: referenceable,
					};
				}
			} catch (error) {
				console.error(`[ShortCode] Direct load failed for "${code}":`, error);
			}
		}

		// Self-contained fallbacks — data exists but no referenceable doc.
		if (data.encoded) {
			try {
				const decoded = await decodeSequenceFromQR(data.encoded);
				return { sequence: { ...decoded, id: code } as SequenceData, docBacked: false };
			} catch {
				// fall through
			}
		}
		if (data.sequenceData) {
			return { sequence: createSequenceData({ id: code, ...data.sequenceData }), docBacked: false };
		}

		console.error(`[ShortCode] ✗ resolveForImport: all strategies failed for "${code}"`);
		return null;
	}
```

(`isInlineEncoded`, `decodeSequenceFromQR`, `createSequenceData`, `getDoc`, `doc` are already imported at the top of the file.)

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/lib/shared/qr/services/__tests__/resolve-for-import.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Regression — existing shortcode tests still pass**

Run: `npx vitest run src/lib/shared/qr`
Expected: PASS (includes `short-code-cache.test.ts`)

- [ ] **Step 7: Commit**

```bash
git add src/lib/shared/qr/services/types.ts src/lib/shared/qr/services/short-code-manager.ts src/lib/shared/qr/services/__tests__/resolve-for-import.test.ts
git commit -m "feat(qr): resolveForImport — identity-first card resolution for filing" -- src/lib/shared/qr/services/types.ts src/lib/shared/qr/services/short-code-manager.ts src/lib/shared/qr/services/__tests__/resolve-for-import.test.ts
```

---

### Task 3: QR detector — dependency, self-hosted WASM, wrapper

**Files:**
- Modify: `package.json` (+ lockfile, via npm)
- Create: `static/zxing/zxing_reader.wasm` (binary copy)
- Create: `src/lib/shared/qr/services/tka-qr-detector.ts`

- [ ] **Step 1: Install**

Run: `npm install barcode-detector`
Expected: adds `barcode-detector` (+ transitive `zxing-wasm`) to package.json.

- [ ] **Step 2: Verify the package's actual export surface**

Read `node_modules/barcode-detector/README.md` and `node_modules/barcode-detector/package.json` `exports` field. Confirm:
1. The side-effect-free subpath — expected `barcode-detector/ponyfill` (older docs call it `pure`; use whichever the installed version exports).
2. That it re-exports `prepareZXingModule` and its options shape (`overrides.locateFile`).
3. The reader WASM path inside `node_modules/zxing-wasm/dist/` (expected `reader/zxing_reader.wasm`).

Adjust the import path / filename in Steps 3–4 to whatever the installed version actually ships. Do NOT guess from memory.

- [ ] **Step 3: Self-host the WASM**

```bash
mkdir -p static/zxing
cp node_modules/zxing-wasm/dist/reader/zxing_reader.wasm static/zxing/
```

(Adjust source path per Step 2. `static/` is served at `/`, same as `static/draco/`.)

- [ ] **Step 4: Write the wrapper**

```ts
// src/lib/shared/qr/services/tka-qr-detector.ts
/**
 * QR detection for printed TKA cards.
 *
 * Wraps the `barcode-detector` ponyfill (ZXing-C++ WebAssembly; delegates to
 * the platform's native BarcodeDetector engine where one exists). The WASM
 * binary is SELF-HOSTED under static/zxing/ — the package's default is a
 * jsDelivr CDN fetch at runtime, which would break offline scanning and tie
 * the feature to a third-party CDN. Same discipline as the Draco decoder in
 * static/draco/.
 */
import { BarcodeDetector, prepareZXingModule } from "barcode-detector/ponyfill";

let prepared = false;

export interface TkaQrDetector {
	/** Raw string contents of every QR found in the frame. */
	detect(frame: ImageData): Promise<string[]>;
}

export function createTkaQrDetector(): TkaQrDetector {
	if (!prepared) {
		prepared = true;
		prepareZXingModule({
			overrides: {
				locateFile: (path: string, prefix: string) =>
					path.endsWith(".wasm") ? `/zxing/${path}` : prefix + path,
			},
		});
	}

	const detector = new BarcodeDetector({ formats: ["qr_code"] });

	return {
		async detect(frame: ImageData): Promise<string[]> {
			const results = await detector.detect(frame);
			return results.map((r) => r.rawValue);
		},
	};
}
```

- [ ] **Step 5: Type-check the new module**

Run: `npm run check:fast > "/tmp/scan-check.log" 2>&1; grep -i "tka-qr-detector" "/tmp/scan-check.log" || echo "CLEAN"`
Expected: `CLEAN` (baseline errors in other sessions' files are expected and ignored — only tka-qr-detector matters here).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json static/zxing/zxing_reader.wasm src/lib/shared/qr/services/tka-qr-detector.ts
git commit -m "feat(qr): barcode-detector ponyfill + self-hosted zxing wasm" -- package.json package-lock.json static/zxing/zxing_reader.wasm src/lib/shared/qr/services/tka-qr-detector.ts
```

---

### Task 4: `ScanCardSheet.svelte`

**Files:**
- Create: `src/lib/features/browse/collections/components/ScanCardSheet.svelte`

The Drawer host. Follows `AddSequencesSheet.svelte` (same directory) exactly for: mount-closed + rAF-open animation, `requestClose()` slide-out before parent unmount, placement via `responsiveLayoutManager`, nav hiding via `browseScrollState`.

- [ ] **Step 1: Write the component**

```svelte
<!--
ScanCardSheet.svelte

File physical cards into this collection. A Drawer (bottom sheet on mobile,
right panel on desktop) holds a rear-camera viewfinder; every TKA card QR
that enters the frame is resolved and added to the collection — haptic +
toast per card, running count in the header. Continuous: hold the sheet
open and work through the whole stack.

Cards resolve identity-first (resolveForImport): a card backed by a real
sequence doc is added as a reference; a card whose data lives only in its
shortcode record (printed deck cards) is silently saved as a private copy
to My Library first, then filed. Either way the user sees one behavior:
scan → added. There is no rejection state — every printed card exists in
the system by construction.

Filing scans deliberately write NO scan analytics (scanCount/scanEvents
mean "card discovered in the wild"; filing your own deck would pollute
the geo dashboard).
-->
<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
	import { CameraManager } from "$lib/shared/train/services/camera-manager";
	import { createTkaQrDetector, type TkaQrDetector } from "$lib/shared/qr/services/tka-qr-detector";
	import { extractScanCode } from "$lib/shared/qr/services/extract-scan-code";
	import { getShortCodeManager } from "$lib/shared/qr/get-short-code-manager";
	import { getLibraryRepository } from "$lib/shared/library/get-library-repository";
	import { addSequenceToCollection } from "$lib/shared/library/services/collection-manager";
	import { collectionsState } from "$lib/features/library/state/collections-state.svelte";
	import { LIBRARY_LIMITS } from "$lib/shared/library/data/firestore-paths";
	import { LibraryError } from "$lib/shared/library/domain/library-error";
	import { authState } from "$lib/shared/auth/state/auth-state.svelte";
	import { toast } from "$lib/shared/toast/state/toast-state.svelte";
	import { browseScrollState } from "$lib/shared/browse/state/browse-scroll-state.svelte";
	import { responsiveLayoutManager } from "$lib/shared/create/services/responsive-layout-manager";
	import { getHapticFeedback } from "$lib/shared/application/get-haptic-feedback";

	let {
		collectionId,
		onClose,
	}: {
		collectionId: string;
		onClose: () => void;
	} = $props();

	$effect(() => {
		collectionsState.ensureStarted();
	});

	const target = $derived(
		collectionsState.collections.find((c) => c.id === collectionId) ?? null,
	);

	// Drawer plumbing — AddSequencesSheet's exact pattern.
	let drawerOpen = $state(false);
	let isSideBySide = $state(false);
	let layoutUnsubscribe: (() => void) | null = null;
	const placement = $derived(isSideBySide ? "right" : "bottom");

	const CLOSE_ANIMATION_MS = 300;
	function requestClose() {
		if (!drawerOpen) return;
		drawerOpen = false;
		setTimeout(onClose, CLOSE_ANIMATION_MS);
	}

	// Camera + detection.
	const camera = new CameraManager();
	let detector: TkaQrDetector | null = null;
	let videoHost = $state<HTMLDivElement | null>(null);
	let cameraError = $state<string | null>(null);
	let cameraReady = $state(false);

	// Session bookkeeping.
	let addedCount = $state(0);
	const seen = new Set<string>();
	let processing = false; // one hit at a time; also pauses detection ticks
	let scanTimer: ReturnType<typeof setInterval> | null = null;
	const SCAN_INTERVAL_MS = 200;

	async function startCamera() {
		cameraError = null;
		cameraReady = false;
		try {
			// 1280×720: dense QR modules need more pixels than the 640 default.
			await camera.initialize({ facingMode: "environment", width: 1280, height: 720 });
			await camera.start();
			const video = camera.getVideoElement();
			if (video && videoHost) {
				video.classList.add("viewfinder-video");
				videoHost.replaceChildren(video);
			}
			cameraReady = true;
		} catch (err) {
			// CameraManager maps NotAllowedError/NotFoundError/NotReadableError
			// to user-readable messages already.
			cameraError = err instanceof Error ? err.message : "Couldn't access your camera.";
		}
	}

	async function tick() {
		if (processing || cameraError || !camera.isActive || !detector) return;
		const frame = camera.captureFrame();
		if (!frame) return;
		processing = true;
		try {
			const rawValues = await detector.detect(frame);
			for (const raw of rawValues) {
				const code = extractScanCode(raw);
				if (code) {
					await handleHit(code);
					break; // one card per frame
				}
			}
		} catch {
			// Per-frame decode noise — keep scanning.
		} finally {
			processing = false;
		}
	}

	async function handleHit(code: string) {
		if (seen.has(code)) return;
		seen.add(code);

		try {
			const resolution = await getShortCodeManager().resolveForImport(
				code,
				authState.effectiveUserId ?? null,
			);
			if (!resolution) {
				seen.delete(code); // re-aiming retries
				toast.error("Couldn't read that card — try again.");
				return;
			}

			const word =
				resolution.sequence.word || resolution.sequence.name || "Sequence";
			let targetId = resolution.sequence.id;

			if (!resolution.docBacked) {
				// No referenceable doc behind this card (printed deck cards):
				// save a private copy to My Library, file that. Silent — the
				// user asked to keep the card, and now they do.
				try {
					const saved = await getLibraryRepository().saveSequence(
						resolution.sequence,
						{ visibility: "private" },
					);
					targetId = saved.id;
				} catch (err) {
					if (err instanceof LibraryError && err.code === "ALREADY_EXISTS") {
						// Identical content already lives in the library under another
						// id (e.g. two different printed cards of the same sequence).
						// We can't cheaply recover that id — tell the user instead of
						// importing a duplicate.
						toast.info(`"${word}" is already in your library.`);
						return;
					}
					throw err;
				}
			}

			if (collectionsState.isIn(targetId, collectionId)) {
				toast.info(`"${word}" is already in ${target?.name ?? "this collection"}.`);
				return;
			}

			if (
				target &&
				target.sequenceCount >= LIBRARY_LIMITS.MAX_SEQUENCES_PER_COLLECTION
			) {
				toast.error(
					`"${target.name}" is full (${LIBRARY_LIMITS.MAX_SEQUENCES_PER_COLLECTION} max).`,
				);
				return;
			}

			await addSequenceToCollection(collectionId, targetId);
			addedCount += 1;
			getHapticFeedback()?.trigger("selection");
			toast.success(`"${word}" added ✓`);
		} catch (err) {
			seen.delete(code);
			console.error("[ScanCard] add failed:", err);
			toast.error("Couldn't add that card — try again.");
		}
	}

	onMount(() => {
		isSideBySide = responsiveLayoutManager.shouldUseSideBySideLayout();
		layoutUnsubscribe = responsiveLayoutManager.onLayoutChange(() => {
			isSideBySide = responsiveLayoutManager.shouldUseSideBySideLayout();
		});

		// Focus mode: picking through a physical stack, chrome is noise.
		browseScrollState.hideUI();

		detector = createTkaQrDetector();
		void startCamera();
		scanTimer = setInterval(() => void tick(), SCAN_INTERVAL_MS);

		requestAnimationFrame(() => {
			drawerOpen = true;
		});

		return () => {
			if (scanTimer) clearInterval(scanTimer);
			camera.stop(); // release the camera the moment the sheet goes
			browseScrollState.showUI();
		};
	});

	onDestroy(() => layoutUnsubscribe?.());

	function countLabel(n: number): string {
		return `${n} ${n === 1 ? "card" : "cards"} added`;
	}
</script>

<Drawer
	isOpen={drawerOpen}
	{placement}
	closeOnBackdrop={true}
	closeOnEscape={true}
	dismissible={true}
	showHandle={placement === "bottom"}
	ariaLabel="Scan cards"
	class="scan-card-drawer"
	onOpenChange={(open) => {
		if (!open) requestClose();
	}}
>
	<div class="sheet-content">
		<header class="panel-header">
			<div class="header-text">
				<h2 class="panel-title">Scan into {target?.name ?? "collection"}</h2>
				<span class="panel-count">{countLabel(addedCount)}</span>
			</div>
			<button type="button" class="done-btn" onclick={requestClose}>
				<i class="fas fa-check" aria-hidden="true"></i>
				<span>Done</span>
			</button>
		</header>

		<div class="viewfinder">
			{#if cameraError}
				<div class="camera-error" role="alert">
					<i class="fas fa-video-slash" aria-hidden="true"></i>
					<p>{cameraError}</p>
					<button type="button" class="retry-btn" onclick={() => void startCamera()}>
						<i class="fas fa-rotate-right" aria-hidden="true"></i>
						<span>Try again</span>
					</button>
				</div>
			{:else}
				<div class="video-host" bind:this={videoHost}></div>
				{#if !cameraReady}
					<div class="camera-starting" role="status">
						<i class="fas fa-camera" aria-hidden="true"></i>
						<p>Starting camera…</p>
					</div>
				{/if}
				<p class="scan-hint">Point at a card's QR code</p>
			{/if}
		</div>
	</div>
</Drawer>

<style>
	:global(.scan-card-drawer[data-placement="bottom"]) {
		height: 80dvh;
		--sheet-max-height: 80dvh;
	}

	:global(.scan-card-drawer[data-placement="right"]) {
		--sheet-width: min(480px, 94vw);
	}

	.sheet-content {
		display: flex;
		flex-direction: column;
		height: 100%;
		min-height: 0;
		overflow: hidden;
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 8px 16px 12px;
		border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
		flex-shrink: 0;
	}

	.header-text {
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}

	.panel-title {
		margin: 0;
		font-size: var(--font-size-lg, 18px);
		font-weight: 700;
		color: var(--theme-text, white);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.panel-count {
		font-size: var(--font-size-compact, 12px);
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.65));
		font-variant-numeric: tabular-nums;
	}

	.done-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 44px;
		padding: 0 18px;
		flex-shrink: 0;
		border: 1px solid color-mix(in srgb, var(--theme-accent) 45%, transparent);
		border-radius: 12px;
		background: color-mix(in srgb, var(--theme-accent) 22%, transparent);
		color: var(--theme-text, white);
		font-size: var(--font-size-sm, 14px);
		font-weight: 600;
		cursor: pointer;
		transition: background var(--duration-fast, 150ms) ease;
	}

	.done-btn:hover {
		background: color-mix(in srgb, var(--theme-accent) 34%, transparent);
	}

	.done-btn:focus-visible {
		outline: 2px solid var(--theme-accent);
		outline-offset: 2px;
	}

	.viewfinder {
		position: relative;
		flex: 1;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		background: black;
		overflow: hidden;
	}

	.video-host {
		position: absolute;
		inset: 0;
	}

	.video-host :global(.viewfinder-video) {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.scan-hint {
		position: absolute;
		bottom: 16px;
		left: 50%;
		transform: translateX(-50%);
		margin: 0;
		padding: 8px 16px;
		border-radius: 999px;
		background: rgba(0, 0, 0, 0.55);
		color: white;
		font-size: var(--font-size-sm, 14px);
		white-space: nowrap;
		pointer-events: none;
	}

	.camera-starting,
	.camera-error {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 24px;
		color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
		text-align: center;
	}

	.camera-starting i,
	.camera-error i {
		font-size: 28px;
		opacity: 0.6;
	}

	.camera-starting p,
	.camera-error p {
		margin: 0;
		max-width: 320px;
		font-size: var(--font-size-sm, 14px);
		line-height: 1.5;
	}

	.retry-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 44px;
		padding: 0 18px;
		margin-top: 4px;
		border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
		border-radius: 12px;
		background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
		color: var(--theme-text, white);
		font-size: var(--font-size-sm, 14px);
		font-weight: 600;
		cursor: pointer;
	}

	.retry-btn:focus-visible {
		outline: 2px solid var(--theme-accent);
		outline-offset: 2px;
	}

	@media (prefers-reduced-motion: reduce) {
		.done-btn {
			transition: none;
		}
	}
</style>
```

- [ ] **Step 2: Type-check**

Run: `npm run check:fast > "/tmp/scan-check2.log" 2>&1; grep -i "ScanCardSheet" "/tmp/scan-check2.log" || echo "CLEAN"`
Expected: `CLEAN`. If `camera-manager` import errors: the class is exported from `$lib/shared/train/services/camera-manager` (verified) — check the exact import name against the file.

- [ ] **Step 3: Commit**

```bash
git add src/lib/features/browse/collections/components/ScanCardSheet.svelte
git commit -m "feat(collections): ScanCardSheet — continuous camera filing of printed cards" -- src/lib/features/browse/collections/components/ScanCardSheet.svelte
```

---

### Task 5: Wire into `CollectionDetailView`

**Files:**
- Modify: `src/lib/features/browse/collections/components/CollectionDetailView.svelte`

Four surgical edits. This file is owned by the collections session (clean at last commit) — still commit with explicit pathspec.

- [ ] **Step 1: Import + state**

After the `AddSequencesSheet` import (line ~37):

```ts
	import ScanCardSheet from "./ScanCardSheet.svelte";
```

After `let addSheetOpen = $state(false);` (line ~181):

```ts
	let scanSheetOpen = $state(false);
```

- [ ] **Step 2: Header button**

Directly after the existing Add button's `{#if}` block (the one gated `collection && !renaming && !foreignOwnerId`), add a sibling block with the same gate:

```svelte
		{#if collection && !renaming && !foreignOwnerId}
			<button
				type="button"
				class="scan-btn"
				onclick={() => (scanSheetOpen = true)}
			>
				<i class="fas fa-qrcode" aria-hidden="true"></i>
				<span>Scan</span>
			</button>
		{/if}
```

- [ ] **Step 3: Empty-state CTA**

Inside the empty state's `{#if !foreignOwnerId}` block, after the existing `.empty-cta` button:

```svelte
					<button
						type="button"
						class="empty-cta"
						onclick={() => (scanSheetOpen = true)}
					>
						<i class="fas fa-qrcode" aria-hidden="true"></i>
						<span>Scan a card</span>
					</button>
```

- [ ] **Step 4: Sheet mount**

After the `AddSequencesSheet` mount at the bottom of the template:

```svelte
{#if scanSheetOpen && !foreignOwnerId}
	<ScanCardSheet {collectionId} onClose={() => (scanSheetOpen = false)} />
{/if}
```

- [ ] **Step 5: Button style**

In the `<style>` block, after the `.add-btn:focus-visible` rule — same look as `.add-btn`, minus the `margin-left: auto` (Add stays the first right-aligned control):

```css
	.scan-btn {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 44px;
		padding: 0 16px;
		flex-shrink: 0;
		border: 1px solid color-mix(in srgb, var(--tile-color) 45%, transparent);
		border-radius: 12px;
		background: color-mix(in srgb, var(--tile-color) 18%, transparent);
		color: var(--theme-text, white);
		font-size: var(--font-size-sm, 14px);
		font-weight: 600;
		cursor: pointer;
		transition: background var(--duration-fast, 150ms) ease;
	}

	.scan-btn:hover {
		background: color-mix(in srgb, var(--tile-color) 30%, transparent);
	}

	.scan-btn:focus-visible {
		outline: 2px solid var(--tile-color);
		outline-offset: 2px;
	}
```

Also add `.scan-btn` to the reduced-motion block alongside `.back-btn, .options-btn`.

- [ ] **Step 6: Type-check + SSR smoke**

Run: `npm run check:fast > "/tmp/scan-check3.log" 2>&1; grep -iE "CollectionDetailView|ScanCardSheet" "/tmp/scan-check3.log" || echo "CLEAN"`
Expected: `CLEAN`
Run: `curl -sk -o /dev/null -w "%{http_code}" https://localhost:5173/browse`
Expected: `200`

- [ ] **Step 7: Commit**

```bash
git add src/lib/features/browse/collections/components/CollectionDetailView.svelte
git commit -m "feat(collections): Scan button — file physical cards from the detail view" -- src/lib/features/browse/collections/components/CollectionDetailView.svelte
```

---

### Task 6: Full verification + handoff

- [ ] **Step 1: Full unit-test pass over touched areas**

Run: `npx vitest run src/lib/shared/qr src/lib/features/library`
Expected: all PASS (qr suites + collections-state's 14).

- [ ] **Step 2: One full check, filtered to our files**

Run: `npm run check > "/tmp/scan-full-check.log" 2>&1; grep -iE "scan-card|extract-scan|tka-qr|resolve-for-import|short-code-manager|CollectionDetailView" "/tmp/scan-full-check.log" || echo "CLEAN"`
Expected: `CLEAN`. Baseline errors in other sessions' files (StepData migration churn) are expected — confirm none are in the files this plan touched.

- [ ] **Step 3: Report + device handoff**

Camera cannot be verified without a device. Final message to Austen must state exactly:
- What shipped (commits listed)
- Test evidence (vitest counts, check filter results, SSR 200)
- The handoff: *"I cannot verify the camera visually. On your phone: open a collection → Scan → point at a printed card. Expect: sheet slides up, rear camera live, card adds with a toast + count tick, second scan of the same card says 'already in', Done closes and releases the camera."*
- Standing warning: do NOT push main (untracked `gallery-home` imports still block CF Pages build).
