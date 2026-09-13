# Shared sequence link routing — Opus batch 2026-09-12

Scope: route parsing and resolution for sequence share links and QR entry
(`/sequence/[id]`, `/q/[code]`, and the parsers those routes call). No Firestore
rules, no auth flow, no access widening, no production writes, no shared-library
repository changes, no app-bootstrap changes.

| Field          | Value                                                      |
| -------------- | ---------------------------------------------------------- |
| Base SHA       | `c4be16199e390e8bdab766051a0042c7827b8d30` (`origin/main`) |
| Final code SHA | `d43e5374` on `claude/shared-link-routing-fixes-lofw8y`    |
| Branch tip     | this report's own commit, immediately on top of `d43e5374` |
| Environment    | Cloud checkout, Linux, Node/pnpm, no laptop dependency     |

## Owned files

| File                                                                     | Change                                     |
| ------------------------------------------------------------------------ | ------------------------------------------ |
| `src/lib/shared/navigation/services/sequence-encoder.ts`                 | `parseSequenceRouteId` rewritten           |
| `src/lib/shared/navigation/services/types.ts`                            | `SequenceRouteIdParseResult.inlineQr`      |
| `src/lib/shared/navigation/services/__tests__/sequence-route-id.test.ts` | New route-parameter contract suite         |
| `src/lib/shared/qr/services/extract-scan-code.ts`                        | Unescape the path segment                  |
| `src/lib/shared/qr/services/__tests__/extract-scan-code.test.ts`         | Two added cases                            |
| `src/routes/sequence/[id]/+page.server.ts`                               | Inline-QR meta branch                      |
| `src/routes/sequence/[id]/SequenceViewerPage.svelte`                     | Inline-QR routing, bootstrap failure floor |

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
returned the escaped text as the code. A `tka.run` link carrying an `s~` payload
that has been through any URL normalizer arrives as `s~q1:A%20B…`, and that
string is not a decodable payload.

### Fix

- `parseSequenceRouteId` classifies the parameter **as it arrives**. The extra
  decode survives only as a fallback candidate, tried second and only when the
  id contains `%`, and it can no longer throw — so historically double-encoded
  links (`/sequence/d1%253AAbC`) still resolve.
- `extractScanCode` unescapes the path segment before testing it, keeping the
  raw text when the escape is malformed rather than throwing inside a scan loop.

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
  full `npm run check` / build gate. The diff changes no rendered geometry; the
  one user-visible surface change is that a previously-permanent loading state
  now reaches the route's existing error card.

## Regressions and risk

- `SequenceRouteIdParseResult` gained a required field. Both consumers
  (`+page.server.ts`, `SequenceViewerPage.svelte`) were updated; a repo-wide
  grep confirms there are no others.
- Legacy links preserved on purpose and covered by tests: compressed `d1:`
  links, uncompressed `raw:` links, short codes, legacy lowercase-`θ` document
  ids, words, and historically double-encoded inline links.
- Behaviour change worth naming: an `s~raw:` id used to render _something_
  (the wrong sequence). It now renders the right one. An `s~raw:` id's SSR meta
  used to carry a word derived from that wrong decode; it now carries the real
  one or none.
- `+page.server.ts` now awaits `decodeSequenceFromQR` on SSR for inline ids.
  For an `r1:` recipe that pulls the compositional decoder into the server
  module graph. `/q`'s `prepareScanViewerPayload` already does exactly this on
  the same critical path, so the precedent and the cost profile are established.

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
