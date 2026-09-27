# Firestore and GCP Cost Anatomy

Measured 2026-09-03, against the August 2026 invoice for
`the-kinetic-alphabet`.

This document exists so nobody re-derives this investigation, and so nobody
re-proposes a lever that was already measured and killed. The enforced
behavioral rules live in `.claude/rules/firestore-cost-discipline.md`.

## Two traps that hid this for five months

**1. Firestore bills under the "App Engine" service.** Grouping the billing
report by service hides Firestore entirely — its rows land under a product this
project does not use. **Always group by SKU.** This is the single reason the
cost went unattributed for months.

**2. Firestore egress has no Cloud Monitoring metric.** There is no counter for
bytes leaving the database. `firestore.googleapis.com/document/read_count`
counts documents and never bytes. Egress is only visible on the invoice, after
the fact.

A third factor was social rather than technical: a budget alert already existed
at **$5.00/month**. Spending $63 against it meant the 50/90/100% thresholds all
fired within days of each month starting, every month. The alerts became noise
and were ignored. A budget set far below actual spend is worse than no budget.
It is now $25 with 50/90/100% on actual plus 100% on forecasted.

## The August invoice, by SKU

| SKU | Cost | Quantity |
|---|---:|---|
| GCS Standard Storage | $20.12 | |
| Firestore Read Ops | $16.85 | 29,773,216 reads |
| Firestore Internet Data Transfer Out | $15.29 | 137.41 GiB (+171% MoM) |
| Zonal Backup Storage | $5.82 | 193.98 GiB-month |
| PITR | $1.51 | 8.38 GiB-month |
| Firestore Storage | $1.33 | 8.41 GiB-month |
| Secret Manager | $1.30 | 27.69 version-months |
| Cloud Scheduler | $0.66 | 297 |
| GCS Class A/B ops | $0.53 | |
| **Total** | **$63.41** | rows 11–37 are $0.00 |

## Attribution, cheaply

Cloud Monitoring `firestore.googleapis.com/api/request_count` breaks calls down
by **`api_method`** — note the label key is `api_method`, not `method`; the
wrong key silently returns nothing. RunQuery / BatchGetDocuments / Commit /
RunAggregationQuery is usually enough to separate "an app reading documents"
from "a script scanning a collection."

That is what produced the decisive number: 5,644 RunQuery calls over 7 days
carrying ~5.5M reads, or ~960 documents per query — which matched the 995-document
`feedback` collection exactly.

Egress fingerprints the *caller*, not the query. It bills only for data leaving
Google, so Cloud Functions reading the same documents cost nothing in transfer.
137.41 GiB across 29.8M reads is ~4.8 KB per document, which matched feedback
document size and confirmed local scripts as the source.

## What each fix removed

| Fix | Commit | Removed |
|---|---|---|
| Filter archived docs out of the three `scripts/fetch-feedback.js` scans | `b38add8306` | reads **and** egress, ~$32 |
| 30-day lifecycle on the export bucket, purge soft-deleted objects | `1e5419ef85` | most of GCS storage |
| Weekly backup retention 14w → 4w; destroy 13 superseded secret versions | — | backups, Secret Manager |
| Exempt payload blobs from automatic indexing | `d34e69075d` | storage, backups, and PITR together |

The feedback collection was 995 documents: 12 new, 0 in-progress, 12 in-review,
0 completed, **971 archived**. Those sum to exactly 995, which proved no
document lacked a `status` field and that an `in` filter dropped nothing. Each
agent invocation went from 995 reads to 24.

## Phase-in, not instant

Two of the fixes take time, so an invoice checked too early will look wrong:

- **Backups** reach steady state over ~14 weeks. A managed backup schedule's
  retention applies to *future* backups only; existing snapshots keep their
  original expiry. The count drifts from 21 down to 11 (7 daily + 4 weekly).
- **Index storage** reclaims as a background operation over hours. Firestore
  exposes no per-field index-size metric, so the reclaimed amount cannot be
  predicted — only measured afterward, in the Firestore Usage tab or the next
  invoice.

## Unbounded scans that still exist

These were found during the same audit and deliberately left alone: each scans
its whole collection, but each is run by hand and rarely, so none is on a hot
path. Bound them if any ever moves into agent tooling, a scheduled job, or a
request handler.

- `scripts/audit-static-rotation.js`
- `scripts/check-loop-types.cjs`
- `scripts/export-gallery-bundle.cjs`
- `scripts/diagnostics/browse-program-census.ts`

Frequency is the whole risk. The scan that dominated the bill was not the
largest one; it was the one that ran on the idle path, thousands of times a
week, across 10-15 concurrent sessions.

## Levers already measured and ruled out

- **`nam5` → regional migration.** Multi-region costs roughly 2x regional. A
  database's location is fixed at creation, so capturing this means a full
  migration, for well under $1/month at current size. Not worth the risk.
- **`.select()` projections.** Reduce bytes, not read count. Firestore bills per
  document returned. This does not address a scan.
- **PITR.** $1.51/month, and it is the only cover between daily snapshots.
  Deliberately kept.
- **The 7-day daily backup schedule.** Deliberately kept.
- **The 16 remaining secret versions.** Each is referenced in
  `firebase-functions/src` or by the Stripe extension. Nothing pins a numbered
  version — every function declares `secrets: [param]`, which resolves to
  `latest` — so the 13 superseded versions were safe to destroy and these are
  not.

## Where the floor is

After all of the above, the remaining spend is roughly $5/month and mostly
irreducible: Cloud Scheduler $0.66, Secret Manager ~$0.96, GCS ops $0.53, and
~59 GiB of backup archive at ~$1.53. There is no large lever left.

## Related

- `.claude/rules/firestore-cost-discipline.md` — the enforced rules
- `docs/architecture/scene-boot-cost.md` — same shape, for 3D boot performance
