/**
 * How the lab presents the committed prop-continuity sweep.
 *
 * `#lib/shared/3d/diagnostics/prop-continuity-findings.js` owns the artifact and
 * the clustering. This module owns the vocabulary the two lab surfaces share,
 * so the goal row and the scrub track can never disagree about what "clean"
 * means or how many jumps a sequence has.
 *
 * Telemetry only: nothing here reaches pose, grip, or the solve.
 */
import {
  clusterPropSpan,
  continuityClusters,
  continuityReport,
  type ContinuityCluster,
} from "#lib/shared/3d/diagnostics/prop-continuity-findings.js";

import { LAB_GOALS } from "./lab-goals";

/**
 * `unswept` is deliberately its own state rather than being folded into
 * `clean`. A sequence the sweep never walked has no evidence either way, and
 * showing it as passing would be a fabricated result.
 */
export type LabContinuityState = "clean" | "findings" | "unswept";

export interface LabContinuityStatus {
  readonly state: LabContinuityState;
  /** Discontinuity events — what the scrub track draws one marker each for. */
  readonly eventCount: number;
  /** Raw per-prop findings behind those events. */
  readonly findingCount: number;
  readonly clusters: readonly ContinuityCluster[];
  /** Steps of motion the sweep walked, when it walked this sequence. */
  readonly sweptStepCount: number | null;
  /** FontAwesome classes. Shape carries the state without colour. */
  readonly icon: string;
  /** A themed colour for the same state. Never the only signal. */
  readonly color: string;
  /** One short phrase, for tooltips and accessible names. */
  readonly summary: string;
}

const STATE_ICON: Record<LabContinuityState, string> = {
  clean: "fa-solid fa-check",
  findings: "fa-solid fa-bolt",
  unswept: "fa-solid fa-circle-question",
};

const STATE_COLOR: Record<LabContinuityState, string> = {
  clean: "var(--semantic-success, #22c55e)",
  findings: "var(--semantic-warning, #f59e0b)",
  unswept: "var(--theme-text-dim, rgba(255, 255, 255, 0.55))",
};

function summarise(
  state: LabContinuityState,
  eventCount: number,
  findingCount: number,
): string {
  if (state === "unswept") return "Not swept";
  if (state === "clean") return "No discontinuities";
  const events = eventCount === 1 ? "1 jump" : `${eventCount} jumps`;
  return `${events}, ${findingCount} findings`;
}

/** What the committed sweep says about one sequence. */
export function labContinuityStatus(sequenceId: string): LabContinuityStatus {
  const report = continuityReport(sequenceId);
  if (!report) {
    return {
      state: "unswept",
      eventCount: 0,
      findingCount: 0,
      clusters: [],
      sweptStepCount: null,
      icon: STATE_ICON.unswept,
      color: STATE_COLOR.unswept,
      summary: summarise("unswept", 0, 0),
    };
  }

  const clusters = continuityClusters(sequenceId);
  const state: LabContinuityState = clusters.length === 0 ? "clean" : "findings";
  return {
    state,
    eventCount: clusters.length,
    findingCount: report.findings.length,
    clusters,
    sweptStepCount: report.motionStepCount,
    icon: STATE_ICON[state],
    color: STATE_COLOR[state],
    summary: summarise(state, clusters.length, report.findings.length),
  };
}

export interface LabGoalContinuitySummary {
  readonly total: number;
  readonly clean: number;
  readonly withFindings: number;
  readonly unswept: number;
}

/** The goal list's headline: how far the 19 are from a teleport-free pass. */
export function labGoalContinuitySummary(): LabGoalContinuitySummary {
  let clean = 0;
  let withFindings = 0;
  let unswept = 0;
  for (const goal of LAB_GOALS) {
    const state = labContinuityStatus(goal.id).state;
    if (state === "clean") clean += 1;
    else if (state === "findings") withFindings += 1;
    else unswept += 1;
  }
  return { total: LAB_GOALS.length, clean, withFindings, unswept };
}

export interface LabContinuityMarker {
  readonly key: string;
  /** Where the transport should land: the first frame of the event. */
  readonly seekPhase: number;
  /** Left edge as a fraction of the scrub track, 0-1. */
  readonly start: number;
  /** Width as a fraction of the scrub track, 0-1. */
  readonly width: number;
  /** Blue's own span inside the event, or null when blue is not involved. */
  readonly blue: { readonly start: number; readonly width: number } | null;
  readonly red: { readonly start: number; readonly width: number } | null;
  readonly peakMagnitudeCm: number;
  /** The step labels the lab prints, e.g. "4.65-4.71". */
  readonly labelRange: string;
  readonly ariaLabel: string;
}

/** Clamp a fraction into the track, so an event at phase 0 stays visible. */
function fraction(phase: number, span: number): number {
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, phase / span));
}

/** The step label the lab prints for a phase, matching `phaseLabel`. */
function labLabel(phase: number): string {
  const step = Math.floor(phase) + 1;
  const hundredths = Math.round((phase % 1) * 100);
  return `${step}.${String(hundredths).padStart(2, "0")}`;
}

function spanFractions(
  span: { readonly phaseStart: number; readonly phaseEnd: number } | undefined,
  trackSpan: number,
): { readonly start: number; readonly width: number } | null {
  if (!span) return null;
  const start = fraction(span.phaseStart, trackSpan);
  const end = fraction(span.phaseEnd, trackSpan);
  return { start, width: Math.max(0, end - start) };
}

/**
 * Place a sequence's events on a scrub track.
 *
 * `trackSpan` is the transport's own range in steps, not the sweep's, so a
 * marker sits under the same pixel the range input would put that phase at.
 */
export function labContinuityMarkers(
  status: LabContinuityStatus,
  trackSpan: number,
): readonly LabContinuityMarker[] {
  if (trackSpan <= 0) return [];

  return status.clusters.map((cluster) => {
    const start = fraction(cluster.phaseStart, trackSpan);
    const end = fraction(cluster.phaseEnd, trackSpan);
    const blue = spanFractions(clusterPropSpan(cluster, "blue"), trackSpan);
    const red = spanFractions(clusterPropSpan(cluster, "red"), trackSpan);
    const labelRange = `${labLabel(cluster.phaseStart)}-${labLabel(cluster.phaseEnd)}`;
    const props =
      cluster.props.length === 2
        ? "blue and red"
        : (cluster.props[0] ?? "unknown prop");

    return {
      key: cluster.key,
      seekPhase: cluster.phaseStart,
      start,
      width: Math.max(0, end - start),
      blue,
      red,
      peakMagnitudeCm: cluster.peakMagnitudeCm,
      labelRange,
      ariaLabel: `Jump at step ${labelRange}, ${props}, up to ${Math.round(cluster.peakMagnitudeCm)} centimetres. Go to step ${labLabel(cluster.phaseStart)}.`,
    } satisfies LabContinuityMarker;
  });
}
