/**
 * SequenceViewerNavigator
 *
 * Centralized function that opens the sequence viewer in the appropriate way:
 * - Mobile: Opens the drawer overlay (no route change, module stays mounted)
 * - Desktop: Navigates to /sequence/[id] route (view transition, SSR support)
 *
 * Replaces all direct calls to:
 *   saveSequenceRouteHandoff(...) + goto(sequenceEncoder.generateSequenceRoutePath(...))
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { ViewMode } from "$lib/shared/sequence-viewer/domain/viewer-orchestrator-context";
import type { ViewerMode } from "$lib/shared/sequence-viewer/state/viewer-state.svelte";
import { openSequenceOverlay } from "../state/sequence-viewer-overlay-state.svelte";
import { cellPreWarmer } from "./cell-pre-warmer";
import { getCached } from "$lib/shared/sequence-viewer/services/sequence-data-provider";
import type { SequenceViewerSource } from "$lib/shared/sequence-viewer/analytics/viewer-events";

import type { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";

export interface OpenSequenceViewerOptions {
  collectionPropType?: PropType | null;
  /** Stable product surface that handed this sequence to the viewer. */
  source: SequenceViewerSource;
  /** Path to return to when closing (e.g., "/browse/gallery") */
  returnPath: string;
  /** Label for back button (e.g., "Browse", "My Library") */
  returnLabel?: string;
  /** Scroll position to restore on return */
  scrollY?: number;
  /** Initial BPM for playback */
  initialBpm?: number;
  /** Initial playback step */
  initialStep?: number;
  /** Surface shown when the viewer opens. */
  initialViewMode?: ViewMode;
  /** Full viewer surface shown when the viewer opens. */
  initialViewerMode?: ViewerMode;
  /** All variations of this sequence (same word). Enables variation navigation. */
  variations?: SequenceData[];
  /** When true, renders hand path visualization (HAND props, float arrows, no TKA). */
  handPathMode?: boolean;
  /** Open on the 2D animation surface and request playback. */
  playOnOpen?: boolean;
  /** Open the viewer's canonical Share sheet as soon as the viewer mounts. */
  shareOnOpen?: boolean;
}

/**
 * Open the sequence viewer as a drawer overlay.
 *
 * Always uses the drawer overlay for in-app navigation, regardless of viewport size.
 * The current module stays mounted behind the drawer, so returning is instant.
 * Includes swipe-to-dismiss on all viewports.
 *
 * The /sequence/[id] route still exists for external links (QR codes, shared URLs)
 * where no app shell is loaded yet.
 */
export function openSequenceViewer(
  sequence: SequenceData,
  options: OpenSequenceViewerOptions
): void {
  // Use prefetched hydrated data if available (hover prefetch completed)
  // Preserve ownership metadata from the original sequence since cached/hydrated
  // versions loaded from IndexedDB or public index may lack ownerId.
  let seqToOpen = sequence;
  try {
    const cached = getCached(sequence);
    if (cached) {
      seqToOpen =
        sequence.ownerId && !cached.ownerId
          ? { ...cached, ownerId: sequence.ownerId }
          : cached;
    }
  } catch {
    // DI not available - proceed with original sequence
  }

  // Pre-warm pictograph cells at highest priority while the drawer animates.
  // By the time ChoreoCard mounts, cells are already in IndexedDB.
  cellPreWarmer.preWarmSequence(seqToOpen, "user-blocking");

  // Always use drawer overlay - keeps the underlying module mounted
  // so content is immediately visible behind the drawer on dismiss
  openSequenceOverlay(seqToOpen, {
    analyticsSource: options.source,
    collectionPropType: options.collectionPropType,
    returnLabel: options.returnLabel,
    initialBpm: options.initialBpm,
    initialStep: options.initialStep,
    initialViewMode: options.initialViewMode,
    initialViewerMode: options.initialViewerMode,
    variations: options.variations,
    handPathMode: options.handPathMode,
    playOnOpen: options.playOnOpen,
    shareOnOpen: options.shareOnOpen,
  });
}
