# Public Generator Setups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every saved generator setup is public and shows up in the preset drawer's Community tab automatically; the one-favorite-per-user `favoriteConfig` projection and its migration code are deleted.

**Architecture:** Setup docs at `users/{uid}/generatorSetups/{id}` gain `isPublic: true`. A recursive-wildcard Firestore rule authorizes a `collectionGroup("generatorSetups")` query filtered on `isPublic == true` (same pattern as public `collections`). The repository reads that query and resolves author name/avatar through a new `getVisibleOwnerProfiles` helper next to `getVisibleOwnerNames`. State, drawer, and row components lose every share/unshare path; guests hitting Save get the signup drawer.

**Tech Stack:** SvelteKit 5 runes, Firebase Firestore (web SDK + rules), zod, vitest (node + browser projects), `@firebase/rules-unit-testing`, firebase-admin for the backfill.

**Spec:** `docs/superpowers/specs/2026-09-18-public-generator-setups-design.md`

**Worktree:** `E:/worktrees/tka-platform/public-setups`, branch `codex/public-generator-setups`. All paths below are relative to that root. Run commands from that directory.

**Commit hygiene:** this repo's rule is explicit pathspecs only (`git add <file> <file>`), never `git add -A` or `git add .`. End every commit message with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## File map

| File | Change |
| --- | --- |
| `firestore.rules` | Tighten per-user `generatorSetups` rule; add `/{path=**}/generatorSetups` public read |
| `firestore.indexes.json` | Add `COLLECTION_GROUP` index `generatorSetups (isPublic ASC, createdAt DESC)` |
| `tests/integration/firestore-rules/firestore.rules.test.ts` | Replace the `generator setups` describe block |
| `src/lib/shared/community/services/user-repository.ts` | Add `getVisibleOwnerProfiles`; `getVisibleOwnerNames` delegates to it |
| `tests/unit/community/get-visible-owner-profiles.test.ts` | New |
| `src/lib/features/create/generate/domain/models/favorite-config.ts` | Rewrite types |
| `src/lib/features/create/generate/domain/models/favorite-config-schemas.ts` | Drop favorite schemas, add `isPublic` |
| `src/lib/features/create/generate/domain/setup-migration.ts` | Delete |
| `src/lib/features/create/generate/domain/__tests__/setup-migration.test.ts` | Delete |
| `src/lib/features/create/generate/services/favorite-config-repository.ts` | Rewrite |
| `src/lib/features/create/generate/services/__tests__/favorite-config-repository.test.ts` | Rewrite |
| `src/lib/features/create/generate/state/favorite-state.svelte.ts` | Remove share paths, rename community list |
| `tests/unit/create/favorite-state.test.ts` | Update |
| `src/lib/shared/auth/domain/auth-nudge-trigger.ts` | `share-setup` becomes `save-setup` |
| `tests/unit/auth/auth-nudge-trigger.test.ts` | Update key list |
| `src/lib/features/create/generate/components/presets/SavedSetupRow.svelte` | Remove share control and badge |
| `src/lib/features/create/generate/components/presets/PresetDrawer.svelte` | Guest save gate, community rows keyed by setup |
| `src/lib/features/create/generate/components/presets/PresetDrawer.svelte.test.ts` | Update |
| `src/lib/features/create/generate/components/GeneratePanel.svelte` | Rename prop, lookup by setupId |
| `src/lib/features/create/generate/components/CardBasedSettingsContainer.svelte` | Lookup by setupId |
| `scripts/backfill-public-generator-setups.cjs` | New |

---

### Task 1: Firestore rules, index, and rules tests

**Files:**
- Modify: `firestore.rules` (per-user rule near line 461; wildcard rule near line 835)
- Modify: `firestore.indexes.json` (insert alphabetically, after the last `festivals` entry, before `hallOfShame`)
- Modify: `tests/integration/firestore-rules/firestore.rules.test.ts` (the `describe("generator setups: private saved configs", ...)` block, around line 1911)

- [ ] **Step 1: Replace the rules test block**

Find the block starting `describe("generator setups: private saved configs", () => {` and ending with the closing `});` just before `describe("media composition presets: private reusable layouts"`. Replace the entire block with:

```ts
describe("generator setups: public saved configs", () => {
  const setupPath = (uid: string, id = "s1") =>
    `users/${uid}/generatorSetups/${id}`;
  const READER_UID = "setup-reader-1";

  function readerCtx() {
    return testEnv.authenticatedContext(READER_UID, {
      firebase: { sign_in_provider: "password" },
    });
  }

  async function seedSetup(
    uid: string,
    id: string,
    data: Record<string, unknown>
  ) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), setupPath(uid, id)), data);
    });
  }

  const PUBLIC_SETUP = { name: "Setup 1", config: { level: 1 }, isPublic: true };

  it("lets a full owner create, read, update, and delete a public setup", async () => {
    const db = fullCtx().firestore(SDK_SETTINGS);
    await assertSucceeds(setDoc(doc(db, setupPath(FULL_UID)), PUBLIC_SETUP));
    await assertSucceeds(getDoc(doc(db, setupPath(FULL_UID))));
    await assertSucceeds(
      updateDoc(doc(db, setupPath(FULL_UID)), { name: "Renamed" })
    );
    await assertSucceeds(deleteDoc(doc(db, setupPath(FULL_UID))));
  });

  it("denies an anonymous owner creating a setup", async () => {
    const db = anonCtx().firestore(SDK_SETTINGS);
    await assertFails(setDoc(doc(db, setupPath(ANON_UID)), PUBLIC_SETUP));
  });

  it("denies creating or updating a setup that is not public", async () => {
    const db = fullCtx().firestore(SDK_SETTINGS);
    await assertFails(
      setDoc(doc(db, setupPath(FULL_UID, "no-flag")), {
        name: "Setup 1",
        config: {},
      })
    );
    await assertFails(
      setDoc(doc(db, setupPath(FULL_UID, "false-flag")), {
        name: "Setup 1",
        config: {},
        isPublic: false,
      })
    );
    await seedSetup(FULL_UID, "s1", PUBLIC_SETUP);
    await assertFails(
      updateDoc(doc(db, setupPath(FULL_UID)), { isPublic: false })
    );
  });

  it("lets anyone read a public setup and run the public collection-group query", async () => {
    await seedSetup(FULL_UID, "s1", PUBLIC_SETUP);
    const reader = readerCtx().firestore(SDK_SETTINGS);
    const signedOut = testEnv.unauthenticatedContext().firestore(SDK_SETTINGS);

    await assertSucceeds(getDoc(doc(reader, setupPath(FULL_UID))));
    await assertSucceeds(getDoc(doc(signedOut, setupPath(FULL_UID))));
    await assertSucceeds(
      getDocs(
        query(
          collectionGroup(reader, "generatorSetups"),
          where("isPublic", "==", true)
        )
      )
    );
  });

  it("denies a bare collection-group query and reads of a non-public doc", async () => {
    await seedSetup(FULL_UID, "legacy", { name: "Legacy", config: {} });
    const reader = readerCtx().firestore(SDK_SETTINGS);

    await assertFails(getDocs(collectionGroup(reader, "generatorSetups")));
    await assertFails(getDoc(doc(reader, setupPath(FULL_UID, "legacy"))));
  });

  it("denies another user writing a setup", async () => {
    await seedSetup(FULL_UID, "s1", PUBLIC_SETUP);
    const reader = readerCtx().firestore(SDK_SETTINGS);

    await assertFails(
      updateDoc(doc(reader, setupPath(FULL_UID)), { name: "Changed" })
    );
    await assertFails(deleteDoc(doc(reader, setupPath(FULL_UID))));
  });

  it("lets an admin preview but not mutate another user's setups", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), `users/${ADMIN_UID}`), {
        role: "admin",
      });
    });
    await seedSetup(FULL_UID, "legacy", { name: "Legacy", config: {} });
    const admin = adminCtx().firestore(SDK_SETTINGS);

    await assertSucceeds(getDoc(doc(admin, setupPath(FULL_UID, "legacy"))));
    await assertFails(
      updateDoc(doc(admin, setupPath(FULL_UID, "legacy")), { name: "Changed" })
    );
  });
});
```

`collectionGroup`, `getDocs`, `query`, `where`, `setDoc`, `getDoc`, `updateDoc`, `deleteDoc`, `doc` are already imported at the top of the file.

- [ ] **Step 2: Run the rules suite to see the new tests fail**

Run:
```bash
npm run test:rules:core 2>&1 | tail -40
```
Expected: the anonymous-create, not-public, public-read, and bare-query tests FAIL (the current rules allow anonymous create and deny outsider reads). Owner CRUD and admin tests pass.

- [ ] **Step 3: Tighten the per-user rule**

In `firestore.rules`, replace:

```
      // -------------------------------------------------------------------------
      // GENERATOR SETUPS (Private saved generator configs; admins can read for
      // impersonation preview, mirroring /settings. The public Favorite remains
      // on users/{uid}.favoriteConfig and is written only by its owner.)
      // -------------------------------------------------------------------------
      match /generatorSetups/{setupId} {
        allow read: if isOwner(userId) || isAdmin();
        allow create, update, delete: if isOwner(userId);
      }
```

with:

```
      // -------------------------------------------------------------------------
      // GENERATOR SETUPS (Saved generator configs. Every setup is public: the
      // collection-group rule below authorizes discovery reads, and this rule
      // covers the owner's own list plus admin impersonation preview. Writes
      // need a full account and must keep isPublic == true; the client never
      // writes false. users/{uid}.favoriteConfig is a retired projection and
      // is no longer read or written.)
      // -------------------------------------------------------------------------
      match /generatorSetups/{setupId} {
        allow read: if isOwner(userId) || isAdmin();
        allow create, update: if isOwner(userId)
          && isFullUser()
          && request.resource.data.isPublic == true;
        allow delete: if isOwner(userId);
      }
```

- [ ] **Step 4: Add the collection-group read rule**

In `firestore.rules`, directly after this existing block:

```
    match /{path=**}/collections/{collectionId} {
      allow read: if resource.data.isPublic == true;
    }
```

insert:

```

    // Public generator setups are readable wherever they live. This authorizes
    // the preset drawer's collectionGroup("generatorSetups") query, which
    // filters isPublic == true. A doc without the flag (legacy, pre-backfill)
    // is granted nothing here and falls through to the owner/admin rule.
    match /{path=**}/generatorSetups/{setupId} {
      allow read: if resource.data.isPublic == true;
    }
```

- [ ] **Step 5: Add the index**

In `firestore.indexes.json`, after the last `"collectionGroup": "festivals"` entry's closing `},` and before the first `"collectionGroup": "hallOfShame"` entry, insert:

```json
    {
      "collectionGroup": "generatorSetups",
      "queryScope": "COLLECTION_GROUP",
      "fields": [
        {
          "fieldPath": "isPublic",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "createdAt",
          "order": "DESCENDING"
        }
      ]
    },
```

Validate: `node -e "JSON.parse(require('fs').readFileSync('firestore.indexes.json','utf8')); console.log('ok')"` prints `ok`.

- [ ] **Step 6: Run the rules suite again**

Run:
```bash
npm run test:rules:core 2>&1 | tail -40
```
Expected: every test in `generator setups: public saved configs` passes, and no other describe block regresses. If the emulator is not installed, the command fails fast with a `firebase` error; report that verbatim rather than skipping.

- [ ] **Step 7: Commit**

```bash
git add firestore.rules firestore.indexes.json tests/integration/firestore-rules/firestore.rules.test.ts
git commit -m "feat(rules): public generator setups collection-group read

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: `getVisibleOwnerProfiles`

**Files:**
- Modify: `src/lib/shared/community/services/user-repository.ts` (the `getVisibleOwnerNames` function, around line 410)
- Create: `tests/unit/community/get-visible-owner-profiles.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/community/get-visible-owner-profiles.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  getDocs: vi.fn(),
  whereCalls: [] as unknown[][],
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_firestore: unknown, path: string) => path),
  doc: vi.fn((_firestore: unknown, path: string) => path),
  documentId: vi.fn(() => "__name__"),
  getCountFromServer: vi.fn(),
  getDoc: vi.fn(),
  getDocs: h.getDocs,
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn((value: unknown) => value),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(),
  startAfter: vi.fn(),
  where: vi.fn((...args: unknown[]) => {
    h.whereCalls.push(args);
    return args;
  }),
}));

vi.mock("$lib/shared/auth/firebase", () => ({
  getFirestoreInstance: vi.fn(async () => ({ name: "firestore" })),
}));

vi.mock("$lib/shared/firestore", async () => {
  const { z } = await import("zod");
  return {
    firestoreDate: z.any(),
    firestoreGet: vi.fn(),
    firestoreList: vi.fn(),
  };
});

vi.mock("$lib/shared/toast/state/toast-state.svelte", () => ({
  toast: { error: vi.fn() },
}));

vi.mock("$lib/shared/offline/state/sync-status-state.svelte", () => ({
  trackWrite: vi.fn(),
}));

import {
  getVisibleOwnerNames,
  getVisibleOwnerProfiles,
} from "$lib/shared/community/services/user-repository";

function snapshotOf(docs: Array<{ id: string; data: Record<string, unknown> }>) {
  return {
    forEach: (visit: (snap: { id: string; data: () => unknown }) => void) => {
      for (const entry of docs) {
        visit({ id: entry.id, data: () => entry.data });
      }
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.whereCalls.length = 0;
});

describe("getVisibleOwnerProfiles", () => {
  it("returns display name and avatar for visible owners only", async () => {
    h.getDocs.mockResolvedValue(
      snapshotOf([
        {
          id: "shown",
          data: { displayName: "Austen", photoURL: "https://x/a.png" },
        },
        { id: "hidden", data: { displayName: "Moderated", isHidden: true } },
        { id: "guest", data: { displayName: "Guest", isAnonymous: true } },
        { id: "nameless", data: {} },
      ])
    );

    const profiles = await getVisibleOwnerProfiles([
      "shown",
      "hidden",
      "guest",
      "nameless",
      "missing",
    ]);

    expect(profiles.get("shown")).toEqual({
      displayName: "Austen",
      photoURL: "https://x/a.png",
    });
    expect(profiles.get("nameless")).toEqual({
      displayName: "Someone",
      photoURL: undefined,
    });
    expect(profiles.has("hidden")).toBe(false);
    expect(profiles.has("guest")).toBe(false);
    expect(profiles.has("missing")).toBe(false);
  });

  it("skips the query for an empty id list", async () => {
    const profiles = await getVisibleOwnerProfiles([]);
    expect(profiles.size).toBe(0);
    expect(h.getDocs).not.toHaveBeenCalled();
  });

  it("chunks ids by 30 and dedupes", async () => {
    h.getDocs.mockResolvedValue(snapshotOf([]));
    const ids = Array.from({ length: 31 }, (_, index) => `u${index}`);

    await getVisibleOwnerProfiles([...ids, "u0"]);

    expect(h.getDocs).toHaveBeenCalledTimes(2);
    const inClunks = h.whereCalls
      .filter((call) => call[1] === "in")
      .map((call) => call[2] as string[]);
    expect(inClunks.map((chunk) => chunk.length)).toEqual([30, 1]);
  });
});

describe("getVisibleOwnerNames", () => {
  it("maps profiles down to display names", async () => {
    h.getDocs.mockResolvedValue(
      snapshotOf([{ id: "shown", data: { displayName: "Austen" } }])
    );

    const names = await getVisibleOwnerNames(["shown"]);

    expect([...names]).toEqual([["shown", "Austen"]]);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run:
```bash
npx vitest run --config tests/config/vitest.config.ts tests/unit/community/get-visible-owner-profiles.test.ts 2>&1 | tail -20
```
Expected: FAIL, `getVisibleOwnerProfiles` is not exported.

- [ ] **Step 3: Implement**

In `src/lib/shared/community/services/user-repository.ts`, replace the whole `getVisibleOwnerNames` function (keep its doc comment above it) with:

```ts
export interface VisibleOwnerProfile {
  displayName: string;
  photoURL?: string;
}

/**
 * Display name and avatar for the owners a discovery surface may show.
 * Applies the same suppression as getVisibleOwnerNames: hidden, guest,
 * legacy-profile, and deleted owners are omitted from the map.
 */
export async function getVisibleOwnerProfiles(
  userIds: string[]
): Promise<Map<string, VisibleOwnerProfile>> {
  const profiles = new Map<string, VisibleOwnerProfile>();
  const unique = [...new Set(userIds)].filter(Boolean);
  if (unique.length === 0) return profiles;

  const firestore = await getFirestoreInstance();
  const usersRef = collection(firestore, USERS_COLLECTION);

  for (let i = 0; i < unique.length; i += 30) {
    const chunk = unique.slice(i, i + 30);
    const q = query(
      usersRef,
      where("publicProfileVersion", "==", PUBLIC_PROFILE_VERSION),
      where(documentId(), "in", chunk)
    );
    const snapshot = await getDocs(q);
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as FirestoreUserData;
      if (data.isHidden === true) return; // moderated — suppress from discovery
      if (isAnonymousGuest(data)) return; // guests aren't creators yet
      profiles.set(docSnap.id, {
        displayName: data.displayName ?? data.name ?? "Someone",
        photoURL: data.photoURL ?? undefined,
      });
    });
  }

  return profiles;
}

export async function getVisibleOwnerNames(
  userIds: string[]
): Promise<Map<string, string>> {
  const profiles = await getVisibleOwnerProfiles(userIds);
  return new Map(
    [...profiles].map(([userId, profile]) => [userId, profile.displayName])
  );
}
```

- [ ] **Step 4: Run the new test and the existing consumers**

Run:
```bash
npx vitest run --config tests/config/vitest.config.ts tests/unit/community/get-visible-owner-profiles.test.ts tests/unit/opus-firestore-audit/community-feed-fanout.test.ts tests/unit/user-repository-social-counts.test.ts 2>&1 | tail -20
```
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/community/services/user-repository.ts tests/unit/community/get-visible-owner-profiles.test.ts
git commit -m "feat(community): getVisibleOwnerProfiles with avatars

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Models, schemas, repository

**Files:**
- Modify: `src/lib/features/create/generate/domain/models/favorite-config.ts`
- Modify: `src/lib/features/create/generate/domain/models/favorite-config-schemas.ts`
- Delete: `src/lib/features/create/generate/domain/setup-migration.ts`
- Delete: `src/lib/features/create/generate/domain/__tests__/setup-migration.test.ts`
- Modify: `src/lib/features/create/generate/services/favorite-config-repository.ts`
- Modify: `src/lib/features/create/generate/services/__tests__/favorite-config-repository.test.ts`

- [ ] **Step 1: Rewrite the models file**

Replace the full contents of `src/lib/features/create/generate/domain/models/favorite-config.ts` with:

```ts
import type { UIGenerationConfig } from "../../state/generate-config.svelte";
import type { StartEndOptions } from "$lib/shared/create/state/panel-coordination-state.svelte";

export interface SavedGeneratorSetup {
  id: string;
  name: string;
  config: UIGenerationConfig;
  startEndOptions: StartEndOptions | null;
  createdAt: Date;
  updatedAt: Date;
}

/** A public setup from any account, as the Community tab shows it. */
export interface CommunitySetup {
  setupId: string;
  userId: string;
  displayName: string;
  avatar?: string;
  name: string;
  config: UIGenerationConfig;
  startEndOptions: StartEndOptions | null;
  createdAt: Date;
}

export interface SavedSetupDraft {
  name: string;
  config: UIGenerationConfig;
  startEndOptions: StartEndOptions | null;
}

export type ActiveSetupSource =
  | { kind: "setup"; setupId: string }
  | { kind: "community"; userId: string; setupId: string };

export type PendingSetupAction =
  | { kind: "create" }
  | { kind: "rename" | "update" | "delete"; setupId: string };
```

- [ ] **Step 2: Rewrite the schemas file**

Replace the full contents of `src/lib/features/create/generate/domain/models/favorite-config-schemas.ts` with:

```ts
import { z } from "zod";
import { firestoreDate } from "$lib/shared/firestore";

export const SavedGeneratorSetupSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    config: z.record(z.string(), z.unknown()),
    startEndOptions: z.record(z.string(), z.unknown()).nullable().optional(),
    isPublic: z.boolean().optional(),
    createdAt: firestoreDate.optional(),
    updatedAt: firestoreDate.optional(),
  })
  .passthrough();

export type SavedGeneratorSetupDoc = z.infer<
  typeof SavedGeneratorSetupSchema
>;
```

- [ ] **Step 3: Delete the migration planner and its test**

```bash
git rm src/lib/features/create/generate/domain/setup-migration.ts src/lib/features/create/generate/domain/__tests__/setup-migration.test.ts
```

- [ ] **Step 4: Rewrite the repository test**

Replace the full contents of `src/lib/features/create/generate/services/__tests__/favorite-config-repository.test.ts` with:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  firestoreList: vi.fn(),
  firestoreSet: vi.fn(),
  firestoreDelete: vi.fn(),
  getDocs: vi.fn(),
  getVisibleOwnerProfiles: vi.fn(),
  queryArgs: [] as unknown[][],
}));

vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  collectionGroup: vi.fn((_db: unknown, id: string) => ({ group: id })),
  doc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: harness.getDocs,
  serverTimestamp: vi.fn(() => "__SERVER_TS__"),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  writeBatch: vi.fn(),
  limit: vi.fn((count: number) => ({ limit: count })),
  orderBy: vi.fn((field: string, direction?: string) => ({
    orderBy: field,
    direction,
  })),
  query: vi.fn((...args: unknown[]) => {
    harness.queryArgs.push(args);
    return args;
  }),
  where: vi.fn((field: string, op: string, value: unknown) => ({
    where: field,
    op,
    value,
  })),
}));

vi.mock("$lib/shared/auth/firebase", () => ({
  getFirestoreInstance: vi.fn(async () => ({})),
}));

vi.mock("$lib/shared/firestore", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  firestoreList: harness.firestoreList,
  firestoreSet: harness.firestoreSet,
  firestoreDelete: harness.firestoreDelete,
}));

vi.mock("$lib/shared/community/services/user-repository", () => ({
  getVisibleOwnerProfiles: harness.getVisibleOwnerProfiles,
}));

import {
  createSetup,
  deleteSetup,
  loadCommunity,
  loadPersonal,
  renameSetup,
  updateSetup,
} from "../favorite-config-repository";
import type { SavedGeneratorSetup } from "../../domain/models/favorite-config";

const NOW = new Date("2026-09-18T12:00:00Z");
const CONFIG = { level: 2 } as unknown as SavedGeneratorSetup["config"];
const A_SETUP = {
  id: "s1",
  name: "Setup 1",
  config: CONFIG,
  startEndOptions: null,
  createdAt: NOW,
  updatedAt: NOW,
} satisfies SavedGeneratorSetup;

function communityDoc(
  ownerId: string | null,
  id: string,
  data: Record<string, unknown>
) {
  return {
    id,
    ref: { parent: { parent: ownerId ? { id: ownerId } : null } },
    data: () => data,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.queryArgs.length = 0;
  harness.getVisibleOwnerProfiles.mockResolvedValue(new Map());
});

describe("loadPersonal", () => {
  it("lists the owner's setups ordered by createdAt", async () => {
    harness.firestoreList.mockResolvedValue([
      { id: "s1", name: "One", config: { level: 1 }, createdAt: NOW },
    ]);

    const setups = await loadPersonal("u1");

    expect(harness.firestoreList).toHaveBeenCalledWith(
      "users/u1/generatorSetups",
      expect.anything(),
      { orderBy: [{ field: "createdAt" }] }
    );
    expect(setups.map((setup) => setup.id)).toEqual(["s1"]);
  });
});

describe("writes", () => {
  it("creates a setup as public", async () => {
    harness.firestoreSet.mockResolvedValue("new-id");

    const created = await createSetup("u1", {
      name: "Setup 1",
      config: CONFIG,
      startEndOptions: null,
    });

    expect(harness.firestoreSet).toHaveBeenCalledWith(
      "users/u1/generatorSetups",
      null,
      expect.objectContaining({ name: "Setup 1", isPublic: true }),
      expect.objectContaining({ trackOffline: true })
    );
    expect(created.id).toBe("new-id");
  });

  it("keeps a renamed setup public", async () => {
    await renameSetup("u1", "s1", "Renamed");

    expect(harness.firestoreSet).toHaveBeenCalledWith(
      "users/u1/generatorSetups",
      "s1",
      { name: "Renamed", isPublic: true },
      expect.objectContaining({ merge: true })
    );
  });

  it("keeps an updated setup public", async () => {
    await updateSetup("u1", A_SETUP);

    expect(harness.firestoreSet).toHaveBeenCalledWith(
      "users/u1/generatorSetups",
      "s1",
      expect.objectContaining({ config: CONFIG, isPublic: true }),
      expect.objectContaining({ merge: true })
    );
  });

  it("deletes the setup doc", async () => {
    await deleteSetup("u1", "s1");

    expect(harness.firestoreDelete).toHaveBeenCalledWith(
      "users/u1/generatorSetups",
      "s1",
      expect.objectContaining({ trackOffline: true })
    );
  });
});

describe("loadCommunity", () => {
  it("queries public setups newest first", async () => {
    harness.getDocs.mockResolvedValue({ docs: [] });

    await loadCommunity(7);

    expect(harness.queryArgs[0]).toEqual([
      { group: "generatorSetups" },
      { where: "isPublic", op: "==", value: true },
      { orderBy: "createdAt", direction: "desc" },
      { limit: 7 },
    ]);
  });

  it("maps docs with visible owners and drops the rest", async () => {
    harness.getDocs.mockResolvedValue({
      docs: [
        communityDoc("austen", "s1", {
          name: "VTG 1:1",
          config: { level: 3 },
          startEndOptions: null,
          isPublic: true,
          createdAt: { toDate: () => NOW },
        }),
        communityDoc("hidden", "s2", {
          name: "Hidden owner",
          config: { level: 1 },
          isPublic: true,
        }),
        communityDoc(null, "root", {
          name: "No parent user",
          config: {},
          isPublic: true,
        }),
      ],
    });
    harness.getVisibleOwnerProfiles.mockResolvedValue(
      new Map([
        ["austen", { displayName: "Austen Cloud", photoURL: "https://x/a.png" }],
      ])
    );

    const setups = await loadCommunity();

    expect(harness.getVisibleOwnerProfiles).toHaveBeenCalledWith([
      "austen",
      "hidden",
    ]);
    expect(setups).toEqual([
      expect.objectContaining({
        setupId: "s1",
        userId: "austen",
        displayName: "Austen Cloud",
        avatar: "https://x/a.png",
        name: "VTG 1:1",
        createdAt: NOW,
      }),
    ]);
  });

  it("rejects read failures instead of returning an empty list", async () => {
    harness.getDocs.mockRejectedValue(new Error("permission-denied"));

    await expect(loadCommunity()).rejects.toThrow("permission-denied");
  });
});
```

- [ ] **Step 5: Run it to confirm it fails**

Run:
```bash
npx vitest run --config tests/config/vitest.config.ts src/lib/features/create/generate/services/__tests__/favorite-config-repository.test.ts 2>&1 | tail -20
```
Expected: FAIL (old signatures, `loadPersonal` requires an options argument, `loadCommunity` still reads `users`).

- [ ] **Step 6: Rewrite the repository**

Replace the full contents of `src/lib/features/create/generate/services/favorite-config-repository.ts` with:

```ts
import {
  collectionGroup,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { getFirestoreInstance } from "$lib/shared/auth/firebase";
import {
  firestoreDelete,
  firestoreList,
  firestoreSet,
} from "$lib/shared/firestore";
import { getVisibleOwnerProfiles } from "$lib/shared/community/services/user-repository";
import { SavedGeneratorSetupSchema } from "../domain/models/favorite-config-schemas";
import type {
  CommunitySetup,
  SavedGeneratorSetup,
  SavedSetupDraft,
} from "../domain/models/favorite-config";
import type { UIGenerationConfig } from "../state/generate-config.svelte";
import type { StartEndOptions } from "$lib/shared/create/state/panel-coordination-state.svelte";
import {
  normalizePersistedGenerationConfig,
  normalizePersistedStartEndOptions,
} from "../domain/generator-persistence-normalizer";

const SETUPS_GROUP = "generatorSetups";
const SETUP_REPOSITORY_NAME = "favorites";

const setupsPath = (userId: string) => `users/${userId}/${SETUPS_GROUP}`;

export interface GeneratorSetupRepository {
  loadPersonal(userId: string): Promise<SavedGeneratorSetup[]>;
  loadCommunity(limit?: number): Promise<CommunitySetup[]>;
  createSetup(
    userId: string,
    draft: SavedSetupDraft
  ): Promise<SavedGeneratorSetup>;
  renameSetup(userId: string, setupId: string, name: string): Promise<void>;
  updateSetup(userId: string, setup: SavedGeneratorSetup): Promise<void>;
  deleteSetup(userId: string, setupId: string): Promise<void>;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (
    value &&
    typeof value === "object" &&
    "toDate" in value &&
    typeof (value as { toDate: unknown }).toDate === "function"
  ) {
    return (value as { toDate: () => Date }).toDate();
  }
  return null;
}

export async function loadPersonal(
  userId: string
): Promise<SavedGeneratorSetup[]> {
  const setupDocs = await firestoreList(
    setupsPath(userId),
    SavedGeneratorSetupSchema,
    { orderBy: [{ field: "createdAt" }] }
  );

  return setupDocs.map((setup) => ({
    id: setup.id,
    name: setup.name,
    config: normalizePersistedGenerationConfig(
      setup.config
    ) as UIGenerationConfig,
    startEndOptions: normalizePersistedStartEndOptions(
      (setup.startEndOptions ?? null) as StartEndOptions | null
    ),
    createdAt: setup.createdAt ?? new Date(),
    updatedAt: setup.updatedAt ?? new Date(),
  }));
}

/**
 * Newest public setups across every account. The owner is the parent user
 * doc in the path, never a field on the setup. Owners the community may not
 * see (hidden, guest, legacy profile, deleted) drop out with their setups.
 */
export async function loadCommunity(
  limitCount = 20
): Promise<CommunitySetup[]> {
  const db = await getFirestoreInstance();
  const snapshot = await getDocs(
    query(
      collectionGroup(db, SETUPS_GROUP),
      where("isPublic", "==", true),
      orderBy("createdAt", "desc"),
      limit(limitCount)
    )
  );

  const rows: Array<{
    ownerId: string;
    setupId: string;
    data: Record<string, unknown>;
  }> = [];
  for (const docSnap of snapshot.docs) {
    const ownerId = docSnap.ref.parent.parent?.id;
    if (!ownerId) continue;
    rows.push({
      ownerId,
      setupId: docSnap.id,
      data: docSnap.data() as Record<string, unknown>,
    });
  }

  const owners = await getVisibleOwnerProfiles(
    rows.map((row) => row.ownerId)
  );

  const results: CommunitySetup[] = [];
  for (const row of rows) {
    const owner = owners.get(row.ownerId);
    if (!owner) continue;
    results.push({
      setupId: row.setupId,
      userId: row.ownerId,
      displayName: owner.displayName,
      avatar: owner.photoURL,
      name: typeof row.data.name === "string" ? row.data.name : "Setup",
      config: normalizePersistedGenerationConfig(
        (row.data.config ?? {}) as Record<string, unknown>
      ) as UIGenerationConfig,
      startEndOptions: normalizePersistedStartEndOptions(
        (row.data.startEndOptions ?? null) as StartEndOptions | null
      ),
      createdAt: toDate(row.data.createdAt) ?? new Date(),
    });
  }

  return results;
}

export async function createSetup(
  userId: string,
  draft: SavedSetupDraft
): Promise<SavedGeneratorSetup> {
  const id = await firestoreSet(
    setupsPath(userId),
    null,
    {
      name: draft.name,
      config: draft.config as unknown as Record<string, unknown>,
      startEndOptions: draft.startEndOptions,
      isPublic: true,
    },
    {
      trackOffline: true,
      repoName: SETUP_REPOSITORY_NAME,
    }
  );
  const now = new Date();

  return {
    id,
    name: draft.name,
    config: draft.config,
    startEndOptions: draft.startEndOptions,
    createdAt: now,
    updatedAt: now,
  };
}

export async function renameSetup(
  userId: string,
  setupId: string,
  name: string
): Promise<void> {
  await firestoreSet(
    setupsPath(userId),
    setupId,
    { name, isPublic: true },
    {
      merge: true,
      trackOffline: true,
      repoName: SETUP_REPOSITORY_NAME,
    }
  );
}

export async function updateSetup(
  userId: string,
  setup: SavedGeneratorSetup
): Promise<void> {
  await firestoreSet(
    setupsPath(userId),
    setup.id,
    {
      config: setup.config as unknown as Record<string, unknown>,
      startEndOptions: setup.startEndOptions,
      isPublic: true,
    },
    {
      merge: true,
      trackOffline: true,
      repoName: SETUP_REPOSITORY_NAME,
    }
  );
}

export async function deleteSetup(
  userId: string,
  setupId: string
): Promise<void> {
  await firestoreDelete(setupsPath(userId), setupId, {
    trackOffline: true,
    repoName: SETUP_REPOSITORY_NAME,
  });
}

export const generatorSetupRepository: GeneratorSetupRepository = {
  loadPersonal,
  loadCommunity,
  createSetup,
  renameSetup,
  updateSetup,
  deleteSetup,
};
```

Note on `firestoreSet`: it adds `updatedAt: serverTimestamp()` on every write and `createdAt` on creates (see `src/lib/shared/firestore/firestore-crud.ts` around line 186), so the repository does not set timestamps itself. `normalizePersistedGenerationConfig` takes `unknown`, so the `as Record<string, unknown>` cast in `loadCommunity` is only there to satisfy the `?? {}` default; keep it.

- [ ] **Step 7: Run the repository test**

Run:
```bash
npx vitest run --config tests/config/vitest.config.ts src/lib/features/create/generate/services/__tests__/favorite-config-repository.test.ts 2>&1 | tail -20
```
Expected: all 8 tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/lib/features/create/generate/domain/models/favorite-config.ts src/lib/features/create/generate/domain/models/favorite-config-schemas.ts src/lib/features/create/generate/services/favorite-config-repository.ts src/lib/features/create/generate/services/__tests__/favorite-config-repository.test.ts
git commit -m "feat(generate): setups repository reads the public collection group

Drops the favoriteConfig projection and the legacy favorite migration.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

(The `git rm` in Step 3 already staged the two deletions; they land in this commit.)

---

### Task 4: Favorite state

**Files:**
- Modify: `src/lib/features/create/generate/state/favorite-state.svelte.ts`
- Modify: `tests/unit/create/favorite-state.test.ts`

- [ ] **Step 1: Update the state test**

Replace the full contents of `tests/unit/create/favorite-state.test.ts` with:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  createFavoriteState,
  type FavoriteStateDeps,
} from "$lib/features/create/generate/state/favorite-state.svelte";
import type {
  CommunitySetup,
  SavedGeneratorSetup,
} from "$lib/features/create/generate/domain/models/favorite-config";
import { captureSetupSnapshot } from "$lib/features/create/generate/domain/setup-snapshot";
import { createLiveConfigHarness } from "./favorite-state-live-harness.svelte";

const NOW = new Date();
const CONFIG = {
  level: 2,
  length: 8,
  mode: "freeform",
  spellTargetLength: null,
} as unknown as SavedGeneratorSetup["config"];

function makeSetup(id: string, name = id): SavedGeneratorSetup {
  return {
    id,
    name,
    config: CONFIG,
    startEndOptions: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeCommunitySetup(
  userId: string,
  setupId: string,
  name = setupId
): CommunitySetup {
  return {
    setupId,
    userId,
    displayName: `User ${userId}`,
    name,
    config: CONFIG,
    startEndOptions: null,
    createdAt: NOW,
  };
}

interface FakeOptions {
  personal?: SavedGeneratorSetup[] | Error;
  community?: CommunitySetup[] | Error;
}

function makeDeps(options: FakeOptions = {}) {
  const personal = options.personal ?? [];
  const community = options.community ?? [];
  const repository = {
    loadPersonal: vi.fn(async () => {
      if (personal instanceof Error) throw personal;
      return personal;
    }),
    loadCommunity: vi.fn(async () => {
      if (community instanceof Error) throw community;
      return community;
    }),
    createSetup: vi.fn(
      async (_userId: string, draft: { name: string }) =>
        makeSetup("new-id", draft.name)
    ),
    renameSetup: vi.fn(async () => undefined),
    updateSetup: vi.fn(async () => undefined),
    deleteSetup: vi.fn(async () => undefined),
  };
  const deps: Partial<FavoriteStateDeps> = {
    repository,
    isAuthReady: () => true,
    awaitAuthReady: vi.fn(async () => undefined),
    getUserId: () => "u1",
    isPreviewActive: () => false,
    notifySuccess: vi.fn(),
    reportUserError: vi.fn(),
  };
  return { repository, deps };
}

const liveSnapshot = () => captureSetupSnapshot(CONFIG, null);

async function settled<
  T extends {
    isLoadingSetups: boolean;
    isLoadingCommunity: boolean;
  },
>(state: T): Promise<T> {
  await vi.waitFor(() => {
    expect(state.isLoadingSetups).toBe(false);
    expect(state.isLoadingCommunity).toBe(false);
  });
  return state;
}

describe("favorite state", () => {
  it("waits for restored auth before reading saved setups", async () => {
    let releaseAuth!: () => void;
    const authReady = new Promise<void>((resolve) => {
      releaseAuth = resolve;
    });
    const { deps, repository } = makeDeps();
    deps.isAuthReady = () => false;
    deps.awaitAuthReady = () => authReady;

    const state = createFavoriteState(liveSnapshot, deps);
    await Promise.resolve();
    expect(repository.loadPersonal).not.toHaveBeenCalled();
    expect(repository.loadCommunity).not.toHaveBeenCalled();

    releaseAuth();
    await settled(state);

    expect(repository.loadPersonal).toHaveBeenCalledOnce();
    expect(repository.loadCommunity).toHaveBeenCalledOnce();
  });

  it("personal and community loads settle independently", async () => {
    const { deps } = makeDeps({ community: new Error("outage") });
    const state = await settled(
      createFavoriteState(liveSnapshot, deps)
    );
    expect(state.setupsLoadError).toBeNull();
    expect(state.communityLoadError).toBe(
      "Community setups could not load"
    );
    expect(state.communitySetups).toEqual([]);
  });

  it("failed personal read exposes error state", async () => {
    const { deps } = makeDeps({
      personal: new Error("permission-denied"),
    });
    const state = await settled(
      createFavoriteState(liveSnapshot, deps)
    );
    expect(state.setupsLoadError).toBe(
      "Saved setups could not load"
    );
    expect(state.canSave).toBe(false);
  });

  it("hides the viewer's own setups from the community list", async () => {
    const { deps } = makeDeps({
      community: [
        makeCommunitySetup("u1", "mine"),
        makeCommunitySetup("u2", "theirs"),
      ],
    });
    const state = await settled(
      createFavoriteState(liveSnapshot, deps)
    );
    expect(state.communitySetups.map((setup) => setup.setupId)).toEqual([
      "theirs",
    ]);
  });

  it("save activates the returned setup and reports success", async () => {
    const { deps } = makeDeps();
    const state = await settled(
      createFavoriteState(liveSnapshot, deps)
    );
    await expect(state.saveCurrentSetup()).resolves.toBe(true);
    expect(state.setups.map((setup) => setup.id)).toEqual([
      "new-id",
    ]);
    expect(state.activeSource).toEqual({
      kind: "setup",
      setupId: "new-id",
    });
    expect(state.activeStatus).toBe("active");
    expect(deps.notifySuccess).toHaveBeenCalledWith(
      "Saved and shared with the community"
    );
  });

  it("update writes the setup without a share flag", async () => {
    const { deps, repository } = makeDeps({
      personal: [makeSetup("s1")],
    });
    const state = await settled(
      createFavoriteState(liveSnapshot, deps)
    );

    await expect(state.updateSetupFromCurrent("s1")).resolves.toBe(true);
    expect(repository.updateSetup).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ id: "s1", config: CONFIG })
    );
    expect(repository.updateSetup.mock.calls[0]).toHaveLength(2);
  });

  it("failed writes mutate nothing", async () => {
    const { deps, repository } = makeDeps({
      personal: [makeSetup("s1")],
    });
    repository.deleteSetup.mockRejectedValue(new Error("offline"));
    const state = await settled(
      createFavoriteState(liveSnapshot, deps)
    );

    await expect(state.deleteSetup("s1")).resolves.toBe(false);
    expect(state.setups).toHaveLength(1);
    expect(deps.reportUserError).toHaveBeenCalled();
  });

  it("deleting the active setup clears provenance", async () => {
    const { deps, repository } = makeDeps({
      personal: [makeSetup("s1")],
    });
    const state = await settled(
      createFavoriteState(liveSnapshot, deps)
    );
    state.setActiveSource({ kind: "setup", setupId: "s1" });

    await expect(state.deleteSetup("s1")).resolves.toBe(true);
    expect(repository.deleteSetup).toHaveBeenCalledWith("u1", "s1");
    expect(state.activeSource).toBeNull();
    expect(state.setups).toEqual([]);
  });

  it("uses the applied snapshot as the active baseline", async () => {
    const legacyConfig = {
      level: 2,
    } as unknown as SavedGeneratorSetup["config"];
    const { deps } = makeDeps({
      personal: [
        {
          ...makeSetup("legacy"),
          config: legacyConfig,
        },
      ],
    });
    const state = await settled(
      createFavoriteState(liveSnapshot, deps)
    );

    state.setActiveSource(
      { kind: "setup", setupId: "legacy" },
      liveSnapshot()
    );

    expect(state.activeStatus).toBe("active");
  });

  it("resolves a community source by setup id", async () => {
    const { deps } = makeDeps({
      community: [
        makeCommunitySetup("u2", "first"),
        makeCommunitySetup("u2", "second"),
      ],
    });
    const state = await settled(
      createFavoriteState(liveSnapshot, deps)
    );

    state.setActiveSource({
      kind: "community",
      userId: "u2",
      setupId: "second",
    });

    expect(state.activeSource).toEqual({
      kind: "community",
      userId: "u2",
      setupId: "second",
    });
    expect(state.activeStatus).toBe("active");
  });

  it("detaches the applied setup when a control changes", async () => {
    const live = createLiveConfigHarness(CONFIG);
    const { deps } = makeDeps({
      personal: [makeSetup("s1")],
    });
    const state = await settled(
      createFavoriteState(live.getLiveSnapshot, deps)
    );
    state.setActiveSource(
      { kind: "setup", setupId: "s1" },
      live.getLiveSnapshot()
    );
    expect(state.activeStatus).toBe("active");

    live.setLevel(3);

    expect(state.activeSource).toBeNull();
    expect(state.activeStatus).toBeNull();
  });

  it("re-attaches the applied setup when the controls match it again", async () => {
    const live = createLiveConfigHarness(CONFIG);
    const { deps } = makeDeps({
      personal: [makeSetup("s1")],
    });
    const state = await settled(
      createFavoriteState(live.getLiveSnapshot, deps)
    );
    state.setActiveSource(
      { kind: "setup", setupId: "s1" },
      live.getLiveSnapshot()
    );

    live.setLevel(3);
    expect(state.activeSource).toBeNull();

    live.setLevel(CONFIG.level);

    expect(state.activeSource).toEqual({ kind: "setup", setupId: "s1" });
    expect(state.activeStatus).toBe("active");
  });

  it("clears private setups when the active identity signs out", async () => {
    let userId: string | null = "u1";
    const { deps } = makeDeps({
      personal: [makeSetup("s1")],
    });
    deps.getUserId = () => userId;
    const state = await settled(
      createFavoriteState(liveSnapshot, deps)
    );
    state.setActiveSource({ kind: "setup", setupId: "s1" });

    userId = null;
    await state.loadPersonal();

    expect(state.setups).toEqual([]);
    expect(state.activeSource).toBeNull();
    expect(state.activeStatus).toBeNull();
  });

  it("ignores a stale personal read after the identity changes", async () => {
    let userId: string | null = "u1";
    let resolveFirst!: (value: SavedGeneratorSetup[]) => void;
    const firstRead = new Promise<SavedGeneratorSetup[]>((resolve) => {
      resolveFirst = resolve;
    });
    const { deps, repository } = makeDeps();
    deps.getUserId = () => userId;
    repository.loadPersonal.mockImplementation(
      async (requestedUserId: string) =>
        requestedUserId === "u1" ? firstRead : [makeSetup("u2-setup")]
    );

    const state = createFavoriteState(liveSnapshot, deps);
    await vi.waitFor(() => {
      expect(repository.loadPersonal).toHaveBeenCalledWith("u1");
    });

    userId = "u2";
    await state.loadPersonal();
    resolveFirst([makeSetup("stale-u1-setup")]);
    await firstRead;

    expect(state.setups.map((setup) => setup.id)).toEqual([
      "u2-setup",
    ]);
  });

  it("admin preview loads read-only", async () => {
    const { deps, repository } = makeDeps({
      personal: [makeSetup("s1")],
    });
    deps.isPreviewActive = () => true;
    const state = await settled(
      createFavoriteState(liveSnapshot, deps)
    );

    expect(repository.loadPersonal).toHaveBeenCalledWith("u1");
    await expect(state.saveCurrentSetup()).resolves.toBe(false);
    expect(state.canSave).toBe(false);
  });

  it("retry clears the error after a successful reload", async () => {
    const { deps, repository } = makeDeps({
      community: new Error("outage"),
    });
    const state = await settled(
      createFavoriteState(liveSnapshot, deps)
    );
    repository.loadCommunity.mockResolvedValue([]);

    await state.loadCommunity();

    expect(state.communityLoadError).toBeNull();
  });

  it("disables save at the ten-setup cap", async () => {
    const ten = Array.from({ length: 10 }, (_, index) =>
      makeSetup(`s${index}`, `Setup ${index + 1}`)
    );
    const { deps } = makeDeps({ personal: ten });
    const state = await settled(
      createFavoriteState(liveSnapshot, deps)
    );

    expect(state.canSave).toBe(false);
    await expect(state.saveCurrentSetup()).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run:
```bash
npx vitest run --config tests/config/vitest.config.ts tests/unit/create/favorite-state.test.ts 2>&1 | tail -20
```
Expected: FAIL (`communitySetups` undefined, `loadPersonal` called with an options object, old toast text).

- [ ] **Step 3: Rewrite the state**

Replace the full contents of `src/lib/features/create/generate/state/favorite-state.svelte.ts` with:

```ts
/**
 * Saved-setups and community-setups state for GeneratePanel.
 *
 * Every saved setup is public. Persistence, auth, and the live panel snapshot
 * are dependency injected so the state stays testable. Mutations return false
 * after reporting a failure; callers must not close the drawer or mutate UI
 * optimistically.
 */
import {
  generatorSetupRepository,
  type GeneratorSetupRepository,
} from "../services/favorite-config-repository";
import {
  authState,
  awaitAuthSettled,
  getEffectiveUserId,
} from "$lib/shared/auth/state/auth-state.svelte";
import { userPreviewState } from "$lib/shared/debug/state/user-preview-state.svelte";
import { getErrorHandler } from "$lib/shared/application/get-error-handler";
import { showToast } from "$lib/shared/toast/state/toast-state.svelte";
import {
  captureSetupSnapshot,
  setupSnapshotsEqual,
  type SetupSnapshot,
} from "../domain/setup-snapshot";
import type {
  ActiveSetupSource,
  CommunitySetup,
  PendingSetupAction,
  SavedGeneratorSetup,
} from "../domain/models/favorite-config";

export const SETUP_CAP = 10;
export const SETUP_NAME_MAX_LENGTH = 60;

export interface FavoriteStateDeps {
  repository: GeneratorSetupRepository;
  isAuthReady: () => boolean;
  awaitAuthReady: () => Promise<void>;
  getUserId: () => string | null;
  isPreviewActive: () => boolean;
  getLiveSnapshot: () => SetupSnapshot;
  notifySuccess: (message: string) => void;
  reportUserError: (
    message: string,
    error: unknown,
    action: string
  ) => void;
}

function defaultDeps(
  getLiveSnapshot: () => SetupSnapshot
): FavoriteStateDeps {
  return {
    repository: generatorSetupRepository,
    isAuthReady: () => authState.initialized,
    awaitAuthReady: awaitAuthSettled,
    getUserId: getEffectiveUserId,
    isPreviewActive: () => userPreviewState.isActive,
    getLiveSnapshot,
    notifySuccess: (message) => showToast(message, "success"),
    reportUserError: (message, error, action) => {
      getErrorHandler().showUserError({
        message,
        technicalDetails:
          error instanceof Error ? error.message : String(error),
        error:
          error instanceof Error ? error : new Error(String(error)),
        severity: "error",
        context: { module: "create", tab: "generate", action },
      });
    },
  };
}

function nextSetupName(existing: SavedGeneratorSetup[]): string {
  const names = new Set(existing.map((setup) => setup.name));
  for (let index = 1; index <= existing.length; index += 1) {
    const candidate = `Setup ${index}`;
    if (!names.has(candidate)) return candidate;
  }
  return `Setup ${existing.length + 1}`;
}

export function createFavoriteState(
  getLiveSnapshot: () => SetupSnapshot,
  overrides?: Partial<FavoriteStateDeps>
) {
  const deps: FavoriteStateDeps = {
    ...defaultDeps(getLiveSnapshot),
    ...overrides,
  };

  let setups = $state<SavedGeneratorSetup[]>([]);
  let communitySetups = $state<CommunitySetup[]>([]);
  let appliedSource = $state<ActiveSetupSource | null>(null);
  let appliedBaseline = $state<SetupSnapshot | null>(null);
  let isLoadingSetups = $state(true);
  let isLoadingCommunity = $state(true);
  let setupsLoadError = $state<string | null>(null);
  let communityLoadError = $state<string | null>(null);
  let pendingAction = $state<PendingSetupAction | null>(null);
  let personalIdentity: string | null = null;
  let personalRequestVersion = 0;
  let communityRequestVersion = 0;
  let personalInFlight: {
    userId: string;
    operation: Promise<void>;
  } | null = null;
  let communityInFlight: {
    userId: string | null;
    operation: Promise<void>;
  } | null = null;

  // A setup is active only while the live panel equals the snapshot captured
  // when it was applied. Any edit detaches it; editing back re-attaches it.
  const activeSource = $derived.by<ActiveSetupSource | null>(() => {
    if (!appliedSource || !appliedBaseline) return null;
    return setupSnapshotsEqual(appliedBaseline, deps.getLiveSnapshot())
      ? appliedSource
      : null;
  });

  const activeStatus = $derived<"active" | null>(
    activeSource ? "active" : null
  );

  const canSave = $derived(
    deps.getUserId() !== null &&
      !deps.isPreviewActive() &&
      !isLoadingSetups &&
      setupsLoadError === null &&
      setups.length < SETUP_CAP &&
      pendingAction === null
  );

  void loadPersonal();
  void loadCommunity();

  async function loadPersonal(): Promise<void> {
    if (!deps.isAuthReady()) await deps.awaitAuthReady();
    const userId = deps.getUserId();
    if (!userId) {
      personalRequestVersion += 1;
      personalInFlight = null;
      personalIdentity = null;
      setups = [];
      setupsLoadError = null;
      if (appliedSource?.kind === "setup") {
        appliedSource = null;
        appliedBaseline = null;
      }
      isLoadingSetups = false;
      return;
    }

    if (personalInFlight?.userId === userId) {
      return personalInFlight.operation;
    }

    if (personalIdentity !== userId) {
      personalIdentity = userId;
      setups = [];
      if (appliedSource?.kind === "setup") {
        appliedSource = null;
        appliedBaseline = null;
      }
    }

    const requestVersion = ++personalRequestVersion;
    isLoadingSetups = true;
    setupsLoadError = null;
    const operation = (async () => {
      try {
        const loaded = await deps.repository.loadPersonal(userId);
        if (
          requestVersion !== personalRequestVersion ||
          deps.getUserId() !== userId
        ) {
          return;
        }
        setups = loaded;
      } catch (error) {
        if (
          requestVersion !== personalRequestVersion ||
          deps.getUserId() !== userId
        ) {
          return;
        }
        setupsLoadError = "Saved setups could not load";
        console.error("[FavoriteState] loadPersonal failed:", error);
      } finally {
        if (requestVersion === personalRequestVersion) {
          personalInFlight = null;
          isLoadingSetups = false;
        }
      }
    })();
    personalInFlight = { userId, operation };
    return operation;
  }

  async function loadCommunity(): Promise<void> {
    if (!deps.isAuthReady()) await deps.awaitAuthReady();
    const userId = deps.getUserId();
    if (communityInFlight?.userId === userId) {
      return communityInFlight.operation;
    }

    const requestVersion = ++communityRequestVersion;
    isLoadingCommunity = true;
    communityLoadError = null;
    const operation = (async () => {
      try {
        const all = await deps.repository.loadCommunity(20);
        if (
          requestVersion !== communityRequestVersion ||
          deps.getUserId() !== userId
        ) {
          return;
        }
        // Own setups live in the Saved tab already.
        communitySetups = all.filter((setup) => setup.userId !== userId);
      } catch (error) {
        if (
          requestVersion !== communityRequestVersion ||
          deps.getUserId() !== userId
        ) {
          return;
        }
        communityLoadError = "Community setups could not load";
        console.error("[FavoriteState] loadCommunity failed:", error);
      } finally {
        if (requestVersion === communityRequestVersion) {
          communityInFlight = null;
          isLoadingCommunity = false;
        }
      }
    })();
    communityInFlight = { userId, operation };
    return operation;
  }

  function guardMutation(): string | null {
    const userId = deps.getUserId();
    if (!userId || deps.isPreviewActive() || pendingAction) return null;
    return userId;
  }

  async function saveCurrentSetup(): Promise<boolean> {
    const userId = guardMutation();
    if (!userId || setups.length >= SETUP_CAP) return false;

    pendingAction = { kind: "create" };
    try {
      const snapshot = deps.getLiveSnapshot();
      const created = await deps.repository.createSetup(userId, {
        name: nextSetupName(setups),
        config: snapshot.config,
        startEndOptions: snapshot.startEndOptions,
      });
      setups = [...setups, created];
      appliedSource = { kind: "setup", setupId: created.id };
      appliedBaseline = captureSetupSnapshot(
        created.config,
        created.startEndOptions
      );
      deps.notifySuccess("Saved and shared with the community");
      return true;
    } catch (error) {
      deps.reportUserError(
        "Couldn't save your setup",
        error,
        "saveCurrentSetup"
      );
      return false;
    } finally {
      pendingAction = null;
    }
  }

  async function renameSetup(
    setupId: string,
    rawName: string
  ): Promise<boolean> {
    const userId = guardMutation();
    const name = rawName.trim().slice(0, SETUP_NAME_MAX_LENGTH);
    if (!userId || !name) return false;

    pendingAction = { kind: "rename", setupId };
    try {
      await deps.repository.renameSetup(userId, setupId, name);
      setups = setups.map((setup) =>
        setup.id === setupId
          ? { ...setup, name, updatedAt: new Date() }
          : setup
      );
      deps.notifySuccess("Setup renamed");
      return true;
    } catch (error) {
      deps.reportUserError(
        "Couldn't rename the setup",
        error,
        "renameSetup"
      );
      return false;
    } finally {
      pendingAction = null;
    }
  }

  async function updateSetupFromCurrent(
    setupId: string
  ): Promise<boolean> {
    const userId = guardMutation();
    const existing = setups.find((setup) => setup.id === setupId);
    if (!userId || !existing) return false;

    pendingAction = { kind: "update", setupId };
    try {
      const snapshot = deps.getLiveSnapshot();
      const updated: SavedGeneratorSetup = {
        ...existing,
        config: snapshot.config,
        startEndOptions: snapshot.startEndOptions,
        updatedAt: new Date(),
      };
      await deps.repository.updateSetup(userId, updated);
      setups = setups.map((setup) =>
        setup.id === setupId ? updated : setup
      );
      if (
        appliedSource?.kind === "setup" &&
        appliedSource.setupId === setupId
      ) {
        appliedBaseline = snapshot;
      }
      deps.notifySuccess("Setup updated");
      return true;
    } catch (error) {
      deps.reportUserError(
        "Couldn't update the setup",
        error,
        "updateSetupFromCurrent"
      );
      return false;
    } finally {
      pendingAction = null;
    }
  }

  async function deleteSetup(setupId: string): Promise<boolean> {
    const userId = guardMutation();
    if (!userId) return false;

    pendingAction = { kind: "delete", setupId };
    try {
      await deps.repository.deleteSetup(userId, setupId);
      setups = setups.filter((setup) => setup.id !== setupId);
      if (
        appliedSource?.kind === "setup" &&
        appliedSource.setupId === setupId
      ) {
        appliedSource = null;
        appliedBaseline = null;
      }
      deps.notifySuccess("Setup deleted");
      return true;
    } catch (error) {
      deps.reportUserError(
        "Couldn't delete the setup",
        error,
        "deleteSetup"
      );
      return false;
    } finally {
      pendingAction = null;
    }
  }

  function setActiveSource(
    source: ActiveSetupSource,
    appliedSnapshot?: SetupSnapshot
  ): void {
    appliedSource = source;
    if (appliedSnapshot) {
      appliedBaseline = captureSetupSnapshot(
        appliedSnapshot.config,
        appliedSnapshot.startEndOptions
      );
      return;
    }

    const saved =
      source.kind === "setup"
        ? setups.find((setup) => setup.id === source.setupId)
        : communitySetups.find(
            (setup) => setup.setupId === source.setupId
          );
    appliedBaseline = saved
      ? captureSetupSnapshot(
          saved.config,
          saved.startEndOptions ?? null
        )
      : null;
  }

  return {
    get setups() {
      return setups;
    },
    get communitySetups() {
      return communitySetups;
    },
    get activeSource() {
      return activeSource;
    },
    get activeStatus() {
      return activeStatus;
    },
    get isLoadingSetups() {
      return isLoadingSetups;
    },
    get isLoadingCommunity() {
      return isLoadingCommunity;
    },
    get setupsLoadError() {
      return setupsLoadError;
    },
    get communityLoadError() {
      return communityLoadError;
    },
    get pendingAction() {
      return pendingAction;
    },
    get canSave() {
      return canSave;
    },

    loadPersonal,
    loadCommunity,
    saveCurrentSetup,
    renameSetup,
    updateSetupFromCurrent,
    deleteSetup,
    setActiveSource,
  };
}

export type FavoriteState = ReturnType<typeof createFavoriteState>;
```

- [ ] **Step 4: Run the state test**

Run:
```bash
npx vitest run --config tests/config/vitest.config.ts tests/unit/create/favorite-state.test.ts 2>&1 | tail -20
```
Expected: all 17 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/create/generate/state/favorite-state.svelte.ts tests/unit/create/favorite-state.test.ts
git commit -m "feat(generate): favorite state drops share paths, keys community by setup

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Auth nudge `save-setup`

**Files:**
- Modify: `src/lib/shared/auth/domain/auth-nudge-trigger.ts` (lines 16, 66-69, 165-169)
- Modify: `tests/unit/auth/auth-nudge-trigger.test.ts` (the sorted key list, around line 49)

- [ ] **Step 1: Update the test's key list**

In `tests/unit/auth/auth-nudge-trigger.test.ts`, inside the `includes the live triggers` expectation array, replace the line `"share-setup",` with `"save-setup",`. The array is `.sort()`ed so position does not matter.

- [ ] **Step 2: Run it to confirm it fails**

Run:
```bash
npx vitest run --config tests/config/vitest.config.ts tests/unit/auth/auth-nudge-trigger.test.ts 2>&1 | tail -15
```
Expected: FAIL, expected key list differs (`save-setup` vs `share-setup`).

- [ ] **Step 3: Rename the trigger**

In `src/lib/shared/auth/domain/auth-nudge-trigger.ts`:

1. In the `AuthNudgeTrigger` union, replace `| "share-setup"` with `| "save-setup"`.
2. Replace:
```ts
  // Community cards show the creator's name and avatar, so sharing a setup
  // needs a full account. The state layer blocks the write as a second gate.
  "share-setup":
    "Create a free account to share your setup with the community.",
```
with:
```ts
  // Every saved setup is public and shows the creator's name and avatar, so
  // saving needs a full account. Firestore rules block the write as a second
  // gate.
  "save-setup":
    "Create a free account to save setups. Saved setups are shared with the community.",
```
3. Replace:
```ts
  "share-setup": {
    key: "share-setup",
    title: "Share this setup",
    body: "Sign in or create an account to share this setup with the community.",
  },
```
with:
```ts
  "save-setup": {
    key: "save-setup",
    title: "Save this setup",
    body: "Sign in or create an account to save setups. Saved setups are shared with the community.",
  },
```

Then confirm nothing else references the old key:
```bash
grep -rn "share-setup" src tests
```
Expected: only `GeneratePanel.svelte:419` (fixed in Task 6). The new copy contains none of the suite's `BANNED_PHRASES` ("Sign up free", "Create Account - free", "unlock").

- [ ] **Step 4: Run the test**

Run:
```bash
npx vitest run --config tests/config/vitest.config.ts tests/unit/auth/auth-nudge-trigger.test.ts 2>&1 | tail -15
```
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/auth/domain/auth-nudge-trigger.ts tests/unit/auth/auth-nudge-trigger.test.ts
git commit -m "feat(auth): save-setup nudge replaces share-setup

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Drawer, row, panel

**Files:**
- Modify: `src/lib/features/create/generate/components/presets/SavedSetupRow.svelte`
- Modify: `src/lib/features/create/generate/components/presets/PresetDrawer.svelte`
- Modify: `src/lib/features/create/generate/components/presets/PresetDrawer.svelte.test.ts`
- Modify: `src/lib/features/create/generate/components/GeneratePanel.svelte` (lines 165-171, 419)
- Modify: `src/lib/features/create/generate/components/CardBasedSettingsContainer.svelte` (lines 68-71, 629-635)

- [ ] **Step 1: Update the drawer test**

Replace the full contents of `src/lib/features/create/generate/components/presets/PresetDrawer.svelte.test.ts` with:

```ts
import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "svelte";
import PresetDrawer from "./PresetDrawer.svelte";
import type { FavoriteState } from "../../state/favorite-state.svelte";
import type {
  CommunitySetup,
  SavedGeneratorSetup,
  PendingSetupAction,
} from "../../domain/models/favorite-config";

const NOW = new Date("2026-07-30T12:00:00Z");
const CONFIG = {
  level: 2,
  length: 8,
  gridMode: "box",
  loopEnabled: false,
} as SavedGeneratorSetup["config"];

function setup(
  id: string,
  name = `Setup ${id}`,
  length = CONFIG.length
): SavedGeneratorSetup {
  return {
    id,
    name,
    config: { ...CONFIG, length },
    startEndOptions: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function communitySetup(
  userId: string,
  setupId: string,
  displayName: string,
  name: string
): CommunitySetup {
  return {
    setupId,
    userId,
    displayName,
    name,
    config: { ...CONFIG, length: 16 },
    startEndOptions: null,
    createdAt: NOW,
  };
}

interface StateOptions {
  setups?: SavedGeneratorSetup[];
  communitySetups?: CommunitySetup[];
  activeSetupId?: string | null;
  activeStatus?: "active" | null;
  setupsLoadError?: string | null;
  pendingAction?: PendingSetupAction | null;
}

function fakeState(options: StateOptions = {}): FavoriteState {
  return {
    setups: options.setups ?? [],
    communitySetups: options.communitySetups ?? [],
    activeSource: options.activeSetupId
      ? { kind: "setup", setupId: options.activeSetupId }
      : null,
    activeStatus: options.activeStatus ?? null,
    isLoadingSetups: false,
    isLoadingCommunity: false,
    setupsLoadError: options.setupsLoadError ?? null,
    communityLoadError: null,
    pendingAction: options.pendingAction ?? null,
    canSave: true,
    loadPersonal: vi.fn(async () => undefined),
    loadCommunity: vi.fn(async () => undefined),
    saveCurrentSetup: vi.fn(async () => true),
    renameSetup: vi.fn(async () => true),
    updateSetupFromCurrent: vi.fn(async () => true),
    deleteSetup: vi.fn(async () => true),
    setActiveSource: vi.fn(),
  } as unknown as FavoriteState;
}

type PresetDrawerProps = ComponentProps<typeof PresetDrawer>;

function props(
  favoriteState: FavoriteState,
  overrides: Partial<PresetDrawerProps> = {}
): PresetDrawerProps {
  return {
    isOpen: true,
    favoriteState,
    isSignedOut: false,
    isPreview: false,
    isAnonymous: false,
    onApply: vi.fn(),
    onRequestCommunityAccount: vi.fn(),
    onRequestSaveAccount: vi.fn(),
    onRequestSignIn: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe("PresetDrawer", () => {
  it("keeps Save current setup available after setups exist", async () => {
    render(
      PresetDrawer,
      props(fakeState({ setups: [setup("1"), setup("2")] }))
    );

    await expect
      .element(page.getByRole("button", { name: "Save current setup" }))
      .toBeEnabled();
  });

  it("tells the owner that saved setups are shared", async () => {
    render(PresetDrawer, props(fakeState()));

    await expect
      .element(page.getByText("Saved setups are shared with the community."))
      .toBeVisible();
  });

  it("sends a guest to the account prompt instead of saving", async () => {
    const state = fakeState();
    const onRequestSaveAccount = vi.fn();
    render(
      PresetDrawer,
      props(state, { isAnonymous: true, onRequestSaveAccount })
    );

    await page.getByRole("button", { name: "Save current setup" }).click();

    expect(onRequestSaveAccount).toHaveBeenCalledOnce();
    expect(state.saveCurrentSetup).not.toHaveBeenCalled();
  });

  it("labels setup length in steps", async () => {
    render(
      PresetDrawer,
      props(fakeState({ setups: [setup("long", "Long setup", 16)] }))
    );

    await expect.element(page.getByText("L2 · Box · 16 steps")).toBeVisible();
    await expect
      .element(page.getByText("L2 · Box · 16ct"))
      .not.toBeInTheDocument();
  });

  it("has no share control on a saved setup row", async () => {
    render(PresetDrawer, props(fakeState({ setups: [setup("1")] })));

    await page.getByRole("button", { name: "Actions for Setup 1" }).click();

    await expect
      .element(page.getByRole("menuitem", { name: "Rename" }))
      .toBeVisible();
    await expect
      .element(page.getByRole("menuitem", { name: /share/i }))
      .not.toBeInTheDocument();
  });

  it("lists every community setup and applies by setup id", async () => {
    const onApply = vi.fn();
    render(
      PresetDrawer,
      props(
        fakeState({
          communitySetups: [
            communitySetup("austen", "a1", "Austen Cloud", "VTG 1:1"),
            communitySetup("austen", "a2", "Austen Cloud", "Diamond drills"),
          ],
        }),
        { onApply }
      )
    );

    await page.getByRole("tab", { name: "Community" }).click();
    await expect.element(page.getByText("VTG 1:1")).toBeVisible();
    await expect.element(page.getByText("Diamond drills")).toBeVisible();

    await page.getByRole("button", { name: /Diamond drills/ }).click();

    expect(onApply).toHaveBeenCalledWith({
      kind: "community",
      userId: "austen",
      setupId: "a2",
    });
  });

  it("asks guests to create an account before opening community setups", async () => {
    const onApply = vi.fn();
    const onRequestCommunityAccount = vi.fn();

    render(
      PresetDrawer,
      props(
        fakeState({
          communitySetups: [
            communitySetup("austen", "a1", "Austen Cloud", "VTG 1:1"),
          ],
        }),
        {
          isAnonymous: true,
          onApply,
          onRequestCommunityAccount,
        }
      )
    );

    await page.getByRole("tab", { name: "Community" }).click();

    expect(onRequestCommunityAccount).toHaveBeenCalledOnce();
    expect(onApply).not.toHaveBeenCalled();
    await expect
      .element(page.getByRole("tab", { name: "Saved" }))
      .toHaveAttribute("aria-selected", "true");
    await expect.element(page.getByText("Austen Cloud")).not.toBeVisible();
  });

  it("keeps load failure distinct from an empty list", async () => {
    const errorProps = props(
      fakeState({
        setupsLoadError: "Saved setups could not load",
      })
    );
    const screen = render(PresetDrawer, errorProps);

    await expect
      .element(page.getByText("Saved setups could not load"))
      .toBeVisible();
    await expect
      .element(page.getByRole("button", { name: "Try again" }))
      .toBeVisible();
    await expect
      .element(page.getByText("No saved setups yet"))
      .not.toBeInTheDocument();

    await screen.rerender(props(fakeState()));

    await expect.element(page.getByText("No saved setups yet")).toBeVisible();
    await expect
      .element(page.getByText("Saved setups could not load"))
      .not.toBeInTheDocument();
  });

  it("disables Update on the active row and enables it elsewhere", async () => {
    const active = setup("1");
    const other = setup("2");
    render(
      PresetDrawer,
      props(
        fakeState({
          setups: [active, other],
          activeSetupId: active.id,
          activeStatus: "active",
        })
      )
    );

    await page.getByRole("button", { name: "Actions for Setup 1" }).click();
    await expect
      .element(
        page.getByRole("menuitem", {
          name: "Update with current settings",
        })
      )
      .toBeDisabled();
    await page.getByRole("button", { name: "Actions for Setup 1" }).click();

    await page.getByRole("button", { name: "Actions for Setup 2" }).click();
    await expect
      .element(
        page.getByRole("menuitem", {
          name: "Update with current settings",
        })
      )
      .toBeEnabled();
  });

  it("explains that deleting removes the setup from the community", async () => {
    render(PresetDrawer, props(fakeState({ setups: [setup("1")] })));

    await page.getByRole("button", { name: "Actions for Setup 1" }).click();
    await page.getByRole("menuitem", { name: "Delete" }).click();

    await expect
      .element(
        page.getByText(
          "This removes the saved setup from your list and the community. Your current generator settings will not change."
        )
      )
      .toBeVisible();
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run:
```bash
npx vitest run --config tests/config/vitest.components.config.ts src/lib/features/create/generate/components/presets/PresetDrawer.svelte.test.ts 2>&1 | tail -30
```
Expected: FAIL (prop `onRequestSaveAccount` unknown, no shared line, community list keyed by user). If the browser project cannot launch on this machine, note the exact error and continue; the type check in Task 8 still covers the component wiring.

- [ ] **Step 3: Update `SavedSetupRow.svelte`**

Apply these edits:

1. In the destructured props, delete the lines `isShared,` and `onShareToggle,`. In the type block, delete `isShared: boolean;` and `onShareToggle: () => void;`.
2. In `menuItems`, delete the whole entry:
```ts
    {
      label: isShared ? "Unshare" : "Share as my Favorite",
      icon: "fa-solid fa-heart",
      action: onShareToggle,
      disabled: disableMutations || isBusy,
    },
```
3. In the markup, replace:
```svelte
        <span class="name-line">
          <span class="favorite-name">{setup.name}</span>
          <span
            class="shared-slot"
            class:visible={isShared}
            aria-hidden={!isShared}
          >
            Shared
          </span>
        </span>
```
with:
```svelte
        <span class="favorite-name">{setup.name}</span>
```
4. In `<style>`, delete the `.name-line { ... }`, `.shared-slot { ... }`, and `.shared-slot.visible { ... }` blocks.

- [ ] **Step 4: Update `PresetDrawer.svelte`**

Apply these edits:

1. Replace the header comment with:
```svelte
<!--
  Generator setup drawer

  Every saved setup is public: the Saved tab is the owner's own list, the
  Community tab is everyone else's. Desktop uses a compact side drawer;
  narrow layouts match the measured Generate panel bounds.
-->
```
2. In the type import, replace `CommunityFavorite,` with `CommunitySetup,`.
3. In the props destructuring and type, rename `onRequestShareAccount` to `onRequestSaveAccount` (both places).
4. Change `function summarize(item: SavedGeneratorSetup | CommunityFavorite): string {` to `function summarize(item: SavedGeneratorSetup | CommunitySetup): string {`.
5. Replace `handleCommunityApply` with:
```ts
  function handleCommunityApply(setup: CommunitySetup): void {
    if (isAnonymous) {
      onRequestCommunityAccount();
      return;
    }
    onApply({
      kind: "community",
      userId: setup.userId,
      setupId: setup.setupId,
    });
  }
```
6. Replace `isCommunitySource` with:
```ts
  function isCommunitySource(setupId: string): boolean {
    return (
      favoriteState.activeSource?.kind === "community" &&
      favoriteState.activeSource.setupId === setupId
    );
  }
```
7. Delete the whole `handleShareToggle` function and add in its place:
```ts
  function handleSaveClick(): void {
    if (isAnonymous) {
      onRequestSaveAccount();
      return;
    }
    void favoriteState.saveCurrentSetup();
  }
```
8. On the save button, change `onclick={() => void favoriteState.saveCurrentSetup()}` to `onclick={handleSaveClick}`.
9. Directly after the save button's closing `</button>`, add:
```svelte

            <p class="share-note">Saved setups are shared with the community.</p>
```
10. In the `<SavedSetupRow ... />` call, delete the `isShared={...}` line and the whole `onShareToggle={() => handleShareToggle(...)}` block (four lines).
11. In the community panel, replace the error text `Community favorites could not load` with `Community setups could not load`, change `favoriteState.communityFavorites.length === 0` to `favoriteState.communitySetups.length === 0`, and replace the empty state with:
```svelte
            <div class="empty-state">
              <i class="fa-regular fa-heart" aria-hidden="true"></i>
              <strong>No setups shared yet</strong>
              <span>Setups people save appear here.</span>
            </div>
```
12. Replace the community `{#each ...}` block with:
```svelte
              {#each favoriteState.communitySetups as setup (setup.setupId)}
                <button
                  type="button"
                  class="favorite-item community-item"
                  class:active={isCommunitySource(setup.setupId) &&
                    favoriteState.activeStatus === "active"}
                  aria-current={isCommunitySource(setup.setupId) &&
                  favoriteState.activeStatus === "active"
                    ? "true"
                    : undefined}
                  onclick={() => handleCommunityApply(setup)}
                >
                  <RobustAvatar
                    src={setup.avatar}
                    name={setup.displayName}
                    alt={`${setup.displayName}'s avatar`}
                    size="sm"
                  />
                  <span class="favorite-info">
                    <span class="favorite-name">{setup.name}</span>
                    <span class="favorite-summary"
                      >{setup.displayName} · {summarize(setup)}</span
                    >
                  </span>
                  <span class="status-slot">
                    {isCommunitySource(setup.setupId) &&
                    favoriteState.activeStatus === "active"
                      ? "Active"
                      : ""}
                  </span>
                </button>
              {/each}
```
13. Replace the `ConfirmDialog` `message` prop with:
```svelte
  message="This removes the saved setup from your list and the community. Your current generator settings will not change."
```
14. In `<style>`, directly after the `.cap-message { ... }` block, add:
```css
  .share-note {
    margin: -0.25rem 0 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.66));
    font-size: var(--font-size-compact, 12px);
    text-align: center;
  }
```

- [ ] **Step 5: Update `GeneratePanel.svelte`**

1. Replace lines 166-171:
```ts
    const saved =
      source.kind === "setup"
        ? favoriteState.setups.find((setup) => setup.id === source.setupId)
        : favoriteState.communityFavorites.find(
            (favorite) => favorite.userId === source.userId
          );
```
with:
```ts
    const saved =
      source.kind === "setup"
        ? favoriteState.setups.find((setup) => setup.id === source.setupId)
        : favoriteState.communitySetups.find(
            (setup) => setup.setupId === source.setupId
          );
```
2. Replace `onRequestShareAccount={() => authDrawerState.show("signup", "share-setup")}` with `onRequestSaveAccount={() => authDrawerState.show("signup", "save-setup")}`.

- [ ] **Step 6: Update `CardBasedSettingsContainer.svelte`**

1. In the type import (lines 68-71), replace `CommunityFavorite,` with `CommunitySetup,`.
2. Replace:
```ts
              favoriteState.communityFavorites.find(
                (favorite: CommunityFavorite) =>
                  favorite.userId === source.userId
              )?.displayName ?? "Browse"
```
with:
```ts
              favoriteState.communitySetups.find(
                (setup: CommunitySetup) => setup.setupId === source.setupId
              )?.name ?? "Browse"
```

- [ ] **Step 7: Run the drawer test and a grep for leftovers**

Run:
```bash
npx vitest run --config tests/config/vitest.components.config.ts src/lib/features/create/generate/components/presets/PresetDrawer.svelte.test.ts 2>&1 | tail -30
grep -rn "communityFavorites\|sharedSetupId\|onRequestShareAccount\|handleShareToggle\|CommunityFavorite\b\|share-setup" src tests
```
Expected: drawer tests pass (10 tests); grep prints nothing.

- [ ] **Step 8: Commit**

```bash
git add src/lib/features/create/generate/components/presets/SavedSetupRow.svelte src/lib/features/create/generate/components/presets/PresetDrawer.svelte src/lib/features/create/generate/components/presets/PresetDrawer.svelte.test.ts src/lib/features/create/generate/components/GeneratePanel.svelte src/lib/features/create/generate/components/CardBasedSettingsContainer.svelte
git commit -m "feat(generate): saved setups publish on save; community lists every setup

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Backfill script

**Files:**
- Create: `scripts/backfill-public-generator-setups.cjs`

- [ ] **Step 1: Write the script**

```js
// One-shot backfill for public generator setups.
//
// 1. Every users/{uid}/generatorSetups/{id} doc gets isPublic: true.
// 2. Every users/{uid} doc drops the retired favoriteConfig projection.
//
// Idempotent. Skips docs that already match.
//
// Usage: node scripts/backfill-public-generator-setups.cjs [--dry-run]
const admin = require("firebase-admin");
const path = require("path");

const sa = require(path.join(__dirname, "../serviceAccountKey.json"));
admin.initializeApp({ credential: admin.credential.cert(sa) });

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const db = admin.firestore();

  const setups = await db.collectionGroup("generatorSetups").get();
  let flagged = 0;
  let alreadyPublic = 0;
  for (const setupDoc of setups.docs) {
    if (setupDoc.data().isPublic === true) {
      alreadyPublic++;
      continue;
    }
    console.log(`${dryRun ? "[dry-run] " : ""}isPublic: true -> ${setupDoc.ref.path}`);
    if (!dryRun) await setupDoc.ref.update({ isPublic: true });
    flagged++;
  }

  const favorites = await db
    .collection("users")
    .where("favoriteConfig", "!=", null)
    .get();
  let cleared = 0;
  for (const userDoc of favorites.docs) {
    console.log(`${dryRun ? "[dry-run] " : ""}delete favoriteConfig -> ${userDoc.ref.path}`);
    if (!dryRun) {
      await userDoc.ref.update({
        favoriteConfig: admin.firestore.FieldValue.delete(),
      });
    }
    cleared++;
  }

  console.log(
    `setups flagged: ${flagged}, already public: ${alreadyPublic}, favoriteConfig cleared: ${cleared}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
```

- [ ] **Step 2: Dry-run it against production**

Run:
```bash
node scripts/backfill-public-generator-setups.cjs --dry-run
```
Expected (per the 2026-09-18 census): two `isPublic: true ->` lines for `users/PBp3GSBO6igCKPwJyLZNmVEmamI3/generatorSetups/...`, one `delete favoriteConfig -> users/PBp3GSBO6igCKPwJyLZNmVEmamI3`, and the summary `setups flagged: 2, already public: 0, favoriteConfig cleared: 1`. Do NOT run without `--dry-run` in this task; the live run is part of the deploy sequence in Task 9 and happens after rules ship.

- [ ] **Step 3: Commit**

```bash
git add scripts/backfill-public-generator-setups.cjs
git commit -m "chore(scripts): backfill isPublic on generator setups

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Type check and full related test run

**Files:** none new.

- [ ] **Step 1: svelte-check**

Run:
```bash
npm run check 2>&1 | tail -30
```
Expected: 0 errors. Warnings unrelated to the touched files are pre-existing; any error mentioning `favorite`, `PresetDrawer`, `SavedSetupRow`, `GeneratePanel`, `CardBasedSettingsContainer`, or `user-repository` must be fixed before continuing.

- [ ] **Step 2: Unit tests for everything touched**

Run:
```bash
npx vitest run --config tests/config/vitest.config.ts tests/unit/create tests/unit/auth/auth-nudge-trigger.test.ts tests/unit/community/get-visible-owner-profiles.test.ts tests/unit/opus-firestore-audit/community-feed-fanout.test.ts tests/unit/user-repository-social-counts.test.ts tests/unit/public-profile-field-census.test.ts src/lib/features/create/generate 2>&1 | tail -30
```
Expected: all pass.

- [ ] **Step 3: Component and rules suites**

Run:
```bash
npx vitest run --config tests/config/vitest.components.config.ts src/lib/features/create/generate 2>&1 | tail -20
npm run test:rules:core 2>&1 | tail -20
```
Expected: all pass. Report any suite that could not launch with its exact error.

- [ ] **Step 4: Fix and commit anything the checks surfaced**

If Steps 1-3 required edits, commit them with explicit pathspecs and the message `fix(generate): public setups check fixes`. If nothing changed, skip.

---

### Task 9: Integrate and deploy (Austen's call on timing)

**Files:** none.

This task is executed from the primary checkout after Austen confirms, because it merges to `main` and touches production.

- [ ] **Step 1: Bring the branch current and finish the worktree**

```powershell
Set-Location E:/tka-platform
npm run wt:finish -- codex/public-generator-setups --route /create
```

If the guarded finish reports a gate failure, stop and report it verbatim; leave the worktree intact.

- [ ] **Step 2: Deploy the index, wait, then rules**

```bash
firebase deploy --only firestore:indexes --project the-kinetic-alphabet
```
Wait for the `generatorSetups` collection-group index to show `Enabled` in the Firebase console (Firestore > Indexes > Composite). Then:
```bash
firebase deploy --only firestore:rules --project the-kinetic-alphabet
```

- [ ] **Step 3: Run the backfill for real**

```bash
node scripts/backfill-public-generator-setups.cjs
```
Expected: `setups flagged: 2, already public: 0, favoriteConfig cleared: 1`. Re-run the census script afterwards to confirm both setup docs carry `isPublic: true` and the user doc has no `favoriteConfig`.

- [ ] **Step 4: Ship the app**

Push `main` through the normal deploy path, then open the preset drawer on production as a second account (or in a guest window) and confirm the Community tab lists "VTG 1:1" and "My Favorite" under Austen's name.
