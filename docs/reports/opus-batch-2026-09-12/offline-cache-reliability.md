# Offline / PWA cache lifecycle — two reproduced defects

Opus cloud wave 3, assignment: offline cache reliability.

|                |                                                                           |
| -------------- | ------------------------------------------------------------------------- |
| Base SHA       | `6e4c1b5a388625d9c95f92e9a717f8ca2ab77f20` (`origin/main` at start)       |
| Fix SHA        | `2e2b6c83` — `static/sw.js` + regression tests                            |
| Final code SHA | `5e89ffc1f263b996acc8f95395fee5b59fcb38ba` (formatting; last code commit) |
| Branch head    | this report's own commit, on top of the above                             |
| Branch         | `claude/offline-cache-reliability-n4vmh6`                                 |
| Checkout       | isolated cloud checkout, shallow clone, `pnpm install --frozen-lockfile`  |

## Owned files

Only these two files were modified:

- `static/sw.js`
- `tests/unit/sw-offline-behavior.test.ts`

Nothing under `src/`, no build scripts, no config, no `static/legacy-sw.js`.

## What the active service worker actually is

Traced before touching anything, so the fixes land on live code:

- `src/hooks.client.ts:320` registers `/sw.js` with `{ scope: "/", updateViaCache: "none" }`,
  production-only (`!dev`, not Capacitor, not Tauri). That file is `static/sw.js`.
- `static/legacy-sw.js` is referenced only by `svelte.config.js:37` (a prerender
  exclusion). Nothing registers it — it is dead and was deliberately left alone.
- `static/firebase-messaging-sw.js` is a separate, fetch-less registration owned
  by `fcm-token-manager.ts`; out of scope.
- The only Cache Storage writers in the whole repo are `static/sw.js` and the dead
  `static/legacy-sw.js` (`rg 'caches\.(open|match|keys|delete)'`). No app-owned
  cache exists for the `activate` sweep to destroy today, so the "stale version
  cleanup deletes a live cache" hypothesis was **refuted** rather than fixed — see
  Risks for the latent version of it that does exist.

## Defect 1 — a failed cache write was reported to the page as "you are offline"

`networkFirstDedicated()` (the rule behind `/models/*.glb`, `/models/*.ktx2`,
`/draco/*`) kept its cache write _inside_ the same `try` as the network fetch:

```js
try {
  const response = await fetchWithTimeout(request, 10000);
  if (response.ok) await cache.put(request, response.clone()); // <- in the try
  return response;
} catch {
  const cached = await cache.match(request);
  return cached || new Response("Offline", { status: 503 });
}
```

`Cache.put` rejects — it does not merely fail silently — in two situations that
reach real users: `QuotaExceededError` on a device at its storage limit (these are
multi-MB GLB/KTX2 binaries in a cache that deliberately survives version bumps),
and a `TypeError` for a `206 Partial Content` response, which is inside the
`response.ok` range. Either rejection was caught as a _network_ failure, so a
healthy `200` with its bytes already in hand was thrown away and the page was
answered with the previous scene, or with a bare `503 Offline` when nothing was
cached yet. A storage problem was indistinguishable from no connection.

Fix (`static/sw.js`): only the fetch stays in the offline `try`. The write happens
after, in its own `try`, and its failure changes nothing about the response —
the last good offline copy is kept and the live response is served. The write is
still `await`ed, deliberately: the worker can be terminated once `respondWith`
settles, and finishing the write is what makes the next offline load work.

## Defect 2 — offline 3D had its models and half its decoder runtime

The dedicated-cache rule listed `/draco/` and not `/basis/`. Those two are one
runtime, not two independent assets:
`src/lib/shared/3d/scene-boot/scene-asset-manifest.ts` declares them together as
`DECODER_RUNTIME_URLS` ("needed before the first byte of a model can be decoded",
warmed as a pair), `gltf-decoders.ts` attaches `useDraco("/draco/")` and
`useKtx2("/basis/")`, and every prototype world calls
`setTranscoderPath(absoluteAssetUrl("/basis/"))` — same-origin, resolved against
`location.href`, exactly like `/draco/`.

So offline a user had the GLBs cached, the geometry decoder cached, and the KTX2
texture transcoder network-only: a full model cache that could not decode a
texture. Fix: `/basis/` joins `/draco/` in the same `networkFirstDedicated` rule
(fresh online, last-known-good offline, its own cache that survives version bumps).

## Proof

### Measured — real Chromium, real service worker, real Cache Storage

`static/sw.js` was served verbatim from a minimal HTTPS origin on `tka.test`
(Chromium `--host-resolver-rules=MAP tka.test 127.0.0.1`, self-signed cert +
`--ignore-certificate-errors`, because the worker deliberately bypasses
`localhost`). The worker registered, reached `activated`, and controlled the page
in both runs. `/firebase-messaging-handler.js` was served as a no-op stub — the
same out-of-scope stub the repo's unit harness uses, and its gstatic
`importScripts` is not reachable from the sandbox. The network was cut with
Playwright's `context.setOffline(true)`. Both runs used a fresh browser profile.

`cacheState` is what Cache Storage actually held; `failedWrite.ranged` is a
`Range` request whose `206` makes the real browser's `Cache.put` reject, which
reproduces defect 1 without having to physically fill the device quota.

| observation                              | BEFORE (`origin/main`)                                        | AFTER (this branch)      |
| ---------------------------------------- | ------------------------------------------------------------- | ------------------------ |
| SW state                                 | `activated`, controlling                                      | `activated`, controlling |
| `/draco/draco_decoder.wasm` cached in    | `tka-3d-assets-v1`                                            | `tka-3d-assets-v1`       |
| `/basis/basis_transcoder.wasm` cached in | **`null`**                                                    | `tka-3d-assets-v1`       |
| `/draco/…` offline                       | `200 "DRACO-BYTES"`                                           | `200 "DRACO-BYTES"`      |
| `/basis/…` offline                       | **`TypeError: Failed to fetch`**                              | `200 "BASIS-BYTES"`      |
| ranged GLB after server flipped V1→V2    | **`200 "V1-BYTES"`** (stale full body, healthy 206 discarded) | `206 "V2-BY"`            |

### Mocked — project Vitest, real worker source

Three regression tests added to `tests/unit/sw-offline-behavior.test.ts`, using
the repo's existing `tests/helpers/sw-harness.ts` (which evaluates the real
`static/sw.js` against a fake CacheStorage and a routed fetch mock). `Cache.put`
is made to reject to stand in for a full device.

Before the `static/sw.js` change (tests written first, run against the unfixed
worker):

```
× still serves the fresh model when the cache write fails (quota)
    AssertionError: expected 'old forest' to be 'current forest'
× returns the fetched decoder when the cache write fails and nothing is cached
    AssertionError: expected 503 to be 200
× keeps the KTX2/Basis transcoder offline alongside the Draco decoder
    (dispatchFetch returned null — the SW never handled /basis/)
Tests  3 failed | 16 passed (19)
```

After:

```
tests/unit/sw-offline-behavior.test.ts (19 tests) — all passed
```

Whole closest suite, final state:

```
npx vitest run --config tests/config/vitest.config.ts \
  tests/unit/sw-offline-behavior.test.ts \
  tests/unit/offline-cache-orchestrator.test.ts \
  tests/unit/svg-precache-manifest.test.ts \
  src/lib/shared/offline/services/sw-update-manager.test.ts \
  tests/unit/capacitor-service-worker-contract.test.ts

Test Files  5 passed (5)
     Tests  60 passed (60)
```

Type and format gates on the changed files:

- `tsc --noEmit` on the changed test file: clean (verified the invocation really
  type-checks by feeding it a deliberate error, which it rejected).
- `prettier --check static/sw.js tests/unit/sw-offline-behavior.test.ts`: clean.
  The file was **already** prettier-dirty on `origin/main` in the same
  `describe("sw.js 3D asset freshness")` block this change extends, so
  `prettier --write` was run on that one owned file; the resulting diff is 8
  lines of pure formatting inside that block and nothing else.
- `eslint` ignores both paths by project config (reported as "File ignored").

### Not verified

- No production build, no `vite preview`, no `scripts/offline-sw-e2e.mjs` run:
  that script needs a full `build:fast` plus the local mkcert certificate, neither
  of which exists in this cloud container. The browser proof above covers the same
  runtime layer for the specific rules changed, but against a minimal origin, not
  the real app shell.
- No production rollout, no cache purge, no `CACHE_NAME` bump, no forced reload.
  A user's existing `tka-3d-assets-v1` cache is untouched; `/basis/` simply starts
  being cached on the next online 3D load.

## Risks

- `/basis/` now occupies the 3D asset cache: ~585 KB for the two transcoder files,
  on a cache that intentionally survives `CACHE_NAME` bumps. That is the same
  order as `/draco/` (~763 KB) already stored there, and it is network-first, so
  a three.js bump replaces it rather than pinning an old transcoder.
- Defect 1's fix changes what the page receives in exactly one situation: a
  successful network response whose cache write failed. It previously got stale
  bytes or a 503; it now gets the live response. Nothing else about the offline
  fallback ladder moved.
- `networkFirstDedicated` still `await`s the write, so a large GLB is fully
  buffered into the cache before the page sees the response. Left as-is
  deliberately — removing the `await` risks the write being cut short by worker
  termination, which is the behaviour the offline copy depends on.

## Follow-ups (not done, out of this assignment's scope)

1. **Latent "stale cleanup deletes a live cache".** `activate` deletes every cache
   whose name is not `CACHE_NAME`/`ASSETS_3D_CACHE`. Nothing else in the origin
   owns a cache today, so it is currently harmless — but any future
   `caches.open()` in app code is silently destroyed on the next SW activation.
   Worth an allowlist prefix (`tka-`) plus a comment at the `activate` handler.
2. **The new SW's install mutates the running SW's cache.** `CACHE_NAME` is a
   hand-edited constant, so a waiting (not yet activated) worker overwrites `/app`
   and the boot chunks in `tka-v3` while the old worker is still serving the old
   deploy from it. Going offline in that window can hand the old code a new shell
   pointing at chunk hashes it never cached. The real fix is a build-stamped cache
   name, which purges every user's cache on deploy — explicitly outside this
   assignment's "no cache purge" boundary and worth its own decision.
3. **SWR revalidation is not kept alive.** `staleWhileRevalidate` returns the
   cached copy and leaves the refresh fetch unprotected; the spec lets the browser
   terminate the worker once `respondWith` settles. Pictograph SVGs under
   `/images/` are not content-hashed, so a killed revalidation means stale art
   until the next `CACHE_NAME` bump. Standard fix is `event.waitUntil(fetchPromise)`
   (what Workbox's StaleWhileRevalidate does). Not included here because it cannot
   be _reproduced_ — only argued from the spec — and this assignment was scoped to
   reproduced defects.
4. **Unowned `/textures/*.ktx2` and `/basis/basis_transcoder.js` sibling paths.**
   `/basis/` as a prefix now covers the `.js` half too; `/textures/` remains
   network-only and is a 3D-domain sizing decision, not a SW-rule one.
5. **Promote the browser proof.** The throwaway Playwright script used above needs
   no production build and no mkcert cert (self-signed, `tka.test` host mapping),
   so it could become a CI-runnable companion to `scripts/offline-sw-e2e.mjs`.
   Deliberately not added to the repo here — new test infrastructure was not part
   of this assignment.

## Boundaries respected

IndexedDB libraries, the thumbnail engine/cache, auth, bootstrap imports and
navigation resolvers were read only where needed to establish ownership, and not
modified. `src/lib/shared/3d/**` was read as evidence for defect 2 and not
touched. No push to `main`, no deployment, no package release, no live-data write,
no machine configuration, no instruction-file change.
