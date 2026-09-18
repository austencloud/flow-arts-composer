# Public Generator Setups

**Date:** 2026-09-18
**Status:** APPROVED (Austen, 2026-09-18)
**Branch:** `codex/public-generator-setups`

## Problem

Saving a generator setup and sharing it with the community are two separate
steps today. A saved setup lives privately at
`users/{uid}/generatorSetups/{id}`. The Community tab in the preset drawer
reads a different thing entirely: one `favoriteConfig` map projected onto the
user doc when the owner presses "Share as my Favorite". That gives one shared
setup per person, requires a second click nobody makes, and (per a 2026-09-18
admin census) has produced exactly one community entry in the whole database,
which is Austen's own.

Austen wants every saved setup to appear in the community automatically.

## Decisions

- **Save is publish.** Every saved setup is public. There is no per-setup
  hide toggle. Delete is the only way to remove a setup from the community.
- **Guests cannot save.** Saving as an anonymous account opens the existing
  signup drawer instead of writing anything. Full accounts save as before.
- **Own setups stay out of the Community tab.** They are already in Saved.
- **The `favoriteConfig` projection and its lazy migration are removed.**
  The only legacy favorite in the database was already migrated into a real
  setup doc, so the migration path has no remaining work.

## Data model

`users/{uid}/generatorSetups/{setupId}`:

```
name: string
config: map
startEndOptions: map | null
isPublic: true            // new, always true, written on create and update
createdAt: timestamp
updatedAt: timestamp
```

`isPublic` exists so the collection-group read rule has a provably safe
predicate, mirroring `collections.isPublic`. The client never writes `false`.

`users/{uid}.favoriteConfig` is no longer read or written. It stays in the
rules' `ownerProfileFields` and `publicProfileFields` allow-lists and in
`tests/unit/public-profile-field-census.test.ts` so legacy user docs keep
passing `isSafePublicProfile`. A one-shot backfill deletes the field from the
live docs that have it.

## Firestore rules

Add a recursive-wildcard rule for collection-group reads, placed with the
other `/{path=**}` rules:

```
match /{path=**}/generatorSetups/{setupId} {
  allow read: if resource.data.isPublic == true;
}
```

Tighten the per-user rule:

```
match /generatorSetups/{setupId} {
  allow read: if isOwner(userId) || isAdmin();
  allow create, update: if isOwner(userId)
    && isFullUser()
    && request.resource.data.isPublic == true;
  allow delete: if isOwner(userId);
}
```

Rules integration tests (`tests/integration/firestore-rules/firestore.rules.test.ts`):

- Full owner creates with `isPublic: true`, reads, updates, deletes.
- Anonymous owner create is denied.
- Full owner create without `isPublic: true` (or with `false`) is denied.
- A different signed-in user can `get` a public setup and can run
  `collectionGroup("generatorSetups").where("isPublic", "==", true)`.
- A bare unfiltered collection-group query is denied.
- Admin can still read another user's setup directly.

## Index

`firestore.indexes.json` gains:

```
{
  "collectionGroup": "generatorSetups",
  "queryScope": "COLLECTION_GROUP",
  "fields": [
    { "fieldPath": "isPublic", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

## Repository (`services/favorite-config-repository.ts`)

Interface after the change:

```ts
interface GeneratorSetupRepository {
  loadPersonal(userId: string): Promise<SavedGeneratorSetup[]>;
  loadCommunity(limit?: number): Promise<CommunitySetup[]>;
  createSetup(userId: string, draft: SavedSetupDraft): Promise<SavedGeneratorSetup>;
  renameSetup(userId: string, setupId: string, name: string): Promise<void>;
  updateSetup(userId: string, setup: SavedGeneratorSetup): Promise<void>;
  deleteSetup(userId: string, setupId: string): Promise<void>;
}
```

- `loadPersonal` lists the subcollection ordered by `createdAt`. No user-doc
  read, no migration planning.
- `loadCommunity(limit = 20)` runs
  `collectionGroup("generatorSetups") where isPublic == true orderBy createdAt desc limit N`
  via the Firestore SDK directly (`firestoreList` has no collection-group
  support). Owner id comes from `ref.parent.parent.id`; docs without a parent
  user are skipped. Author display resolves through a new
  `getVisibleOwnerProfiles(userIds)` in
  `$lib/shared/community/services/user-repository.ts`, a sibling of
  `getVisibleOwnerNames` that returns `{ displayName, photoURL }` and applies
  the same hidden/guest/legacy-profile suppression. Setups whose owner is
  suppressed are dropped from the result.
- `createSetup` writes `isPublic: true` alongside name/config/startEndOptions.
  `firestoreSet` adds the timestamps.
- `updateSetup` merges config/startEndOptions/`isPublic: true`/updatedAt. No
  batch, no user-doc write.
- `deleteSetup` deletes the doc.
- Removed: `shareSetup`, `unshareSetup`, `sharedProjection`,
  `commitMigrationWrite`, `scheduleMigrationWrite`, `waitForPendingMigration`,
  `pendingMigrationWrites`, and the `PUBLIC_PROFILE_VERSION` import.
- Deleted files: `domain/setup-migration.ts` and its tests.

## Models (`domain/models/favorite-config.ts` and `-schemas.ts`)

```ts
interface CommunitySetup {
  setupId: string;
  userId: string;
  displayName: string;
  avatar?: string;
  name: string;
  config: UIGenerationConfig;
  startEndOptions: StartEndOptions | null;
  createdAt: Date;
}

type ActiveSetupSource =
  | { kind: "setup"; setupId: string }
  | { kind: "community"; userId: string; setupId: string };

type PendingSetupAction =
  | { kind: "create" }
  | { kind: "rename" | "update" | "delete"; setupId: string };
```

Removed types: `FavoriteConfig`, `CommunityFavorite`,
`SharedGeneratorFavorite`, `PersonalSetupSnapshot`. Removed schemas:
`FavoriteConfigSchema`, `CommunityFavoriteSchema`, `UserWithFavoriteSchema`.
`SavedGeneratorSetupSchema` gains `isPublic: z.boolean().optional()`.

## State (`state/favorite-state.svelte.ts`)

- Remove `sharedSetupId`, `shareSetup`, `unshareSetup`, and the
  `isAnonymousUser` dep (the guest gate moves to the drawer, which already
  knows `isAnonymous`).
- `communitySetups` replaces `communityFavorites`; own entries filtered by
  `userId`.
- `setActiveSource` looks up community entries by `setupId`.
- `saveCurrentSetup` toast: "Saved and shared with the community".
- `updateSetupFromCurrent` / `deleteSetup` stop passing a `shared` flag.
- `canSave` unchanged. A guest still sees an enabled Save button; the drawer
  intercepts the click.

## UI

`SavedSetupRow.svelte`: remove `isShared`, `onShareToggle`, the
"Share as my Favorite" / "Unshare" menu entry, and the shared badge.

`PresetDrawer.svelte`:

- Prop `onRequestShareAccount` becomes `onRequestSaveAccount`.
  `GeneratePanel.svelte` wires it to
  `authDrawerState.show("signup", "save-setup")`.
- `$lib/shared/auth/domain/auth-nudge-trigger.ts`: the `share-setup` reason
  is renamed `save-setup`. Message: "Create a free account to save setups.
  Saved setups are shared with the community." Card title "Save this setup",
  body "Sign in or create an account to save setups. Saved setups are shared
  with the community." Update the reason list in
  `tests/unit/auth/auth-nudge-trigger.test.ts`.
- Save button: `isAnonymous ? onRequestSaveAccount() : favoriteState.saveCurrentSetup()`.
- Saved tab: one short line under the Save button, "Saved setups are shared
  with the community."
- Community tab: iterate `favoriteState.communitySetups` keyed by
  `setup.setupId`; each row shows avatar, display name, setup name, and the
  existing `summarize()` line. Apply calls
  `onApply({ kind: "community", userId, setupId })`.
- Empty state: "No setups shared yet" with the hint "Setups people save
  appear here."
- Update the header comment (setups are public snapshots).
- `handleShareToggle` removed.

`GeneratePanel.svelte`: `handleApplySource` for `kind: "community"` finds the
entry in `favoriteState.communitySetups` by `setupId`. The guest gate there
(`community-setups` nudge) is unchanged.

## Backfill

`scripts/backfill-public-generator-setups.cjs` (firebase-admin, uses
`serviceAccountKey.json`, supports `--dry-run`):

1. For every doc in `collectionGroup("generatorSetups")` missing
   `isPublic: true`, set it.
2. For every user doc with a `favoriteConfig` field, delete the field.

Idempotent. As of the census it touches two setup docs and one user doc.

## Deploy order

1. Merge to `main` (rules and index files ship with the code).
2. `firebase deploy --only firestore:indexes` first; wait for the
   collection-group index to finish building (Firebase console shows it).
3. `firebase deploy --only firestore:rules`.
4. Run the backfill.
5. Deploy the app.

Until the index is built, the Community tab shows its load error and the
retry button; nothing else is affected.

## Tests to update

- `tests/unit/create/favorite-state.test.ts`: drop share/unshare cases, add
  a community-by-setupId active-source case, assert `updateSetup` and
  `deleteSetup` are called without a shared flag.
- `services/__tests__/favorite-config-repository.test.ts`: drop migration and
  share cases; add `createSetup` writes `isPublic: true`; add `loadCommunity`
  maps collection-group docs and drops suppressed owners.
- `components/presets/PresetDrawer.svelte.test.ts`: guest Save opens the
  account prompt; no share control on rows; community rows keyed by setup.
- Delete `src/lib/features/create/generate/domain/__tests__/setup-migration.test.ts`
  with the planner.
- `tests/unit/auth/auth-nudge-trigger.test.ts`: `share-setup` becomes
  `save-setup`.
- Rules integration tests as listed above.

## Out of scope

- Ranking, search, or pagination of community setups beyond the 20-item cap.
- Migrating the Community tab to a live `onSnapshot` subscription.
- Any change to how a community setup is applied to the panel.
