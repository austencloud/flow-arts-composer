# Firebase Rules & Server Boundary Authorization Audit

**Batch:** opus-batch-2026-09-12 · **Assignment:** read-only production-code
authorization audit of Firebase rules and server callable/API boundaries
**Date:** 2026-09-13 · **Model:** claude-opus-5 (serving model may differ), high effort

---

## 1. Scope, SHAs, and owned files

| Item                              | Value                                             |
| --------------------------------- | ------------------------------------------------- |
| Base commit (fresh `origin/main`) | `c4be16199e390e8bdab766051a0042c7827b8d30`        |
| Branch                            | `claude/firebase-security-audit-03y1e7`           |
| Checkpoint commit                 | `5dc7dfc3` — audit scaffolding                    |
| Final commit                      | see §8 (this report + the F1/F2 intent assertion) |
| Production files changed          | **none** — this was an audit-only assignment      |

### Files this assignment owns (the only files it created)

```
tests/opus-security-audit/harness.ts
tests/opus-security-audit/vitest.audit.config.ts
tests/opus-security-audit/rules-source.audit.test.ts        (offline, 37 probes, green)
tests/opus-security-audit/firestore-authz.audit.test.ts     (31 emulator probes, see §3)
tests/opus-security-audit/storage-authz.audit.test.ts       (19 emulator probes, see §3)
docs/reports/opus-batch-2026-09-12/security-rules-audit.md  (this file)
```

No rule file, production module, existing test, instruction file, or CI config
was modified. `firestore.rules` and `storage.rules` were read only. No
production probe, no live write, no credential read, no rules deployment, no
payment transaction. Guest local retry/upgrade is another agent's domain and
was excluded.

### Surfaces read

`firestore.rules` (2422 lines, in full), `storage.rules` (278 lines, in full),
`docs/superpowers/specs/backlog/2026-05-23-security-hardening-design.md`, all 29
`src/routes/api/**/+server.ts` handlers (guard sweep), the 40 `onCall`
declarations under `firebase-functions/src/`, and the client writers/readers for
every collection named in a finding.

---

## 2. Evidence classes

Every claim below carries one of these labels. Nothing is asserted without one.

| Label                  | Meaning                                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **MEASURED (source)**  | A green assertion in `rules-source.audit.test.ts` over the shipped rule text or handler source. Deterministic, re-runnable, no network. |
| **MEASURED (unit)**    | A green assertion executing shipped production code (the scan-ingest validator).                                                        |
| **PREPARED (runtime)** | A written emulator probe that asserts a concrete allow/deny outcome. **Not executed** — see §3.                                         |
| **INFERRED**           | A consequence reasoned from the above plus documented Firestore/Storage rules semantics. Labeled per claim.                             |

**I did not measure a single live allow/deny outcome in this session.** Where a
finding's exploitability depends on rules-engine evaluation semantics rather than
on rule text, it is labeled INFERRED and says so. §3 explains why, and §9 says
exactly what a reviewer still has to confirm.

---

## 3. Environment blocker: the emulator could not run

`firebase emulators:exec --only firestore,storage` fails at startup in this
cloud session:

```
i  firestore: downloading cloud-firestore-emulator-v1.22.0.jar...
Error: Failed to make request to
  https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.22.0.jar
```

The session's egress policy answers **403 to CONNECT** for every official
distribution host:

```
storage.googleapis.com:443        gateway answered 403 to CONNECT (policy denial)
dl.google.com:443                 gateway answered 403 to CONNECT (policy denial)
www.gstatic.com:443               gateway answered 403 to CONNECT (policy denial)
firebasestorage.googleapis.com:443 gateway answered 403 to CONNECT (policy denial)
firebase-public.firebaseio.com:443 gateway answered 403 to CONNECT (policy denial)
```

(Source: `curl -sS "$HTTPS_PROXY/__agentproxy/status"` → `recentRelayFailures`.)
No JAR is cached in the image (`~/.cache/firebase/emulators/` is empty;
`find / -name 'cloud-firestore-emulator*.jar'` returns nothing). The Storage
emulator's rules runtime uses the **same** JAR, so Storage rules are equally
unrunnable — `--only storage` does not help.

Per the proxy README ("do not retry or route around organization policy
denials — report them instead") I did not mirror, vendor, or side-load the JAR.
**Blocked host set reported above; this is the one thing this session could not
do.**

Both emulator probe files load and collect cleanly and fail only on the missing
listener, which confirms they are runnable elsewhere:

```
firestore-authz.audit.test.ts   31 collected · Error: connect ECONNREFUSED 127.0.0.1:8080
storage-authz.audit.test.ts     19 collected · Error: connect ECONNREFUSED 127.0.0.1:8080
```

To execute them where the host set is reachable:

```bash
firebase emulators:exec --only firestore,storage --project the-kinetic-alphabet \
  "npx vitest run --config tests/opus-security-audit/vitest.audit.config.ts"

# and, to see the red repros for the still-open findings:
AUDIT_RUN_REPROS=1 firebase emulators:exec --only firestore,storage \
  --project the-kinetic-alphabet \
  "npx vitest run --config tests/opus-security-audit/vitest.audit.config.ts"
```

Repro assertions for open findings are quarantined behind `AUDIT_RUN_REPROS=1`,
so a default run of the suite is green and CI-safe.

---

## 4. Ranked findings

Six findings, ranked by demonstrable risk. Each gives the minimal request, the
affected path, the evidence class, the **bound** on impact, and a safe fix.

Two stylistic notes on the fixes: none of them weakens an existing gate, and
each one has a precedent already shipped elsewhere in the same file, which is
cited. No fix was applied — this assignment is audit-only.

---

### F1 — A collaborator on a private video can re-share it to anyone and evict the other collaborators

**Severity: high.** Unauthorized read access to another user's private content,
on a shipped feature.

**Path:** `firestore.rules` → `match /videos/{videoId}` → `allow update`

**Minimal request** (one `updateDoc`, as a user who is on the video's
`collaboratorIds` _or_ merely holds a pending invite):

```js
updateDoc(doc(db, "videos", victimVideoId), {
  collaboratorIds: [myUid, anyStrangerUid], // grant
  pendingInviteUserIds: [], // and/or evict
});
```

**Why it passes.** The non-creator branch freezes only `creatorId` and
`visibility`, then permits any change whose `affectedKeys()` fall inside
`['beatMap','collaborators','collaboratorIds','pendingInvites','pendingInviteUserIds','updatedAt']`.
Entry to that branch requires only `request.auth.uid in collaboratorIds(resource.data)`
or `… in pendingInviteUserIds(resource.data)`. Nothing constrains the array
_delta_ to the caller's own uid. The `read` rule then grants access purely by
membership of those same arrays — so writing a uid into `collaboratorIds` is
equivalent to granting that account read access to a `collaborators-only` video.

**Why the rule is shaped this way.** `acceptInvite()`
(`src/lib/shared/video-collaboration/services/collaborative-video-manager.ts:532`)
is a client-side `arrayUnion(ownUid)` on `collaboratorIds` + `arrayRemove(ownUid)`
on `pendingInviteUserIds`. The branch exists so an invitee can accept. The bug is
that it was widened to "any roster edit" rather than "your own membership".

**Evidence:**

- MEASURED (source) — `rules-source.audit.test.ts` → `F5:` block, 4 assertions:
  the roster keys are in the non-creator `hasOnly`, entry is by membership of
  those arrays, `read` is granted by the same arrays, and `creatorId`/`visibility`
  _are_ frozen (so the gap is precisely the roster, not the whole document).
- MEASURED (source) — the feature is live: `VideoLab.svelte`,
  `PendingInviteCard.svelte`, `UserVideoLibraryView.svelte` and four
  `where("collaboratorIds","array-contains",uid)` queries all consume it.
- PREPARED (runtime) — `firestore-authz.audit.test.ts` → "finding 5": seeds a
  `collaborators-only` video, has the collaborator add a stranger, then asserts
  the stranger's `getDoc` **succeeds**; a second probe asserts the eviction; a
  control asserts the stranger cannot enter unaided and that `visibility`,
  `creatorId` and `delete` stay closed.
- INFERRED — that a granted stranger can then read the video follows from the
  `read` clause plus the write; the PREPARED probe is what would confirm it
  end-to-end.

**Bound.** Requires already being a collaborator or invitee on the target video
(not an anonymous internet attacker). Cannot change `visibility`, `creatorId`, or
delete the video. Cannot reach a `private` video it was never added to.

**Safe fix.** Keep the branch, narrow the delta to the caller's own uid so
accept/decline keeps working and granting does not:

```
|| (
  (request.auth.uid in collaboratorIds(resource.data)
    || request.auth.uid in pendingInviteUserIds(resource.data))
  && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
       'beatMap','collaborators','collaboratorIds',
       'pendingInvites','pendingInviteUserIds','updatedAt'])
  // Roster membership may only move for the caller themselves.
  && collaboratorIds(request.resource.data)
       .removeAll(collaboratorIds(resource.data)).hasOnly([request.auth.uid])
  && collaboratorIds(resource.data)
       .removeAll(collaboratorIds(request.resource.data)).hasOnly([request.auth.uid])
  && pendingInviteUserIds(request.resource.data)
       .removeAll(pendingInviteUserIds(resource.data)).hasOnly([request.auth.uid])
  && pendingInviteUserIds(resource.data)
       .removeAll(pendingInviteUserIds(request.resource.data)).hasOnly([request.auth.uid])
)
```

The `collaborators` / `pendingInvites` object arrays cannot be delta-checked this
way in rules and need the same treatment behind a callable. **Precedent in this
repo:** collection membership took exactly that route —
`users/{uid}/collections/{id}/shares/{recipientId}` is `create, update, delete:
if false` with `mutateSharedCollection` / `shareCollection` doing the validation
(`firebase-functions/src/collections/collectionCollaboration.ts`). Asserted in
the same test block.

---

### F2 — The shared public render caches in Storage can be overwritten, not just filled

**Severity: high.** Attacker-chosen imagery served to every viewer, including
signed-out ones.

**Paths:** `storage.rules` →
`match /pictograph-cells/{fileName}`,
`match /thumbnails/{variant}/{propType}/{fileName}`,
`match /thumbnails/{propType}/{fileName}`

**Minimal request** (one `uploadBytes` from _any_ signed-in session, an
**anonymous** guest included, over an object that already exists):

```js
uploadBytes(
  ref(storage, `pictograph-cells/${knownHash}.webp`),
  attackerWebpUnder200KB,
  { contentType: "image/webp" }
);
```

**Why it passes.** All three clauses are
`allow create, update: if request.auth != null && contentType == 'image/webp' && size < N`.
`update` is granted, so an existing object is replaceable; there is no owner, no
admin claim, and no anonymous-provider exclusion. `allow read: if true` on all
three, so the substituted bytes reach every viewer.

**This is a gap, not a policy disagreement.** Open _create_ is deliberate and
documented — `src/routes/tools/warm-thumbnails/+page.svelte` says the rules
"accept any authenticated writer, anonymous guests included", and the page mints
a guest identity on purpose. What is _not_ intended is replacement:

- `src/lib/shared/render/services/pictograph-cloud-cache.ts` documents its own
  uploader as **"First-write-wins, deduped per session"** — a contract the rule
  never enforces.
- `prepared-qrs` **in the same rules file** implements that contract explicitly:
  `allow create: if … resource == null` with the comment _"First writer wins. A
  later viewer cannot replace an existing scan QR."_

So the intended contract for this class of shared content-addressed cache is
already written down twice; two of the three caches just don't implement it.

**Additional integrity note.** `pictograph-cells` keys are content hashes, but
the downloader fetches the deterministic public URL and returns the blob with no
digest re-check (asserted: the reader contains no `subtle.digest` /
`verifyDigest` / `recomputeHash`). The key therefore _claims_ an identity the
bytes are never held to.

**Evidence:**

- MEASURED (source) — `F1:` block, 5 probes: each of the three clauses grants
  `update` to `request.auth != null`, contains no `resource == null`, contains no
  `sign_in_provider` exclusion, and is `read: if true`; `prepared-qrs` **does**
  carry `resource == null`; the downloader re-verifies nothing; and the
  intent-vs-enforcement mismatch (tool-page policy text + uploader's
  "First-write-wins" docstring) is asserted directly.
- PREPARED (runtime) — `storage-authz.audit.test.ts` → "finding A"/"finding B":
  seed the victim's object, overwrite it as an unrelated full account **and** as
  an anonymous session, and assert the stored byte length changed; then read it
  back **signed out** and assert the attacker's length. Controls assert the
  guards that do hold (signed-out write, non-webp, oversize, delete, manifest,
  shop-covers).

**Bound.** Requires any Firebase session — which the app hands out anonymously,
so effectively any visitor. Payload is capped (200 KB cells / 500 KB thumbnails)
and must be `image/webp`. Cannot delete (admin-only). Does not reach
`users/{uid}/thumbnails/**`, `avatars/**`, or `public-artifacts/**`, which are
correctly owner-scoped (asserted as controls).

**Safe fix.** Split create from update, exactly as `prepared-qrs` does — this
preserves the intentional open crowd-sourced _fill_:

```
match /pictograph-cells/{fileName} {
  allow read: if true;
  allow create: if request.auth != null
    && resource == null
    && fileName.matches('^[0-9a-f]{64}[.]webp$')
    && request.resource.contentType == 'image/webp'
    && request.resource.size < 200 * 1024;
  allow update, delete: if request.auth != null
    && (request.auth.token.admin == true || request.auth.token.role == 'admin');
}
```

Same shape for both `thumbnails/**` blocks. Admin re-warms keep working via the
credentialed `npm run thumbnails:manifest` / `thumbnails:sync` path the tool page
already documents.

---

### F3 — Any unauthenticated caller can rewrite an existing error-telemetry report in place

**Severity: medium-high.** Destroys or forges the evidence trail the team triages
from.

**Path:** `firestore.rules` → `match /errorTelemetry/{docId}` → `allow update`

**Minimal request** (no credential at all):

```js
updateDoc(doc(db, "errorTelemetry", `${utcDay}_${knownHash}`), {
  message: "overwritten",
  count: 0,
  stack: "",
});
```

**Why it passes.** The clause is
`allow update: if !request.resource.data.diff(resource.data).affectedKeys().hasAny(['resolved'])`
— no `request.auth` predicate, no ownership, no `hasOnly`. Every field except
`resolved` is freely replaceable on any document whose id the caller can address.
Doc ids are deterministic by design (`{utcDay}_{hash(key)}`, so clients can dedup
without reading), which is what makes a specific report addressable.
`allow create: if true` is likewise unconditional — unbounded document creation
with no shape or size constraint.

**Intent vs. gap.** The open `create` is documented and defensible ("errors — and
their recurrences — happen before auth initializes"). Protecting only `resolved`
suggests the _update_ path was written for the recurrence-counter case and not
for a hostile writer. `read` and `delete` are correctly `if false`, so this is
tampering and write amplification, **not** disclosure.

**Evidence:**

- MEASURED (source) — `F4:` block, 4 probes: `update` contains no `request.auth`,
  its only constraint is `hasAny(['resolved'])`, it has no `hasOnly`; `create` is
  exactly `if true`; `read` and `delete` are exactly `if false`; and the reporter
  builds deterministic ids from a UTC day.
- PREPARED (runtime) — `firestore-authz.audit.test.ts` → "finding 4": seeds a
  report, rewrites it from `unauthenticatedContext()` and asserts success; asserts
  that touching `resolved` and reading the doc both fail.

**Bound.** The attacker must know or derive the doc id (`utcDay` is trivial; the
key hash needs the error key). Cannot read existing reports, cannot delete them,
cannot flip the admin triage flag.

**Safe fix.** Keep the pre-auth create; constrain the update to the recurrence
shape it exists for, and cap the payload:

```
allow update: if request.resource.data.diff(resource.data).affectedKeys()
    .hasOnly(['count', 'lastSeenAt'])
  && request.resource.data.count is int
  && request.resource.data.count > resource.data.count
  && request.resource.data.count <= resource.data.count + 1;
```

**Precedent in this repo:** `appMetrics` solves the identical
"unauthenticated counter bump" problem this exact way — `hasOnly(['totalGenerated'])`
plus `== resource.data.totalGenerated + 1`, with `create, delete: if false`. If
`create` also needs bounding, the `shop_waitlist` fix in F6 applies here too.

---

### F4 — Scan-count integrity rests on a client-chosen UUID, so the server-side move did not close the counter

**Severity: medium.** Analytics/journey-map integrity plus Firestore write cost.
Also contradicts a claim written into `firestore.rules`.

**Paths:** `src/routes/api/physical-cards/scan/+server.ts` (POST) → writes
`shortcodes/{code}.scanCount`, `shortcodes/{code}.dailyScans.{day}`,
`shortcodes/{code}/scanEvents/{eventId}`, `physicalCards/{id}.scanCount`

**Minimal request** (unauthenticated; repeat with a fresh UUID each time):

```
POST /api/physical-cards/scan
{ "schemaVersion": 1, "shortCode": "AB12CD", "physicalCardId": null,
  "deviceId": "<any fresh RFC-4122 UUID>" }
```

**Why it works.** `deviceId` is validated by _shape only_ —
`/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i`
(`physical-card.ts:22`). That same client value is then used for both controls:

1. the per-actor quota is `withRateLimit(event, RATE_LIMITS.CARD_SCAN, "key", deviceHash)` — 20/min **per deviceId**;
2. the dedup document id is `SHA-256(shortCode|cardId|deviceHash|day|city|country).slice(0,32)` (`scan-event-identity.ts`).

Rotating `deviceId` therefore yields a fresh quota bucket _and_ a fresh event id,
so the `currentDocument: { exists: false }` precondition that makes repeat scans
idempotent never trips. The only remaining ceiling is the coarse IP guard,
`RATE_LIMITS.GENERAL` = **100 requests / minute**. There is no signed attestation,
no server-issued device token, and no auth requirement (`getOptionalFirebaseUser`
attaches a uid when present but never gates on it).

**Why this matters beyond counters.** `firestore.rules` states, at
`shortcodes/{code}/scanEvents`: _"Service-account writes bypass rules; browsers
cannot manufacture events or spoof geo/device attribution."_ The **geo** half is
true and well built — provenance comes only from Cloudflare's `cf` object, with
an explicitly empty header bag (`parseCloudflareGeo(new Headers(), cf)`), and
every card fact is re-read from Firestore under a field mask. The **device
attribution and event manufacture** half is not: a browser can mint device
identities and therefore events.

**Evidence:**

- MEASURED (unit) — `F3:` block executes the shipped
  `validateCardScanIngestRequest` against four attacker-chosen UUIDs (including
  `crypto.randomUUID()`); all four are accepted and echoed back.
- MEASURED (source) — the quota is keyed on `deviceHash`, the event id mixes
  `input.deviceHash`, the handler contains no
  `verifyIdToken|requireFirebaseUser|requireFullFirebaseUser`, and uses
  `getOptionalFirebaseUser`; `RATE_LIMITS.GENERAL` is 100/60 s
  (`rate-limiter.ts:154`); the rules comment is asserted verbatim; the
  client-side counter write _is_ correctly closed (`shortcodes` `update` is
  `isAdmin()`).
- INFERRED — the end-to-end inflation rate (~100 events/min/IP) and the
  idempotency bypass follow from those facts plus the `exists: false`
  precondition. **Not** measured: reproducing it needs a running server plus a
  service account, which this audit is not authorized to use.

**Bound.** Cannot forge geo/city, cannot forge deck/sequence/card metadata
(all server-read), cannot target a nonexistent `shortCode` or `physicalCardId`
(both are existence-checked), cannot read anything back (`scanEvents` is
`read: if isAdmin()`). Cost and integrity, not disclosure.

**Safe fix.** Make the actor key server-attested rather than client-asserted.
The smallest version: issue an opaque device token from a server endpoint
(HMAC over a server secret + issue time), require it on scan ingest, and key
`CARD_SCAN` on the verified token instead of on `hashPrivateValue(body.deviceId)`.
Keep `deviceId` for the dedup id if the "one device, one card, one day, one place"
semantics are wanted, but derive the rate-limit key from the attested value.
Failing that, add a per-`shortCode` ceiling (`RATE_LIMITS` preset keyed on
`shortCode`) so one code's counter cannot be driven by rotation alone. Either way
the rules-file comment should be narrowed to the geo claim it can actually
support.

---

### F5 — `publicHandPaths` / `publicSoloProps` accept any payload at any content-hash id from any full account

**Severity: medium (latent).** Content-addressing is unenforced and `update` is
not owner-scoped. No consumer was found, which is what bounds it.

**Paths:** `firestore.rules` → `match /publicHandPaths/{pathId}`,
`match /publicSoloProps/{soloPropId}`

**Minimal request** (one `updateDoc` as any full account; ids are enumerable
because `allow read: if true` covers `list`):

```js
updateDoc(doc(db, "publicSoloProps", someoneElsesContentHash), {
  ownerId: myUid,
  steps: ["arbitrary"],
});
```

**Why it passes.** `allow create, update: if isFullUser() && request.resource.data.ownerId == request.auth.uid`
consults only the **incoming** `ownerId`. On an update, `request.resource.data` is
the merged result, so setting `ownerId` to your own uid satisfies it regardless of
who stored the document. This is the identical shape `publicSequences` closed on
2026-07-26 — its own comment records it: _"Checking only the incoming ownerId let
any full user hijack any public doc by overwriting it with their own uid."_ The
fixed sibling checks both sides; these two were not updated with it. The `delete`
clause in the _same block_ does check `resource.data.ownerId`, so the asymmetry is
visible inside one rule.

**The sharper problem is integrity, not ownership.** These documents are keyed by
`contentHash` and written with `{ merge: true }` precisely so identical shapes
converge (`public-index-syncer.ts:388`), so _legitimate_ convergence already
overwrites `ownerId` — last honest writer wins on attribution, by design. What is
not by design is that **nothing binds the document id to the payload it claims to
be**: any full account can store arbitrary `steps` / `locations` at any hash id.
A consumer that trusts "doc id == hash of this content" reads a lie.

**Evidence:**

- MEASURED (source) — `F2:` block, 3 probes: both clauses contain
  `request.resource.data.ownerId == request.auth.uid` and **no** bare
  `resource.data.ownerId` (negative lookbehind, so the `request.` form doesn't
  false-match); `delete` in the same block _does_ check it; `read` is `if true`;
  `publicSequences`' update checks both sides; and the syncer writes both
  collections with `docId: *.contentHash`.
- PREPARED (runtime) — `firestore-authz.audit.test.ts` → "finding 1": seeds the
  victim's documents, overwrites both as an unrelated full account, and asserts
  via a rules-disabled read that `ownerId` flipped while `contentHash` still
  names the original. A control asserts an anonymous session is correctly
  blocked by `isFullUser()`.

**Bound — and this is why it ranks fifth.** A repository grep across `src/`,
`scripts/`, `firebase-functions/`, and `packages/` found **no reader** of either
collection: only the writer (`public-index-syncer.ts`), a migration script
(`scripts/migrations/data-parity-guard.ts`), and comments. There is therefore no
user-visible impact today. It is a trap primed for whenever a Browse/discovery
consumer ships. Requires a full (non-anonymous) account.

**Safe fix.** Split create from update and bind the id, mirroring the
already-shipped `sequenceRevisions` / `tunnel-collection/revisions` pattern
(content-addressed create, immutable thereafter):

```
match /publicSoloProps/{soloPropId} {
  allow read: if true;
  allow create: if isFullUser()
    && request.resource.data.ownerId == request.auth.uid
    && request.resource.data.contentHash == soloPropId;
  // Content-addressed documents are immutable; convergence is a no-op create.
  allow update: if isFullUser()
    && resource.data.ownerId == request.auth.uid
    && request.resource.data.ownerId == request.auth.uid
    && request.resource.data.contentHash == soloPropId;
  allow delete: if isAuthenticated()
    && resource.data.ownerId == request.auth.uid;
}
```

Note this changes convergence semantics (a second publisher of the same shape can
no longer re-stamp `ownerId`), so it needs the `{ merge: true }` writer to tolerate
a permission-denied on an already-present hash — a product call, not a pure
rules change. The minimal rules-only version is to add
`resource.data.ownerId == request.auth.uid` to `update` and leave convergence to
`create`.

---

### F6 — `shop_waitlist` accepts unauthenticated documents with no field allowlist

**Severity: medium-low.** Unbounded write amplification from signed-out clients.

**Path:** `firestore.rules` → `match /shop_waitlist/{entryId}` → `allow create`

**Minimal request** (no credential, attacker-chosen document id):

```js
setDoc(doc(db, "shop_waitlist", "attacker-chosen-id"), {
  email: "a@b.co",
  junk: "x".repeat(500_000), // anything, up to the 1 MiB document ceiling
  forgedSource: "admin-import",
});
```

**Why it passes.** The clause validates one field's type and length
(`email is string && size() > 3 && size() < 320`) and nothing else — no
`request.auth`, no `hasOnly`, no cap on any other key. Open create is intentional
("signed-out visitors can join"), and the comment even claims the document is
"shape-checked"; the check covers `email` alone.

**Evidence:**

- MEASURED (source) — `F6:` block, 3 probes: `create` has no `request.auth` and
  no `hasOnly` but does check `email is string`; `read` is `isAdmin()` and
  `update, delete` is exactly `if false`; the sibling public-submission surface
  `software_submissions` is `create, update, delete: if false` and routes through
  the rate-limited API, while `waitlist.ts` writes `shop_waitlist` directly.
- PREPARED (runtime) — `firestore-authz.audit.test.ts` → "finding 3": a
  signed-out `setDoc` with 50 KB of unrelated fields succeeds; reads, edits and
  the same write as an ordinary user are asserted closed.

**Bound.** Write-only: `read` is admin-only and `update, delete` are `false`, so
there is no disclosure and no way to alter an existing signup. Impact is storage
and cost plus junk in the launch list.

**Safe fix.** Add the allowlist the comment already claims, and keep it open:

```
allow create: if request.resource.data.keys().hasOnly(['email', 'source', 'createdAt'])
  && request.resource.data.email is string
  && request.resource.data.email.size() > 3
  && request.resource.data.email.size() < 320
  && request.resource.data.get('source', '') is string
  && request.resource.data.get('source', '').size() <= 64;
```

**Better, and the repo's own precedent:** route it through the rate-limited
server API the way `software_submissions` does (`/api/software-submissions`,
`RATE_LIMITS.SOFTWARE_SUBMISSION` = 4/min/IP) and close client writes entirely.

---

## 5. Lower-severity observations

Each is asserted in `rules-source.audit.test.ts` → `notes:` block, so the claim
is checkable. None is ranked as a finding.

| #      | Observation                                                                                                                                                                                                                                                                           | Assessment                                                                                                                                                                                                                 |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **N1** | `/usernames` grants `read` to any session with no `get`/`list` split, so one query enumerates the whole username → userId map (guests included).                                                                                                                                      | Availability-check reads are intentional; _enumeration_ is probably not. `/users` splits `get` and `list` and constrains `list`; `/usernames` could do the same and keep availability checks on `get`.                     |
| **N2** | The Hall of Shame daily cap (3/day) is advisory. `hallOfShame` `create` consults no counter, and `hallOfShameRateLimits` is `read, create, update` for `limitId.matches(request.auth.uid + '_.*')` — the subject can zero its own counter.                                            | A full account can flood the moderation queue. Enforcement needs a callable or a `getAfter()` counter proof. Moderation `status` is correctly admin-only.                                                                  |
| **N3** | `isAgeVerified()` reads `userPrivateProfiles/{uid}.ageVerifiedAt`, a field in the owner-writable `hasOnly()` list with no value validation. The gate's subject writes the gate.                                                                                                       | Self-attestation is the normal pattern for an age checkbox, so this is likely intentional. Worth a deliberate decision rather than an accident, since it gates adult content.                                              |
| **N4** | The two rules files disagree on what an admin is. `firestore.rules` `isAdmin()` accepts `token.admin`, `token.isAdmin`, or `token.role == 'admin'`; `storage.rules` `isAdmin()` accepts only `role`. Other clauses in `storage.rules` spell out `admin == true \|\| role == 'admin'`. | Availability, not exposure: an admin provisioned with the boolean claim alone cannot read feedback screenshots in the admin review UI, but _can_ delete thumbnails. Inconsistent within one file.                          |
| **N5** | `ml-training/{userId}/**`, `users/{userId}/recordings/**` and `users/{userId}/audio/**` carry no size or content-type cap.                                                                                                                                                            | Owner-scoped, so not cross-tenant — but one account can push unbounded bytes. Neighbours in the same file do cap (avatars 1 MB, thumbnails 500 KB, POI 10 MB, pronunciation 5 MB), so the omission reads as inconsistency. |
| **N6** | `match /products/{productId}` is declared **twice** in `firestore.rules` (once with a `prices` subcollection, once under "STORE"). Duplicate match blocks OR together.                                                                                                                | No access change today. It does mean a future tightening of one block is silently overridden by the other.                                                                                                                 |
| **N7** | The two spec items already tracked as open are still open: `qr-video/[hash]` PUT has `withRateLimit` but no `requireFirebaseUser`; `tika/sequence` is likewise rate-limit-only.                                                                                                       | **Not new.** Both are recorded in `2026-05-23-security-hardening-design.md` as awaiting Austen's product call on guest access. Confirmed unchanged; re-reporting them as findings would be noise.                          |

### Non-security incidental (test infrastructure)

`tests/config/vitest.rules.config.ts` sets `forks: { singleFork: true }` as a
top-level key. vitest 4.0.18 does not recognise it (`InlineConfig` has no
`forks`), so **`singleFork` is inert** and the shipped rules suite is not
actually serialized. That file's own comments say the shared emulator process
gets wedged by concurrent write streams, so this is worth a look by whoever owns
it. I did not change it — not this assignment's file. My own config uses
`fileParallelism: false` + `maxWorkers: 1`, which vitest 4 does honour.

---

## 6. Boundaries checked and found sound

Recorded so a reviewer knows these were examined rather than skipped. All
MEASURED (source), in `rules-source.audit.test.ts` → "verified sound", with
PREPARED runtime controls in the two emulator files.

- **Provider tokens and order pricing have no client path.**
  `metaPublishConnections`, `instagramAuthLinks`, `instagramDataDeletionRequests`,
  `userAdminMetadata` are all `read, write: if false`; `orders` is admin-read /
  `write: if false`.
- **`publicSequences` ownership is properly double-checked** on update (both
  stored and incoming `ownerId`), and the whole publish path requires the
  `existsAfter`/`getAfter` transaction shape.
- **Privilege escalation via the public profile is closed.** `role`, `isAdmin`,
  `isDisabled`, and every counter are outside `ownerProfileFields()`, and
  `hasSafeInitialPrivileges()` pins them at create.
- **The r2 presign callables are sound.** All 8+ exported `onCall`s begin with
  `requireAuth`, the object key is built server-side from sanitized components
  (`s.replace(/[^a-zA-Z0-9_\-\.]/g, "")`), and delete/prefix-delete assert a
  `users/{callerUid}/` prefix. Content type is allowlisted and size is capped
  per category.
- **Shared-collection membership is validated in a callable**, not by rules:
  `mutateSharedCollection` re-reads the source sequence and the public mirror,
  rejects adding another user's private sequence, and rejects adding an
  unpublished sequence to a public collection.
- **Private message media stays Admin-SDK-written.** `message-image-staging` is
  `get, list, update: if false`; `message-images` is
  `list, create, update, delete: if false` with `get` gated on conversation
  participation.
- **The Storage catch-all is deny-all** (`match /{allPaths=**}` → `read, write: if false`).
- **API handler guard sweep** (29 handlers): every `admin/*` route uses
  `requireAdmin` + `withRateLimit`; `physical-cards/issue` and
  `physical-cards/complete` use `requireFullFirebaseUser` + `withRateLimit`;
  `feedback/ingest` uses a header API key + rate limit. The unauthenticated
  handlers are `physical-cards/scan` (F4), `qr-video/[hash]` and `tika/sequence`
  (N7), `software-submissions` (rate-limited, writes via Admin SDK with client
  writes closed in rules), and the `dev`-gated render/capture routes.
- **`physical-cards/scan` geo provenance is well built** — Cloudflare `cf` only,
  with an explicitly empty header bag so a direct caller cannot forge location,
  and every card fact re-read from Firestore under a field mask. Only the device
  identity is weak (F4).
- `sequenceRevisions` `get: if isAuthenticated()` looks broad, but `create`
  requires `publicationState == 'public'` plus the public projection to exist
  after the transaction, `list` is admin-only, and the id is
  `v1_<sha256 of content>` — unguessable without the content. Assessed as not a
  finding.
- `mutateSharedCollection` will record `sequenceOwnerIds[id] = actorId` when a
  caller claims a _public_ sequence as its own. Mislabelled attribution only, no
  data exposure; noted, not ranked.

---

## 7. Commands run and results

| Command                                                                                                                                                      | Result                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `pnpm install --frozen-lockfile`                                                                                                                             | exit 0 (28.9 s)                                                                                                    |
| `npm i -g firebase-tools@latest`                                                                                                                             | exit 0 — firebase-tools **15.30.0**                                                                                |
| `firebase emulators:exec --only firestore,storage --project the-kinetic-alphabet "npx vitest run --config tests/opus-security-audit/vitest.audit.config.ts"` | **exit 1 — blocked.** `Failed to make request to .../cloud-firestore-emulator-v1.22.0.jar`; egress policy 403 (§3) |
| `curl -sS "$HTTPS_PROXY/__agentproxy/status"`                                                                                                                | 5 hosts `connect_rejected` / `403 to CONNECT` (§3)                                                                 |
| `npx vitest run --config tests/opus-security-audit/vitest.audit.config.ts rules-source`                                                                      | **37 passed / 37**, 1 file, ~0.3 s                                                                                 |
| `npx tsc --noEmit` over `tests/opus-security-audit/**/*.ts` (project `tsconfig.json`, explicit `typeRoots`)                                                  | **clean, 0 errors** across all 4 files                                                                             |
| `npx vitest run … firestore-authz --testTimeout=8000`                                                                                                        | 31 collected, suite fails at `ECONNREFUSED 127.0.0.1:8080` (expected: no emulator)                                 |
| `npx vitest run … storage-authz --testTimeout=8000`                                                                                                          | 19 collected, suite fails at `ECONNREFUSED 127.0.0.1:8080` (expected: no emulator)                                 |
| `npx prettier --check tests/opus-security-audit docs/reports/opus-batch-2026-09-12`                                                                          | **clean** (after one `--write` pass; formatting only, all 37 probes still green afterwards)                        |
| `npx eslint tests/opus-security-audit`                                                                                                                       | **not applicable** — `tests/` is in the global `ignores` of `eslint.config.js:29`                                  |

Per `.claude/rules/fast-iteration-loop.md` and `verification-protocol.md` these
are the proportionate gates for an additive, test-and-docs-only change: the
closest tests, the narrowest type check over exactly the changed files, and the
documentation formatting check. No full `npm run check` or build was run — the
change crosses no project-wide type or build boundary and touches no production
module.

Emulator toolchain present and ready apart from the JAR: `java` openjdk 21.0.10,
`node` v22.22.2, `@firebase/rules-unit-testing` 5.0.1, 15 GB RAM available
(well over the 4096 MB gate in `resource-budget.md`). No process on port 5173 was
started, probed, or touched; no server of any kind was started by this task.

---

## 8. Regressions, limitations, and what is not claimed

**Regressions introduced: none.** No production file, rule, existing test, or
config was modified. The only additions are five new files under
`tests/opus-security-audit/` plus this report. `npx tsc --noEmit` over the new
files is clean and the offline suite is green; the new vitest config is separate
from `tests/config/`, so the shipped `npm run test:rules` scripts are untouched.

**Limitations — read these before acting on the findings:**

1. **No live allow/deny outcome was measured.** The egress policy blocked the
   Firestore emulator JAR (§3). Every runtime consequence is labeled PREPARED or
   INFERRED. The rule-text and unit facts are measured and re-runnable; the
   allow/deny outcomes are not yet confirmed in this session.
2. **F4's end-to-end exploitability is INFERRED.** Reproducing counter inflation
   needs a running server plus a service account, which this audit was not
   authorized to use. What is measured is that the validator accepts arbitrary
   UUIDs and that both the quota key and the dedup id derive from that value.
3. **F5's impact bound rests on a grep.** No reader of `publicHandPaths` /
   `publicSoloProps` was found in `src/`, `scripts/`, `firebase-functions/`, or
   `packages/`. A consumer outside those trees, or one landing later, changes the
   severity.
4. **Rules semantics were not independently verified for this emulator version.**
   The claims that `update` merges into `request.resource.data`, that
   `{path=**}` matches zero or more segments under `rules_version 2`, and that an
   error in one `||` operand denies rather than allows are standard documented
   behaviour and are consistent with this repo's own comments — but they were not
   re-measured here.
5. **Deployed rules were not inspected.** Everything is against the rule files at
   `c4be1619`. If production is running an older or hand-edited deployment, the
   live picture differs.
6. **Not covered:** the Realtime Database rules (`database.rules.json` is
   referenced by `firebase.json` but was not part of this assignment's scope),
   the Stripe extension's own internal rules, and guest local retry/upgrade
   (another agent's domain).

**Not claimed:** no user or device gate was exercised. No browser, no dev server,
no emulator, no deployed environment, no live data was touched. No finding here
has been confirmed against a running system.

**Recommended next step:** run the two prepared emulator files on a machine where
`storage.googleapis.com` is reachable — first plain (controls green, current
behaviour documented), then with `AUDIT_RUN_REPROS=1` (repros red, confirming the
six findings). That converts every PREPARED label above into a MEASURED one in a
single command, before any rule is changed.

---

## 9. Reviewer checklist

- [ ] Run the prepared emulator suite (§3) and confirm the 50 probes' outcomes.
- [ ] F1: decide roster-delta rule vs. moving invite/accept to a callable.
- [ ] F2: confirm the intended contract is first-writer-wins (the uploader
      docstring and `prepared-qrs` both say so), then split create from update.
- [ ] F3: confirm the `errorTelemetry` update path only ever needs a counter bump.
- [ ] F4: product call on device attestation vs. a per-`shortCode` ceiling; and
      narrow the rules-file comment to the geo claim it supports.
- [ ] F5: product call on content-addressed convergence semantics before the
      stricter rule lands.
- [ ] F6: allowlist in rules, or move behind the rate-limited API.
- [ ] N1–N6: triage; N7 needs no action (already tracked).
- [ ] Test infra: `tests/config/vitest.rules.config.ts` `singleFork` is inert
      under vitest 4 (§5).
