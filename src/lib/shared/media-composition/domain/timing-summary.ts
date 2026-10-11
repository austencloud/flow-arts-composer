import type {
  ResolvedTimingSection,
  TimingSection,
} from "#lib/shared/media-composition/domain/take-timing.js";
import { judgeTimingFit } from "#lib/shared/media-composition/domain/timing-verdict.js";
import { t } from "#lib/shared/i18n/i18n.svelte.js";

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

export function summarizeTiming(input: {
  section: TimingSection;
  resolved: ResolvedTimingSection | null;
  moveBeats: readonly number[];
}): TimingSummary {
  const { section, resolved } = input;
  const fit = resolved?.fit ?? null;
  // A part's taps are the ones whose landings it draws, which near a nudged
  // cut can sit just outside it.
  const tapCount = section.taps.length;
  const base = { suggestedBpm: null, ignoredLeadingTaps: 0 };

  if (!fit) {
    return {
      ...base,
      tone: "empty",
      text: t("share_studio_deep_summary_start_tapping"),
    };
  }
  if (tapCount === 0) {
    // A part that keeps counting runs on from the landing it was cut at,
    // unless the performance has ended by then: then it holds that pose.
    const count = section.beatOnePosition ?? 1;
    const end = resolved?.endPosition ?? null;
    const name = (position: number) => {
      if (position <= 0 || input.moveBeats.length === 0)
        return t("share_studio_deep_start");
      const move = ((position - 1) % input.moveBeats.length) + 1;
      const pass = Math.floor((position - 1) / input.moveBeats.length) + 1;
      return t("share_studio_deep_move_pass_lower", { move, pass });
    };
    if (end !== null && end <= count) {
      const pose =
        end === 0 ? t("share_studio_deep_opening_pose_lower") : name(end);
      return {
        ...base,
        tone: "tapping",
        text: resolved?.endStored
          ? t("share_studio_deep_summary_held_performance_end", { pose })
          : t("share_studio_deep_summary_held_taps_stop", { pose }),
      };
    }
    return {
      ...base,
      tone: "tapping",
      text: t("share_studio_deep_summary_running", {
        bpm: bpmText(section.bpm),
        move: count > 1 ? name(count) : t("share_studio_deep_move_one_lower"),
      }),
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
    missed > 0
      ? t("share_studio_deep_summary_missed", { count: missed })
      : null,
    extras > 0
      ? t(
          extras === 1
            ? "share_studio_deep_summary_one_extra_ignored"
            : "share_studio_deep_summary_extra_ignored",
          { count: extras }
        )
      : null,
  ].filter(Boolean);
  const tail = leftovers.length > 0 ? ` · ${leftovers.join(", ")}` : "";

  if (verdict.kind === "tapping") {
    return {
      ...base,
      ignoredLeadingTaps,
      tone: "tapping",
      text: t(
        tapCount === 1
          ? "share_studio_deep_summary_one_tap_so_far"
          : "share_studio_deep_summary_taps_so_far",
        { count: tapCount }
      ),
    };
  }
  if (verdict.kind === "tempo") {
    return {
      tone: "tempo",
      suggestedBpm: verdict.suggestedBpm,
      ignoredLeadingTaps,
      text: t("share_studio_deep_summary_tempo", {
        suggested: bpmText(verdict.suggestedBpm),
        current: bpmText(section.bpm),
      }),
    };
  }
  if (verdict.kind === "rough") {
    return {
      ...base,
      ignoredLeadingTaps,
      tone: "rough",
      text: t("share_studio_deep_summary_rough", {
        bpm: bpmText(fit.bpm),
        seconds: secondsText(fit.worstMissSeconds),
        tail,
      }),
    };
  }
  return {
    ...base,
    ignoredLeadingTaps,
    tone: "good",
    text: t("share_studio_deep_summary_good", {
      bpm: bpmText(Math.round(fit.bpm * 10) / 10),
      seconds: secondsText(fit.medianMissSeconds),
      tail,
    }),
  };
}

/** "Move 3 · pass 2", or "Start" for the opening pose. */
export function landingName(position: number, movesPerPass: number): string {
  if (position <= 0 || movesPerPass <= 0) return t("share_studio_deep_start");
  const move = ((position - 1) % movesPerPass) + 1;
  const pass = Math.floor((position - 1) / movesPerPass) + 1;
  return t("share_studio_deep_move_pass", { move, pass });
}
