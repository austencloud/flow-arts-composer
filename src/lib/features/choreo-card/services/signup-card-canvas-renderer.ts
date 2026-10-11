/**
 * Signup Card Canvas Renderer
 *
 * Draws the festival sample-pack signup card at MPC print dimensions.
 * Front: QR to tkaflowarts.com/start, the URL as text (QR-dead insurance),
 * and one pitch line. Back: the learn, teach, pass relay.
 *
 * The card uses the SAME frame as the real deck cards — wrapContentInCardFrame
 * (stripe border, white inner content) — so it matches the pack it ships with
 * and stays home-printer friendly: ink lives in the border and the QR, not in
 * a full-bleed dark ground.
 *
 * Content is static, so canvases are cached after first render.
 */

import type { InfoCardCanvasOptions } from "./types";
import { REF_SCALE, roundRect, wrapText } from "./info-card-canvas-renderer";
import {
  getCardFrameContentInset,
  wrapContentInCardFrame,
} from "./card-front-frame";
import { QRCodeGenerator } from "#lib/shared/qr/services/qr-code-generator.js";

export const SIGNUP_CARD_URL = "https://tkaflowarts.com/start";
export const SIGNUP_CARD_ART_REVISION = "2026-08-14-relay-v1";
/** Printed under the QR. No scheme — it is for humans typing it in. */
const SIGNUP_CARD_URL_TEXT = "tkaflowarts.com/start";
const PITCH_LINE =
  "Create a free account and every card in this pack comes alive.";

export const SIGNUP_CARD_RELAY_STEPS = [
  {
    label: "SCAN + LEARN",
    body: "Scan the QR on a choreo card. Learn its sequence.",
  },
  {
    label: "TEACH",
    body: "Teach the sequence to another person.",
  },
  {
    label: "PASS IT ON",
    body: "Give them the card. They start again at step one.",
  },
] as const;

export const SIGNUP_CARD_RELAY_CLOSING =
  "Keep the loop going until the world speaks this language.";

const INK = "#1e1b4b";
const INK_SOFT = "rgba(30, 27, 75, 0.55)";
const INK_FAINT = "rgba(30, 27, 75, 0.4)";

/** Stripe-border palette per harness theme, mirroring the tndElement
 * accent/darkComplement pairs real cards are framed with. */
const FRAME_COLORS: Record<string, { accent: string; dark: string }> = {
  cosmic: { accent: "#818cf8", dark: "#1e1b4b" },
  ocean: { accent: "#22d3ee", dark: "#0c4a6e" },
  ember: { accent: "#fb923c", dark: "#7c2d12" },
};

let cachedFront: HTMLCanvasElement | null = null;
let cachedFrontKey: string | null = null;
let cachedBack: HTMLCanvasElement | null = null;
let cachedBackKey: string | null = null;

function htmlFactory(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function makeContentCanvas(options: InfoCardCanvasOptions): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  border: number;
} {
  const border = getCardFrameContentInset(options.bleedPx);
  const canvas = htmlFactory(
    options.width - border * 2,
    options.height - border * 2
  );
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx, border };
}

function frameColors(theme: string): { accent: string; dark: string } {
  return FRAME_COLORS[theme] ?? FRAME_COLORS.cosmic!;
}

export async function renderSignupCardFront(
  options: InfoCardCanvasOptions
): Promise<HTMLCanvasElement> {
  const key = `${options.theme}|${options.width}x${options.height}`;
  if (cachedFront && cachedFrontKey === key) return cachedFront;

  // The QR is the card's whole job — render it before touching the canvas so
  // a generator failure surfaces as an error, never as a card with a hole.
  // URL-only generator: no ShortCodeManager, so the bare /test harness (no
  // app-shell wiring) can render the card.
  const qrImage = await new QRCodeGenerator().generateUrlAsImage(
    SIGNUP_CARD_URL,
    600,
    { style: "classic", margin: 2, centerIcon: "none" }
  );

  const { canvas, ctx } = makeContentCanvas(options);
  const centerX = canvas.width / 2;
  const padY = 28 * REF_SCALE;

  // Measured once against a throwaway context, then vertically centred —
  // same probe-and-centre pattern as the info card.
  const drawBody = (ctx: CanvasRenderingContext2D, startY: number): number => {
    let curY = startY;

    // Title
    ctx.fillStyle = INK;
    ctx.font = `800 ${34 * REF_SCALE}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("Start Here", centerX, curY);
    curY += 34 * REF_SCALE + 6 * REF_SCALE;

    // Subtitle
    ctx.fillStyle = INK_SOFT;
    ctx.font = `400 ${17 * REF_SCALE}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillText("Flow Arts Composer", centerX, curY);
    curY += 17 * REF_SCALE + 22 * REF_SCALE;

    // QR straight on the white ground, inside a hairline keyline so the cut
    // zone reads as deliberate. Classic dark-on-white modules scan best.
    const tileSize = 300 * REF_SCALE;
    const tilePad = 16 * REF_SCALE;
    const tileX = centerX - tileSize / 2;
    ctx.strokeStyle = "rgba(30, 27, 75, 0.15)";
    ctx.lineWidth = 2;
    roundRect(ctx, tileX, curY, tileSize, tileSize, 14 * REF_SCALE);
    ctx.stroke();
    ctx.drawImage(
      qrImage,
      tileX + tilePad,
      curY + tilePad,
      tileSize - tilePad * 2,
      tileSize - tilePad * 2
    );
    curY += tileSize + 16 * REF_SCALE;

    // The URL as text — insurance for a QR that will not scan.
    ctx.fillStyle = INK;
    ctx.font = `700 ${17 * REF_SCALE}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillText(SIGNUP_CARD_URL_TEXT, centerX, curY);
    curY += 17 * REF_SCALE + 20 * REF_SCALE;

    // Pitch line
    ctx.fillStyle = INK_SOFT;
    const pitchSize = 14 * REF_SCALE;
    ctx.font = `400 ${pitchSize}px "Segoe UI", system-ui, sans-serif`;
    const pitchLines = wrapText(ctx, PITCH_LINE, canvas.width - 60 * REF_SCALE);
    for (const line of pitchLines) {
      ctx.fillText(line, centerX, curY);
      curY += pitchSize * 1.5;
    }

    return curY;
  };

  const bodyTop = padY;
  const bodyLimit = canvas.height - padY - 20 * REF_SCALE;
  const probeCanvas = htmlFactory(1, 1);
  const naturalH = drawBody(probeCanvas.getContext("2d")!, bodyTop) - bodyTop;
  const slack = Math.max(0, bodyLimit - bodyTop - naturalH);
  drawBody(ctx, bodyTop + slack / 2);

  // Footer
  ctx.fillStyle = INK_FAINT;
  ctx.font = `400 ${11 * REF_SCALE}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText("The Kinetic Alphabet", centerX, canvas.height - padY);

  const framed = wrapContentInCardFrame(
    canvas,
    {
      canvasWidth: options.width,
      canvasHeight: options.height,
      bleedPx: options.bleedPx,
      ...frameColors(options.theme),
    },
    htmlFactory
  ) as HTMLCanvasElement;

  cachedFront = framed;
  cachedFrontKey = key;
  return framed;
}

export async function renderSignupCardBack(
  options: InfoCardCanvasOptions
): Promise<HTMLCanvasElement> {
  const key = `${options.theme}|${options.width}x${options.height}`;
  if (cachedBack && cachedBackKey === key) return cachedBack;

  const { canvas, ctx } = makeContentCanvas(options);
  const centerX = canvas.width / 2;
  const padY = 28 * REF_SCALE;
  const { accent } = frameColors(options.theme);

  // The back is a field instruction, not an advertisement. A vertical relay
  // makes the physical handoff legible before anyone reads the small copy.
  ctx.fillStyle = INK;
  ctx.font = `800 ${29 * REF_SCALE}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText("Learn it. Teach it. Pass it on.", centerX, 40 * REF_SCALE);

  ctx.fillStyle = INK_SOFT;
  ctx.font = `400 ${14 * REF_SCALE}px "Segoe UI", system-ui, sans-serif`;
  ctx.fillText(
    "Every choreo card runs on the same three-step loop.",
    centerX,
    88 * REF_SCALE
  );

  const railX = 67 * REF_SCALE;
  const textX = 112 * REF_SCALE;
  const textWidth = canvas.width - textX - 34 * REF_SCALE;
  const stepTops = [150, 280, 410].map((value) => value * REF_SCALE);
  const circleRadius = 24 * REF_SCALE;

  for (let index = 0; index < SIGNUP_CARD_RELAY_STEPS.length; index += 1) {
    const step = SIGNUP_CARD_RELAY_STEPS[index]!;
    const stepTop = stepTops[index]!;
    const circleY = stepTop + 26 * REF_SCALE;

    if (index < SIGNUP_CARD_RELAY_STEPS.length - 1) {
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.45;
      ctx.lineWidth = 3 * REF_SCALE;
      ctx.beginPath();
      ctx.moveTo(railX, circleY + circleRadius);
      ctx.lineTo(railX, stepTops[index + 1]! + 26 * REF_SCALE - circleRadius);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    ctx.fillStyle = accent;
    ctx.globalAlpha = 0.16;
    ctx.beginPath();
    ctx.arc(railX, circleY, circleRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = accent;
    ctx.lineWidth = 2 * REF_SCALE;
    ctx.beginPath();
    ctx.arc(railX, circleY, circleRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = INK;
    ctx.font = `800 ${18 * REF_SCALE}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(index + 1), railX, circleY);

    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = `800 ${17 * REF_SCALE}px "Segoe UI", system-ui, sans-serif`;
    ctx.fillText(step.label, textX, stepTop);

    ctx.fillStyle = INK_SOFT;
    const bodySize = 14 * REF_SCALE;
    ctx.font = `400 ${bodySize}px "Segoe UI", system-ui, sans-serif`;
    const lines = wrapText(ctx, step.body, textWidth);
    lines.forEach((line, lineIndex) => {
      ctx.fillText(
        line,
        textX,
        stepTop + 31 * REF_SCALE + lineIndex * bodySize * 1.5
      );
    });
  }

  const loopX = 82 * REF_SCALE;
  const loopY = 480 * REF_SCALE;
  const loopWidth = canvas.width - loopX * 2;
  const loopHeight = 44 * REF_SCALE;
  ctx.strokeStyle = accent;
  ctx.lineWidth = 2 * REF_SCALE;
  roundRect(ctx, loopX, loopY, loopWidth, loopHeight, 22 * REF_SCALE);
  ctx.stroke();

  ctx.fillStyle = INK;
  ctx.font = `700 ${18 * REF_SCALE}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("1  →  2  →  3  →  1", centerX, loopY + loopHeight / 2);

  ctx.fillStyle = INK;
  const closingSize = 16 * REF_SCALE;
  ctx.font = `700 ${closingSize}px "Segoe UI", system-ui, sans-serif`;
  ctx.textBaseline = "top";
  const closingLines = wrapText(
    ctx,
    SIGNUP_CARD_RELAY_CLOSING,
    canvas.width - 100 * REF_SCALE
  );
  closingLines.forEach((line, index) => {
    ctx.fillText(line, centerX, 540 * REF_SCALE + index * closingSize * 1.45);
  });

  // The URL remains on both faces in case the card is separated from the pack.
  ctx.fillStyle = INK_FAINT;
  ctx.font = `400 ${12 * REF_SCALE}px "Segoe UI", system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillText(SIGNUP_CARD_URL_TEXT, centerX, canvas.height - padY);

  const framed = wrapContentInCardFrame(
    canvas,
    {
      canvasWidth: options.width,
      canvasHeight: options.height,
      bleedPx: options.bleedPx,
      ...frameColors(options.theme),
    },
    htmlFactory
  ) as HTMLCanvasElement;

  cachedBack = framed;
  cachedBackKey = key;
  return framed;
}
