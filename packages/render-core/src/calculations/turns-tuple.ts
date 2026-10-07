/**
 * Turns tuple
 *
 * The turns tuple keys special arrow placements and drives the glyph's turns
 * column and same/opposite direction dot. It depends on the letter's type:
 *
 * - Type 1 hybrid (C F I L O R U V): "(pro, anti)", or "(left, right)" with a float
 * - Type 1 (every other plain letter): "(left, right)"
 * - Type 2 (W X Y Z Σ Δ Θ Ω): "(shift, static)" or "(s|o, shift, static)"
 * - Type 3 (W- … Ω-): "(shift, dash)" or "(s|o, shift, dash)"
 * - Type 4 (Φ Ψ Λ): "(dash, static)", "(cw|ccw, dash, static)" or "(s|o, dash, static)";
 *   Λ adds the props' opening/closing state
 * - Type 5 (Φ- Ψ- Λ-) and Type 6 (α β γ): "(left, right)", "(cw|ccw, left, right)"
 *   or "(s|o, left, right)"; Λ- and γ add the props' opening/closing state
 *
 * This was the app's TurnsTupleGenerator (a port of the legacy desktop
 * turns_tuple_generator). It lives here so the app and the MCP renderers key
 * placements and draw the direction dot from one rule.
 */

export interface TurnsTupleMotion {
  motionType: string;
  rotationDirection?: string | null;
  turns?: number | "fl" | null;
  endLocation: string;
  prefloatRotationDirection?: string | null;
  isVisible?: boolean;
  /** A halved motion's span; the midpoint half marks its turns with "/". */
  segment?: { t0: number; t1: number } | null;
}

type Turns = number | "fl";

const OPENING = "op";
const CLOSING = "cl";

/**
 * Whether a prop turning in `rotationDirection` opens away from or closes
 * toward the other hand, keyed `leftEnd|rightEnd|direction`. Written from the
 * left hand's point of view; the right hand reads the same pairs reversed.
 */
const LEFT_PROP_ROTATION_STATE: ReadonlyMap<string, string> = new Map(
  (
    [
      ["e", "n", OPENING],
      ["e", "s", CLOSING],
      ["w", "n", CLOSING],
      ["w", "s", OPENING],
      ["n", "e", CLOSING],
      ["n", "w", OPENING],
      ["s", "e", OPENING],
      ["s", "w", CLOSING],
      ["ne", "se", CLOSING],
      ["ne", "nw", OPENING],
      ["se", "ne", OPENING],
      ["se", "sw", CLOSING],
      ["sw", "nw", CLOSING],
      ["sw", "se", OPENING],
      ["nw", "sw", OPENING],
      ["nw", "ne", CLOSING],
    ] as const
  ).flatMap(([left, right, clockwise]) => [
    [`${left}|${right}|cw`, clockwise],
    [`${left}|${right}|ccw`, clockwise === OPENING ? CLOSING : OPENING],
  ])
);

function rotationState(
  leftEnd: string,
  rightEnd: string,
  rotationDirection: string | null | undefined,
  fromRight: boolean
): string {
  const state = LEFT_PROP_ROTATION_STATE.get(
    `${leftEnd}|${rightEnd}|${rotationDirection}`
  );
  if (!state) return "";
  if (!fromRight) return state;
  return state === OPENING ? CLOSING : OPENING;
}

/** Opening/closing state of the left prop (also a Λ dash prop). */
export function leftPropRotationState(
  leftEnd: string,
  rightEnd: string,
  rotationDirection: string | null | undefined
): string {
  return rotationState(leftEnd, rightEnd, rotationDirection, false);
}

/** Opening/closing state of the right prop (also a Λ static prop). */
export function rightPropRotationState(
  leftEnd: string,
  rightEnd: string,
  rotationDirection: string | null | undefined
): string {
  return rotationState(leftEnd, rightEnd, rotationDirection, true);
}

type LetterType =
  | "TYPE1_HYBRID"
  | "TYPE1_NON_HYBRID"
  | "TYPE2"
  | "TYPE3"
  | "TYPE4"
  | "TYPE5"
  | "TYPE6";

function letterType(letter: string | null | undefined): LetterType {
  if (!letter) return "TYPE1_NON_HYBRID";
  if (["Φ-", "Ψ-", "Λ-"].includes(letter)) return "TYPE5";
  if (["α", "β", "γ"].includes(letter)) return "TYPE6";
  if (letter.endsWith("-")) return "TYPE3";
  if (["Φ", "Ψ", "Λ"].includes(letter)) return "TYPE4";
  if (["W", "X", "Y", "Z", "Σ", "Δ", "Θ", "Ω"].includes(letter)) return "TYPE2";
  if (["C", "F", "I", "L", "O", "R", "U", "V"].includes(letter)) {
    return "TYPE1_HYBRID";
  }
  return "TYPE1_NON_HYBRID";
}

/**
 * The turns tuple for a pictograph. An absent or invisible hand gives "(0, 0)",
 * as do malformed motions.
 */
export function generateTurnsTuple(
  letter: string | null | undefined,
  left: TurnsTupleMotion | null | undefined,
  right: TurnsTupleMotion | null | undefined
): string {
  if (!left || left.isVisible === false || !right || right.isVisible === false) {
    return "(0, 0)";
  }
  try {
    switch (letterType(letter)) {
      case "TYPE1_HYBRID":
        return type1HybridTuple(left, right);
      case "TYPE2":
        return type2Tuple(left, right);
      case "TYPE3":
        return type3Tuple(left, right);
      case "TYPE4":
        return type4Tuple(left, right, letter ?? undefined);
      case "TYPE5":
        return type5Tuple(left, right, letter ?? undefined);
      case "TYPE6":
        return type6Tuple(left, right, letter ?? undefined);
      default:
        return pair(left, right);
    }
  } catch {
    return "(0, 0)";
  }
}

/** "s" or "o" when the tuple marks the props turning the same or opposite way. */
export function turnsTupleDirection(tuple: string): "s" | "o" | null {
  const first = tuple.replace(/[()]/g, "").split(",")[0]?.trim();
  return first === "s" || first === "o" ? first : null;
}

function lower(value: string | null | undefined): string {
  return (value ?? "").toLowerCase();
}

function rotation(motion: TurnsTupleMotion, fallback: string): string {
  return lower(motion.rotationDirection) || fallback;
}

function normalizeTurns(motion: TurnsTupleMotion): Turns {
  const turns = motion.turns;
  if (lower(motion.motionType) === "float" || turns === "fl") return "fl";
  if (typeof turns === "number") {
    return turns === Math.floor(turns) ? Math.floor(turns) : turns;
  }
  return 0;
}

/**
 * "/" marks a midpoint-halved motion only (the half-notation canon's v1
 * scope); other segment fractions must not emit it yet.
 */
function formatTurns(turns: Turns | null | undefined, motion?: TurnsTupleMotion): string {
  const base =
    typeof turns === "number"
      ? turns === Math.floor(turns)
        ? Math.floor(turns).toString()
        : turns.toString()
      : String(turns);
  const isMidpointSegment =
    motion?.segment?.t0 === 0 && motion.segment.t1 === 0.5;
  return isMidpointSegment ? `${base}/` : base;
}

function pair(left: TurnsTupleMotion, right: TurnsTupleMotion): string {
  return `(${formatTurns(normalizeTurns(left), left)}, ${formatTurns(normalizeTurns(right), right)})`;
}

function type1HybridTuple(left: TurnsTupleMotion, right: TurnsTupleMotion): string {
  if (lower(left.motionType) === "float" || lower(right.motionType) === "float") {
    return pair(left, right);
  }
  const pro = lower(left.motionType) === "pro" ? left : right;
  const anti = lower(left.motionType) === "anti" ? left : right;
  return `(${formatTurns(pro.turns, pro)}, ${formatTurns(anti.turns, anti)})`;
}

function type2Tuple(left: TurnsTupleMotion, right: TurnsTupleMotion): string {
  const isShift = (motion: TurnsTupleMotion) =>
    ["pro", "anti", "float"].includes(lower(motion.motionType));
  const shift = isShift(left) ? left : right;
  const still = isShift(left) ? right : left;
  const shiftType = lower(shift.motionType);
  const shiftTurns = normalizeTurns(shift);
  const staticTurns = normalizeTurns(still);
  const plain = `(${formatTurns(shiftTurns, shift)}, ${formatTurns(staticTurns, still)})`;

  if (shiftType !== "pro" && shiftType !== "anti" && shiftType !== "float") {
    return plain;
  }
  const staticTurnsWithRotation =
    typeof staticTurns === "number" &&
    staticTurns !== 0 &&
    lower(still.rotationDirection) !== "norotation";
  if (!staticTurnsWithRotation) return plain;

  const reference =
    shiftType === "float"
      ? lower(shift.prefloatRotationDirection) || "norotation"
      : rotation(shift, "norotation");
  const direction = rotation(still, "norotation") === reference ? "s" : "o";
  return `(${direction}, ${formatTurns(shiftTurns, shift)}, ${formatTurns(staticTurns, still)})`;
}

function type3Tuple(left: TurnsTupleMotion, right: TurnsTupleMotion): string {
  const dashIsLeft = lower(left.motionType) === "dash";
  const shift = dashIsLeft ? right : left;
  const dash = dashIsLeft ? left : right;
  const shiftType = lower(shift.motionType);
  const shiftTurns = normalizeTurns(shift);
  const dashTurns = normalizeTurns(dash);
  const dashRotation = rotation(dash, "norotation");
  const plain = `(${formatTurns(shiftTurns, shift)}, ${formatTurns(dashTurns, dash)})`;

  if (shiftType === "pro" || shiftType === "anti") {
    if (typeof dashTurns === "number" && dashTurns > 0) {
      const direction = dashRotation === rotation(shift, "norotation") ? "s" : "o";
      return `(${direction}, ${formatTurns(shiftTurns, shift)}, ${formatTurns(dashTurns, dash)})`;
    }
    return plain;
  }
  if (shiftType === "float") {
    if (
      typeof dashTurns === "number" &&
      dashTurns !== 0 &&
      dashRotation !== "norotation"
    ) {
      const prefloat = lower(shift.prefloatRotationDirection) || "norotation";
      const direction = dashRotation === prefloat ? "s" : "o";
      return `(${direction}, ${formatTurns(shiftTurns, shift)}, ${formatTurns(dashTurns, dash)})`;
    }
  }
  return plain;
}

/** One hand turns: its direction; both: same or opposite; neither: plain. */
function turningTuple(
  first: TurnsTupleMotion,
  firstTurns: Turns,
  second: TurnsTupleMotion,
  secondTurns: Turns
): string {
  const turns = `${formatTurns(firstTurns, first)}, ${formatTurns(secondTurns, second)}`;
  if (firstTurns === 0 && secondTurns === 0) return `(${turns})`;
  if (firstTurns === 0 || secondTurns === 0) {
    const turning = firstTurns !== 0 ? first : second;
    return `(${rotation(turning, "cw")}, ${turns})`;
  }
  const direction =
    rotation(first, "norotation") === rotation(second, "norotation") ? "s" : "o";
  return `(${direction}, ${turns})`;
}

function type4Tuple(
  left: TurnsTupleMotion,
  right: TurnsTupleMotion,
  letter?: string
): string {
  const dashIsLeft = lower(left.motionType) === "dash";
  const dash = dashIsLeft ? left : right;
  const still = dashIsLeft ? right : left;
  const dashTurns = normalizeTurns(dash);
  const staticTurns = normalizeTurns(still);
  if (letter === "Λ") {
    // Λ reads the dash prop as the left map and the static prop as the right.
    return openCloseTuple(dash, dashTurns, still, staticTurns);
  }
  return turningTuple(dash, dashTurns, still, staticTurns);
}

function type5Tuple(
  left: TurnsTupleMotion,
  right: TurnsTupleMotion,
  letter?: string
): string {
  const leftTurns = normalizeTurns(left);
  const rightTurns = normalizeTurns(right);
  if (letter === "Λ-") return openCloseTuple(left, leftTurns, right, rightTurns);
  return turningTuple(left, leftTurns, right, rightTurns);
}

function type6Tuple(
  left: TurnsTupleMotion,
  right: TurnsTupleMotion,
  letter?: string
): string {
  const leftTurns = normalizeTurns(left);
  const rightTurns = normalizeTurns(right);
  if (letter === "γ") return openCloseTuple(left, leftTurns, right, rightTurns);
  return turningTuple(left, leftTurns, right, rightTurns);
}

/**
 * Λ, Λ- and γ: the turning props also say whether they open or close. `first`
 * is read with the left map and `second` with the right map, both keyed by
 * (first end, second end).
 */
function openCloseTuple(
  first: TurnsTupleMotion,
  firstTurns: Turns,
  second: TurnsTupleMotion,
  secondTurns: Turns
): string {
  const turns = `${formatTurns(firstTurns, first)}, ${formatTurns(secondTurns, second)}`;
  const firstState = () =>
    leftPropRotationState(first.endLocation, second.endLocation, first.rotationDirection);
  const secondState = () =>
    rightPropRotationState(first.endLocation, second.endLocation, second.rotationDirection);
  const firstTurning = typeof firstTurns === "number" && firstTurns > 0;
  const secondTurning = typeof secondTurns === "number" && secondTurns > 0;

  if (firstTurns === 0 && secondTurns === 0) return `(${turns})`;
  if (firstTurns === 0 && secondTurning) return `(${turns}, ${secondState()})`;
  if (firstTurning && secondTurns === 0) return `(${turns}, ${firstState()})`;
  if (firstTurning && secondTurning) {
    const direction =
      first.rotationDirection === second.rotationDirection ? "s" : "o";
    return `(${direction}, ${turns}, ${firstState()}, ${secondState()})`;
  }
  return `(${turns})`;
}
