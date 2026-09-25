import { PDFDocument, PrintScaling, rgb, StandardFonts } from 'pdf-lib';
import type { PDFFont, PDFImage, PDFPage } from 'pdf-lib';
import { planPrintSlots, type PlannedSlot } from './print-slot-planner';
import type { TnDElement } from '../domain/tnd-element';
import type { CardPair } from './types';
import { PRINT_SERVICE_PIXELS_PER_INCH, homePrintPixelsPerInch, verifyCardFrontQrs } from './print-qr-guard';
import {
	CARD_SIZES,
	getPageLayout,
	PAPER_SIZES,
	type CardSizeId,
	type PageLayout,
	type PaperSizeId,
} from '../domain/card-sizes';

/** Ask PDF viewers to default their print dialog to 100% scale and to pick the
 *  tray holding paper that matches the page size. Acrobat and most desktop
 *  viewers honor these; Chrome's built-in viewer ignores them. They exist to
 *  close the shrink-to-fit trap: a 13"×19" layout silently scaled to Letter
 *  prints tiny cards in the middle of the big sheet. */
function applyPrintViewerPrefs(pdfDoc: PDFDocument): void {
	const prefs = pdfDoc.catalog.getOrCreateViewerPreferences();
	prefs.setPrintScaling(PrintScaling.None);
	prefs.setPickTrayByPDFSize(true);
}

const GUIDE_COLOR = rgb(0.65, 0.65, 0.65);
const CROP_COLOR = rgb(0.4, 0.4, 0.4);
const CROP_LEN = 8;
const CROP_OFFSET = 2;
// Inset for corner labels/hints so they clear the printer's non-printable
// margin (~0.25"). Horizontal has slack; vertical band is only marginYPt tall.
const LABEL_EDGE_X = 24;
const LABEL_EDGE_Y = 8;

/** One card per page, alternating front/back. For MPC/print service upload. */
export async function exportDeckPDF(
	pairs: CardPair[],
	_deckName: string,
	cardSize: CardSizeId = 'poker',
	onProgress?: (current: number, total: number) => void,
	/** "How to Read" insert, emitted as the first card of the deck. */
	insertPair?: CardPair
): Promise<Blob> {
	const size = CARD_SIZES[cardSize];
	// MPC page dimensions: canvas pixel dimensions converted to points at 300 DPI
	const pageWidthPt = (size.canvasWidth / 300) * 72;
	const pageHeightPt = (size.canvasHeight / 300) * 72;

	await verifyCardFrontQrs(pairs, () => PRINT_SERVICE_PIXELS_PER_INCH);

	const pdfDoc = await PDFDocument.create();
	const allPairs = insertPair ? [insertPair, ...pairs] : pairs;
	const total = allPairs.length;

	for (let i = 0; i < allPairs.length; i++) {
		const pair = allPairs[i]!;

		const frontImage = await pdfDoc.embedPng(canvasToPngBytes(pair.front));
		const frontPage = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
		frontPage.drawImage(frontImage, {
			x: 0,
			y: 0,
			width: pageWidthPt,
			height: pageHeightPt,
		});

		const backImage = await pdfDoc.embedPng(canvasToPngBytes(pair.back));
		const backPage = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
		backPage.drawImage(backImage, {
			x: 0,
			y: 0,
			width: pageWidthPt,
			height: pageHeightPt,
		});

		onProgress?.(i + 1, total);
	}

	const pdfBytes = await pdfDoc.save();
	return new Blob([pdfBytes.buffer as ArrayBuffer], {
		type: 'application/pdf',
	});
}

/** One-page scaling test sheet: the true card-grid outlines for this paper +
 *  card combo, a ruler with 1-inch ticks, and the dialog settings spelled out.
 *  Printed on scrap paper it proves the whole chain (app → PDF → print dialog
 *  → driver) before any card stock is spent. A short ruler means the print
 *  dialog is scaling — the fix is there, not in the deck. */
export async function exportCalibrationPDF(
	cardSize: CardSizeId = 'poker',
	paperSize: PaperSizeId = 'letter'
): Promise<Blob> {
	const layout = getPageLayout(cardSize, paperSize);
	const { cols, rows, cardWidthPt, cardHeightPt, gutterPt, marginXPt, marginYPt, pageWidthPt, pageHeightPt } = layout;
	const paper = PAPER_SIZES[paperSize];
	const card = CARD_SIZES[cardSize];

	const pdfDoc = await PDFDocument.create();
	applyPrintViewerPrefs(pdfDoc);
	pdfDoc.setTitle(`TKA print test sheet — ${paper.label}`);
	const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
	const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
	const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);

	// The real card grid, outlines only: shows exactly where cards will land.
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			page.drawRectangle({
				x: marginXPt + c * (cardWidthPt + gutterPt),
				y: pageHeightPt - marginYPt - (r + 1) * cardHeightPt - r * gutterPt,
				width: cardWidthPt,
				height: cardHeightPt,
				borderColor: GUIDE_COLOR,
				borderWidth: 0.75,
			});
		}
	}

	// Ruler: the longest whole-inch run that fits with half-inch ends to spare.
	const rulerInches = Math.floor(paper.widthInches - 1);
	const rulerLenPt = rulerInches * 72;
	const rulerX = (pageWidthPt - rulerLenPt) / 2;
	const rulerY = pageHeightPt / 2;
	page.drawLine({
		start: { x: rulerX, y: rulerY },
		end: { x: rulerX + rulerLenPt, y: rulerY },
		thickness: 1.5,
		color: rgb(0, 0, 0),
	});
	for (let i = 0; i <= rulerInches; i++) {
		const x = rulerX + i * 72;
		page.drawLine({
			start: { x, y: rulerY },
			end: { x, y: rulerY + 14 },
			thickness: 1.5,
			color: rgb(0, 0, 0),
		});
		const label = String(i);
		page.drawText(label, {
			x: x - fontBold.widthOfTextAtSize(label, 10) / 2,
			y: rulerY + 18,
			size: 10,
			font: fontBold,
			color: rgb(0, 0, 0),
		});
	}

	// Instructions, centered under the ruler. Black on the bare page — the grid
	// behind them is faint outline only.
	const lines: { text: string; f: PDFFont; size: number }[] = [
		{ text: `${paper.label} test sheet`, f: fontBold, size: 16 },
		{
			text: `Print dialog: Paper size ${paper.label}  ·  Scale 100% / Actual size — never "Fit to page".`,
			f: font,
			size: 11,
		},
		{
			text: `The ruler above must measure exactly ${rulerInches} inches. Short ruler = the dialog is scaling.`,
			f: font,
			size: 11,
		},
		{
			text: `Each outlined cell is one ${card.label} card. The grid should sit centered with even margins.`,
			f: font,
			size: 11,
		},
	];
	let textY = rulerY - 40;
	for (const line of lines) {
		page.drawText(line.text, {
			x: (pageWidthPt - line.f.widthOfTextAtSize(line.text, line.size)) / 2,
			y: textY,
			size: line.size,
			font: line.f,
			color: rgb(0, 0, 0),
		});
		textY -= line.size + 10;
	}

	const pdfBytes = await pdfDoc.save();
	return new Blob([pdfBytes.buffer as ArrayBuffer], {
		type: 'application/pdf',
	});
}

export type PrintPDFMode = 'combined' | 'fronts' | 'backs';

export interface HomePrintOptions {
	/** Sheet stock the grid is laid out on. Default US Letter; "superb" is the
	 *  13"×19" Super B sheet the ET-16650 takes through its rear feed. */
	paperSize?: PaperSizeId;
	/** Whole-deck copies. Each element block repeats N times. Default 1, min 1. */
	copies?: number;
	/** Repeat the finished sheet set as complete print jobs. A two-page duplex
	 *  handout with `jobCopies: 60` is emitted front/back, front/back, sixty
	 *  times. Embedded card images are still shared across the whole PDF. */
	jobCopies?: number;
	/** Element tag per pair, parallel to `pairs`. Absent → no grouping (single
	 *  trailing bucket, tail-padded). */
	elements?: (TnDElement | undefined)[];
	/** When false, relax the one-color-per-sheet rule: cards fill sheets in order
	 *  with blanks only on the final sheet (no inter-color gaps). Default true. */
	groupByElement?: boolean;
	/** Reverse the authored card order for cut-stack collation. Deck releases
	 * default to true. Fixed-position handout sheets set this false so the screen
	 * grid and printed grid stay in the same order. */
	firstOnTop?: boolean;
	/** Combined files normally include a manual-flip instruction page between
	 * fronts and backs. Set false for a two-page file sent straight to a duplex
	 * printer. Default true. */
	includeFlipInstruction?: boolean;
	/** Document metadata embedded in the PDF (title / subject / keywords) so a
	 *  downloaded file is indexable by deck reference + contents without opening.
	 *  `deckSummary` also prints centered in each sheet's top margin (the recipe:
	 *  e.g. "Rotated · Quartered · 8-step · L1 · 1 turn · Diamond · Staff"). */
	meta?: {
		title?: string;
		subject?: string;
		keywords?: string[];
		deckSummary?: string;
	};
	/** Per-occurrence front renderer. Serialized exports provide this to replace
	 *  the shared QR with the physical ID allocated for this exact print slot.
	 *  The renderer owns QR verification for the fronts it returns; without it,
	 *  every front with a QR cell is decoded and size-checked before export. */
	frontRenderer?: (context: {
		pair: CardPair;
		cardIndex: number;
		copyIndex: number;
		slotIndex: number;
	}) => Promise<HTMLCanvasElement>;
	/** "How to Read" insert. Emitted on its own leading sheet holding one insert
	 *  per copy — printing 3 copies produces 3 decks, so 3 inserts. Kept out of
	 *  the element planner so a sheet still holds exactly one color, and out of
	 *  `frontRenderer` so it never consumes a physical-card identity. */
	insertPair?: CardPair;
}

export interface FixedSheetBatchOptions {
	paperSize?: PaperSizeId;
	meta?: HomePrintOptions['meta'];
}

/**
 * Export already-composed physical sheets as a duplex batch. Combined output
 * alternates each job's pages (pack 1 front, pack 1 back, pack 2 front, pack 2
 * back), which keeps every unique festival assortment paired in a printer's
 * automatic duplex path. Shared card canvases are embedded only once.
 */
export async function exportFixedSheetBatchPDF(
	sheets: readonly (readonly CardPair[])[],
	deckName: string,
	cardSize: CardSizeId = 'poker',
	onProgress?: (current: number, total: number) => void,
	mode: PrintPDFMode = 'combined',
	options: FixedSheetBatchOptions = {}
): Promise<Blob> {
	if (sheets.length === 0) throw new Error('Fixed-sheet batch is empty');

	const layout = getPageLayout(cardSize, options.paperSize ?? 'letter');
	const { cols, cardsPerPage, cardWidthPt, cardHeightPt, gutterPt, marginXPt, marginYPt, pageWidthPt, pageHeightPt } =
		layout;
	for (const [index, sheet] of sheets.entries()) {
		if (sheet.length !== cardsPerPage) {
			throw new Error(`Fixed sheet ${index + 1} needs ${cardsPerPage} cards; received ${sheet.length}`);
		}
	}

	const includeFronts = mode === 'combined' || mode === 'fronts';
	const includeBacks = mode === 'combined' || mode === 'backs';
	if (includeFronts) {
		await verifyCardFrontQrs(sheets.flat(), (front) => homePrintPixelsPerInch(front, cardSize));
	}

	const pdfDoc = await PDFDocument.create();
	applyPrintViewerPrefs(pdfDoc);
	const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
	const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
	const progressTotal = sheets.length * ((includeFronts ? 1 : 0) + (includeBacks ? 1 : 0));
	let progressCount = 0;

	const frontImages = new Map<HTMLCanvasElement, PDFImage>();
	const backImages = new Map<HTMLCanvasElement, PDFImage>();
	const embed = async (canvas: HTMLCanvasElement, cache: Map<HTMLCanvasElement, PDFImage>): Promise<PDFImage> => {
		let image = cache.get(canvas);
		if (!image) {
			image = await pdfDoc.embedPng(canvasToPngBytes(canvas));
			cache.set(canvas, image);
		}
		return image;
	};

	for (let sheetIndex = 0; sheetIndex < sheets.length; sheetIndex++) {
		const sheet = sheets[sheetIndex]!;
		const packLabel = `PACK ${String(sheetIndex + 1).padStart(2, '0')}`;

		if (includeFronts) {
			const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
			for (let index = 0; index < sheet.length; index++) {
				const pair = sheet[index]!;
				const col = index % cols;
				const row = Math.floor(index / cols);
				page.drawImage(await embed(pair.front, frontImages), {
					x: marginXPt + col * (cardWidthPt + gutterPt),
					y: pageHeightPt - marginYPt - (row + 1) * cardHeightPt - row * gutterPt,
					width: cardWidthPt,
					height: cardHeightPt,
				});
			}
			drawCropMarks(page, layout);
			drawSheetLabel(
				page,
				font,
				fontBold,
				`FRONTS  ·  ${packLabel}`,
				sheetIndex + 1,
				sheets.length,
				deckName,
				options.meta?.deckSummary
			);
			drawFlipHint(page, font, 'FRONT SIDE');
			onProgress?.(++progressCount, progressTotal);
		}

		if (includeBacks) {
			const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
			for (let index = 0; index < sheet.length; index++) {
				const pair = sheet[index]!;
				const col = index % cols;
				const row = Math.floor(index / cols);
				const mirroredCol = cols - 1 - col;
				page.drawImage(await embed(pair.back, backImages), {
					x: marginXPt + mirroredCol * (cardWidthPt + gutterPt),
					y: pageHeightPt - marginYPt - (row + 1) * cardHeightPt - row * gutterPt,
					width: cardWidthPt,
					height: cardHeightPt,
				});
			}
			drawCropMarks(page, layout);
			drawSheetLabel(
				page,
				font,
				fontBold,
				`BACKS  ·  ${packLabel}`,
				sheetIndex + 1,
				sheets.length,
				deckName,
				options.meta?.deckSummary
			);
			drawFlipHint(page, font, 'BACK SIDE: columns mirrored for long-edge flip');
			onProgress?.(++progressCount, progressTotal);
		}
	}

	const meta = options.meta;
	if (meta?.title) pdfDoc.setTitle(meta.title);
	if (meta?.subject) pdfDoc.setSubject(meta.subject);
	if (meta?.keywords?.length) pdfDoc.setKeywords(meta.keywords);
	pdfDoc.setCreator('Flow Arts Composer');
	pdfDoc.setProducer('Flow Arts Composer');

	const pdfBytes = await pdfDoc.save();
	return new Blob([pdfBytes.buffer as ArrayBuffer], {
		type: 'application/pdf',
	});
}

interface IndexedCardPair {
	pair: CardPair;
	cardIndex: number;
	/** Insert slots skip serialization; they have no sequence and no short code. */
	isInsert?: boolean;
}

type IndexedPrintSlot = PlannedSlot<IndexedCardPair>;

/** Capitalize an element key for sheet labels: "fire" → "Fire". Multi-word
 *  labels (the insert's "How to Read") arrive already cased and pass through. */
function capitalize(s: string): string {
	return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}

/** Grid layout on Letter pages for double-sided home printing.
 *
 *  Cards are grouped by element (fixed TND_ELEMENTS order), each color
 *  whole-block-repeated `copies` times and padded to whole sheets, so every
 *  printed sheet holds exactly one element — a cut never crosses two colors.
 *
 *  Combined mode: all fronts → flip instruction → all backs
 *  Fronts mode: all fronts
 *  Backs mode: all backs (columns mirrored for long-edge duplex)
 *
 *  Every page gets: crop marks, sheet labels (with element name), flip hints.
 */
export async function exportHomePrintPDF(
	pairs: CardPair[],
	deckName: string,
	cardSize: CardSizeId = 'poker',
	onProgress?: (current: number, total: number) => void,
	mode: PrintPDFMode = 'combined',
	options: HomePrintOptions = {}
): Promise<Blob> {
	const layout = getPageLayout(cardSize, options.paperSize ?? 'letter');
	const { cols, cardsPerPage, cardWidthPt, cardHeightPt, gutterPt, marginXPt, marginYPt, pageWidthPt, pageHeightPt } =
		layout;

	const copies = Math.max(1, Math.floor(options.copies ?? 1));
	const jobCopies = Math.max(1, Math.floor(options.jobCopies ?? 1));
	const elements = options.elements ?? [];
	const groupByElement = options.groupByElement ?? true;
	const firstOnTop = options.firstOnTop ?? true;
	// firstOnTop: reverse card order so the deck's FIRST card is drawn last and
	// lands on top of the printed/cut stack (was: last card on top).
	const indexedPairs: IndexedCardPair[] = pairs.map((pair, cardIndex) => ({
		pair,
		cardIndex,
	}));
	const plannedSlots = planPrintSlots(indexedPairs, elements, copies, cardsPerPage, groupByElement, firstOnTop);

	// The insert gets its own leading sheet(s): one insert per copy, padded to a
	// whole sheet. Routing it through planPrintSlots instead would either merge it
	// into an element bucket or land it at the bottom of the cut stack, since
	// firstOnTop reverses block order.
	const insertSlots: IndexedPrintSlot[] = [];
	if (options.insertPair) {
		const insertItem: IndexedCardPair = {
			pair: options.insertPair,
			cardIndex: -1,
			isInsert: true,
		};
		for (let c = 0; c < copies; c++) {
			insertSlots.push({
				item: insertItem,
				elementName: 'How to Read',
				copyIndex: c,
			});
		}
		while (insertSlots.length % cardsPerPage !== 0) {
			insertSlots.push({
				item: null,
				elementName: 'How to Read',
				copyIndex: null,
			});
		}
	}

	const slots = [...insertSlots, ...plannedSlots];
	const totalSheets = slots.length / cardsPerPage; // integer by construction

	const includeFronts = mode === 'combined' || mode === 'fronts';
	const includeBacks = mode === 'combined' || mode === 'backs';
	if (includeFronts && !options.frontRenderer) {
		await verifyCardFrontQrs(pairs, (front) => homePrintPixelsPerInch(front, cardSize));
	}

	const pdfDoc = await PDFDocument.create();
	applyPrintViewerPrefs(pdfDoc);
	const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
	const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
	const progressTotal = ((includeFronts ? totalSheets : 0) + (includeBacks ? totalSheets : 0)) * jobCopies;
	let progressCount = 0;

	// Embed each unique card PNG once; reuse the handle across all N copies.
	const frontImages = new Map<HTMLCanvasElement, PDFImage>();
	const backImages = new Map<HTMLCanvasElement, PDFImage>();
	const embedFront = async (c: HTMLCanvasElement): Promise<PDFImage> => {
		let img = frontImages.get(c);
		if (!img) {
			img = await pdfDoc.embedPng(canvasToPngBytes(c));
			frontImages.set(c, img);
		}
		return img;
	};
	const embedBack = async (c: HTMLCanvasElement): Promise<PDFImage> => {
		let img = backImages.get(c);
		if (!img) {
			img = await pdfDoc.embedPng(canvasToPngBytes(c));
			backImages.set(c, img);
		}
		return img;
	};

	const sheetSide = (base: string, sheetSlots: IndexedPrintSlot[]): string => {
		const el = sheetSlots[0]?.elementName ?? null;
		return el ? `${base}  ·  ${capitalize(el)}` : base;
	};

	for (let job = 0; job < jobCopies; job++) {
		if (includeFronts) {
			for (let sheet = 0; sheet < totalSheets; sheet++) {
				const start = sheet * cardsPerPage;
				const sheetSlots = slots.slice(start, start + cardsPerPage);
				const frontsPage = pdfDoc.addPage([pageWidthPt, pageHeightPt]);

				for (let i = 0; i < sheetSlots.length; i++) {
					const slot = sheetSlots[i]!;
					if (!slot.item) continue;
					const col = i % cols;
					const row = Math.floor(i / cols);
					const x = marginXPt + col * (cardWidthPt + gutterPt);
					const y = pageHeightPt - marginYPt - (row + 1) * cardHeightPt - row * gutterPt;
					// The insert has no sequence, so it never goes through the serialized
					// renderer — its identical pixels are embedded once and reused.
					const serialize = Boolean(options.frontRenderer) && !slot.item.isInsert;
					const front = serialize
						? await options.frontRenderer!({
								pair: slot.item.pair,
								cardIndex: slot.item.cardIndex,
								copyIndex: slot.copyIndex!,
								slotIndex: start + i,
							})
						: slot.item.pair.front;
					// Serialized fronts are unique by definition; caching their canvas
					// handles would retain every full-size copy for the life of the PDF.
					const img = serialize ? await pdfDoc.embedPng(canvasToPngBytes(front)) : await embedFront(front);
					frontsPage.drawImage(img, {
						x,
						y,
						width: cardWidthPt,
						height: cardHeightPt,
					});
				}

				drawCropMarks(frontsPage, layout);
				drawSheetLabel(
					frontsPage,
					font,
					fontBold,
					sheetSide('FRONTS', sheetSlots),
					sheet + 1,
					totalSheets,
					deckName,
					options.meta?.deckSummary
				);
				drawFlipHint(frontsPage, font, 'FRONT SIDE');
				onProgress?.(++progressCount, progressTotal);
			}
		}

		if (mode === 'combined' && (options.includeFlipInstruction ?? true)) {
			addFlipInstructionPage(pdfDoc, font, fontBold, pageWidthPt, pageHeightPt);
		}

		if (includeBacks) {
			for (let sheet = 0; sheet < totalSheets; sheet++) {
				const start = sheet * cardsPerPage;
				const sheetSlots = slots.slice(start, start + cardsPerPage);
				const backsPage = pdfDoc.addPage([pageWidthPt, pageHeightPt]);

				for (let i = 0; i < sheetSlots.length; i++) {
					const slot = sheetSlots[i]!;
					if (!slot.item) continue;
					const col = i % cols;
					const row = Math.floor(i / cols);
					const mirroredCol = cols - 1 - col;
					const x = marginXPt + mirroredCol * (cardWidthPt + gutterPt);
					const y = pageHeightPt - marginYPt - (row + 1) * cardHeightPt - row * gutterPt;
					const img = await embedBack(slot.item.pair.back);
					backsPage.drawImage(img, {
						x,
						y,
						width: cardWidthPt,
						height: cardHeightPt,
					});
				}

				drawCropMarks(backsPage, layout);
				drawSheetLabel(
					backsPage,
					font,
					fontBold,
					sheetSide('BACKS', sheetSlots),
					sheet + 1,
					totalSheets,
					deckName,
					options.meta?.deckSummary
				);
				drawFlipHint(backsPage, font, 'BACK SIDE: columns mirrored for long-edge flip');
				onProgress?.(++progressCount, progressTotal);
			}
		}
	}

	// Embed deck metadata so the downloaded file is indexable by reference number
	// and word list. pdf-lib writes these into the PDF Info dictionary.
	const meta = options.meta;
	if (meta?.title) pdfDoc.setTitle(meta.title);
	if (meta?.subject) pdfDoc.setSubject(meta.subject);
	if (meta?.keywords?.length) pdfDoc.setKeywords(meta.keywords);
	pdfDoc.setCreator('Flow Arts Composer');
	pdfDoc.setProducer('Flow Arts Composer');

	const pdfBytes = await pdfDoc.save();
	return new Blob([pdfBytes.buffer as ArrayBuffer], {
		type: 'application/pdf',
	});
}

function cardX(col: number, layout: PageLayout): number {
	return layout.marginXPt + col * (layout.cardWidthPt + layout.gutterPt);
}
function cardY(row: number, layout: PageLayout): number {
	return layout.pageHeightPt - layout.marginYPt - (row + 1) * layout.cardHeightPt - row * layout.gutterPt;
}

function drawCropMarks(page: PDFPage, layout: PageLayout) {
	const { cols, rows } = layout;

	for (let col = 0; col < cols; col++) {
		const left = cardX(col, layout);
		const right = left + layout.cardWidthPt;

		// Vertical marks at top and bottom margins for each card edge
		const topEdge = layout.pageHeightPt - layout.marginYPt;
		const botEdge = cardY(rows - 1, layout);

		// Top margin marks
		page.drawLine({
			start: { x: left, y: topEdge + CROP_OFFSET },
			end: { x: left, y: topEdge + CROP_OFFSET + CROP_LEN },
			thickness: 0.5,
			color: CROP_COLOR,
		});
		page.drawLine({
			start: { x: right, y: topEdge + CROP_OFFSET },
			end: { x: right, y: topEdge + CROP_OFFSET + CROP_LEN },
			thickness: 0.5,
			color: CROP_COLOR,
		});

		// Bottom margin marks
		page.drawLine({
			start: { x: left, y: botEdge - CROP_OFFSET },
			end: { x: left, y: botEdge - CROP_OFFSET - CROP_LEN },
			thickness: 0.5,
			color: CROP_COLOR,
		});
		page.drawLine({
			start: { x: right, y: botEdge - CROP_OFFSET },
			end: { x: right, y: botEdge - CROP_OFFSET - CROP_LEN },
			thickness: 0.5,
			color: CROP_COLOR,
		});
	}

	for (let row = 0; row < rows; row++) {
		const top = cardY(row, layout) + layout.cardHeightPt;
		const bot = cardY(row, layout);

		const leftEdge = layout.marginXPt;
		const rightEdge = cardX(cols - 1, layout) + layout.cardWidthPt;

		// Left margin marks
		page.drawLine({
			start: { x: leftEdge - CROP_OFFSET, y: top },
			end: { x: leftEdge - CROP_OFFSET - CROP_LEN, y: top },
			thickness: 0.5,
			color: CROP_COLOR,
		});
		page.drawLine({
			start: { x: leftEdge - CROP_OFFSET, y: bot },
			end: { x: leftEdge - CROP_OFFSET - CROP_LEN, y: bot },
			thickness: 0.5,
			color: CROP_COLOR,
		});

		// Right margin marks
		page.drawLine({
			start: { x: rightEdge + CROP_OFFSET, y: top },
			end: { x: rightEdge + CROP_OFFSET + CROP_LEN, y: top },
			thickness: 0.5,
			color: CROP_COLOR,
		});
		page.drawLine({
			start: { x: rightEdge + CROP_OFFSET, y: bot },
			end: { x: rightEdge + CROP_OFFSET + CROP_LEN, y: bot },
			thickness: 0.5,
			color: CROP_COLOR,
		});
	}
}

function drawSheetLabel(
	page: PDFPage,
	font: PDFFont,
	fontBold: PDFFont,
	side: string,
	sheetNum: number,
	totalSheets: number,
	deckName: string,
	deckSummary = ''
) {
	const { width: pageW, height: pageH } = page.getSize();
	const label = `${side}  ·  Sheet ${sheetNum} of ${totalSheets}`;
	const labelWidth = fontBold.widthOfTextAtSize(label, 7);
	page.drawText(label, {
		x: pageW - labelWidth - LABEL_EDGE_X,
		y: pageH - LABEL_EDGE_Y - 7,
		size: 7,
		font: fontBold,
		color: GUIDE_COLOR,
	});

	// Recipe params, centered in the top margin (may overlap the flip guide — fine).
	if (deckSummary) {
		const sumWidth = font.widthOfTextAtSize(deckSummary, 7);
		page.drawText(deckSummary, {
			x: (pageW - sumWidth) / 2,
			y: pageH - LABEL_EDGE_Y - 7,
			size: 7,
			font: fontBold,
			color: GUIDE_COLOR,
		});
	}

	if (deckName) {
		page.drawText(deckName, {
			x: LABEL_EDGE_X,
			y: pageH - LABEL_EDGE_Y - 6,
			size: 6,
			font,
			color: GUIDE_COLOR,
		});
	}
}

function drawFlipHint(page: PDFPage, font: PDFFont, hint: string) {
	page.drawText(hint, {
		x: LABEL_EDGE_X,
		y: LABEL_EDGE_Y,
		size: 6,
		font,
		color: GUIDE_COLOR,
	});

	// Arrow in bottom-right indicating long-edge flip direction
	const flipText = '>> LONG EDGE';
	const flipWidth = font.widthOfTextAtSize(flipText, 6);
	page.drawText(flipText, {
		x: page.getSize().width - LABEL_EDGE_X - flipWidth,
		y: LABEL_EDGE_Y,
		size: 6,
		font,
		color: GUIDE_COLOR,
	});
}

function addFlipInstructionPage(
	pdfDoc: PDFDocument,
	font: PDFFont,
	fontBold: PDFFont,
	pageWidthPt: number,
	pageHeightPt: number
) {
	const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
	const cx = pageWidthPt / 2;
	let y = pageHeightPt / 2 + 60;

	const title = 'STOP: FLIP YOUR PAPER';
	const titleW = fontBold.widthOfTextAtSize(title, 16);
	page.drawText(title, {
		x: cx - titleW / 2,
		y,
		size: 16,
		font: fontBold,
		color: GUIDE_COLOR,
	});

	y -= 36;
	const steps = [
		'1.  Remove all printed fronts from the output tray',
		'2.  Flip the stack on the LONG EDGE',
		'3.  Reinsert into the paper tray, top edge goes in first',
		'4.  Print the remaining pages (all backs)',
	];
	for (const step of steps) {
		const w = font.widthOfTextAtSize(step, 10);
		page.drawText(step, {
			x: cx - w / 2,
			y,
			size: 10,
			font,
			color: GUIDE_COLOR,
		});
		y -= 18;
	}

	y -= 12;
	const note = 'This page does not print on card stock. It is an instruction separator.';
	const noteW = font.widthOfTextAtSize(note, 7);
	page.drawText(note, {
		x: cx - noteW / 2,
		y,
		size: 7,
		font,
		color: GUIDE_COLOR,
	});
}

function canvasToPngBytes(canvas: HTMLCanvasElement): Uint8Array {
	const dataUrl = canvas.toDataURL('image/png');
	const base64 = dataUrl.split(',')[1]!;
	return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}
