# Desktop Bridge Reliability — Opus Batch 2026-09-12

Scope: `src/lib/shared/desktop/**` plus its unit tests. Two reproduced
lifecycle / error-propagation defects investigated and fixed; the rest of the
trace is recorded read-only below.

|           |                                                             |
| --------- | ----------------------------------------------------------- |
| Base SHA  | `6e4c1b5a388625d9c95f92e9a717f8ca2ab77f20` (`origin/main`)  |
| Final SHA | `e2914629fbb7c1c89844b2f0e13cb8eaff8d7374`                  |
| Branch    | `claude/desktop-bridge-reliability-6agfgs`                  |
| Checkout  | isolated cloud container (Linux); no native desktop runtime |

## Owned files

Changed:

- `src/lib/shared/desktop/tauri-auth-bridge.ts`
- `src/lib/shared/desktop/desktop-asset-runtime.ts`
- `tests/unit/desktop-oauth-bridge.test.ts` (new)
- `tests/unit/desktop-asset-runtime.test.ts` (new)
- `docs/reports/opus-batch-2026-09-12/desktop-bridge-reliability.md` (this file)

Read but deliberately **not** changed: `desktop-initializer.ts`,
`desktop-data-seeder.ts`, `desktop-asset-url.ts`, `is-desktop.ts`,
`get-desktop-initializer.ts`, `src-tauri/src/*.rs`,
`src-tauri/capabilities/default.json`, `src/routes/+layout.svelte`,
`src/config/domains.ts`, `src/lib/shared/auth/services/authenticator.ts`.

## How the bridge is actually consumed

Traced from every importer of `$lib/shared/desktop/*` (`rg` over `src`,
`tests`, `scripts`, `packages`, `apps`):

- **Detection.** `isDesktop()` = `browser && "__TAURI_INTERNALS__" in window`.
  `src/config/domains.ts:detectSiteMode()` repeats that same check inline (with
  a comment explaining why) so the Tauri shell boots in `app` mode; that is what
  makes `+layout.svelte:initAppMode()` — and therefore `DesktopInitializer` —
  run at all. Other consumers: `auth/services/authenticator.ts` (×3),
  `auth/services/anonymous-upgrade.ts`, `auth/state/auth-state.svelte.ts`,
  `browse/services/public-sequences-loader.ts`,
  `3d/scene-boot/scene-prefetch.ts`.
- **Asset bundle.** `+layout.svelte:516` **awaits**
  `installDesktopAssetRuntime()`. `resolveDesktopAssetUrl()` has one product
  consumer, `3d/constants/r2-cdn.ts:characterThumbnailUrl()` (`<img>` never
  passes through three.js's loading manager).
- **OAuth bridge.** `desktopGoogleCredential()` has four live consumers —
  sign-in, account link, reauthenticate (`authenticator.ts`) and
  `anonymous-upgrade.ts` — each reached only behind an `isDesktop()` gate.

## Defect 1 — OAuth bridge leaked its listener and timer when the launch failed

**File:** `src/lib/shared/desktop/tauri-auth-bridge.ts`
**Commit:** `5a8c07e4`

`desktopGoogleCredential()` registered a global `oauth-callback` subscription
and a 120 s timeout timer, then called `open(authUrl)` **outside** the
`try`/`finally` that disposed the subscription:

```ts
const unlisten = await listen<{ id_token: string }>("oauth-callback", …);
await open(authUrl.toString());          // ← outside the try
try { … } finally { unlisten(); }
```

When `open()` rejects — a shell-plugin refusal, or no default browser handler —
the function throws with both still live:

1. `unlisten()` never runs. `oauth-callback` is a **global** Tauri event, so the
   orphaned handler stays subscribed and resolves on a _later_ sign-in
   attempt's callback.
2. `clearTimeout` only ran inside the event callback, so the timer survives and
   two minutes later rejects `tokenPromise` — which nobody is awaiting any more.
   That surfaces in the WebView as an unhandled promise rejection.

Each failed attempt adds another pair.

**Fix.** `open()` moved inside the `try`; the `finally` now clears the timer as
well as the subscription; the timer is registered only _after_ `listen()`
resolves (a failed `listen()` then has nothing to clean up); and `tokenPromise`
carries a swallow handler so a late rejection can never escape unhandled. The
120 s budget is unchanged, now named `OAUTH_TIMEOUT_MS`.

## Defect 2 — asset-bundle install could reject, or never settle, during boot

**File:** `src/lib/shared/desktop/desktop-asset-runtime.ts`
**Commit:** `e2914629`

`installDesktopAssetRuntime()` documents "Resolves `true` when the bundle is
live, `false` on the web or when the desktop build carries no bundle", and
`+layout.svelte:516` **awaits** it. Everything later in `initAppMode()` queues
behind that await — including `getDesktopInitializer().initialize()`, which is
what performs `goto("/create")` to move the shell off the marketing landing,
intercepts `data-sveltekit-reload` links, tears down stale service workers and
seeds the bundled data. Three ways the promise broke that contract:

1. **It could reject.** Only an HTTP status was handled (`!response.ok`). An
   unregistered or refused custom scheme makes `fetch` _reject_, not answer;
   `@tauri-apps/api/core` failing to import rejects too. Worse, the rejection
   was cached in the module-level `installing` guard (`installing ??= install()`),
   so every later call re-threw the same rejection and nothing could retry.
2. **A malformed manifest threw.** `manifest.files.map(…)` on a body without
   `files`, and `manifest.totalBytes / …` `.toFixed()` in the success log on a
   body without `totalBytes`.
3. **The manifest read had no time bound.** A scheme handler that accepts the
   request and never answers leaves the promise permanently pending, and the
   awaiting boot with it. The adjacent updater already treats this class of
   hazard as load-bearing ("Offline or captive networks must not hold the
   desktop boot hostage", `desktop-initializer.ts:98`) and passes
   `check({ timeout: 5000 })`; this path had nothing.

**Fix.** `install()` is now a never-rejecting wrapper around `installBundle()`
that warns and returns `false`. The manifest read runs under a 5 s bound
(`MANIFEST_TIMEOUT_MS`, matching the updater's budget) implemented as an
`AbortController` — which cancels the in-flight read so a stalled handler does
not hold a connection — raced against a timer, so the bound holds regardless of
how the request behaves. The manifest shape is validated before use, and the
success log sums the files actually indexed rather than trusting the manifest's
own summary fields. Falling back to network asset loading was already the
documented behaviour for a build with no bundle; it is now equally the
behaviour for a bundle that cannot be read.

## Verification

Project config throughout: `vitest run --config tests/config/vitest.config.ts`
(jsdom, `pool: "forks"`). Before/after was measured by restoring the pre-fix
source with `git show` against the final test files.

| Suite                                      | Before fix         | After fix    |
| ------------------------------------------ | ------------------ | ------------ |
| `tests/unit/desktop-oauth-bridge.test.ts`  | 1 failed, 4 passed | **5 passed** |
| `tests/unit/desktop-asset-runtime.test.ts` | 3 failed, 4 passed | **7 passed** |

The single pre-fix OAuth failure is the disposal assertion —
`AssertionError: expected "vi.fn()" to be called 1 times, but got 0 times`
(`unlisten` after a failed `open()`). The three pre-fix asset-runtime failures
are exactly the three sub-defects: `promise rejected "TypeError: Failed to
fetch" instead of resolving`, `promise rejected "TypeError: Cannot read
properties of undefined (reading 'map')" instead of resolving`, and
`expected Symbol(never settled) to be false` (the unbounded read). The
remaining tests in each file pass both before and after — they are the
regression guard for behaviour that was already correct.

Neighbouring suites, run together after the change:

- `tests/unit/desktop-asset-url.test.ts`, `tests/unit/desktop-gallery-seed.test.ts`,
  `tests/unit/desktop-asset-bundle.test.js`,
  `tests/unit/desktop-sequence-bundle.test.js`, `tests/unit/auth/**` →
  **45 files, 272 tests, all passing.**
  (Two of those files fail in a fresh checkout with
  `Failed to resolve entry for package "@tka/tka-types"` until
  `npm run build:packages` has run once. Environmental, unrelated to this
  change; they pass after the workspace build.)
- `npm run check:tsc` (plain-`tsc` gate over `src/` and `tests/`) → no
  diagnostics in any owned file. It reports one pre-existing owned error,
  `src/lib/features/community/get-geocoding-service.ts(4,10): TS2305 Module
"$env/static/public" has no exported member 'PUBLIC_GOOGLE_MAPS_API_KEY'` —
  a missing env value in this credential-less cloud checkout, untouched by this
  work.
- `npx eslint` on the four changed files → 0 errors (the two test files are
  outside the ESLint project's include set and are reported as ignored).
- `npx prettier --check` → `desktop-asset-runtime.ts` and both new test files
  are clean. `tauri-auth-bridge.ts` is not, and was not before: the whole file
  is tab-indented against a spaces config. Reformatting it would be a
  whole-file diff outside this task, so the edit matches the file's existing
  style instead.

### Measured / mocked / inferred

- **Measured:** every table row above, on this checkout, with the project
  vitest config.
- **Mocked:** all Tauri surfaces (`@tauri-apps/api/core`,
  `@tauri-apps/api/event`, `@tauri-apps/plugin-shell`), `three`, `firebase/auth`
  and `fetch`. The tests prove the bridge's own lifecycle logic against the
  documented plugin / `fetch` / `AbortSignal` contracts.
- **Not validated:** **nothing here ran against a native desktop runtime.** No
  Tauri build, no WebView2/WKWebView/WebKitGTK, no real `tka-assets` scheme, no
  real loopback OAuth round trip. Specifically unverified in a real shell:
  that a refused `shell.open` rejects the way the mock does; that the custom
  scheme's failure mode is a rejection rather than a status; and that the
  WebView's `fetch` honours `AbortSignal` (the race makes the 5 s bound hold
  even if it does not, but the _cancellation_ half depends on it).
- **Inferred, not reproduced:** the severity framing of defect 2 — that a
  stalled manifest read delays `DesktopInitializer` and leaves the shell on the
  marketing landing — is read from the `await` at `+layout.svelte:516` and the
  code that follows it, not observed in a running app.

## Risks

- The 5 s manifest bound is a new failure mode by construction: a genuinely
  slow disk read that now exceeds 5 s silently degrades that launch to network
  asset loading instead of blocking. The bundle manifest is a local file read
  documented as "single-digit milliseconds", so 5 s is ~1000× headroom, and the
  degraded path is the one the web already takes.
- Fail-soft hides real breakage behind a `console.warn`. A desktop build that
  ships a broken bundle will now look like a build with no bundle. Mitigated by
  distinct warning strings per cause (timeout / HTTP status / malformed /
  thrown).
- The OAuth change alters _only_ disposal ordering. No change to the auth flow,
  the token, the nonce, scopes, or any capability grant.
- No native permissions, security policy, Rust source, updater/deployment
  tooling, port handling, filesystem deletion, machine configuration or app
  bootstrap was touched.

## Followups (read-only findings, not fixed here)

1. **`start_oauth_server` leaks a socket and a thread per attempt.**
   `src-tauri/src/oauth_server.rs` spawns a thread blocked on
   `listener.incoming()`; its `done` flag is only read at the _top_ of the next
   iteration, so after a successful token the thread stays blocked in `accept()`
   forever, and an abandoned attempt leaks the listener for the process
   lifetime. Every `desktopGoogleCredential()` call binds a fresh ephemeral
   port. Native + ports, both excluded from this assignment.
2. **The OAuth `nonce` is generated but never verified** against the returned
   `id_token` (`tauri-auth-bridge.ts:24`). Security policy, excluded here;
   worth a deliberate decision.
3. **No concurrency guard on `desktopGoogleCredential()`.** Two clicks on
   "Sign in with Google" start two loopback servers, open two browser tabs and
   register two global listeners; both resolve from whichever callback lands
   first. A single-flight guard belongs in the bridge, but it is a behaviour
   change rather than a reproduced defect, so it is left for a decision.
4. **`DesktopInitializer.initialize()` has no idempotence guard.** It is safe
   today only because `+layout.svelte` gates the landing→app upgrade behind
   `appModeUpgradeStarted`. A second call would register a second
   `data-sveltekit-reload` click interceptor (double `goto`) and re-run seeding.
   The fix touches app bootstrap, which is another assignment's domain.
5. **`initUpdater()` awaits `update.downloadAndInstall()` inside
   `Promise.all`**, so `initialize()` does not resolve until a full update
   download finishes. Harmless today because nothing awaits `initialize()` —
   `dataSeeded` is deliberately a separate promise — but it makes
   `initialize()`'s resolution meaningless as a readiness signal.
6. **`_resetDesktopAssetRuntimeForTests()` restores a _bound copy_ of
   `window.fetch`, not the original reference**, and does not clear
   `DefaultLoadingManager`'s URL modifier. Test-helper fidelity only; the new
   test asserts the behaviour (no rewriting after teardown) rather than the
   identity.
7. **`createDesktopFetch`'s `new Request(resolved, input)`** would need
   `duplex: "half"` for a streaming request body. Unreachable today — only
   bundled asset paths get rewritten, and those are GET/HEAD — but it is a trap
   if the bundle ever covers a POST target.
