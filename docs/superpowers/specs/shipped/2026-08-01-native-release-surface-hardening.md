---
status: shipped
value: 4
effort: M
remaining: 'None. Shipped in 685f9a2023, verified end-to-end 2026-08-02: 35 focused unit tests pass, `npm run check` 0 errors, production `npm run build` succeeds with the gate firing on both passes, and `scripts/verify-native-release-surface.mjs` clears 1141 built JS assets. Build-artifact proof: the /coven client node folds to `function l(t){}` + an unconditional 307 to /browse/gallery, and /test/* nodes fold to a 69-byte empty component under the same guard. Live production preview redirected both /coven?seq= and /test/* to /browse/gallery. The review account needs no migration — the invalid username exists nowhere in Firestore (dry run reports changed:false).'
depends_on: ""
plan_path: ""
tags: [security, build, native, capacitor, release-gating]
last_triaged: 2026-08-02
shipped: 2026-08-02
---
# Native Release Surface Hardening

**Status:** Shipped 2026-08-02 in `685f9a202` (_fix(release): gate internal
native surfaces_). The body header previously still read "Approved for
implementation on 2026-08-01" while this file's own frontmatter already carried
`status: shipped` / `shipped: 2026-08-02`; corrected 2026-09-13 during spec
reconciliation.

**Reconciliation evidence (2026-09-13):** `src/config/feature-flags.ts:216`
declares the `coven` dev feature with `routePatterns: ["src/routes/coven/"]`;
`src/config/vite-plugin-feature-gate.ts` carries the client-build emptying pass
(`685f9a202`); `scripts/verify-native-release-surface.mjs` is present and wired
into `npm run build:native`.

## Incident

The production sequence viewer exposed **View in coven hub** for every saved
sequence. The link opened `/coven`, an unfinished 3D route with no release gate.
The same implementation was present in the Android web assets.

The production client bundle also retained `/test/*` page implementations even
though the feature registry already classified those routes as development-only.
`getDisabledRoutePatterns()` existed, but the Vite feature-gate plugin never
consumed it for the client build.

## Outcome

Production and native builds must fail closed:

- Coven remains available in the Vite development server and in an explicit
  `BUILD_COVEN=true` build.
- Ordinary production builds do not show the Coven viewer action.
- Direct production navigation to `/coven` redirects to Browse before the page
  renders.
- Direct production navigation to `/test/*` redirects to Browse before a test
  page renders.
- Disabled route components are emptied during the production client build so
  their implementation graphs are not shipped in web or Capacitor assets.
- The Android workflow verifies the release surface after the web build and
  before Capacitor sync.
- The legacy Google review account no longer emits username-validation
  exceptions during authentication.

## Existing Architecture to Extend

No new routing or feature-flag system is needed.

- `src/config/feature-flags.ts` owns build tiers, module paths, and route paths.
- `src/config/vite-plugin-feature-gate.ts` already stubs disabled feature
  components and empties selected SSR route components.
- SvelteKit universal load functions and `redirect()` provide the direct-route
  guard.
- `scripts/lib/firestore-provider.js` provides the established dry-run and
  Admin SDK migration path.
- `scripts/lib/native-push-deploy-core.mjs` is the existing home for pure native
  artifact checks.

The implementation extends those seams. It does not introduce another router,
menu, feature registry, or Firebase bootstrap.

## Design

### Coven build flag

Add `coven` as a `dev` feature with:

- no module-wide stub because the museum reuses `CovenStation`
- route path `src/routes/coven/`
- compile-time constant `__FEATURE_COVEN__`

The shared viewer menu includes the action only when the constant is true. The
route load function uses the same constant and redirects to `/browse/gallery`
when false. This keeps the link, route, and bundle controlled by one decision.

### Disabled client routes

During a production client build, the existing Vite plugin receives guarded
disabled route patterns as its list of components to empty. The initial guarded
set is `/coven` and `/test/*`. Emptying keeps SvelteKit's required route node in
its manifest while severing the page's component import graph.

The route manifest may still name `/coven` or `/test/*`; those nodes contain no
page implementation and their load guards redirect. The release invariant is
that disabled implementation modules and navigation affordances are absent,
not that SvelteKit's generated matcher forgets the pathname.

### Native artifact gate

Add a pure directory scanner beside the existing native ZIP checks. It reports
forbidden production markers found in generated JavaScript. A small command
uses it against `.svelte-kit/cloudflare` and fails on:

- `View in coven hub`
- the `/coven?seq=` navigation target
- Coven page implementation markers that are not shared by the museum

The Android workflow runs the command immediately after `pnpm run build`.
Focused unit tests cover detection, clean output, and missing-build failures.

### Review-account repair

Do not edit `user-document-manager.ts` while another session owns changes in
that file. Add a single-account, dry-run-first migration for Firebase UID
`Tv39DzbAy9O9BZeH5QHmithJ2gC2`.

The migration transaction:

1. verifies the current username is exactly `tkascribe.review_7949`;
2. verifies `tkascribereview7949` is unclaimed or already belongs to the same
   UID;
3. writes the valid username and lowercase field to the user document;
4. creates the valid username claim; and
5. removes the obsolete invalid claim only when it belongs to the same UID.

Apply requires both `TKA_ADMIN=1` and `--apply`. A second run must report that
the account is already repaired and perform no writes.

## Verification

1. Focused unit tests for feature definitions, route guards, client route
   emptying, artifact marker detection, and username repair planning.
2. One full `pnpm run check` captured to a log.
3. One production `pnpm run build`.
4. Run the native release-surface verifier against the built Cloudflare assets.
5. Sync/build the Android artifact when the machine resource gate permits, then
   scan the packaged web assets for the same forbidden markers.
6. In Chrome, verify the development build still shows the Coven action and a
   production preview does not. Direct production `/coven` and `/test/*` loads
   must land on Browse.
7. Run the account migration in dry-run, apply it, run it again, and read the
   resulting Firestore documents to prove the repair is idempotent.

## Follow-up: the rest of the internal surface (2026-08-03)

Verifying this spec raised the obvious question — whether everything the public
should not see was actually gated. It was not. Only `/coven` and `/test/*` ever
were; a full audit of the built client bundle found eleven more reachable
internal routes, plus a leak class no route mechanism can reach.

Now guarded (emptied component + `guardInternalRoute()` redirect):
`/video-collab-demo` (15.9 KB, and 500ing on the public web), `/grant-feature`,
`/composer/auth-lab`, `/render-pictographs`, `/demo/*`, `/hall-of-shame`, and
the four retro routes `/1989` `/1995` `/1998` `/2003`.

`/1989` and `/1995` had rendered blank in production, but only because the
`retro` feature module was stubbed — `/1998` and `/2003` shipped their real UI.
Relying on which page happens to import a gated module is not a gate, so all
four now go through `emptyClientRouteComponents`.

**`src/routes/embed/` was removed from `DEV_ONLY_ROUTE_PATTERNS`.** It reads
like a dev path, but `/embed/spinner` is outward-facing — third parties iframe
it, and the page says so. It survived only because nothing consumed
`getDisabledRoutePatterns()`; listing it was a latent bug waiting for someone to
wire that function up. A test now asserts it stays out of every internal list.

**Static files are a separate leak class.** `static/` copies verbatim into the
deploy output, so 32 internal design mockups were live at
`tkaflowarts.com/sketches/`, along with `element-icons-preview.html`. No feature
flag or load guard can reach them. They are dropped in
`scripts/trim-deploy-assets.js`, which preserves the documented
`localhost:5173/sketches/` review workflow (Vite serves `static/` in dev) while
keeping them out of production.

Verified 2026-08-03: 47 unit tests; `npm run check` clean; production build
empties 12 route paths; the shared guard chunk folds to `function t(){r(307,e)}`
— unconditional; a real browser confirms all 13 guarded routes land on
`/browse/gallery` while `/embed/spinner` still serves; and a static server over
the build output 404s the sketches while `/about.html` still resolves.

## Risks

- Emptying route components too broadly could blank a shipped route. Only
  registry-declared disabled patterns are consumed, and tests assert the exact
  production list.
- A build override could expose Coven intentionally. `BUILD_COVEN=true` is the
  explicit preview mechanism and is never set in the Android release workflow.
- Username repair could steal another user's claim. The transaction refuses to
  write when the destination claim belongs to a different UID or when the
  source profile has drifted from the expected legacy value.
