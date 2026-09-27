/**
 * Feature Registry — Compile-Time Feature Gate
 *
 * Single source of truth for which features are enabled in any given build.
 * This file runs at Vite config time (Node.js, not browser) and reads
 * process.env to determine the enabled set. A Vite plugin consumes these
 * exports to stub out disabled feature modules at resolve time.
 *
 * Tiers:
 *   core    — always enabled (create, browse, creators, feedback)
 *   shipped — enabled by default, can be disabled (none yet)
 *   dev     — enabled in dev mode, disabled in production builds
 *   off     — disabled in every build (dev + prod) until explicitly relit
 *
 * Environment overrides:
 *   BUILD_ALL=true          → enable all features
 *   BUILD_<UPPER_ID>=true   → enable a specific feature
 *   BUILD_<UPPER_ID>=false  → disable a specific feature (overrides dev mode)
 *   NODE_ENV !== "production" → all features enabled (dev mode)
 *   Production default: only core + shipped
 */

export type FeatureTier = "core" | "shipped" | "dev" | "off";

export interface FeatureDefinition {
  id: string;
  tier: FeatureTier;
  /** Module path prefixes whose imports are stubbed when the feature is disabled */
  modulePaths: string[];
  /** Route directory patterns excluded from the build when the feature is disabled */
  routePatterns?: string[];
  /** Empty these guarded page components in disabled production client builds. */
  emptyClientRouteComponents?: boolean;
}

// Feature definitions

export const FEATURES: FeatureDefinition[] = [
  // ── Core (always on) ──────────────────────────────────────────────────────
  {
    id: "create",
    tier: "core",
    modulePaths: ["features/create/"],
  },
  {
    id: "browse",
    tier: "core",
    modulePaths: ["features/browse/"],
  },
  {
    id: "creators",
    tier: "core",
    modulePaths: ["features/creators/"],
  },
  {
    id: "feedback",
    tier: "core",
    modulePaths: ["features/feedback/"],
  },

  // ── Shipped (user-facing modules, on by default in every build) ───────────
  // These reach real users on production (tkaflowarts.com). They MUST be in the
  // production bundle — if left in the `dev` tier the feature-gate plugin stubs
  // their entry component to `export default null`, which makes ModuleRenderer
  // render "Module \"<id>\" failed to load". (Regression fixed 2026-06-10: every
  // one of these was wrongly tier:"dev", so Cloudflare's NODE_ENV=production
  // build stubbed them all — settings, learn, compose, train, … were broken.)
  {
    id: "social",
    tier: "shipped",
    modulePaths: ["features/social/"],
  },
  {
    id: "learn",
    tier: "shipped",
    modulePaths: ["features/learn/"],
  },
  {
    // SHELVED: the Scribe paid tier is pulled from the app until there's a real
    // monetization plan. `off` hides it in EVERY build (dev + prod): nav module
    // filtered out, feature module stubbed, __FEATURE_PREMIUM__ === false. The
    // billing services (subscription-manager) + tier plumbing stay dormant in
    // the tree, so relighting is a one-line change: set tier back to "shipped"
    // (nav module + ProfileTab SubscriptionCard return together).
    id: "premium",
    tier: "off",
    modulePaths: ["features/premium/"],
  },
  {
    id: "compose",
    tier: "shipped",
    modulePaths: ["features/compose/"],
  },
  {
    id: "train",
    tier: "shipped",
    modulePaths: ["features/train/"],
  },
  {
    id: "choreo-card",
    tier: "shipped",
    modulePaths: ["features/choreo-card/"],
  },
  {
    id: "write",
    tier: "shipped",
    modulePaths: ["features/write/"],
  },
  {
    id: "arena",
    tier: "shipped",
    modulePaths: ["features/arena/"],
  },
  {
    id: "museum",
    tier: "shipped",
    modulePaths: ["features/museum/"],
  },
  {
    id: "festivals",
    tier: "shipped",
    modulePaths: ["features/festivals/"],
  },
  {
    id: "levels",
    tier: "shipped",
    modulePaths: ["features/levels/"],
  },
  {
    id: "hand-paths",
    tier: "shipped",
    modulePaths: ["features/hand-paths/"],
  },
  {
    id: "video",
    tier: "shipped",
    modulePaths: ["features/video/"],
  },
  {
    id: "stage",
    tier: "shipped",
    modulePaths: ["features/stage/"],
  },
  {
    id: "lab",
    tier: "shipped",
    modulePaths: ["features/lab/"],
  },
  {
    id: "tika",
    tier: "shipped",
    modulePaths: ["features/tika/"],
  },
  {
    id: "settings",
    tier: "shipped",
    modulePaths: ["features/settings/"],
  },
  {
    id: "connect",
    tier: "shipped",
    modulePaths: ["features/connect/"],
  },
  {
    id: "fuse",
    tier: "shipped",
    modulePaths: ["features/fuse/"],
  },
  {
    id: "assemble-lab",
    tier: "shipped",
    modulePaths: ["features/assemble-lab/"],
  },

  // ── Role-gated production tools ───────────────────────────────────────────
  // Admin and moderation are NOT dev experiments — they are live production
  // features for admin-role accounts. They MUST ship in every build so the
  // runtime gate can reveal them to authorized users on tkaflowarts.com.
  // Access is enforced at runtime, not compile time:
  //   - nav visibility: `adminOnly` + effectiveRole==="admin" (module-definitions)
  //   - /admin routes:  +layout.ts redirects non-admins to "/"
  //   - server:         Firestore rules + requireAdmin API guards
  // Leaving them tier:"dev" stripped them from production builds entirely
  // (__FEATURE_ADMIN__=false → removed from ENABLED_MODULE_DEFINITIONS), which
  // hid the Admin module from admins too. tier:"shipped" is the durable fix.
  {
    id: "admin",
    tier: "shipped",
    modulePaths: ["features/admin/"],
    routePatterns: ["src/routes/admin/"],
  },
  {
    id: "moderation",
    tier: "shipped",
    modulePaths: ["features/moderation/"],
  },

  // ── Dev (internal tools / experiments — off in prod unless opted in) ───────
  {
    id: "retro",
    tier: "dev",
    modulePaths: ["features/retro/"],
    routePatterns: [
      "src/routes/1989/",
      "src/routes/1995/",
      "src/routes/1998/",
      "src/routes/2003/",
    ],
    // 1989 and 1995 rendered blank in production only because the retro feature
    // module was stubbed; 1998 and 2003 shipped their real UI, since their pages
    // don't route through that module. Emptying the route components covers all
    // four the same way instead of relying on which page happens to import what.
    emptyClientRouteComponents: true,
  },
  {
    id: "coven",
    tier: "dev",
    // CovenStation is also the museum's telekinetic formation, so the shared
    // feature directory cannot be stubbed wholesale. Emptying the guarded
    // /coven route severs only the unfinished hub's import graph.
    modulePaths: [],
    routePatterns: ["src/routes/coven/"],
    emptyClientRouteComponents: true,
  },
  {
    id: "promo-generator",
    tier: "dev",
    modulePaths: ["features/promo-generator/"],
  },
  {
    id: "hall-of-shame",
    tier: "dev",
    modulePaths: ["features/hall-of-shame/"],
  },
  {
    id: "landing",
    tier: "shipped",
    modulePaths: ["features/landing/"],
  },
];

// Dev-only route patterns not tied to a specific feature

const DEV_ONLY_ROUTE_PATTERNS: string[] = [
  "src/routes/test/",
  "src/routes/(dev)/",
  "src/routes/demo/",
  "src/routes/render-pictographs/",
  "src/routes/grant-feature/",
  "src/routes/hall-of-shame/",
];

// `src/routes/embed/` deliberately does NOT appear above. It reads like a dev
// path, but /embed/spinner is outward-facing — third parties iframe it, and the
// page says so in its own header. It survived only because nothing consumed
// getDisabledRoutePatterns(); listing it was a latent bug waiting for someone to
// wire that function up. Verify a route is actually internal before adding it.

/**
 * Route trees whose page components are EMPTIED in the production client build.
 *
 * Every entry must have a load guard calling `guardInternalRoute()` (or an
 * equivalent redirect), because emptying alone would leave a blank page at a
 * reachable URL rather than sending the visitor somewhere real.
 *
 * `(public)/composer/auth-lab/` is listed explicitly: it is an auth design
 * harness parked under the public /composer namespace for layout reasons, so no
 * dev-path prefix covers it.
 */
const GUARDED_DEV_ROUTE_PATTERNS: string[] = [
  "src/routes/test/",
  "src/routes/(dev)/",
  "src/routes/demo/",
  "src/routes/render-pictographs/",
  "src/routes/grant-feature/",
  "src/routes/hall-of-shame/",
  "src/routes/(public)/composer/auth-lab/",
];

// Runtime helpers

const env = process.env;
const isProduction = env.NODE_ENV === "production";
const buildAll = env.BUILD_ALL === "true";
const devMode = !isProduction;

/**
 * Returns true when the feature with the given id should be included in this
 * build.
 *
 * Resolution order (first match wins):
 *   1. BUILD_ALL=true → enabled
 *   2. BUILD_<ID>=false → disabled (explicit opt-out, even in dev)
 *   3. BUILD_<ID>=true → enabled (explicit opt-in, even in production)
 *   4. tier === "core" → always enabled
 *   5. tier === "shipped" → enabled (by definition the default-on set)
 *   6. tier === "off" → disabled in every build (until relit)
 *   7. dev mode (NODE_ENV !== "production") → enabled
 *   8. tier === "dev" in production without an opt-in → disabled
 */
export function isFeatureEnabled(featureId: string): boolean {
  const envKey = `BUILD_${featureId.toUpperCase().replace(/-/g, "_")}`;

  if (buildAll) return true;

  // Explicit per-feature override takes priority over tier logic
  if (env[envKey] === "false") return false;
  if (env[envKey] === "true") return true;

  const feature = FEATURES.find((f) => f.id === featureId);
  if (!feature) return false;

  if (feature.tier === "core") return true;
  if (feature.tier === "shipped") return true;
  if (feature.tier === "off") return false;

  // dev tier: enabled when not in a production build
  return devMode;
}

/**
 * Returns the set of all enabled feature ids for the current build
 * configuration.
 */
export function getEnabledFeatures(): Set<string> {
  return new Set(
    FEATURES.filter((f) => isFeatureEnabled(f.id)).map((f) => f.id)
  );
}

/**
 * Returns the list of module path prefixes that belong to disabled features.
 * The Vite plugin uses these to stub out imports at resolve time.
 */
export function getDisabledFeatureModulePaths(): string[] {
  return FEATURES.filter((f) => !isFeatureEnabled(f.id)).flatMap(
    (f) => f.modulePaths
  );
}

/**
 * Shared render modules that are client-only by nature (WebGL / 2D canvas) and
 * never produce meaningful server HTML, yet still leak into the SSR `_worker.js`
 * bundle. They ride in through *runtime-conditional* dynamic imports (e.g. the
 * sequence viewer's lazy 3D pane, gated on `needs3D` — a runtime value, not the
 * statically-`false` `browser` flag) that Vite cannot prove dead on the server,
 * so it bundles the target chunk (Three.js + the entire 3D scene graph + GPU
 * effect renderers) into the Worker regardless. `shared/3d/` alone pulls Three
 * + threlte + every scene, which is what pushed the Worker past 25 MiB
 * (26.28 MiB, commit 756f9bb0a8, 2026-07-14).
 *
 * Stubbing their `.svelte` components in the SSR build is safe because WebGL /
 * canvas cannot render server-side — any public (SSR'd) page that mounts them
 * already does so client-only, so the server output is unchanged (an empty
 * placeholder that hydrates client-side) while the client build keeps them real.
 */
const SSR_STUBBED_SHARED_RENDER_PATHS: string[] = [
  "shared/3d/",
  "shared/animation-engine/",
];

/**
 * Lightweight feature-owned components that genuinely render on public SSR
 * routes. Their browser-only descendants still match the broader feature path
 * and remain stubbed, so these exceptions do not pull an app module into the
 * Cloudflare Worker.
 */
const SSR_RENDERED_FEATURE_COMPONENT_PATHS: string[] = [
  "features/learn/components/PublicConceptCourse.svelte",
];

/**
 * Module path prefixes to stub in the SSR / server (Cloudflare Pages Functions)
 * build.
 *
 * The app shell (`/[...appPath]`, `/app`) is CSR-only (`ssr = false`), so NO
 * feature module is ever rendered on the server — yet Vite still bundles every
 * dynamic-import target into `_worker.js`, which has a hard 25 MiB limit on
 * Cloudflare Pages. Shipping all user-facing modules to the client (correct)
 * pushed the server bundle past that limit and failed the deploy.
 *
 * Since these modules never execute server-side, we stub every non-core feature
 * module — plus the client-only shared render layers above — in the SSR build
 * while keeping them real in the client build. This returns the server bundle to
 * its known-good size AND reclaims the entire server-side compile of those
 * modules — the only legitimate build-time win available, since a module that
 * ships to users must still compile for the client. Core (create/browse/
 * creators/feedback) stays real in SSR to match the prior proven-good server
 * bundle and keep the public creator cards server-renderable.
 */
export function getSsrStubbedModulePaths(): string[] {
  return [
    ...FEATURES.filter((f) => f.tier !== "core").flatMap((f) => f.modulePaths),
    ...SSR_STUBBED_SHARED_RENDER_PATHS,
  ];
}

/** Exact feature-owned component paths that must remain callable during SSR. */
export function getSsrRenderedFeatureComponentPaths(): string[] {
  return [...SSR_RENDERED_FEATURE_COMPONENT_PATHS];
}

/**
 * Route trees that opt out of SSR. A tree's layout sets `ssr = false` for every
 * page in it; the other entries hold one page (plus its own helpers) whose
 * `+page.ts` sets it. tests/unit/ssr-emptied-routes.test.ts checks that every
 * page under each entry resolves to `ssr = false`.
 */
const SSR_DISABLED_ROUTE_PATHS: string[] = [
  "src/routes/test/",
  "src/routes/[...appPath]/",
  "src/routes/app/",
  "src/routes/admin/",
  "src/routes/(dev)/",
  "src/routes/demo/",
  "src/routes/1995/",
  "src/routes/1989/",
  "src/routes/1998/",
  "src/routes/2003/",
  "src/routes/coven/",
  "src/routes/endless-spinner/",
  "src/routes/hall-of-shame/",
  "src/routes/grant-feature/",
  "src/routes/render-pictographs/",
  "src/routes/tools/warm-thumbnails/",
  "src/routes/from/spiroanim/[cellKey]/",
  "src/routes/(public)/composer/auth-lab/",
  "src/routes/(public)/shop/success/",
];

/**
 * Route directory prefixes whose `.svelte` components are EMPTIED (not
 * resolve-stubbed) in the SSR build.
 *
 * Route components can't go through the resolve-time stub: SvelteKit's
 * build_server_nodes step looks every route component up in the Vite manifest
 * by filename, and a resolve-level replacement removes it from the manifest
 * ("Could not find file ... in Vite manifest"). Emptying the module source in
 * the `load` hook keeps the file in the manifest while dropping its entire
 * import graph.
 *
 * Routes that set `ssr = false` never render their components on the server,
 * yet SvelteKit still emits a server entry per route and Vite bundles it into
 * _worker.js. /test alone carried 1.28 MiB of entries plus test-only deps
 * (pdfjs-dist, pdf-lib, the 600 KB chosen-mandalas showcase data), which is
 * what tipped the Worker back over 25 MiB on 2026-07-18 (26.9 MiB, commit
 * 19de86ec38). Emptying them server-side is free: ssr=false means the
 * component is never rendered, and the client build keeps the real pages.
 *
 * Never list a route that renders on the server: its emptied component would
 * render blank. /embed, for example, inherits the root `ssr = true`.
 */
export function getSsrEmptiedRoutePaths(): string[] {
  return [...SSR_DISABLED_ROUTE_PATHS];
}

/**
 * npm packages to stub in the SSR / server build.
 *
 * These are browser-only heavyweights reached exclusively through dynamic
 * `import()` calls inside client-triggered flows (video export), but a dynamic
 * import is still a build-graph edge, so wrangler inlines the whole package
 * into `_worker.js`. Stubbing the bare specifier in the SSR build severs the
 * edge; the client build keeps the real package.
 *
 * Only list packages whose exports are never evaluated at module scope in
 * server-reachable code (dynamic-import-only consumers) — a stub that a server
 * code path actually calls would throw at runtime, not at build time.
 */
export function getSsrStubbedPackages(): string[] {
  return [
    // WASM H.264 encoder (~1 MiB minified) — WebCodecs fallback for the video
    // exporter. Dynamic-imported only in wasm-video-encoder.ts; never runs
    // server-side (needs canvas + workers).
    "h264-mp4-encoder",
  ];
}

/**
 * Returns the list of route directory patterns for disabled features, plus
 * dev-only route patterns when building for production.
 *
 * The Vite plugin uses these to exclude routes from the SvelteKit build.
 */
export function getDisabledRoutePatterns(): string[] {
  const featureRoutes = FEATURES.filter(
    (f) => !isFeatureEnabled(f.id) && f.routePatterns
  ).flatMap((f) => f.routePatterns as string[]);

  const devRoutes = isProduction && !buildAll ? DEV_ONLY_ROUTE_PATTERNS : [];

  return [...featureRoutes, ...devRoutes];
}

/**
 * Disabled route components that are safe to empty in the client bundle.
 * Every returned path must have a production load guard that redirects before
 * SvelteKit attempts to render its now-empty page component.
 */
export function getClientEmptiedRoutePaths(): string[] {
  const featureRoutes = FEATURES.filter(
    (feature) =>
      !isFeatureEnabled(feature.id) &&
      feature.emptyClientRouteComponents &&
      feature.routePatterns
  ).flatMap((feature) => feature.routePatterns as string[]);

  const devRoutes = isProduction && !buildAll ? GUARDED_DEV_ROUTE_PATTERNS : [];

  return [...featureRoutes, ...devRoutes];
}

/**
 * Returns a Vite `define`-compatible map for every dev- and off-tier feature.
 * Enabled features map to `"true"`, disabled to `"false"`.
 *
 * Example output (production build, no overrides):
 *   { "__FEATURE_MUSEUM__": "false", "__FEATURE_RETRO__": "false", ... }
 *
 * Core and shipped features are always enabled and are not included —
 * there is no need to guard them behind a compile-time constant.
 */
export function getEnabledFeaturesDefineMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const feature of FEATURES) {
    if (feature.tier === "dev" || feature.tier === "off") {
      const key = `__FEATURE_${feature.id.toUpperCase().replace(/-/g, "_")}__`;
      map[key] = isFeatureEnabled(feature.id) ? "true" : "false";
    }
  }
  return map;
}
