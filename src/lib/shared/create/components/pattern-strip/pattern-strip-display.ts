import { getLocale, tDynamic } from "$lib/shared/i18n/i18n.svelte.js";
import { describeMask } from "$lib/shared/create/domain/rhythm/pattern-sentence";

const laneKeys: Record<string, string> = {
  Left: "pattern_strip_left",
  Right: "pattern_strip_right",
  Hold: "pattern_strip_hold",
  Steps: "pattern_strip_steps",
};

const rhythmKeys: Record<string, string> = {
  alternating: "pattern_strip_alternating",
  every: "pattern_strip_every_step",
  "every-other": "pattern_strip_every_other",
  downbeat: "pattern_strip_first_step",
  last: "pattern_strip_last_step",
};

export function displayLane(label: string): string {
  return getLocale() === "de" && laneKeys[label]
    ? tDynamic(laneKeys[label])
    : label;
}

export function displayRhythm(id: string, label: string): string {
  return getLocale() === "de" && rhythmKeys[id]
    ? tDynamic(rhythmKeys[id])
    : label;
}

export function sentenceSubject(subject: string): string {
  if (getLocale() !== "de") return subject;
  const key = subject === "Left"
    ? "pattern_strip_sentence_left"
    : subject === "Right"
      ? "pattern_strip_sentence_right"
      : subject === "Steps"
        ? "pattern_strip_sentence_duration"
        : null;
  return key ? tDynamic(key) : subject;
}

export function sentenceVerb(verb: string, mixed = false): string {
  if (getLocale() !== "de") return verb;
  if (verb === "hold" && mixed) return tDynamic("pattern_strip_verb_hold_mixed");
  const key = verb === "turns"
    ? "pattern_strip_verb_turns"
    : verb === "reverses"
      ? "pattern_strip_verb_reverses"
      : verb === "hold"
        ? "pattern_strip_verb_hold"
        : null;
  return key ? tDynamic(key) : verb;
}

export function sentenceAmount(verb: string, amount: string, mixed: boolean): string {
  if (getLocale() !== "de") return mixed ? "mixed" : amount;
  if (mixed) return verb === "turns"
    ? tDynamic("pattern_strip_mixed_turns")
    : tDynamic("pattern_strip_mixed");
  const localized = amount.replace(".", ",");
  return verb === "turns"
    ? tDynamic("pattern_strip_turn_count", { count: localized })
    : amount;
}

export function sentenceConnector(): string {
  return getLocale() === "de" ? tDynamic("pattern_strip_at") : "on";
}

function joinGermanSteps(steps: readonly number[]): string {
  if (steps.length === 1) return String(steps[0]);
  return `${steps.slice(0, -1).join(", ")} ${tDynamic("pattern_strip_and")} ${steps[steps.length - 1]}`;
}

/** The German result follows "bei", so its step phrases use dative case. */
export function displayMask(mask: readonly boolean[]): string {
  if (getLocale() !== "de") return describeMask(mask);
  const active = mask.flatMap((on, i) => on ? [i + 1] : []);
  if (active.length === 0) return tDynamic("pattern_strip_no_steps");
  if (active.length === mask.length) return tDynamic("pattern_strip_each_step");
  if (active.length === 1) {
    const every = mask.length === 2
      ? tDynamic("pattern_strip_every_second_step")
      : tDynamic("pattern_strip_every_nth_step", { count: mask.length });
    return active[0] === 1
      ? every
      : tDynamic("pattern_strip_starting_at", { every, step: active[0]! });
  }
  return tDynamic("pattern_strip_specific_steps", { steps: joinGermanSteps(active) });
}
