# Server Input Validation and Resource Bounds — Read-Only Audit

**Date:** 2026-09-13
**Base SHA:** `6e4c1b5a388625d9c95f92e9a717f8ca2ab77f20` (`origin/main` at start; branch was level with it)
**Branch:** `claude/server-input-validation-audit-su9h2z`
**Audit commit:** `0fdf4356` — the tests and the first draft of this report.
**Revision:** this document was corrected after review; see _Review corrections_ below for
what changed and why.
**Scope:** non-payment server request validation and resource bounds
**Nature:** read-only. No production code was changed. Everything added is test and report material.

---

## Owned files

Only these paths were created; nothing else in the repository was modified.

```
docs/reports/opus-batch-2026-09-12/server-input-validation-audit.md
tests/opus-server-input-audit/vitest.config.ts
tests/opus-server-input-audit/helpers/app-environment-stub.ts
tests/opus-server-input-audit/helpers/env-dynamic-stub.ts
tests/opus-server-input-audit/helpers/env-static-public-stub.ts
tests/opus-server-input-audit/helpers/fake-request-event.ts
tests/opus-server-input-audit/rate-limit-key-scope.test.ts
tests/opus-server-input-audit/qr-video-upload-bounds.test.ts
tests/opus-server-input-audit/r2-presign-size-bound.test.ts
tests/opus-server-input-audit/dev-write-path-composition.test.ts
tests/opus-server-input-audit/rejected-input-and-error-disclosure.test.ts
tests/opus-server-input-audit/production-reachability.test.ts
```

The suite carries its own vitest config so that no shared config file had to change.
`tests/config/vitest.config.ts` includes only `tests/unit/**`, `tests/integration/**`,
`tests/migration/**` and `src/**`, so these files are not collected by any existing
project run and cannot affect another agent's gate.

## Excluded by brief

Firebase authorization and `firestore.rules`; share-link routes (`/q/[code]`,
`/sequence/[id]`, shortcode redirect worker); authentication
(`src/lib/server/auth/**`, `firebase-functions/src/auth/**`); payment and shop
(`firebase-functions/src/merch/**`, `donation/**`, `/shop`); and TIKA external model
execution (`/api/tika/**`). Where a finding sits on one of those boundaries it is
labelled below.

## Evidence discipline

- **Measured** — a test in this suite drives the shipped code and observes the result.
- **Code-read** — established by reading the shipped source; no runtime observation.
- **Inferred** — a step in the chain depends on external system behaviour that could
  only be settled by a production probe, which the brief forbids. Stated as inference.

No production endpoint was contacted, no credential was read, and no live data was
written. Every test runs offline against mocks.

---

## Findings

### S1 — Presigned R2 upload URLs bind neither size nor content type

**Severity:** security exposure. **Evidence:** measured (what the signature binds);
the platform's own ceiling and the serving behaviour are **not established**.
**Files:** `firebase-functions/src/r2/index.ts:101-110,143-187,193-231`,
`firebase-functions/src/r2/r2-client.ts:80-93`

`r2PresignUrl` validates a **client-supplied** `contentLength` against
`MAX_VIDEO_FILE_SIZE` (500 MB) / `MAX_THUMBNAIL_FILE_SIZE` (10 MB), and a
**client-supplied** `contentType` against `ALLOWED_TYPES`. It then signs a
`PutObjectCommand` and returns the URL.

The generated URL, dumped from the shipped `getPresignedPutUrl` with fixed test
credentials:

```
PATH: /bucket/users/u/videos/s/clip.mp4
  X-Amz-Algorithm      = AWS4-HMAC-SHA256
  X-Amz-Content-Sha256 = UNSIGNED-PAYLOAD
  X-Amz-Credential     = AKIAAUDITKEY/20260913/auto/s3/aws4_request
  X-Amz-Date           = 20260913T012002Z
  X-Amz-Expires        = 900
  X-Amz-Signature      = 50eddaf6…
  X-Amz-SignedHeaders  = host
  x-id                 = PutObject
```

`X-Amz-SignedHeaders` is **`host` alone**. Content-Length is not signed, Content-Type is
not signed, and the presigner does not hoist Content-Type into a signed query parameter
either (measured in `r2-presign-size-bound.test.ts`). The payload hash is
`UNSIGNED-PAYLOAD`.

Consequences, for the holder of one presigned URL during its 15-minute window:

1. **The application's size ceiling is unenforced.** Declare `contentLength: 1`, then
   PUT a body of any size the _platform_ still permits: the 500 MB constant constrains
   nothing that reaches R2, so the only remaining limit is whatever R2 and Cloudflare
   enforce natively — a documented provider limit this audit did not look up, and
   certainly does not claim is absent. The finding is "the app's own ceiling does not
   apply", not "bytes are unlimited".
   `r2MultipartStart` does not call `assertFileSize` at all, so the multipart path has
   no declared ceiling to begin with.
2. **The MIME allowlist is advisory.** Declare `video/mp4`, then PUT with
   `Content-Type: text/html`. `buildKey`'s sanitiser (`[^a-zA-Z0-9_\-\.]` stripped) keeps
   dots, so the caller also chooses the object key's extension — `payload.html` passes
   (measured).
3. The callable returns `publicUrl = ${R2_PUBLIC_URL}/${key}`, and the CSP in
   `src/hooks.server.ts:130-132` lists `assets.tkaflowarts.com` and
   `pub-f5505ed75927471cb198c54336317370.r2.dev`, so these objects are publicly
   readable.

**What is measured:** that the signature binds only `host`, so neither application-level
check survives into the upload. **What is not established:** (a) what R2 and Cloudflare
themselves cap an unsigned-payload PUT at — that is a documented and configured provider
limit, to be read from R2's documentation and the bucket/account settings, not something
an upload attempt could establish; and (b) whether R2's public domain then serves the
stored `text/html` with that Content-Type, which is what would turn this from a
storage-cost problem into arbitrary content hosting on a project domain. Neither was
checked here.

**Reachability:** `requireAuth` (`r2/index.ts:113-118`) only checks that `request.auth`
exists. Firebase populates `auth` for anonymous sign-ins, and the repository maintains
anonymous accounts (`firebase-functions/src/cleanupStaleAnonymousAccounts.ts`), so this
is inferred to be reachable by any visitor, not only registered users. There is no rate
limit on the presign callables.

**Fix direction:** pass `ContentLength` to `PutObjectCommand` so SigV4 signs it, and sign
`ContentType` rather than only checking it — or move uploads behind a server-side proxy
that counts bytes. `r2MultipartStart` needs a declared and signed per-part bound too.

---

### S2 — Rate-limit buckets are keyed by the concrete URL path, so parameterised routes have no effective ceiling

**Severity:** security exposure (abuse control bypass). **Evidence:** measured.
**File:** `src/lib/server/security/withRateLimit.ts:57-61`

```ts
const prefix = event.url.pathname;
const identifier =
  keyType === "ip"
    ? `${prefix}:ip:${event.getClientAddress()}`
    : `${prefix}:${keyType}:${keyValue ?? "missing"}`;
```

`event.url.pathname` is the **concrete** request path, not `event.route.id`. On any route
whose path carries a caller-supplied parameter, every parameter value produces a
different identifier and therefore a different bucket.

Measured in `rate-limit-key-scope.test.ts`:

| Scenario                                                         | Preset          | Result                    |
| ---------------------------------------------------------------- | --------------- | ------------------------- |
| 105 requests, fixed path `/api/qr-video/<hash>`                  | GENERAL 100/min | blocked at request 100 ✅ |
| 500 requests, one IP, varying `/api/qr-video/<hash>`             | GENERAL 100/min | **0 blocked**             |
| 90 requests, one admin uid, varying `/api/admin/user-auth/<uid>` | ADMIN 30/min    | **0 blocked**             |
| 105 requests, fixed path `/api/thumbnail`                        | GENERAL 100/min | blocked at request 100 ✅ |

This is not limited to the in-memory fallback. `withRateLimit` passes the same
`identifier` to Cloudflare's native binding as `limit({ key: identifier })`, so the
production backend receives the same split keys.

Affected in-scope routes: `/api/qr-video/[hash]` (GENERAL, by IP) and
`/api/admin/user-auth/[uid]` (ADMIN, by caller uid — one admin gets a fresh 30/min quota
per _target_ user they enumerate). Fixed-path routes are unaffected, which is why the
defect has stayed invisible.

A secondary effect: the in-memory `rateLimitStore` keeps one `Map` entry per distinct
identifier, and `cleanupExpiredEntries` only runs every 5 minutes and only on a
`checkRateLimit` call. 5,000 distinct paths yield 5,000 retained entries (measured). The
60-second GENERAL window bounds this to roughly five minutes of traffic, so it is a
memory-growth nuisance rather than an exhaustion vector on its own.

**Fix direction:** key on `event.route?.id ?? event.url.pathname`. That is a one-line
change in shared security code, so it belongs to whoever owns that file — this audit is
read-only and did not make it.

---

### S3 — `/api/qr-video/[hash]` accepts unauthenticated writes to production R2

**Severity:** security exposure. **Evidence:** measured.
**File:** `src/routes/api/qr-video/[hash]/+server.ts`

Driving the shipped `PUT` handler against an in-memory R2 double
(`qr-video-upload-bounds.test.ts`):

- A request with **no Authorization header, no session cookie and no `Origin` header**
  returns `204` and writes `qr-videos/<hash>.mp4`. The origin guard is
  `if (origin && origin !== event.url.origin)` — omitting the header, which any non-browser
  client does, skips it entirely. A cross-origin _browser_ request is correctly refused
  with 403.
- 400 consecutive uploads from one IP inside one window all returned 204, with 400
  distinct keys written, against a 100/min preset. This is S2 realised on a concrete
  route: `withRateLimit` runs at line 26, _before_ the hash is validated at line 36, and
  its bucket already includes the hash.

Net effect: an unauthenticated caller can write up to 20 MB per object to production R2
across 2^256 distinct keys with no effective ceiling.

The handler's own payload checks are sound and were confirmed: a non-MP4 body → 400, a
hash that is not 64 lowercase hex → 400, an oversized declared `content-length` → 413
before the body is read, and a post-read byte-length re-check.

**Fix direction:** only one control can close this, and it is not the `Origin` check.

- **Authenticated authorization is required.** Removing unauthenticated arbitrary-client
  writes means the handler must establish _who_ the caller is — a verified Firebase token
  or equivalent — and reject the request when it cannot. This works with or without any
  change to S2. Whether QR-video publishing should require a signed-in user at all is a
  product decision; what is not open is that nothing weaker removes the exposure.
- **The `Origin` header is not caller authentication and must not be treated as a
  substitute.** `Origin` is set by the browser for the browser's own protection: it can
  restrict _cross-origin browser_ requests, and the existing check does correctly refuse
  one (measured: 403 for `https://evil.example`). It says nothing about an arbitrary HTTP
  client, which can omit it or forge any value it likes. This audit's own evidence shows
  the weaker half: omitting the header entirely skips the check and the write lands with
  a 204. Tightening the guard to _require_ a matching `Origin` would raise the bar for
  casual browser-based abuse and nothing more — a forged header from curl still passes.
- **The route-id keying from S2** restores a real ceiling for whoever _is_ allowed to
  write. It bounds abuse; it does not decide who may write.

Auth and the S2 keying are separable and can be done in either order. Fixing S2 alone
still leaves unauthenticated writes, merely rate limited; fixing auth alone still leaves
an ineffective ceiling for authenticated callers.

---

### R1 — `/api/test-render` is ungated, unauthenticated, permanently broken, and echoes an internal message

**Severity:** ordinary robustness (dead surface) with minor information disclosure.
**Evidence:** measured.
**File:** `src/routes/api/test-render/+server.ts`

The handler has no `dev` guard and no auth check. Its first statement after the rate
limit is `getSequenceRenderer()`, which is
`if (!browser) throw new Error('getSequenceRenderer() is browser-only')`
(`src/lib/shared/render/get-sequence-renderer.ts:9`). `browser` is false on every server
request, so the route throws on every call and returns

```
500 {"error":"getSequenceRenderer() is browser-only"}
```

Measured in `rejected-input-and-error-disclosure.test.ts`. Because the handler catches its
own error, `hooks.server.ts`'s `handleError` scrubber — which correctly returns the
generic message in production — never sees it.

Three things this is **not**. The unbounded `stepSize` on line 30 is _not_ an allocation
vulnerability, because it is read after the throw and never reaches the renderer (measured:
`stepSize: 1e9` produces the identical 500). The disclosure is a function name, not a
secret. And the wasted rate-limit slots are _not_ a shared-quota problem: each request does
consume an `AI_RENDER` slot before failing (measured: 20 × 500, then 429), but S2 above
establishes that buckets are keyed by pathname, so `/api/test-render` exhausts only
`/api/test-render`'s own bucket. It shares the `AI_RENDER` _preset_ with
`/api/render-pictograph` and `/api/tika/pictograph`, not a quota — those routes have
distinct fixed pathnames and therefore distinct buckets. An earlier draft of this report
claimed otherwise, which contradicted its own S2 finding.

So the cost is bounded and small: a dead public route that answers 500 twenty times a
minute per IP and then 429s. Worth removing for tidiness and to stop advertising an
internal symbol, not for capacity.

Note also that `/api/test-render` has a **fixed** path, so S2's bypass does not apply to
it — its own ceiling is correctly enforced, which is what the 429 at request 21 shows.

**Fix direction:** delete the route, or gate it to `dev` like its siblings.

---

### R2 — `/api/dev/save-pictograph` composes filesystem paths from unvalidated request fields

**Severity:** ordinary robustness. Dev-only; **not** a production exposure.
**Evidence:** measured.
**File:** `src/routes/api/dev/save-pictograph/+server.ts:44-59`

`gridMode` is typed `"diamond" | "box"` but never checked at runtime, and `propType` is
never sanitised; both are interpolated straight into `path.join`. Only `letter` gets the
`[<>:"/\\|?*]` scrub. Measured with `fs` mocked:

| Request                                             | Composed target                                                      |
| --------------------------------------------------- | -------------------------------------------------------------------- |
| `gridMode: "diamond"`                               | `…/static/pictographs/diamond/A/1.png` (inside the tree)             |
| `gridMode: "../../../../tmp/audit-escape"`          | resolves to `/tmp/audit-escape/A` — **outside the repo**             |
| `propType: "../../../../../tmp/audit-escape/owned"` | `…/static/tmp/audit-escape/owned.png` — outside `static/pictographs` |

`Buffer.from(base64, "base64")` also runs with no length bound (4 MiB of base64 → a 3 MiB
allocation, measured, reported back in `sizeBytes`).

The `dev` guard holds: re-imported with `dev: false`, the handler returns 403 before
composing anything (measured in `production-reachability.test.ts`). So reaching this
needs a running `vite dev` server, and an attacker who can already POST to a developer's
dev server. It is reported because the repository already has the right shape a few files
away: `api/dev/view-capture` collapses its whole path segment with
`sceneId.replace(/[^a-z0-9-_]/gi, "-")`, and `api/bake-clip`,
`test/float-rotations/save`, `test/poi-matrix/save` and `test/prop-3d-studio/sprites/save`
all validate against a regex or a fixed set. `save-pictograph` is the odd one out.

**Fix direction:** `if (gridMode !== "diamond" && gridMode !== "box") return 400`, and give
`propType` the same scrub `letter` gets.

---

### R3 — `/test/qft-page/**` endpoints ship to production without a dev guard

**Severity:** ordinary robustness / latent. **Evidence:** measured.
**Files:** `src/routes/test/qft-page/img/[file]/+server.ts`,
`src/routes/test/qft-page/frame/[stem]/[index]/+server.ts`

Every other `/test/**` endpoint checks `dev`. These two do not.

**Measured:** re-imported with `dev: false`, both handlers still execute their own logic —
a malformed name → 400 from the route's regex, a well-formed name → 404 from the missing
file. A dev-guarded sibling returns 403 at the same point. So there is no `dev` check in
these two handlers, and that part is observed rather than assumed.

**Inferred, not proven:** that the endpoints are therefore _live in the deployed Worker_.
That rests on two readings, not on any observation of a deployment:

- `svelte.config.js` `routes.exclude` does not list `/test/*`, which should leave the
  endpoints in the Worker bundle.
- `src/routes/test/+layout.ts` redirects away when `!dev`, but it is typed `LayoutLoad`,
  and SvelteKit does not run layout loads for standalone `+server.ts` endpoints — so it
  guards the pages under `/test`, not these endpoints.

No build output was inspected and no deployed URL was requested, so "ships to production"
is a code-and-config inference. Confirming it is a one-line check against a build artefact
or the live host, which this audit's read-only remit did not cover.

**Either way this is not currently an exposure.** The validation is tight —
`^[a-z0-9]+\.(gif|jpg)$` and `^[a-z0-9]+$` / `^[0-8]$` are anchored and admit no traversal
(measured against `../secret.gif`, `a/../../x.gif`, `A.GIF`, `file.png`, a NUL-truncation
name, and `%2e%2e%2fx.gif`) — and the private archive under `docs/reference/archive/` is
not deployed. What makes it worth recording is that nothing in the route enforces either
of those facts: the archive staying undeployed is what keeps the route harmless, not a
check.

**Fix direction:** add the `dev` guard its siblings have.

---

### R4 — the R2 ownership check accepts `..` and control characters in caller-supplied keys

**Severity:** hardening gap. **Evidence:** predicate measured; effect **inferred, not
established**.
**File:** `firebase-functions/src/r2/index.ts:80-89`

`r2MultipartPartUrl`, `r2MultipartComplete`, `r2MultipartAbort`, `r2MultipartListParts`
and `r2DeleteObject` accept a **raw** `key` from the client and gate it with

```ts
if (!key.startsWith(`users/${callerUid}/`)) throw new HttpsError("permission-denied", …);
```

Measured against the same predicate: it correctly rejects `users/uid-victim/…`, but
accepts `users/uid-attacker/../uid-victim/videos/a/clip.mp4` and
`users/uid-attacker/\n../x`. The shipped `getPresignedPutUrl` signs the traversal-shaped
key without complaint, so the raw string does reach the SDK (measured).

**What is not established:** whether R2 resolves that `..`. S3-family object keys are
normally opaque byte strings, in which case the traversal key names a distinct, harmless
object and there is no cross-user access. Settling it would take a request against the
real bucket, which this audit did not make. Reported as hardening because the check is one
character class away from being unambiguous either way, and because `r2DeleteObject`
is a destructive operation to be leaning on that ambiguity.

Separately, `r2DeleteObject` and `r2MultipartPartUrl` call `.startsWith` / arithmetic on
`key` and `partNumber` after only a truthiness check, so a non-string `key` raises a
`TypeError` that surfaces as an opaque `INTERNAL` rather than `invalid-argument`.

**Fix direction:** reject any key containing `..`, a backslash, or a character below
`0x20`, and type-check `key` as a string before the prefix test.

---

### R5 — `transcribeAudio` decodes the base64 payload before checking its size limit

**Severity:** ordinary robustness. **Evidence:** code-read.
**File:** `firebase-functions/src/transcribeAudio.ts:86-92`

```ts
const audioBuffer = Buffer.from(audioBase64, "base64");
if (audioBuffer.length > MAX_AUDIO_BYTES) { … }
```

The allocation happens first; the 5 MB ceiling is checked against the result. The callable
transport's own request-size limit bounds this in practice, so it is an ordering nit
rather than an exhaustion vector — but `audioBase64.length > MAX_AUDIO_BYTES * 4 / 3`
would reject before allocating, and costs nothing.

---

### R6 — `/api/admin/feature-flags` returns raw upstream error bodies to the client

**Severity:** minor information disclosure, admin-authenticated only. **Evidence:** code-read.
**File:** `src/routes/api/admin/feature-flags/+server.ts:191,223,276,315,327`

The PATCH handler returns `detail: errorText`, the verbatim PostHog API response body, on
list and create failures, and line 327 returns `err instanceof Error ? err.message : String(err)`
unconditionally. Both are behind `requireAdmin`, which bounds the audience, but PostHog
error bodies can carry project identifiers and internal field detail that the admin UI has
no use for.

For contrast, the surrounding admin routes get this right: `/api/admin/analytics` returns
`err.message` only for `status < 500` and a fixed string otherwise
(`safeAnalyticsFailure`), `/api/admin/session-replay` logs the cause and returns fixed
prose, and `/api/admin/user-summary` gates on the same `status < 500` rule.

---

### R7 — the Pages-Function copy of the feedback ingest keeps an unbounded rate-limit map, and appears to be dead

**Severity:** ordinary robustness. **Evidence:** code-read.
**File:** `functions/api/feedback/ingest.ts:36-54`

`rateLimitMap` has no cleanup at all — an entry is only replaced when the _same_ IP
returns after its 15-minute window expires. Unlike `src/lib/server/security/rate-limiter.ts`
it has no lazy sweep, so the map grows for the isolate's lifetime under distributed traffic.

This is likely moot: `src/hooks.server.ts:39-44` records that "The `functions/__/auth/`
Pages Function never ran under adapter-cloudflare's `_worker.js`", and this file is a
sibling under the same `functions/` tree, duplicating the live SvelteKit route at
`src/routes/api/feedback/ingest/+server.ts`. That is the repository's own claim about a
neighbouring file, not something this audit confirmed at runtime. If the Pages Functions
are indeed dead, the right fix is deletion rather than a cleanup sweep.

---

### R8 — the feedback ingest API key is compared with `!==`

**Severity:** hardening. **Evidence:** code-read.
**File:** `src/routes/api/feedback/ingest/+server.ts:81`

`apiKey !== FEEDBACK_INGEST_KEY` short-circuits on the first differing byte. Over a
network, with a 20-request / 15-minute rate limit in front of it, extracting a secret this
way is not practical — recorded only because a constant-time compare is cheap and this is
the one shared-secret comparison on the in-scope surface.

---

## Areas inspected and found sound

Recorded so the next pass does not redo them.

| Surface                                                                                                                                                                     | Why it holds                                                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/server/software-submissions/software-submission-input.ts`                                                                                                          | Key allowlist rejects any extra field — including a JSON `__proto__`, which `JSON.parse` makes own-enumerable so `Object.keys` catches it (measured). Every accepted field length-bounded; URL scheme restricted to http/https; all errors fixed prose.                                                                 |
| `src/lib/shared/qr/domain/physical-card.ts`                                                                                                                                 | `SHORT_CODE_PATTERN`, `PHYSICAL_CARD_ID_PATTERN`, `PRINT_RUN_ID_PATTERN`, `DEVICE_ID_PATTERN` are anchored, so no caller string reaches a Firestore document path unvalidated. `MAX_ISSUE_CARDS` 250, `MAX_COPIES` 100, and a combined `MAX_PHYSICAL_IDENTITIES` 2,000 bound the fan-out.                               |
| `src/routes/api/physical-cards/scan/+server.ts`                                                                                                                             | Coarse IP limit applied _before_ parsing so invalid JSON is not a free path; device hash as the primary actor key; geo taken only from Cloudflare's `cf` object, explicitly not visitor headers; coordinates range-bounded; fixed error prose with stable codes.                                                        |
| `src/routes/api/admin/analytics/+server.ts`                                                                                                                                 | `period`, `dimension` and `type` checked against fixed lists; `limit` required to be an integer inside a per-type ceiling; `userId`/`sessionId` length-bounded; `switch` default rejects unknown types.                                                                                                                 |
| `src/lib/server/analytics/hogql-shared.ts`                                                                                                                                  | `escapeHogQL` escapes backslash _before_ quote — the correct order; the reverse would be exploitable.                                                                                                                                                                                                                   |
| `src/routes/api/thumbnail/+server.ts`                                                                                                                                       | Streams the body through `readBodyWithinLimit`, cancelling the reader at the ceiling rather than buffering first; declared `content-length` validated as a safe positive integer; magic-byte check that the bytes match the declared type; both path segments sanitised. The best-shaped upload handler on the surface. |
| `src/routes/api/rune/lifecycle/+server.ts`                                                                                                                                  | Zod `safeParse` on the envelope, session-id length bound, fixed error prose.                                                                                                                                                                                                                                            |
| `cloudflare/workers/posthog-relay/worker.js`                                                                                                                                | Upstream host is chosen from two constants by pathname — no caller-controlled destination, so no SSRF. Cookies stripped before forwarding. (It does buffer the whole POST body with `arrayBuffer()`, bounded by Cloudflare's own request cap.)                                                                          |
| `src/routes/api/dev/view-capture`, `api/bake-clip`, `test/float-rotations/save`, `test/poi-matrix/save`, `test/prop-3d-studio/sprites/save`, `test/flow-fest-path-tracer/*` | `dev`-guarded and each validates its path-forming input against a regex or fixed set before composing.                                                                                                                                                                                                                  |
| `src/routes/api/console-log/+server.ts`                                                                                                                                     | `dev`-guarded, strips CR/LF and ANSI escapes, and truncates to 1,000 chars before logging — log injection handled.                                                                                                                                                                                                      |
| `src/hooks.server.ts` `handleError`                                                                                                                                         | Returns `err.message` only when `dev`; production callers get SvelteKit's generic message. The disclosures in R1/R6 are handlers that catch their own errors and so bypass this.                                                                                                                                        |

One hygiene note, not a finding: `test/float-rotations/save` reads `MAP_NAME[handpath]`
and `VALUE_TO_ENUM[location]` from object literals, so `handpath: "__proto__"` or
`"constructor"` returns a truthy prototype value instead of `undefined`. Traced through:
both paths still end in a 400 because the resulting string matches nothing in the source
file, so there is no reachable defect — but a `Map` or an `Object.hasOwn` guard would make
that accidental rather than load-bearing.

---

## Verification

**Before.** The repository already tests rate limiting and several of the routes on this
surface, so the gap is narrower than "untested" — it is specific:

- `tests/unit/rate-limiter.test.ts` covers `checkRateLimit` itself (ceiling, window
  expiry, no module-load timer). It never calls `withRateLimit`, so nothing exercised
  how the bucket **key** is derived — which is where S2 lives.
- `tests/unit/thumbnail-upload-route.test.ts`, `admin-analytics-route.test.ts`,
  `admin-user-auth-route.test.ts`, `admin-user-summary-route.test.ts`,
  `session-replay-route.test.ts` and `posthog-lifecycle-route.test.ts` cover the routes
  this audit found sound, which is part of why those routes are sound.
- No test anywhere imports `qr-video`, `r2-client`, `test-render` or `save-pictograph`
  (`rg -l` over `tests/` and `src/` for `*.test.ts` returns nothing outside this suite),
  and `firebase-functions/src/r2/` contains no test file at all.

**After:** 38 tests across 6 files, all passing.

```
$ npx vitest run --config tests/opus-server-input-audit/vitest.config.ts

 ✓ tests/opus-server-input-audit/qr-video-upload-bounds.test.ts          (6 tests)  217ms
 ✓ tests/opus-server-input-audit/dev-write-path-composition.test.ts      (5 tests)  337ms
 ✓ tests/opus-server-input-audit/production-reachability.test.ts         (6 tests)  197ms
 ✓ tests/opus-server-input-audit/rate-limit-key-scope.test.ts            (5 tests)  149ms
 ✓ tests/opus-server-input-audit/r2-presign-size-bound.test.ts           (8 tests)   36ms
 ✓ tests/opus-server-input-audit/rejected-input-and-error-disclosure.test.ts (8 tests) 3221ms

 Test Files  6 passed (6)
      Tests  38 passed (38)
```

**Portability.** The suite was authored and run on Linux. A review run on Windows reported
37 pass / 1 fail and one file defect, both now fixed:

- `dev-write-path-composition.test.ts` asserted `toContain("tmp/audit-escape")` against a
  `path.resolve` result, which emits `\` on Windows. The assertion now normalises
  separators through a `resolvedPosix` helper. The neighbouring escape assertion was
  already separator-safe (it compares against `INTENDED_ROOT + path.sep`) and passed on
  both platforms, so the defect was in how the result was _stated_, not in what was
  observed — the finding itself is unchanged.
- `production-reachability.test.ts` carried a **raw NUL byte** at offset 4343, inside the
  traversal-rejection list. That was meant to be a NUL-truncation test case and is now
  written as a `\u0000` source escape, leaving every file in the suite pure ASCII
  (verified: no byte outside `0x09–0x7e` plus newline remains in any suite file).

Re-run after both fixes, on Linux: **38 passed (38)**. The suite has no remaining
`path.sep`-dependent assertion and no raw control byte.

These tests assert **current** behaviour so each finding is reproducible. They are not a
specification of desired behaviour: fixing S2 will make
`rate-limit-key-scope.test.ts` fail, which is the point — whoever fixes it should invert
those assertions in the same change.

Setup performed in this checkout (none of it committed): `pnpm install`,
`npm ci` inside `firebase-functions/` (for `@aws-sdk/*`), `node
scripts/svelte-kit-sync-if-needed.mjs`, and `npm run build:packages` (for `@tka/tka-types`,
reached through `/api/test-render`'s import graph).

## Limitations

- No production or staging endpoint was contacted; no Firebase, R2 or PostHog credential
  was read. Every "reachable in production" claim rests on reading the route tree,
  `svelte.config.js` `routes.exclude`, and the per-handler guards — plus, for the two
  `dev`-guard claims, re-importing the handler with `dev: false` and observing that it
  still runs.
- Three R2 questions are **not** established. Two are behavioural and would need a
  request against the real bucket: whether R2's public domain serves back an
  attacker-chosen Content-Type (S1), and whether R2 resolves `..` in an object key (R4).
  The third — the actual upload ceiling (S1) — is a provider limit to be read from R2's
  documentation and the bucket/account configuration; no single upload could establish
  it, since a success only shows that one size was permitted.
- "Ships to production" for the two `/test/qft-page` endpoints (R3) is an inference from
  `svelte.config.js` and SvelteKit's layout-load semantics. What is measured is only that
  the handlers contain no `dev` check. No build artefact was inspected and no deployed URL
  was requested.
- The suite ran on Linux here and on Windows in review. It was not run on macOS, and no
  Node version other than the repository's current one was exercised.
- The rate-limit evidence exercises the in-memory fallback. The Cloudflare native binding
  was not exercised; the claim that the defect carries over rests on reading
  `withRateLimit.ts:70-73`, which passes the identical `identifier` to `limiter.limit`.
- `/api/tika/**`, `/api/admin/user-auth/[uid]`'s body handling, and the merch/donation
  callables were not audited — excluded by brief. The admin route appears here only as a
  second instance of S2's key-derivation problem.
- Firestore security rules were not read; several findings mention Firestore paths, but
  whether the rules independently constrain them belongs to the security agent's scope.

## Review corrections

Two review rounds caught six substantive errors across the first two drafts. Recording
them here rather than quietly editing them out, because three were the report
contradicting its own evidence.

**Round one** (four errors):

1. **R1 claimed `/api/test-render` burns a quota "shared with `/api/render-pictograph`".**
   Wrong, and it contradicted S2 in the same document: the two routes share the
   `AI_RENDER` _preset_, but `withRateLimit` keys buckets by pathname, so each fixed-path
   route has its own. `/api/test-render` exhausts only itself. R1 now says so, and notes
   that its fixed path means S2's bypass does not apply to it either.
2. **The follow-up list called S2 "the precondition for S3 being fixable at all".** Wrong.
   Requiring authentication on `/api/qr-video/[hash]` stops unauthenticated writes whether
   or not the rate-limit keying is ever corrected. S2 is the prerequisite for an effective
   per-caller ceiling, not for fixing S3. Both S3 and the follow-up list now treat the two
   controls as separable.
3. **S1 said "PUT any number of bytes", implying unlimited.** What is measured is that the
   _application's_ declared ceiling does not bind. R2's and Cloudflare's own limits were
   never established, so the claim is now scoped to the app-level ceiling.
4. **R3 presented production reachability as established.** The `dev:false` handler
   behaviour is measured; that the endpoints are live in the deployed Worker is an
   inference from `svelte.config.js` and SvelteKit's layout-load semantics. No build
   output or deployed URL was inspected. R3 now separates the two.

**Round two** (two errors, both in fix directions rather than findings):

5. **S3's fix direction offered a matching `Origin` header as a weaker-but-sufficient
   alternative to authentication** — "requiring an authenticated caller (or at minimum a
   present, matching `Origin`) removes the anonymous-write path outright". False, and
   again contradicted this report's own measurement: `Origin` is set by the browser for
   the browser's benefit, and the very test cited in S3 shows a client that simply omits
   it sailing through to a 204. A non-browser client can forge any value. `Origin` can
   restrict cross-origin _browser_ requests and nothing else; removing unauthenticated
   arbitrary-client writes requires authenticated authorization. S3 and follow-up 2 now
   say so explicitly and warn against the substitution.
6. **Follow-up 4 claimed "one authorised probe settles" the platform upload ceiling.** A
   bounded probe establishes only that one tested size was accepted or refused on one
   path — it cannot establish a ceiling. The upload limit is a documented and configured
   provider value and should be read from R2's documentation and the bucket/account
   settings. The probe is still the right instrument for the two _behavioural_ questions
   (served Content-Type, `..` normalisation). S1, Limitations and follow-up 4 now separate
   the two kinds of check.

Two test defects from round one, both fixed and detailed under _Verification →
Portability_: a `path.sep`-dependent assertion that failed on Windows, and a raw NUL byte
committed into `production-reachability.test.ts`.

The core S1 / S2 / S3 findings were not affected by any of this — both rounds confirmed
them against the same evidence. Every correction was to a claim _about_ a finding: its
blast radius, its dependencies, or how to close it.

## Follow-ups, in the order I would take them

1. **S2** — key `withRateLimit` on `event.route?.id`. One line, in shared security code.
   It is the prerequisite for _any_ parameterised route having an effective per-caller
   ceiling. It is **not** a prerequisite for fixing S3: requiring authentication on
   `/api/qr-video/[hash]` independently stops unauthenticated writes whether or not the
   rate limit is ever corrected. The two are separable and can be done in either order.
2. **S3** — decide whether `/api/qr-video/[hash]` should accept unauthenticated writes at
   all. Closing it needs authenticated authorization; the existing `Origin` check is a
   browser-scoped control and cannot substitute, since any non-browser client omits or
   forges the header. The rate limit is the second line, not the first.
3. **S1** — sign `ContentLength` and `ContentType` on the presigned PUT, and give
   `r2MultipartStart` a bound. Until then the application's declared upload ceiling and
   MIME allowlist do not apply to any signed-in user's upload.
4. **S1 / R4 verification** — two different kinds of check, and they should not be
   conflated:
   - **Read the provider's documentation and the bucket/account configuration** for the
     actual upload ceiling. A probe cannot establish a ceiling: sending N bytes
     successfully shows only that N is permitted, and a rejection at N shows only that
     something refused N on that path. The limit is a documented and configured value,
     so look it up rather than infer it from a single upload.
   - **A bounded authorised probe** can settle the two behavioural questions a document
     cannot: what Content-Type R2's public domain serves back for an object stored under
     an attacker-chosen type, and whether `..` in a key is normalised or kept literal.
     Both are outside this audit's read-only remit.
5. **R1** — delete `/api/test-render` or gate it to `dev`. It cannot succeed on any
   request, and it advertises an internal symbol on failure.
6. **R3** — add the missing `dev` guard to the two `/test/qft-page` endpoints.
7. **R2** — validate `gridMode` against its two literals and scrub `propType`.
8. **R5, R6, R7, R8** — small, independent, and safe to batch.
