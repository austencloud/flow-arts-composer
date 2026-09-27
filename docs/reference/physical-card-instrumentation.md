# Physical card instrumentation v1

**Effective:** 2026-07-27

**Feedback:** `Fd5LhGdHTWEor2GV7HSI`

> **Implemented precursor:** This document remains the contract for the v1
> instrumentation currently in code. The official production end state is
> specified in
> [`../superpowers/specs/2026-07-27-official-card-production-ledger-design.md`](../superpowers/specs/2026-07-27-official-card-production-ledger-design.md).
> Under that design, v1 records remain `legacy-serialized` artwork facts.
> Downloadable front-bearing exports become prototypes rather than evidence of
> official production.

This version records private facts before adding a collector interface or public
map. New print exports can identify one artwork slot. Old cards still scan as
legacy cards. Public counters, first-scan messages, completion totals, rarity,
and collection screens are not part of this version.

## What an ID means

`physicalCardId` identifies one distinct card-front artwork slot emitted by the
application. It does not prove that one piece of paper exists.

- A PDF with nine copies of a card gets nine IDs.
- A ZIP gets one ID for each front image.
- Preparing a front or combined PDF for a new deck/settings key creates a new
  print run. Printing or downloading that prepared artifact again reuses the
  run. ZIP exports still create a fresh run each time.
- A back-only PDF creates no IDs.
- Printing the same downloaded file more than once repeats its IDs. Those paper
  copies cannot be distinguished.
- Ordering several decks from one uploaded ZIP repeats the IDs in that ZIP.
  Direct fulfillment must mint a new artwork set for each distinguishable
  quantity.

The count of `ready` runs is therefore **serialized identities rendered**, not
cards printed, sold, shipped, or held.

## Firestore records

`cardPrintRuns/{printRunId}` stores the export fact:

- schema and issuance era
- allocating user
- created, allocated, and completed timestamps
- deck ID, deck name, and released deck number when one exists
- deck provenance: a server-verified release reference or an authenticated
  export claim
- output kind, card size, requested copies, source card count, and ID count
- status: `allocating`, `allocated`, `ready`, or `failed`
- empty `originEventId`, `orderId`, and `recipientUserId` fields for later
  enrichment

The server allocates IDs before rendering so each QR can include its ID. The
browser marks the run `ready` only after the complete PDF or ZIP Blob exists.
A render error marks it `failed`. A closed tab or broken connection can leave
a run `allocated`; that run is not scan-valid and must not contribute to future
production counts. `ready` proves that the application rendered the artwork,
not that a download, print, shipment, or purchase happened.

`physicalCards/{physicalCardId}` stores the card artwork fact:

- print run, allocating user, and allocation time
- short code and sequence provenance
- deck provenance
- print position, card index, and copy index
- export kind and output mode
- left and right prop types printed on the card, or null when unset
- scan count and last scan time
- the same empty event, order, and recipient fields

Both collections are browser-write-closed and admin-readable. Server credentials
write them through Firestore REST because the production worker cannot use the
Firestore Admin gRPC client. The one public read is the prop pair described
under [Printed URL and props](#printed-url-and-props).

When an export claims a released deck number, the server verifies that its
manifest exists and that the release number and card count agree, then replaces
the submitted deck ID and name with the manifest's canonical values. The
individual short codes remain authoritative for each card's sequence facts.
This establishes a verified release reference, not proof that every submitted
card exactly matches the historical manifest. Generated and unreleased decks
retain their authenticated export claim without being mislabeled as a release.

Production requires the encrypted `FIREBASE_SERVICE_ACCOUNT_JSON` Pages secret.
Local development falls back to the gitignored root
`serviceAccountKey.json`. The worker never sends either credential to the
browser.

## Printed URL and props

A serialized QR encodes only `HTTPS://TKA.RUN/{code}?pid={physicalCardId}`, at
most 39 bytes. Props are not in the URL, so the QR's symbol version no longer
depends on them and the same QR cell prints larger modules.

A short code is shared by every card with the same choreography and keeps the
props it was minted with, so the shortcode record cannot say which props one
card shows. The issue endpoint stores each card's `leftPropType` and
`rightPropType` on its `physicalCards` record instead.

At scan time props resolve strongest first: `bp`/`rp` in the scanned URL, then
the card record, then the shortcode record, then the sequence. Cards printed
before this change carry `bp`/`rp` and keep scanning as before.

- `/q/{code}` reads the card record on the server, within the page's lookup
  timeout, and passes the props to the viewer.
- The installed app opens the gallery viewer from the deep link and requests
  `GET /api/physical-cards/props?code={code}&pid={physicalCardId}` from the
  site. It returns the prop pair only when the card belongs to that code, and
  nothing else from the record.

A failed or slow lookup falls back to the shortcode's props.

## Scan facts

The scan route sends only the short code, optional physical ID, and the
browser's stable device ID to `/api/physical-cards/scan`.

The server:

1. validates the request shape;
2. rate-limits the stable device key, with a higher IP ceiling as a second
   brake;
3. verifies the short code;
4. verifies that a supplied physical ID belongs to that code and to a completed
   print run;
5. derives city-level location from Cloudflare;
6. hashes the device ID before storage;
7. writes the private scan event and counters in one commit.

The event remains under
`shortcodes/{code}/scanEvents/{eventId}` so existing admin activity queries keep
working. Browser creation is denied. Historical `journeyPoints` data is retained
but no longer public or browser-writable.

One device, physical card, calendar day, and coarse place resolves to one event
ID. A retry or repeated scan at the same stop does not inflate the count. A move
to another city on the same day remains a separate location fact.

The browser uses a keepalive request so navigation does not cancel an in-flight
scan. A scan made with no connection is not replayed later as a city fact:
replay would attach the reconnect location rather than the scan location. A
future offline outbox must store delayed scans as location-unknown facts instead
of inventing a stop.

## Legacy cards

A scan without `pid` is recorded with `scanKind: "legacy"`. It still validates
the short code, receives server-derived location, and participates in the same
deduplication and rate limits. It has no print run, copy index, recipient,
purchase, or event claim.

There is no migration that invents physical provenance for old cards.

## Public release gate

No scan history is exposed by this version. A later release can derive a
PII-free city-stop projection from private events when enough cards have useful
history. The release threshold must be based on real dataset coverage, not a
hard-coded first-scan message.

The future projection should collapse repeated scans in one city into a single
stop with a scan count. It should describe places seen, not miles traveled, and
must not expose device hashes, user IDs, user agents, referrers, or precise
addresses. Raw user agents and referrers are not stored by this version.
