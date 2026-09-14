/**
 * Domain Config for TKA
 *
 * Single-domain architecture:
 * - tkaflowarts.com: Brand home, landing page, marketing content
 * - tkaflowarts.com/create, /browse, etc.: The app (module paths at root)
 * - Future: tkaflowarts.com/embed, tkaflowarts.com/kiosk, etc.
 */
import { Capacitor } from "@capacitor/core";

/**
 * Site mode determines which experience to render.
 * Extensible for future portals without breaking changes.
 */
export type SiteMode =
  | "loading"
  | "app"
  | "landing"
  | "embed"
  | "kiosk"
  | "edu";

// Landing/brand domain
export const LANDING_DOMAIN = "https://tkaflowarts.com";

// App base URL (same domain, modules at root paths)
export const APP_DOMAIN = "https://tkaflowarts.com";

/**
 * Detect site mode from current pathname.
 * Returns "app" when under /app, "landing" otherwise.
 * Supports ?mode= override for local dev testing.
 */
// Paths that are NOT the app - landing page and standalone public routes.
// Everything else (including module paths like /festivals/map) is app mode.
const LANDING_PATHS = new Set(["/", "/landing"]);

const PUBLIC_PATH_PREFIXES = [
  "/embed",
  "/q/",
  "/sequence/",
  "/profile/",
  "/demo",
  // Focused production-component review. It owns a bare layout and must not
  // boot module persistence, which would treat `/test` as an invalid app tab.
  "/test/smart-collections",
  "/test/sequence-actions",
  "/test/sequence-viewer-transitions",
  "/test/prop-size-audit",
  "/test/sidebar-props",
  "/test/environment-transition",
  "/test/film-director",
  "/test/prop-3d-studio",
  "/test/viewer-3d",
  // Museum floor-plan and 3D review surfaces also own their page chrome. Keep
  // them out of module persistence so direct review links are not rewritten to
  // the Create module after authentication initializes.
  "/test/museum-",
  "/store",
  "/shop",
  "/about",
  "/delete-account",
  // Exact pillar-page paths only. A bare "/learn" prefix would also catch the
  // Learn APP module (/learn/guide/*, served by the [...appPath] shell), which
  // then boots in landing mode — no Firebase, no auth listener — so signed-in
  // users see guest chips and popup sign-in completes with no UI reaction.
  // Any future (public)/learn/* pillar page gets its own exact entry here.
  "/learn/staff-spinning-choreography",
  // Canonical public course, including stable deep links to each lesson.
  "/learn/concepts",
  "/timing-and-direction",
  "/notation",
  // The archive lives at /history; /notation 301s to it and still serves
  // the per-prop and per-system notation pages.
  "/history",
  // Shape Engine graduated out of /notation/shape-matrix (which 301s here)
  // into its own standalone public destination.
  "/shape-engine",
  "/composer",
  "/atlas",
  "/faq",
  "/guide",
  "/privacy",
  // /roots redirects to /history (see routes/(public)/roots/+page.ts), but the
  // prefix stays so /roots/software still resolves in public/landing mode.
  "/roots",
  "/support",
  "/terms",
  "/1989",
  "/1995",
  "/1998",
  "/2003",
];

export function detectSiteMode(): SiteMode {
  if (typeof window !== "undefined") {
    const pathname = window.location.pathname;
    const isStandaloneDevHarness =
      import.meta.env.DEV &&
      pathname.startsWith("/test/") &&
      PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));

    // Native (Capacitor) apps always run in app mode — no landing page
    if (Capacitor.isNativePlatform()) return "app";

    // The Tauri desktop shell is native too. App mode is what runs
    // DesktopInitializer (boot into /create, reload-link interception, service
    // worker teardown, data seeding) — in landing mode the shell would sit on
    // the static landing page forever. Explicit dev harnesses are the exception:
    // they intentionally own their bootstrap, including when reviewed inside a
    // Tauri-hosted browser such as Codex's in-app browser.
    if ("__TAURI_INTERNALS__" in window && !isStandaloneDevHarness)
      return "app";

    const params = new URLSearchParams(window.location.search);
    const modeOverride = params.get("mode") as SiteMode | null;
    if (modeOverride && ["app", "landing"].includes(modeOverride)) {
      return modeOverride;
    }
    // Exact landing paths
    if (LANDING_PATHS.has(pathname)) {
      return "landing";
    }

    // Public routes that have their own bootstrap (no app shell)
    if (PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
      return "landing";
    }

    // Everything else is app mode (includes /app/*, /create/*, /festivals/*, etc.)
    return "app";
  }
  return "landing";
}

/**
 * Get the canonical URL for landing pages
 */
export function getLandingCanonicalURL(path: string = ""): string {
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  return cleanPath ? `${LANDING_DOMAIN}/${cleanPath}` : LANDING_DOMAIN;
}

/**
 * Get the canonical URL for app pages
 */
export function getAppCanonicalURL(path: string = ""): string {
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;
  return cleanPath ? `${APP_DOMAIN}/${cleanPath}` : APP_DOMAIN;
}

/**
 * Landing page SEO config
 */
export const LANDING_SEO_CONFIG = {
  siteName: "The Kinetic Alphabet",
  description:
    "The Kinetic Alphabet is a flow arts notation system for writing, animating, saving, and sharing choreography.",
  keywords:
    "flow arts notation, flow arts notation system, dual wielded props, staff notation, fan notation, club notation, TKA, The Kinetic Alphabet, TKA notation, TKA flow arts, prop notation, movement notation, flow arts software, flow arts choreography software",
  author: "Austen Cloud",
  language: "en",
  type: "website",
  social: {
    instagram: "@tkaflowarts",
    facebook: "@tkaflowarts",
    twitter: "@tkaflowarts",
  },
};

/**
 * App SEO config
 */
export const APP_SEO_CONFIG = {
  siteName: "Flow Arts Composer",
  description:
    "Build, animate, save, and share choreography with Flow Arts Composer, free flow arts software powered by The Kinetic Alphabet.",
  keywords:
    "Flow Arts Composer, TKA app, TKA flow arts, flow arts app, sequence creator, staff choreography, club manipulation, fan spinning, buugeng patterns, flow arts software, flow arts choreography software",
  author: "Austen Cloud",
  language: "en",
  type: "website",
};
