import type {
  ResolvedTimingSection,
  TimingSection,
} from "$lib/shared/media-composition/domain/take-timing";
import { judgeTimingFit } from "$lib/shared/media-composition/domain/timing-verdict";

/**
 * The Timing step's one-line read of a section's fit, in plain words, and
 * what it offers to do about it.
 */
export type TimingSummaryTone =
  | "empty"
  | "tapping"
  | "good"
  | "rough"
  | "tempo";

export interface TimingSummary {
  tone: TimingSummaryTone;
  text: string;
  /** The tempo the taps point to, when it differs from the typed one. */
  suggestedBpm: number | null;
  /** Taps the fit left out before the first one it used. */
  ignoredLeadingTaps: number;
}

function bpmText(bpm: number): string {
  return Number.isInteger(bpm) ? String(bpm) : bpm.toFixed(1);
}

function secondsText(seconds: number): string {
  return `${seconds < 0.095 ? seconds.toFixed(2) : seconds.toFixed(1)} s`;
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function summarizeTiming(input: {
  section: TimingSection;
  resolved: ResolvedTimingSection | null;
  moveBeats: readonly number[];
}): TimingSummary {
  const { section, resolved } = input;
  const fit = resolved?.fit ?? null;
  const tapCount = section.taps.filter(
    (tap) => tap >= section.startSeconds && tap <= section.endSeconds
  ).length;
  const base = { suggestedBpm: null, ignoredLeadingTaps: 0 };

  if (!fit) {
    return {
      ...base,
      tone: "empty",
      text: "Tap each landing as the video plays, or mark where move 1 lands.",
    };
  }
  if (tapCount === 0) {
    return {
      ...base,
      tone: "tapping",
      text: `Running at ${bpmText(section.bpm)} BPM from move 1. Tap along to fit the video's own timing.`,
    };
  }

  const verdict = judgeTimingFit({
    fit,
    typedBpm: section.bpm,
    tempo: section.tempo,
    taps: section.taps,
    moveBeats: input.moveBeats,
  });
  const ignoredLeadingTaps = fit.ignoredLeadingTaps;
  const extras = fit.extraCount;
  const missed = fit.missedPositions.length;
  const leftovers = [
    missed > 0 ? plural(missed, "missed", "missed") : null,
    extras > 0 ? `${plural(extras, "extra tap", "extra taps")} ignored` : null,
  ].filter(Boolean);
  const tail = leftovers.length > 0 ? ` · ${leftovers.join(", ")}` : "";

  if (verdict.kind === "tapping") {
    return {
      ...base,
      ignoredLeadingTaps,
      tone: "tapping",
      text: `${plural(tapCount, "tap", "taps")} so far. Keep tapping the landings.`,
    };
  }
  if (verdict.kind === "tempo") {
    return {
      tone: "tempo",
      suggestedBpm: verdict.suggestedBpm,
      ignoredLeadingTaps,
      text: `Your taps point to ${bpmText(verdict.suggestedBpm)} BPM, not ${bpmText(section.bpm)}.`,
    };
  }
  if (verdict.kind === "rough") {
    return {
      ...base,
      ignoredLeadingTaps,
      tone: "rough",
      text: `Loose fit at ${bpmText(fit.bpm)} BPM · taps up to ${secondsText(fit.worstMissSeconds)} off${tail}`,
    };
  }
  return {
    ...base,
    ignoredLeadingTaps,
    tone: "good",
    text: `Fits ${bpmText(Math.round(fit.bpm * 10) / 10)} BPM · taps within ${secondsText(fit.medianMissSeconds)}${tail}`,
  };
}

/** "Move 3 · pass 2", or "Start" for the opening pose. */
export function landingName(position: number, movesPerPass: number): string {
  if (position <= 0 || movesPerPass <= 0) return "Start";
  const move = ((position - 1) % movesPerPass) + 1;
  const pass = Math.floor((position - 1) / movesPerPass) + 1;
  return `Move ${move} · pass ${pass}`;
}
