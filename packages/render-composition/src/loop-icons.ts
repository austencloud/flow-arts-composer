import type { LOOPComponentId } from "./types.js";
import { drawSvgPath } from "./svg-path-painter.js";
import { LOOP_ICON_GAP_SCALE, LOOP_ICON_DOT_SIZE_SCALE, LOOP_ICON_DOT_OPACITY } from "./dimensions.js";

/**
 * Rotation period for the rotated LOOP icon.
 * "halved" (180°) renders fa-rotate; "quartered" (90°) renders fa-arrows-spin.
 */
export type LoopRotationPeriod = "halved" | "quartered";

/**
 * Inversion period for the inverted LOOP icon.
 * "halved" (180°) renders circle-half-stroke; "quartered" (90°) renders checkerboard circle.
 */
export type LoopInversionPeriod = "halved" | "quartered";

/** Reflection axes supported by the compositional LOOP spec. */
export type LoopReflectionAxis =
  | "north-south"
  | "east-west"
  | "northeast-southwest"
  | "northwest-southeast";

export interface ReflectionIconTransform {
  axis: LoopReflectionAxis;
  rotationDegrees: 0 | 45 | 90 | -45;
  scale: number;
}

const REFLECTION_ICON_ROTATIONS: Record<
  LoopReflectionAxis,
  ReflectionIconTransform["rotationDegrees"]
> = {
  "north-south": 0,
  "east-west": 90,
  "northeast-southwest": 45,
  "northwest-southeast": -45,
};

/**
 * Resolve the shared Reflection glyph transform.
 *
 * The double-ended arrow points across the fixed reflection axis: horizontal
 * for the north-south axis, vertical for east-west, and perpendicular to each
 * diagonal axis. Legacy Mirrored and Flipped components provide their familiar
 * axis when an explicit axis was not stored.
 */
export function getReflectionIconTransform(
  component: LOOPComponentId,
  reflectionAxis?: LoopReflectionAxis
): ReflectionIconTransform | null {
  if (component !== "mirrored" && component !== "flipped") return null;

  const axis =
    reflectionAxis ??
    (component === "flipped" ? "east-west" : "north-south");
  const rotationDegrees = REFLECTION_ICON_ROTATIONS[axis];

  return {
    axis,
    rotationDegrees,
    // A square rotated 45° grows by √2. Scale diagonal arrows back into the
    // same reserved icon cell so switching axes cannot collide with neighbors.
    scale: Math.abs(rotationDegrees) === 45 ? Math.SQRT1_2 : 1,
  };
}

// The 6 active LOOP components in the order they appear in the icon strip
const DISPLAY_ORDER: LOOPComponentId[] = [
  "rotated",
  "mirrored",
  "flipped",
  "swapped",
  "inverted",
  "rewound",
];

// FA7 solid icon SVG path data for each LOOP component, embedded to avoid
// runtime file reads. Each path comes from the corresponding icon in
// @fortawesome/fontawesome-free/svgs/solid/
export const LOOP_ICON_PATHS: Record<LOOPComponentId | "freeform" | "rotated-quartered" | "inverted-quartered", { d: string; viewBox: [number, number] }> = {
  // rotate.svg — viewBox 0 0 512 512 — used for halved (180°) rotations
  rotated: {
    d: "M480.1 192l7.9 0c13.3 0 24-10.7 24-24l0-144c0-9.7-5.8-18.5-14.8-22.2S477.9 .2 471 7L419.3 58.8C375 22.1 318 0 256 0 127 0 20.3 95.4 2.6 219.5 .1 237 12.2 253.2 29.7 255.7s33.7-9.7 36.2-27.1C79.2 135.5 159.3 64 256 64 300.4 64 341.2 79 373.7 104.3L327 151c-6.9 6.9-8.9 17.2-5.2 26.2S334.3 192 344 192l136.1 0zm29.4 100.5c2.5-17.5-9.7-33.7-27.1-36.2s-33.7 9.7-36.2 27.1c-13.3 93-93.4 164.5-190.1 164.5-44.4 0-85.2-15-117.7-40.3L185 361c6.9-6.9 8.9-17.2 5.2-26.2S177.7 320 168 320L24 320c-13.3 0-24 10.7-24 24L0 488c0 9.7 5.8 18.5 14.8 22.2S34.1 511.8 41 505l51.8-51.8C137 489.9 194 512 256 512 385 512 491.7 416.6 509.4 292.5z",
    viewBox: [512, 512],
  },

  // arrows-spin.svg — viewBox 0 0 512 512 — used for quartered (90°) rotations
  // Renders as 4 arrows arranged around a center point, matching the
  // fa-arrows-spin glyph. Swapped in when rotationPeriod is "quartered"
  // so a performer can see at a glance that the sequence rotates 4 times
  // (90° each) versus 2 times (180° each).
  "rotated-quartered": {
    d: "M481.7 240.1c-17.6-1.2-32.9 12-34.2 29.7-3.3 47-23.6 89.4-54.8 121L361 359c-6.9-6.9-17.2-8.9-26.2-5.2S320 366.3 320 376l0 112c0 13.3 10.7 24 24 24l112 0c9.7 0 18.5-5.8 22.2-14.8s1.7-19.3-5.2-26.2l-35-35c41.7-42.2 68.9-98.8 73.4-161.8 1.2-17.6-12-32.9-29.7-34.2zM39 41L74 76c-41.7 42.2-68.9 98.8-73.4 161.8-1.2 17.6 12 32.9 29.7 34.2s32.9-12 34.2-29.7c3.3-47 23.6-89.4 54.8-121L151 153c6.9 6.9 17.2 8.9 26.2 5.2S192 145.7 192 136l0-112c0-13.3-10.7-24-24-24L56 0C46.3 0 37.5 5.8 33.8 14.8S32.2 34.1 39 41zm201-10.7c-1.2 17.6 12 32.9 29.7 34.2 47 3.3 89.4 23.6 121 54.8L359 151c-6.9 6.9-8.9 17.2-5.2 26.2S366.3 192 376 192l112 0c13.3 0 24-10.7 24-24l0-112c0-9.7-5.8-18.5-14.8-22.2S477.9 32.2 471 39L436 74c-42.2-41.7-98.8-68.9-161.8-73.4-17.6-1.2-32.9 12-34.2 29.7zM41 473l35-35c42.2 41.7 98.8 68.9 161.8 73.4 17.6 1.2 32.9-12 34.2-29.7s-12-32.9-29.7-34.2c-47-3.3-89.4-23.6-121-54.8L153 361c6.9-6.9 8.9-17.2 5.2-26.2S145.7 320 136 320L24 320c-13.3 0-24 10.7-24 24L0 456c0 9.7 5.8 18.5 14.8 22.2S34.1 479.8 41 473z",
    viewBox: [512, 512],
  },

  // arrows-left-right.svg — viewBox 0 0 576 512
  mirrored: {
    d: "M470.6 374.6l96-96c12.5-12.5 12.5-32.8 0-45.3l-96-96c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l41.4 41.4-357.5 0 41.4-41.4c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-96 96c-6 6-9.4 14.1-9.4 22.6s3.4 16.6 9.4 22.6l96 96c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3l-41.4-41.4 357.5 0-41.4 41.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0z",
    viewBox: [576, 512],
  },

  // arrows-up-down.svg — viewBox 0 0 256 512
  flipped: {
    d: "M150.6-22.6c-12.5-12.5-32.8-12.5-45.3 0l-96 96c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L96 77.3 96 434.7 54.6 393.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3l96 96c6 6 14.1 9.4 22.6 9.4s16.6-3.4 22.6-9.4l96-96c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0l-41.4 41.4 0-357.5 41.4 41.4c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3l-96-96z",
    viewBox: [256, 512],
  },

  // shuffle.svg — viewBox 0 0 512 512
  swapped: {
    d: "M403.8 34.4c12-5 25.7-2.2 34.9 6.9l64 64c6 6 9.4 14.1 9.4 22.6s-3.4 16.6-9.4 22.6l-64 64c-9.2 9.2-22.9 11.9-34.9 6.9S384 204.9 384 192l0-32-32 0c-10.1 0-19.6 4.7-25.6 12.8l-32.4 43.2-40-53.3 21.2-28.3C293.3 110.2 321.8 96 352 96l32 0 0-32c0-12.9 7.8-24.6 19.8-29.6zM154 296l40 53.3-21.2 28.3C154.7 401.8 126.2 416 96 416l-64 0c-17.7 0-32-14.3-32-32s14.3-32 32-32l64 0c10.1 0 19.6-4.7 25.6-12.8L154 296zM438.6 470.6c-9.2 9.2-22.9 11.9-34.9 6.9S384 460.9 384 448l0-32-32 0c-30.2 0-58.7-14.2-76.8-38.4L121.6 172.8c-6-8.1-15.5-12.8-25.6-12.8l-64 0c-17.7 0-32-14.3-32-32S14.3 96 32 96l64 0c30.2 0 58.7 14.2 76.8 38.4L326.4 339.2c6 8.1 15.5 12.8 25.6 12.8l32 0 0-32c0-12.9 7.8-24.6 19.8-29.6s25.7-2.2 34.9 6.9l64 64c6 6 9.4 14.1 9.4 22.6s-3.4 16.6-9.4 22.6l-64 64z",
    viewBox: [512, 512],
  },

  // circle-half-stroke.svg — viewBox 0 0 512 512 — used for halved (180°) inversions
  inverted: {
    d: "M448 256c0-106-86-192-192-192l0 384c106 0 192-86 192-192zM0 256a256 256 0 1 1 512 0 256 256 0 1 1 -512 0z",
    viewBox: [512, 512],
  },

  // Checkerboard circle — viewBox 0 0 512 512 — used for quartered (90°) inversions
  // Outer circle CW + inner circle CCW = donut ring (nonzero fill rule).
  // Two diagonal quadrant pies (top-right + bottom-left) fill inside the ring.
  "inverted-quartered": {
    d: "M256 0C397.4 0 512 114.6 512 256C512 397.4 397.4 512 256 512C114.6 512 0 397.4 0 256C0 114.6 114.6 0 256 0ZM256 64C150 64 64 150 64 256C64 362 150 448 256 448C362 448 448 362 448 256C448 150 362 64 256 64ZM256 256L256 64C362 64 448 150 448 256ZM256 256L256 448C150 448 64 362 64 256Z",
    viewBox: [512, 512],
  },

  // backward.svg — viewBox 0 0 576 512
  rewound: {
    d: "M204.3 43.1C215.9 32 233 28.9 247.7 35.2S272 56 272 72l0 136.3 172.3-165.1C455.9 32 473 28.9 487.7 35.2S512 56 512 72l0 368c0 16-9.6 30.5-24.3 36.8s-31.8 3.2-43.4-7.9L272 303.7 272 440c0 16-9.6 30.5-24.3 36.8s-31.8 3.2-43.4-7.9l-192-184C4.5 277.3 0 266.9 0 256s4.5-21.3 12.3-28.9l192-184z",
    viewBox: [576, 512],
  },

  // infinity.svg — viewBox 0 0 640 512
  freeform: {
    d: "M0 256c0-88.4 71.6-160 160-160 50.4 0 97.8 23.7 128 64l32 42.7 32-42.7c30.2-40.3 77.6-64 128-64 88.4 0 160 71.6 160 160S568.4 416 480 416c-50.4 0-97.8-23.7-128-64l-32-42.7-32 42.7c-30.2 40.3-77.6 64-128 64-88.4 0-160-71.6-160-160zm280 0l-43.2-57.6c-18.1-24.2-46.6-38.4-76.8-38.4-53 0-96 43-96 96s43 96 96 96c30.2 0 58.7-14.2 76.8-38.4L280 256zm80 0l43.2 57.6c18.1 24.2 46.6 38.4 76.8 38.4 53 0 96-43 96-96s-43-96-96-96c-30.2 0-58.7 14.2-76.8 38.4L360 256z",
    viewBox: [640, 512],
  },
};

/** Brand colors for each LOOP component — shared between app and MCP render output */
export const LOOP_ICON_COLORS: Record<LOOPComponentId | "freeform", string> = {
  rotated: "#36c3ff",
  mirrored: "#6F2DA8",
  flipped: "#6F2DA8",
  swapped: "#2ecc71",
  inverted: "#eb7d00",
  rewound: "#00bcd4",
  freeform: "#9e9e9e",
};

/**
 * Render a horizontal strip of LOOP component icons onto a Canvas 2D context.
 *
 * Each icon is drawn as a Font Awesome solid glyph scaled uniformly into a
 * square bounding box. Active components are drawn left-to-right in canonical
 * order with a small gap between them. When no components are active and
 * showFreeformWhenEmpty is true, a single grey infinity icon is drawn instead
 * to indicate an unconstrained (freeform) loop.
 *
 * When rotationPeriod is "quartered", the rotated icon swaps from
 * fa-rotate (two loopy arrows) to fa-arrows-spin (four outward arrows), so
 * exported images and the live animator header show a different glyph for
 * 90° LOOPs vs 180° LOOPs.
 * @param ctx                  - Canvas 2D context to draw on
 * @param components           - Set of active LOOP component identifiers
 * @param centerX              - Horizontal center of the icon strip
 * @param centerY              - Vertical center of the icon strip
 * @param iconSize             - Width and height of each icon in canvas pixels
 * @param darkMode             - Whether to apply dark-mode shadow styling
 * @param showFreeformWhenEmpty - Draw the freeform icon when the set is empty
 * @param rotationPeriod    - "quartered" swaps rotated → fa-arrows-spin
 * @param inversionPeriod   - "quartered" swaps inverted → checkerboard circle
 * @param overlayComponents - Components rendered LAST, after one faded
 *                            separator dot — same segment grammar as the
 *                            word display's group-dot. Absent/empty is
 *                            pixel-identical to the pre-overlay strip.
 * @param reflectionAxis    - Exact reflection axis for Mirrored/Flipped.
 *                            Legacy components supply their default axis.
 * @returns                    The total rendered width in canvas pixels
 */
export function renderLoopIconStrip(
  ctx: CanvasRenderingContext2D,
  components: Set<LOOPComponentId>,
  centerX: number,
  centerY: number,
  iconSize: number,
  darkMode: boolean,
  showFreeformWhenEmpty: boolean = false,
  rotationPeriod?: LoopRotationPeriod,
  inversionPeriod?: LoopInversionPeriod,
  overlayComponents?: Set<LOOPComponentId>,
  reflectionAxis?: LoopReflectionAxis
): { totalWidth: number } {
  const active = DISPLAY_ORDER.filter((c) => components.has(c));

  if (active.length === 0) {
    if (showFreeformWhenEmpty) {
      drawLoopIcon(ctx, "freeform", centerX, centerY, iconSize, LOOP_ICON_COLORS.freeform, darkMode);
    }
    return { totalWidth: showFreeformWhenEmpty ? iconSize : 0 };
  }

  const gap = Math.max(2, Math.round(iconSize * LOOP_ICON_GAP_SCALE));
  const items = buildStripItems(active, overlayComponents);
  const totalWidth = stripWidthFromItems(items, iconSize, gap);
  let currentX = centerX - totalWidth / 2;

  for (const item of items) {
    const itemSize = item.kind === "dot" ? iconSize * LOOP_ICON_DOT_SIZE_SCALE : iconSize;
    const itemCenterX = currentX + itemSize / 2;

    if (item.kind === "dot") {
      drawLoopIconDot(ctx, itemCenterX, centerY, itemSize, darkMode);
    } else {
      const component = item.component;
      const reflectionTransform = getReflectionIconTransform(
        component,
        reflectionAxis
      );
      const pathKey = reflectionTransform
        ? "mirrored"
        : component === "rotated" && rotationPeriod === "quartered"
          ? "rotated-quartered"
          : component === "inverted" && inversionPeriod === "quartered"
            ? "inverted-quartered"
            : component;
      drawLoopIcon(
        ctx,
        pathKey,
        itemCenterX,
        centerY,
        iconSize,
        LOOP_ICON_COLORS[component],
        darkMode,
        reflectionTransform?.rotationDegrees,
        reflectionTransform?.scale
      );
    }

    currentX += itemSize + gap;
  }

  return { totalWidth };
}

/** One rendered slot in the icon strip: either an active component's icon, or the overlay separator dot. */
type StripItem = { kind: "icon"; component: LOOPComponentId } | { kind: "dot" };

/**
 * Partition active components into expand-mode (rendered first, in
 * DISPLAY_ORDER) and overlay-mode (rendered last, in DISPLAY_ORDER),
 * inserting one separator dot between the two groups when both are
 * non-empty. When overlayComponents is absent/empty, this returns exactly
 * the original active-icon sequence with no dot — pixel-identical to the
 * pre-overlay strip.
 */
function buildStripItems(
  active: LOOPComponentId[],
  overlayComponents?: Set<LOOPComponentId>
): StripItem[] {
  const overlaySet = overlayComponents ?? new Set<LOOPComponentId>();
  const expandActive = active.filter((c) => !overlaySet.has(c));
  const overlayActive = active.filter((c) => overlaySet.has(c));
  const hasSeparator = expandActive.length > 0 && overlayActive.length > 0;

  return [
    ...expandActive.map((component): StripItem => ({ kind: "icon", component })),
    ...(hasSeparator ? ([{ kind: "dot" }] as StripItem[]) : []),
    ...overlayActive.map((component): StripItem => ({ kind: "icon", component })),
  ];
}

function stripWidthFromItems(items: StripItem[], iconSize: number, gap: number): number {
  if (items.length === 0) return 0;
  const dotSize = iconSize * LOOP_ICON_DOT_SIZE_SCALE;
  const sum = items.reduce((total, item) => total + (item.kind === "dot" ? dotSize : iconSize), 0);
  return sum + (items.length - 1) * gap;
}

/**
 * Compute the total rendered width of the icon strip WITHOUT drawing it.
 * Callers (e.g. header-renderer.ts) use this to center the strip before
 * calling renderLoopIconStrip — must stay in exact sync with the width
 * renderLoopIconStrip itself produces, including the overlay separator dot.
 */
export function computeLoopIconStripWidth(
  components: Set<LOOPComponentId>,
  iconSize: number,
  overlayComponents?: Set<LOOPComponentId>
): number {
  const active = DISPLAY_ORDER.filter((c) => components.has(c));
  if (active.length === 0) return 0;
  const gap = Math.max(2, Math.round(iconSize * LOOP_ICON_GAP_SCALE));
  const items = buildStripItems(active, overlayComponents);
  return stripWidthFromItems(items, iconSize, gap);
}

function drawLoopIconDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  darkMode: boolean
): void {
  ctx.save();
  ctx.globalAlpha = LOOP_ICON_DOT_OPACITY;
  ctx.fillStyle = darkMode ? "#ffffff" : "#1f2937";
  ctx.beginPath();
  ctx.arc(x, y, size / 2, 0, 2 * Math.PI);
  ctx.fill();
  ctx.restore();
}

function drawLoopIcon(
  ctx: CanvasRenderingContext2D,
  component: LOOPComponentId | "freeform" | "rotated-quartered" | "inverted-quartered",
  x: number,
  y: number,
  size: number,
  color: string,
  darkMode: boolean,
  rotationDegrees: number = 0,
  iconScale: number = 1
): void {
  const iconData = LOOP_ICON_PATHS[component];
  if (!iconData) return;

  ctx.save();

  // Drop shadow matching the app's LOOPIconStripRenderer
  ctx.shadowColor = darkMode ? "rgba(0, 0, 0, 0.5)" : "rgba(0, 0, 0, 0.3)";
  ctx.shadowBlur = 2;
  ctx.shadowOffsetY = 1;

  ctx.fillStyle = color;

  ctx.translate(x, y);
  if (rotationDegrees !== 0) {
    ctx.rotate((rotationDegrees * Math.PI) / 180);
  }

  const drawnSize = size * iconScale;
  const target = {
    x: -drawnSize / 2,
    y: -drawnSize / 2,
    width: drawnSize,
    height: drawnSize,
  };
  drawSvgPath(ctx, iconData.d, { width: iconData.viewBox[0], height: iconData.viewBox[1] }, target);
  ctx.fill();

  ctx.restore();
}
