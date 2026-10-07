---
status: active
value: 5
effort: L
remaining: "Verify Collection Sharing and Collaboration against the current Collection Sharing and Collaboration runtime and acceptance criteria before resuming implementation. Prior recorded remainder: Approved in-session. Implementation and verification are in progress."
depends_on: ""
plan_path: ""
tags:
  - browse
  - collections
  - messaging
  - collaboration
last_triaged: 2026-10-07
work_state: unverified
---

# Collection Sharing and Collaboration

- **Date:** 2026-08-05
- **Status:** Approved by Austen in-session
- **Product target:** Google Photos-style person sharing, plus explicit viewer and editor roles

## Outcome

A collection owner can right-click a manual collection from the gallery, Library,
or its detail view and choose **Share collection**. The share surface lets the
owner choose one or more people, grant **Can view** or **Can edit**, and include an
optional message. Each person receives a collection card in a direct message and
the live collection appears under **Library → Shared with you**.

Sharing grants access to the collection itself. The message is the notification,
not the authority. Deleting the message does not remove access. The owner can
change a person's role or remove access later.

## Locked permission model

| Role     | Open live collection | Add/remove/reorder sequences | Rename and change collection presentation | Change access | Make public/private | Delete |
| -------- | -------------------: | ---------------------------: | ----------------------------------------: | ------------: | ------------------: | -----: |
| Owner    |                  Yes |                          Yes |                                       Yes |           Yes |                 Yes |    Yes |
| Can edit |                  Yes |                          Yes |                                       Yes |            No |                  No |     No |
| Can view |                  Yes |                           No |                                        No |            No |                  No |     No |

Only the owner can invite people, change roles, revoke access, publish, unpublish,
or delete the collection. Editors work against the owner's canonical collection.
No editable copy or fork is created.

Manual user collections are shareable. System collections and Smart Collections
stay personal because their membership comes from account-specific state rather
than a shared hand-curated list.

## Member ownership and privacy

Every sequence in a shared collection keeps its own creator. A collaborator can
add one of their private sequences to a private shared collection without making
the sequence public. Everyone with collection access can view that sequence
through the collection while access remains active.

Collection documents retain the ordered `sequenceIds` array and gain a
`sequenceOwnerIds` map keyed by sequence ID. Existing entries without a map entry
belong to the collection owner. This preserves old collections while allowing
contributors to add their own sequences to one canonical list.

Making a collection public remains a separate owner action. A public collection
cannot contain another person's private sequence. Publishing is blocked until
every contributed sequence is already public or removed; the owner cannot publish
someone else's work on their behalf.

## Data model

Person-specific access grants live at:

`users/{ownerId}/collections/{collectionId}/shares/{recipientId}`

Each grant stores:

- `ownerId`, `collectionId`, and `recipientId`
- `role: "viewer" | "editor"`
- `grantedBy`
- `createdAt` and `updatedAt`

Recipients discover their collections with a `collectionGroup("shares")` query
filtered by `recipientId`. The collection document remains the canonical name,
cover, membership, count, and public state, so renamed collections never leave
stale duplicate records.

## Server authority and concurrency

Callable functions own the cross-account operations:

1. `shareCollection` validates the owner, recipient, role, manual-collection
   boundary, and direct conversation. One transaction creates the access grant,
   collection message, unread count, and conversation preview.
2. `updateCollectionShare` lets the owner change a recipient between **Can view**
   and **Can edit**, or lets the owner/recipient remove the grant.
3. `mutateSharedCollection` validates owner/editor access and performs rename,
   add, remove, and reorder operations against the latest collection state.
4. `loadSharedCollectionMembers` validates owner, grant, or public access before
   returning collection member data from each sequence owner's library.

Membership mutations use Firestore transactions. If two collaborators edit at
the same time, Firestore retries against the latest document and preserves both
non-conflicting changes. Role changes and revocation take effect before the next
protected operation.

Firestore rules provide defense in depth:

- a recipient can read only their own share grant;
- an owner can list grants for their collection;
- collection reads allow owner, public, admin, or an existing grant;
- direct editor updates are limited to collection presentation fields;
- membership changes stay behind the callable so sequence ownership and
  visibility are validated before the collection can reference them;
- access, public state, ownership, system type, and deletion remain owner-only;
- private sequence documents are not opened broadly. Shared member loading stays
  behind the callable authorization check.

## User experience

### Owner

- Right-click or open the options menu on a manual collection.
- Choose **Share collection**.
- Search for people and select one or more recipients.
- Choose **Can view** or **Can edit**.
- Add an optional message and press **Share with N**.
- Reopen the same surface to see **People with access**, change a role, or
  **Remove access**.

### Recipient

- Receive a rich collection card in Messages.
- Open the collection from the message or **Library → Shared with you**.
- See an owner label and current permission.
- Editors get the existing rename, add, remove, and reorder controls.
- Viewers get the same collection presentation without mutation controls.
- A recipient can choose **Leave collection**, which removes only their grant.

The collection card resolves current access when opened. A revoked recipient gets
a clear access-ended state instead of an empty or broken collection.

## Primitive discovery

Internal search found and will reuse:

- `BaseModal`, `ModalHeader`, and `ModalFooter` for focus, top-layer behavior,
  responsive sizing, and dismissal;
- `UserSearchInput` for authenticated person lookup;
- `RobustAvatar` and the existing avatar-stack patterns;
- `SegmentedControl` with radio-group semantics for **Can view / Can edit**;
- the established `ContextMenu`, `CollectionCardSurface`, inbox state, direct
  conversation resolver, and message bubble attachment routing.

The existing `SendAttachmentSheet` remains the image/sequence destination sender.
It does not fit persistent access management because it targets conversations,
permits group destinations, and has no current-access list, role changes, or
revocation. `ShareCollectionSheet` follows its recipient-search patterns but owns
the collection-specific ACL workflow. `CollectionMessageCard` follows the rich
attachment card grammar; `SequenceMessageCard` cannot be extended cleanly because
its preview, QR, thumbnail, and open behavior are sequence-specific.

No external UI package is needed. Native dialog behavior, Svelte 5 runes, the
existing design system, Firebase callables, Firestore rules, and Firestore
transactions cover the required behavior.

## Affected systems

- Collection domain model, Firestore mapper, and path helpers
- Collection collaboration callables and client manager
- Firestore rules, indexes, and rules-emulator tests
- Inbox attachment models, message previews, drawer routing, and message cards
- Collection context menus in `CollectionCard`, gallery collection filters, and
  collection detail views
- Library `Shared with you` state and shelf
- Collaborative add/remove/rename/reorder paths
- Deep-link resolution for `/browse/library/{ownerId}:{collectionId}`

## Failure boundaries

- A failed grant never sends a message.
- A failed message never leaves a grant behind.
- Partial multi-person sharing reports exactly who did not receive access; prior
  successful grants remain valid.
- Revocation blocks later reads and writes. It cannot erase sequence data that a
  recipient deliberately copied or exported while access existed.
- Owner deletion removes the canonical collection. Share grants are deleted by
  the backend cleanup path so `Shared with you` does not retain dead pointers.

## Verification

1. Unit tests cover role mapping, attachment previews, and shared-state merging.
2. Firestore rules-emulator tests prove owner, editor, viewer, stranger, signed-out,
   and admin behavior, including forbidden role/public/owner field changes.
3. Callable integration tests cover atomic grant-plus-message delivery, role
   changes, revocation, private contributor sequences, collection limits, and two
   concurrent membership edits.
4. Focused Svelte tests cover the recipient/role state transitions that could
   silently grant the wrong permission.
5. Authenticated Chrome verification exercises owner share, recipient view,
   editor mutation, role downgrade, and revocation.
6. The visual pass covers 1920×1080, 2560×1440, 3840×2160, 1440×900,
   820×1180, 960×412, and 375×667. It checks the modal, context menus, message
   card, Shared with you shelf, empty/loading/error states, focus, overflow, and
   stable control sizing.

## Research basis

- Google Photos supports sharing albums with specific accounts, collaboration,
  owner-managed removal, and a separate link-sharing control:
  https://support.google.com/photos/answer/9789702
- Firestore field-diff rules can restrict editors to an explicit allowlist:
  https://firebase.google.com/docs/firestore/security/rules-fields
- Firestore transactions retry when concurrent edits touch a read document and
  commit all writes atomically:
  https://firebase.google.com/docs/firestore/manage-data/transactions
