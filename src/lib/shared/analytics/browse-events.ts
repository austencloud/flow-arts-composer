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
