/**
 * Tunnel NAMES — derived from the tunnel, not from the sequence underneath it.
 *
 * A tunnel used to be one sequence laid over itself, so naming it after that
 * sequence's word was the whole truth. The tunnel tab ended that: a tunnel is
 * now a cast, a formation, a prop choice, an effect assignment and a set of
 * rates, any of which can differ while the word stays the same. Two tunnels
 * both called "BBBA" is a collection you cannot read.
 *
 * So the default name reads the composition instead. It is a DEFAULT — a name a
 * person typed always wins, and this only fills the blank.
 *
 * Two callers had each grown half of this and disagreed: the viewer's save used
 * the simplified sequence word, and the tunnel creator used
 * "<lead> + <partner>". Both now route here.
 *
 * ## Shape
 *
 *   BBBA Duo
 *   BBBA × ΩORZ Mandala
 *   BBBA Pinwheel on fans
 *   BBBA Cross in fire multi-speed
 *
 * Words lead, because the word is what a person recognizes, and they stay
 * uppercase so TkaLabel draws them in the alphabet's own glyphs. Everything
 * after them is lowercase or Title Case prose, which is exactly what keeps the
 * glyph renderer off it: a token is alphabet only when every unit is a
 * canonical letter, and no canonical letter is lowercase Latin.
 *
 * Only DISTINGUISHING facts appear. A default staff, an empty effect map and a
 * single rate say nothing about this tunnel that is not equally true of every
 * other one, so they are omitted rather than padded in.
 */

import { simplifyRepeatedWord } from "#lib/shared/foundation/utils/word-simplifier.js";
import { EFFECT_LABELS } from "#lib/shared/animation-engine/components/effects-panel/effect-registry.js";
import {
  findPropTypeByValue,
  getPropTypeDisplayInfo,
} from "#lib/shared/pictograph/prop/domain/prop-type-display-registry.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  getPreset,
  imageCount,
  matchPreset,
  type TunnelConfig,
} from "./tunnel-config";
import type { TunnelComposition } from "./tunnel-composition";
import type { TunnelSnapshot } from "./tunnel-snapshot";

/** Words shown before the tail is summarized, so a big cast still fits a card. */
const MAX_NAMED_WORDS = 3;
/** Trailing qualifiers kept. Past two, the name stops being a name. */
const MAX_QUALIFIERS = 2;
/** Length after which qualifiers are dropped from the right. */
const MAX_NAME_LENGTH = 64;

export interface TunnelDescription {
  /** Distinct simplified words across the cast, in cast order. */
  words: string[];
  /** Authored performers. Not the arm count — a formation repeats the cast
   *  around the ring. */
  castSize: number;
  /** Built-in preset name, or a label derived from the primitives. */
  formation: string;
  /** False when the formation is a custom point in the config space. */
  formationIsPreset: boolean;
  /** Lowercase plural prop phrase ("fans"), or null for the default staff. */
  props: string | null;
  /** Lowercase effect phrase ("fire", "mixed effects"), or null when unset. */
  effects: string | null;
  /** True when the arms do not all run at the same rate. */
  multiSpeed: boolean;
}

export interface TunnelNameSource {
  /** The authored cast, when the tunnel has one. Narrowed to `performers` so
   *  the creator can name a composition it is still in the middle of building. */
  composition?: Pick<TunnelComposition, "performers"> | null;
  /** Captured viewer state, which is where props and effects live. */
  snapshot?: TunnelSnapshot | null;
  /** The viewer's own sequence word — the only word source for a tunnel that
   *  was never composed in the tunnel tab. */
  baseWord?: string;
  /** Formation to read when there is no snapshot to take it from: the creator
   *  names a composition before any viewer state exists. */
  formation?: TunnelConfig | null;
}

function distinctWords(source: TunnelNameSource): string[] {
  const words: string[] = [];
  const push = (raw: string | undefined) => {
    const word = simplifyRepeatedWord((raw ?? "").trim());
    if (word && !words.includes(word)) words.push(word);
  };

  for (const performer of source.composition?.performers ?? []) {
    // A derived performer is a transform of another cast member, so its word is
    // already in the list; naming it twice would claim a variety of material
    // the tunnel does not have.
    if (performer.source.kind === "independent") {
      push(performer.source.sequence.word);
    }
  }
  if (words.length === 0) push(source.baseWord);
  return words;
}

/** The one visual flag worth naming when no preset matches. Mirror and flip are
 *  deliberately left out: both are already counted in the arms. */
function customFormationFlag(config: TunnelConfig): string {
  if (config.invert) return " inverted";
  if (config.echo) return " echoed";
  if (config.staggerSteps > 0) return " staggered";
  return "";
}

function describeFormation(config: TunnelConfig | null | undefined): {
  label: string;
  isPreset: boolean;
} {
  if (!config) return { label: "", isPreset: false };
  // Match on SHAPE only. `matchPreset` compares speed overrides too, which is
  // right for the preset picker (a retuned Duo is no longer the Duo you tapped)
  // and wrong here: a Duo running one arm at 2x is still visibly a Duo, and the
  // rate already gets its own "multi-speed" qualifier. Without this, changing a
  // speed silently downgrades a good name to "2-arm".
  const presetId = matchPreset({ ...config, speedOverrides: {} });
  const preset = presetId ? getPreset(presetId) : undefined;
  if (preset) return { label: preset.name, isPreset: true };
  return {
    label: `${imageCount(config)}-arm${customFormationFlag(config)}`,
    isPreset: false,
  };
}

/** Lowercase and naively pluralized, because the phrase reads "on fans" rather
 *  than "on Fan". Null for the default double staff, which distinguishes
 *  nothing. */
function describeProps(
  snapshot: TunnelSnapshot | null | undefined,
): string | null {
  const left = snapshot?.props?.leftPropType;
  const right = snapshot?.props?.rightPropType;
  if (!left || !right) return null;
  if (left !== right) return "mixed props";
  if (left === PropType.STAFF) return null;

  const propType = findPropTypeByValue(left);
  if (!propType) return null;
  const label = getPropTypeDisplayInfo(propType).label.toLowerCase();
  return label.endsWith("s") ? label : `${label}s`;
}

/**
 * Are the props all carrying the same effect, or does each have its own? The
 * tip-effect map answers both: one distinct assignment means one look, several
 * means the contrast IS the tunnel's subject.
 */
function describeEffects(
  snapshot: TunnelSnapshot | null | undefined,
): string | null {
  const map = snapshot?.effects?.tipEffectMap;
  if (!map) return null;

  const assigned = new Set<string>();
  for (const assignment of Object.values(map)) {
    const effect = assignment?.effect;
    if (effect && effect !== "none") assigned.add(effect);
  }

  if (assigned.size === 0) return null;
  if (assigned.size > 1) return "mixed effects";
  const only = [...assigned][0]!;
  return (EFFECT_LABELS[only] ?? only).toLowerCase();
}

/** The base arm is always 1×, so a single override off 1 already puts two rates
 *  on screen at once. Cast-level speeds compound with it. */
function hasMultipleSpeeds(source: TunnelNameSource): boolean {
  const config = source.snapshot?.tunnel?.config ?? source.formation;
  const rates = new Set<number>([1]);
  for (const rate of Object.values(config?.speedOverrides ?? {})) {
    if (typeof rate === "number") rates.add(rate);
  }
  for (const performer of source.composition?.performers ?? []) {
    const rate = performer.timing?.speed;
    if (typeof rate === "number") rates.add(rate);
  }
  return rates.size > 1;
}

export function describeTunnel(source: TunnelNameSource): TunnelDescription {
  const config = source.snapshot?.tunnel?.config ?? source.formation ?? null;
  const formation = describeFormation(config);
  return {
    words: distinctWords(source),
    castSize: source.composition?.performers.length ?? 1,
    formation: formation.label,
    formationIsPreset: formation.isPreset,
    props: describeProps(source.snapshot),
    effects: describeEffects(source.snapshot),
    multiSpeed: hasMultipleSpeeds(source),
  };
}

function joinWords(words: string[]): string {
  if (words.length === 0) return "";
  if (words.length <= MAX_NAMED_WORDS) return words.join(" × ");
  const shown = words.slice(0, MAX_NAMED_WORDS).join(" × ");
  return `${shown} +${words.length - MAX_NAMED_WORDS}`;
}

/**
 * Assemble the description into a name, then trim qualifiers from the right
 * until it fits. Words and formation are never trimmed — they are the identity,
 * and the qualifiers are the detail.
 */
export function nameFromDescription(description: TunnelDescription): string {
  const qualifiers: string[] = [];
  if (description.props) qualifiers.push(`on ${description.props}`);
  if (description.effects) qualifiers.push(`in ${description.effects}`);
  if (description.multiSpeed) qualifiers.push("multi-speed");

  const head = [joinWords(description.words), description.formation]
    .filter(Boolean)
    .join(" ");

  let kept = qualifiers.slice(0, MAX_QUALIFIERS);
  while (kept.length > 0) {
    const candidate = [head, ...kept].filter(Boolean).join(" ");
    if (candidate.length <= MAX_NAME_LENGTH) return candidate;
    kept = kept.slice(0, -1);
  }
  return head;
}

/**
 * The default name for a tunnel. Empty when there is nothing to say; callers
 * own their own last-resort fallback (the collection uses an ordinal).
 */
export function deriveTunnelName(source: TunnelNameSource): string {
  return nameFromDescription(describeTunnel(source));
}
