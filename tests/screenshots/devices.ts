/**
 * Device Matrix & Route Definitions for Multi-Device Screenshot Testing
 *
 * 9 device presets covering phones, tablets, and desktops.
 * Route definitions for both public pages (no auth) and SPA modules (auth required).
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  CURRENT_MODULE_KEY,
  ACTIVE_TAB_KEY,
  MODULE_LAST_TABS_KEY,
} from "../../src/lib/shared/navigation/config/storage-keys";


export interface DevicePreset {
  slug: string;
  name: string;
  category: "phone" | "tablet" | "desktop";
  width: number;
  height: number;
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
}

export const DEVICES: DevicePreset[] = [
  // Phones
  {
    slug: "iphone-se",
    name: "iPhone SE",
    category: "phone",
    width: 375,
    height: 667,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  {
    slug: "iphone-16-pro",
    name: "iPhone 16 Pro",
    category: "phone",
    width: 393,
    height: 852,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  {
    slug: "iphone-16-pro-max",
    name: "iPhone 16 Pro Max",
    category: "phone",
    width: 430,
    height: 932,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  {
    slug: "galaxy-s24",
    name: "Galaxy S24",
    category: "phone",
    width: 360,
    height: 780,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  },
  {
    slug: "galaxy-s24-ultra",
    name: "Galaxy S24 Ultra",
    category: "phone",
    width: 412,
    height: 915,
    deviceScaleFactor: 3.5,
    isMobile: true,
    hasTouch: true,
  },
  // Tablets
  {
    slug: "ipad-mini",
    name: "iPad Mini",
    category: "tablet",
    width: 768,
    height: 1024,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  {
    slug: "ipad-air",
    name: "iPad Air",
    category: "tablet",
    width: 820,
    height: 1180,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  },
  // Desktops
  {
    slug: "desktop-hd",
    name: "Desktop HD",
    category: "desktop",
    width: 1366,
    height: 768,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
  {
    slug: "desktop-fhd",
    name: "Desktop FHD",
    category: "desktop",
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
  },
];


/**
 * Filter devices by category, slug, or mixed (comma-separated).
 * Supports: "phone", "tablet", "desktop", "iphone-se", "phone,ipad-mini"
 */
export function filterDevices(filter?: string): DevicePreset[] {
  if (!filter) return DEVICES;

  const validCategories = new Set(["phone", "tablet", "desktop"]);
  const parts = filter.split(",").map((s) => s.trim().toLowerCase());

  const matched: DevicePreset[] = [];
  for (const part of parts) {
    if (validCategories.has(part)) {
      matched.push(...DEVICES.filter((d) => d.category === part));
    } else {
      const bySlug = DEVICES.find((d) => d.slug === part);
      if (bySlug) matched.push(bySlug);
    }
  }

  // Deduplicate (in case "phone,iphone-se" would double-include)
  const seen = new Set<string>();
  return matched.filter((d) => {
    if (seen.has(d.slug)) return false;
    seen.add(d.slug);
    return true;
  });
}

/**
 * Create landscape variant of a device (swap width/height).
 */
export function toLandscape(device: DevicePreset): DevicePreset {
  return {
    ...device,
    slug: `${device.slug}-landscape`,
    name: `${device.name} (Landscape)`,
    width: device.height,
    height: device.width,
  };
}

// ─── Route Definitions ──────────────────────────────────────────────────────

export interface RouteConfig {
  path: string;
  label: string;
  requiresAuth: boolean;
  isModule: boolean;
  moduleId?: string;
  tabId?: string;
  /** CSS selector(s) to wait for before capturing. Comma-separated = any match. */
  waitSelector?: string;
  /**
   * localStorage entries seeded via addInitScript BEFORE navigation, so the app
   * boots into the desired state. Used to select the sequence-viewer surface
   * (tka-viewer-mode: animation | animation-3d | mandala | tunnel | split) the
   * same way open-tunnel-in-viewer / open-3d-scene do via persistViewerMode().
   */
  storageSeed?: Record<string, string>;
  /** Extra settle time (ms) after stabilization — for async-loading 3D scenes. */
  settleMs?: number;
}

export const PUBLIC_ROUTES: RouteConfig[] = [
  {
    path: "/landing",
    label: "landing",
    requiresAuth: false,
    isModule: false,
    waitSelector: ".landing-page",
  },
  {
    path: "/about",
    label: "about",
    requiresAuth: false,
    isModule: false,
    waitSelector: ".about-page",
  },
  {
    path: "/privacy",
    label: "privacy",
    requiresAuth: false,
    isModule: false,
    waitSelector: ".privacy-page",
  },
  {
    path: "/terms",
    label: "terms",
    requiresAuth: false,
    isModule: false,
    waitSelector: ".terms-page",
  },
  {
    path: "/history",
    label: "history",
    requiresAuth: false,
    isModule: false,
    waitSelector: ".playable-viewport .room-title",
  },
];

/**
 * 16-step public loop "CΨΩX" — the viewer showcase sequence, addressed by its
 * short code (library doc ids don't resolve on the standalone /sequence route;
 * short codes do, via shortCodeManager.resolveShortCode).
 */
const VIEWER_SEQUENCE_ID = "2LKS";

/**
 * 3D-viewer showcase state for the viewer--3d capture. A fresh profile defaults
 * to ONE performer with the "behind" camera — a closeup of a mannequin's back.
 * This seeds the 2x2 four-performer formation (petals effect) and the wide
 * elevated camera, plus the ocean environment (the showcase scene; the 3D
 * environment follows the app-wide backgroundType setting).
 */
const VIEWER_3D_PERFORMER = (x: number, z: number) => ({
  position: { x, z },
  facingAngle: 0,
  customLeftPlane: "wall",
  customRightPlane: "wall",
  name: null,
  settings: {
    prop: null,
    effortId: "linear",
    effect: "petals",
    staffLengthCm: null,
  },
});
const VIEWER_3D_SEED: Record<string, string> = {
  "tka-modern-web-settings": '{"backgroundType":"ocean"}',
  "tka-viewer3d-renderMode": "3d",
  "tka-viewer3d-cameraPreset": "main",
  "tka-viewer3d-activeFormation": "manual",
  "tka-viewer3d-selectedIndex": "null",
  "tka-viewer3d-performers": JSON.stringify([
    VIEWER_3D_PERFORMER(-1, 1),
    VIEWER_3D_PERFORMER(1, 1),
    VIEWER_3D_PERFORMER(-1, -1),
    VIEWER_3D_PERFORMER(1, -1),
  ]),
  "tka-viewer3d-camera": JSON.stringify({
    position: { x: 0, y: 4.73, z: -5.76 },
    rotation: { x: -2.579, y: 0, z: 3.1416 },
    fov: 50,
    target: { x: 0, y: 1.1, z: 0 },
    timestamp: 1786398618448,
  }),
};

export const APP_MODULES: RouteConfig[] = [
  // ── Create module ──────────────────────────────────────────────────────────
  {
    path: "/app",
    label: "create--construct",
    requiresAuth: true,
    isModule: true,
    moduleId: "create",
    tabId: "construct",
    waitSelector: ".option-picker, .option-grid",
  },
  {
    path: "/app",
    label: "create--generate",
    requiresAuth: true,
    isModule: true,
    moduleId: "create",
    tabId: "generate",
    waitSelector: ".generate-panel, .card-based-settings",
  },
  {
    path: "/app",
    label: "create--spell",
    requiresAuth: true,
    isModule: true,
    moduleId: "create",
    tabId: "spell",
    waitSelector: ".spell-panel",
  },
  {
    path: "/app",
    label: "create--assemble",
    requiresAuth: true,
    isModule: true,
    moduleId: "create",
    tabId: "assemble",
    waitSelector: ".assembler-tab",
  },
  {
    path: "/app",
    label: "create--fuse",
    requiresAuth: true,
    isModule: true,
    moduleId: "create",
    tabId: "fuse",
    waitSelector: ".fuse-workspace",
  },

  // ── Browse module ──────────────────────────────────────────────────────────
  {
    path: "/app",
    label: "browse--gallery",
    requiresAuth: true,
    isModule: true,
    moduleId: "browse",
    tabId: "gallery",
    waitSelector: ".sequence-card, .browse-grid",
    // The Browse module restores its own persisted nav history on mount and
    // overrides the URL tab (browse-navigation-state.svelte.ts restoreState).
    // The login flow visits /browse/library, so without this seed the gallery
    // capture lands on Library.
    storageSeed: {
      "tka-browse-nav-state": JSON.stringify({
        history: [{ tab: "gallery", view: "list" }],
        currentIndex: 0,
      }),
    },
  },
  {
    path: "/creators",
    label: "creators",
    requiresAuth: false,
    isModule: true,
    moduleId: "creators",
    waitSelector: ".creators-panel",
  },
  {
    path: "/app",
    label: "browse--collections",
    requiresAuth: true,
    isModule: true,
    moduleId: "browse",
    tabId: "collections",
    waitSelector: ".collections-browse-panel",
  },

  // ── Compose module ─────────────────────────────────────────────────────────
  {
    path: "/app",
    label: "compose--arrange",
    requiresAuth: true,
    isModule: true,
    moduleId: "compose",
    tabId: "arrange",
    waitSelector: ".animator-canvas, .playback-tab",
  },
  {
    path: "/app",
    label: "compose--browse",
    requiresAuth: true,
    isModule: true,
    moduleId: "compose",
    tabId: "browse",
    waitSelector: ".browse-tab",
  },

  // ── Learn module ───────────────────────────────────────────────────────────
  {
    path: "/app",
    label: "learn--concepts",
    requiresAuth: true,
    isModule: true,
    moduleId: "learn",
    tabId: "concepts",
    waitSelector: ".concept-card, .concepts-tab",
  },
  {
    path: "/app",
    label: "learn--play",
    requiresAuth: true,
    isModule: true,
    moduleId: "learn",
    tabId: "play",
    waitSelector: ".quiz-selector",
  },
  {
    // Tab id renamed codex → guide (Level 1 interactive textbook)
    path: "/app",
    label: "learn--guide",
    requiresAuth: true,
    isModule: true,
    moduleId: "learn",
    tabId: "guide",
    waitSelector: ".guide-tab, .codex-component",
  },

  // ── Sequence viewer (standalone route — the app's showcase surface) ────────
  // One strong 16-step public loop from the library; the storageSeed picks the
  // viewer surface exactly the way the app's own "open in viewer" services do.
  ...(["animation-3d", "tunnel", "mandala", "animation"] as const).map(
    (mode) => ({
      path: `/sequence/${VIEWER_SEQUENCE_ID}`,
      label: `viewer--${mode === "animation-3d" ? "3d" : mode}`,
      requiresAuth: true,
      isModule: false,
      storageSeed: {
        "tka-viewer-mode": mode,
        ...(mode === "animation-3d" ? VIEWER_3D_SEED : {}),
      },
      settleMs: mode === "animation-3d" ? 20_000 : 4_000,
      waitSelector:
        mode === "animation-3d"
          ? ".viewer-3d-canvas"
          : mode === "tunnel"
            ? ".tunnel-art"
            : mode === "mandala"
              ? ".mandala-stage"
              : ".animator-canvas, .animation-player",
    })
  ),

  // ── Train module ───────────────────────────────────────────────────────────
  {
    path: "/app",
    label: "train--practice",
    requiresAuth: true,
    isModule: true,
    moduleId: "train",
    tabId: "practice",
    waitSelector: ".practice-panel, .train-module",
  },

  // ── Settings module ────────────────────────────────────────────────────────
  {
    path: "/app",
    label: "settings--profile",
    requiresAuth: true,
    isModule: true,
    moduleId: "settings",
    tabId: "profile",
    waitSelector: ".profile-content",
  },
  {
    path: "/app",
    label: "settings--props",
    requiresAuth: true,
    isModule: true,
    moduleId: "settings",
    tabId: "props",
    waitSelector: ".prop-type-tab",
  },
  {
    path: "/app",
    label: "settings--display",
    requiresAuth: true,
    isModule: true,
    moduleId: "settings",
    tabId: "display",
    waitSelector: ".display-tab",
  },
  {
    path: "/app",
    label: "settings--visibility",
    requiresAuth: true,
    isModule: true,
    moduleId: "settings",
    tabId: "visibility",
    waitSelector: ".visibility-tab, .animation-panel",
  },
  {
    path: "/app",
    label: "settings--preferences",
    requiresAuth: true,
    isModule: true,
    moduleId: "settings",
    tabId: "preferences",
    waitSelector: ".preferences-tab",
  },

  // ── Feedback module ────────────────────────────────────────────────────────
  {
    path: "/app",
    label: "feedback--submit",
    requiresAuth: true,
    isModule: true,
    moduleId: "feedback",
    tabId: "submit",
    waitSelector: ".feedback-form",
  },
];

export const ALL_ROUTES: RouteConfig[] = [...PUBLIC_ROUTES, ...APP_MODULES];

// ─── Route Matching ─────────────────────────────────────────────────────────

/**
 * Filter routes by user-supplied patterns.
 * Matches against path, moduleId, label, or tabId.
 * Examples: "/landing", "browse", "create--generate", "settings"
 */
export function matchRoutes(
  routes: RouteConfig[],
  patterns: string[]
): RouteConfig[] {
  if (patterns.length === 0) return routes;

  return routes.filter((route) => {
    return patterns.some((pattern) => {
      const p = pattern.toLowerCase().replace(/^\//, "");
      return (
        route.path.toLowerCase().replace(/^\//, "") === p ||
        route.label.toLowerCase() === p ||
        route.label.toLowerCase().startsWith(p + "--") ||
        route.moduleId?.toLowerCase() === p ||
        route.tabId?.toLowerCase() === p
      );
    });
  });
}

// ─── Storage Keys ───────────────────────────────────────────────────────────
// Navigation keys imported directly from canonical source (zero duplication).
// Remaining keys validated at test time by validateStorageKeys().

export const STORAGE_KEYS = {
  CURRENT_MODULE: CURRENT_MODULE_KEY,
  ACTIVE_TAB: ACTIVE_TAB_KEY,
  MODULE_LAST_TABS: MODULE_LAST_TABS_KEY,
  LAST_SEEN_VERSION: "tka-last-seen-version",
  LANDING_DISMISSED: "tka-landing-dismissed",
  MODERN_SETTINGS: "tka-modern-web-settings",
} as const;

// ─── Storage Key Validation ─────────────────────────────────────────────────
// Keys that can't be imported directly (file has $lib imports or is scattered)
// are validated against the canonical source files at test time.

const __devicesFilename = fileURLToPath(import.meta.url);
const __devicesDir = dirname(__devicesFilename);
const PROJECT_ROOT = resolve(__devicesDir, "../..");

interface KeyCheck {
  key: keyof typeof STORAGE_KEYS;
  file: string;
  pattern: RegExp;
}

const KEY_CHECKS: KeyCheck[] = [
  {
    key: "LAST_SEEN_VERSION",
    file: "src/lib/shared/settings/state/whats-new-state.svelte.ts",
    pattern: /const\s+STORAGE_KEY\s*=\s*"([^"]+)"/,
  },
  {
    key: "MODERN_SETTINGS",
    file: "src/lib/shared/settings/state/settings-state.svelte.ts",
    pattern: /"(tka-modern-web-settings)"/,
  },
];

/**
 * Validate that non-imported STORAGE_KEYS values match their canonical app sources.
 * Call in test.beforeAll() to fail fast if keys drift.
 * Returns an array of mismatch descriptions (empty = all valid).
 */
export function validateStorageKeys(): string[] {
  const errors: string[] = [];

  for (const check of KEY_CHECKS) {
    const filePath = resolve(PROJECT_ROOT, check.file);
    let content: string;
    try {
      content = readFileSync(filePath, "utf8");
    } catch {
      errors.push(
        `Cannot read canonical source for ${check.key}: ${check.file}`
      );
      continue;
    }

    const match = content.match(check.pattern);
    if (!match) {
      errors.push(
        `Cannot find ${check.key} pattern in ${check.file} — source format may have changed`
      );
      continue;
    }

    const canonical = match[1];
    const local = STORAGE_KEYS[check.key];
    if (canonical !== local) {
      errors.push(
        `${check.key} drift: test has "${local}" but ${check.file} has "${canonical}"`
      );
    }
  }

  return errors;
}
