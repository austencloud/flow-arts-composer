import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import { hashSequenceContent } from "#lib/shared/foundation/services/content-hasher.js";
import type { CardSizeId, PaperSizeId } from "../../../domain/card-sizes";
import { getPageLayout, PAPER_SIZES } from "../../../domain/card-sizes";
import { buildDeckAiSummary } from "../../../services/deck-ai-summary";
import type { PrintPDFMode } from "../../../services/print-pdf-exporter";
import {
  copyWaste,
  suggestCopyCounts,
} from "../../../services/print-copy-suggester";
import type { CardPair } from "../../../services/types";
import type { PrintSide } from "../../print-preview/print-side";
import {
  buildHandPathDeckPrintMetadata,
  buildDeckPrintMetadata,
  normalizeDeckFooters,
  orderDeckForPrint,
  usesSerializedCardIdentity,
} from "../deck-print-model";
import {
  getHandPathReferenceCards,
  getHandPathReferenceNotes,
} from "../../../domain/hand-path-reference-cards";
import { isHandPathRelease } from "../deck-release-model";
import type { DeckReleaserSessionStorage } from "./deck-releaser-session";
import type { DeckReleaserState } from "./deck-releaser-state.svelte";

const PRINT_SETTINGS_KEY = "deckReleaser.printSettings";
type PairPreparer = () => Promise<CardPair[]>;

interface PersistedPrintSettings {
  cardSize: CardSizeId;
  paperSize?: PaperSizeId;
  copies: number;
  groupByElement: boolean;
  groupByLetter?: boolean;
  includeHowToRead?: boolean;
}

export interface DeckPrintStateDependencies {
  storage: DeckReleaserSessionStorage;
  download(blob: Blob, filename: string): void;
  renderInsertCardPair: typeof import("../../../services/PrintCardRenderer").renderInsertCardPair;
  getOrBuildPrintPDF: typeof import("../../../services/print-pdf-cache").getOrBuildPrintPDF;
  prepareSerializedPrintRun: typeof import("../../../services/serialized-print-run").prepareSerializedPrintRun;
  exportHomePrintPDF: typeof import("../../../services/print-pdf-exporter").exportHomePrintPDF;
  exportCalibrationPDF: typeof import("../../../services/print-pdf-exporter").exportCalibrationPDF;
  printPdfBlob(blob: Blob): void | Promise<void>;
  exportDeckZIP: typeof import("../../../services/print-zip-exporter").exportDeckZIP;
}

function loadPrintSettings(
  storage: DeckReleaserSessionStorage
): Partial<PersistedPrintSettings> {
  if (!storage) return {};
  try {
    const raw = storage.getItem(PRINT_SETTINGS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function createDeckPrintState(
  deck: DeckReleaserState,
  deps: DeckPrintStateDependencies
) {
  const saved = loadPrintSettings(deps.storage);
  let cardSize = $state<CardSizeId>(saved.cardSize ?? "poker");
  // Guard the persisted value: an unknown id (removed size, corrupted storage)
  // must not reach getPageLayout as an object key.
  let paperSize = $state<PaperSizeId>(
    saved.paperSize && saved.paperSize in PAPER_SIZES
      ? saved.paperSize
      : "letter"
  );
  let copies = $state(
    saved.copies ?? getPageLayout(cardSize, paperSize).cardsPerPage
  );
  let groupByElement = $state(saved.groupByElement ?? true);
  let groupByLetter = $state(saved.groupByLetter ?? false);
  let includeHowToRead = $state(saved.includeHowToRead ?? false);
  let selectedSide = $state<PrintSide>("fronts");
  let pairPreparer: PairPreparer | null = null;
  let isRendering = $state(false);
  let renderProgress = $state(0);
  let isExporting = $state(false);
  let isPrinting = $state(false);
  let exportProgress = $state(0);
  let exportTotal = $state(0);
  let exportError = $state("");
  let rerenderKey = $state(0);

  $effect(() => {
    if (!deps.storage) return;
    try {
      deps.storage.setItem(
        PRINT_SETTINGS_KEY,
        JSON.stringify({
          cardSize,
          paperSize,
          copies,
          groupByElement,
          groupByLetter,
          includeHowToRead,
        })
      );
    } catch {
      // Printing still works when the browser refuses preference storage.
    }
  });

  const handPathCards = $derived.by(() => {
    const manifest = deck.viewingRelease?.handPathCards;
    return manifest ? getHandPathReferenceCards(manifest.cardIds) : [];
  });
  const isHandPathDeck = $derived(
    Boolean(deck.viewingRelease && isHandPathRelease(deck.viewingRelease))
  );
  const footers = $derived(normalizeDeckFooters(deck.cards));
  const ordered = $derived.by(() =>
    orderDeckForPrint(deck.sequences, footers, {
      groupByElement,
      groupByLetter,
    })
  );
  const sortedSequences = $derived(
    isHandPathDeck
      ? handPathCards.map(
          (referenceCard) =>
            deck.sequences.find(
              (sequence) => sequence.id === referenceCard.sequence.id
            ) ?? referenceCard.sequence
        )
      : (ordered.sequences as SequenceData[])
  );
  const sortedFooters = $derived(
    isHandPathDeck
      ? handPathCards.map((referenceCard) => ({
          center: getHandPathReferenceNotes(referenceCard),
        }))
      : ordered.footers
  );
  const qrUrls = $derived(
    sortedSequences.map(
      (sequence) =>
        deck.cards.find((card) => card.sequenceId === sequence.id)?.qrUrl
    )
  );
  const tndElements = $derived(
    isHandPathDeck
      ? handPathCards.map((referenceCard) => referenceCard.element)
      : ordered.tndElements
  );
  const cardTitles = $derived(
    isHandPathDeck
      ? handPathCards.map((referenceCard) => referenceCard.cardTitle)
      : []
  );
  const cardProfile = $derived<"sequence" | "hand-path">(
    isHandPathDeck ? "hand-path" : "sequence"
  );
  const effectiveGroupByElement = $derived(
    isHandPathDeck ? false : groupByElement
  );
  const renderTotal = $derived(sortedSequences.length);
  const deckRefNumber = $derived(
    deck.viewingRelease?.deckNumber ?? deck.referenceNumber
  );
  const deckRefPadded = $derived(String(deckRefNumber).padStart(3, "0"));
  const groupSizes = $derived.by(() => {
    if (!effectiveGroupByElement) return [sortedSequences.length];
    const counts = new Map<string, number>();
    for (const element of tndElements) {
      const key = element?.element ?? "__untagged__";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.values()];
  });
  const cardsPerPage = $derived(
    getPageLayout(cardSize, paperSize).cardsPerPage
  );
  const copiesPresets = $derived.by(() => {
    const ladder = suggestCopyCounts(groupSizes, cardsPerPage).map(
      (suggestion) => suggestion.copies
    );
    const withFullSheet = ladder.includes(cardsPerPage)
      ? ladder
      : [...ladder, cardsPerPage];
    return withFullSheet.sort((left, right) => left - right);
  });

  function copiesAnnotate(value: number) {
    const waste = copyWaste(groupSizes, cardsPerPage, value);
    return { blanks: waste.blanks, perfect: waste.blanks === 0 };
  }

  function buildMetadata() {
    const deckLabel = deck.name.trim() || `Deck #${deckRefPadded}`;
    if (isHandPathDeck) {
      return buildHandPathDeckPrintMetadata({
        deckLabel,
        deckRefPadded,
        cardNames: cardTitles,
        includeHowToRead,
      });
    }
    return buildDeckPrintMetadata({
      deckLabel,
      deckRefPadded,
      sequences: sortedSequences,
      loopType: [...deck.selectedLoopTypes][0] ?? "rotated",
      level: [...deck.selectedLevels][0] ?? 1,
      period: [...deck.selectedSliceTypes][0] ?? "",
      selectedLength: deck.selectedLength,
      turnIntensity: deck.turnIntensity,
      gridMode: [...deck.selectedGridModes][0] ?? "diamond",
      propType: String(deck.leftPropType),
      includeHowToRead,
    });
  }

  const metadata = $derived(buildMetadata());

  function getAiSummary(): string {
    if (isHandPathDeck) {
      return [
        `# ${deck.name.trim() || `Deck #${deckRefPadded}`}`,
        "",
        `${cardTitles.length} Timing & Direction hand-path reference cards.`,
        ...cardTitles.map((title) => `- ${title}`),
      ].join("\n");
    }
    const waste = copyWaste(groupSizes, cardsPerPage, copies);
    return buildDeckAiSummary({
      name: deck.name,
      deckNumber: deck.viewingRelease?.deckNumber ?? deck.nextDeckNumber,
      isReleased: deck.viewingRelease != null,
      cards: deck.cards,
      layout: {
        cardSize,
        cardsPerPage,
        copies,
        groupByColor: effectiveGroupByElement,
        groupByLetter,
        includeHowToRead,
        sheets:
          waste.sheets +
          (includeHowToRead ? Math.ceil(copies / cardsPerPage) : 0),
        blanks: waste.blanks,
      },
      recipe: deck.viewingRelease?.recipe ?? deck.toRecipe(),
    });
  }

  const printDeckSignature = $derived.by(() => {
    const cards = sortedSequences
      .map(
        (sequence, index) =>
          `${hashSequenceContent(sequence)}:${JSON.stringify(sortedFooters[index] ?? {})}:${tndElements[index]?.element ?? "_"}`
      )
      .join(",");
    return [
      "2026-08-11-v2",
      deck.name.trim(),
      deck.theme,
      deck.leftPropType,
      deck.rightPropType,
      cardSize,
      includeHowToRead,
      cardProfile,
      cardTitles.join(","),
      rerenderKey,
      cards,
    ].join("|");
  });

  function buildPrintKey(mode: PrintPDFMode): string {
    return [
      `Deck_${deckRefPadded}`,
      mode,
      paperSize,
      copies,
      effectiveGroupByElement,
      groupByLetter,
      includeHowToRead,
      JSON.stringify(metadata),
      printDeckSignature,
    ].join("§");
  }

  function physicalDeckIdentity() {
    const releaseNumber = deck.viewingRelease?.deckNumber ?? null;
    return {
      deckId: releaseNumber
        ? `release:${releaseNumber}`
        : `generated:${deckRefNumber}`,
      deckName: deck.name.trim() || `Deck #${deckRefPadded}`,
      deckReleaseNumber: releaseNumber,
    };
  }

  function metadataForPrintRun(printRunId: string, baseMetadata = metadata) {
    return {
      ...baseMetadata,
      subject: `${baseMetadata.subject} Serialized artwork run ${printRunId}.`,
      keywords: [...baseMetadata.keywords, `print-run:${printRunId}`],
    };
  }

  async function recordFailedPrintRun(run: {
    printRunId: string;
    fail(): Promise<void>;
  }): Promise<boolean> {
    try {
      await run.fail();
      return true;
    } catch (error) {
      console.error(
        `[deck-releaser] could not mark print run ${run.printRunId} failed:`,
        error
      );
      return false;
    }
  }

  async function throwAfterRecordingFailedRun(
    run: { printRunId: string; fail(): Promise<void> },
    error: unknown
  ): Promise<never> {
    const recorded = await recordFailedPrintRun(run);
    if (!recorded) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `${message}. The print run status could not be updated. Try again before reprinting.`
      );
    }
    throw error;
  }

  async function buildInsertPair(options: {
    theme: string;
    cardSize: CardSizeId;
    deckNumber: number;
  }): Promise<CardPair> {
    const { front, back } = await deps.renderInsertCardPair({
      theme: options.theme,
      cardSize: options.cardSize,
      deckNumber: options.deckNumber,
    });
    return { front, back, label: "How to Read" };
  }

  async function requirePreparedPairs(
    prepare: PairPreparer | null,
    expectedCount = sortedSequences.length
  ): Promise<CardPair[]> {
    if (!prepare) {
      throw new Error("The card preview is still preparing.");
    }
    const pairs = await prepare();
    if (pairs.length !== expectedCount) {
      throw new Error(
        "Couldn't prepare every card for printing. Re-render the deck and try again."
      );
    }
    return pairs;
  }

  async function buildPrintPDF(mode: PrintPDFMode): Promise<{
    blob: Blob;
    printRunId: string | null;
  }> {
    const deckName = `Deck_${deckRefPadded}`;
    const key = buildPrintKey(mode);
    const preparePairs = pairPreparer;
    const expectedCardCount = sortedSequences.length;
    const printCardSize = cardSize;
    const printPaperSize = paperSize;
    const printCopies = copies;
    const printElements = [...tndElements];
    const printGroupByElement = effectiveGroupByElement;
    const serializePhysicalCards = usesSerializedCardIdentity(cardProfile);
    const printMetadata = metadata;
    const identity = physicalDeckIdentity();
    const insertOptions = includeHowToRead
      ? {
          theme: deck.theme,
          cardSize: printCardSize,
          deckNumber: deckRefNumber,
        }
      : null;
    const onProgress = (current: number, total: number) => {
      exportProgress = current;
      exportTotal = total;
    };

    return deps.getOrBuildPrintPDF(key, async () => {
      const pairs = await requirePreparedPairs(preparePairs, expectedCardCount);
      const insertPair = insertOptions
        ? await buildInsertPair(insertOptions)
        : undefined;

      if (mode === "backs" || !serializePhysicalCards) {
        const blob = await deps.exportHomePrintPDF(
          pairs,
          deckName,
          printCardSize,
          onProgress,
          mode,
          {
            paperSize: printPaperSize,
            copies: printCopies,
            elements: printElements,
            groupByElement: printGroupByElement,
            meta: printMetadata,
            insertPair,
          }
        );
        return { blob, printRunId: null };
      }

      const run = await deps.prepareSerializedPrintRun({
        pairs,
        ...identity,
        cardSize: printCardSize,
        copies: printCopies,
        groupByElement: printGroupByElement,
        outputMode: mode,
      });
      let blob: Blob;
      try {
        blob = await deps.exportHomePrintPDF(
          pairs,
          deckName,
          printCardSize,
          onProgress,
          mode,
          {
            paperSize: printPaperSize,
            copies: printCopies,
            elements: printElements,
            groupByElement: printGroupByElement,
            meta: metadataForPrintRun(run.printRunId, printMetadata),
            insertPair,
            frontRenderer: ({ pair, cardIndex, copyIndex }) =>
              run.renderFront(pair, cardIndex, copyIndex),
          }
        );
      } catch (error) {
        return throwAfterRecordingFailedRun(run, error);
      }
      await run.complete();
      return { blob, printRunId: run.printRunId };
    });
  }

  async function exportPDF(mode: PrintPDFMode = "combined"): Promise<void> {
    if (sortedSequences.length === 0) return;
    isExporting = true;
    exportError = "";
    exportProgress = 0;
    exportTotal = 0;
    try {
      const deckName = `Deck_${deckRefPadded}`;
      const copiesSuffix = copies > 1 ? `_x${copies}` : "";
      const modeSuffix =
        mode === "fronts" ? "_fronts" : mode === "backs" ? "_backs" : "_print";
      const { blob, printRunId } = await buildPrintPDF(mode);
      const runSuffix = printRunId ? `_run-${printRunId.slice(0, 8)}` : "";
      deps.download(
        blob,
        `${deckName}${modeSuffix}${copiesSuffix}${runSuffix}.pdf`
      );
    } catch (error) {
      exportError = `PDF export failed: ${error instanceof Error ? error.message : error}`;
    } finally {
      isExporting = false;
      exportProgress = 0;
      exportTotal = 0;
    }
  }

  async function exportFrontsAndBacks(): Promise<void> {
    if (sortedSequences.length === 0 || isExporting) return;
    await exportPDF("fronts");
    await exportPDF("backs");
  }

  async function print(mode: PrintPDFMode): Promise<void> {
    if (sortedSequences.length === 0 || isPrinting) return;
    isPrinting = true;
    exportError = "";
    try {
      const { blob } = await buildPrintPDF(mode);
      await deps.printPdfBlob(blob);
    } catch (error) {
      exportError = `Print failed: ${error instanceof Error ? error.message : error}`;
    } finally {
      isPrinting = false;
    }
  }

  // No deck required and no PDF cache: the sheet is cheap to rebuild and must
  // always reflect the CURRENT card size + paper size selection.
  async function printTestSheet(): Promise<void> {
    if (isPrinting) return;
    isPrinting = true;
    exportError = "";
    try {
      const blob = await deps.exportCalibrationPDF(cardSize, paperSize);
      await deps.printPdfBlob(blob);
    } catch (error) {
      exportError = `Test sheet failed: ${error instanceof Error ? error.message : error}`;
    } finally {
      isPrinting = false;
    }
  }

  async function exportZIP(): Promise<void> {
    if (sortedSequences.length === 0) return;
    isExporting = true;
    exportError = "";
    exportProgress = 0;
    exportTotal = 0;
    try {
      const pairs = await requirePreparedPairs(pairPreparer);
      const deckName = `Deck_${deckRefPadded}`;
      if (!usesSerializedCardIdentity(cardProfile)) {
        const blob = await deps.exportDeckZIP(
          pairs,
          deckName,
          (current, total) => {
            exportProgress = current;
            exportTotal = total;
          },
          {
            insertPair: includeHowToRead
              ? await buildInsertPair({
                  theme: deck.theme,
                  cardSize,
                  deckNumber: deckRefNumber,
                })
              : undefined,
          }
        );
        deps.download(blob, `${deckName}_cards.zip`);
        return;
      }
      const run = await deps.prepareSerializedPrintRun({
        pairs,
        ...physicalDeckIdentity(),
        cardSize,
        copies: 1,
        groupByElement: effectiveGroupByElement,
        outputMode: "zip",
      });
      let blob: Blob;
      try {
        blob = await deps.exportDeckZIP(
          pairs,
          deckName,
          (current, total) => {
            exportProgress = current;
            exportTotal = total;
          },
          {
            insertPair: includeHowToRead
              ? await buildInsertPair({
                  theme: deck.theme,
                  cardSize,
                  deckNumber: deckRefNumber,
                })
              : undefined,
            frontRenderer: (pair, cardIndex) =>
              run.renderFront(pair, cardIndex, 0),
          }
        );
      } catch (error) {
        return throwAfterRecordingFailedRun(run, error);
      }
      await run.complete();
      deps.download(
        blob,
        `${deckName}_cards_run-${run.printRunId.slice(0, 8)}.zip`
      );
    } catch (error) {
      exportError = `ZIP export failed: ${error instanceof Error ? error.message : error}`;
    } finally {
      isExporting = false;
      exportProgress = 0;
      exportTotal = 0;
    }
  }

  function changeCardSize(value: CardSizeId): void {
    if (copies === getPageLayout(cardSize, paperSize).cardsPerPage) {
      copies = getPageLayout(value, paperSize).cardsPerPage;
    }
    cardSize = value;
  }

  function changePaperSize(value: PaperSizeId): void {
    // Same full-sheet tracking as changeCardSize: when copies sits on "one full
    // sheet", keep it on one full sheet of the new paper (9 → 25 for poker).
    if (copies === getPageLayout(cardSize, paperSize).cardsPerPage) {
      copies = getPageLayout(cardSize, value).cardsPerPage;
    }
    paperSize = value;
  }

  const previewSideFilter = $derived(
    selectedSide === "fronts"
      ? "fronts"
      : selectedSide === "backs"
        ? "backs"
        : null
  );

  return {
    get cardSize() {
      return cardSize;
    },
    get paperSize() {
      return paperSize;
    },
    get copies() {
      return copies;
    },
    set copies(value) {
      copies = value;
    },
    get groupByElement() {
      return effectiveGroupByElement;
    },
    set groupByElement(value) {
      groupByElement = value;
    },
    get groupByLetter() {
      return groupByLetter;
    },
    set groupByLetter(value) {
      groupByLetter = value;
    },
    get includeHowToRead() {
      return includeHowToRead;
    },
    set includeHowToRead(value) {
      includeHowToRead = value;
    },
    get selectedSide() {
      return selectedSide;
    },
    set selectedSide(value) {
      selectedSide = value;
    },
    get isRendering() {
      return isRendering;
    },
    set isRendering(value) {
      isRendering = value;
    },
    get renderProgress() {
      return renderProgress;
    },
    set renderProgress(value) {
      renderProgress = value;
    },
    get isExporting() {
      return isExporting;
    },
    get isPrinting() {
      return isPrinting;
    },
    get exportProgress() {
      return exportProgress;
    },
    get exportTotal() {
      return exportTotal;
    },
    get exportError() {
      return exportError;
    },
    get rerenderKey() {
      return rerenderKey;
    },
    get footers() {
      return footers;
    },
    get sortedSequences() {
      return sortedSequences;
    },
    get sortedFooters() {
      return sortedFooters;
    },
    get cardTitles() {
      return cardTitles;
    },
    get qrUrls() {
      return qrUrls;
    },
    get cardProfile() {
      return cardProfile;
    },
    get isHandPathDeck() {
      return isHandPathDeck;
    },
    get tndElements() {
      return tndElements;
    },
    get renderTotal() {
      return renderTotal;
    },
    get deckRefNumber() {
      return deckRefNumber;
    },
    get copiesPresets() {
      return copiesPresets;
    },
    get metadata() {
      return metadata;
    },
    get previewSideFilter() {
      return previewSideFilter;
    },
    copiesAnnotate,
    getAiSummary,
    changeCardSize,
    changePaperSize,
    printTestSheet,
    requestRerender() {
      rerenderKey++;
    },
    setPairPreparer(value: PairPreparer | null) {
      pairPreparer = value;
    },
    setRenderState(state: { isRendering: boolean; progress: number }) {
      isRendering = state.isRendering;
      renderProgress = state.progress;
    },
    exportPDF,
    exportFrontsAndBacks,
    print,
    exportZIP,
  };
}

export type DeckPrintState = ReturnType<typeof createDeckPrintState>;
