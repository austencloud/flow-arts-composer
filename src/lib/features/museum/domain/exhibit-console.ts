/**
 * The exhibit console: what a visitor is allowed to change about one performer,
 * and what that change means.
 *
 * ONE CONSOLE PER PERFORMER, and the reason is structural rather than
 * preference: the hand-swap verb only exists on a hybrid. A performer whose
 * hands are both doing the same thing has no roles to swap, so a single wing
 * console would have to grey out a button two thirds of the time and pretend
 * the three cases are more alike than they are. The contextual button's absence
 * is itself the lesson.
 *
 * THE ERA GATE. A console may offer any verb the museum can honestly
 * demonstrate, but a verb that CHANGES THE CHOREOGRAPHY is limited to concepts
 * the era on display actually had. Turn values do not exist in the Cave's era,
 * so no turn control appears here — the pedestal belongs to the era, the
 * console belongs to the museum. This is why the set can legitimately grow
 * richer in later halls: the visitor's agency expands as history expands.
 *
 * Spec: docs/superpowers/specs/2026-08-16-museum-pedestal-and-console-design.md
 * (§8 per-performer, §10 the Cave control tier, §11 persistence and restore)
 */
import type { StepData } from "#lib/shared/foundation/domain/models/step-data.js";

/**
 * What a Cave console can do.
 *
 * "Show a different variation" is deliberately absent (§10, D9). It is the one
 * control that would change what the exhibit IS rather than how you look at it,
 * and the museum has a standing rule that a case never shows a newly generated
 * variation in place of its bound sequence.
 */
export type ConsoleVerb = "trace" | "prop" | "reverse" | "swap-hands";

/** One performer's current state. Persists when the visitor walks away (§11). */
export interface PerformerSettings {
  /** Whether the figure is lit on the pedestal face at all. */
  traceVisible: boolean;
  /** What the performer is holding. Decides the trace count, not the figure. */
  propType: string;
  /** Full reversal: everything rewinds, pro stays pro, anti stays anti. */
  reversed: boolean;
  /** Which hand does which role. Only meaningful on a hybrid. */
  handsSwapped: boolean;
}

/**
 * The props a Cave console cycles through.
 *
 * One bilateral and one unilateral, which is the entire point of the verb: the
 * figure belongs to the hand and the copy count belongs to the prop. A longer
 * list would teach the same lesson more slowly, and every extra press is a
 * press at arm's length in a dark room.
 */
export const CAVE_PROP_CYCLE = ["staff", "fan"] as const;

/** Console body: a lectern the visitor walks up to, not a panel. */
export const CONSOLE_HEIGHT = 1.0;
export const CONSOLE_FOOTPRINT = { x: 0.8, z: 0.45 };
/** How far the control face tilts back from horizontal, toward the visitor. */
export const CONSOLE_FACE_TILT = Math.PI * 0.22;
/** Button diameter. Large enough to read and press at arm's length in the dark. */
export const CONSOLE_BUTTON_D = 0.11;

/**
 * The control face's geometry, and where each row sits on it.
 *
 * ONE OWNER, because two of them need the same numbers: the mesh draws the
 * face and the walk scene works out where a visitor's aim lands on it. While
 * both kept private copies, moving a button in the mesh left its pressable
 * target behind at the old spot — a console that looks right and cannot be
 * used. Every consumer derives from here.
 *
 * The plate covers two thirds of the lectern's depth rather than all of it.
 * At full depth the tilted slab hangs a fifth of a metre below its own centre,
 * which is below the body's top, so the near end of the face — the RESTORE
 * handle and the bottom line of every wrapped label — was buried inside the
 * box it sits on.
 */
export const CONSOLE_FACE = {
  /** How much of the footprint depth the plate spans, along the slope. */
  depthFraction: 0.66,
  widthInset: 0.06,
  thickness: 0.035,
  /** Row positions, far edge (0) to near edge (1). */
  buttonV: 0.3,
  labelV: 0.58,
  restoreBarV: 0.8,
  restoreLabelV: 0.92,
  /** Gap between neighbouring labels, as a fraction of the button pitch. */
  labelGutter: 0.16,
} as const;

export interface ConsoleFootprint {
  x: number;
  z: number;
}

/** The plate's own width and along-the-slope length. */
export function consoleFaceSize(footprint: ConsoleFootprint): {
  w: number;
  h: number;
} {
  return {
    w: footprint.x - CONSOLE_FACE.widthInset,
    h: (footprint.z * CONSOLE_FACE.depthFraction) / Math.cos(CONSOLE_FACE_TILT),
  };
}

/** How far the plate's near edge hangs below the plate's centre. */
export function consoleFaceDrop(footprint: ConsoleFootprint): number {
  return (consoleFaceSize(footprint).h / 2) * Math.cos(CONSOLE_FACE_TILT);
}

/**
 * Height of the plate's centre above the console's base.
 *
 * Set so the plate's FAR edge finishes flush with the console's stated height:
 * the visitor meets the near, lower edge, and nothing on the object stands
 * taller than the number that names it.
 */
export function consoleFaceY(
  height: number,
  footprint: ConsoleFootprint
): number {
  return height - consoleFaceDrop(footprint);
}

/** Height of the lectern body, stopping just under the plate's near edge. */
export function consoleBodyHeight(
  height: number,
  footprint: ConsoleFootprint
): number {
  return consoleFaceY(height, footprint) - consoleFaceDrop(footprint) - 0.01;
}

/** Local Y of a row on the plate, measured from the plate's centre. */
export function consoleRowY(v: number, faceH: number): number {
  return faceH / 2 - v * faceH;
}

/** Local X of the nth of count controls spread across the plate. */
export function consoleColumnX(
  index: number,
  count: number,
  faceW: number
): number {
  return ((index + 0.5) / count - 0.5) * faceW;
}

/**
 * How close the visitor must be for the face to wake.
 *
 * Dark from across the room, live at arm's length — the console's only approach
 * behaviour besides the key-light lift on the performer it owns. Nothing dims,
 * nothing fades, and the camera is never taken (§9).
 */
export const CONSOLE_WAKE_M = 3.2;
/** Distance at which the face is fully lit. */
export const CONSOLE_FULL_M = 1.4;

/** The state a performer is bound to, before anyone touched the console. */
export function defaultSettings(boundProp: string): PerformerSettings {
  return {
    traceVisible: true,
    propType: boundProp,
    reversed: false,
    handsSwapped: false,
  };
}

/**
 * A hybrid is a sequence where the two hands are doing different things.
 *
 * Read from the bound steps rather than from a hand-maintained flag, for the
 * same reason the pedestal face is generated rather than drawn: a label can
 * disagree with the sequence it names, and a derivation cannot. In the Cave's
 * three cases this picks out CCCC, whose blue hand is anti and red hand pro.
 */
export function isHybrid(steps: readonly StepData[]): boolean {
  return steps.some(
    (step) => step.motions.left.motionType !== step.motions.right.motionType
  );
}

/**
 * The verbs this console offers, in press order.
 *
 * Three universal, plus one contextual on a hybrid. Never more than four —
 * the diegetic constraint is the design (§9): four large buttons readable at
 * arm's length, not a panel. Any set needing a scrollable list has already
 * lost the argument.
 */
export function verbsFor(hybrid: boolean): ConsoleVerb[] {
  const universal: ConsoleVerb[] = ["trace", "prop", "reverse"];
  return hybrid ? [...universal, "swap-hands"] : universal;
}

/** What each button says on it, and what it teaches. */
export const VERB_LABELS: Record<ConsoleVerb, string> = {
  trace: "Trace",
  prop: "Prop",
  reverse: "Reverse",
  "swap-hands": "Swap hands",
};

/** The next prop in the cycle, wrapping. Unknown props enter at the start. */
export function nextProp(current: string): string {
  const index = CAVE_PROP_CYCLE.findIndex(
    (prop) => prop.toLowerCase() === current.toLowerCase()
  );
  // The modulo keeps this in range, but the compiler cannot know that, and a
  // non-null assertion would hide a real out-of-range bug if the cycle were
  // ever emptied. The first entry is the honest answer to "no next prop".
  return CAVE_PROP_CYCLE[(index + 1) % CAVE_PROP_CYCLE.length] ?? CAVE_PROP_CYCLE[0];
}

/** Press one button. Pure: the caller owns where the new state lives. */
export function applyVerb(
  settings: PerformerSettings,
  verb: ConsoleVerb
): PerformerSettings {
  switch (verb) {
    case "trace":
      return { ...settings, traceVisible: !settings.traceVisible };
    case "prop":
      return { ...settings, propType: nextProp(settings.propType) };
    case "reverse":
      return { ...settings, reversed: !settings.reversed };
    case "swap-hands":
      return { ...settings, handsSwapped: !settings.handsSwapped };
  }
}

/**
 * Has anyone touched this performer?
 *
 * Not for a status light — §11 is explicit that the base is the indicator and
 * the console needs none. This exists so the restore control can be inert when
 * there is nothing to restore, which is a property of a real handle rather than
 * a piece of feedback.
 */
export function isModified(
  settings: PerformerSettings,
  boundProp: string
): boolean {
  const base = defaultSettings(boundProp);
  return (
    settings.traceVisible !== base.traceVisible ||
    settings.propType.toLowerCase() !== base.propType.toLowerCase() ||
    settings.reversed !== base.reversed ||
    settings.handsSwapped !== base.handsSwapped
  );
}
