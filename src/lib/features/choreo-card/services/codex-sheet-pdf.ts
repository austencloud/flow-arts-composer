// Builds the duplex "Codex Cards" sheet entirely in the browser.
//
// Front sheets = Double-Staff Type 1-2, back sheets = Type 3-6 (columns mirrored
// for long-edge duplex), so each cut card is Type 1-2 front / Type 3-6 back.
// Cards tile 2×2 edge-to-edge (shared cut lines) and each carries the Choreo
// Cards rainbow border (content on white, inset inside the border).
//
// Every codex card is identical, so `copies` = how many cards to print; each
// Letter sheet holds 4. `mode` scopes the output the same way the deck releaser's
// print sidebar does: fronts only, backs only, or a combined fronts→flip→backs
// file. Artboards are bundled at /codex/front.png and /codex/back.png. The
// rainbow is drawn as interpolated horizontal bands (pdf-lib has no gradient).
import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

const PAGE_W = 612, PAGE_H = 792; // US Letter portrait, points
const MARGIN = 18;
const COLS = 2, ROWS = 2; // 4 per page — larger, readable cards
const CARDS_PER_PAGE = COLS * ROWS;
const BORDER = 12; // rainbow frame thickness (pt)
const BANDS = 72; // rainbow interpolation resolution per card
const GUIDE = rgb(0.65, 0.65, 0.65);

export type CodexPrintMode = "fronts" | "backs" | "combined";

export interface CodexPrintOptions {
  /** fronts | backs | combined. Default "combined". */
  mode?: CodexPrintMode;
  /** Total identical cards to print. Each sheet holds 4. Default 4 (one sheet). */
  copies?: number;
}

/** Sheets needed for N cards at 4 per page. */
export function codexSheetCount(copies: number): number {
  return Math.max(1, Math.ceil(Math.max(1, Math.floor(copies)) / CARDS_PER_PAGE));
}

// Choreo Cards rainbow, bottom → top.
const STOPS: Array<{ p: number; c: [number, number, number] }> = [
  { p: 0.0, c: [0xcc, 0x00, 0x00] },
  { p: 0.14, c: [0xcc, 0x66, 0x00] },
  { p: 0.28, c: [0xcc, 0xcc, 0x00] },
  { p: 0.42, c: [0x00, 0xcc, 0x00] },
  { p: 0.56, c: [0x00, 0xcc, 0x66] },
  { p: 0.7, c: [0x00, 0x66, 0xcc] },
  { p: 0.82, c: [0x00, 0x33, 0xcc] },
  { p: 1.0, c: [0x66, 0x00, 0xcc] },
];

function rainbowAt(f: number) {
  const t = Math.min(1, Math.max(0, f));
  let a = STOPS[0]!, b = STOPS[STOPS.length - 1]!;
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (t >= STOPS[i]!.p && t <= STOPS[i + 1]!.p) { a = STOPS[i]!; b = STOPS[i + 1]!; break; }
  }
  const span = b.p - a.p || 1;
  const k = (t - a.p) / span;
  const ch = (i: number) => (a.c[i]! + (b.c[i]! - a.c[i]!) * k) / 255;
  return rgb(ch(0), ch(1), ch(2));
}

async function fetchBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

const slotW = (PAGE_W - 2 * MARGIN) / COLS; // gutter 0 → cards touch
const slotH = (PAGE_H - 2 * MARGIN) / ROWS;
const innerW = slotW - 2 * BORDER;
const innerH = slotH - 2 * BORDER;
const slotX = (col: number) => MARGIN + col * slotW;
const slotY = (row: number) => PAGE_H - MARGIN - (row + 1) * slotH;

function fit(img: PDFImage) {
  const a = img.width / img.height;
  let w = innerW, h = innerW / a;
  if (h > innerH) { h = innerH; w = innerH * a; }
  return { w, h, ox: (innerW - w) / 2, oy: (innerH - h) / 2 };
}

function drawCard(page: PDFPage, img: PDFImage, sx: number, sy: number, f: ReturnType<typeof fit>) {
  // rainbow border: horizontal bands bottom→top across the whole slot
  const bandH = slotH / BANDS;
  for (let i = 0; i < BANDS; i++) {
    page.drawRectangle({
      x: sx, y: sy + i * bandH, width: slotW, height: bandH + 0.5,
      color: rainbowAt((i + 0.5) / BANDS),
    });
  }
  // white content area inset by the border
  page.drawRectangle({ x: sx + BORDER, y: sy + BORDER, width: innerW, height: innerH, color: rgb(1, 1, 1) });
  // artboard centered in the white area
  page.drawImage(img, { x: sx + BORDER + f.ox, y: sy + BORDER + f.oy, width: f.w, height: f.h });
}

/** Add ceil(copies/4) pages of one side. Columns mirrored when `mirror` (backs,
 *  long-edge duplex). The last sheet draws only the remaining cards. */
function drawSide(
  pdf: PDFDocument,
  font: PDFFont,
  img: PDFImage,
  copies: number,
  mirror: boolean,
  sideLabel: string,
  hint: string,
) {
  const f = fit(img);
  const sheets = codexSheetCount(copies);
  for (let sheet = 0; sheet < sheets; sheet++) {
    const page = pdf.addPage([PAGE_W, PAGE_H]);
    const remaining = copies - sheet * CARDS_PER_PAGE;
    const onThisSheet = Math.min(CARDS_PER_PAGE, remaining);
    for (let i = 0; i < onThisSheet; i++) {
      const row = Math.floor(i / COLS);
      const col = i % COLS;
      const placeCol = mirror ? COLS - 1 - col : col;
      drawCard(page, img, slotX(placeCol), slotY(row), f);
    }
    drawLabel(page, font, `${sideLabel}  ·  Sheet ${sheet + 1} of ${sheets}`);
    drawHint(page, font, hint);
  }
}

function drawLabel(page: PDFPage, font: PDFFont, text: string) {
  const w = font.widthOfTextAtSize(text, 7);
  page.drawText(text, { x: PAGE_W - w - 24, y: PAGE_H - 15, size: 7, font, color: GUIDE });
}

function drawHint(page: PDFPage, font: PDFFont, hint: string) {
  page.drawText(hint, { x: 24, y: 8, size: 6, font, color: GUIDE });
  const flip = ">> LONG EDGE";
  const fw = font.widthOfTextAtSize(flip, 6);
  page.drawText(flip, { x: PAGE_W - 24 - fw, y: 8, size: 6, font, color: GUIDE });
}

function addFlipPage(pdf: PDFDocument, font: PDFFont, fontBold: PDFFont) {
  const page = pdf.addPage([PAGE_W, PAGE_H]);
  const cx = PAGE_W / 2;
  let y = PAGE_H / 2 + 60;
  const title = "STOP: FLIP YOUR PAPER";
  page.drawText(title, { x: cx - fontBold.widthOfTextAtSize(title, 16) / 2, y, size: 16, font: fontBold, color: GUIDE });
  y -= 36;
  for (const step of [
    "1.  Remove all printed fronts from the output tray",
    "2.  Flip the stack on the LONG EDGE",
    "3.  Reinsert into the paper tray, top edge goes in first",
    "4.  Print the remaining pages (all backs)",
  ]) {
    page.drawText(step, { x: cx - font.widthOfTextAtSize(step, 10) / 2, y, size: 10, font, color: GUIDE });
    y -= 18;
  }
  y -= 12;
  const note = "This page does not print on card stock. It is an instruction separator.";
  page.drawText(note, { x: cx - font.widthOfTextAtSize(note, 7) / 2, y, size: 7, font, color: GUIDE });
}

/** Build the Codex print sheet. Returns a PDF Blob. */
export async function buildCodexSheetPDF(options: CodexPrintOptions = {}): Promise<Blob> {
  const mode = options.mode ?? "combined";
  const copies = Math.max(1, Math.floor(options.copies ?? CARDS_PER_PAGE));

  const [frontBytes, backBytes] = await Promise.all([
    fetchBytes("/codex/front.png"),
    fetchBytes("/codex/back.png"),
  ]);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const frontImg = await pdf.embedPng(frontBytes);
  const backImg = await pdf.embedPng(backBytes);

  const includeFronts = mode === "fronts" || mode === "combined";
  const includeBacks = mode === "backs" || mode === "combined";

  if (includeFronts) {
    drawSide(pdf, font, frontImg, copies, false, "FRONTS · Types 1–2", "FRONT SIDE");
  }
  if (mode === "combined") {
    addFlipPage(pdf, font, fontBold);
  }
  if (includeBacks) {
    drawSide(pdf, font, backImg, copies, true, "BACKS · Types 3–6", "BACK SIDE: columns mirrored for long-edge flip");
  }

  const bytes = await pdf.save();
  return new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

/** Build + trigger a browser download of the Codex print sheet. */
export async function downloadCodexSheetPDF(
  options: CodexPrintOptions = {},
  filename = "codex-cards-duplex.pdf",
): Promise<void> {
  const blob = await buildCodexSheetPDF(options);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
