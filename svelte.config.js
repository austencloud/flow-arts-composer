import cloudflareAdapter from "@sveltejs/adapter-cloudflare";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";
import { shareCloudflareDevPlatform } from "./src/config/cloudflare-dev-platform.js";

// One Cloudflare platform emulator per dev process, shared by the burst of
// requests after a Vite restart and kept across restarts.
/** @param {import("@sveltejs/adapter-cloudflare").AdapterOptions} options */
const adapter = (options) =>
  shareCloudflareDevPlatform(cloudflareAdapter(options));

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess({ script: true }),

  kit: {
    adapter: adapter({
      routes: {
        include: ['/*'],
        exclude: [
          '/_app/immutable/*',
          '/_app/version.json',
          '/.well-known/*',
          '/animations/*',
          '/assets/*',
          '/audio/*',
          '/branding/*',
          '/data/*',
          '/fonts/*',
          '/gallery/*',
          '/guide/*',
          '/guides/*',
          '/images/*',
          '/models/*',
          '/pictographs/*',
          '/pwa/*',
          '/retro-eras/*',
          '/screenshots/*',
          '/sounds/*',
          '/textures/*',
          '/thumbnails/*',
          '/favicon.png',
          '/firebase-messaging-handler.js',
          '/firebase-messaging-sw.js',
          '/legacy-sw.js',
          '/manifest.webmanifest',
          '/og-default.png',
          '/sw.js',
          // Serve prerendered pages (landing, about, glossary, …) from the
          // static asset layer instead of waking the Worker — without this,
          // "/" returns cf-cache-status: DYNAMIC and pays ~1-2s Worker TTFB.
          // MUST stay LAST: Cloudflare caps _routes.json at 100 rules and the
          // adapter truncates overflow. Placed last, only tail-end prerendered
          // guide pages fall off (already covered by the /guide/* wildcard);
          // placed first, it would truncate the asset wildcards above and
          // route every static asset through the Worker.
          '<prerendered>',
        ]
      }
    }),

    // ============================================================================
    // PATH ALIASES (Clean domain-bounded architecture)
    // ============================================================================
    alias: {
      // Core aliases
      $lib: "./src/lib",
      "$lib/*": "./src/lib/*",
      // Guide editor library utilities. Aliased because TypeScript's bundler
      // module resolution mishandles parens in paths like "(public)" when
      // imported across the src/lib <-> src/routes boundary.
      "$guide-level-1": "./src/routes/(public)/guide/level-1",
      "$guide-level-1/*": "./src/routes/(public)/guide/level-1/*",
      // Component-test helpers (mirrors tests/config/vitest.components.config.ts).
      // Needed so svelte-check resolves the `$test-helpers/*` imports in the
      // *.svelte.test.ts files; without it `npm run check` reports 6 phantom
      // "Cannot find module" errors.
      "$test-helpers": "./tests/helpers",
      "$test-helpers/*": "./tests/helpers/*",
    },

    // ============================================================================
    // POSTHOG SESSION REPLAY FIX
    // ============================================================================
    // PostHog session replay requires absolute paths to properly record assets.
    // By default, Svelte uses relative paths during SSR which breaks replay.
    paths: {
      relative: false,
    },

    // ============================================================================
    // 2026: SECURITY & PERFORMANCE
    // ============================================================================
    // CSRF protection with origin checking is enabled by default
    // Use csrf.trustedOrigins to whitelist additional origins if needed

    // 2026: Preload critical modules for better performance
    prerender: {
      crawl: true,
      handleHttpError: ({ path, message, status }) => {
        // These generated or synced asset directories can be absent from a
        // clean CI checkout. Ignore only missing assets; a broken page or any
        // server error must still stop the build.
        if (
          status === 404 &&
          (path.startsWith("/pwa/") ||
            path.startsWith("/notation/letters/") ||
            path.startsWith("/thumbnails/") ||
            path.startsWith("/Explore_thumbnails/"))
        )
          return;
        throw new Error(message);
      },
      handleMissingId: ({ path, id }) => {
        // Guide nav renders section anchor links for the active chapter,
        // but placeholder pages don't have those section elements yet
        if (path.startsWith("/guide/level-1/")) return;
        // Archive record hashes are client-managed selection state. Rendering
        // matching DOM ids would trigger a native jump before hydration and
        // leave the viewport stranded inside the overflow-hidden archive.
        if (path === "/history" && id.startsWith("archive-record-")) return;
        // Atlas hashes select a category or term after hydration. They are URL
        // state, not scroll targets, so rendering matching ids would make the
        // browser jump inside the full-viewport workspace before Atlas can
        // restore the requested view.
        if (path === "/atlas") return;
        throw new Error(`Missing id "#${id}" on ${path}`);
      },
    },
  },

  // ============================================================================
  // SVELTE 5 COMPILER OPTIONS
  // ============================================================================
  compilerOptions: {
    warningFilter: (warning) => {
      if (warning.code === "state_referenced_locally") return false;
      return true;
    },
  },

  // ============================================================================
  // WARNING FILTER (Suppress intentional patterns)
  // ============================================================================
  // onwarn suppresses state_referenced_locally during builds (Vite plugin).
  // For svelte-check, these are either fixed with $derived/$effect or are
  // genuinely intentional one-time prop captures (let x = $state(initialProp)).
  onwarn: (warning, handler) => {
    if (warning.code === "state_referenced_locally") return;
    handler(warning);
  },
};

export default config;
