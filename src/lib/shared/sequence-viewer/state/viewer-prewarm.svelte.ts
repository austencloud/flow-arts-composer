import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { hashSequenceContent } from "#lib/shared/foundation/services/content-hasher.js";
import type { SequenceViewerSource } from "#lib/shared/sequence-viewer/analytics/viewer-events.js";
import type { ViewMode } from "#lib/shared/sequence-viewer/domain/viewer-orchestrator-context.js";

/**
 * A surface that knows which sequence its View button will open names it
 * here, and the drawer host builds that viewer hidden while the page is idle.
 * The tap then slides up a viewer that is already drawn instead of an empty
 * sheet. Only the open options the viewer reads while it is being built are
 * part of the prediction; an open that asks for anything else builds a fresh
 * viewer as before.
 */
export interface SequenceViewerPrewarm {
  sequence: SequenceData;
  analyticsSource: SequenceViewerSource;
  initialViewMode: ViewMode;
  playOnOpen: boolean;
}

/** The open options a prebuilt viewer can be handed. */
export interface PrewarmOpenOptions {
  sequence: SequenceData | null;
  analyticsSource: SequenceViewerSource;
  initialViewMode: ViewMode | undefined;
  initialViewerMode: unknown;
  playOnOpen: boolean;
  handPathMode: boolean;
  collectionPropType: unknown;
  initialPlaybackMode: string;
  shareOnOpen: boolean;
  saveOnOpen: boolean;
  tunnelComposition: unknown;
  activeShortCode: string | null;
}

// Raw: the viewer must be built for the caller's own sequence object, not a
// deep proxy of it.
let _prewarm = $state.raw<SequenceViewerPrewarm | null>(null);

export function prewarmSequenceViewer(prewarm: SequenceViewerPrewarm): void {
  _prewarm = prewarm;
}

/** Drops the prediction, if it is still the one this caller made. */
export function clearSequenceViewerPrewarm(sequence?: SequenceData): void {
  if (sequence && _prewarm?.sequence !== sequence) return;
  _prewarm = null;
}

export function getSequenceViewerPrewarm(): SequenceViewerPrewarm | null {
  return _prewarm;
}

/**
 * Whether `sequence` draws what the viewer built for `prewarm` drew. Overlay
 * state hands the open sequence back as a proxy, so it is compared by content;
 * an identity check would never match and makes Svelte warn in development.
 */
export function isPrewarmedContent(
  prewarm: SequenceViewerPrewarm,
  sequence: SequenceData | null
): boolean {
  if (!sequence) return false;
  if ((sequence.id ?? "") !== (prewarm.sequence.id ?? "")) return false;
  return (
    hashSequenceContent(sequence) === hashSequenceContent(prewarm.sequence)
  );
}

/**
 * Whether an open can take over the viewer built for `prewarm`. The sequence
 * must be the same one (edits since are passed on as a normal update), and
 * every option read while the viewer was built must match. Step and tempo
 * are followed live, so they may differ.
 */
export function canAdoptPrewarm(
  prewarm: SequenceViewerPrewarm,
  open: PrewarmOpenOptions
): boolean {
  const sequence = open.sequence;
  if (!sequence) return false;
  const sameSequence =
    (!!sequence.id && sequence.id === prewarm.sequence.id) ||
    isPrewarmedContent(prewarm, sequence);
  return (
    sameSequence &&
    open.analyticsSource === prewarm.analyticsSource &&
    open.initialViewMode === prewarm.initialViewMode &&
    open.playOnOpen === prewarm.playOnOpen &&
    open.initialViewerMode === undefined &&
    !open.handPathMode &&
    open.collectionPropType === null &&
    open.initialPlaybackMode === "continuous" &&
    !open.shareOnOpen &&
    !open.saveOnOpen &&
    open.tunnelComposition === null &&
    open.activeShortCode === null
  );
}
