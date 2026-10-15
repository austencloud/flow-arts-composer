# Remove Sequences From Library + Purge One-Count Sequences — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let owners (and admins, for any card) right-click-remove a sequence from the browse gallery behind a confirm; block new one-count sequences at save/publish; and provide an admin Cloud Function that purges all existing one-count sequences across every user.

**Architecture:** Three layers. (1) A pure min-length helper drives client-side save/publish guards. (2) Two admin-gated Firebase callables (`purgeOneCountSequences`, `adminDeleteSequence`) use the Admin SDK to act across users where security rules forbid client writes. (3) The gallery card hosts the remove flow locally (context-menu item → `ConfirmDialog` → owner client-delete or admin callable → `notifyLibraryMutated` for reactive removal). A small admin route triggers the bulk purge dry-run-first.

**Tech Stack:** SvelteKit + Svelte 5 runes, Firebase (Firestore client SDK + Admin SDK in `firebase-functions`), vitest, bits-ui (`ConfirmDialog`), TypeScript.

**Spec:** `docs/superpowers/specs/2026-06-28-remove-and-purge-sequences-design.md`

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/lib/shared/library/domain/sequence-min-length.ts` | Pure step-count + one-count predicate | Create |
| `tests/unit/library/sequence-min-length.test.ts` | Unit tests for the helper | Create |
| `firebase-functions/src/adminPurgeOneCount.ts` | Admin callables: bulk purge + single delete | Create |
| `firebase-functions/src/index.ts` | Export the two new callables | Modify |
| `src/lib/shared/library/services/admin-sequence-actions.ts` | Client wrappers for the callables | Create |
| `src/lib/features/library/services/library-save-service.ts` | Guard UI save path | Modify |
| `src/lib/shared/library/services/library-repository.ts` | Guard repository save path | Modify |
| `src/lib/features/library/services/public-index-syncer.ts` | Guard publish path | Modify |
| `src/lib/shared/auth/services/anonymous-upgrade.ts` | Swallow too-short during migration | Modify |
| `src/lib/features/create/shared/state/save-panel-state.svelte.ts` | Disable Save when too short | Modify |
| `src/lib/shared/sequence-viewer/state/library-action-handler.svelte.ts` | Surface specific save error | Modify |
| `src/lib/shared/browse/components/ChoreoCardThumbnail/ChoreoCardThumbnail.svelte` | Remove menu item + confirm + dispatch | Modify |
| `src/routes/admin/cleanup/+page.svelte` | Admin purge trigger UI (dry-run first) | Create |

---

## Task 1: Pure min-length helper (TDD)

**Files:**
- Create: `src/lib/shared/library/domain/sequence-min-length.ts`
- Test: `tests/unit/library/sequence-min-length.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/library/sequence-min-length.test.ts
import { describe, it, expect } from "vitest";
import {
  MIN_SEQUENCE_STEPS,
  getPersistedStepCount,
  isOneCountSequence,
} from "$lib/shared/library/domain/sequence-min-length";
import { createSequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

function seq(overrides: Record<string, unknown>) {
  return createSequenceData(overrides as never);
}

describe("sequence-min-length", () => {
  it("MIN is 2", () => {
    expect(MIN_SEQUENCE_STEPS).toBe(2);
  });

  it("counts stepPairings as the source of truth", () => {
    expect(getPersistedStepCount(seq({ stepPairings: [{}, {}, {}] }))).toBe(3);
  });

  it("treats empty stepPairings as zero", () => {
    expect(getPersistedStepCount(seq({ stepPairings: [] }))).toBe(0);
  });

  it("falls back to derived steps when stepPairings absent", () => {
    expect(getPersistedStepCount(seq({ steps: [{}, {}] }))).toBe(2);
  });

  it("falls back to stored sequenceLength when both absent", () => {
    expect(getPersistedStepCount(seq({ sequenceLength: 1 }))).toBe(1);
  });

  it("flags 0 and 1 step sequences as one-count", () => {
    expect(isOneCountSequence(seq({ stepPairings: [] }))).toBe(true);
    expect(isOneCountSequence(seq({ stepPairings: [{}] }))).toBe(true);
  });

  it("does not flag 2+ step sequences", () => {
    expect(isOneCountSequence(seq({ stepPairings: [{}, {}] }))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/library/sequence-min-length.test.ts`
Expected: FAIL — cannot resolve `$lib/shared/library/domain/sequence-min-length`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/shared/library/domain/sequence-min-length.ts
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

/** Minimum number of motion steps a sequence must have to be saved or published. */
export const MIN_SEQUENCE_STEPS = 2;

/**
 * Number of motion steps from the persisted source of truth.
 *
 * `steps` is derived at load and never persisted; `stepPairings` is the persisted
 * per-step list (one entry per motion step). Prefer it, then the derived `steps`
 * array, then the optional stored `sequenceLength`. Returns 0 when none are present.
 */
export function getPersistedStepCount(sequence: SequenceData): number {
  return (
    sequence.stepPairings?.length ??
    sequence.steps?.length ??
    sequence.sequenceLength ??
    0
  );
}

/** True when a sequence has too few steps to keep — one motion step or fewer. */
export function isOneCountSequence(sequence: SequenceData): boolean {
  return getPersistedStepCount(sequence) < MIN_SEQUENCE_STEPS;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/library/sequence-min-length.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shared/library/domain/sequence-min-length.ts tests/unit/library/sequence-min-length.test.ts
git commit -m "feat(library): add one-count sequence predicate" -- src/lib/shared/library/domain/sequence-min-length.ts tests/unit/library/sequence-min-length.test.ts
```

---

## Task 2: Admin Cloud Function — purge + single delete

**Files:**
- Create: `firebase-functions/src/adminPurgeOneCount.ts`
- Modify: `firebase-functions/src/index.ts:55-59` (add export)

- [ ] **Step 1: Write the function module**

```ts
// firebase-functions/src/adminPurgeOneCount.ts
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

/** Sequences with this many motion steps or fewer are "one-count" junk. */
const ONE_COUNT_MAX = 1;

/**
 * Mirror of firestore.rules isAdmin(): the caller's user doc must have
 * role === "admin" or isAdmin === true. The Admin SDK bypasses rules, so this
 * gate is enforced in code.
 */
async function assertAdmin(
  context: functions.https.CallableContext
): Promise<string> {
  const uid = context.auth?.uid;
  if (!uid) {
    throw new functions.https.HttpsError("unauthenticated", "Must be signed in.");
  }
  const snap = await db.doc(`users/${uid}`).get();
  const data = snap.data() ?? {};
  const isAdmin = data.role === "admin" || data.isAdmin === true;
  if (!isAdmin) {
    throw new functions.https.HttpsError("permission-denied", "Admin only.");
  }
  return uid;
}

/** Persisted step count: stepPairings is the source of truth; steps is never persisted. */
function stepCount(data: FirebaseFirestore.DocumentData): number {
  if (Array.isArray(data.stepPairings)) return data.stepPairings.length;
  if (typeof data.sequenceLength === "number") return data.sequenceLength;
  return 0;
}

async function decrementSequenceCount(ownerId: string, by: number): Promise<void> {
  if (!ownerId || by <= 0) return;
  const userRef = db.doc(`users/${ownerId}`);
  await db.runTransaction(async (tx) => {
    const u = await tx.get(userRef);
    const current = (u.data()?.sequenceCount as number) ?? 0;
    tx.set(userRef, { sequenceCount: Math.max(0, current - by) }, { merge: true });
  });
}

interface PurgeResult {
  scanned: number;
  candidates: number;
  deleted: number;
  publicRemoved: number;
  sample: Array<{ id: string; ownerId: string; word: string }>;
}

/**
 * Purge all one-count sequences across every user.
 * Defaults to a dry run; pass { dryRun: false } to actually delete.
 */
export const purgeOneCountSequences = functions
  .runWith({ timeoutSeconds: 540, memory: "512MB" })
  .https.onCall(async (data, context): Promise<PurgeResult> => {
    await assertAdmin(context);
    const dryRun = data?.dryRun !== false; // anything but explicit false = dry run

    const snap = await db.collectionGroup("sequences").get();
    const result: PurgeResult = {
      scanned: snap.size,
      candidates: 0,
      deleted: 0,
      publicRemoved: 0,
      sample: [],
    };

    const candidates: Array<{
      ref: FirebaseFirestore.DocumentReference;
      id: string;
      ownerId: string;
      word: string;
    }> = [];

    for (const doc of snap.docs) {
      const d = doc.data();
      if (stepCount(d) <= ONE_COUNT_MAX) {
        // path is users/{ownerId}/sequences/{id}
        const ownerId = doc.ref.parent.parent?.id ?? "";
        const word = (d.word as string) || (d.name as string) || "";
        candidates.push({ ref: doc.ref, id: doc.id, ownerId, word });
      }
    }

    result.candidates = candidates.length;
    result.sample = candidates
      .slice(0, 25)
      .map((c) => ({ id: c.id, ownerId: c.ownerId, word: c.word }));

    if (dryRun) {
      functions.logger.info(
        `[purgeOneCount] DRY RUN scanned=${result.scanned} candidates=${result.candidates}`
      );
      return result;
    }

    const ownerDecrements = new Map<string, number>();
    let batch = db.batch();
    let ops = 0;

    for (const c of candidates) {
      batch.delete(c.ref);
      ops++;
      result.deleted++;

      const publicRef = db.doc(`publicSequences/${c.id}`);
      const publicSnap = await publicRef.get();
      if (publicSnap.exists) {
        batch.delete(publicRef);
        ops++;
        result.publicRemoved++;
      }

      ownerDecrements.set(c.ownerId, (ownerDecrements.get(c.ownerId) ?? 0) + 1);

      if (ops >= 450) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();

    for (const [ownerId, count] of ownerDecrements) {
      await decrementSequenceCount(ownerId, count);
    }

    functions.logger.info(
      `[purgeOneCount] EXECUTED scanned=${result.scanned} deleted=${result.deleted} publicRemoved=${result.publicRemoved}`
    );
    return result;
  });

/** Admin-only single delete of any user's sequence (for the gallery right-click). */
export const adminDeleteSequence = functions.https.onCall(
  async (data, context): Promise<{ deleted: boolean; publicRemoved: boolean }> => {
    await assertAdmin(context);
    const ownerId = data?.ownerId;
    const sequenceId = data?.sequenceId;
    if (
      typeof ownerId !== "string" ||
      typeof sequenceId !== "string" ||
      !ownerId ||
      !sequenceId
    ) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "ownerId and sequenceId are required."
      );
    }

    await db.doc(`users/${ownerId}/sequences/${sequenceId}`).delete();

    let publicRemoved = false;
    const publicRef = db.doc(`publicSequences/${sequenceId}`);
    const publicSnap = await publicRef.get();
    if (publicSnap.exists) {
      await publicRef.delete();
      publicRemoved = true;
    }

    await decrementSequenceCount(ownerId, 1);
    return { deleted: true, publicRemoved };
  }
);
```

- [ ] **Step 2: Export from index.ts**

In `firebase-functions/src/index.ts`, add after line 59 (`export { createDonationCheckout } ...`):

```ts
export { purgeOneCountSequences, adminDeleteSequence } from "./adminPurgeOneCount";
```

- [ ] **Step 3: Build the functions package (typecheck)**

Run: `npm --prefix firebase-functions run build`
Expected: `tsc` completes with no errors; `lib/adminPurgeOneCount.js` is emitted.

- [ ] **Step 4: Commit**

```bash
git add firebase-functions/src/adminPurgeOneCount.ts firebase-functions/src/index.ts
git commit -m "feat(functions): admin purge of one-count sequences + admin single delete" -- firebase-functions/src/adminPurgeOneCount.ts firebase-functions/src/index.ts
```

> **Deploy note:** these callables must be deployed (`firebase deploy --only functions`) before Tasks 5 and 6 work at runtime. Deploy is an outward-facing production change requiring Austen's go — do not deploy without it. Local build (Step 3) is sufficient to land the code.

---

## Task 3: Client callable wrappers

**Files:**
- Create: `src/lib/shared/library/services/admin-sequence-actions.ts`

- [ ] **Step 1: Write the wrappers**

```ts
// src/lib/shared/library/services/admin-sequence-actions.ts
import { getFunctionsInstance } from "$lib/shared/auth/firebase";

export interface PurgeOneCountResult {
  scanned: number;
  candidates: number;
  deleted: number;
  publicRemoved: number;
  sample: Array<{ id: string; ownerId: string; word: string }>;
}

/** Run the admin one-count purge. dryRun=true returns counts without deleting. */
export async function purgeOneCountSequences(
  dryRun: boolean
): Promise<PurgeOneCountResult> {
  const { httpsCallable } = await import("firebase/functions");
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<{ dryRun: boolean }, PurgeOneCountResult>(
    functions,
    "purgeOneCountSequences"
  );
  const res = await fn({ dryRun });
  return res.data;
}

/** Admin delete of any user's sequence (gallery right-click on someone else's card). */
export async function adminDeleteSequence(
  ownerId: string,
  sequenceId: string
): Promise<{ deleted: boolean; publicRemoved: boolean }> {
  const { httpsCallable } = await import("firebase/functions");
  const functions = await getFunctionsInstance();
  const fn = httpsCallable<
    { ownerId: string; sequenceId: string },
    { deleted: boolean; publicRemoved: boolean }
  >(functions, "adminDeleteSequence");
  const res = await fn({ ownerId, sequenceId });
  return res.data;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx svelte-check --tsconfig ./tsconfig.json --threshold error 2>&1 | grep -i admin-sequence-actions || echo "no errors in file"`
Expected: `no errors in file`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/shared/library/services/admin-sequence-actions.ts
git commit -m "feat(library): client wrappers for admin sequence callables" -- src/lib/shared/library/services/admin-sequence-actions.ts
```

---

## Task 4: Part B — block new one-count sequences at save/publish

**Files:**
- Modify: `src/lib/features/library/services/library-save-service.ts` (`saveSequence`)
- Modify: `src/lib/shared/library/services/library-repository.ts` (`saveSequence`, ~line 243)
- Modify: `src/lib/features/library/services/public-index-syncer.ts` (`syncToPublicIndex`, after the moderation block ~line 85)
- Modify: `src/lib/shared/auth/services/anonymous-upgrade.ts:214`
- Modify: `src/lib/features/create/shared/state/save-panel-state.svelte.ts` (`canSave`, line 148)
- Modify: `src/lib/shared/sequence-viewer/state/library-action-handler.svelte.ts` (`handleSave` catch, ~line 128)

- [ ] **Step 1: Guard the UI save path (LibrarySaveService.saveSequence)**

Add the import at the top of `library-save-service.ts`:

```ts
import { isOneCountSequence } from "$lib/shared/library/domain/sequence-min-length";
import { LibraryError } from "$lib/shared/library/domain/library-error";
```

(If `LibraryError` is already imported, don't duplicate.) At the very start of `saveSequence`, after the existing guest-identity check and before thumbnail generation, add:

```ts
if (isOneCountSequence(sequence)) {
  throw new LibraryError(
    "Too short to save — a sequence needs at least 2 steps.",
    "INVALID_DATA",
    sequence.id
  );
}
```

- [ ] **Step 2: Guard the repository save path (LibraryRepository.saveSequence)**

Add the import at the top of `library-repository.ts` (alongside the existing `LibraryError` import):

```ts
import { isOneCountSequence } from "$lib/shared/library/domain/sequence-min-length";
```

At the start of `saveSequence` (after `const userId = this.getUserId();`, before the content-hash duplicate check), add:

```ts
if (isOneCountSequence(sequence)) {
  throw new LibraryError(
    "Too short to save — a sequence needs at least 2 steps.",
    "INVALID_DATA",
    sequence.id
  );
}
```

(`saveSequenceWithMetadata` delegates to `saveSequence`, so the retro notation-adapter path is covered by this one guard.)

- [ ] **Step 3: Guard the publish path (PublicIndexSyncer.syncToPublicIndex)**

Add the import at the top of `public-index-syncer.ts`:

```ts
import { isOneCountSequence } from "$lib/shared/library/domain/sequence-min-length";
```

Immediately after the content-moderation block (after the closing brace of the `if (this.contentModerator && sequence.word)` block, before `const firestore = await getFirestoreInstance();`), add:

```ts
if (isOneCountSequence(sequence)) {
  throw new Error("Too short to publish — a sequence needs at least 2 steps.");
}
```

- [ ] **Step 4: Make guest-upgrade migration skip too-short drafts**

In `anonymous-upgrade.ts`, change line 214 from:

```ts
      if (code !== "ALREADY_EXISTS") throw error;
```

to:

```ts
      // Skip duplicates and one-count junk during migration; rethrow anything else.
      if (code !== "ALREADY_EXISTS" && code !== "INVALID_DATA") throw error;
```

- [ ] **Step 5: Disable Save in the save panel when too short**

In `save-panel-state.svelte.ts`, add the import near the other imports:

```ts
import { isOneCountSequence } from "$lib/shared/library/domain/sequence-min-length";
```

Add a derived just above `canSave` (line 148):

```ts
const isTooShort = $derived(!!sequence && isOneCountSequence(sequence));
```

Change `canSave` (line 148-150) to include it:

```ts
const canSave = $derived(
  !!tkaName && !isSaving && !isFlagged && !isExactDuplicate && !isTooShort,
);
```

- [ ] **Step 6: Surface the specific error on the viewer save path**

In `library-action-handler.svelte.ts`, change the `handleSave` catch (lines 128-131) from:

```ts
    } catch (error) {
      console.error("Failed to save sequence:", error);
      showToast("Failed to save sequence", "error");
    }
```

to:

```ts
    } catch (error) {
      console.error("Failed to save sequence:", error);
      const msg = error instanceof Error ? error.message : "Failed to save sequence";
      showToast(msg, "error");
    }
```

- [ ] **Step 7: Verify the existing migration test still passes**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/integration/auth-upgrade/anonymous-upgrade.e2e.test.ts`
Expected: PASS — the "rethrows other errors" case uses code `"SOMETHING_ELSE"`, which still propagates.

- [ ] **Step 8: Commit**

```bash
git add src/lib/features/library/services/library-save-service.ts src/lib/shared/library/services/library-repository.ts src/lib/features/library/services/public-index-syncer.ts src/lib/shared/auth/services/anonymous-upgrade.ts src/lib/features/create/shared/state/save-panel-state.svelte.ts src/lib/shared/sequence-viewer/state/library-action-handler.svelte.ts
git commit -m "feat(library): block saving/publishing one-count sequences" -- src/lib/features/library/services/library-save-service.ts src/lib/shared/library/services/library-repository.ts src/lib/features/library/services/public-index-syncer.ts src/lib/shared/auth/services/anonymous-upgrade.ts src/lib/features/create/shared/state/save-panel-state.svelte.ts src/lib/shared/sequence-viewer/state/library-action-handler.svelte.ts
```

---

## Task 5: Part A — right-click "Remove from library" on gallery cards

**Files:**
- Modify: `src/lib/shared/browse/components/ChoreoCardThumbnail/ChoreoCardThumbnail.svelte`

- [ ] **Step 1: Add imports**

In the `<script>` block, add alongside the existing imports:

```ts
import { authState } from "$lib/shared/auth/state/auth-state.svelte";
import { getLibraryRepository } from "$lib/shared/library/get-library-repository";
import { adminDeleteSequence } from "$lib/shared/library/services/admin-sequence-actions";
import { notifyLibraryMutated } from "$lib/shared/library/library-events";
import ConfirmDialog from "$lib/shared/foundation/ui/ConfirmDialog.svelte";
```

- [ ] **Step 2: Add remove state and handler**

After the `contextMenuState` declaration (line 141), add:

```ts
let removeConfirmOpen = $state(false);
let removeTarget = $state<SequenceData | null>(null);

async function performRemove() {
  const seq = removeTarget;
  if (!seq) return;
  const myUid = authState.user?.uid;
  const isOwner = !!myUid && seq.ownerId === myUid;
  try {
    if (isOwner) {
      await getLibraryRepository().deleteSequence(seq.id);
    } else {
      await adminDeleteSequence(seq.ownerId ?? "", seq.id);
    }
    // Drives the browse engine's onLibraryMutated listener: removes the card
    // from the reactive grid state and the loader cache immediately.
    notifyLibraryMutated(seq.id);
    toast.success("Removed from library");
  } catch (err) {
    console.error("Remove from library failed:", err);
    toast.error("Failed to remove sequence");
  } finally {
    removeConfirmOpen = false;
    removeTarget = null;
  }
}
```

- [ ] **Step 3: Add the menu item**

In the `contextMenuItems` derived, after the admin-only `if (featureFlagService.isAdmin) { ... }` block and before `return items;` (line 234), add:

```ts
const myUid = authState.user?.uid;
const isOwner = !!myUid && seq.ownerId === myUid;
if (isOwner || featureFlagService.isAdmin) {
  items.push(
    { type: "separator" } as ContextMenuEntry,
    {
      id: "remove-from-library",
      label: "Remove from library",
      icon: "fa-trash",
      danger: true,
      action() {
        closeContextMenu();
        removeTarget = seq;
        removeConfirmOpen = true;
      },
    },
  );
}
```

- [ ] **Step 4: Add the confirm dialog to the markup**

After the `<ContextMenu ... />` line (line 286), add:

```svelte
<ConfirmDialog
  bind:isOpen={removeConfirmOpen}
  title="Remove from library?"
  message="This permanently removes this sequence. It can't be undone."
  confirmText="Remove"
  cancelText="Keep"
  variant="danger"
  onConfirm={performRemove}
  onCancel={() => { removeConfirmOpen = false; removeTarget = null; }}
/>
```

- [ ] **Step 5: Typecheck the file**

Run: `npm run check > /tmp/check-a.log 2>&1; grep -iE "ChoreoCardThumbnail" /tmp/check-a.log || echo "no errors in ChoreoCardThumbnail"`
Expected: `no errors in ChoreoCardThumbnail`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/shared/browse/components/ChoreoCardThumbnail/ChoreoCardThumbnail.svelte
git commit -m "feat(browse): right-click remove from library on gallery cards" -- src/lib/shared/browse/components/ChoreoCardThumbnail/ChoreoCardThumbnail.svelte
```

- [ ] **Step 7: Runtime verification (requires deployed functions for the admin path)**

Open the gallery at [https://localhost:5173/browse](https://localhost:5173/browse). Right-click your own card → "Remove from library" appears → confirm → card disappears and a "Removed from library" toast shows. As admin, right-click another user's card → item appears; as a non-owner non-admin, the item is absent. Capture a screenshot or DevTools confirmation per the verification protocol.

---

## Task 6: Part C — admin purge trigger UI

**Files:**
- Create: `src/routes/admin/cleanup/+page.svelte`

- [ ] **Step 1: Write the admin page**

```svelte
<!-- src/routes/admin/cleanup/+page.svelte -->
<script lang="ts">
  import { featureFlagService } from "$lib/shared/auth/services/post-hog-feature-flag-service.svelte";
  import {
    purgeOneCountSequences,
    type PurgeOneCountResult,
  } from "$lib/shared/library/services/admin-sequence-actions";
  import ConfirmDialog from "$lib/shared/foundation/ui/ConfirmDialog.svelte";
  import { toast } from "$lib/shared/toast/state/toast-state.svelte";

  let dryRun = $state<PurgeOneCountResult | null>(null);
  let busy = $state(false);
  let confirmOpen = $state(false);

  async function runDryRun() {
    busy = true;
    try {
      dryRun = await purgeOneCountSequences(true);
    } catch (err) {
      console.error(err);
      toast.error("Dry run failed");
    } finally {
      busy = false;
    }
  }

  async function execute() {
    confirmOpen = false;
    busy = true;
    try {
      const result = await purgeOneCountSequences(false);
      toast.success(
        `Deleted ${result.deleted} sequences (${result.publicRemoved} from gallery).`
      );
      dryRun = null;
    } catch (err) {
      console.error(err);
      toast.error("Purge failed");
    } finally {
      busy = false;
    }
  }
</script>

{#if featureFlagService.isAdmin}
  <div class="admin-cleanup">
    <h1>Purge one-count sequences</h1>
    <p>
      Finds every sequence with one motion step or fewer across all users and
      deletes it from their library and the community gallery.
    </p>

    <button class="action" onclick={runDryRun} disabled={busy}>
      {busy ? "Scanning…" : "Scan (dry run)"}
    </button>

    {#if dryRun}
      <div class="results">
        <p><strong>{dryRun.candidates}</strong> one-count sequences found across
          <strong>{dryRun.scanned}</strong> scanned.</p>
        {#if dryRun.candidates > 0}
          <ul>
            {#each dryRun.sample as s (s.id)}
              <li>{s.word || "(untitled)"} — owner {s.ownerId}</li>
            {/each}
          </ul>
          <button class="action danger" onclick={() => (confirmOpen = true)} disabled={busy}>
            Delete all {dryRun.candidates}
          </button>
        {/if}
      </div>
    {/if}
  </div>

  <ConfirmDialog
    bind:isOpen={confirmOpen}
    title="Delete one-count sequences?"
    message={`${dryRun?.candidates ?? 0} sequences across all users will be permanently deleted. This cannot be undone.`}
    confirmText="Delete all"
    cancelText="Cancel"
    variant="danger"
    confirmDelay={3}
    onConfirm={execute}
    onCancel={() => (confirmOpen = false)}
  />
{:else}
  <p class="not-authorized">Not authorized.</p>
{/if}

<style>
  .admin-cleanup {
    max-width: 640px;
    margin: 0 auto;
    padding: var(--spacing-lg);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    color: var(--theme-text);
  }
  .action {
    min-height: 44px;
    padding: 0 var(--spacing-md);
    border-radius: var(--radius-md);
    border: 1px solid var(--theme-border);
    background: var(--theme-surface);
    color: var(--theme-text);
    cursor: pointer;
    align-self: flex-start;
  }
  .action.danger {
    border-color: var(--color-danger, #e5484d);
    color: var(--color-danger, #e5484d);
  }
  .action:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .results ul {
    margin: var(--spacing-sm) 0;
    padding-left: var(--spacing-md);
    font-size: 0.85rem;
    opacity: 0.85;
  }
  .not-authorized {
    padding: var(--spacing-lg);
    text-align: center;
    color: var(--theme-text);
  }
</style>
```

- [ ] **Step 2: Typecheck**

Run: `npm run check > /tmp/check-c.log 2>&1; grep -iE "admin/cleanup|admin\\\\cleanup" /tmp/check-c.log || echo "no errors in admin cleanup page"`
Expected: `no errors in admin cleanup page`.

- [ ] **Step 3: Commit**

```bash
git add src/routes/admin/cleanup/+page.svelte
git commit -m "feat(admin): one-count purge trigger page (dry-run first)" -- src/routes/admin/cleanup/+page.svelte
```

- [ ] **Step 4: Runtime verification (requires deployed functions)**

Visit [https://localhost:5173/admin/cleanup](https://localhost:5173/admin/cleanup) as admin → "Scan (dry run)" → shows candidate count + sample without deleting. Confirm a non-admin sees "Not authorized." Do NOT click "Delete all" until Austen approves the dry-run count.

---

## Task 7: Final verification gate

- [ ] **Step 1: Full typecheck**

Run: `npm run check > /tmp/check-final.log 2>&1; grep -ciE "error" /tmp/check-final.log; tail -5 /tmp/check-final.log`
Expected: 0 new errors attributable to changed files.

- [ ] **Step 2: Run the new + affected unit tests**

Run: `npx vitest run --config tests/config/vitest.config.ts tests/unit/library/sequence-min-length.test.ts tests/integration/auth-upgrade/anonymous-upgrade.e2e.test.ts`
Expected: all PASS.

- [ ] **Step 3: Functions build**

Run: `npm --prefix firebase-functions run build`
Expected: clean.

- [ ] **Step 4: Report deploy + live-purge blockers to Austen**

State plainly: code landed + typechecks; functions must be deployed (`firebase deploy --only functions`, outward-facing — needs his go); the live purge must be run dry-run-first via `/admin/cleanup` and the actual delete only after he approves the candidate count.

---

## Self-Review

**Spec coverage:**
- Part A (right-click remove, owner + admin-any, confirm) → Task 5. ✅
- Part B (block save + publish, count ≤ 1) → Task 4 (helper Task 1). ✅
- Part C (admin Cloud Function purge, dry-run, single delete) → Tasks 2, 3, 6. ✅
- "even on other people's profiles" (cross-user) → Admin SDK callables (Task 2). ✅
- Reactive card removal → `notifyLibraryMutated` (Task 5 Step 2). ✅
- No rules change → none in file list. ✅

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✅

**Type consistency:** `isOneCountSequence`/`getPersistedStepCount`/`MIN_SEQUENCE_STEPS` (Task 1) used verbatim in Task 4. `purgeOneCountSequences(dryRun)` / `adminDeleteSequence(ownerId, sequenceId)` signatures match between server (Task 2), client wrapper (Task 3), card (Task 5), and admin page (Task 6). `PurgeOneCountResult` shape identical between server return and client interface. ✅

**Known runtime dependency:** Tasks 5 (admin path) and 6 require the Task 2 functions deployed. The owner self-delete path in Task 5 works without deploy (pure client). Flagged in Task 2 deploy note and Task 7.
