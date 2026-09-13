# Shared sequence link routing — Opus batch 2026-09-12

Scope: route parsing and resolution for sequence share links and QR entry
(`/sequence/[id]`, `/q/[code]`, and the parsers those routes call). No Firestore
rules, no auth flow, no access widening, no production writes, no shared-library
repository changes, no app-bootstrap changes.

| Field          | Value                                                      |
| -------------- | ---------------------------------------------------------- |
| Base SHA       | `c4be16199e390e8bdab766051a0042c7827b8d30` (`origin/main`) |
| Final code SHA | `0a4e9fc4` on `claude/shared-link-routing-fixes-lofw8y`    |
| Branch tip     | this report's own commit, immediately on top of `0a4e9fc4` |
| Round 1 tip    | `b891029b` — reviewed; its two gaps are fixed in round 2   |
| Environment    | Cloud checkout, Linux, Node/pnpm, no laptop dependency     |

## Owned files

| File                                                                     | Change                                    |
| ------------------------------------------------------------------------ | ----------------------------------------- |
| `src/lib/shared/navigation/services/sequence-encoder.ts`                 | `parseSequenceRouteId` rewritten          |
| `src/lib/shared/navigation/services/inline-qr-envelope.ts`               | New: the `s~` envelope owner              |
| `src/lib/shared/navigation/services/route-load-fence.ts`                 | New: latest-run-wins route fence          |
| `src/lib/shared/navigation/services/__tests__/route-load-fence.test.ts`  | New: deferred-navigation suite            |
| `src/routes/sequence/[id]/+page.svelte`                                  | Keys the viewer on the route id           |
| `src/routes/sequence/[id]/__tests__/sequence-hydration-parity.test.ts`   | Keying and fencing contract cases         |
| `src/lib/shared/navigation/services/types.ts`                            | `SequenceRouteIdParseResult.inlineQr`     |
| `src/lib/shared/navigation/services/__tests__/sequence-route-id.test.ts` | New route-parameter contract suite        |
| `src/lib/shared/qr/services/extract-scan-code.ts`                        | Envelope-aware path-segment handling      |
| `src/lib/shared/qr/services/__tests__/extract-scan-code.test.ts`         | Escaping cases, both directions           |
| `src/routes/sequence/[id]/+page.server.ts`                               | Inline-QR meta branch                     |
| `src/routes/sequence/[id]/SequenceViewerPage.svelte`                     | Inline-QR routing, failure floor, fencing |

Nothing else was touched. No instruction file, no `main`, no deploy.

## Supported URL formats traced before acting

`/sequence/[id]` accepts four kinds of id, and `parseSequenceRouteId` is the
only thing that tells them apart:

1. **Compressed inline share link** — `d1:<base64url>`, produced by
   `generateViewerURL` / `generateSequenceRoutePath`.
2. **Uncompressed inline share link** — `raw:<flat encoding>`, the fallback when
   deflate does not shrink the payload. Contains `|` beat separators.
3. **Legacy self-contained QR payload** — `s~` + a QR envelope
   (`q1:<base45>`, `r1:<recipe>`, or `raw:<flat>`). Still a supported entry:
   `extractScanCode`, `q/[code]/+page.server.ts`, `scan-viewer-payload-preparer`
   and `ShortCodeManager.resolveShortCodeWithRecord` all have live branches for it.
4. **Legacy id / short code / word** — a Firestore document id, a 4–6 char
   base36 short code, a sync-room id, or a sequence word (including the 70
   documents whose ids still carry a lowercase `θ`).

`/q/[code]` accepts the same short codes and `s~` payloads, resolves them, then
hands off to `/sequence/<code>?from=scan&code=<code>` via
`buildScanSequenceDestination`.

## Defect 1 — the route parameter was percent-decoded twice

`parseSequenceRouteId` opened with `decodeURIComponent(id)`. SvelteKit has
already done that: `@sveltejs/kit/src/utils/url.js` runs `decode_pathname`
(a `%25`-safe `decodeURI`) over the path and then `decode_params`
(`decodeURIComponent`) over every matched parameter, so `params.id` and
`page.params.id` are plain text by the time a route sees them.

A legacy QR payload is base45 (RFC 9285). Its alphabet is
`0-9 A-Z $%*+-./: ` and space — it includes `%`. So a second decode either:

- **throws `URIError`** when a `%` is not followed by two hex digits, or
- **silently rewrites the body** when it is (`%2E` → `.`, `%4A` → `J`), after
  which the payload fails its own base45/inflate check.

Measured, not inferred, on the production payload already captured in
`sequence-encoder.legacy-qr.test.ts`:

```
NUMERIC float QR through /sequence/<encodeURIComponent(payload)>
  -> SvelteKit param == payload (round trip is clean)
  -> parseSequenceRouteId(param) == "THREW: URIError: URI malformed"
```

The throw is the damaging half. `+page.server.ts` catches it and degrades to
unverified meta, but on the client `SequenceViewerPage.initializeRoute()` had no
outer catch: `parseSequenceRouteId` threw before any branch ran, `isLoading`
stayed `true`, and the viewer sat on its loading gate **forever** — no error
card, no Browse/Create recovery links, and no `qr_scan_resolution` failure
event. This is the direct-reload path: arriving through `/q` survives because
`consumeSequenceRouteHandoff()` returns the sequence before the id is parsed, so
only a reload or a pasted link hits it.

The same double-decode class exists at the QR-entry boundary.
`extractScanCode` read `url.pathname`, which keeps its percent escapes, and
returned the escaped text as the code, so a double-encoded `tka.run` link handed
the resolver `s~q1%3A…` — not a decodable payload.

### Fix

- `parseSequenceRouteId` classifies the parameter **as it arrives**. The extra
  decode survives only as a fallback candidate, tried second, and it can no
  longer throw — so historically double-encoded links (`/sequence/d1%253AAbC`)
  still resolve.
- `extractScanCode` no longer returns a still-escaped path segment.

Round 1 shipped both of those as unconditional decodes, which was too blunt in
one direction and not enough in the other. Round 2 replaces the rule with an
envelope test and corrects the account above where it overstated the fix —
read that section for what each boundary actually does now.

## Defect 2 — inline QR payloads reached the wrong decoder

Two separate misroutings, both of which produced a _plausible_ result rather
than an error.

**a. The pipe heuristic claimed `s~raw:` payloads.** `parseSequenceRouteId`
treated any id containing `|` as an uncompressed inline sequence. An `s~`
payload whose envelope is `raw:` still carries the flat encoding's pipes, so it
was handed to `decodeSequenceWithCompression`, which read `s~raw:iiSS` as the
sequence header, consumed the start position as an ordinary step, and returned a
different sequence. Measured on `s~raw:iiSS|noeac0:soweu0|noeac1:soweu1`:

|                                            | steps | start position, right hand |
| ------------------------------------------ | ----- | -------------------------- |
| `decodeSequenceFromQR` (correct)           | 1     | `s`                        |
| `decodeSequenceWithCompression` (what ran) | 2     | `n`                        |

Reachability of `s~raw:` is **inferred, not observed in the wild**:
`compressForQR` returns a `raw:` envelope only when deflate does not shrink the
flat encoding, which measured true for hand-written short encodings
(`"iiSS|noeac0:soweu0|"` → `raw:`) and false for every real sequence I encoded
(a 1-step sequence still produced `q1:`). The misclassification is deterministic
whenever such a payload exists.

**b. `loadSequenceFromId`'s inline pre-step could never succeed.** It called
`decodeSequenceWithCompression(decodeURIComponent(id))` for any `s~` id. That
decoder does not strip the `s~` prefix, so for `q1:`/`r1:` payloads it always
threw and the work was wasted, and for a `raw:` payload it returned the wrong
sequence described above. The correct owner was already the next line:
`ShortCodeManager.resolveShortCode` puts its inline branch
(`decodeSequenceFromQR`) ahead of every network leg and resolves offline.

### Fix

- `SequenceRouteIdParseResult` gained an `inlineQr` field; the inline-QR test
  runs before the URL-encoding test.
- The viewer routes `inlineQr` to the short-code manager and the dead pre-step
  is gone (`isInlineEncoded` import removed with it).
- `initializeRoute` now wraps resolution in a failure floor: an unexpected throw
  logs, sets the error state, ends the load, and still reports scan failure
  telemetry.
- `+page.server.ts` builds inline meta for `inlineQr` from `decodeSequenceFromQR`
  instead of falling through to `loadPublishedMeta`, which spent a
  `deckReleases/counter/manifests` collection read on an id that cannot be a
  document id (base45 emits `/`).

## Verification

All commands run in this cloud checkout. `pnpm install --frozen-lockfile` and
`npm run build:packages` were required first (`@tka/tka-types` must be built
before Vite can resolve it).

**Failure proven before the fix.** The new suites were run against the base
versions of the five source files (`git stash` of source only):

```
npx vitest run --config tests/config/vitest.config.ts \
  src/lib/shared/navigation/services/__tests__/sequence-route-id.test.ts \
  src/lib/shared/qr/services/__tests__/extract-scan-code.test.ts
→ 13 failed | 13 passed
   including URIError: URI malformed at sequence-encoder.ts:758
   and extractScanCode returning "s~q1%3AA%209396V%24GYO1%254AOAOC%2FB8.T70"
```

**Passing after the fix.**

```
npx vitest run --config tests/config/vitest.config.ts \
  src/lib/shared/navigation/ src/lib/shared/qr/ src/routes/sequence/
→ 17 files, 132 tests passed

npx vitest run --config tests/config/vitest.config.ts \
  tests/unit/share tests/unit/share-intake src/lib/shared/inbox src/lib/shared/share-intake
→ 34 files, 343 tests passed          (extractScanCode consumers)

npx vitest run --config tests/config/vitest.config.ts \
  tests/unit/inbox
→ 6 files, 22 tests passed

npx vitest run --config tests/config/vitest.config.ts \
  tests/unit/sequence-viewer-shell-contract.test.ts tests/unit/scan tests/unit/qr
→ 25 files, 148 tests passed
```

**Type check.** `npm run check:fast` (`svelte-fast-check`, whole project) was
run twice: once with the five source files reverted to their base versions
(586 errors / 44 warnings) and once with the fix in place (582 / 44). The
four-error difference is entirely an artifact of the reverted run — the new test
file references `inlineQr`, which the base parser does not return. Diffing the
diagnostic locations, the only real delta is the pre-existing
`SequenceViewerPage.svelte` `page.params.id: string | undefined` error moving
from line 104 to 103 — the same error also stands unchanged at
`src/routes/q/[code]/+page.svelte:34`. **No new type errors.** The 582 are a
pre-existing project baseline and were not touched.

**Lint / format.** `npx eslint` on the changed files: 0 errors (the `.svelte`
route file is in the project's eslint ignore set). `npx prettier --check`: the
new test file is formatted. `extract-scan-code.ts` and its test were already
tab-indented and prettier-dirty at the base commit; the added lines match the
surrounding file style rather than reformatting an unrelated file.

### Evidence classification

- **Measured:** every result above, plus the URL round-trip behaviour, which is
  reproduced in the test by running SvelteKit's own two decode steps
  (`decode_pathname` then `decodeURIComponent`) over a real URL.
- **Mocked:** none. The new tests use the real parser, the real codecs, and real
  production payloads. No Firestore, emulator, or network was involved.
- **Inferred:** `s~raw:` payload reachability (see Defect 2a). The
  misclassification itself is measured; only its frequency in the wild is not.
- **Not run:** browser/visual verification, Firestore emulator suites, and the
  full `npm run check`. The diff changes no rendered geometry; the user-visible
  surface changes are that a previously-permanent loading state now reaches the
  route's existing error card, and that a same-route navigation remounts the
  viewer instead of leaving the previous sequence on screen. `build:fast` was
  run in round 2 — see its caveats there.

## Regressions and risk

- `SequenceRouteIdParseResult` gained a required field. Both consumers
  (`+page.server.ts`, `SequenceViewerPage.svelte`) were updated; a repo-wide
  grep confirms there are no others.
- Legacy links preserved on purpose and covered by tests: compressed `d1:`
  links, uncompressed `raw:` links, short codes, legacy lowercase-`θ` document
  ids, words, and double-encoded links of every family — `d1%3A`, `raw%3A` with
  escaped pipes, and `s~q1%3A` / `s~r1%3A` / `s~raw%3A`. **The first round of
  this report claimed that last group without qualification and was wrong about
  the `s~` half of it; see round 2 below for what was actually broken and what
  the claim now rests on.**
- Behaviour change worth naming: an `s~raw:` id used to render _something_
  (the wrong sequence). It now renders the right one. An `s~raw:` id's SSR meta
  used to carry a word derived from that wrong decode; it now carries the real
  one or none.
- `+page.server.ts` now awaits `decodeSequenceFromQR` on SSR for inline ids.
  For an `r1:` recipe that pulls the compositional decoder into the server
  module graph. `/q`'s `prepareScanViewerPayload` already does exactly this on
  the same critical path, so the precedent and the cost profile are established.

## Round 2 — two gaps found in review of `b891029b`

### Correction to the round-1 claim

Round 1 listed "historically double-encoded inline links" among the legacy
formats preserved and covered by tests. That was true for `d1:` and `raw:` and
**false for `s~`**, and the test I wrote did not catch it because it only
exercised the `d1:` family. The `s~` prefix needs no escaping, so a
double-encoded inline link still matched the inline test while its envelope
delimiter was escaped, and `parseSequenceRouteId` handed `s~q1%3A…` straight to
a decoder that cannot read `q1%3A`. Measured on the production flat payload:

```
/sequence/<encodeURIComponent(encodeURIComponent(payload))>
  -> param       "s~q1%3A9O5%2F166CQPYL*25*4NKYPGQG%3ARDJM…"
  -> inlineQr    "s~q1%3A9O5%2F166CQPYL*25*4NKYPGQG%3ARDJM…"   (unchanged)
  -> decode      Error: Invalid sequence encoding - missing data
```

Round 1 also **introduced a regression** at the other boundary. `extractScanCode`
unescaped the path segment unconditionally, which corrupts a payload whose
base45 body genuinely contains a `%`:

```
extractScanCode("https://tka.run/s~q1:A 9396V$GYO1%4AOAOC…")
  -> "s~q1:A 9396V$GYO1JOAOC…"      %4A rewritten to J
```

### The rule both boundaries now share

A recognizable prefix is not proof that a candidate is readable. The tell is the
**envelope**: every payload opens with a delimiter its decoder must read —
`q1:`, `r1:`, `raw:`, `d1:`, or a bare flat encoding's `|`. If that delimiter is
intact, the escapes further in are the payload's own and must not be touched. If
it is escaped, the string was encoded again upstream and one decode restores it,
`%254A` back to `%4A` included.

`parseSequenceRouteId` now takes a candidate only when its own delimiters are
intact, tries the once-decoded spelling under the same test, and falls back to
the id as it arrived rather than guessing. `extractScanCode` consults the same
owner. Both live in the new
`src/lib/shared/navigation/services/inline-qr-envelope.ts`, which also holds
`INLINE_PREFIX` and `isInlineEncoded` (re-exported from `sequence-encoder.ts`,
so its eight import sites are unchanged).

**Residual ambiguity, reported not guessed:** a payload that arrives with its
envelope intact but a normalizer-escaped space keeps the `%20`, because `%20` is
also three valid base45 characters and nothing at this boundary can tell the two
apart without decoding. That case now fails loudly in the decoder instead of
being silently rewritten. Round 1's test for it was mislabelled "from a
normalized link" when it actually exercised double-encoding; it is renamed.

### The viewer did not re-resolve on a same-route navigation

Round 1 reported this as investigated and left alone for want of a reachable
path. That judgement was wrong: `goto` from the nearby-sync banner and from an
inbox notification both target `/sequence/[id]`, and the back button across two
`/sequence` history entries is a same-route navigation too. SvelteKit reuses the
page component across those, `+page.svelte` did not key its child, and the
viewer resolves once in `onMount` — so the previously resolved sequence stayed
on screen under the new URL.

Both halves of the fix were needed:

- **Keyed remount.** `+page.svelte` wraps the viewer in `{#key routeId}`, inside
  the existing `{#if browser}` guard and inside the `{#await import(...)}` so
  the module is still imported once and SSR still renders the head shell alone.
- **Run fencing.** A remount cannot recall a lookup the outgoing instance
  already started. `createRouteLoadFence()`
  (`src/lib/shared/navigation/services/route-load-fence.ts`) hands the bootstrap
  a run, and every `await` re-checks it before assigning — nine checks across
  the handoff, inline-decode, catalog, short-code, library and hydration legs,
  plus the fire-and-forget `matchPublicRecord`, which is the longest-lived write
  in the route. `onDestroy` disposes the fence, so a reply landing after teardown
  is dropped too.

Created rather than reused: a search for `isStale`, `requestToken`,
`generation`, and `latest-wins` across `src/lib` found only per-file ad-hoc
counters (`loop-explorer-state`, `foreground-message-handler`), no shared owner,
and none covering disposal.

### Round-2 verification

**Failure proven before the fix.** The new assertions were run against the
round-1 tip (`b891029b`) with the round-2 sources reverted:

```
→ 8 failed
   unescapes a double-encoded q1 / r1 / raw / q1-with-percents envelope
   keeps genuine base45 percents behind an intact envelope
   keys the viewer on the route id so a same-route navigation remounts it
   keeps the viewer out of SSR, with the key inside the browser guard
   fences the viewer's async bootstrap against a superseded run
```

**Passing after.**

```
npx vitest run --config tests/config/vitest.config.ts \
  src/lib/shared/navigation/ src/lib/shared/qr/ src/routes/sequence/
→ 18 files, 148 tests passed

… plus tests/unit/{inbox,share,share-intake,qr,scan} and the shell contract
→ 83 files, 661 tests passed
```

The fence has its own behavioural suite
(`__tests__/route-load-fence.test.ts`): a slow resolution for share link A
landing after B has rendered is dropped, and a resolution landing after disposal
is dropped. The keying and the per-`await` checks are asserted as a source
contract in the route's existing `sequence-hydration-parity.test.ts`, alongside
its established source-reading cases.

**Type check.** `npm run check:fast`: 582 errors / 44 warnings, byte-identical
diagnostics to round 1 except the pre-existing
`SequenceViewerPage.svelte` `page.params.id` error shifting 103 → 104 (one added
import). No new type errors.

**SSR/client parity.** `npm run build:fast` completed both passes — SSR 6,779
modules, client 10,864, Cloudflare adapter done. The viewer's markup appears in
zero files of `.svelte-kit/output/server`, confirming the `{#key}` did not pull
the browser-gated child into SSR. Two caveats, both environmental: the build
needs `PUBLIC_*` values this cloud checkout does not carry (it first failed on
`PUBLIC_GOOGLE_MAPS_API_KEY`, imported by
`src/lib/features/community/get-geocoding-service.ts`, a file untouched by this
branch), so it was re-run with placeholders from `.env.example`; and it still
exits non-zero afterwards because the post-build `inline-landing-critical-css`
step reaches Firestore, which the sandbox proxy refuses with 403. **The Vite
build itself succeeded; the whole-gate exit code did not, and is not claimed.**

**Lint / format.** `npx eslint` on every changed and new file: clean. Prettier
formatted all round-2 files.

## Reported, not changed

Three findings in adjacent code where the right behaviour is a product decision
or the owner is another agent's. None were modified.

1. **Mixed-case legacy short codes vs. `extractScanCode`'s uppercasing.**
   `extractScanCode` returns `candidate.toUpperCase()`, which is deliberate and
   recorded in its tests — QR alphanumeric mode is uppercase-only, so a printed
   card's URL arrives uppercased. But `shortcodes` document ids are
   case-sensitive and real mixed-case codes exist (`s8g62i`, `rSgNf0` are cited
   in `sequence-encoder.legacy-qr.test.ts`), while the current
   `ALPHABET = "0123456789A-Z"` mints uppercase only. If any mixed-case code was
   ever printed or shared as a link, uppercasing makes it unresolvable.
   Whether those codes should get a case-insensitive resolution fallback is a
   product call with a Firestore-read cost, so I did not invent one.

2. **Permission-denied / transient failure is reported as "deleted by the
   owner".** `PublicSequencesLoader.loadFullSequenceDataStrict` deliberately
   _throws_ when a read was never answered, so a caller can tell "authoritatively
   not public" from "could not determine". `loadByIdentifier` calls the lenient
   `loadFullSequenceData`, which swallows that distinction into `null`, and
   `SequenceViewerPage` renders every `null` as
   _"It may have been deleted by the owner while you were browsing the feed."_ —
   including for an offline read, a permission-denied private document, and a
   cold Firestore connection. Fixing it means either changing
   `loadByIdentifier`'s contract (5 callers across inbox, connect, stage and a
   test route) or adding a detailed sibling, plus new copy for each outcome.
   The correct copy per outcome is a product decision; reported rather than
   guessed.

3. **`message-link-parts.ts` inherited the same double-encoding, and the fix
   reaches it.** At line 107 it hands the still-escaped `rawIdentifier` to
   `extractScanCode` and then `encodeURIComponent`s the result into
   `/sequence/<code>`. For an `s~` payload that used to produce a
   double-encoded route and an escaped `sequenceShortCode` on the attachment.
   The `extractScanCode` change corrects it without touching the inbox file,
   which is another agent's. Recorded here because the behaviour of an
   inbox-owned surface changed as a side effect; its own suite
   (`tests/unit/inbox`, 22 tests) still passes.

## Not claimed

- No browser, device, or emulator gate was run; none is claimed as passing.
- The viewer's permanent-spinner fix is argued from the code path and the
  measured `URIError`, not from a mounted-component observation — the route
  component's dependency graph (Firebase, PostHog, 3D) makes a browser component
  test disproportionate to the change. The parser-level failure and its fix are
  measured directly.
- One thing I investigated and deliberately did **not** fix: the viewer resolves
  its sequence only in `onMount`, so a client-side navigation between two
  `/sequence/[id]` URLs (or a back/forward across one) would keep showing the
  first sequence. I could not find a reachable path to it — the route mounts no
  app shell, the viewer shell has no link to another sequence, and `/q` reaches
  it as a route change — so I left it rather than spend a fix on a defect I
  could not demonstrate.
