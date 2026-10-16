/**
 * The package's public types. They import nothing, so the published
 * declarations stand on their own.
 */

export interface MotionInput {
  /** pro, anti, static, dash or float. */
  motionType: string;
  /** cw, ccw or noRotation. */
  rotationDirection: string;
  /** n, e, s, w, or ne, se, sw, nw on the box grid. */
  startLocation: string;
  endLocation: string;
  /** in, out, clock or counter. Defaults to in. */
  startOrientation?: string;
  /** Worked out from the motion when absent. */
  endOrientation?: string;
  hand: "left" | "right";
  /** 0, 0.5, 1, 1.5, 2, 2.5, 3, or "fl" for a float. */
  turns?: number | "fl";
}

/** How the two hands' grids join on a conjoined pictograph. */
export interface GridJoinSpec {
  readonly toward: "n" | "e" | "s" | "w" | "ne" | "se" | "sw" | "nw";
  /** Center distance in hand-point steps: 1 interlocks, 2 meets hand to hand. */
  readonly steps: 1 | 2;
}

export interface PictographInput {
  letter: string;
  /** Such as alpha3. */
  startPlacement?: string;
  endPlacement?: string;
  leftMotion: MotionInput;
  rightMotion: MotionInput;
  /** diamond (default) or box. */
  gridMode?: string;
  /** Whether the left hand's motion reverses direction from the previous beat. */
  leftReversal?: boolean;
  /** Whether the right hand's motion reverses direction from the previous beat. */
  rightReversal?: boolean;
  /** Whether the beta offset is swapped between hands. */
  betaSwapped?: boolean;
  /** Draws each hand on its own grid, the blue grid the anchor. Absent or null draws one shared grid. */
  conjoined?: GridJoinSpec | null;
}

export interface HandColorPair {
  left: string;
  right: string;
}

export interface FanAppearanceInput {
  build?: "pictograph" | "fire" | "flat-grip" | "lotus" | "day" | "moon";
  frameColor?: "black" | "white";
  cover?: "bare" | "covered";
}

export interface RenderVisibilityOptions {
  darkMode?: boolean;
  /** PNG size in the knowledge server; the SVG is always a 950 unit square. */
  size?: number;
  showTKA?: boolean;
  showTND?: boolean;
  showElemental?: boolean;
  showPlacements?: boolean;
  showReversals?: boolean;
  /** Start-placement legend: left and right swatches in the bottom-centre band. */
  showHandColorKey?: boolean;
  showGrid?: boolean;
  showNonRadialPoints?: boolean;
  showLeftMotion?: boolean;
  showRightMotion?: boolean;
  /** Prop art for each hand; null draws a staff. */
  leftPropType?: string | null;
  rightPropType?: string | null;
  /** Physical fan build used when either hand holds fan or bigfan. */
  fanAppearance?: FanAppearanceInput | null;
  primaryPropColors?: HandColorPair | null;
}
