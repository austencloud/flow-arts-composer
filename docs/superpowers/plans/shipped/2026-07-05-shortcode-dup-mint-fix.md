# Shortcode Duplicate-Mint Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make shortcode allocation idempotent — at most one code per `encoderHash`, every client converging on the same code — and backfill a hash→code index for the 17k existing codes.

**Architecture:** Single-flight allocation keyed by bare content hash (URL derived per caller), a transactional `shortcodeHashes/{hash}` index doc written atomically with each new code doc, deterministic oldest-`createdAt` pick for legacy duplicates, cache schema v2 storing code-only values, plus an admin backfill script.

**Tech Stack:** SvelteKit, Firebase Firestore (client SDK `runTransaction`, admin SDK for scripts), Vitest.

**Spec:** `docs/superpowers/specs/active/2026-07-05-shortcode-dup-mint-fix-design.md`

**Commit discipline:** every commit uses an explicit pathspec (`git commit -m "..." -- <paths>`), never bare `git commit`. Other agents share this tree.

---

### Task 1: Failing regression tests

**Files:**
- Create: `src/lib/shared/qr/services/__tests__/short-code-manager.test.ts`

- [ ] **Step 1: Write the test file**

The mock strategy mirrors `resolve-for-import.test.ts` (same directory): mock `firebase/firestore` at module level, drive behavior through a shared in-memory doc store. `runTransaction` executes its callback against the store with staged writes, matching real Firestore commit semantics closely enough to catch the race.

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

// In-memory Firestore fake. `store` maps "collection/id" → data. Transactions
// stage writes and apply them on successful completion, like the real SDK.
const store = new Map<string, Record<string, unknown>>();
let transactionRuns = 0;
let queryResults: Array<{ id: string; data: Record<string, unknown> }> = [];

vi.mock("firebase/firestore", () => ({
  addDoc: vi.fn(),
  collection: vi.fn((_db: unknown, name: string) => ({ collection: name })),
  doc: vi.fn((_db: unknown, ...segments: string[]) => ({
    path: segments.join("/"),
  })),
  getDoc: vi.fn(async (ref: { path: string }) => {
    const data = store.get(ref.path);
    return data
      ? { exists: () => true, id: ref.path.split("/").pop(), data: () => data }
      : { exists: () => false };
  }),
  setDoc: vi.fn(async (ref: { path: string }, data: Record<string, unknown>) => {
    store.set(ref.path, data);
  }),
  query: vi.fn(() => ({})),
  where: vi.fn(),
  getDocs: vi.fn(async () => ({
    empty: queryResults.length === 0,
    docs: queryResults.map((r) => ({ id: r.id, data: () => r.data })),
  })),
  updateDoc: vi.fn(),
  increment: vi.fn(),
  runTransaction: vi.fn(
    async (
      _db: unknown,
      fn: (tx: {
        get: (ref: { path: string }) => Promise<unknown>;
        set: (ref: { path: string }, data: Record<string, unknown>) => void;
      }) => Promise<unknown>
    ) => {
      transactionRuns++;
      const staged = new Map<string, Record<string, unknown>>();
      const result = await fn({
        get: async (ref) => {
          const data = staged.get(ref.path) ?? store.get(ref.path);
          return data
            ? { exists: () => true, data: () => data }
            : { exists: () => false };
        },
        set: (ref, data) => staged.set(ref.path, data),
      });
      for (const [path, data] of staged) store.set(path, data);
      return result;
    }
  ),
}));
vi.mock("$lib/shared/auth/firebase", () => ({
  getFirestoreInstance: vi.fn(async () => ({})),
}));
vi.mock("$lib/shared/navigation/services/sequence-encoder", () => ({
  encodeSequenceForQR: vi.fn(async () => "s~test-blob"),
  isInlineEncoded: (s: string) => s.startsWith("s~"),
  decodeSequenceFromQR: vi.fn(),
}));

import { ShortCodeManager } from "../short-code-manager";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

const SEQUENCE = {
  id: "seq-1",
  word: "TEST",
  ownerId: "user-1",
  steps: [{ id: "step-1" }],
} as unknown as SequenceData;

const hashMatcher = {
  computeEncoderHash: vi.fn(async () => "HASH_A"),
} as never;

function makeManager() {
  const browseLoader = { loadFullSequenceData: vi.fn(async () => null) };
  return new ShortCodeManager(browseLoader as never, hashMatcher);
}

function docsIn(collectionName: string): string[] {
  return [...store.keys()].filter((k) => k.startsWith(`${collectionName}/`));
}

beforeEach(() => {
  store.clear();
  transactionRuns = 0;
  queryResults = [];
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 404 })));
});

describe("ShortCodeManager allocation", () => {
  it("two concurrent calls with different options mint ONE code (the 2026-07-05 dup-mint race)", async () => {
    const manager = makeManager();
    // Exactly the two production call sites: overlay state (embed, no props)
    // and QR generator (lean, prop options). Pre-fix these used different
    // single-flight scopes and each wrote its own doc — 1,044 dup groups.
    const [a, b] = await Promise.all([
      manager.createShortCode(SEQUENCE, { embedSequenceData: true }),
      manager.createShortCode(SEQUENCE, { bluePropType: "C", redPropType: "C" }),
    ]);

    expect(a.code).toBe(b.code);
    expect(docsIn("shortcodes")).toHaveLength(1);
    expect(docsIn("shortcodeHashes")).toEqual([`shortcodeHashes/HASH_A`]);
    expect(store.get("shortcodeHashes/HASH_A")?.code).toBe(a.code);
    // Each caller still gets a URL shaped by its OWN options.
    expect(b.url).toContain("bp=C");
    expect(b.url).toContain("rp=C");
    expect(a.url).not.toContain("bp=");
  });

  it("adopts the code from an existing hash-index doc instead of minting", async () => {
    store.set("shortcodeHashes/HASH_A", { code: "OLD1" });
    const manager = makeManager();

    const result = await manager.createShortCode(SEQUENCE, {});

    expect(result.code).toBe("OLD1");
    expect(result.isNew).toBe(false);
    expect(docsIn("shortcodes")).toHaveLength(0);
  });

  it("picks the OLDEST doc when legacy duplicates exist for a hash", async () => {
    queryResults = [
      { id: "NEW1", data: { createdAt: "2026-06-01T00:00:00.000Z" } },
      { id: "OLD9", data: { createdAt: "2026-05-01T00:00:00.000Z" } },
    ];
    const manager = makeManager();

    const result = await manager.createShortCode(SEQUENCE, {});

    expect(result.code).toBe("OLD9");
    expect(result.isNew).toBe(false);
  });

  it("second sequential call resolves from cache without another transaction", async () => {
    const manager = makeManager();
    const first = await manager.createShortCode(SEQUENCE, {});
    const runsAfterFirst = transactionRuns;

    const second = await manager.createShortCode(SEQUENCE, {
      bluePropType: "F",
    });

    expect(second.code).toBe(first.code);
    expect(transactionRuns).toBe(runsAfterFirst);
    expect(second.url).toContain("bp=F");
  });
});
```

- [ ] **Step 2: Run tests, verify they fail against current code**

Run: `npx vitest run src/lib/shared/qr/services/__tests__/short-code-manager.test.ts`

Expected failures:
- race test: `a.code` ≠ `b.code` (two different codes minted) and/or `docsIn("shortcodes")` length 2, `shortcodeHashes` empty
- index-adopt test: fails — current code has no index concept, mints a fresh code
- oldest-pick test: fails — current code takes `docs[0]`, which is `NEW1` in the mock
- cache test: fails — current cache key includes `bp`, so second call misses and re-runs Firestore path

Do NOT commit yet — the failing tests commit together with the fix in Task 3.

---

### Task 2: Cache schema v2, code-only values

**Files:**
- Modify: `src/lib/shared/qr/services/short-code-cache.ts`
- Modify: `src/lib/shared/qr/services/__tests__/short-code-cache.test.ts`

- [ ] **Step 1: Change the schema constant and value shape**

In `short-code-cache.ts`:

```ts
/** Bump to invalidate every cached code (e.g. if the URL scheme changes).
 *  v2 (2026-07-05): values became code-only — URLs are derived per caller
 *  from their own options, and keys dropped the bp/rp/vm discriminants.
 *  The bump also flushes codes that diverged during the dup-mint-race era. */
export const SHORT_CODE_CACHE_SCHEMA = "v2";
```

```ts
export interface ShortCodeCacheValue {
  code: string;
}
```

- [ ] **Step 2: Remove `url` from every read/write path in the same file**

- `get` (line ~85): `const value: ShortCodeCacheValue = { code: entry.code };`
- `getMany` (line ~119): `const value: ShortCodeCacheValue = { code: entry.code };`
- `set` (line ~148): entry becomes
  ```ts
  const entry: CachedCodeEntry = {
    key,
    code: value.code,
    timestamp: Date.now(),
  };
  ```

`CachedCodeEntry extends ShortCodeCacheValue` picks up the shape change automatically. Old v1 IDB entries orphan under the old key prefix and get LRU-pruned; no `DB_VERSION` change needed (store schema is unchanged).

- [ ] **Step 3: Update the cache tests to the new value shape**

In `short-code-cache.test.ts`, replace every `{ code: ..., url: ... }` literal with `{ code: ... }`:

```ts
it("round-trips a set value", async () => {
  const cache = new ShortCodeCache();
  await cache.set("k1", { code: "AB12" });
  expect(await cache.get("k1")).toEqual({ code: "AB12" });
});

it("getMany returns only the keys that hit", async () => {
  const cache = new ShortCodeCache();
  await cache.set("hit-a", { code: "AAAA" });
  await cache.set("hit-b", { code: "BBBB" });

  const found = await cache.getMany(["hit-a", "miss", "hit-b"]);
  expect(found.size).toBe(2);
  expect(found.get("hit-a")).toEqual({ code: "AAAA" });
  expect(found.get("hit-b")).toEqual({ code: "BBBB" });
  expect(found.has("miss")).toBe(false);
});

it("clear drops memory entries", async () => {
  const cache = new ShortCodeCache();
  await cache.set("k", { code: "C" });
  await cache.clear();
  expect(await cache.get("k")).toBeNull();
});
```

(The "returns null for a miss" and "getMany on all-miss" tests are unchanged.)

- [ ] **Step 4: Run the cache tests**

Run: `npx vitest run src/lib/shared/qr/services/__tests__/short-code-cache.test.ts`
Expected: PASS. (`short-code-manager.ts` is now type-broken — fixed next task; do not run full check yet, do not commit yet.)

---

### Task 3: Manager allocation restructure

**Files:**
- Modify: `src/lib/shared/qr/services/short-code-manager.ts`

All changes in this one file. After it, Task 1's tests pass and Tasks 1–3 commit together.

- [ ] **Step 1: Add imports and the index-collection constant**

Add `setDoc` to the `firebase/firestore` import list. Below `SHORTCODES_COLLECTION` add:

```ts
/** Content-addressed index: shortcodeHashes/{encoderHash} → { code }.
 *  Written atomically with each new code doc; makes one-code-per-hash a
 *  transactional invariant instead of a best-effort pre-check query. */
const HASH_INDEX_COLLECTION = "shortcodeHashes";
```

- [ ] **Step 2: Re-key the in-flight map and simplify the cache key**

Replace the `inflightByKey` field declaration + comment (lines ~84–92):

```ts
/** In-flight single-flight cache keyed by BARE encoderHash (or `w:{id}`
 *  fallback). Every concurrent caller for the same sequence shares ONE
 *  allocation regardless of options/embed flags — the shared result is the
 *  CODE; each caller derives its own URL from its own options. (The old key
 *  included embedScope, which put the two page-load callers — overlay state
 *  and QR generator — in different scopes and let them race straight past
 *  each other: 1,044 duplicate docs by 2026-07-05.) */
private readonly inflightByKey = new Map<
  string,
  Promise<{ code: string; isNew: boolean }>
>();
```

Replace `buildCacheKey` (lines ~100–118):

```ts
/**
 * Cache key for a sequence's resolved code. Keyed by content hash (or word
 * fallback) ONLY — the code never varies with URL options, and URLs are
 * derived per caller. deckId/deckName/bp/rp/vm affect the stored record or
 * the URL, never the code.
 */
private buildCacheKey(hashOrWord: string): string {
  return `${SHORT_CODE_CACHE_SCHEMA}:${hashOrWord}`;
}
```

- [ ] **Step 3: Rewrite `createShortCode`**

Replace the body from the cache-short-circuit comment to the end of the method (lines ~219–256):

```ts
const allocKey = encoderHash ?? `w:${fallbackId}`;

// Persistent-cache short-circuit. A sequence's code is global + content-
// addressed, so once resolved it never changes — read it locally and skip
// the Firestore round-trip entirely. This is the cold-deck speed fix:
// ~380ms/card network query → memory/IDB read.
const cacheKey = this.buildCacheKey(allocKey);
const cached = await this.codeCache.get(cacheKey);
if (cached) {
  return {
    code: cached.code,
    url: this.buildUrlWithOptions(this.getBaseUrl(), cached.code, options),
    isNew: false,
  };
}

let inflight = this.inflightByKey.get(allocKey);
if (!inflight) {
  inflight = this.allocateCode(sequence, options, encoderHash, fallbackId)
    .then((result) => {
      // Write through the persistent cache so the next render (this
      // session or future) skips Firestore.
      void this.codeCache.set(cacheKey, { code: result.code });
      return result;
    })
    .finally(() => this.inflightByKey.delete(allocKey));
  this.inflightByKey.set(allocKey, inflight);
}

const { code, isNew } = await inflight;
return {
  code,
  url: this.buildUrlWithOptions(this.getBaseUrl(), code, options),
  isNew,
};
```

(The `embedScope` const and its comment are deleted. Note the winning caller's options still shape the stored record inside `allocateCode` — accepted per spec; the `encoded` blob is always written and is Strategy 0 of resolution.)

- [ ] **Step 4: Rename `createShortCodeInternal` → `allocateCode`, return `{ code, isNew }`, add the index transaction**

Signature and existing-code path (replaces lines ~337–381):

```ts
private async allocateCode(
  sequence: SequenceData,
  options: ShortCodeURLOptions | undefined,
  encoderHash: string | undefined,
  fallbackId: string | undefined
): Promise<{ code: string; isNew: boolean }> {
  const firestore = await this.ensureFirestore();

  // Check if this sequence already has a short code (by hash or word).
  // Catches codes created before the hash index existed and codes written
  // by other tabs/devices whose index doc hasn't been healed yet.
  const existingCode = encoderHash
    ? await this.findExistingCodeByHash(encoderHash)
    : await this.findExistingCode(fallbackId!);
  if (existingCode) {
    // ... ownerId/sequenceId backfill block UNCHANGED (lines 352-375) ...
    return { code: existingCode, isNew: false };
  }
```

The two other `return` sites change the same way:
- successful mint: `return { code, isNew: true };` (drop the `url` field)
- record building block (lines ~383–421): UNCHANGED.

Replace the allocation loop's transaction (lines ~424–463):

```ts
// Allocate a unique code. The transaction enforces BOTH invariants
// atomically: the code doc path is unclaimed (collision retry), and no
// other writer has claimed this hash (index doc). Two clients racing:
// both read a nonexistent index doc, both try to write it — Firestore's
// serializable transactions force the loser to retry, whose re-read then
// sees the winner and adopts its code instead of minting a duplicate.
const maxAttemptsPerLength = 10;
const maxCodeLength = MIN_CODE_LENGTH + 2;
let codeLength = MIN_CODE_LENGTH;
const indexRef = encoderHash
  ? doc(firestore, HASH_INDEX_COLLECTION, encoderHash)
  : null;

while (codeLength <= maxCodeLength) {
  for (let attempts = 0; attempts < maxAttemptsPerLength; attempts++) {
    const code = this.generateCode(codeLength);
    const docRef = doc(firestore, SHORTCODES_COLLECTION, code);

    let adoptedCode: string | null = null;
    try {
      await runTransaction(firestore, async (tx) => {
        if (indexRef) {
          const indexSnap = await tx.get(indexRef);
          if (indexSnap.exists()) {
            adoptedCode = (indexSnap.data() as { code: string }).code;
            return;
          }
        }
        const snap = await tx.get(docRef);
        if (snap.exists()) {
          throw new Error("__CODE_COLLISION__");
        }
        tx.set(docRef, record);
        if (indexRef) {
          tx.set(indexRef, { code, createdAt: record.createdAt });
        }
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "__CODE_COLLISION__") continue;
      throw err;
    }

    if (adoptedCode) return { code: adoptedCode, isNew: false };
    return { code, isNew: true };
  }

  codeLength++;
  console.warn(
    `[ShortCode] Exhausted ${maxAttemptsPerLength} attempts at length ${codeLength - 1}, bumping to ${codeLength}`
  );
}

throw new Error(
  "Failed to generate unique short code after exhausting all length tiers"
);
```

- [ ] **Step 5: Deterministic oldest pick + lazy index heal in `findExistingCodeByHash`**

Replace the method (lines ~493–506):

```ts
/**
 * Find an existing short code by encoderHash (content-addressed).
 *
 * Legacy data contains duplicate groups (pre-2026-07-05 mint race), so the
 * query can return several docs. Pick the OLDEST so every client converges
 * on the same code — `docs[0]` order is arbitrary and made two browsers
 * show different codes for the same sequence.
 */
private async findExistingCodeByHash(hash: string): Promise<string | null> {
  const firestore = await this.ensureFirestore();
  const q = query(
    collection(firestore, SHORTCODES_COLLECTION),
    where("encoderHash", "==", hash)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  let best = snapshot.docs[0]!;
  let bestCreated = (best.data() as ShortCodeData).createdAt ?? "";
  for (const d of snapshot.docs.slice(1)) {
    const created = (d.data() as ShortCodeData).createdAt ?? "";
    if (created < bestCreated) {
      best = d;
      bestCreated = created;
    }
  }

  // Lazy heal: point the hash index at the canonical code so future
  // allocations hit the transaction path directly. Fire-and-forget —
  // resolution must never block on it.
  void this.healHashIndex(hash, best.id);

  return best.id;
}

/** Best-effort create of the hash-index doc. The index is immutable after
 *  create (rules), so a lost race here just means another client healed it
 *  first — the warn is noise, not damage. */
private async healHashIndex(hash: string, code: string): Promise<void> {
  try {
    const firestore = await this.ensureFirestore();
    const ref = doc(firestore, HASH_INDEX_COLLECTION, hash);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, { code, createdAt: new Date().toISOString() });
    }
  } catch (error) {
    console.warn(`[ShortCode] hash-index heal failed for ${hash}:`, error);
  }
}
```

- [ ] **Step 6: Update `resolveCodesForDeck` to the new key/value shapes + oldest pick**

Three changes inside the method (lines ~268–335):

1. Cache-key computation (line ~284): `cacheKey: this.buildCacheKey(hashOrWord),` (drop the `options` argument).
2. Batch-query winner selection (lines ~313–317) — replace first-write-wins with oldest-wins:
   ```ts
   for (const docSnap of snap.docs) {
     const data = docSnap.data() as ShortCodeData;
     const hash = data.encoderHash;
     if (!hash) continue;
     const prev = hashToCode.get(hash);
     // Legacy duplicate groups: keep the OLDEST doc per hash so batch
     // resolution converges on the same canonical code as single lookups.
     if (!prev || (data.createdAt ?? "") < prev.createdAt) {
       hashToCode.set(hash, { code: docSnap.id, createdAt: data.createdAt ?? "" });
     }
   }
   ```
   and change the map's type at declaration (line ~302):
   ```ts
   const hashToCode = new Map<string, { code: string; createdAt: string }>();
   ```
3. Cache population (lines ~321–330):
   ```ts
   await Promise.all(
     misses.map((item) => {
       if (!item.hash) return Promise.resolve();
       const winner = hashToCode.get(item.hash);
       if (!winner) return Promise.resolve(); // genuinely new — created at render
       return this.codeCache.set(item.cacheKey, { code: winner.code });
     })
   );
   ```
   (`url` is no longer cached; the unused `buildUrlWithOptions` call goes away. The `options` parameter stays — callers still pass it, and it documents the URL contract — but it is now unused inside this method; prefix it `_options` if the linter complains.)

- [ ] **Step 7: Run the manager + cache tests**

Run: `npx vitest run src/lib/shared/qr/services/__tests__/`
Expected: ALL PASS — including Task 1's four new tests and the untouched `resolve-for-import.test.ts`.

- [ ] **Step 8: Targeted typecheck**

Run: `npm run check:fast`
Expected: no errors in `src/lib/shared/qr/**`. (Full `npm run check` happens once at Task 6 — commit gate, per fast-iteration rule.)

- [ ] **Step 9: Commit Tasks 1–3 together**

```bash
git add src/lib/shared/qr/services/short-code-manager.ts src/lib/shared/qr/services/short-code-cache.ts src/lib/shared/qr/services/__tests__/short-code-manager.test.ts src/lib/shared/qr/services/__tests__/short-code-cache.test.ts
git commit -m "fix(qr): one shortcode per sequence — kill duplicate-mint race

Single-flight now keys on bare encoderHash (embedScope split had put the
two page-load callers in different scopes since 2026-04-19 — 1,044 dup
groups). New shortcodeHashes/{hash} index doc written atomically with
each code doc makes one-code-per-hash transactional across devices.
Legacy duplicates: deterministic oldest-createdAt pick + lazy index
heal. Cache schema v2: code-only values, hash-only keys." -- src/lib/shared/qr/services/short-code-manager.ts src/lib/shared/qr/services/short-code-cache.ts src/lib/shared/qr/services/__tests__/short-code-manager.test.ts src/lib/shared/qr/services/__tests__/short-code-cache.test.ts
```

---

### Task 4: Security rules for the index collection

**Files:**
- Modify: `firestore.rules` (insert after the `match /shortcodes/{code}` block closes, line ~853, before the `scanEvents` collectionGroup block)

- [ ] **Step 1: Add the rules block**

```
    // Content-addressed shortcode index: one code per encoderHash.
    // Written atomically with the code doc inside the allocation transaction
    // (see 2026-07-05 shortcode-dup-mint-fix spec). Immutable after create —
    // first writer wins; the transaction's loser adopts the winner's code.
    match /shortcodeHashes/{hash} {
      // Public read: resolution paths and the allocation pre-check may run
      // before auth resolves; the mapping contains no PII.
      allow read: if true;

      allow create: if isFullUser()
        && request.resource.data.keys().hasOnly(['code', 'createdAt'])
        && request.resource.data.code is string
        && request.resource.data.code.size() >= 4
        && request.resource.data.code.size() <= 6;

      allow update, delete: if isAdmin();
    }
```

- [ ] **Step 2: Validate the rules compile**

Use the Firebase MCP tool `firebase_validate_security_rules` with `type: firestore` against the modified file (or `npx firebase-tools deploy --only firestore:rules --dry-run` if the MCP tool is unavailable).
Expected: no compilation errors.

- [ ] **Step 3: Commit**

```bash
git add firestore.rules
git commit -m "feat(rules): shortcodeHashes index collection — immutable one-code-per-hash mapping" -- firestore.rules
```

---

### Task 5: Backfill script

**Files:**
- Create: `scripts/backfill-shortcode-hash-index.mjs`

- [ ] **Step 1: Write the script**

Adapted from `scripts/tmp-dup-shortcode-audit.mjs` (same grouping logic). Admin SDK bypasses rules, so the `backfilled` marker field is fine despite the client `hasOnly` rule.

```js
/**
 * Backfill shortcodeHashes/{hash} index docs for every existing shortcode.
 *
 * Canonical code per hash = OLDEST createdAt (matches the client's
 * deterministic legacy pick). Idempotent: hashes that already have an index
 * doc are skipped. Never touches the shortcodes collection itself — dup
 * docs stay resolvable forever (printed cards may carry any of them).
 *
 * Run: node scripts/backfill-shortcode-hash-index.mjs [--dry-run]
 */
import admin from "firebase-admin";
import { readFileSync } from "fs";

const DRY_RUN = process.argv.includes("--dry-run");
const serviceAccount = JSON.parse(
  readFileSync("E:/tka-platform/serviceAccountKey.json", "utf8")
);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

// 1. Group all shortcodes by encoderHash, keeping the oldest doc per hash.
const snap = await db.collection("shortcodes").select("encoderHash", "createdAt").get();
console.log("shortcode docs:", snap.size);

const canonical = new Map(); // hash → { code, createdAt }
let noHash = 0;
for (const doc of snap.docs) {
  const hash = doc.get("encoderHash");
  if (!hash) { noHash++; continue; }
  const createdAt = doc.get("createdAt") ?? "";
  const prev = canonical.get(hash);
  if (!prev || createdAt < prev.createdAt) {
    canonical.set(hash, { code: doc.id, createdAt });
  }
}
console.log("distinct hashes:", canonical.size, "| docs without hash (skipped):", noHash);

// 2. Skip hashes that already have an index doc (idempotency + lazy heals).
const existing = await db.collection("shortcodeHashes").select().get();
const have = new Set(existing.docs.map((d) => d.id));
console.log("index docs already present:", have.size);

const todo = [...canonical.entries()].filter(([hash]) => !have.has(hash));
console.log("index docs to write:", todo.length, DRY_RUN ? "(dry run — not writing)" : "");

// 3. Batched writes, 500 per batch (Firestore limit).
if (!DRY_RUN) {
  let written = 0;
  for (let i = 0; i < todo.length; i += 500) {
    const batch = db.batch();
    for (const [hash, { code, createdAt }] of todo.slice(i, i + 500)) {
      batch.set(db.collection("shortcodeHashes").doc(hash), {
        code,
        createdAt,
        backfilled: true,
      });
    }
    await batch.commit();
    written += Math.min(500, todo.length - i);
    console.log(`  written ${written}/${todo.length}`);
  }
}
console.log("done");
process.exit(0);
```

- [ ] **Step 2: Dry-run against production**

Run: `node scripts/backfill-shortcode-hash-index.mjs --dry-run`
Expected output shape: `shortcode docs: 18276`, `distinct hashes: ~17142`, `index docs to write: ~17142 (dry run — not writing)`. Sanity-check the numbers against the audit baseline before the real run.

- [ ] **Step 3: Commit (script only — the real run happens in Task 7)**

```bash
git add scripts/backfill-shortcode-hash-index.mjs
git commit -m "feat(scripts): shortcodeHashes backfill — canonical oldest code per hash, idempotent" -- scripts/backfill-shortcode-hash-index.mjs
```

---

### Task 6: Full gate

- [ ] **Step 1: One full typecheck (commit gate)**

Run: `npm run check > /tmp/check.log 2>&1; grep -niE "error" /tmp/check.log | head -50` (capture once, grep many — never re-run check to re-filter)
Expected: no NEW errors attributable to `src/lib/shared/qr/**`. Fix any that appear, re-run the qr test suite, amend nothing — make a follow-up scoped commit if fixes were needed.

- [ ] **Step 2: Full qr test suite once more**

Run: `npx vitest run src/lib/shared/qr`
Expected: PASS.

---

### Task 7: Rollout (ordered — rules BEFORE app ship)

The index write happens inside the allocation transaction; if rules aren't live, permission-denied fails the whole transaction and BREAKS shortcode creation. Order is load-bearing.

- [ ] **Step 1: Diff rules against what's deployed**

The committed `firestore.rules` may contain other pending changes (Library module rules were awaiting deploy as of 2026-07-02). Confirm with Austen that deploying the whole file is intended before pushing.

- [ ] **Step 2: Deploy rules**

Run: `npx firebase-tools deploy --only firestore:rules`
Expected: `✔ Deploy complete!`

- [ ] **Step 3: Ship app code**

Push `main` (CF Pages auto-deploys). Local dev picks the code up immediately via HMR.

- [ ] **Step 4: Run the backfill for real**

Run: `node scripts/backfill-shortcode-hash-index.mjs`
Expected: `written ~17142/~17142`, `done`.

- [ ] **Step 5: Live verification**

1. Open a sequence in the viewer (both call sites fire). Admin-query `shortcodes` by its hash: exactly ONE doc; `shortcodeHashes/{hash}` exists pointing at it.
2. Open the same sequence in a second browser: same code displayed.
3. Re-run `node scripts/tmp-dup-shortcode-audit.mjs`: dup-group count frozen at the legacy baseline (1,044), zero groups with `createdAt` after ship time.

- [ ] **Step 6: Update memory**

Update `reference_short_code_resolution.md` / `project_short_code_domain.md` memory files: allocation now transactional via `shortcodeHashes` index; legacy duplicates resolved deterministically (oldest); audit + backfill scripts exist.
