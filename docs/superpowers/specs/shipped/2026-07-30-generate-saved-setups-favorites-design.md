---
status: active
value: 4
effort: L
remaining: ""
depends_on: ""
plan_path: "docs/superpowers/plans/2026-07-30-generate-saved-setups-favorites.md"
tags:
  ["create", "generate", "favorites", "presets", "firestore", "privacy", "ux"]
last_triaged: 2026-08-01
---

# Generate Saved Setups and Community Favorite: Design Spec

## Problem

The Generate panel presents a card named **Favorite**, but its drawer does not
provide a complete favorites workflow.

The current save control exists only while the user has no favorite:

```svelte
{#if myFavorite}
  <!-- apply the existing favorite -->
{:else}
  <button>Save Current Config as My Favorite</button>
{/if}
```

After the first save, the only visible action is Apply. The repository can
overwrite and delete the record, but the drawer exposes neither action. The
March design said users could always change their favorite, while its
implementation plan omitted that path.

The problem is broader than one missing button:

- a failed save still closes the drawer because the write returns no outcome;
- read failures are converted to empty results, so an outage looks like an
  empty community;
- any card edit discards favorite provenance instead of showing that the
  applied setup was modified;
- personal reuse and public sharing are represented by the same field;
- `users/{uid}` is public-readable, so every saved generator favorite is
  public whether the user intended that or not;
- the drawer has no shared header, close control, retry state, actionable empty
  state, save feedback, rename flow, or delete flow;
- the desktop surface previously inherited the expanding Generate panel width,
  producing a drawer over 1,200 pixels wide on a 2,560-pixel viewport.

This spec replaces the ambiguous single-slot feature with a complete private
saved-setup workflow and preserves one explicitly shared Favorite as the
community identity.

## Existing behavior and evidence

| Finding                                            | Confidence | Repository evidence                                                            |
| -------------------------------------------------- | ---------- | ------------------------------------------------------------------------------ |
| Save disappears after the first favorite exists    | Proven     | `PresetDrawer.svelte` branches save behind `{:else}`                           |
| Overwrite and delete already exist below the UI    | Proven     | `saveMyFavorite()` and `clearMyFavorite()` in state and repository             |
| Save closes after failure                          | Proven     | `saveMyFavorite()` returns `void`; `GeneratePanel` closes unconditionally      |
| Community and personal read errors look empty      | Proven     | repository catches and returns `null` or `[]`                                  |
| Personal generator favorites are publicly readable | Proven     | `favoriteConfig` is on `users/{uid}` and `/users/{userId}` allows public reads |
| Active state is provenance only                    | Proven     | `activeFavoriteId` stores `"mine"` or a user ID                                |
| Editing removes provenance                         | Proven     | `withFavoriteDeselect()` deactivates on every settings handler                 |
| No focused tests protect the feature               | Proven     | no favorite-config state, repository, or comparator tests exist                |

## Research basis

The design uses current official product and platform guidance:

- [Adobe Lightroom preset management](https://helpx.adobe.com/lightroom/desktop/edit-photos/presets.html)
  exposes Create, Update With Current Settings, and Delete for user presets,
  while separating personal presets from discovery content.
- [Google Maps saved lists](https://support.google.com/maps/answer/7280933)
  keep saved content private unless the owner deliberately changes sharing.
- [Adobe Spectrum menus](https://spectrum.adobe.com/page/menu/) place secondary
  item actions in a visible action menu and use explicit sentence-case labels.
- [Adobe Spectrum alert dialogs](https://spectrum.adobe.com/page/alert-dialog/)
  reserve destructive confirmation for actions that remove data.
- [W3C APG tabs](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/) require
  tablist, tab, and tabpanel relationships plus arrow-key navigation.
- [Cloud Firestore data modeling](https://firebase.google.com/docs/firestore/data-model)
  recommends subcollections for growing child records.
- [Firestore secure queries](https://firebase.google.com/docs/firestore/security/rules-query)
  confirms that rules are not filters. A public query must constrain the same
  visibility state that the rules enforce.

The repository already owns the required UI primitives: `Drawer`,
`DrawerHeader`, `SegmentedControl`, `OverflowMenu`, `ConfirmDialog`,
`SkeletonLoader`, robust avatar rendering, and the global toast queue.

## Product model

The redesign separates two concepts that the current feature conflates.

### Saved setups

Saved setups are private, reusable snapshots of Generate settings.

- A user can keep up to 10 setups in the UI.
- Save is always available below that cap.
- Save appends a new setup and never silently overwrites another setup.
- Setups receive an automatic name such as `Setup 1`.
- A setup can be applied, renamed, updated from the current panel, shared as
  the user's Favorite, unshared, or deleted.
- Private saved setups are available to authenticated anonymous users as well
  as full accounts.

The cap is an interface limit, not a Firestore rule. It keeps the compact
picker useful without turning this pass into quota infrastructure.

### My Favorite

My Favorite is the one setup a full-account user deliberately shares with the
community.

- At most one setup is shared as My Favorite.
- Sharing another setup replaces the public Favorite immediately.
- Unsharing removes the public Favorite without deleting the private setup.
- Updating the shared setup updates the public copy in the same atomic write.
- Deleting the shared setup also removes the public copy in the same atomic
  write.
- Community cards continue to identify the person, not a catalog of preset
  products.

This preserves the social idea from the March feature while making saving
private by default.

## Data model

### Private setup document

Path:

```text
users/{uid}/generatorSetups/{setupId}
```

Shape:

```ts
interface SavedGeneratorSetup {
  id: string;
  name: string;
  config: UIGenerationConfig;
  startEndOptions: StartEndOptions | null;
  createdAt: Date;
  updatedAt: Date;
}
```

The subcollection can grow independently of the profile document and can be
secured as owner data with read-only admin preview access.

### Public Favorite projection

Path:

```text
users/{uid}.favoriteConfig
```

Shape:

```ts
interface SharedGeneratorFavorite {
  sourceSetupId: string;
  config: UIGenerationConfig;
  startEndOptions: StartEndOptions | null;
  setAt: Date;
}
```

The existing community query remains compatible:

```text
users where favoriteConfig != null
```

Presence of the field is the share state. The field contains only a deliberate
public projection, never the owner's full private setup library.

### Firestore rules

Add a nested rule that mirrors the existing settings preview pattern:

```text
match /users/{userId}/generatorSetups/{setupId} {
  allow read: if isOwner(userId) || isAdmin();
  allow create, update, delete: if isOwner(userId);
}
```

The rule earns emulator coverage proving:

- the owner can create, read, update, and delete a setup;
- an admin can read but not write another user's setup;
- another non-admin authenticated user cannot read or write it;
- a signed-out client cannot read it;
- public reads of `users/{uid}.favoriteConfig` remain unchanged.

Full-account sharing is enforced in application state before a write. The
existing `/users/{uid}` update rule is intentionally not widened or rewritten
in this feature. Unsharing remains available to the owner. Admin preview is
read-only: migration and every setup mutation are skipped while preview is
active, but applying a previewed setup to the local Generate panel remains
available.

## Legacy migration

Existing `users/{uid}.favoriteConfig` records were already public. Migration
must not broaden their exposure or silently unshare them.

On the first personal setup load outside admin preview:

1. Read the private setup list and the existing public Favorite.
2. If the public Favorite has no `sourceSetupId`, create or merge the
   deterministic setup document `legacy-favorite`, name it `My Favorite`, copy
   the existing snapshot, and set `sourceSetupId: "legacy-favorite"` on the
   public Favorite in the same batch.
3. If `sourceSetupId` exists but its private document is missing, recreate that
   exact document ID from the public projection and name it `My Favorite`.
   Reusing the missing ID is idempotent and does not overwrite a different
   recovered setup.

The deterministic ID makes migration idempotent across refreshes, retries, and
two tabs. A partial previous attempt converges on the same document rather than
creating duplicates.

Migration is a compatibility write inside a read path, so it must not hold the
Saved tab open while Firestore waits for a server acknowledgment. The batch is
issued through the existing offline write tracker without awaiting the returned
promise. `loadPersonal()` returns the migrated snapshot constructed locally in
the same call. The deterministic document ID guarantees a later retry
converges. An immediate rejection is reported as a non-blocking migration
failure and does not turn an otherwise readable legacy Favorite into a loading
spinner.

No bulk backfill script is required. Users who never open Generate keep the
existing public record unchanged.

## Repository contract

Persistence remains owned by the Generate feature, but the module-level
functions become a typed repository dependency for the state factory.

Required operations:

```ts
interface GeneratorSetupRepository {
  loadPersonal(userId: string): Promise<PersonalSetupSnapshot>;
  loadCommunity(limit?: number): Promise<CommunityFavorite[]>;
  createSetup(
    userId: string,
    draft: SavedSetupDraft
  ): Promise<SavedGeneratorSetup>;
  renameSetup(userId: string, setupId: string, name: string): Promise<void>;
  updateSetup(
    userId: string,
    setup: SavedGeneratorSetup,
    shared: boolean
  ): Promise<void>;
  deleteSetup(userId: string, setupId: string, shared: boolean): Promise<void>;
  shareSetup(userId: string, setup: SavedGeneratorSetup): Promise<void>;
  unshareSetup(userId: string): Promise<void>;
}
```

Supporting types:

```ts
interface SavedSetupDraft {
  name: string;
  config: UIGenerationConfig;
  startEndOptions: StartEndOptions | null;
}

type PendingSetupAction =
  | { kind: "create" }
  | {
      kind: "rename" | "update" | "share" | "delete";
      setupId: string;
    }
  | { kind: "unshare" };
```

`loadPersonal()` owns the lazy legacy migration so the state layer receives one
coherent snapshot:

```ts
interface PersonalSetupSnapshot {
  setups: SavedGeneratorSetup[];
  sharedSetupId: string | null;
}
```

Read operations throw on transport or permission failure. They do not return an
empty value that can be mistaken for success.

Writes that affect both a private setup and the public projection use a
Firestore batch:

- update shared setup: update private document and public projection;
- delete shared setup: delete private document and remove public projection;
- legacy migration: create private document and link public projection.

## State model

`createFavoriteState()` becomes a dependency-injected feature state factory.
It does not reach directly into global persistence.

State:

```ts
setups: SavedGeneratorSetup[];
communityFavorites: CommunityFavorite[];
sharedSetupId: string | null;
activeSource: ActiveSetupSource | null;
isLoadingSetups: boolean;
isLoadingCommunity: boolean;
setupsLoadError: string | null;
communityLoadError: string | null;
pendingAction: PendingSetupAction | null;
```

Active source is discriminated rather than encoded in magic strings:

```ts
type ActiveSetupSource =
  | { kind: "setup"; setupId: string }
  | { kind: "community"; userId: string };
```

Mutations return `Promise<boolean>`:

- `true`: persistence succeeded and state was updated;
- `false`: the state factory reported an earned user error and kept the
  previous state.

The component does not close, rename, or remove a row optimistically unless the
operation succeeded.

Personal and community loads are independent. A community outage cannot block
the owner's saved setups, and a personal-data permission error cannot be
presented as an empty list.

## Snapshot equality and modified state

> Superseded 2026-09-11 by
> `active/2026-09-11-generate-setup-detach-on-edit-design.md`. A setup is now
> active only while the live snapshot equals the applied baseline; any edit
> detaches it and the Modified state no longer exists.

Applying a setup establishes provenance. Editing the panel does not erase that
provenance.

A pure canonical comparator checks:

```ts
{
  config: UIGenerationConfig;
  startEndOptions: StartEndOptions | null;
}
```

Canonicalization:

- recursively sort object keys;
- omit `undefined` object values;
- normalize absent and `undefined` start/end options to `null`;
- sort `blockedStartPositions`, `mustContainLetters`, and
  `mustNotContainLetters` before comparison because these arrays have set
  semantics;
- preserve order for arrays whose order is meaningful. None exist in the
  current snapshot shape, and future fields must declare their semantics;
- preserve primitive values.

Setups capture generator settings, not spell words. Snapshot capture normalizes
word-derived config fields on both save and apply:

- `spellTargetLength` is stored as `null`;
- `mode` is stored as `GenerationMode.FREEFORM`.

The comparator therefore does not report a difference caused solely by clearing
the spell word and the existing word-reset effects.

The UI derives:

- **Active**: the live panel snapshot equals the applied source;
- **Modified**: the source is still known, but the live snapshot differs;
- no badge: the row is not the applied source.

`Update with current settings` is enabled only for the active, modified private
setup. Applying a different setup changes provenance. Saving the current
snapshot creates a new active setup.

The existing `withFavoriteDeselect()` wrapper is removed. Generation setting
handlers keep their normal behavior and the comparator supplies truthful
status.

## Information architecture

The drawer title becomes **Generator setups**. The Generate card title becomes
**Setups**.

The existing responsive `Drawer` remains the shell:

- desktop: compact right drawer, at most 420 pixels wide;
- mobile and narrow layouts: a workspace-aligned overlay that matches the
  measured Generate panel bounds exactly;
- foldable landscape: full Generate-panel width and height, with no exposed
  setup cards, detached drag handle, or maroon fallback surface;
- one shared component tree for both form factors.

`DrawerHeader` provides the visible title and Close control.
The drawer does not render a drag handle. Its surface uses the current themed
panel background, border, and shadow tokens.

An accessible `SegmentedControl` uses `semantics="tabs"`:

- **Saved**
- **Community**

Each option supplies stable tab and panel IDs. The corresponding panels use
`role="tabpanel"` and `aria-labelledby`.

### Setups card

The card title is **Setups**.

- When an own setup is applied, the value shows its setup name.
- When a community Favorite is applied, the value shows the community member's
  display name.
- A stable secondary status slot shows Active or Modified. Its geometry is
  reserved for the longer label so switching state does not resize the card.
- With no applied source, the value shows the saved count, such as `3 saved`,
  or `Browse` when the count is zero or unavailable.
- Tapping the card opens the drawer, unchanged.

The status is visible text and part of the card's accessible name. Long setup
or display names truncate inside the existing fixed card geometry.

### Saved tab

The first control is always the primary action:

```text
Save current setup
```

Behavior:

- available while a user ID exists and fewer than 10 setups are saved;
- disabled while personal setups are loading, after a personal load error, or
  during read-only admin preview because the count or write authority is not
  trustworthy;
- shows a busy label and prevents duplicate submission while saving;
- appends an auto-named setup;
- keeps the drawer open;
- selects the new row as Active;
- announces `Setup saved` through the global success toast.

At the cap, the control stays visible but disabled, with:

```text
10 setups saved. Delete one to save another.
```

Each saved row contains:

- setup name;
- compact config summary;
- `Active`, `Modified`, or `Shared` text indicators as applicable;
- an Apply button occupying the main row body;
- a visible overflow action button.

Overflow actions:

1. `Update with current settings`
2. `Rename`
3. `Share as my Favorite` or `Unshare`
4. `Delete`

The shared `OverflowMenu` may be extended with a disabled item state so Update
remains discoverable when it is unavailable.

Rename is inline:

- Rename replaces the row label with a focused text field.
- Enter saves.
- Escape cancels.
- Blank names cannot submit.
- Names are trimmed and limited to 60 characters.
- A failed rename leaves the editor open and preserves the typed value.

Delete opens the shared `ConfirmDialog`.

Normal copy:

```text
Delete “{name}”?
This removes the saved setup. Your current generator settings will not change.
```

Shared copy:

```text
Delete “{name}”?
This removes the saved setup and stops sharing it as your Favorite. Your
current generator settings will not change.
```

Apply closes the drawer. Save, rename, update, share, unshare, and delete keep
the drawer open.

### Saved empty and signed-out states

Authenticated empty state:

```text
No saved setups yet
Save the current controls so you can bring them back in one tap.
```

Signed-out state:

```text
Save generator setups
Sign in to keep setups across sessions.
```

The signed-out state includes a visible `Sign in` button. The Community tab
remains available.

Read-only admin preview shows the previewed user's setup list with:

```text
Previewing saved setups
Apply is available. Changes are disabled in preview.
```

Save and every row mutation are disabled. Apply remains available because it
changes only the admin's local Generate panel.

### Community tab

The Community tab shows explicitly shared Favorites only.

Guests and signed-out visitors do not enter the Community panel. Selecting the
tab opens the shared account nudge with this copy:

```text
Create a free account to use community setups and build sequences up to 64 steps.
```

The Saved tab remains selected, and no generator settings change. The same gate
also runs defensively if a guest reaches a community Apply action through stale
UI state.

Loading uses the shared skeleton primitive and preserves row geometry.

Each row contains:

- robust avatar or deterministic fallback;
- display name;
- compact config summary;
- Active or Modified state when it is the applied source;
- a clear Apply affordance through the row button.

Empty state:

```text
No shared setups yet
Community Favorites will appear here when people choose to share.
```

Error state:

```text
Community favorites could not load
```

It includes a visible `Try again` button. It never reuses the empty-state copy.

The current user is filtered from the community results because their shared
Favorite already appears in Saved.

## Action flows

### Save

1. User opens Generator setups.
2. User selects Save current setup.
3. State snapshots current config and start/end options.
4. Repository creates the private setup.
5. State appends and activates the returned setup.
6. Drawer remains open and success is announced.

### Apply

1. User selects the main body of a saved or community row.
2. Access checks run before any generator state mutation.
3. Generate config and start/end options update together.
4. Spell input clears, matching current favorite behavior.
5. Provenance becomes the selected source.
6. Drawer closes.

If a saved snapshot contains `startEndOptions: null`, applying it resets the
start/end state. It must not retain constraints from the previously active
setup.

A guest cannot apply a setup whose sequence length exceeds the guest limit.
The existing `step-cap-guest` account nudge opens, the drawer stays open, and
the live generator settings remain unchanged. Setup summaries always describe
length as `step` or `steps`; they never use `count`, `ct`, or another unit.

### Update

1. User applies a private setup and changes one or more controls.
2. Its status becomes Modified.
3. User opens the row menu and selects Update with current settings.
4. Repository updates the private setup.
5. If shared, the same batch updates the public projection.
6. Status returns to Active and a success toast confirms the update.

### Share

1. A full-account user opens a private setup's action menu.
2. User selects Share as my Favorite.
3. Repository copies that snapshot to `users/{uid}.favoriteConfig`.
4. Any previously shared row loses its Shared indicator.
5. The selected row gains Shared.
6. The community list removes any stale self-entry.

No confirmation appears. Switching the public Favorite does not delete a setup
and can be reversed.

An anonymous user selecting the same action enters the existing
`BaseModal` + `AuthNudge` account-creation pattern before any public write. The
feature extends that existing trigger/copy registry instead of creating a
second sign-in prompt.

### Unshare

1. User selects Unshare.
2. Repository removes `favoriteConfig`.
3. Private setup remains.
4. Shared indicator clears.
5. Success toast reads `Your setup is no longer shared`.

### Delete

1. User selects Delete.
2. Confirmation identifies whether sharing also ends.
3. Repository deletes the private setup and, if required, the public projection
   in one batch.
4. Active provenance clears only if the deleted setup was active.
5. The live generator controls remain unchanged.

## Error and busy behavior

Only proven I/O boundaries receive error handling.

- Read failure: inline error state with Retry.
- Write failure: existing user-error handler plus no local mutation.
- Success: global toast with concrete action copy.
- Pending mutation: only the affected action is disabled, plus Save during
  create. Applying other rows remains available unless a destructive batch is
  pending for that row.
- Duplicate clicks: ignored while the same action is pending.

No catch block converts a failure into a valid empty result.

## Accessibility

- Drawer has an accessible label and visible heading.
- Drawer focus is trapped and returns to the Setups card on close.
- Tabs use the existing keyboard-complete `SegmentedControl`.
- Row Apply controls are native buttons.
- Overflow triggers have setup-specific labels such as
  `Actions for Setup 2`.
- State is expressed with visible text, not color alone.
- Active Apply buttons use `aria-current="true"`.
- Busy controls use `disabled` and `aria-busy`.
- Rename input has a visible or programmatic label.
- Delete confirmation receives the setup name in its title.
- All pointer targets are at least 44 by 44 CSS pixels.
- Focus rings remain visible.
- Reduced-motion preferences disable nonessential row transitions.
- Toast copy is not the sole state signal. The row updates in place.

## Reused primitives

| Need                                   | Existing owner                                 |
| -------------------------------------- | ---------------------------------------------- |
| Responsive right drawer / bottom sheet | `shared/foundation/ui/Drawer.svelte`           |
| Header and Close control               | `shared/foundation/ui/DrawerHeader.svelte`     |
| Saved / Community tabs                 | `shared/ui/components/SegmentedControl.svelte` |
| Row actions                            | `shared/ui/components/OverflowMenu.svelte`     |
| Delete confirmation                    | `shared/foundation/ui/ConfirmDialog.svelte`    |
| Loading geometry                       | `shared/foundation/ui/SkeletonLoader.svelte`   |
| Avatar loading/fallback                | existing robust avatar component               |
| Success and failure announcements      | global toast state and error handler           |

No new drawer, modal, menu, tabs, avatar, or toast primitive is created.

## Earned tests

### Pure snapshot comparator

Prove:

- object key order does not affect equality;
- `undefined` object values do not create false differences;
- absent and `undefined` start/end options equal `null`;
- reordered blocked positions and letter constraints compare equal;
- nested config changes are detected;
- a setup saved during spell mode compares Active immediately after apply.

### Favorite state

With an injected fake repository, prove:

- personal and community loads settle independently;
- failed reads expose error state instead of empty state;
- failed writes do not mutate setup or sharing state;
- save activates the returned setup;
- deleting the active setup clears provenance but not panel data;
- sharing replaces `sharedSetupId`;
- anonymous users cannot call the public share write;
- retry clears the relevant error after success.

### Repository and migration

Prove:

- legacy migration uses the deterministic ID and is idempotent;
- a Favorite whose source setup is missing is re-adopted at that exact source
  ID without duplicating or overwriting a different setup;
- updating a shared setup writes private and public snapshots together;
- deleting a shared setup deletes private data and removes the public field;
- community read errors reject rather than returning `[]`.

### Firestore rules

Use the existing rules emulator suite to prove owner-only access for
`generatorSetups`.

### Component contract

If the state and action surface can be tested without screenshot duplication,
add focused component assertions for:

- Save remains present when setups exist;
- load error and empty state are distinct;
- Update is unavailable until an applied private setup is Modified;
- delete copy changes for the shared setup;
- sequence length summaries use `step` or `steps`;
- a guest selecting Community receives the account request without changing
  tabs.

Visual appearance remains browser-verified.

## Responsive visual verification

The implementation is not visually complete until the drawer is opened and
captured at:

- 1,440 by 900;
- 1,920 by 1,080;
- 2,560 by 1,440;
- 3,840 by 2,160;
- 820 by 1,180;
- 960 by 412;
- 375 by 667.

At every viewport, verify:

- desktop drawer remains compact and never inherits the expanding panel width;
- narrow-layout drawer matches the Generate panel's measured bounds;
- foldable landscape covers every setup card without a visible drag handle;
- the drawer surface uses themed panel styling rather than a maroon fallback;
- header, tabs, primary save action, and current row state remain reachable;
- action menus stay within the viewport;
- rename controls do not cause horizontal overflow;
- confirmation layers above the drawer;
- loading, empty, error, populated, Active, and Modified states do not shift
  the surrounding layout unexpectedly;
- keyboard focus and Escape behavior remain correct.

## File impact

Expected existing files:

- `src/lib/features/create/generate/components/GeneratePanel.svelte`
- `src/lib/features/create/generate/components/CardBasedSettingsContainer.svelte`
- `src/lib/features/create/generate/components/cards/PresetCard.svelte`
- `src/lib/features/create/generate/components/presets/PresetDrawer.svelte`
- `src/lib/features/create/generate/state/favorite-state.svelte.ts`
- `src/lib/features/create/generate/services/favorite-config-repository.ts`
- `src/lib/features/create/generate/domain/models/favorite-config.ts`
- `src/lib/features/create/generate/domain/models/favorite-config-schemas.ts`
- `src/lib/shared/create/domain/generator-help-content.ts`
- `src/lib/shared/ui/components/OverflowMenu.svelte`
- `firestore.rules`
- focused unit, component, repository, and rules tests

One small pure comparator module and its test may be added under the Generate
feature. No new global subsystem is expected.

## Out of scope

- popularity counts, likes, rankings, curation, or notifications;
- per-setup public sharing;
- public preset search or marketplace behavior;
- setup folders, drag ordering, import, or export;
- server-enforced setup quota;
- bulk migration or admin backfill;
- changes to sequence Favorites in Library or Browse;
- voice commands for saving setups;
- renaming shared component files solely for terminology cleanup.

## Rejected alternatives

### Keep one favorite and expose overwrite/delete

This repairs the immediate missing button but retains the ambiguous single
slot, makes Save destructive after the first use, and still requires private
storage work. Once personal data moves out of the public profile, a short list
costs little more and provides a coherent CRUD model.

### Make every saved setup public

This turns community favorites into a preset marketplace, multiplies privacy
choices, and weakens the meaning of a person's Favorite.

### Add a visibility flag inside public `users/{uid}`

Firestore rules cannot hide one field of an otherwise public-readable document.
A flag could constrain a query but would not make the embedded config private
from direct reads.

### Add a new top-level public favorites index

The existing public profile projection already supports the community query.
A second public collection would introduce mirror synchronization and stale
index failure modes without improving the user experience.

## Acceptance criteria

- [x] Save current setup remains visible after one or more setups exist.
- [x] A user can create, apply, rename, update, share, unshare, and delete a
      setup from the drawer.
- [x] Personal setups are owner-only Firestore records.
- [x] At most one setup is projected as the public Favorite.
- [x] Existing `favoriteConfig` data migrates idempotently without losing its
      shared state.
- [x] A failed read is distinguishable from an empty result and offers Retry.
- [x] A failed write leaves the drawer open and local state unchanged.
- [x] Applying a null start/end snapshot resets prior start/end constraints.
- [x] Editing an applied setup shows Modified instead of discarding provenance.
- [x] At 10 setups, Save is disabled with the explanatory cap message.
- [x] The drawer remains compact on desktop and matches the Generate panel on
      narrow layouts.
- [x] Guests are prompted to create an account before entering Community or
      applying any setup above the eight-step guest limit.
- [x] Setup summaries use step terminology.
- [x] Foldable landscape covers the Generate panel exactly, without a detached
      handle or fallback maroon surface.
- [x] Focus, keyboard, target size, reduced motion, and state labels meet the
      accessibility requirements above.
- [x] Comparator, state transitions, migration, atomic shared writes, and
      Firestore privacy rules have focused automated proof.
- [x] All seven required viewports have current visual proof.

## Implementation verification

- Snapshot, migration, repository, and state suites: 31 focused assertions
  passed. This includes restored-auth readiness, identity-change isolation,
  stale-read rejection, and legacy active-baseline behavior found during the
  final audit.
- Drawer component contract: 6 browser-component assertions passed, covering
  persistent Save, honest error/empty states, Modified-gated Update, shared
  delete copy, step terminology, and the guest Community gate.
- Auth nudge registry: 6 assertions passed, including the Community setups
  account prompt.
- Firestore rules emulator: 58 assertions passed, including owner CRUD,
  anonymous ownership, cross-user denial, admin read-only preview, signed-out
  denial, and unchanged public Favorite reads.
- Responsive browser review completed at 1440×900, 1920×1080, 2560×1440,
  3840×2160, 820×1180, 960×412, and 375×667. The right drawer measured 400px
  at each desktop width. At 960×412, the drawer and Generate panel both measured
  439×412 at x=511 and y=0, with no handle or horizontal overflow. The 820×1180
  and 375×667 layouts likewise matched the measured Generate panel bounds.
- The running guest flow kept Length at 8 after Community was selected and
  displayed the 64-step account prompt before any settings mutation.
- Tab arrow-key navigation was verified in the built page. Focus treatment,
  Escape handling, and focus trapping remain owned by the reused Drawer and
  SegmentedControl primitives.
- `check:fast` reported no diagnostics in this feature's files. Its project
  result remains nonzero because concurrent, unrelated files currently contain
  syntax/conversion failures.
- Firestore rules were compiled and released to the
  `the-kinetic-alphabet` production project on 2026-07-30. A production CRUD
  smoke check remains separate because it requires creating and deleting a
  real setup and may trigger lazy migration of the account's legacy Favorite.

## Design review ledger

- [x] Existing implementation mapped from card to state to repository to
      Firestore rules.
- [x] Internal primitive search completed before proposing new UI.
- [x] Current official UX, accessibility, and Firestore guidance reviewed.
- [x] `superpowers:brainstorming` completed in Claude Code using
      `claude-fable-5`.
- [x] Claude Fable 5 architecture and consistency review completed.
- [x] Required review findings reconciled into this spec.
- [x] Claude Fable 5 implementation plan completed.
- [x] Main-agent implementation and repository-level verification completed.
