/**
 * Info Card Canvas Renderer
 *
 * Draws the "How to Read a Choreo Card" (front) and "Your Catalog" (back)
 * info cards on Canvas 2D at MPC print dimensions.
 *
 * Content is static - no per-sequence data - so canvases are cached
 * after first render.
 */

import type { InfoCardCanvasOptions } from "./types";
import { DIFFICULTY_LEVELS } from "$lib/shared/config/difficulty-styles";

// Scale factor: info cards were designed at 500x700. Content area is 750x1050.
// Exported (with the frame helpers below) so sibling static cards — the
// festival signup card — share one owner for the frame aesthetic.
export const REF_SCALE = 1.5;

// Cache rendered canvases. The back is fully static. The FRONT carries the deck
// number, so its cache key must include it — keying on theme alone hands deck 8
// the card that says "Deck 007".
let cachedFront: HTMLCanvasElement | null = null;
let cachedFrontKey: string | null = null;
let cachedBack: HTMLCanvasElement | null = null;
let cachedBackTheme: string | null = null;

/** "Deck 007" — zero-padded to three digits, matching the manifest id. */
function formatDeckLabel(deckNumber: number): string {
  return `Deck ${String(deckNumber).padStart(3, "0")}`;
}

export async function renderInfoCardFront(options: InfoCardCanvasOptions): Promise<HTMLCanvasElement> {
  const frontKey = `${options.theme}|${options.deckNumber ?? ""}|${options.width}x${options.height}`;
  if (cachedFront && cachedFrontKey === frontKey) return cachedFront;

  const canvas = document.createElement("canvas");
  canvas.width = options.width;
  canvas.height = options.height;
  const ctx = canvas.getContext("2d")!;

  const bleed = options.bleedPx;
  const contentW = options.width - bleed * 2;
  const contentH = options.height - bleed * 2;

  // Background fill (extend into bleed)
  ctx.fillStyle = "#080c24";
  ctx.fillRect(0, 0, options.width, options.height);

  // Border frame
  const borderWidth = 4 * REF_SCALE;
  drawBorderFrame(ctx, bleed, bleed, contentW, contentH, borderWidth, options.theme);

  // Inner card background
  const innerX = bleed + borderWidth;
  const innerY = bleed + borderWidth;
  const innerW = contentW - borderWidth * 2;
  const innerH = contentH - borderWidth * 2;

  fillBackground(ctx, innerX, innerY, innerW, innerH, options.theme);

  // Content area with padding
  const padX = 30 * REF_SCALE;
  const padY = 28 * REF_SCALE;
  const cX = innerX + padX;
  const qrY = innerY + innerH - padY - 30 * REF_SCALE;

  // The body is laid out twice: once against a throwaway context to measure its
  // natural height, then for real, vertically centred in the space above the QR
  // hint. Step text wraps, so the height is not known until it is laid out —
  // and drawing it top-aligned leaves the bottom third of the card empty.
  const drawBody = (ctx: CanvasRenderingContext2D, startY: number): number => {
  let curY = startY;

  // Title: "How to Read"
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${30 * REF_SCALE}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  curY += 8 * REF_SCALE; // spacer-sm
  ctx.fillText("How to Read", innerX + innerW / 2, curY);
  curY += 30 * REF_SCALE + 4;

  // Subtitle: "a Choreo Card"
  ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
  ctx.font = `400 ${17 * REF_SCALE}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText("a Choreo Card", innerX + innerW / 2, curY);
  curY += 17 * REF_SCALE + 16 * REF_SCALE; // text + spacer-md

  // Steps. Rich runs rather than plain strings so step 2 can draw the actual
  // blue/red prop dots inline and step 4 can italicize "Start" — both of which
  // the card is teaching the reader to recognize by sight.
  ctx.textAlign = "left";
  const steps: InlineRun[][] = [
    [t("Each cell is one step. Read left to right, top to bottom. The grid is your choreography.")],
    [
      swatch("blue"), t("and"), swatch("red"),
      t("are your two props. Arrows show the path each one travels through the step."),
    ],
    [t("The letter below each step is its name in The Kinetic Alphabet. If two steps share a letter, they share a movement.")],
    [t("The first cell marked"), t("Start", { italic: true }), t("shows where to hold your props before step 1.")],
    [t("The sequence loops. After the last step, you're back at step 1. Keep going.")],
  ];

  const stepNumSize = 24 * REF_SCALE;
  const stepFontSize = 13.5 * REF_SCALE;
  const stepGap = 12 * REF_SCALE;
  const textX = cX + stepNumSize + 12 * REF_SCALE;
  const textMaxW = innerW - padX * 2 - stepNumSize - 12 * REF_SCALE;

  for (let i = 0; i < steps.length; i++) {
    // Number circle
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 1.5 * REF_SCALE;
    const circleR = stepNumSize / 2;
    const circleX = cX + circleR;
    const circleY = curY + circleR;
    ctx.beginPath();
    ctx.arc(circleX, circleY, circleR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.font = `700 ${13 * REF_SCALE}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), circleX, circleY);

    // Step text (rich, word-wrapped)
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const lineHeight = stepFontSize * 1.45;
    curY = drawWrappedRuns(ctx, steps[i]!, textX, curY, textMaxW, stepFontSize, lineHeight);
    curY += stepGap;
  }

  // Divider
  curY += 16 * REF_SCALE;
  ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
  ctx.fillRect(cX, curY, innerW - padX * 2, 1);
  curY += 1 + 8 * REF_SCALE;

  // Pronunciation section
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.font = `700 ${11 * REF_SCALE}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("PRONUNCIATION", innerX + innerW / 2, curY);
  curY += 11 * REF_SCALE + 8 * REF_SCALE;

  // Pronunciation grid (4 columns, 3 rows)
  const pronItems = [
    ["Α", "Alpha"], ["Β", "Beta"], ["Γ", "Gamma"], ["Σ", "Sigma"],
    ["Δ", "Delta"], ["Θ", "Theta"], ["Ω", "Omega"], ["Φ", "Phi"],
    ["Ψ", "Psi"], ["Λ", "Lambda"], ["τ", "Tau"], ["-", "Dash"],
  ];

  const colCount = 4;
  const colW = (innerW - padX * 2) / colCount;
  const pronRowH = 18 * REF_SCALE;

  for (let i = 0; i < pronItems.length; i++) {
    const col = i % colCount;
    const row = Math.floor(i / colCount);
    const px = cX + col * colW + colW / 2;
    const py = curY + row * pronRowH;

    // Bold letter
    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    ctx.font = `700 ${14 * REF_SCALE}px Georgia, serif`;
    ctx.textAlign = "right";
    ctx.fillText(pronItems[i]![0]!, px - 3 * REF_SCALE, py);

    // Name
    ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
    ctx.font = `400 ${12 * REF_SCALE}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(pronItems[i]![1]!, px + 3 * REF_SCALE, py);
  }

  curY += Math.ceil(pronItems.length / colCount) * pronRowH;

  return curY;
  };

  const bodyTop = innerY + padY;
  const bodyLimit = qrY - 16 * REF_SCALE;
  const probeCanvas = document.createElement("canvas");
  probeCanvas.width = 1;
  probeCanvas.height = 1;
  const naturalH = drawBody(probeCanvas.getContext("2d")!, bodyTop) - bodyTop;
  const slack = Math.max(0, bodyLimit - bodyTop - naturalH);
  drawBody(ctx, bodyTop + slack / 2);

  // QR hint (near bottom)
  ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
  ctx.font = `400 ${12 * REF_SCALE}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.fillText("Scan a card's QR code to see it animated in the app", innerX + innerW / 2, qrY);

  // Footer. The deck number is the card's only deck-specific mark — it makes a
  // loose card traceable to its release without committing to a printed URL.
  const barterY = innerY + innerH - padY - 8 * REF_SCALE;
  ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
  ctx.font = `400 ${11 * REF_SCALE}px "Segoe UI", system-ui, sans-serif`;
  const footerText = options.deckNumber
    ? `${formatDeckLabel(options.deckNumber)}  ·  tkaflowarts.com`
    : "tkaflowarts.com";
  ctx.fillText(footerText, innerX + innerW / 2, barterY);

  cachedFront = canvas;
  cachedFrontKey = frontKey;
  return canvas;
}

export async function renderInfoCardBack(options: InfoCardCanvasOptions): Promise<HTMLCanvasElement> {
  if (cachedBack && cachedBackTheme === options.theme) return cachedBack;

  const canvas = document.createElement("canvas");
  canvas.width = options.width;
  canvas.height = options.height;
  const ctx = canvas.getContext("2d")!;

  const bleed = options.bleedPx;
  const contentW = options.width - bleed * 2;
  const contentH = options.height - bleed * 2;

  // Background
  ctx.fillStyle = "#080c24";
  ctx.fillRect(0, 0, options.width, options.height);

  // Border frame
  const borderWidth = 4 * REF_SCALE;
  drawBorderFrame(ctx, bleed, bleed, contentW, contentH, borderWidth, options.theme);

  // Inner card
  const innerX = bleed + borderWidth;
  const innerY = bleed + borderWidth;
  const innerW = contentW - borderWidth * 2;
  const innerH = contentH - borderWidth * 2;

  fillBackground(ctx, innerX, innerY, innerW, innerH, options.theme);

  // Content
  const padX = 28 * REF_SCALE;
  const padY = 28 * REF_SCALE;
  const cX = innerX + padX;

  // Measured then centred, same as the front — the LOOPs and Chaining copy
  // wraps, so the body's height is only known once laid out.
  const drawBody = (ctx: CanvasRenderingContext2D, startY: number): number => {
  let curY = startY;

  // Title: "Your Catalog"
  curY += 8 * REF_SCALE;
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 ${28 * REF_SCALE}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("Your Catalog", innerX + innerW / 2, curY);
  curY += 28 * REF_SCALE + 14 * REF_SCALE;

  // "Every Card Has Four Corners" label
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.font = `700 ${11 * REF_SCALE}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText("EVERY CARD HAS FOUR CORNERS", cX, curY);
  curY += 11 * REF_SCALE + 8 * REF_SCALE;

  // Corner diagram: mini card outline
  const diagH = 100 * REF_SCALE;
  const diagX = cX;
  const diagW = innerW - padX * 2;

  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 1.5 * REF_SCALE;
  roundRect(ctx, diagX, curY, diagW, diagH, 6 * REF_SCALE);
  ctx.stroke();

  // Diagram corners
  // Top-left: level badge
  const levelStops = DIFFICULTY_LEVELS[1]!.stops;
  const miniR = 11 * REF_SCALE;
  const miniCX = diagX + 8 * REF_SCALE + miniR;
  const miniCY = curY + 6 * REF_SCALE + miniR;
  const grad = ctx.createRadialGradient(miniCX, miniCY, 0, miniCX, miniCY, miniR);
  for (const stop of levelStops) {
    grad.addColorStop(stop.offset, stop.color);
  }
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(miniCX, miniCY, miniR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#000";
  ctx.font = `bold ${14 * REF_SCALE}px Cambria, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("1", miniCX, miniCY);

  // Top-right: LOOP icon (sync symbol)
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.font = `400 ${14 * REF_SCALE}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillText("↻", diagX + diagW - 10 * REF_SCALE, curY + 8 * REF_SCALE);

  // Center: "WORD"
  ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
  ctx.font = `600 ${20 * REF_SCALE}px Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("WORD", diagX + diagW / 2, curY + diagH / 2);

  // Bottom-left: step count
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.font = `700 ${16 * REF_SCALE}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "bottom";
  ctx.fillText("8", diagX + 10 * REF_SCALE, curY + diagH - 6 * REF_SCALE);

  // Bottom-right: α
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.font = `700 ${18 * REF_SCALE}px Georgia, serif`;
  ctx.textAlign = "right";
  ctx.fillText("α", diagX + diagW - 10 * REF_SCALE, curY + diagH - 6 * REF_SCALE);

  curY += diagH + 6 * REF_SCALE;

  // Corner labels
  const labelFontSize = 11 * REF_SCALE;
  ctx.font = `400 ${labelFontSize}px "Segoe UI", system-ui, sans-serif`;
  ctx.textBaseline = "top";

  const labelPairs = [
    ["Level", "difficulty", "LOOP", "pattern type"],
    ["Steps", "length", "Start", "α β or γ"],
  ];

  for (const [leftBold, leftNorm, rightBold, rightNorm] of labelPairs) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.font = `600 ${labelFontSize}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(leftBold!, cX, curY);
    const boldW = ctx.measureText(leftBold!).width;
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.font = `400 ${labelFontSize}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillText(` ${leftNorm}`, cX + boldW, curY);

    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.font = `600 ${labelFontSize}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = "right";
    const rBoldW = ctx.measureText(rightBold!).width;
    const rightEdge = cX + innerW - padX * 2;
    ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
    ctx.font = `400 ${labelFontSize}px "Segoe UI", system-ui, sans-serif`;
    const normW = ctx.measureText(` ${rightNorm}`).width;
    ctx.fillText(` ${rightNorm}`, rightEdge, curY);
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.font = `600 ${labelFontSize}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillText(rightBold!, rightEdge - normW - rBoldW, curY);

    curY += labelFontSize + 2 * REF_SCALE;
  }

  // Divider
  curY += 12 * REF_SCALE;
  ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
  ctx.fillRect(cX, curY, innerW - padX * 2, 1);
  curY += 1 + 12 * REF_SCALE;

  // Levels section
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.font = `700 ${11 * REF_SCALE}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.fillText("LEVELS", cX, curY);
  curY += 11 * REF_SCALE + 8 * REF_SCALE;

  // Level badges in a row
  const levelData = [
    { num: 1, label: "Base Motions" },
    { num: 2, label: "Whole Turns" },
    { num: 3, label: "Half Turns, Floats" },
  ];

  const levelColW = (innerW - padX * 2) / 3;
  const badgeR = 13 * REF_SCALE;

  for (let i = 0; i < levelData.length; i++) {
    const lv = levelData[i]!;
    const cx = cX + levelColW * i + levelColW / 2;
    const cy = curY + badgeR;

    // Badge circle
    const stops = DIFFICULTY_LEVELS[lv.num]!.stops;
    const lvGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, badgeR);
    for (const stop of stops) {
      lvGrad.addColorStop(stop.offset, stop.color);
    }
    ctx.fillStyle = lvGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, badgeR, 0, Math.PI * 2);
    ctx.fill();

    // Number
    ctx.fillStyle = DIFFICULTY_LEVELS[lv.num]!.text;
    ctx.font = `bold ${15 * REF_SCALE}px Cambria, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(lv.num), cx, cy);

    // Label below
    ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
    ctx.font = `400 ${11 * REF_SCALE}px "Segoe UI", system-ui, sans-serif`;
    ctx.textBaseline = "top";
    ctx.fillText(lv.label, cx, cy + badgeR + 4 * REF_SCALE);
  }

  curY += badgeR * 2 + 4 * REF_SCALE + 11 * REF_SCALE + 12 * REF_SCALE;

  // Divider
  ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
  ctx.fillRect(cX, curY, innerW - padX * 2, 1);
  curY += 1 + 12 * REF_SCALE;

  // LOOPs section
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.font = `700 ${11 * REF_SCALE}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("LOOPS", cX, curY);
  curY += 11 * REF_SCALE + 8 * REF_SCALE;

  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.font = `400 ${13 * REF_SCALE}px "Segoe UI", system-ui, sans-serif`;
  const loopText = "The last step connects to the first. Play on repeat. The card back tells you what changes each cycle.";
  const loopLines = wrapText(ctx, loopText, innerW - padX * 2);
  for (const line of loopLines) {
    ctx.fillText(line, cX, curY);
    curY += 13 * REF_SCALE * 1.5;
  }

  // Divider
  curY += 12 * REF_SCALE;
  ctx.fillStyle = "rgba(255, 255, 255, 0.1)";
  ctx.fillRect(cX, curY, innerW - padX * 2, 1);
  curY += 1 + 12 * REF_SCALE;

  // Chaining section
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.font = `700 ${11 * REF_SCALE}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText("CHAINING", cX, curY);
  curY += 11 * REF_SCALE + 8 * REF_SCALE;

  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.font = `400 ${13 * REF_SCALE}px "Segoe UI", system-ui, sans-serif`;
  const chainText = "Group cards by start placement. Any two α cards play back to back. Same for β and γ.";
  const chainLines = wrapText(ctx, chainText, innerW - padX * 2);
  for (const line of chainLines) {
    ctx.fillText(line, cX, curY);
    curY += 13 * REF_SCALE * 1.5;
  }

  curY += 10 * REF_SCALE;

  // Chain visual: α → α → α ...
  const chainCenterX = innerX + innerW / 2;
  const chainBadgeR = 16 * REF_SCALE;
  const chainGap = 8 * REF_SCALE;
  const arrowW = ctx.measureText("→").width;
  const totalChainW = chainBadgeR * 6 + arrowW * 2 + chainGap * 5 + 30;
  let chainX = chainCenterX - totalChainW / 2;

  for (let i = 0; i < 3; i++) {
    // Circle
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 1.5 * REF_SCALE;
    ctx.beginPath();
    ctx.arc(chainX + chainBadgeR, curY + chainBadgeR, chainBadgeR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.font = `700 ${18 * REF_SCALE}px Georgia, serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("α", chainX + chainBadgeR, curY + chainBadgeR);

    chainX += chainBadgeR * 2 + chainGap;

    if (i < 2) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.3)";
      ctx.font = `400 ${16 * REF_SCALE}px "Segoe UI", system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("→", chainX, curY + chainBadgeR);
      chainX += arrowW + chainGap;
    }
  }

  // Dots
  ctx.fillStyle = "rgba(255, 255, 255, 0.2)";
  ctx.font = `400 ${16 * REF_SCALE}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText("...", chainX + chainGap, curY + chainBadgeR);

  return curY + chainBadgeR * 2;
  };

  const bodyTop = innerY + padY;
  const bodyLimit = innerY + innerH - padY - 20 * REF_SCALE;
  const probeCanvas = document.createElement("canvas");
  probeCanvas.width = 1;
  probeCanvas.height = 1;
  const naturalH = drawBody(probeCanvas.getContext("2d")!, bodyTop) - bodyTop;
  const slack = Math.max(0, bodyLimit - bodyTop - naturalH);
  drawBody(ctx, bodyTop + slack / 2);

  // Footer
  const barterY = innerY + innerH - padY;
  ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
  ctx.font = `400 ${11 * REF_SCALE}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText("Choreo Card · The Kinetic Alphabet", innerX + innerW / 2, barterY);

  cachedBack = canvas;
  cachedBackTheme = options.theme;
  return canvas;
}

// ── Inline rich text ──
//
// Step text mixes plain words, italic emphasis, and prop-color dots on one
// wrapped line. Canvas has no inline layout, so runs are split into atoms
// (one word or one dot), measured, and greedily wrapped.

type InlineRun =
  | { kind: "text"; value: string; italic?: boolean }
  | { kind: "swatch"; color: "blue" | "red" };

const SWATCH_COLORS = { blue: "#3b82f6", red: "#ef4444" } as const;

function t(value: string, opts: { italic?: boolean } = {}): InlineRun {
  return { kind: "text", value, italic: opts.italic };
}

function swatch(color: "blue" | "red"): InlineRun {
  return { kind: "swatch", color };
}

type Atom =
  | { kind: "word"; value: string; italic: boolean; width: number }
  | { kind: "swatch"; color: "blue" | "red"; width: number };

function stepFont(size: number, italic: boolean): string {
  return `${italic ? "italic " : ""}400 ${size}px "Segoe UI", system-ui, sans-serif`;
}

/** Draw wrapped inline runs from (x, y). Returns the y below the last line. */
function drawWrappedRuns(
  ctx: CanvasRenderingContext2D,
  runs: InlineRun[],
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number,
  lineHeight: number,
): number {
  const spaceW = (() => {
    ctx.font = stepFont(fontSize, false);
    return ctx.measureText(" ").width;
  })();
  const swatchD = fontSize * 0.72;

  const atoms: Atom[] = [];
  for (const run of runs) {
    if (run.kind === "swatch") {
      atoms.push({ kind: "swatch", color: run.color, width: swatchD });
      continue;
    }
    const italic = run.italic ?? false;
    ctx.font = stepFont(fontSize, italic);
    for (const word of run.value.split(" ")) {
      if (!word) continue;
      atoms.push({ kind: "word", value: word, italic, width: ctx.measureText(word).width });
    }
  }

  // Greedy wrap into lines, then paint each line atom by atom.
  const lines: Atom[][] = [[]];
  let lineWidth = 0;
  for (const atom of atoms) {
    const current = lines[lines.length - 1]!;
    const advance = current.length === 0 ? atom.width : spaceW + atom.width;
    if (current.length > 0 && lineWidth + advance > maxWidth) {
      lines.push([atom]);
      lineWidth = atom.width;
    } else {
      current.push(atom);
      lineWidth += advance;
    }
  }

  let curY = y;
  for (const line of lines) {
    let curX = x;
    for (let i = 0; i < line.length; i++) {
      const atom = line[i]!;
      if (i > 0) curX += spaceW;
      if (atom.kind === "swatch") {
        ctx.fillStyle = SWATCH_COLORS[atom.color];
        ctx.beginPath();
        ctx.arc(curX + atom.width / 2, curY + fontSize * 0.55, atom.width / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = atom.italic
          ? "rgba(255, 255, 255, 0.8)"
          : "rgba(255, 255, 255, 0.6)";
        ctx.font = stepFont(fontSize, atom.italic);
        ctx.fillText(atom.value, curX, curY);
      }
      curX += atom.width;
    }
    curY += lineHeight;
  }

  return curY;
}

// ── Shared helpers ──

export function drawBorderFrame(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  borderWidth: number, theme: string
) {
  // Parse the first and last colors from the theme gradient for canvas
  const colors = getThemeBorderColors(theme);
  const grad = ctx.createLinearGradient(x, y, x + w, y + h);
  for (const stop of colors) {
    grad.addColorStop(stop.offset, stop.color);
  }
  ctx.fillStyle = grad;
  roundRect(ctx, x, y, w, h, 12 * REF_SCALE);
  ctx.fill();
}

export function fillBackground(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  theme: string
) {
  const bgColors = getThemeBackgroundColors(theme);
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  for (const stop of bgColors) {
    grad.addColorStop(stop.offset, stop.color);
  }
  ctx.fillStyle = grad;
  roundRect(ctx, x, y, w, h, 8 * REF_SCALE);
  ctx.fill();
}

function getThemeBorderColors(theme: string): Array<{ offset: number; color: string }> {
  // Hardcoded fallback to cosmic colors for reliability
  const THEMES: Record<string, Array<{ offset: number; color: string }>> = {
    cosmic: [
      { offset: 0, color: "#1e1b4b" }, { offset: 0.2, color: "#4338ca" },
      { offset: 0.35, color: "#c4b5fd" }, { offset: 0.5, color: "#818cf8" },
      { offset: 0.65, color: "#c4b5fd" }, { offset: 0.8, color: "#4338ca" },
      { offset: 1, color: "#1e1b4b" },
    ],
    ocean: [
      { offset: 0, color: "#0c4a6e" }, { offset: 0.2, color: "#0891b2" },
      { offset: 0.38, color: "#a5f3fc" }, { offset: 0.5, color: "#22d3ee" },
      { offset: 0.62, color: "#a5f3fc" }, { offset: 0.8, color: "#0891b2" },
      { offset: 1, color: "#0c4a6e" },
    ],
    ember: [
      { offset: 0, color: "#7c2d12" }, { offset: 0.18, color: "#ea580c" },
      { offset: 0.35, color: "#fde68a" }, { offset: 0.5, color: "#fb923c" },
      { offset: 0.65, color: "#fde68a" }, { offset: 0.82, color: "#ea580c" },
      { offset: 1, color: "#7c2d12" },
    ],
  };
  return THEMES[theme] ?? THEMES.cosmic!;
}

function getThemeBackgroundColors(theme: string): Array<{ offset: number; color: string }> {
  const THEMES: Record<string, Array<{ offset: number; color: string }>> = {
    cosmic: [
      { offset: 0, color: "#080c24" }, { offset: 0.25, color: "#0e1535" },
      { offset: 0.45, color: "#152050" }, { offset: 0.6, color: "#1a2858" },
      { offset: 0.75, color: "#152545" }, { offset: 0.9, color: "#0d1a38" },
      { offset: 1, color: "#0a1230" },
    ],
    ocean: [
      { offset: 0, color: "#001a2e" }, { offset: 0.4, color: "#000c1e" },
      { offset: 0.7, color: "#001122" }, { offset: 1, color: "#000511" },
    ],
    ember: [
      { offset: 0, color: "#0f0505" }, { offset: 0.3, color: "#1a0a0a" },
      { offset: 0.6, color: "#2d1410" }, { offset: 1, color: "#1a0a0a" },
    ],
  };
  return THEMES[theme] ?? THEMES.cosmic!;
}

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines;
}

export function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
