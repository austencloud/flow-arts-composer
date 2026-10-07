---
status: backlog
value: 3
effort: M
remaining: Current src/scripts have no productionLedger or deckIdentity owner; implement the official card identity and single release funnel.
depends_on: ''
plan_path: ''
tags: []
last_triaged: '2026-10-07'
work_state: ready
---

# Official Choreo Card Production Ledger and Single Release Funnel

**Date:** 2026-07-27

**Status:** Approved direction; implementation not started

**Originating feedback:** `Fd5LhGdHTWEor2GV7HSI`

**Scope:** Deck release, physical production, QR identity, scan provenance,
direct fulfillment, migration, and recovery

## Decision summary

TKA gets one release funnel with two clearly different outputs:

1. **Prototype** creates a proof that can be downloaded or printed. It is
   visibly marked as a prototype, carries a prototype or digital QR, and never
   enters official production counts.
2. **Official Production** creates a permanent run in the production ledger,
   reserves one deck identity per intended copy and one card identity per card,
   renders the live QRs in a trusted runtime, and hands those artifacts to a
   printer through a recorded production channel.

The invariant is not "one piece of paper can exist for each QR." Software
cannot enforce that after a person, operating system, or printer receives the
pixels. The enforceable invariant is:

> Every official card identity is unique, every official production attempt
> enters through one permanent ledger, and a copy made outside that ledger is
> a clone of an existing identity rather than a new official card.

The system must say exactly what it knows. It can know that an identity was
reserved, an artifact was rendered, a provider accepted a job, a provider or
operator reported production, and a QR was observed in a city. It cannot infer
physical possession, a unique human, or an unreported extra print.

## Canonical precedence

This is the end-state design for official card production.

- It **extends** `docs/reference/physical-card-instrumentation.md`. The
  implemented v1 records serialized artwork exports. Those records remain
  valid historical facts, but they do not become proof of production.
- It **supersedes** any assumption that a downloadable PDF or ZIP is an
  official production channel.
- It **supersedes in part**
  `docs/superpowers/specs/active/2026-07-02-scan-card-to-collection-design.md`.
  A collection-filing scan is still allowed, but it is recorded as a filing
  observation with no journey location. It is not silently discarded.
- It preserves legacy `tka.run/{code}` links and `?pid=` cards. New official
  carriers use the resolver contract in this document.

## Honest guarantees

| Claim                                                             | Guarantee                                                 | Conditions                                                                                                                                         |
| ----------------------------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two official cards receive the same identity                      | Prevented                                                 | IDs and carrier tokens are allocated server-side with create-only writes.                                                                          |
| An official run exists without a ledger record                    | Prevented                                                 | The production worker accepts only a committed run ID.                                                                                             |
| A canceled identity is reused                                     | Prevented                                                 | Canceled and failed identities are tombstoned permanently.                                                                                         |
| The same file is submitted twice by a retry                       | Prevented                                                 | Every stage uses a stable idempotency key and compare-and-set transition.                                                                          |
| One provider order prints one distinct identity set per deck copy | Enforced when the provider supports per-copy variable art | Provider certification is a launch gate. A quantity of several identical decks is not accepted as a serialized run.                                |
| One physical piece of paper exists for each identity              | Not provable                                              | A provider, operator, or recipient can duplicate pixels after handoff.                                                                             |
| A scan proves possession or ownership                             | Not provable                                              | A visible QR can be photographed or forwarded. The record says "observed" or "discovered."                                                         |
| A scan came from a physical card                                  | Classified, not proven                                    | Physical, screen, presentation, prototype, and legacy carrier types are separate. A photograph of a physical QR still resolves as physical-origin. |
| Every scan reaches TKA                                            | Not provable                                              | Offline devices, blockers, failed navigation, and non-browser readers can prevent completion.                                                      |
| Production history survives a vendor or database migration        | Required                                                  | The append-only event export, hashes, artifacts, and resolver aliases are portable and backed up outside Firestore.                                |

## Confirmed codebase state

The following was read in source on 2026-07-27.

- `DeckReleaserTab.svelte` releases deck manifests with `releaseDeck(...)`.
  While a fresh deck is still in review, a separate `PrintPanel` exposes
  printing and export, so physical output can happen before release. Sequence
  content and recipe act as the release snapshot, while name and description
  can currently be patched and a manifest can currently be deleted.
- Front-bearing PDF and ZIP exports call `prepareSerializedPrintRun(...)`.
  The browser receives the allocated identities and renders the identity-bearing
  fronts.
- `physical-card.ts` defines a v1 `physicalCardId` as a serialized artwork
  slot. Its own contract correctly states that it does not prove a unique piece
  of paper.
- `/api/physical-cards/issue` creates `cardPrintRuns` and `physicalCards`.
  `/api/physical-cards/complete` changes an allocated run to `ready` or
  `failed`.
- `/api/physical-cards/scan` validates the short code and physical ID, requires
  a `ready` run, derives city and approximate IP-based latitude and longitude
  from Cloudflare request metadata, hashes the browser device ID, and
  deduplicates by card, device, day, and city.
- `ChoreoCard.svelte` and `QRMandalaOverlay.svelte` generate a reusable sequence
  short-code QR for signed-in screen viewers. They do not create a distinct
  physical identity.
- The Festivals feature already stores structured `festivals/{festivalId}`
  records with name, dates, city, country, and coordinates through
  `festival-repository.ts` and `festival-schemas.ts`.
- The card renderer has established main-thread and worker paths, card-front
  and card-back parity fixtures, and an OffscreenCanvas worker pool. There is
  no deployed trusted production renderer.
- Firebase Functions, Firestore transactions, Stripe webhook handling, and R2
  upload primitives exist. No durable production-job queue or printer-provider
  contract exists.
- MakePlayingCards' public material documents browser upload, individual card
  art, order status, fulfillment sheets, split shipments, and tracking. The
  public material reviewed did not document an API, signed webhook, or
  per-copy variable-data contract.

## Vocabulary

Names carry one meaning throughout code, Firestore, UI, exports, and support
tools.

| Term              | Meaning                                                                  | Example                                        |
| ----------------- | ------------------------------------------------------------------------ | ---------------------------------------------- |
| `DeckRelease`     | Immutable content and visual recipe                                      | Deck #047                                      |
| `CardDesign`      | One immutable card slot inside a release                                 | Deck #047, card 12                             |
| `Edition`         | Optional named packaging or story variant that does not change the cards | "Fire Drums 2026 Edition"                      |
| `ProductionRun`   | One attempt to produce a stated quantity through one channel             | 20 deck copies ordered on 2031-04-10           |
| `DeckInstance`    | One intended deck copy in a run                                          | Copy 7 of 20                                   |
| `CardInstance`    | One intended physical card inside a deck instance                        | Copy 7, card 12                                |
| `Carrier`         | The QR-bearing representation that resolves to content and provenance    | Physical card, screen, presentation, prototype |
| `Presentation`    | An intentional screen-sharing session                                    | A workshop projector session                   |
| `ArtifactEvent`   | An immutable production or lifecycle fact                                | Provider accepted run                          |
| `ScanObservation` | A deduplicated observation of a carrier                                  | Seen in Madison on 2026-08-02                  |
| `Projection`      | Mutable query model rebuilt from events                                  | Run status, city stops, produced count         |

### Release, edition, and run are deliberately separate

A release never changes when more copies are made. An edition is optional and
describes a deliberate named variant, not a production date. A run records what
actually happened.

Example:

- Deck #047 is frozen in 2026.
- Its first run is produced for Fire Drums 2026.
- A customer orders the same release in 2031.
- The 2031 order creates a new run and new instances.
- The new card may truthfully say that the design debuted in 2026 if that
  release fact was explicitly recorded. Its copy detail says it was produced
  in 2031. It does not say that the 2031 copy was released at the festival.

Free-text notes never become structured event provenance. A URL never encodes
festival, recipient, order, or print semantics.

### Where the rich provenance lives

| Question                               | Source of truth                                         | Public by default              |
| -------------------------------------- | ------------------------------------------------------- | ------------------------------ |
| Which deck design is this?             | DeckRelease and CardDesign slot                         | Yes                            |
| Which named edition is this?           | Edition                                                 | Yes                            |
| Did the design debut at a festival?    | Explicit release debut reference plus festival snapshot | Yes, when verified             |
| Was this copy produced for a festival? | ProductionRun context plus festival snapshot            | Yes, without recipient data    |
| When was this copy printed?            | Provider production event or operator attestation       | Yes at date-level              |
| When was it purchased?                 | Private order event                                     | No                             |
| Who first received it?                 | Private recipient reference                             | No, unless that person opts in |
| Where has it been observed?            | Eligible city-level ScanObservations                    | Later public projection        |
| Who owns it now?                       | Unknown                                                 | Never inferred from a scan     |

## Identity model

### Internal identity

- Every primary ID is opaque and globally unique.
- IDs are never derived from Firestore paths, provider order numbers, card
  position, recipient, event, or timestamp.
- Provider IDs are external references only.
- Every entity carries `schemaVersion` and `identityEra`.
- Deleting a release, run, deck instance, card instance, or carrier never
  makes its ID reusable.

`DeckRelease.deckNumber` remains the human reference already used by the
application. It is not the primary key for new production records.

### Public carrier token

New carriers resolve through:

```text
https://tka.run/x/{token}
```

- `x` is the only type marker in the path.
- `{token}` is a case-sensitive, unguessable token with at least 96 bits of
  entropy.
- The token contains no event, deck, recipient, order, location, or sequence
  data.
- The resolver performs a server lookup and chooses the destination.
- A token maps to exactly one carrier. A carrier binds directly to its target;
  the client cannot pair an arbitrary physical ID with an arbitrary short code.
- Printed tokens are not rotated. A compromised token can be flagged,
  restricted, or tombstoned, but the URL continues to resolve to an honest
  status page.

This follows the useful split in GS1 Digital Link between a product class,
batch or lot, and serialized instance, without claiming that TKA identifiers
are GS1 identifiers.

### Carrier types

| Carrier type        | Created when                                         | Identity target                  | Eligible for official produced count | Eligible for physical journey |
| ------------------- | ---------------------------------------------------- | -------------------------------- | ------------------------------------ | ----------------------------- |
| `physical`          | An official run reserves a CardInstance              | CardInstance                     | After production evidence            | Yes, after activation         |
| `digital`           | A durable sequence QR is needed in the normal viewer | Sequence and screen surface      | No                                   | No                            |
| `presentation`      | A person explicitly starts Present mode              | Presentation plus sequence       | No                                   | No                            |
| `prototype`         | A proof PDF, ZIP, or local print is generated        | Prototype artifact plus sequence | No                                   | No                            |
| `legacy-serialized` | Adapter for v1 `?pid=` cards                         | v1 physicalCardId                | No                                   | Kept as legacy observations   |
| `legacy-content`    | Existing `tka.run/{code}` with no carrier            | Sequence                         | No                                   | No physical claim             |

### Screen QR rules

Normal screen rendering must never mint a CardInstance.

- A normal `ChoreoCard` QR is a stable digital carrier.
- Its creation is idempotent for the tuple of short code, screen surface, and
  carrier schema version. The stored index returns the same carrier on later
  renders.
- Component mount, list virtualization, rerender, theme change, and page refresh
  do not create new carrier identities.
- Present mode creates one `Presentation` and one or more presentation
  carriers. The same session may be scanned many times without pretending that
  many physical cards exist.
- Closing a presentation ends its live session metrics. Its QR continues to
  resolve the sequence and remains classified as presentation-origin.
- A screenshot or print of a screen QR remains a digital-origin carrier.
- Official physical tokens are never sent to the ordinary viewer.
- Official production previews returned to the browser mask the live QR and
  reduce resolution enough that the token cannot be reconstructed.

### Enforcement chokepoints

The funnel is enforced in code, not only by button placement.

- One server command reserves official production identities.
- Only the trusted renderer accepts `physical` carriers.
- Browser PDF, ZIP, print, and screenshot exporters accept only prototype or
  digital carrier inputs.
- The current browser-side `withPhysicalCardId(...)` path becomes a
  legacy-compatibility path and cannot mint official-v2 art.
- A branded `OfficialCarrierUrl` type is constructed only in server production
  code. Prototype and digital URLs use different types.
- A dependency-boundary test fails if browser export modules import the
  official carrier allocator or official artifact renderer.
- Firestore rules deny browser creation of runs, instances, carriers, and
  artifact events.

## The single release funnel

The existing Deck Releaser owns the flow. A second card-release product is not
created.

```text
Compose
  -> Review
  -> Freeze release
  -> Choose output
       -> Prototype -> proof artifact
       -> Official Production
            -> configure run
            -> reserve identities
            -> trusted render
            -> provider or operator handoff
            -> production evidence
            -> active cards
```

### 1. Compose

Existing deck composition, recipe, seed, prop, theme, card ordering, and
metadata behavior stay in place.

### 2. Review

Review uses non-live QR placeholders. The user can still edit, swap, reroll,
rename, and inspect cards. No production identity exists.

The current Print panel moves under a clearly labeled Prototype action. It is
not adjacent to the release action in a way that makes a proof look official.

### 3. Freeze release

Freeze performs the current deck release transaction plus the stronger
invariants below:

- Canonical content snapshot and visual recipe are immutable.
- Every CardDesign gets a stable release-local slot and content hash.
- The release manifest stores its schema version and whole-manifest SHA-256.
- Optional design-debut context is entered through structured fields.
- Editing content after freeze creates another release. Display-name and
  editorial corrections live in a separate annotation record so the frozen
  hash does not change.
- The current hard delete becomes a tombstone operation. The deck number,
  manifest hash, and resolver history remain reserved.

The UI says **Freeze Deck**, followed by the permanent deck number and a short
plain-language explanation. It does not say that physical cards were produced.

### 4. Choose output

#### Prototype

Prototype is the only user-downloadable front-bearing output.

- Every front and back carries a visible `PROTOTYPE` mark.
- Its QR is a prototype carrier or a non-live placeholder, selected by the
  purpose of the proof.
- Prototype artifacts never create DeckInstances or CardInstances.
- Prototype scans resolve normally but say "Prototype copy" and are excluded
  from discovery rank, city journeys, and produced counts.
- Reprinting a prototype is allowed because it cannot masquerade as an
  official instance.

#### Official Production

Official Production is a guided run setup:

1. Choose edition or create one.
2. Enter quantity.
3. Choose production channel.
4. Enter production context, such as customer order, festival distribution,
   studio stock, replacement, or gift.
5. Enter fulfillment destinations when the provider channel supports them.
6. Review the exact number of deck and card identities that will be reserved.
7. Submit the run.

The confirmation sentence is concrete:

> Produce 20 distinct copies of Deck #047. This reserves 20 deck identities
> and 1,080 card identities. Canceled identities will not be reused.

No official PDF or ZIP download button appears in the normal release UI.

### 5. Run status

The released-deck view gains a production section with:

- run number and immutable internal reference;
- quantity and identity count;
- channel and evidence level;
- edition and production context;
- current state;
- timestamps labeled by meaning;
- provider order and shipment references when present;
- failure and retry history;
- a card-instance lookup;
- a chronological artifact timeline.

The timeline comes from ledger events. It is not a manually maintained log.

## Data model

The sketches below define semantics, not final TypeScript syntax.

### Production context

Festival provenance reuses the existing festival catalog and snapshots the
historical fields needed to keep the production event truthful if the catalog
is edited later.

```ts
type ProductionContext =
  | {
      kind: "festival-distribution";
      festivalId: string;
      festivalSnapshot: {
        name: string;
        city: string;
        country: string;
        startsOn: string;
        endsOn: string;
      };
    }
  | { kind: "customer-order"; orderId: string }
  | { kind: "studio-stock"; label: string | null }
  | {
      kind: "replacement";
      replacesRunId: string;
      reasonCode: string;
    }
  | { kind: "gift"; label: string | null }
  | { kind: "other"; label: string };
```

The same snapshot shape can support an explicit design-debut reference on a
release. A festival lookup enriches the ledger; it does not become part of the
carrier URL.

### CardDesign storage

A CardDesign stays inside the frozen release manifest. Its stable identity is
the pair `{releaseId, cardDesignSlot}`, and the manifest records that slot's
content hash, sequence reference, visual inputs, and authored order. A new
top-level CardDesign collection is not needed unless future query evidence
earns it.

### `cardEditions/{editionId}`

```ts
interface CardEdition {
  schemaVersion: 1;
  editionId: string;
  releaseId: string;
  label: string;
  packagingVariant: string | null;
  story: string | null;
  createdAt: Timestamp;
  createdBy: string;
  manifestHash: string;
}
```

An edition is immutable. Changed packaging or edition story creates another
edition. A changed card face, back, QR placement, or printed claim creates
another DeckRelease because it changes the CardDesign.

### `productionRuns/{runId}`

```ts
interface ProductionRunProjection {
  schemaVersion: 1;
  identityEra: "official-v2";
  runId: string;
  releaseId: string;
  editionId: string | null;
  requestedDeckCount: number;
  cardCountPerDeck: number;
  reservedCardCount: number;
  producedDeckCount: number;
  shippedDeckCount: number;
  deliveredDeckCount: number;
  tombstonedDeckCount: number;
  channel: "provider" | "operator-print-station";
  evidenceLevel: "provider-confirmed" | "operator-attested";
  providerKey: string | null;
  providerRunId: string | null;
  orderId: string | null;
  productionContext: ProductionContext;
  state: ProductionRunState;
  stateVersion: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  artifactManifestRef: string | null;
  artifactManifestHash: string | null;
}
```

This document is a projection. The event ledger is authoritative.

### `deckInstances/{deckInstanceId}`

```ts
interface DeckInstanceProjection {
  schemaVersion: 1;
  identityEra: "official-v2";
  deckInstanceId: string;
  runId: string;
  releaseId: string;
  editionId: string | null;
  ordinal: number;
  state:
    | "reserved"
    | "rendered"
    | "submitted"
    | "produced"
    | "shipped"
    | "delivered"
    | "tombstoned";
  recipientRef: string | null;
}
```

`recipientRef` points to private fulfillment data. A person's name or address
never appears in a public production record.

### `cardInstances/{cardInstanceId}`

```ts
interface CardInstanceProjection {
  schemaVersion: 1;
  identityEra: "official-v2";
  cardInstanceId: string;
  deckInstanceId: string;
  runId: string;
  releaseId: string;
  cardDesignSlot: number;
  shortCode: string;
  carrierId: string;
  ordinalWithinDeck: number;
  state:
    | "reserved"
    | "rendered"
    | "submitted"
    | "produced"
    | "shipped"
    | "delivered"
    | "tombstoned";
  scanEligibility: "preproduction" | "active" | "tombstoned";
  producedAt: Timestamp | null;
}
```

### `carrierResolvers/{token}`

```ts
interface CarrierResolverRecord {
  schemaVersion: 1;
  carrierId: string;
  carrierType:
    | "physical"
    | "digital"
    | "presentation"
    | "prototype"
    | "legacy-serialized"
    | "legacy-content";
  targetType: "card-instance" | "sequence" | "presentation" | "prototype";
  targetId: string;
  shortCode: string;
  status: "reserved" | "active" | "flagged" | "tombstoned";
  createdAt: Timestamp;
}
```

The collection is browser-read-closed and browser-write-closed. Only the
resolver and admin tools read it.

### `artifactEvents/{eventId}`

```ts
interface ArtifactEvent {
  schemaVersion: 1;
  eventId: string;
  aggregateType: "release" | "edition" | "run" | "deck" | "card" | "carrier";
  aggregateId: string;
  eventType: string;
  eventTime: Timestamp;
  recordedAt: Timestamp;
  actor: {
    type: "user" | "system" | "provider" | "operator";
    id: string | null;
  };
  source: {
    type: "tka" | "provider-webhook" | "provider-poll" | "operator-attestation";
    id: string | null;
  };
  idempotencyKey: string;
  evidenceRef: string | null;
  data: Record<string, unknown>;
}
```

Create-only rules apply. A correction appends a correction event that points to
the earlier event.

### `scanObservations/{observationId}`

Production events and scan observations are separate collections. Scan data has
different privacy, retention, deduplication, and public-projection rules.

```ts
interface ScanObservation {
  schemaVersion: 1;
  observationId: string;
  carrierId: string;
  carrierType: CarrierResolverRecord["carrierType"];
  purpose: "discovery" | "filing" | "presentation" | "prototype" | "test";
  observedAt: Timestamp;
  recordedAt: Timestamp;
  cityKey: string | null;
  countryCode: string | null;
  locationPrecision: "city" | "country" | "unknown" | "suppressed";
  deviceHash: string;
  userId: string | null;
  eligibleForJourney: boolean;
}
```

Filing observations use `locationPrecision: "suppressed"` and store no city or
coordinates.

For online discovery, `observedAt` is a server timestamp. A client clock may be
retained as non-authoritative diagnostics but cannot order the public journey.
Official-v2 observations store normalized city and country, not IP-derived
latitude or longitude.

## Event ledger

### Event vocabulary

The first version supports:

- `release.frozen`
- `edition.created`
- `run.proposed`
- `run.reservation-started`
- `run.identities-reserved`
- `run.render-started`
- `card.artifact-rendered`
- `run.artifacts-verified`
- `run.submitted`
- `provider.accepted`
- `provider.production-started`
- `provider.partially-produced`
- `provider.produced`
- `shipment.created`
- `shipment.shipped`
- `shipment.delivered`
- `run.failed`
- `run.canceled`
- `run.closed-partial`
- `card.tombstoned`
- `recipient.assigned`
- `operator.attested`
- `carrier.flagged`

Event names describe facts that happened, not commands or desired outcomes.

### Time semantics

- `eventTime` is when the business event happened.
- `recordedAt` is when TKA received it.
- A delayed provider update keeps its original `eventTime`.
- UI ordering uses business order first, then `eventTime`, then `recordedAt`.
- Provider timestamps retain their original time zone or offset in evidence
  metadata.

### Idempotency

Every command has a stable idempotency key:

```text
reserve:{runId}
render:{runId}:{renderVersion}
submit:{runId}:{providerKey}
webhook:{providerKey}:{providerEventId}
poll:{providerKey}:{providerRunId}:{providerStateVersion}
attest:{runId}:{attestationId}
```

The event write and projection transition occur in one transaction when they
share Firestore. External calls use an outbox-style command record:

1. Commit intended command and event boundary.
2. Enqueue a task with the command ID.
3. Execute the external call.
4. Commit the external reference and resulting event.
5. A retry reads the command record and converges without another order.

A scheduled dispatcher finds committed commands that were not enqueued or
finished, then enqueues them by command ID. This closes the gap between the
Firestore commit and Cloud Tasks submission.

An ambiguous provider timeout never triggers an unqualified second paid order.
The worker polls or requires operator reconciliation.

### Projections

The following are rebuildable projections:

- current run state;
- current card state;
- produced count per CardDesign;
- provider order lookup;
- private fulfillment status;
- city stops per CardInstance;
- scan count by carrier type;
- suspected-clone signals.

A projection failure does not mutate history. A replay job rebuilds it from
events and reports any mismatch.

### Privacy and append-only history

The production ledger is append-only. Personal data is not.

- Names, addresses, email, and order contact details live in a private
  fulfillment record with its own retention policy.
- Ledger events reference a private recipient ID, not the person's data.
- A privacy deletion removes or anonymizes the private record without rewriting
  production facts.
- Device hashes use a versioned secret and are not public.
- Raw IP addresses, user agents, referrers, and precise addresses are not
  production-ledger fields.

## State machines

### Production run

```text
proposed
  -> reserving
  -> reserved
  -> rendering
  -> rendered
  -> submitted
  -> accepted
  -> in-production
  -> produced
  -> shipped
  -> delivered

in-production
  -> partially-produced
  -> produced

partially-produced
  -> closed-partial
```

Allowed terminal branches:

```text
proposed/reserving/reserved/rendering/rendered -> canceled
reserving/rendering/rendered/submitted/accepted/in-production/partially-produced -> failed
```

Rules:

- IDs are reserved before rendering because the QR needs the carrier token.
- Large reservations commit in idempotent chunks while the run is `reserving`.
  Partial chunks remain private and scan-ineligible. The run changes to
  `reserved` only after the exact instance graph passes its cardinality check.
- `reserved` IDs are permanent even if the run fails.
- A transient task error leaves the business state at its last checkpoint and
  records retry metadata. Terminal `failed` does not resume; another attempt
  creates a new run.
- `canceled` and permanently failed identities are tombstoned.
- A run becomes `produced` only from provider evidence or an explicit operator
  attestation.
- Production evidence names the exact DeckInstances covered. A partial provider
  result updates those instances and leaves the run `partially-produced`.
- Shipment and delivery events also name their DeckInstances. Run-level counts
  are aggregates, not blanket claims applied to every copy.
- `closed-partial` keeps produced instances active and tombstones every
  unproduced reservation.
- `ready`, `rendered`, `submitted`, and `accepted` do not mean produced.

### Card scan eligibility

| Card state                   | Resolver behavior                                     | Observation behavior                                     |
| ---------------------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| Reserved through accepted    | "This card has not entered circulation."              | Record a private preproduction anomaly, not a discovery. |
| Produced, shipped, delivered | Open the sequence and copy detail.                    | Eligible discovery observation.                          |
| Tombstoned                   | Explain that the identity was canceled or retired.    | Record only security telemetry.                          |
| Flagged                      | Open with neutral wording; do not accuse the scanner. | Record and feed clone analysis.                          |

Activation occurs at `produced`, not provider acceptance. If a provider offers
only shipment evidence, shipment is the first active state.

## Rendering and artifact custody

### Trusted renderer

Official artifacts must be rendered outside the user's browser.

`ICardArtifactRenderer` accepts a frozen release snapshot, DeckInstances,
CardInstances, carrier URLs, card size, and render version. It returns:

- one immutable artifact per provider-required unit;
- a redacted preview;
- pixel dimensions and color profile;
- SHA-256 for every file;
- a run manifest that maps every identity to its exact artifact;
- renderer and asset-bundle versions.

The established card-front, card-back, frame, asset-bundle, and parity code is
reused. A capability spike must prove that the production runtime matches the
canonical browser output within the existing anti-aliasing tolerance.

The preferred first runtime is a Firebase task-queue function because the
repository already deploys Firebase Functions and Firestore-backed server
work. If native rendering cannot meet memory, duration, font, or pixel-parity
requirements there, the same interface runs in a dedicated Cloud Run renderer.
The queue and data contract do not change.

### Artifact storage

- Official source artifacts live in a private R2 namespace.
- Object keys are content-addressed or include an immutable run ID.
- The browser receives only redacted previews.
- Provider handoff uses a short-lived scoped URL or direct server upload.
- The artifact manifest records SHA-256, byte length, media type, render
  version, and identity mapping.
- Object deletion is denied while a non-tombstoned run references it.

### Proof before production

The user approves a proof rendered with non-live placeholder QRs. Approval
freezes the visual settings. Live identity-bearing art is rendered only after
approval and reservation.

## Durable production jobs

Use Firebase task queue functions backed by Cloud Tasks for render, verify,
submit, poll, and projection-rebuild work.

- Tasks are at-least-once. Every handler is idempotent.
- Queue concurrency is capped by renderer memory and provider rate limits.
- Retries use bounded exponential backoff.
- Permanent validation failures stop immediately.
- A dead-letter projection lists runs requiring reconciliation.
- UI subscribes to the run projection and can be closed without canceling the
  job.
- Browser refresh, network loss, or sign-out cannot strand a paid order.

`ProductionOrchestrator` owns state transitions and enqueuing. It does not
render cards or call a provider directly.

## Printer contract

`IPrintProvider` is an adapter boundary, not a MakePlayingCards-specific data
model.

```ts
interface IPrintProvider {
  getCapabilities(): Promise<PrintProviderCapabilities>;
  submitRun(command: SubmitPrintRunCommand): Promise<ProviderSubmission>;
  reconcileRun(providerRunId: string): Promise<ProviderRunSnapshot>;
  cancelRun(providerRunId: string): Promise<ProviderCancellation>;
  verifyWebhook?(request: Request): Promise<ProviderEvent>;
}
```

Required capabilities for `provider-confirmed` production:

- distinct art for every DeckInstance and CardInstance;
- no hidden "quantity N" duplication of one static identity set;
- stable provider order or job reference;
- idempotent submission or a safe reconciliation path after timeout;
- provider acknowledgement;
- production, shipment, or equivalent evidence;
- integrity handoff through file hashes, manifest echo, or an agreed audit
  procedure;
- fulfillment support that can preserve private recipient references;
- documented cancellation behavior.

### Evidence levels

| Level                | Meaning                                                                                                         | Public count                                                 |
| -------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `provider-confirmed` | A certified adapter supplied external evidence for the run.                                                     | Included as confirmed official production.                   |
| `operator-attested`  | A trusted TKA operator used the controlled print station or a recorded manual handoff and attested the outcome. | Included, but displayed separately in admin integrity views. |
| `rendered-only`      | TKA created identity-bearing files but has no production evidence.                                              | Excluded.                                                    |
| `prototype`          | User-controlled proof output.                                                                                   | Excluded.                                                    |

### MakePlayingCards gate

MakePlayingCards is not named as a certified adapter until a business or
technical agreement answers:

1. Can every copy in one order receive a different deck-level artwork set?
2. Can each card inside each copy receive its own front?
3. Is there an API, managed file drop, or another machine-addressable intake?
4. Is submission idempotent, or can TKA query by its own request key?
5. Which acceptance, production, shipment, and cancellation events exist?
6. Can their fulfillment input carry a stable TKA recipient reference?
7. Can they return order and tracking mappings without email parsing?
8. Can TKA verify which manifest was printed?

If no machine-addressable MPC intake exists, a dedicated manual-provider
handoff may create a short-lived encrypted package for an authorized operator.
That action is recorded in the run timeline, never appears as a generic release
download, and remains `operator-attested`, not provider-confirmed.

## Operator print station

The operator channel exists for TKA-run home or studio printing without
pretending the printer is automated.

- It is available only to authorized operators.
- It consumes a reserved run through a dedicated print-station screen.
- It streams identity-bearing pages from private storage and does not expose a
  reusable general download.
- It records page dispatch, printer acknowledgement when available, operator,
  timestamp, declared quantity, spoiled sheets, reprints, and completion.
- Reprinting a spoiled sheet uses the same IDs and adds a reprint event. It
  does not allocate replacements unless the spoiled sheet is destroyed and the
  operator explicitly cancels those instances.
- Finishing the run requires a plain attestation describing what was produced.

An operating system can still duplicate a spool file. The evidence level stays
operator-attested because that residual risk is real.

## Direct purchase and fulfillment

A shop order and a production run are related but not identical.

1. The paid order creates a production intent.
2. An existing release is referenced, or a configurable recipe is generated
   and frozen through the same release transaction before production.
3. The production run reserves identities only when fulfillment begins.
4. Recipient PII remains in the order or fulfillment store.
5. The run receives a private `recipientRef`.
6. Provider shipment events update fulfillment and append ledger events.
7. A replacement shipment creates a new run and new identities.

The original recipient, purchase date, and shipping destination are useful
private facts. They are not printed into the QR, exposed in the URL, or shown
publicly without explicit consent.

## Scan protocol

### Two-phase observation

A raw resolver request is not immediately counted as a scan. Link preview bots,
security crawlers, retries, and scripted requests would otherwise become false
journey points.

1. `GET /x/{token}` validates the carrier and its state.
2. The resolver creates a short-lived signed observation challenge and routes
   to the sequence viewer.
3. The visible client completes the challenge with its stable device ID.
4. The server validates the challenge, carrier binding, expiry, and rate limit.
5. The server writes one deduplicated `ScanObservation`.

The viewer still opens when observation recording fails. Analytics never become
a gate to the sequence.

### Observation purposes

- **Discovery:** phone camera or public carrier resolver. City-level location
  may be recorded and may feed the future physical journey.
- **Filing:** in-app collection scanner. The sequence is added to the chosen
  collection. Location is suppressed and the event never feeds the journey.
- **Presentation:** a presentation carrier. It measures screen sharing, not
  card travel.
- **Prototype:** useful for proof testing, excluded from official metrics.
- **Test:** explicit admin or production test, excluded everywhere public.

### Collection behavior

There is no automatic "Scanned Cards" silo.

- Collections remain sequence collections.
- A discovered card can be added to any collection.
- A collection membership may carry relationship evidence such as `created`,
  `saved`, or `discovered`.
- The CardInstance journey and the user's collection membership are separate
  facts that can be shown together.
- Scanning a QR says "discovered," never "owned."

This preserves the useful part of the collection-scoped scanner while avoiding
a second library that users have to understand.

## Public scan history

Collection begins immediately. Public display remains disabled until the data
can tell a story.

### City-stop projection

- Repeated eligible observations of one CardInstance in one normalized city
  become one stop.
- The stop stores first seen, last seen, and observation count.
- The public card page can say "Seen 10 times in Chicago" or "Seen in 8 cities
  across 3 countries."
- It never says "10 people scanned this." A device or observation is not proof
  of a distinct human.
- It does not calculate miles traveled.
- It does not expose device hashes, user IDs, IP-derived coordinates, exact
  addresses, recipients, or order IDs.
- A public city aggregate requires at least three distinct CardInstances so
  one person's activity is not presented as a community pattern.

### Launch gate

The launch decision uses an admin coverage report:

- active official CardInstances;
- CardInstances with at least one eligible observation;
- CardInstances with two or more city stops;
- distinct public-safe cities and countries;
- observations removed as filing, presentation, prototype, test, or suspected
  automation.

The first-scan badge and public map stay feature-flagged until Austen explicitly
enables them from this report. The threshold is configuration, not copy baked
into the scanner. Before launch, the scan response only confirms that the
card opened or was saved.

## Production count and rarity

The reliable metric is **recorded official production**, not surviving copies
or ownership.

- Count only CardInstances in `produced`, `shipped`, or `delivered`.
- Show provider-confirmed and operator-attested counts separately in admin.
- Public copy can say "23 official copies recorded" when the product is ready
  for that claim.
- v1 serialized artwork slots and legacy cards show "production count
  unknown."
- Reprints that allocate new instances increase the count.
- Reprinting an existing artifact repeats IDs and is a clone event, not a new
  copy.
- A sequence appearing in several releases is not one rarity pool. Counts
  belong to the CardDesign inside a release or edition.

"Rare" is not shipped until the produced-count pipeline has complete enough
coverage to make the label meaningful.

## Abuse and integrity model

### Why anyone would abuse it

- Inflate a first-scan or travel story.
- Make a card appear popular.
- Trigger write and rendering costs.
- Enumerate private production data.
- Create unauthorized official-looking cards.
- Replay a provider event to duplicate fulfillment.
- Exploit retry ambiguity to place the same paid order twice.
- Photograph or copy a valid QR and distribute clones.

### Defenses

| Path                                  | Defense                                                                                             |
| ------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Guess carrier URLs                    | At least 96 bits of token entropy, server-only lookup, rate limits                                  |
| Pair a valid ID with another sequence | Carrier binds directly to one target; no client-supplied pairing                                    |
| Script scans                          | Two-phase challenge, device/card/place dedupe, device and IP limits, bot filtering, anomaly scoring |
| Inflate "first"                       | Do not expose first-scan status until the public release gate; never award ownership                |
| Replay provider webhook               | Provider signature verification plus provider event ID idempotency                                  |
| Retry provider submission             | Durable command record and reconciliation before another order                                      |
| Create official IDs from the browser  | Server-only reservation, renderer, ledger, and resolver collections                                 |
| Leak a reserved QR                    | Preproduction resolver state; private anomaly only                                                  |
| Reprint a valid artifact              | Cannot be prevented; detect suspicious fan-out and label the identity, never mint phantom copies    |
| Forge festival or recipient history   | Structured server-side events; no semantic URL parameters                                           |
| Delete evidence                       | Create-only ledger, PITR/backups, hash-chained exports, restricted destructive roles                |

### Suspected clones

Signals include physically implausible travel, simultaneous distant cities,
high device fan-out, and activity after tombstoning. A signal adds
`carrier.flagged` and an internal confidence score. It does not erase scans,
accuse a user, or silently rewrite history.

If TKA later needs a possession claim, a visible static QR is insufficient.
That feature requires a second factor such as a concealed one-time claim code
or cryptographic NFC. It is outside this design.

## Migration and identity eras

### Era 0: legacy content links

- Existing short code with no `pid`.
- Content remains resolvable.
- No physical provenance is invented.

### Era 1: serialized artwork slots

- Existing `cardPrintRuns` and `physicalCards`.
- `ready` means the browser rendered an artifact.
- Adapter exposes `carrierType: legacy-serialized`.
- Produced count remains unknown.
- Existing scans stay in their historical collection and can feed a private
  compatibility projection.

### Era 2: official production ledger

- New DeckInstance, CardInstance, carrier, event, and observation records.
- Official production counts begin here.
- No backfill pretends old exports were produced.

### Cutover

1. Deploy the resolver and compatibility adapter.
2. Start writing v2 digital, presentation, and prototype carriers.
3. Move current downloads under Prototype and watermark them.
4. Deploy the event ledger and run projection.
5. Certify the trusted renderer.
6. Enable operator-attested runs.
7. Enable a provider only after its capability gate passes.
8. Retire direct v1 issuance for new exports.

Legacy routes remain indefinitely because printed QRs are permanent.

## Recovery and portability

Firestore is the operational store, not the only copy of history.

- Enable Firestore point-in-time recovery and scheduled managed backups.
- Export append-only ledger segments as canonical NDJSON.
- Each export manifest records schema version, event range, event count,
  previous-manifest hash, file SHA-256 values, and artifact-manifest hashes.
- Sign export manifests with a Cloud KMS asymmetric signing key.
- Store signed exports in a locked R2 backup prefix and a Google-managed backup
  location.
- Keep the public verification key and schema documentation in the repository.
- Run a scheduled restore drill into a disposable project and compare rebuilt
  projections with production hashes.
- Export provider mappings and resolver aliases. A migration must not depend on
  a provider account or Firestore document path retaining its current shape.

The migration package is sufficient to rebuild:

- every release, edition, run, deck instance, and card instance;
- every active and tombstoned carrier;
- current run and card projections;
- public-safe scan projections;
- artifact-to-identity mappings;
- provider and order references without recipient PII.

## Security rules

- Browser writes are denied for production runs, instances, carriers, events,
  provider evidence, and produced counts.
- Authenticated creators may request commands through validated server
  endpoints. They do not select IDs or states.
- Only admins can attest production or use the operator print station.
- Provider webhooks require signature verification before parsing business
  data.
- Every command validates release hash, edition hash, quantity limits, actor,
  and allowed prior state.
- Recipient PII uses a separate access path and never enters public caches or
  resolver payloads.
- Production artifact URLs are short-lived, scoped, and logged.
- Firestore rules and server validation reject update or delete of event
  documents.

## Failure behavior

| Failure                                         | Result                                                                                                                            |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Identity reservation partially fails            | Transaction or chunk checkpoint resumes idempotently; uncommitted IDs are not returned.                                           |
| Renderer crashes                                | Run stays at the last verified checkpoint; task retries.                                                                          |
| One card hash mismatches                        | Submission is blocked; the bad artifact is rerendered.                                                                            |
| Browser closes                                  | No effect on the queued run.                                                                                                      |
| Provider times out before returning an order ID | Run enters reconciliation; no blind retry.                                                                                        |
| Provider rejects files                          | Append rejection evidence, fix through a new render version, and resubmit the same reserved identities if no production occurred. |
| Provider cancels after acceptance               | Tombstone all unproduced instances; never reuse them.                                                                             |
| Webhook arrives twice or out of order           | Idempotency and transition validation converge on one state.                                                                      |
| Operator reports spoiled output                 | Append spoilage and reprint events; do not silently change quantity.                                                              |
| Resolver store is unavailable                   | Fail closed on provenance while preserving a retryable sequence fallback for legacy content links.                                |
| Scan recording fails                            | Sequence still opens; UI can state that history was not recorded.                                                                 |

## Testing strategy

Tests target silent corruption and irreversible state, not visible component
rendering.

### Required unit and property tests

- ID and token format properties, forced random-source collision retries, and a
  high-volume uniqueness smoke test.
- Create-only allocation and no-reuse after cancel.
- Every allowed and forbidden state transition.
- Event envelope validation and event/projection transaction behavior.
- Idempotent task retry at every checkpoint.
- Provider submission timeout reconciliation.
- Duplicate and out-of-order webhook delivery.
- Artifact manifest round trip and SHA-256 verification.
- Deck quantity multiplied by card count produces exactly the intended instance
  graph.
- A multi-copy run never maps two DeckInstances to the same carrier set.
- Carrier target binding cannot be swapped.
- Filing, presentation, prototype, and test observations never enter journey
  projections.
- City-stop collapse and public privacy threshold.
- Legacy `tka.run/{code}` and `?pid=` compatibility.
- Ledger export, signature verification, import, and projection rebuild.

### Required integration tests

- Freeze release, reserve run, render artifacts, verify manifest, and activate
  after simulated production evidence.
- Emulator-backed task retry with a forced crash after the external call but
  before projection update.
- Certified provider contract suite against its sandbox or recorded fixtures.
- Operator print-station run with spoilage and reprint evidence.
- Restore drill from signed ledger export into an empty project.

### Required visual and physical verification

- Existing card-front and card-back pixel parity suite passes for every
  supported card size, theme, prop pair, and representative sequence shape.
- Redacted previews reveal no scannable live token.
- Prototype watermark remains legible after home printing.
- Real sample run: scan every card, assert the right release/card slot, then
  scan selected cards from two cities and verify stop collapse.

## Reuse and creation verdict

Internal searches covered `wizard`, `stepper`, `checkout`, `append-only`,
`idempotency`, `webhook`, `provider`, `adapter`, `fulfillment`, `festival`,
`eventId`, `R2`, `manifest`, `checksum`, `worker pool`, `OffscreenCanvas`, and
`BackJob`.

| Unit                                | Verdict                           | Evidence and boundary                                                                                                                                                                      |
| ----------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Release funnel                      | **Extend**                        | `DeckReleaserTab.svelte`, `deck-releaser-state.svelte.ts`, and `deck-release-store.ts` already own compose, review, freeze, history, and output.                                           |
| Prototype export                    | **Extend**                        | `PrintPanel`, PDF exporter, ZIP exporter, and serialized front renderer exist. Change semantics, watermark, and carrier type.                                                              |
| Official production setup/status UI | **Create inside Deck Releaser**   | No production-run or fulfillment UI exists. Reuse established panel, modal, progress, and history visual patterns.                                                                         |
| Production event ledger             | **Create**                        | Scan events and arrow adjustment history demonstrate append-only patterns, but neither models multi-aggregate production lifecycle.                                                        |
| `ProductionOrchestrator`            | **Create**                        | No durable production coordinator exists. It owns commands and transitions only.                                                                                                           |
| `ICardArtifactRenderer`             | **Extract and extend**            | Worker rendering, card assembly, asset bundles, back jobs, and parity harnesses exist. The trusted runtime seam does not.                                                                  |
| Task queue                          | **Adopt managed capability**      | No repository production queue exists. Firebase task queue functions fit the deployed Firebase Functions stack and supply retry/rate controls.                                             |
| `IPrintProvider`                    | **Create**                        | Provider/adapter naming patterns exist, but no print-provider contract or certified integration exists.                                                                                    |
| Artifact storage                    | **Extend**                        | R2 presigning, multipart upload, and server credentials exist. Add a private production namespace, retention, and manifests.                                                               |
| Carrier resolver                    | **Extend and replace for v2**     | ShortCodeManager and `/q/[code]` resolve content. Add opaque carrier lookup and keep legacy adapters.                                                                                      |
| Scan ingestion                      | **Extend**                        | Current server validation, Cloudflare city metadata, device hashing, rate limits, and dedupe remain useful. Add carrier binding, challenge, purpose, and eligibility.                      |
| Screen QR                           | **Extend**                        | `ChoreoCard` and `QRMandalaOverlay` already own screen QR generation. Change them to durable digital or presentation carriers.                                                             |
| Collections                         | **Extend existing model**         | Existing collections stay sequence-based. Add relationship evidence; do not create a scanned-card silo.                                                                                    |
| Festival provenance                 | **Reuse**                         | `festivals/{festivalId}`, `festival-repository.ts`, and `festival-schemas.ts` already provide structured name, date, and location facts. Store the ID plus an immutable run-time snapshot. |
| Backup and restore                  | **Create around managed storage** | R2 and Firestore exist, but no signed portable production-ledger export or restore drill exists.                                                                                           |

### External dependency verdict

| Need                      | Candidates reviewed                                               | Decision                                                                                                                                                 |
| ------------------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Durable background work   | Firebase task queue functions and a dedicated Cloud Run renderer  | Adopt Firebase task queues for orchestration. Use Cloud Run only if the renderer parity spike proves a task function cannot host the canonical renderer. |
| Event semantics           | GS1 EPCIS event model                                             | Reuse the what, when, where, and why discipline. Do not add an EPCIS server or claim conformance.                                                        |
| Resolver semantics        | GS1 Digital Link and GS1-Conformant Resolver                      | Reuse the class, instance, and resolver separation. Keep TKA's short opaque token and legacy routes.                                                     |
| Operational event store   | Firestore transactions plus managed task delivery                 | Extend the existing database. A separate event-store product would add another authority without solving provider evidence.                              |
| Artifact storage          | Existing R2 S3-compatible stack                                   | Extend it with a private locked production namespace and manifests.                                                                                      |
| Portable manifest signing | Cloud KMS asymmetric signing                                      | Adopt managed signing. Do not keep a long-lived signing private key in app configuration.                                                                |
| Printer integration       | MakePlayingCards public workflow and a provider-neutral adapter   | Keep the adapter neutral. Certify MPC only after non-public capabilities are confirmed.                                                                  |
| Ownership proof           | Static QR, concealed claim code, cryptographic NFC, public ledger | Keep static QR as discovery only. Do not add ownership, blockchain, or NFC to this scope.                                                                |

## Implementation order

### Phase 0: capability gates

1. Run the trusted-renderer portability and pixel-parity spike.
2. Obtain answers to the printer capability questionnaire.
3. Choose the first production channel: certified provider or operator print
   station.
4. Enable Firestore PITR and define backup ownership before v2 events exist.

No official-v2 identity may be activated until the renderer and at least one
production channel pass.

### Phase 1: identity and ledger

1. Add shared domain contracts and validators.
2. Add server-only carrier allocation and resolver.
3. Add artifact events, idempotent command records, and projections.
4. Add legacy resolver adapters.
5. Add signed ledger export and restore verification.

### Phase 2: funnel cutover

1. Freeze releases with hashes.
2. Move current downloads into Prototype.
3. Add watermark and prototype carrier.
4. Add Official Production setup and status.
5. Remove live physical QRs from browser previews.

### Phase 3: trusted production

1. Add task queues.
2. Deploy the trusted renderer.
3. Add private artifact manifests in R2.
4. Add the operator print station or first certified provider.
5. Activate cards only from production evidence.

### Phase 4: carriers and collections

1. Convert normal viewer QRs to digital carriers.
2. Add Present mode and presentation carriers.
3. Upgrade scan ingestion to the challenge protocol.
4. Add filing-purpose observations and collection relationship evidence.

### Phase 5: public projections

1. Build city-stop and coverage projections.
2. Add clone signals.
3. Review the live dataset.
4. Enable public history and official-count copy only when the coverage report
   supports it.

## Acceptance criteria

The design is implemented only when all of the following are true:

1. A released deck cannot enter Official Production without a frozen manifest
   hash.
2. One run of `N` deck copies creates exactly `N` DeckInstances and
   `N * cardCount` CardInstances.
3. No two CardInstances share a carrier token.
4. Retrying any command does not create another run, provider order, identity,
   artifact event, or scan observation.
5. A canceled identity never appears in another run.
6. A browser never receives a full-resolution official artifact with a live
   physical token.
7. Downloaded proofs are visibly prototypes and do not affect official counts.
8. A physical card does not become scan-active until production evidence
   exists.
9. Screen and presentation scans cannot enter a physical journey.
10. Collection filing records the relationship without location or journey
    inflation.
11. Legacy QR links still resolve.
12. Public pages never claim ownership, unique paper, or unverified production.
13. A signed ledger export can rebuild all production projections in an empty
    project.
14. The provider contract suite or operator print-station verification proves
    the first production channel end to end.

## External references

- [GS1 Digital Link standards](https://ref.gs1.org/standards/digital-link/)
  and the [GS1-Conformant Resolver Standard 1.2.0](https://ref.gs1.org/standards/resolver/1.2.0/)
  inform the split between class, lot, serialized instance, and resolver.
- [GS1 EPCIS and CBV implementation guidance](https://www.gs1.org/standards/epcis-and-cbv-implementation-guideline/current-standardd)
  informs the event model: what happened, when, where, and why.
- [Firebase task queue functions](https://firebase.google.com/docs/functions/task-functions)
  provide managed asynchronous work, retries, and rate controls.
- [Firebase retry guidance](https://firebase.google.com/docs/functions/retries)
  requires idempotent handlers for at-least-once delivery.
- [Firestore disaster recovery](https://firebase.google.com/docs/firestore/disaster-recovery)
  documents PITR, backups, exports, and clones.
- [Cloudflare R2 durability](https://developers.cloudflare.com/r2/reference/durability/)
  describes R2 durability and the limits of durability against deletion.
- [Cloud KMS asymmetric signing](https://docs.cloud.google.com/kms/docs/create-key)
  supports signed portable ledger manifests.
- [MakePlayingCards fulfillment](https://www.makeplayingcards.com/mpc-fulfillment-services.aspx),
  [order FAQ](https://www.makeplayingcards.com/faq-order.aspx), and
  [custom card specifications](https://www.makeplayingcards.com/design/custom-large-card-index.html)
  establish the documented manual fulfillment and per-card art capabilities.
  They do not establish the unpublicized integration capabilities required for
  certification.

## Out of scope

- Proving that a visible static QR is in one person's possession.
- Blockchain, NFTs, or public ownership transfer.
- Exact GPS trails or mileage.
- Public recipient identity.
- Automatic rarity labels before production coverage is trustworthy.
- Deleting or rewriting legacy scan history to make it look like v2.
- A provider-specific implementation before its capability gate passes.
