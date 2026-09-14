/**
 * Styled QR appearance — the one place that decides how a card QR looks.
 *
 * The Composer feeds these options to qr-code-styling in the browser; the MCP
 * renderer feeds the same options to qr-code-styling under jsdom. Scan
 * reliability depends on module geometry, so neither side may restyle locally.
 */

export interface StyledQrStyle {
  dotsType?: string;
  cornersSquareType?: string;
  cornersDotType?: string;
  color?: string;
  backgroundColor?: string;
  errorCorrectionLevel?: "L" | "M" | "Q" | "H";
}

export type QrCenterIcon = "play" | "none";

/** The card preset: rounded modules, dark ink on white. */
export const MODERN_QR_STYLE: Readonly<StyledQrStyle> = {
  dotsType: "rounded",
  cornersSquareType: "extra-rounded",
  cornersDotType: "dot",
  color: "#1a1a2e",
  backgroundColor: "#ffffff",
  errorCorrectionLevel: "M",
};

/** Dark cards: white modules on a transparent background. */
export function applyDarkQrStyle(style: StyledQrStyle): StyledQrStyle {
  return { ...style, color: "#ffffff", backgroundColor: "#00000000" };
}

/** The play triangle's color — a vivid "go/play" green that reads on either
 *  badge. Universal play semantics; the badge isolates it from the card palette. */
export const PLAY_GREEN = "#22c55e";

/**
 * Card QRs are authored at this size and scaled into the cell. The Composer's
 * print renderer draws a 600px SVG through drawImage; the MCP rasterizes the
 * same 600px SVG to the cell size, so module geometry lands on the same pixels.
 */
export const PRINT_QR_RENDER_SIZE = 600;

/**
 * Rough perceived-luminance test, used to pick the badge color that matches the
 * card (white badge on light cards, dark badge on dark cards). Accepts
 * #rgb / #rrggbb (with optional alpha); anything else is treated as dark.
 */
function isLightColor(hex: string): boolean {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})/i.exec(hex.trim());
  const raw = m?.[1];
  if (!raw) return false;
  const h = raw.length === 3 ? raw.replace(/./g, (c) => c + c) : raw;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // Rec. 601 luma
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}

function encodeBase64(text: string): string {
  if (typeof btoa === "function") return btoa(text);
  return Buffer.from(text, "utf8").toString("base64");
}

/**
 * Inline SVG data URL: a green play triangle in a circular badge, centered in
 * the QR. The badge matches the card (white on light cards, dark on dark cards)
 * so it blends into the card's whitespace and the green triangle floats in the
 * cleared center. The overlay is purely visual — it never changes the encoded
 * URL — and the generator bumps error correction to "H" so the obscured modules
 * stay recoverable. `moduleColor` is the QR module color; the badge is derived
 * as its card-matching contrast.
 */
export function playIconDataUrl(
  moduleColor: string,
  triangleColor: string = PLAY_GREEN
): string {
  const badge = isLightColor(moduleColor) ? "#1a1a2e" : "#ffffff";
  const triangle = triangleColor;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
    `<circle cx="50" cy="50" r="50" fill="${badge}"/>` +
    `<path d="M35 24 L35 76 L80 50 Z" fill="${triangle}" ` +
    `stroke="${triangle}" stroke-width="6" stroke-linejoin="round"/>` +
    `</svg>`;
  return `data:image/svg+xml;base64,${encodeBase64(svg)}`;
}

/** Structural mirror of qr-code-styling's constructor options. */
export interface StyledQrOptions {
  width: number;
  height: number;
  type: "svg";
  data: string;
  margin: number;
  image?: string;
  imageOptions?: {
    imageSize: number;
    margin: number;
    hideBackgroundDots: boolean;
    crossOrigin: string;
  };
  qrOptions: {
    typeNumber: number;
    mode: "Byte";
    errorCorrectionLevel: "L" | "M" | "Q" | "H";
  };
  dotsOptions: { color: string; type: string };
  cornersSquareOptions: { color: string; type: string };
  cornersDotOptions: { color: string; type: string };
  backgroundOptions: { color: string };
}

/**
 * Build qr-code-styling options for a card QR.
 *
 * Center play button: a QR that resolves to the animated player carries the
 * triangle as an implicit "scan to play". hideBackgroundDots clears the
 * modules behind it and the margin gives a clean ring. centerIcon "none"
 * skips the overlay (and the forced-"H" recovery it requires) for QRs whose
 * destination is not a player.
 */
export function createStyledQrOptions(
  url: string,
  size: number,
  margin: number,
  style: StyledQrStyle,
  centerIcon: QrCenterIcon
): StyledQrOptions {
  const color = style.color || "#1a1a2e";
  const imageOptions =
    centerIcon === "play"
      ? {
          image: playIconDataUrl(color),
          imageOptions: {
            imageSize: 0.25,
            margin: 3,
            hideBackgroundDots: true,
            crossOrigin: "anonymous",
          },
        }
      : {};
  return {
    width: size,
    height: size,
    type: "svg",
    data: url,
    margin,
    ...imageOptions,
    qrOptions: {
      typeNumber: 0, // Auto-detect
      mode: "Byte",
      // Force "H" (30% recovery) whenever the center image is embedded so the
      // obscured modules stay recoverable, regardless of the preset's level.
      errorCorrectionLevel:
        centerIcon === "play" ? "H" : style.errorCorrectionLevel || "M",
    },
    dotsOptions: { color, type: style.dotsType || "rounded" },
    cornersSquareOptions: {
      color,
      type: style.cornersSquareType || "extra-rounded",
    },
    cornersDotOptions: { color, type: style.cornersDotType || "dot" },
    backgroundOptions: { color: style.backgroundColor || "#ffffff" },
  };
}

/** Largest square after a small side margin, centered in the cell. */
export function calculateQrCellGeometry(cellSize: number): {
  sideMargin: number;
  qrSize: number;
  offset: number;
} {
  const sideMargin = Math.round(cellSize * 0.055);
  const qrSize = Math.floor(cellSize - 2 * sideMargin);
  return { sideMargin, qrSize, offset: Math.floor((cellSize - qrSize) / 2) };
}

/**
 * Paint a rendered QR into its card cell the way the Composer does: the cell
 * is flooded white (black on dark cards) and the QR sits centered inside.
 */
export function paintQrCell(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  cell: { x: number; y: number; cellSize: number },
  darkMode: boolean
): void {
  const { qrSize, offset } = calculateQrCellGeometry(cell.cellSize);
  ctx.fillStyle = darkMode ? "#000000" : "#ffffff";
  ctx.fillRect(cell.x, cell.y, cell.cellSize, cell.cellSize);
  ctx.drawImage(image, cell.x + offset, cell.y + offset, qrSize, qrSize);
}
