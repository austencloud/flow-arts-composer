/**
 * launchpad-tiles.ts - data for the homepage Launchpad bento grid
 *
 * Pure TypeScript, zero .svelte imports — this module is imported by a
 * node-environment unit test, so it must stay import-safe outside a browser/
 * Svelte runtime.
 */

import type { Component } from "svelte";

export interface LaunchpadTileDef {
  id: string;
  href: string;
  heading: string;
  descriptor: string;
  span: "2x2" | "2x1" | "1x1";
  /** Per-destination signature color (hex), consumed as the tile's --c var. */
  color: string;
  /** FontAwesome solid icon class, e.g. "fa-pen-nib". */
  icon: string;
  /** Which live media embed (if any) fills the tile's decorative layer. */
  media?:
    | "mandala"
    | "choreo-card"
    | "pictograph"
    | "pictograph-fade"
    | "dictionary"
    | "guide-cover"
    | "alphabet-strip";
  /**
   * Generic decorative-media path for consumers outside the homepage (e.g. the
   * composer bento): a dynamic import of any Svelte component, mounted through
   * LazyMount alongside the closed `media` union. Only used when `media` is
   * unset — homepage tiles keep the union branches untouched.
   */
  mediaLoader?: () => Promise<{ default: Component }>;
  /** Props forwarded to the `mediaLoader` component. */
  mediaProps?: Record<string, unknown>;
  chips?: { label: string; href: string }[];
  /** Opt this tile into the pointer-follow magnetic pull (composer only). */
  magnetic?: boolean;
  /**
   * Enhance an ordinary primary link activation with the grid's
   * `onActivate(tile)` callback. The href stays in the rendered anchor for
   * no-JS navigation and modified-click browser behavior.
   */
  activate?: boolean;
  /**
   * Static view-transition-name for the cross-route shared-element morph
   * (landing tile -> destination page hero). Present on both endpoints;
   * inert unless a morph navigation runs. Rev. 3 pairs all six primary
   * destinations; the route allowlist is derived from these names.
   */
  morphName?: string;
}

export const LAUNCHPAD_TILES: LaunchpadTileDef[] = [
  {
    id: "composer",
    href: "/composer",
    heading: "Composer",
    descriptor: "Write and animate sequences. Save and share them.",
    span: "2x2",
    color: "#a78bfa",
    icon: "fa-pen-nib",
    media: "mandala",
    magnetic: true,
    morphName: "launchpad-composer",
  },
  {
    id: "choreo-cards",
    href: "/shop",
    heading: "Choreo Cards",
    descriptor: "Printed decks of TKA sequences. Scan a card and it plays.",
    span: "2x1",
    color: "#34d399",
    icon: "fa-layer-group",
    media: "choreo-card",
    morphName: "launchpad-choreo-cards",
    chips: [
      { label: "LOOP Deck", href: "/shop/loop-deck" },
      { label: "Starter Pack", href: "/shop/starter-pack" },
    ],
  },
  {
    id: "guide",
    href: "/learn/concepts",
    heading: "Learn TKA",
    descriptor: "Interactive lessons, one concept at a time.",
    span: "2x1",
    color: "#60a5fa",
    icon: "fa-map-signs",
    media: "guide-cover",
    morphName: "launchpad-guide",
    chips: [{ label: "Read the Guide", href: "/guide" }],
  },
  // The grid's cell count must stay a multiple of 4 or the last row ships
  // holes. 12 cells = three clean rows: composer 2x2, three 2x1s, two 1x1s.
  // Source order follows the tablet bento's visual reading order: do
  // (Composer), hold (Choreo Cards), learn (Guide), understand (Notation),
  // ask (FAQ), and look up (Kinetic Atlas).
  // Deeper theory stays in the Notation dropdown instead of competing with
  // the front doors. Secondary destinations live in the strip.
  {
    id: "notation",
    href: "/history",
    heading: "History",
    descriptor: "How flow arts notation developed, 2009 to 2022.",
    span: "2x1",
    color: "#22d3ee",
    icon: "fa-bezier-curve",
    media: "pictograph",
    morphName: "launchpad-history",
    chips: [
      { label: "Staves", href: "/notation/staves" },
      { label: "Fans", href: "/notation/fans" },
      { label: "Clubs", href: "/notation/clubs" },
      { label: "Buugeng", href: "/notation/buugeng" },
      { label: "Poi", href: "/notation/poi" },
    ],
  },
  {
    id: "faq",
    href: "/faq",
    heading: "FAQ",
    descriptor: "Getting started, props, and cost.",
    span: "1x1",
    color: "#f59e0b",
    icon: "fa-circle-question",
    morphName: "launchpad-faq",
  },
  {
    id: "glossary",
    href: "/atlas",
    heading: "Kinetic Atlas",
    descriptor: "Explore letters, motion, notation, and technique.",
    span: "1x1",
    color: "#94a3b8",
    icon: "fa-compass",
    media: "dictionary",
    morphName: "launchpad-glossary",
  },
];

// Keep this manifest available for future secondary destinations without
// rendering links to pages that are currently withdrawn from production.
export const STRIP_LINKS: { label: string; href: string }[] = [];

export const HERO_POINTER = {
  prefix: "New here? Start with ",
  label: "What is TKA?",
  href: "/about",
} as const;

/**
 * Stable, bounded slug for a launchpad href, used as `chip_id` and `strip_id`
 * in `landing_launchpad_click`. Chips and strip links carry no id of their own
 * (only label/href), and raw href is the cardinality hazard the taxonomy rules
 * out — a path-derived slug is stable across copy edits and small by
 * construction.
 *
 * It lives here, imported by both LaunchpadTile and LaunchpadGrid, because
 * those two feed ONE breakdown in PostHog. Two copies of the rule is two ways
 * for that breakdown to silently split in half the first time the rule changes.
 */
export function hrefSlug(href: string): string {
  return href.replace(/^\//, "").replace(/\//g, "-");
}

/** Is this one of the six production tiles the `LaunchpadTileId` union names?
 *  LaunchpadTile also renders non-canonical tile lists (the composer bento),
 *  whose ids must never reach the closed union. */
export function isProductionTileId(id: string): boolean {
  return LAUNCHPAD_TILES.some((tile) => tile.id === id);
}
