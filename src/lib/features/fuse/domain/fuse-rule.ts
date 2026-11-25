/**
 * The rule Fuse applies to the follower path.
 *
 * This used to be one of nine flat ids — mirror, flip, rotate90, rotate180,
 * invert, rewind, and three curated pairs. That shape conflated two different
 * kinds of thing. Rotation is an AMOUNT the engine already accepts as 45° steps
 * 0–7 (see rotation-helpers.ts), while mirror/flip/invert/rewind are
 * independent operations. Flattening them meant only two of the seven rotation
 * amounts were reachable, and "Rotate + Mirror" silently hardcoded 90° with no
 * way to say otherwise.
 *
 * So a rule is the four axes, applied in this order: rotate, reflect, invert,
 * rewind. That order is what the old curated pairs did, so every one of the
 * nine legacy ids maps onto a rule exactly (see LEGACY_RULES).
 *
 * Odd rotation amounts move the follower to the other grid mode
 * (getToggledGridMode), and the fuser resolves a diamond/box pair to SKEWED, so
 * 45° increments are a supported result rather than a broken one.
 */

import { t } from "#lib/shared/i18n/i18n.svelte.js";

/** Reflection applied after the rotation. One axis at a time. */
export type FuseReflection = "none" | "mirror" | "flip";

export interface FuseRule {
  /** Clockwise 45° steps applied to the follower, 0–7. */
  rotationSteps: number;
  reflect: FuseReflection;
  /** Reverse every turn. */
  invert: boolean;
  /** Reverse the step order. */
  rewind: boolean;
}

export interface FuseRotationOption {
  steps: number;
  /** What the user reads. Degrees, never "turns" — that word is reserved for
   * prop and body turns, and a rotation slice is not one. */
  label: string;
}

/** Every rotation the transform layer accepts, in order around the circle. */
export const FUSE_ROTATIONS: readonly FuseRotationOption[] = [
  {
    steps: 0,
    get label() {
      return t("fuse_none");
    },
  },
  { steps: 1, label: "45°" },
  { steps: 2, label: "90°" },
  { steps: 3, label: "135°" },
  { steps: 4, label: "180°" },
  { steps: 5, label: "225°" },
  { steps: 6, label: "270°" },
  { steps: 7, label: "315°" },
];

export interface FuseReflectionOption {
  value: FuseReflection;
  label: string;
  description: string;
}

export const FUSE_REFLECTIONS: readonly FuseReflectionOption[] = [
  // Getters, so the words follow the language when they are read.
  {
    value: "none",
    get label() {
      return t("fuse_none");
    },
    get description() {
      return t("fuse_rule_no_reflection");
    },
  },
  {
    value: "mirror",
    get label() {
      return t("fuse_rule_mirror");
    },
    get description() {
      return t("fuse_rule_reflect_left_right");
    },
  },
  {
    value: "flip",
    get label() {
      return t("fuse_rule_flip");
    },
    get description() {
      return t("fuse_rule_reflect_top_bottom");
    },
  },
];

export const IDENTITY_RULE: FuseRule = {
  rotationSteps: 0,
  reflect: "none",
  invert: false,
  rewind: false,
};

export const DEFAULT_RULE: FuseRule = { ...IDENTITY_RULE, reflect: "mirror" };

function normalizeSteps(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return ((Math.round(value) % 8) + 8) % 8;
}

export function createFuseRule(partial: Partial<FuseRule> = {}): FuseRule {
  return {
    rotationSteps: normalizeSteps(partial.rotationSteps ?? 0),
    reflect: partial.reflect ?? "none",
    invert: partial.invert === true,
    rewind: partial.rewind === true,
  };
}

/** Stable identity for equality checks, map keys, and persistence. */
export function fuseRuleKey(rule: FuseRule): string {
  return [
    `r${rule.rotationSteps}`,
    rule.reflect,
    rule.invert ? "inv" : "-",
    rule.rewind ? "rew" : "-",
  ].join(".");
}

export function fuseRulesEqual(a: FuseRule, b: FuseRule): boolean {
  return fuseRuleKey(a) === fuseRuleKey(b);
}

export function isIdentityRule(rule: FuseRule): boolean {
  return fuseRulesEqual(rule, IDENTITY_RULE);
}

/**
 * The operation chain a rule performs, in the order it performs them:
 * "Rotate 90° + Mirror". A rule is named by the timing and direction it pins
 * (`fuseTnDModeLabel`); this is the second line under that name, on the
 * follower card's note and the Rule editor's result strip, and the whole of
 * the status messages that report a pairing.
 */
export function fuseRuleLabel(rule: FuseRule): string {
  const parts: string[] = [];
  if (rule.rotationSteps > 0) {
    parts.push(t("fuse_rule_rotate", { degrees: rule.rotationSteps * 45 }));
  }
  if (rule.reflect === "mirror") parts.push(t("fuse_rule_mirror"));
  if (rule.reflect === "flip") parts.push(t("fuse_rule_flip"));
  if (rule.invert) parts.push(t("fuse_rule_invert"));
  if (rule.rewind) parts.push(t("fuse_rule_rewind"));
  // No operation at all means the follower repeats the driver exactly. That is
  // a real choice, so it gets a real name rather than an empty string.
  return parts.length > 0 ? parts.join(" + ") : t("fuse_rule_copy");
}

/**
 * The rule that rebuilds the leader from its follower: the same pair, named
 * from the other hand. Switching which hand leads uses it, so nothing on screen
 * changes. A reflection undoes itself whatever rotation came before it, and so
 * do invert and rewind; a plain rotation turns back the way it came.
 */
export function inverseFuseRule(rule: FuseRule): FuseRule {
  return createFuseRule({
    ...rule,
    rotationSteps:
      rule.reflect === "none" ? -rule.rotationSteps : rule.rotationSteps,
  });
}

/** The nine ids this replaced, so a persisted one still restores its rule. */
export const LEGACY_RULES: Record<string, FuseRule> = {
  mirror: createFuseRule({ reflect: "mirror" }),
  flip: createFuseRule({ reflect: "flip" }),
  rotate90: createFuseRule({ rotationSteps: 2 }),
  rotate180: createFuseRule({ rotationSteps: 4 }),
  invert: createFuseRule({ invert: true }),
  rewind: createFuseRule({ rewind: true }),
  "rotate-mirror": createFuseRule({ rotationSteps: 2, reflect: "mirror" }),
  "mirror-invert": createFuseRule({ reflect: "mirror", invert: true }),
  "rotate-invert": createFuseRule({ rotationSteps: 2, invert: true }),
};

function isReflection(value: unknown): value is FuseReflection {
  return value === "none" || value === "mirror" || value === "flip";
}

/**
 * Read a rule out of persisted state. Accepts the current object form and the
 * legacy string id, so a device that stored `"rotate-mirror"` restores as a 90°
 * rotation plus a mirror rather than falling back to the default.
 */
export function parseFuseRule(value: unknown): FuseRule | null {
  if (typeof value === "string") return LEGACY_RULES[value] ?? null;
  if (typeof value !== "object" || value === null) return null;

  const record = value as Record<string, unknown>;
  if (typeof record.rotationSteps !== "number") return null;
  if (!isReflection(record.reflect)) return null;

  return createFuseRule({
    rotationSteps: record.rotationSteps,
    reflect: record.reflect,
    invert: record.invert === true,
    rewind: record.rewind === true,
  });
}
