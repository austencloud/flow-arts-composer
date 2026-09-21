/**
 * Start-position hand colour key
 *
 * The start pictograph carries a small legend that says which prop colour is
 * the left hand and which is the right. It sits in the bottom-centre band of
 * the 950-unit viewBox, the one slot no other glyph uses: the TKA letter owns
 * bottom-left, TnD owns bottom-right, positions own top-centre and "Start"
 * owns top-left. The band starts where the south outer grid point ends (800)
 * and runs to the viewBox edge (950), so the key is centred at 875.
 *
 * This is the SINGLE SOURCE OF TRUTH for the key's geometry. PictographRenderer
 * (browser) and the MCP standalone renderer both lay it out from here so the
 * viewer, the choreo card back and MCP images all bake in the same key.
 */

export const HAND_COLOR_KEY = {
  /** Vertical centre of the bottom glyph band (grid ends at 800, box at 950). */
  CENTER_Y: 875,
  /** Swatch radius. Smaller than the old 28 so the pair reads as a label, not a prop. */
  SWATCH_RADIUS: 20,
  /** Same family and weight as the step number and the letter fallback. */
  FONT_FAMILY: "Gelasio, Georgia, serif",
  FONT_WEIGHT: "bold",
  FONT_SIZE: 64,
  /** Gap from swatch edge to the letter's left side. */
  LABEL_GAP: 12,
  /** Advance width of a bold Georgia "L"/"R" at FONT_SIZE, used only for centring. */
  LABEL_WIDTH: 44,
  /** Space between the two swatch+letter pairs. */
  PAIR_GAP: 48,
  /** Half the cap height at FONT_SIZE: baseline sits this far below CENTER_Y. */
  BASELINE_OFFSET: 23,
} as const;

export interface HandColorKeyEntry {
  hand: "left" | "right";
  label: "L" | "R";
  /** Swatch centre x, relative to the band's horizontal centre. */
  swatchX: number;
  /** Letter start x (text-anchor start), relative to the band's horizontal centre. */
  labelX: number;
}

export interface HandColorKeyLayout {
  centerY: number;
  swatchRadius: number;
  /** Text baseline y for the labels. */
  baselineY: number;
  entries: HandColorKeyEntry[];
}

/** The small Canvas 2D surface shared by browser and NAPI canvas renderers. */
export interface HandColorKeyCanvasContext {
  save(): void;
  restore(): void;
  beginPath(): void;
  arc(
    x: number,
    y: number,
    radius: number,
    startAngle: number,
    endAngle: number
  ): void;
  fill(): void;
  fillText(text: string, x: number, y: number): void;
  font: string;
  textAlign: string;
  textBaseline: string;
  fillStyle: unknown;
}

export interface DrawHandColorKeyOptions {
  showLeft: boolean;
  showRight: boolean;
  /** Output pixels per 950-unit viewBox. */
  scale: number;
  /** Output-pixel centre of the 950-unit viewBox. */
  centerX: number;
  textColor: string;
  colorForHand: (hand: HandColorKeyEntry["hand"]) => string;
}

export interface RenderHandColorKeySvgOptions {
  showLeft: boolean;
  showRight: boolean;
  centerX: number;
  textColor: string;
  colorForHand: (hand: HandColorKeyEntry["hand"]) => string;
}

/**
 * Lay out the hand colour key for whichever hands are actually present.
 *
 * Both hands: the two pairs sit symmetrically about the centre. One hand: that
 * pair is centred on its own. No hands: no entries (the caller draws nothing).
 * All x values are relative to the band centre so an expanded (wider) viewBox
 * can translate the group once.
 */
export function calculateHandColorKeyLayout(
  showLeft: boolean,
  showRight: boolean
): HandColorKeyLayout {
  const {
    CENTER_Y,
    SWATCH_RADIUS,
    LABEL_GAP,
    LABEL_WIDTH,
    PAIR_GAP,
    BASELINE_OFFSET,
  } = HAND_COLOR_KEY;

  const pairWidth = SWATCH_RADIUS * 2 + LABEL_GAP + LABEL_WIDTH;
  const hands: Array<"left" | "right"> = [];
  if (showLeft) hands.push("left");
  if (showRight) hands.push("right");

  const totalWidth =
    hands.length * pairWidth + Math.max(0, hands.length - 1) * PAIR_GAP;
  let cursor = -totalWidth / 2;

  const entries: HandColorKeyEntry[] = hands.map((hand) => {
    const swatchX = cursor + SWATCH_RADIUS;
    const labelX = cursor + SWATCH_RADIUS * 2 + LABEL_GAP;
    cursor += pairWidth + PAIR_GAP;
    return { hand, label: hand === "left" ? "L" : "R", swatchX, labelX };
  });

  return {
    centerY: CENTER_Y,
    swatchRadius: SWATCH_RADIUS,
    baselineY: CENTER_Y + BASELINE_OFFSET,
    entries,
  };
}

/** Draws the key onto any Canvas 2D-compatible context without runtime-specific types. */
export function drawHandColorKey(
  context: HandColorKeyCanvasContext,
  options: DrawHandColorKeyOptions
): void {
  const layout = calculateHandColorKeyLayout(
    options.showLeft,
    options.showRight
  );
  if (layout.entries.length === 0) return;

  context.save();
  context.font = `${HAND_COLOR_KEY.FONT_WEIGHT} ${HAND_COLOR_KEY.FONT_SIZE * options.scale}px ${HAND_COLOR_KEY.FONT_FAMILY}`;
  context.textAlign = "start";
  context.textBaseline = "alphabetic";
  for (const entry of layout.entries) {
    context.fillStyle = options.colorForHand(entry.hand);
    context.beginPath();
    context.arc(
      options.centerX + entry.swatchX * options.scale,
      layout.centerY * options.scale,
      layout.swatchRadius * options.scale,
      0,
      Math.PI * 2
    );
    context.fill();
    context.fillStyle = options.textColor;
    context.fillText(
      entry.label,
      options.centerX + entry.labelX * options.scale,
      layout.baselineY * options.scale
    );
  }
  context.restore();
}

/** Serializes the SVG form used by standalone renderers from the same layout and styling. */
export function renderHandColorKeySvg(
  options: RenderHandColorKeySvgOptions
): string {
  const layout = calculateHandColorKeyLayout(
    options.showLeft,
    options.showRight
  );
  if (layout.entries.length === 0) return "";

  const parts = layout.entries.map((entry) => {
    const fill = options.colorForHand(entry.hand);
    return (
      `<circle cx="${entry.swatchX}" cy="${layout.centerY}" r="${layout.swatchRadius}" fill="${fill}"/>` +
      `<text x="${entry.labelX}" y="${layout.baselineY}">${entry.label}</text>`
    );
  });
  return `<g class="hand-color-key" transform="translate(${options.centerX}, 0)" font-family="${HAND_COLOR_KEY.FONT_FAMILY}" font-size="${HAND_COLOR_KEY.FONT_SIZE}" font-weight="${HAND_COLOR_KEY.FONT_WEIGHT}" fill="${options.textColor}">${parts.join("")}</g>`;
}
