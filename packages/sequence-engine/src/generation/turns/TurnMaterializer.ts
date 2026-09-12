export type TurnValue = number | "fl" | undefined;

export interface TurnMaterializationSource {
  readonly motionType: string;
  readonly rotationDirection: string;
}

export interface TurnMaterializationOptions {
  previousRotation?: string;
  propContinuity?: "maximize" | "allow-reversals" | "force-reversals";
  random?: () => number;
  /**
   * Direction to give a dash or static that gained turns, instead of the
   * continuity or coin-flip answer. The builder sets it for the left hand when
   * "Match turns" is on and a hand relationship decides the spin (a mirrored
   * dash spins the other way from its partner). A shift keeps its own
   * direction regardless; this never overrides the dataset.
   */
  forcedRotationDirection?: string;
}

export interface MaterializedTurn {
  readonly motionType: string;
  readonly rotationDirection: string;
  readonly turns: TurnValue;
  readonly prefloatMotionType?: string;
  readonly prefloatRotationDirection?: string;
}

/**
 * Apply one allocated turn value to a motion. Float conversion and rotation
 * direction repair live here so every generator produces the same motion data.
 */
export function materializeTurn(
  source: TurnMaterializationSource,
  assignedTurns: TurnValue,
  options: TurnMaterializationOptions = {}
): MaterializedTurn {
  const isShift = source.motionType === "pro" || source.motionType === "anti";
  const isFloat = assignedTurns === "fl" && isShift;
  const turns = isFloat
    ? assignedTurns
    : assignedTurns === "fl"
      ? 0
      : assignedTurns;

  if (isFloat) {
    return {
      motionType: "float",
      rotationDirection: "noRotation",
      turns,
      prefloatMotionType: source.motionType,
      prefloatRotationDirection: source.rotationDirection,
    };
  }

  return {
    motionType: source.motionType,
    rotationDirection: resolveRotationDirection(
      source.rotationDirection,
      turns,
      options
    ),
    turns,
  };
}

/**
 * A dash or static may not carry a direction at zero turns. Once turns are
 * allocated, it needs a real direction for rendering and orientation math.
 */
function resolveRotationDirection(
  original: string,
  turns: TurnValue,
  options: TurnMaterializationOptions
): string {
  const hasTurns = turns !== undefined && turns !== 0;
  const isNoRotation =
    original === "noRotation" || original === "no_rot" || !original;
  if (!hasTurns || !isNoRotation) return original;
  if (options.forcedRotationDirection) return options.forcedRotationDirection;

  const previous = options.previousRotation;
  const hasPrevious =
    previous && previous !== "noRotation" && previous !== "no_rot";
  if (hasPrevious) {
    if (options.propContinuity === "force-reversals") {
      return previous === "cw" ? "ccw" : "cw";
    }
    if (options.propContinuity === "maximize") return previous;
  }

  return (options.random ?? Math.random)() < 0.5 ? "cw" : "ccw";
}
