---
status: backlog
value: 3
effort: M
remaining: Audit the Firebase cost baseline and each optimization owner before implementation; the prior queue note did not establish current state.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
work_state: unverified
---

# Firebase Cost Optimization Design

**Date:** 2026-05-23
**Status:** Backlog
**Impact:** Reduces Firestore read billing by an estimated 60-80% at 10K+ users

---

## Problem

Five query patterns in the codebase generate unbounded or redundant Firestore reads that scale linearly (or worse) with user count.

### 1. Admin services fetch entire `users` collection

Three services issue `getDocs(collection(firestore, "users"))` with no `where()` clause, no `limit()`, and no pagination. Each call reads every document in the collection.

| Service | File | Line | Trigger |
|---------|------|------|---------|
| `EventActivityAnalyzer` | `src/lib/features/admin/services/EventActivityAnalyzer.ts` | 93 | `getUserActivityFromLastActivityDate()` fallback |
| `SystemStateManager` | `src/lib/features/admin/services/SystemStateManager.ts` | 103 | `loadUsers()` via `getSystemState()` |
| `UserActivityTracker` | `src/lib/features/admin/services/UserActivityTracker.ts` | 35 | `getAllUsersWithPresence()` |

`UserActivityTracker.subscribeToAllUsers()` (line 93) also attaches an `onSnapshot` listener on the full `users` collection. Every document change across the entire collection triggers a read of the full snapshot.

At 10K users each call costs 10K reads. `SystemStateManager` caches for 2 minutes, but a page refresh resets the cache. The analyzer and tracker have no caching at all.

### 2. Firestore rules role-check functions issue `get()` reads

```javascript
function isAdmin() {
  let userData = get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
  return isAuthenticated()
    && (userData.role == 'admin' || userData.isAdmin == true);
}
```

`isAdmin()`, `isTester()`, and `isPremium()` each call `get()` on the user document. Firestore bills each `get()` in a security rule as one document read. Current usage:

| Function | Invocations in rules | Extra read per evaluated request |
|----------|---------------------|--------------------------------|
| `isAdmin()` | 101 call sites | 1 read per request that evaluates it |
| `isTester()` | 8 call sites | 1 read per request that evaluates it |
| `isPremium()` | 1 call site | 1 read per request that evaluates it |
| `isApprovedDeveloper()` | uses `exists()` + `get()` | 1-2 reads per request |
| `isDeveloperAdmin()` | calls `isApprovedDeveloper()` + another `get()` | 2-3 reads per request |
| `isAgeVerified()` | calls `get()` | 1 read per request |

Many rules combine these: e.g., `allow delete: if isOwner(userId) || isAdmin()` evaluates `isAdmin()` for non-owners, costing 1 extra read. Rules with `isTester()` or `isApprovedDeveloper()` in OR chains may incur 2-3 extra reads per request if earlier conditions fail.

Custom claims already exist in the codebase (`scripts/set-admin-claims.js`, `syncSubscriptionRole` Cloud Function) but the security rules don't use `request.auth.token` -- they always fetch from Firestore.

### 3. `fetchUserDetails()` issues N individual `getDoc()` calls

`EventActivityAnalyzer.fetchUserDetails()` (line 299) maps over user IDs and fires individual `getDoc()` calls wrapped in `Promise.all`. This is N reads for N unique users in the activity feed. The codebase already has a batching pattern using `where(documentId(), "in", chunk)` in `user-repository.ts:249` that reduces this to ceil(N/30) reads.

### 4. Arena `loadPool()` fetches entire `publicSequences` collection

`arena-repository.ts:44` does `getDocs(collection(firestore, PUBLIC_SEQUENCES_COLLECTION))` with no `where()`, no `limit()`, no pagination. Additionally, for every document it calls `getOrCreateRating()` which does another `getDoc()` (and potentially a `set()`) per candidate. At 1K public sequences this is 1K + 1K = 2K reads minimum, every time the arena initializes.

---

## Proposed Changes

### Fix 1: Scope admin user queries

**EventActivityAnalyzer.getUserActivityFromLastActivityDate()**

This method only needs users who were active within the `startDate` to `startDate + days` window. Add a `where()` clause:

```typescript
// Before
const usersRef = collection(firestore, "users");
const snapshot = await getDocs(usersRef);

// After
const usersRef = collection(firestore, "users");
const rangeStart = Timestamp.fromDate(startDate);
const endDate = new Date(startDate);
endDate.setDate(endDate.getDate() + days);
const rangeEnd = Timestamp.fromDate(endDate);

const q = query(
  usersRef,
  where("lastActivityDate", ">=", rangeStart),
  where("lastActivityDate", "<=", rangeEnd)
);
const snapshot = await withTimeout(getDocs(q), QUERY_TIMEOUT_MS, null);
```

Requires a composite index on `users` for `lastActivityDate` (single-field ascending is sufficient).

At 10K users with ~200 active in a 30-day window: 200 reads instead of 10K.

**SystemStateManager.loadUsers()**

This powers the admin dashboard user list. Options:
- **Option A (recommended):** Add `orderBy("lastActivityDate", "desc")` + `limit(500)`. Admin dashboards rarely need every user; the 500 most recently active covers all realistic admin workflows.
- **Option B:** Paginate with cursor-based pagination using `startAfter()`. More complex, but needed if admin wants to browse the full list.

```typescript
// Option A
const q = query(
  usersRef,
  orderBy("lastActivityDate", "desc"),
  limit(500)
);
const snapshot = await withTimeout(getDocs(q), QUERY_TIMEOUT_MS, null);
```

At 10K users: 500 reads instead of 10K (95% reduction).

**UserActivityTracker.getAllUsersWithPresence()**

This is admin-only. Same approach as SystemStateManager -- limit to recently active users:

```typescript
const q = query(
  usersRef,
  orderBy("lastActivityDate", "desc"),
  limit(200)
);
const usersSnapshot = await getDocs(q);
```

**UserActivityTracker.subscribeToAllUsers()**

The `onSnapshot` on the full `users` collection is the most expensive pattern because it triggers on every write to any user document. Replace with a scoped listener:

```typescript
const q = query(usersRef, orderBy("lastActivityDate", "desc"), limit(200));
unsubscribeFirestore = onSnapshot(q, (snapshot) => { ... });
```

This reduces the listener scope to the 200 most recently active users. Changes to dormant user documents no longer trigger snapshot reads.

### Fix 2: Migrate role checks to custom claims

The infrastructure already exists. `scripts/set-admin-claims.js` sets `{ admin: true, role: "admin" }` on the auth token. `syncSubscriptionRole` sets `{ role: "premium" }`. But the security rules ignore these claims entirely.

**Step 2a: Ensure all role changes set custom claims**

Audit all code paths that modify `users/{uid}.role`:
- `set-admin-claims.js` -- already sets claims
- `syncSubscriptionRole` Cloud Function -- already sets claims
- Admin UI role changes (if any) -- need to call `auth().setCustomUserClaims()` via a Cloud Function

Add a Cloud Function trigger on `users/{userId}` writes that detects `role` field changes and syncs claims:

```typescript
export const syncRoleClaims = functions.firestore
  .document("users/{userId}")
  .onWrite(async (change, context) => {
    const { userId } = context.params;
    const newRole = change.after.exists ? change.after.data()?.role : null;
    const oldRole = change.before.exists ? change.before.data()?.role : null;
    if (newRole === oldRole) return null;

    const currentClaims = (await admin.auth().getUser(userId)).customClaims || {};
    await admin.auth().setCustomUserClaims(userId, {
      ...currentClaims,
      role: newRole ?? "user",
      admin: newRole === "admin",
      tester: newRole === "tester" || newRole === "admin",
      premium: newRole === "premium" || newRole === "tester" || newRole === "admin",
    });
    return null;
  });
```

**Step 2b: Rewrite security rule helper functions**

```javascript
// Before
function isAdmin() {
  let userData = get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
  return isAuthenticated()
    && (userData.role == 'admin' || userData.isAdmin == true);
}

// After -- zero Firestore reads
function isAdmin() {
  return isAuthenticated()
    && request.auth.token.admin == true;
}

function isTester() {
  return isAuthenticated()
    && request.auth.token.tester == true;
}

function isPremium() {
  return isAuthenticated()
    && request.auth.token.premium == true;
}
```

For `isAgeVerified()`, the `ageVerifiedAt` field is user-specific and infrequently checked (only Hall of Shame). Keep it as a `get()` or add an `ageVerified` custom claim set when the user verifies.

For `isApprovedDeveloper()` / `isDeveloperAdmin()` / `isContributor()`: these read from the `developers` collection. Two options:
- **Low effort:** Keep as `get()` -- developer operations are low-frequency.
- **Full optimization:** Add `developer: true`, `developerRole: "admin"|"contributor"` claims. Requires claim sync when `developers/{uid}` changes.

Recommendation: Migrate `isAdmin`/`isTester`/`isPremium` immediately (high frequency). Leave developer functions as `get()` for now (low frequency).

**Step 2c: Migration safety**

Custom claims propagate on the next token refresh (up to 1 hour, or on sign-out/sign-in). During the migration window, use a fallback:

```javascript
function isAdmin() {
  return isAuthenticated()
    && (request.auth.token.admin == true
        || get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin');
}
```

After all users have refreshed tokens (wait 2-3 days, or force token refresh via client-side `getIdToken(true)` on app load), remove the fallback `get()`.

### Fix 3: Batch `fetchUserDetails()` using `documentId()` IN queries

Replace the N individual `getDoc()` calls with chunked `where(documentId(), "in", chunk)` queries. The codebase already has this pattern in `user-repository.ts:249`.

```typescript
// Before (EventActivityAnalyzer.ts:299)
const userPromises = userIds.map(async (userId) => {
  const userDocRef = doc(firestore, `users/${userId}`);
  const userDoc = await getDoc(userDocRef);
  // ...
});
const results = await Promise.all(userPromises);

// After
const BATCH_SIZE = 30; // Firestore "in" query limit
const userMap = new Map<string, UserDisplayDetails>();

for (let i = 0; i < userIds.length; i += BATCH_SIZE) {
  const chunk = userIds.slice(i, i + BATCH_SIZE);
  const usersRef = collection(firestore, "users");
  const batchQuery = query(usersRef, where(documentId(), "in", chunk));
  const batchSnapshot = await getDocs(batchQuery);

  for (const docSnap of batchSnapshot.docs) {
    userMap.set(docSnap.id, extractUserDisplayDetails(docSnap.data()));
  }
}

// Fill in missing users
for (const userId of userIds) {
  if (!userMap.has(userId)) {
    userMap.set(userId, { displayName: "Unknown User", photoURL: null, email: null });
  }
}
```

At 50 unique users: 2 reads (2 batches of 30) instead of 50 individual reads. The Firestore `in` operator counts as 1 read per matching document, but the query itself is a single round-trip, which reduces latency.

Note: Firestore `in` queries bill per document returned, not per query. The read count stays the same (N matching docs = N reads). The improvement here is **latency** (1-2 round-trips vs 50) and **connection overhead**, not read billing. This fix is still worthwhile for performance but does not reduce cost.

### Fix 4: Add `limit()` and `where()` to arena `loadPool()`

The arena only needs loop sequences. `loadPool()` already filters `if (!loopType) continue`, but after reading every document. Move the filter to the query:

```typescript
// Before
const publicSnap = await getDocs(collection(firestore, PUBLIC_SEQUENCES_COLLECTION));

// After
const publicRef = collection(firestore, PUBLIC_SEQUENCES_COLLECTION);
const q = query(
  publicRef,
  where("loopType", "!=", null),
  limit(500) // Arena doesn't need more than 500 candidates for matchmaking
);
const publicSnap = await getDocs(q);
```

Requires a composite index on `publicSequences` for `loopType` (inequality filter).

Additionally, `loadPool()` calls `getOrCreateRating()` for every candidate sequentially. This is N additional `getDoc()` calls. Batch-fetch existing ratings:

```typescript
// Batch-fetch all ratings for candidates
const candidateIds = publicSnap.docs
  .filter(d => d.data().word && d.data().loopType)
  .map(d => d.id);

const existingRatings = new Map<string, ArenaRating>();
for (let i = 0; i < candidateIds.length; i += BATCH_SIZE) {
  const chunk = candidateIds.slice(i, i + BATCH_SIZE);
  const ratingsRef = collection(firestore, RATINGS_COLLECTION);
  const batchQuery = query(ratingsRef, where(documentId(), "in", chunk));
  const batchSnap = await getDocs(batchQuery);
  for (const docSnap of batchSnap.docs) {
    existingRatings.set(docSnap.id, parseRating(docSnap));
  }
}
```

At 1K public sequences with 300 having loopType: reduces from 1K + 1K = 2K reads to 300 + ceil(300/30) = 310 reads.

---

## Cost Projection

### Assumptions
- 10K users in `users` collection
- ~200 active users per 30-day window
- Admin dashboard loaded 20 times/day (by 1-2 admins)
- 1K public sequences, 300 with loopType
- Arena initialized 50 times/day
- 5K authenticated requests/day that evaluate `isAdmin()` in rules
- 500 requests/day that evaluate `isTester()`

### Current daily read cost

| Source | Reads per invocation | Daily invocations | Daily reads |
|--------|---------------------|-------------------|-------------|
| `SystemStateManager.loadUsers()` | 10,000 | 20 | 200,000 |
| `EventActivityAnalyzer` fallback | 10,000 | 5 | 50,000 |
| `UserActivityTracker.getAllUsersWithPresence()` | 10,000 | 10 | 100,000 |
| `UserActivityTracker.subscribeToAllUsers()` onSnapshot | 10,000 (initial) + churn | 5 listeners | 50,000+ |
| `isAdmin()` in rules | 1 | 5,000 | 5,000 |
| `isTester()` in rules | 1 | 500 | 500 |
| Arena `loadPool()` | 2,000 | 50 | 100,000 |
| `fetchUserDetails()` N=50 | 50 | 20 | 1,000 |
| **Total** | | | **~506,500** |

At $0.06/100K reads = **$0.30/day = $9.12/month**

### Optimized daily read cost

| Source | Reads per invocation | Daily invocations | Daily reads |
|--------|---------------------|-------------------|-------------|
| `SystemStateManager.loadUsers()` | 500 | 20 | 10,000 |
| `EventActivityAnalyzer` fallback | 200 | 5 | 1,000 |
| `UserActivityTracker.getAllUsersWithPresence()` | 200 | 10 | 2,000 |
| `UserActivityTracker.subscribeToAllUsers()` onSnapshot | 200 (initial) + scoped churn | 5 listeners | 2,000 |
| `isAdmin()` in rules | 0 | 5,000 | 0 |
| `isTester()` in rules | 0 | 500 | 0 |
| Arena `loadPool()` | 310 | 50 | 15,500 |
| `fetchUserDetails()` N=50 | 50 (same billing, better latency) | 20 | 1,000 |
| **Total** | | | **~31,500** |

At $0.06/100K reads = **$0.02/day = $0.57/month**

### Savings: ~94% reduction in reads, ~$8.55/month saved

These numbers scale linearly with user count. At 100K users the current pattern would cost ~$91/month; the optimized version stays under $6/month.

---

## Indexes Required

1. `users` collection: single-field index on `lastActivityDate` (ascending) -- likely auto-created
2. `publicSequences` collection: single-field index on `loopType` -- needs manual creation if inequality filter used

---

## Migration Sequence

1. **Phase 1 (zero risk):** Add `limit()` and `where()` to admin queries. No schema changes, no rule changes. Deploy client code only.
2. **Phase 2 (zero risk):** Batch `fetchUserDetails()` with `documentId()` IN queries. Client-only change.
3. **Phase 3 (zero risk):** Add `where("loopType", "!=", null)` and `limit(500)` to arena `loadPool()`. Batch-fetch ratings. Client-only change.
4. **Phase 4 (requires coordination):**
   - Deploy `syncRoleClaims` Cloud Function
   - Run a one-time backfill script to set claims for all existing users
   - Deploy updated `firestore.rules` with dual-path (claims + fallback `get()`)
   - Wait 3 days for token propagation
   - Deploy final rules removing the `get()` fallback
5. **Phase 5 (cleanup):** Remove `isAdmin` boolean field references from rules (legacy field, superseded by `role`).

---

## Risks and Mitigations

| Risk | Mitigation |
|------|-----------|
| Custom claims have a 1000-byte size limit | Current claims are ~50 bytes. No risk. |
| Claims don't propagate until token refresh | Dual-path rules during migration; force `getIdToken(true)` on app startup |
| `limit(500)` misses users for admin workflows | Admin can add a "Load All" button that removes the limit; this is an explicit opt-in to the expensive query |
| `where("loopType", "!=", null)` excludes null-but-falsy values | `loopType` is always null or a non-empty string; no edge case |
| `onSnapshot` scope reduction misses offline users in admin panel | Offline users are still visible via the initial query; only real-time updates are scoped |
