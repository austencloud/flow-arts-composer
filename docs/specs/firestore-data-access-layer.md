# Firestore Data Access Layer

Date: 2026-05-03
Status: Draft
Scope: Shared Firestore utilities + Zod boundary validation + repository consolidation

## Problem

20 Firestore repositories independently implement the same CRUD boilerplate. Each one:

1. Calls `await getFirestoreInstance()` (20/20 files)
2. Builds a collection/doc reference from a string path (20/20)
3. Calls `getDoc`/`getDocs` and checks `.exists()` (20/20)
4. Casts raw `DocumentData` to a domain type with `as MyType` — no runtime validation (20/20)
5. Converts Firestore `Timestamp` to JS `Date` — 3+ independent implementations
6. Strips `undefined` values before writes — 2+ independent implementations
7. Applies `serverTimestamp()` on create/update (15/20)
8. Calls `trackWrite()` for offline sync (10/20)
9. Guards with `authState.effectiveUserId` (10/20)

The `as MyType` cast at step 4 is the root cause of **3,130 optional chaining (`?.`) calls** downstream. Data enters the system unvalidated, so every consumer defends itself against possibly-malformed data. If validation happened at the boundary, inner code could trust its types.

### Duplicated helper functions (written independently)

| Helper | Locations | Lines each |
|--------|-----------|-----------|
| `toDate(timestamp)` | voice-session-repository, hand-path-repository, tika-session-repository | 5-10 |
| `toDateOrUndefined(value)` | HandPathRepository | 6 |
| `stripUndefined(obj)` | firebase-composition-repository | 17 |
| `JSON.parse(JSON.stringify(x))` | festival-repository | 1 (inline) |
| `getUserId()` auth guard | voice-session-repository, tika-session-repository | 5 |

### The 20 Firestore repositories

| # | File | Collection | Lines | Complexity |
|---|------|------------|-------|------------|
| 1 | festival-repository.ts | festivals/{id} | 50 | Simple CRUD |
| 2 | festival-attendance-repository.ts | festivalAttendance | ~60 | Simple CRUD |
| 3 | festival-tracker-repository.ts | festivalTrackers | ~60 | Simple CRUD |
| 4 | workshop-portfolio-repository.ts | workshopPortfolios | ~60 | Simple CRUD |
| 5 | user-location-repository.ts | userLocations/{uid} | ~100 | Simple CRUD + geo |
| 6 | LOOPLabelsFirebaseRepository.ts | loop-labels/{word} | ~100 | CRUD + localStorage cache |
| 7 | SpinnerMetricsRepository.ts | spinnerMetrics | ~80 | Simple CRUD |
| 8 | BroadcastRepository.ts | broadcasts | ~100 | CRUD + realtime |
| 9 | PropGeometryAdjustmentRepository.ts | propGeometryAdjustments | ~80 | Simple CRUD |
| 10 | GlobalArrowAdjustmentRepository.ts | globalArrowAdjustments | ~100 | Simple CRUD |
| 11 | firebase-composition-repository.ts | users/{uid}/compositions | ~150 | CRUD + stripUndefined |
| 12 | voice-session-repository.ts | users/{uid}/voiceSessions | ~150 | CRUD + auth + dates |
| 13 | HandPathRepository.ts | users/{uid}/handPaths | ~200 | CRUD + filters + visibility |
| 14 | SoloPropRepository.ts | users/{uid}/soloProps | ~200 | CRUD + filters + visibility |
| 15 | tika-session-repository.ts | users/{uid}/tikaConversations | ~300 | CRUD + realtime + transactions |
| 16 | arena-repository.ts | arenaRatings/Votes/Snapshots | 342 | Multi-collection + batch |
| 17 | user-repository.ts | users/{uid} | ~400 | Read-heavy + pagination + realtime |
| 18 | FeedbackRepository.ts | feedback | ~200 | CRUD + queries |
| 19 | SequenceRepository.ts | local Dexie + Firestore | ~200 | Hybrid local/remote |
| 20 | LibraryRepository.ts | users/{uid}/sequences | 1,555 | Complex domain + batch + realtime |

## Solution

### Layer 1: Shared Firestore Utilities (`src/lib/shared/firestore/`)

```
src/lib/shared/firestore/
  firestore-crud.ts        — firestoreGet, firestoreList, firestoreSet, firestoreDelete
  firestore-helpers.ts     — toDate, stripUndefined, requireAuth, buildRef
  firestore-types.ts       — shared types (QueryConstraints, PaginationOptions, etc.)
```

Core API (functions, not classes):

```typescript
import { z } from 'zod';

// Get a single document, validated at boundary
async function firestoreGet<T>(
  collectionPath: string,
  id: string,
  schema: z.ZodType<T>
): Promise<T | null>

// List documents with optional query constraints
async function firestoreList<T>(
  collectionPath: string,
  schema: z.ZodType<T>,
  options?: { where?: WhereClause[]; orderBy?: string; limit?: number; startAfter?: unknown }
): Promise<T[]>

// Write a document (strips undefined, adds timestamps, tracks offline)
async function firestoreSet<T>(
  collectionPath: string,
  id: string | null, // null = auto-generate
  data: T,
  options?: { merge?: boolean; trackOffline?: boolean }
): Promise<string> // returns id

// Delete a document
async function firestoreDelete(
  collectionPath: string,
  id: string
): Promise<void>
```

### Layer 2: Zod Schemas for Domain Models

Each repository's domain model gets a Zod schema colocated with its type:

```typescript
// Before: types only (compile-time fiction)
export interface Festival {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
}

// After: schema + inferred type (runtime-validated)
export const FestivalSchema = z.object({
  id: z.string(),
  name: z.string(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
});
export type Festival = z.infer<typeof FestivalSchema>;
```

The `z.coerce.date()` handles Firestore Timestamps automatically — kills all custom `toDate()` helpers.

### Layer 3: Migrated Repositories

Simple repos collapse to near-nothing:

```typescript
// festival-repository.ts — AFTER (entire file)
import { firestoreGet, firestoreList, firestoreSet, firestoreDelete } from '#lib/shared/firestore/firestore-crud.js';
import { FestivalSchema, type Festival } from '../domain/models/festival';

const COLLECTION = 'festivals';

export const getById = (id: string) => firestoreGet(COLLECTION, id, FestivalSchema);
export const list = () => firestoreList(COLLECTION, FestivalSchema);
export const create = (data: Omit<Festival, 'id'>) => firestoreSet(COLLECTION, null, data);
export const update = (id: string, data: Partial<Festival>) => firestoreSet(COLLECTION, id, data, { merge: true });
export const remove = (id: string) => firestoreDelete(COLLECTION, id);
```

Complex repos (LibraryRepository, arena-repository) keep their domain logic but delegate all Firestore plumbing to the shared layer.

## Migration Strategy

**Phase A** — Build shared utilities (no existing code changes)
- `firestore-crud.ts`, `firestore-helpers.ts`, `firestore-types.ts`
- Add `zod` dependency
- Unit tests for the shared layer

**Phase B** — Migrate simple repos (1-8 in the table above)
- 8 repositories, each under 100 lines
- Each becomes 10-20 lines
- Add Zod schemas for their domain models
- Low risk — these repos have minimal consumers

**Phase C** — Migrate medium repos (9-16)
- 8 repositories, 100-300 lines each
- More consumers, need careful import updates
- Some have realtime listeners (onSnapshot) — shared layer needs a `firestoreListen` helper

**Phase D** — Migrate complex repos (17-20)
- LibraryRepository (1,555 lines) — extract domain logic from CRUD plumbing
- user-repository (400 lines) — complex queries, pagination
- arena-repository (342 lines) — multi-collection batch operations
- These may not fully collapse but their Firestore calls become validated

## Dependencies

- `zod` package (already peer-dep of some tools; needs explicit install)
- Ceremony retirement Phase 5 should complete first (class→function conversion simplifies migration)

## Success Metrics

| Metric | Before | After |
|--------|--------|-------|
| Independent Firestore init calls | 20+ | 0 (centralized) |
| `as MyType` casts on Firestore data | 20+ | 0 (Zod validated) |
| Custom toDate/toDateOrUndefined helpers | 3+ | 0 (z.coerce.date) |
| stripUndefined implementations | 2+ | 0 (centralized) |
| Optional chaining from unvalidated data | ~3,130 | Significant reduction* |
| Total repository lines | ~4,500 | ~2,000 |

*Not all 3,130 `?.` are from Firestore — some are legitimate optional fields. But the unvalidated-data-driven ones should disappear.

## Non-Goals

- Replacing Dexie/IndexedDB repositories (those 5 have a different backend)
- Changing Firestore security rules
- Adding offline-first sync beyond the existing `trackWrite` pattern
- Abstracting away Firestore entirely (repositories still import `firebase/firestore` for advanced queries)
