/**
 * Browse's decision events answer whether the new information architecture is
 * solving a real retrieval problem. They deliberately record stable product
 * concepts, never display copy, sequence words, collection ids, or creator ids.
 */

import { withRoute } from "#lib/shared/analytics/analytics-context.js";
import { captureWhenReady } from "#lib/shared/analytics/services/posthog.js";

export type BrowseDestination =
  | "gallery"
  | "library"
  | "collections"
  | "hall-of-shame";

export type BrowseCollectionEntry =
  | "community-card"
  | "owned-card"
  | "shared-card"
  | "performance-shelf";

// Not the same union as the router's BrowseVisualType (browse-route-resolver):
// that one names the /browse/you/visuals/* segments, and films deliberately have
// no public visuals route. This one only labels the event.
export type BrowseVisualType = "tunnel" | "mandala" | "scene" | "film";
export type TunnelEditEntry = "gallery-card" | "detail";

export function trackBrowseDestinationEntered(
  destination: BrowseDestination
): void {
  captureWhenReady("browse_destination_entered", withRoute({ destination }));
}

export function trackBrowseCollectionOpened(
  entry: BrowseCollectionEntry
): void {
  captureWhenReady("browse_collection_opened", withRoute({ entry }));
}

export function trackBrowseVisualTypeOpened(type: BrowseVisualType): void {
  captureWhenReady("browse_visual_type_opened", withRoute({ type }));
}

export function trackTunnelEditStarted(entry: TunnelEditEntry): void {
  captureWhenReady("browse_tunnel_edit_started", withRoute({ entry }));
}

export function trackPerformancePlaybackIntent(): void {
  captureWhenReady(
    "browse_performance_playback_intent",
    withRoute({ subject_type: "sequence" })
  );
}

/** Where in Browse a filter value was applied or cleared. */
export type BrowseFilterSurface = "ask" | "answer_button" | "more_filters";

/** Filter types whose values name a person or a private object. Their value
 * is withheld, per this file's rule: no creator or collection ids. */
const WITHHELD_FILTER_VALUES = new Set(["owner", "author", "collection"]);

export function trackBrowseFilterApplied(event: {
  filter: string;
  value: string | number;
  action: "apply" | "clear";
  surface: BrowseFilterSurface;
  result_count: number;
}): void {
  captureWhenReady(
    "browse_filter_applied",
    withRoute({
      ...event,
      value: WITHHELD_FILTER_VALUES.has(event.filter)
        ? null
        : String(event.value),
    })
  );
}

/**
 * One tap on a gallery card's variation pill. Carries no sequence id, name or
 * user detail: only how long the new picture took and how it was served.
 */
export function trackBrowseVariationSwap(event: {
  duration_ms: number;
  outcome: "shown" | "tapped_again" | "left";
  source?: "memory" | "static" | "local" | "cloud" | "render";
  variation_count: number;
  prepared: boolean;
}): void {
  captureWhenReady("browse_variation_swap", withRoute({ ...event }));
}
