/**
 * Landing Events
 *
 * Typed `captureEvent` wrappers for the public marketing surfaces — site
 * chrome, the homepage launchpad, and the /composer landing.
 *
 * Why this is separate from `posthog-activity-logger`: that logger is the
 * in-app activity vocabulary. It gates every name against the closed
 * `ActivityEventType` union and remaps a fixed `ActivityMetadata` shape built
 * around sequences, lessons, and modules. Landing surfaces are pre-auth and
 * pre-app-shell — visitors are anonymous, there is no module context, and the
 * properties that matter (cta location, tile id, demo action) have nothing to
 * do with that vocabulary. Forcing marketing events through it would mean
 * polluting the app's event union with names no in-app code ever fires. So
 * these go straight to `captureEvent`, which is where the logger ends up
 * anyway.
 *
 * Every function inherits `captureEvent`'s hard dev gate
 * (`!browser || !initialized || import.meta.env.DEV`). These are deliberate
 * no-ops on localhost — don't add per-function guards, don't work around it.
 *
 * Lives under `$lib` rather than `src/routes/landing/` because the components
 * that fire these (`LaunchpadTile`, `HomeHero`, `SiteHeader`) are themselves
 * lib components, and lib must not import from routes.
 *
 * Spec: docs/architecture/landing-analytics-taxonomy.md
 */

import { withRoute } from "$lib/shared/analytics/analytics-context";
/**
 * Marketing chrome lives in the root layout, including on routes that never
 * render it. Keep its recorder behind the event boundary so importing a typed
 * wrapper does not put the PostHog SDK on every route's hydration path.
 */
function captureLandingEvent(
  eventName: string,
  properties?: Record<string, unknown>
): void {
  void import("$lib/shared/analytics/services/posthog")
    .then(async ({ captureWhenReady, initPostHog }) => {
      captureWhenReady(eventName, properties);
      await initPostHog();
    })
    .catch((error) =>
      console.warn(`[landing analytics] ${eventName} failed:`, error)
    );
}

// --- Section scroll tracking (deduplicated) ---

/**
 * Deduped on the section/page PAIR, not the bare section key. This Set never
 * resets for the life of the tab, so within one SPA session a section named
 * "hero" on the homepage would otherwise swallow "hero" on /composer.
 */
const viewedSections = new Set<string>();

export function trackSectionView(section: string, page: string): void {
  const key = `${page}::${section}`;
  if (viewedSections.has(key)) return;
  viewedSections.add(key);
  captureLandingEvent("landing_scroll_section", { section, page });
}

// --- CTA clicks ---

export type CtaLocation =
  | "hero"
  | "viewer_3d"
  | "section"
  | "footer"
  | "header_desktop"
  | "header_mobile";

export function trackCtaClick(
  location: CtaLocation,
  props?: {
    platform?: string;
    cta_type?: string;
    page?: string;
    destination?: string;
  }
): void {
  captureLandingEvent("landing_cta_click", withRoute({ location, ...props }));
}

// --- Demo interactions ---

export type DemoAction =
  | "try_another"
  | "change_prop"
  | "toggle_dark_mode"
  | "toggle_play";

export function trackDemoInteraction(
  action: DemoAction,
  props?: { prop_type?: string; is_playing?: boolean; page?: string }
): void {
  captureLandingEvent("landing_demo_interact", withRoute({ action, ...props }));
}

export function trackDemoVisible(): void {
  captureLandingEvent("landing_demo_visible");
}

// --- Homepage launchpad ---

/** The six production tiles. Stable ids, never the tile's display copy. */
export type LaunchpadTileId =
  | "composer"
  | "choreo-cards"
  | "guide"
  | "notation"
  | "faq"
  | "glossary";

/**
 * One event for tiles, their inline chips, and the strip links below them, so
 * the whole launchpad charts as a single breakdown instead of three series
 * nobody remembers to compare.
 */
export function trackLaunchpadClick(props: {
  target: "tile" | "chip" | "strip";
  tile_id?: LaunchpadTileId | null;
  chip_id?: string | null;
  strip_id?: string | null;
}): void {
  captureLandingEvent("landing_launchpad_click", withRoute({ ...props }));
}

// --- Video ---

export function trackVideoPlay(videoIndex: number): void {
  captureLandingEvent("landing_video_play", { video_index: videoIndex });
}

// --- Background picker ---

export function trackBackgroundChange(backgroundType: string): void {
  captureLandingEvent("landing_background_change", {
    background_type: backgroundType,
  });
}

// --- Outbound links ---

export function trackOutboundClick(
  destination: string,
  location: string
): void {
  captureLandingEvent("landing_outbound_click", { destination, location });
}
