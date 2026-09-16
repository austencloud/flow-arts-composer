<script lang="ts">
  import { getPrintCardRenderer } from "$lib/features/choreo-card/getPrintCardRenderer";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { CardFooter } from "../../domain/models/DeckRelease";
  import type { CardSizeId } from "../../domain/card-sizes";
  import type { CardPair } from "../../services/types";
  import type { PrintRenderOptions } from "../../services/types";
  import type { TnDElement } from "../../domain/tnd-element";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import {
    getPageLayout,
    CARD_SIZES,
    PAPER_SIZES,
    type PaperSizeId,
  } from "../../domain/card-sizes";
  import {
    planPrintSlots,
    type PlannedSlot,
  } from "../../services/print-slot-planner";
  import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";
  import { getImageCompositionManager } from "$lib/shared/share/state/image-composition-state.svelte";
  import { calculatePhysicalCardLayout } from "../../services/physical-card-layout-calculator";
  import {
    cardCache,
    type RenderedCard,
    type CachedCard,
  } from "./print-preview-cache";
  import {
    deckCardBlobCache,
    canvasToBlob,
  } from "../../services/DeckCardBlobCache";
  import { hashSequenceContent } from "$lib/shared/foundation/services/content-hasher";
  import { getShortCodeManager } from "$lib/shared/qr/get-short-code-manager";
  import { getCompositionDispatcher } from "$lib/shared/render/get-composition-dispatcher";
  import { buildOverridePlacementBundle } from "$lib/shared/render/services/override-placement-bundle";
  import { prewarmCardPool } from "$lib/shared/render/services/card-pool-prewarm";
  import { warmCardBackCachesAsync } from "../../services/card-back/warm-card-back-caches";
  import ShimmerBlock from "$lib/shared/components/loading/ShimmerBlock.svelte";
  import { showToast } from "$lib/shared/toast/state/toast-state.svelte";

  // Render-schema version baked into every card cache key (memory + IndexedDB).
  // Bump when rendered pixels change for reasons NOT captured by the keyed
  // options below — e.g. the canonical profile changes. Rotates all keys so
  // stale persisted renders self-invalidate.
  const CARD_RENDER_SCHEMA = "v11";

  interface Props {
    sequences: SequenceData[];
    cardSize: CardSizeId;
    /** Sheet stock the preview sheets are laid out on. Defaults to Letter so
     *  non-releaser callers keep their existing pages. */
    paperSize?: PaperSizeId;
    theme: string;
    isLoading: boolean;
    includeStartPlacement?: boolean;
    tndElement?: TnDElement;
    /** Per-card TnD elements, index-aligned with sequences (overrides single tndElement) */
    tndElements?: (TnDElement | undefined)[];
    /** Per-card footer data, index-aligned with sequences */
    footers?: CardFooter[];
    /** Per-card short URLs, index-aligned with sequences. When supplied, card
     *  rendering stays read-only and skips Firestore short-code resolution. */
    qrUrls?: (string | undefined)[];
    /** Hands-only cards use literal titles and QR links, without prop difficulty or TKA. */
    cardProfile?: "sequence" | "hand-path";
    /** Plain card titles, index-aligned with sequences. */
    cardTitles?: string[];
    /** Use deck layout policy instead of user composition settings */
    deckMode?: boolean;
    /** Bump to force a full re-render of all cards */
    rerenderKey?: number;
    /** Whole-deck copies. Each element fills whole sheets, repeated N times.
     *  Reuses cached renders — a copy costs one extra <img>, never a re-render. */
    copies?: number;
    /** When false, relax one-color-per-sheet: cards fill sheets in order, blanks
     *  only on the final sheet. Preview + PDF share this flag. Default true. */
    groupByElement?: boolean;
    /** Right-click context menu on a card cell: (x, y, rerender callback for that card, sequence) */
    onCardContextMenu?: (
      x: number,
      y: number,
      rerender: () => void,
      sequence: SequenceData
    ) => void;
    /** Left-click a card to inspect it (includes the pre-rendered front image URL and a rerender callback) */
    onCardClick?: (
      sequence: SequenceData,
      frontImageUrl?: string,
      rerender?: () => Promise<string | null>
    ) => void;
    /** Supplies print-ready canvases on demand. Keeping them out of preview
     *  state avoids retaining two full-resolution canvases for every card. */
    onPairPreparerReady?: (prepare: (() => Promise<CardPair[]>) | null) => void;
    onRenderStateChange?: (state: {
      isRendering: boolean;
      progress: number;
      total: number;
    }) => void;
    /** "sheets" = print-ready pages with fronts+backs, "grid" = flowing card grid (fronts only) */
    displayMode?: "sheets" | "grid";
    /** Grid mode only: render each card's back image stacked beneath its front */
    showBacks?: boolean;
    /** Deck ID for QR attribution tracking */
    deckId?: string;
    /** Deck name for QR attribution tracking */
    deckName?: string;
    /** Release number. When set, the preview leads with the "How to Read"
     *  insert exactly as the exporters do, and the insert prints this number. */
    deckNumber?: number;
    /** Include the leading How to Read sheet. Defaults on for existing callers;
     *  the Deck Releaser supplies its persisted print setting explicitly. */
    includeInsertCard?: boolean;
    /** Concise recipe line (deck label · loop · period · length · level · turns ·
     *  grid · prop). Printed centered in each sheet's top margin by the PDF
     *  exporter; the preview mirrors it in the same spot so screen == print. */
    deckSummary?: string;
    /**
     * Pin prop types for the render instead of reading live settings. Set when
     * viewing a released deck so cached card renders stay valid across setting
     * changes. Omit to follow the user's current settings.
     */
    leftPropType?: PropType;
    rightPropType?: PropType;
    /**
     * Scope the sheet preview to one printed side. 'fronts' renders only the
     * fronts phase, 'backs' only the backs phase, null (default) renders both.
     * Lets the print panel show exactly what the selected Print button sends.
     */
    sideFilter?: "fronts" | "backs" | null;
  }

  let {
    sequences,
    cardSize,
    paperSize = "letter",
    theme,
    isLoading,
    includeStartPlacement = true,
    tndElement,
    tndElements,
    footers,
    qrUrls,
    cardProfile = "sequence",
    cardTitles,
    deckMode = false,
    rerenderKey = 0,
    copies = 1,
    groupByElement = true,
    onCardContextMenu,
    onCardClick,
    onPairPreparerReady,
    onRenderStateChange,
    displayMode = "sheets",
    showBacks = false,
    deckId,
    deckName,
    deckNumber,
    includeInsertCard = true,
    deckSummary,
    leftPropType,
    rightPropType,
    sideFilter = null,
  }: Props = $props();

  // Resolve render-visual inputs: explicit overrides pin a released deck's
  // render; otherwise follow live settings. The cache key and render options
  // both read these so a pinned deck's content hash matches what was cached.
  const resolvedLeftProp = $derived(
    leftPropType ?? settingsService.settings.leftPropType ?? PropType.STAFF
  );
  const resolvedRightProp = $derived(
    rightPropType ?? settingsService.settings.rightPropType ?? PropType.STAFF
  );
  const resolvedBackground = $derived(
    theme ?? settingsService.settings.backgroundType ?? ""
  );

  // The "How to Read" insert, rendered as a preview card so the on-screen
  // sheets match the exported document. Cheap: the renderer caches per
  // theme + deck number, and this is one card, not one per sequence.
  let insertCard: RenderedCard | null = $state(null);
  $effect(() => {
    const size = cardSize;
    const activeTheme = resolvedBackground;
    const n = deckNumber;
    let cancelled = false;

    if (!includeInsertCard) {
      insertCard = null;
      return;
    }

    void (async () => {
      const { renderInsertCardPair } =
        await import("../../services/PrintCardRenderer");
      const { front, back } = await renderInsertCardPair({
        theme: activeTheme,
        cardSize: size,
        deckNumber: n,
      });
      if (cancelled) return;
      insertCard = {
        frontUrl: front.toDataURL("image/png"),
        backUrl: back.toDataURL("image/png"),
        label: "How to Read",
      };
    })();

    return () => {
      cancelled = true;
    };
  });

  let renderedCards: RenderedCard[] = $state([]);
  let renderProgress = $state(0);
  // Denominator anchored to the live sequence count, never a mutable snapshot.
  // A stale render run (e.g. deck size 100 → 90) can't leave 100 lingering here.
  const renderTotal = $derived(sequences.length);
  let isRendering = $state(false);
  // Pre-render setup feedback so "0 / N" never looks frozen. "preparing" =
  // resolving short codes / cold Firestore init; "rendering" = lanes running
  // (first card still warms the worker, shown as indeterminate until progress>0).
  let renderStage = $state<"preparing" | "rendering">("rendering");
  let prepDone = $state(0);
  let prepTotal = $state(0);
  // Piece-level progress: each card's front render places one SVG pictograph per
  // beat and reports per-beat progress. We sum the per-card fractions into a
  // deck-wide "pieces placed" count so the bar advances smoothly within every
  // card (not just one tick per finished card). Driven by the render lanes below.
  let piecesDone = $state(0);
  let piecesTotal = $state(0);

  let layout = $derived(getPageLayout(cardSize, paperSize));
  let sizeSpec = $derived(CARD_SIZES[cardSize]);
  let paperSpec = $derived(PAPER_SIZES[paperSize]);
  let cardAspect = $derived(sizeSpec.canvasWidth / sizeSpec.canvasHeight);
  let colWidthPct = $derived(
    (sizeSpec.widthInches / paperSpec.widthInches) * 100
  );

  let cropMarks = $derived.by(() => {
    const { cols, rows } = layout;
    const marginX = (100 - cols * colWidthPct) / 2;
    const rowHeightPct =
      (colWidthPct * (paperSpec.widthInches / paperSpec.heightInches)) /
      cardAspect;
    const marginY = (100 - rows * rowHeightPct) / 2;
    const markLen = 1.2;

    const marks: { x: number; y: number; w: number; h: number }[] = [];

    for (let col = 0; col <= cols; col++) {
      const x = marginX + col * colWidthPct;
      marks.push({ x: x, y: marginY - markLen, w: 0, h: markLen });
      marks.push({ x: x, y: 100 - marginY, w: 0, h: markLen });
    }

    for (let row = 0; row <= rows; row++) {
      const y = marginY + row * rowHeightPct;
      marks.push({ x: marginX - markLen, y, w: markLen, h: 0 });
      marks.push({ x: 100 - marginX, y, w: markLen, h: 0 });
    }

    return marks;
  });

  const BLANK_CARD: RenderedCard = { frontUrl: "", backUrl: "", label: "" };

  // Card backs still rasterize DOM fragments on the main thread. Eight lanes
  // made a large deck stop processing pointer updates for seconds at a time.
  // Two lanes keep the worker-fed fronts moving while bounding back-raster and
  // canvas memory pressure.
  const RENDER_CONCURRENCY = 2;
  const PREVIEW_PUBLISH_BATCH = 4;

  function yieldToBrowser(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  function cardFromBlobs(
    frontBlob: Blob,
    backBlob: Blob,
    label: string
  ): CachedCard {
    return {
      rendered: {
        frontUrl: URL.createObjectURL(frontBlob),
        backUrl: URL.createObjectURL(backBlob),
        label,
      },
      frontBlob,
      backBlob,
    };
  }

  function discardCachedCard(key: string): void {
    const cached = cardCache.get(key);
    if (!cached) return;
    if (cached.rendered.frontUrl.startsWith("blob:")) {
      URL.revokeObjectURL(cached.rendered.frontUrl);
    }
    if (cached.rendered.backUrl.startsWith("blob:")) {
      URL.revokeObjectURL(cached.rendered.backUrl);
    }
    cardCache.delete(key);
  }

  function capitalize(s: string | null): string {
    return s ? s[0]!.toUpperCase() + s.slice(1) : "";
  }

  // Push the latest arrow-placement overrides (special/default/global/prop-geom)
  // into the warm worker pool before composing. The seeded worker bundle is set
  // once at pool init, so a Fix-Arrows save made afterward would otherwise never
  // reach the worker — the re-rendered card would show the OLD arrow position.
  // Cheap (re-seeds resolver state only, not the asset/SVG caches); call once per
  // render run, not per card.
  function refreshOverrideBundle(): void {
    try {
      getCompositionDispatcher().updateOverrideBundle(
        buildOverridePlacementBundle()
      );
    } catch (err) {
      console.warn("[PrintPreview] override bundle refresh failed:", err);
    }
  }

  interface SheetSlot {
    card: RenderedCard;
    seqIndex: number | null;
    elementName: string | null;
  }

  // Strict page isolation: each element fills whole sheets (planner pads with
  // blanks), whole-block-repeated `copies` times. This is the SAME planner the
  // PDF exporter uses, so the on-screen preview is pixel-for-pixel what prints.
  // We plan over an index-carrying wrapper so click / inspect / rerender still
  // target the correct source card despite grouping, copies, and blank padding.
  let sheets = $derived.by(() => {
    const indexed: { card: RenderedCard; seqIndex: number | null }[] =
      renderedCards.map((card, seqIndex) => ({ card, seqIndex }));
    // firstOnTop=true mirrors the PDF exporter: deck's FIRST card is drawn last
    // (lands on top of the printed stack). Keeps the preview pixel-for-pixel with print.
    const planned = planPrintSlots(
      indexed,
      tndElements ?? [],
      copies,
      layout.cardsPerPage,
      groupByElement,
      true
    );

    // Mirror the exporter's leading insert sheet: one insert per copy, padded to
    // a whole sheet. Built here rather than through the planner for the same
    // reason as the exporter — an untagged bucket would merge with the cards or
    // land at the bottom of the cut stack. seqIndex stays null so the insert is
    // not clickable and cannot be mistaken for a source card.
    const insertSlots: PlannedSlot<{
      card: RenderedCard;
      seqIndex: number | null;
    }>[] = [];
    if (insertCard) {
      const item = { card: insertCard, seqIndex: null };
      for (let c = 0; c < copies; c++) {
        insertSlots.push({ item, elementName: "How to Read", copyIndex: c });
      }
      while (insertSlots.length % layout.cardsPerPage !== 0) {
        insertSlots.push({
          item: null,
          elementName: "How to Read",
          copyIndex: null,
        });
      }
    }

    const slots = [...insertSlots, ...planned];
    const pages: SheetSlot[][] = [];
    for (let i = 0; i < slots.length; i += layout.cardsPerPage) {
      pages.push(
        slots.slice(i, i + layout.cardsPerPage).map((s) => ({
          card: s.item?.card ?? BLANK_CARD,
          seqIndex: s.item?.seqIndex ?? null,
          elementName: s.elementName,
        }))
      );
    }
    return pages;
  });

  function buildRenderOptions(
    sequence?: SequenceData,
    footer?: CardFooter,
    cardIndex?: number
  ): PrintRenderOptions {
    const imageComposition = getImageCompositionManager();
    const element =
      (cardIndex != null ? tndElements?.[cardIndex] : undefined) ?? tndElement;
    // Render at the SELECTED card size's canvas dims. Without this the renderer
    // falls back to its MPC poker default (822×1122), so tarot cards render at
    // poker aspect and then get squished into tarot print slots — stretch, a gap
    // where the tall slot isn't filled, and crop marks that don't meet the card.
    const size = CARD_SIZES[cardSize];
    const bleedPx = 36;
    const isHandPath = cardProfile === "hand-path";
    const physicalLayout =
      deckMode && sequence && !isHandPath
        ? calculatePhysicalCardLayout({
            sequence,
            canvasWidth: size.canvasWidth,
            canvasHeight: size.canvasHeight,
            bleedPx,
            includeStartPlacement,
            showHeader: true,
            showFooter: Boolean(
              footer?.left ||
              footer?.center ||
              footer?.right ||
              footer?.iconPath
            ),
            showQRCode: true,
          })
        : null;
    const stepCount = sequence?.steps?.length;
    return {
      canvasWidth: size.canvasWidth,
      canvasHeight: size.canvasHeight,
      includeStartPlacement,
      startPlacementLayout: isHandPath
        ? "row"
        : physicalLayout
          ? physicalLayout.startPlacementLayout
          : stepCount != null
            ? imageComposition.getStartPlacementLayoutForStepCount(stepCount)
            : imageComposition.startPlacementLayout,
      ...(isHandPath
        ? { totalGridColumns: 2 }
        : physicalLayout?.totalGridColumns !== undefined
          ? { totalGridColumns: physicalLayout.totalGridColumns }
          : {}),
      showMandala: !isHandPath,
      theme,
      tndElement: element,
      leftPropType: resolvedLeftProp,
      rightPropType: resolvedRightProp,
      leftLabel: footer?.left,
      rightLabel: footer?.right,
      notes: footer?.center,
      iconPath: footer?.iconPath,
      bleedPx,
      deckId,
      deckName,
      qrUrl: cardIndex != null ? qrUrls?.[cardIndex] : undefined,
      showQRCode: isHandPath ? true : undefined,
      cardProfile,
      customName: cardIndex != null ? cardTitles?.[cardIndex] : undefined,
    };
  }

  function buildCacheKey(
    seq: SequenceData,
    stepCount: number | undefined,
    index: number
  ): string {
    const seqId = seq.id ?? seq.word ?? seq.name ?? "";
    const footer = footers?.[index];
    const renderOptions = buildRenderOptions(seq, footer, index);
    const layout = `${renderOptions.startPlacementLayout}:${renderOptions.totalGridColumns ?? "static"}`;
    const optsPart = [
      CARD_RENDER_SCHEMA,
      cardSize,
      theme,
      tndElements?.[index]?.familyId ?? tndElement?.familyId ?? "none",
      resolvedLeftProp,
      resolvedRightProp,
      resolvedBackground,
      stepCount,
      footer?.left ?? "",
      footer?.center ?? "",
      footer?.right ?? "",
      qrUrls?.[index] ?? "managed-qr",
      cardProfile,
      cardTitles?.[index] ?? "",
      layout,
      rerenderKey,
      // Content fingerprint: self-invalidates whenever the sequence's rendered
      // state changes (reversal flips, re-derived letters, recomputed
      // orientations), so the cache never serves a stale variant. Reversal
      // variants reuse the base seq id, so id alone would collide.
      hashSequenceContent(seq),
    ].join("|");
    return `${seqId}::${optsPart}`;
  }

  function seqFooter(index: number): CardFooter | undefined {
    return footers?.[index];
  }

  // Compute mirrored column for back pages (long-edge duplex flip)
  function mirroredCol(index: number, cols: number): number {
    const col = index % cols;
    return cols - 1 - col;
  }

  function rowOf(index: number, cols: number): number {
    return Math.floor(index / cols);
  }

  // Track the render generation so stale renders are discarded
  let renderGeneration = 0;

  // The blob cache (IndexedDB) is opportunistic, but a write failure on a large
  // deck usually means storage OOM/quota — surface that once per render pass so
  // the user understands why a re-open re-renders from scratch instead of failing
  // silently. Reset on each new render generation so a later deck can warn again.
  let blobCacheWarned = false;
  function warnBlobCacheFailure(context: string, err: unknown): void {
    console.error(`[PrintPreview] blob cache ${context} failed:`, err);
    if (blobCacheWarned) return;
    blobCacheWarned = true;
    showToast(
      "Couldn't cache rendered cards (storage may be full). Cards still print, but re-opening this deck will re-render them.",
      "warning",
      6000
    );
  }

  $effect(() => {
    // Capture reactive dependencies
    const seqs = sequences;
    const _cardSize = cardSize;
    const _theme = theme;
    const _includeStartPlacement = includeStartPlacement;
    const _rerenderKey = rerenderKey;
    const _bgType = resolvedBackground;
    const _leftProp = resolvedLeftProp;
    const _rightProp = resolvedRightProp;
    const _qrUrls = qrUrls;
    const _cardProfile = cardProfile;
    const _cardTitles = cardTitles;

    // Void unused captures to satisfy linter
    void _cardSize;
    void _theme;
    void _includeStartPlacement;
    void _rerenderKey;
    void _bgType;
    void _leftProp;
    void _rightProp;
    void _qrUrls;
    void _cardProfile;
    void _cardTitles;

    const generation = ++renderGeneration;
    blobCacheWarned = false;

    if (seqs.length === 0) {
      renderedCards = [];
      renderProgress = 0;
      isRendering = false;
      return;
    }

    renderAll(seqs, generation);
  });

  async function renderAll(seqs: SequenceData[], generation: number) {
    // renderTotal is derived from `sequences` — no assignment needed here.

    // Phase 1: Hydrate in-memory cache from IndexedDB for any misses
    const missKeys: string[] = [];
    for (let idx = 0; idx < seqs.length; idx++) {
      const seq = seqs[idx]!;
      const key = buildCacheKey(seq, seq.steps?.length, idx);
      const cached = cardCache.get(key);
      if (!cached?.frontBlob || !cached.backBlob) missKeys.push(key);
    }

    if (missKeys.length > 0) {
      const idbHits = await deckCardBlobCache.getMultiple(missKeys);
      if (generation !== renderGeneration) return;

      for (const [key, entry] of idbHits) {
        discardCachedCard(key);
        cardCache.set(
          key,
          cardFromBlobs(entry.frontBlob, entry.backBlob, entry.label)
        );
      }
      if (generation !== renderGeneration) return;
    }

    // Phase 2: Fast path if every card is now in memory (from either tier)
    const allCached = seqs.every((seq, idx) => {
      const cached = cardCache.get(buildCacheKey(seq, seq.steps?.length, idx));
      return !!cached?.frontBlob && !!cached.backBlob;
    });

    if (allCached) {
      const cards: RenderedCard[] = [];
      for (let idx = 0; idx < seqs.length; idx++) {
        const seq = seqs[idx]!;
        const cached = cardCache.get(
          buildCacheKey(seq, seq.steps?.length, idx)
        )!;
        cards.push(cached.rendered);
      }
      renderedCards = cards;
      renderProgress = seqs.length;
      isRendering = false;
      onRenderStateChange?.({
        isRendering: false,
        progress: seqs.length,
        total: seqs.length,
      });

      return;
    }

    // Phase 3: Render uncached cards with bounded concurrency.
    //
    // Safe to parallelize: composeSequenceImage and Canvas2DDirectRenderer each
    // allocate a fresh canvas per call (no shared scratch context), so in-flight
    // renders can't corrupt one another. Running RENDER_CONCURRENCY lanes overlaps
    // the async gaps (asset/blob decode, raster) instead of waiting card-by-card.
    // Results are written by index so ordering is preserved despite out-of-order
    // completion; holes show as blank cells until filled.
    isRendering = true;
    renderProgress = 0;
    renderStage = "preparing";
    prepDone = 0;
    prepTotal = 0;
    renderedCards = [];
    prewarmCardPool({
      sequences: seqs,
      leftPropType: resolvedLeftProp,
      rightPropType: resolvedRightProp,
      theme: resolvedBackground,
      handPathMode: cardProfile === "hand-path",
      iconPaths: (footers ?? [])
        .map((footer) => footer.iconPath)
        .filter((path): path is string => !!path),
    });
    const warmSequence = seqs[0];
    if (warmSequence) {
      await warmCardBackCachesAsync(warmSequence, resolvedBackground);
      if (generation !== renderGeneration) return;
    }
    // Sync the worker pool with any arrow overrides saved since it was seeded, so
    // freshly-edited placements render (not the stale init-time bundle).
    refreshOverrideBundle();
    // Per-card piece budgets (one piece per beat). Cached/fast cards count as
    // instantly placed; live renders fill in via per-beat progress callbacks.
    const perCardPieces = seqs.map((s) => Math.max(1, s.steps?.length ?? 1));
    const cardPieceDone = new Array(seqs.length).fill(0);
    piecesTotal = perCardPieces.reduce((a, b) => a + b, 0);
    piecesDone = 0;
    onRenderStateChange?.({
      isRendering: true,
      progress: 0,
      total: seqs.length,
    });

    const renderer = getPrintCardRenderer();

    // Pre-resolve every card's QR short code in one batched pass before the
    // render lanes fan out. Without this, each lane's first render does a
    // serial ~380ms Firestore round-trip (the cold-deck bottleneck) which
    // also pegs the main thread and freezes the Print Deck modal. Best-effort:
    // any miss falls through to per-card resolution at render time. Reports
    // chunk progress so the bar moves during the otherwise-silent cold start.
    const sequencesNeedingCodes =
      cardProfile === "hand-path"
        ? []
        : seqs.filter((_, index) => !qrUrls?.[index]);
    if (sequencesNeedingCodes.length > 0) {
      await getShortCodeManager().resolveCodesForDeck(
        sequencesNeedingCodes,
        {
          leftPropType: resolvedLeftProp,
          rightPropType: resolvedRightProp,
          deckId,
          deckName,
        },
        (done, total) => {
          if (generation === renderGeneration) {
            prepDone = done;
            prepTotal = total;
          }
        }
      );
    }
    if (generation !== renderGeneration) return;

    // Codes resolved — lanes start. First card still warms the worker, so the
    // bar stays indeterminate until renderProgress ticks past 0.
    renderStage = "rendering";

    const cards: RenderedCard[] = new Array(seqs.length);
    let completed = 0;
    let nextIndex = 0;

    const renderOne = async (i: number): Promise<void> => {
      const seq = seqs[i]!;
      const stepCount = seq.steps?.length;
      const footer = seqFooter(i);
      const options = buildRenderOptions(seq, footer, i);
      const cacheKey = buildCacheKey(seq, stepCount, i);
      const cached = cardCache.get(cacheKey);

      // Surface this card's per-beat placement into the deck-wide piece count.
      // Each beat is one SVG pictograph; current/total are the beats of THIS
      // card, normalized to its budget so the global bar stays proportional
      // even if the render reports a different beat count than steps.length.
      const reportPieces = (current: number, total: number) => {
        if (generation !== renderGeneration || total <= 0) return;
        cardPieceDone[i] = Math.min(1, current / total) * perCardPieces[i]!;
        piecesDone = cardPieceDone.reduce((a, b) => a + b, 0);
      };

      try {
        if (cached?.frontBlob && cached.backBlob) {
          cards[i] = cached.rendered;
        } else {
          // Front (Canvas2D) and back (DOM screenshot, ~200ms fixed wait) are
          // independent and each allocate their own canvas/container, so render
          // them together rather than front-then-back.
          const [frontCanvas, backCanvas] = await Promise.all([
            renderer.renderFront(seq, options, (p) =>
              reportPieces(p.current, p.total)
            ),
            renderer.renderBack(seq, options),
          ]);

          const label =
            cardTitles?.[i] || seq.word || seq.name || `Card ${i + 1}`;
          const [frontBlob, backBlob] = await Promise.all([
            canvasToBlob(frontCanvas),
            canvasToBlob(backCanvas),
          ]);
          const cachedCard = cardFromBlobs(frontBlob, backBlob, label);

          cards[i] = cachedCard.rendered;
          discardCachedCard(cacheKey);
          cardCache.set(cacheKey, cachedCard);

          deckCardBlobCache
            .set(cacheKey, frontBlob, backBlob, label)
            .catch((err) => warnBlobCacheFailure("write", err));
        }
      } catch (err) {
        console.error(
          `[PrintPreview] Card ${i + 1} (${seq.word}) render failed:`,
          err
        );
        cards[i] = {
          frontUrl: "",
          backUrl: "",
          label: `⚠ ${seq.word || seq.name || `Card ${i + 1}`}`,
        };
      }

      completed++;
      if (generation === renderGeneration) {
        // This card is done — count all its pieces (covers cache hits, which
        // never fire per-beat progress, and rounds the live count up to full).
        cardPieceDone[i] = perCardPieces[i]!;
        piecesDone = cardPieceDone.reduce((a, b) => a + b, 0);
        renderProgress = completed;
        // `cards` is a sparse array (assigned by index); Array.from visits every
        // slot — including not-yet-rendered holes — so the result is dense and
        // `{#each}` never sees an undefined entry.
        // Publishing the full sparse deck after every card made Svelte rebuild
        // every sheet dozens of times. Four-card batches keep progress visible
        // while leaving time for pointer hit-testing and paint between batches.
        if (
          completed === seqs.length ||
          completed % PREVIEW_PUBLISH_BATCH === 0
        ) {
          renderedCards = Array.from(cards, (c) => c ?? BLANK_CARD);
        }
        onRenderStateChange?.({
          isRendering: true,
          progress: completed,
          total: seqs.length,
        });
      }
    };

    const lane = async (): Promise<void> => {
      while (generation === renderGeneration) {
        const i = nextIndex++;
        if (i >= seqs.length) return;
        await renderOne(i);
        await yieldToBrowser();
      }
    };

    const laneCount = Math.min(RENDER_CONCURRENCY, seqs.length);
    await Promise.all(Array.from({ length: laneCount }, () => lane()));

    if (generation !== renderGeneration) return;
    renderedCards = Array.from(cards, (card) => card ?? BLANK_CARD);
    isRendering = false;
    onRenderStateChange?.({
      isRendering: false,
      progress: seqs.length,
      total: seqs.length,
    });
  }

  async function rebuildPairs(
    seqs: SequenceData[],
    generation: number
  ): Promise<CardPair[] | null> {
    const pairs: CardPair[] = [];
    for (let idx = 0; idx < seqs.length; idx++) {
      const seq = seqs[idx]!;
      if (generation !== renderGeneration) return null;
      const cached = cardCache.get(buildCacheKey(seq, seq.steps?.length, idx));
      if (!cached?.frontBlob || !cached.backBlob) return null;
      const renderMeta = {
        sequence: seq,
        options: buildRenderOptions(seq, seqFooter(idx), idx),
      };
      if (idx > 0) await yieldToBrowser();
      pairs.push(await reconstructPair(cached, renderMeta));
    }
    return pairs;
  }

  async function reconstructPair(
    cached: CachedCard,
    renderMeta: NonNullable<CardPair["renderMeta"]>
  ): Promise<CardPair> {
    const [front, back] = await Promise.all([
      blobToCanvas(cached.frontBlob, cached.rendered.frontUrl),
      blobToCanvas(cached.backBlob, cached.rendered.backUrl),
    ]);
    return { front, back, label: cached.rendered.label, renderMeta };
  }

  async function blobToCanvas(
    blob: Blob,
    fallbackUrl: string
  ): Promise<HTMLCanvasElement> {
    if (typeof createImageBitmap !== "function") {
      return dataUrlToCanvas(fallbackUrl);
    }
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    bitmap.close();
    return canvas;
  }

  function dataUrlToCanvas(dataUrl: string): Promise<HTMLCanvasElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext("2d")!.drawImage(img, 0, 0);
        resolve(canvas);
      };
      img.onerror = () =>
        reject(new Error("Failed to load image from data URL"));
      img.src = dataUrl;
    });
  }

  async function prepareCurrentPairs(): Promise<CardPair[]> {
    const generation = renderGeneration;
    const pairs = await rebuildPairs(sequences, generation);
    if (!pairs || generation !== renderGeneration) {
      throw new Error("The deck changed while its print pages were preparing.");
    }
    return pairs;
  }

  $effect(() => {
    const notify = onPairPreparerReady;
    if (!notify) return;
    notify(prepareCurrentPairs);
    return () => notify(null);
  });

  async function rerenderCard(index: number): Promise<string | null> {
    const seq = sequences[index];
    if (!seq) return null;

    const renderer = getPrintCardRenderer();
    const stepCount = seq.steps?.length;
    const footer = seqFooter(index);
    const options = buildRenderOptions(seq, footer, index);

    const cacheKey = buildCacheKey(seq, stepCount, index);
    discardCachedCard(cacheKey);
    // A failed delete can leave a stale blob entry that shows the OLD card image
    // after a fix — warn so the user knows a hard refresh may be needed.
    deckCardBlobCache.delete(cacheKey).catch((err) => {
      console.error("[PrintPreview] stale blob delete failed:", err);
      showToast(
        "Couldn't clear the old cached image. If this card still looks unchanged, refresh the page.",
        "warning",
        6000
      );
    });

    // A single-card refresh is the explicit "I just fixed this card's arrows"
    // path — push the saved overrides to the worker before recomposing.
    refreshOverrideBundle();

    const frontCanvas = await renderer.renderFront(seq, options);
    const backCanvas = await renderer.renderBack(seq, options);

    const label =
      cardTitles?.[index] || seq.word || seq.name || `Card ${index + 1}`;
    const [frontBlob, backBlob] = await Promise.all([
      canvasToBlob(frontCanvas),
      canvasToBlob(backCanvas),
    ]);
    const cachedCard = cardFromBlobs(frontBlob, backBlob, label);

    cardCache.set(cacheKey, cachedCard);

    deckCardBlobCache
      .set(cacheKey, frontBlob, backBlob, label)
      .catch((err) => warnBlobCacheFailure("write", err));

    renderedCards = renderedCards.map((card, i) =>
      i === index ? cachedCard.rendered : card
    );
    return cachedCard.rendered.frontUrl;
  }

  function handleCardContextMenu(event: MouseEvent, cardIndex: number) {
    if (!onCardContextMenu) return;
    const seq = sequences[cardIndex];
    if (!seq) return;
    event.preventDefault();
    onCardContextMenu(
      event.clientX,
      event.clientY,
      () => rerenderCard(cardIndex),
      seq
    );
  }
</script>

<div class="pages-container">
  {#if isLoading}
    <div class="state-message" role="status" aria-live="polite">
      <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
      Loading sequences...
    </div>
  {:else if sequences.length === 0}
    <div class="state-message" role="status">
      <p>No sequences to preview</p>
    </div>
  {:else}
    {#if isRendering}
      {@const preparing = renderStage === "preparing"}
      {@const prepFraction = prepTotal > 0 ? prepDone / prepTotal : 0}
      {@const pieceFraction = piecesTotal > 0 ? piecesDone / piecesTotal : 0}
      <!-- Determinate whenever we have a real count to show: short-code resolve
           progress while preparing, then per-piece (per-beat) placement while
           rendering. Only the brief cold worker-warm before any data is shown
           stays indeterminate. -->
      {@const determinate = preparing ? prepTotal > 0 : piecesTotal > 0}
      {@const fraction = preparing ? prepFraction : pieceFraction}
      <div
        class="progress-bar-container"
        class:indeterminate={!determinate}
        role="progressbar"
        aria-valuenow={determinate ? Math.round(fraction * 100) : undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-busy={!determinate}
      >
        {#if !determinate}
          <div class="progress-bar-fill indeterminate-fill"></div>
          <span class="progress-label">
            {preparing ? "Preparing renderer…" : "Warming renderer…"}
          </span>
        {:else}
          <div class="progress-bar-fill" style:width="{fraction * 100}%"></div>
          <span class="progress-label">
            {#if preparing}
              Preparing: resolving codes {prepDone} / {prepTotal}…
            {:else}
              Placing pictographs: {Math.floor(piecesDone)} / {piecesTotal} ({renderProgress}
              / {renderTotal} cards)
            {/if}
          </span>
        {/if}
      </div>
    {/if}

    {#if displayMode === "grid"}
      <div class="card-grid-scroll">
        {#each renderedCards as card, idx (idx)}
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="card-item"
            class:clickable={!!onCardClick}
            role="button"
            tabindex="0"
            onclick={() => {
              const seq = sequences[idx];
              if (seq)
                onCardClick?.(seq, card.frontUrl, () => rerenderCard(idx));
            }}
            onkeydown={(e) => {
              if (!onCardClick) return;
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                const seq = sequences[idx];
                if (seq)
                  onCardClick(seq, card.frontUrl, () => rerenderCard(idx));
              }
            }}
            oncontextmenu={(e) => handleCardContextMenu(e, idx)}
          >
            <div class="card-cell" style:aspect-ratio={cardAspect}>
              {#if card.frontUrl}
                <img
                  src={card.frontUrl}
                  alt="{card.label} front"
                  loading={idx < 12 ? "eager" : "lazy"}
                  fetchpriority={idx < 12 ? "high" : "auto"}
                  decoding="async"
                />
              {:else if card.label.startsWith("⚠")}
                <div class="card-error" title={card.label}>
                  <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
                </div>
              {:else}
                <ShimmerBlock
                  width="100%"
                  height="100%"
                  borderRadius="0"
                  delay={(idx % 6) * 120}
                />
              {/if}
            </div>
            {#if showBacks}
              <div class="card-cell" style:aspect-ratio={cardAspect}>
                {#if card.backUrl}
                  <img
                    src={card.backUrl}
                    alt="{card.label} back"
                    loading={idx < 12 ? "eager" : "lazy"}
                    fetchpriority={idx < 12 ? "high" : "auto"}
                    decoding="async"
                  />
                {:else if card.label.startsWith("⚠")}
                  <div class="card-error" title={card.label}>
                    <i class="fas fa-exclamation-triangle" aria-hidden="true"
                    ></i>
                  </div>
                {:else}
                  <ShimmerBlock
                    width="100%"
                    height="100%"
                    borderRadius="0"
                    delay={(idx % 6) * 120 + 60}
                  />
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {:else}
      <div class="pages-scroll">
        <!-- ═══ PHASE 1: ALL FRONTS ═══ -->
        {#if sideFilter !== "backs"}
          {#each sheets as sheet, sheetIndex (sheetIndex)}
            {@const elName = capitalize(sheet[0]?.elementName ?? null)}
            <article class="sheet-preview">
              <span class="page-label"
                >Fronts{elName ? ` · ${elName}` : ""} · Sheet {sheetIndex + 1} of
                {sheets.length}</span
              >
              <div
                class="page"
                style:aspect-ratio="{paperSpec.widthInches} / {paperSpec.heightInches}"
              >
                <div class="page-guide page-guide-top">
                  {#if deckName}<span class="guide-text">{deckName}</span>{/if}
                  {#if deckSummary}<span
                      class="guide-text guide-bold guide-recipe"
                      >{deckSummary}</span
                    >{/if}
                  <span class="guide-text guide-bold"
                    >FRONTS{elName ? ` · ${elName}` : ""} · Sheet {sheetIndex +
                      1} of {sheets.length}</span
                  >
                </div>
                <div
                  class="page-grid"
                  style:grid-template-columns="repeat({layout.cols}, {colWidthPct}%)"
                >
                  {#each sheet as slot, cardIndex (cardIndex)}
                    {#if !slot.card.frontUrl}
                      <div
                        class="card-cell blank"
                        style:aspect-ratio={cardAspect}
                      ></div>
                    {:else}
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <div
                        class="card-cell"
                        class:clickable={!!onCardClick && slot.seqIndex != null}
                        style:aspect-ratio={cardAspect}
                        role="button"
                        tabindex="0"
                        onclick={() => {
                          const idx = slot.seqIndex;
                          if (idx == null) return;
                          const seq = sequences[idx];
                          if (seq)
                            onCardClick?.(seq, slot.card.frontUrl, () =>
                              rerenderCard(idx)
                            );
                        }}
                        onkeydown={(e) => {
                          if (!onCardClick) return;
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            const idx = slot.seqIndex;
                            if (idx == null) return;
                            const seq = sequences[idx];
                            if (seq)
                              onCardClick(seq, slot.card.frontUrl, () =>
                                rerenderCard(idx)
                              );
                          }
                        }}
                        oncontextmenu={(e) => {
                          if (slot.seqIndex != null)
                            handleCardContextMenu(e, slot.seqIndex);
                        }}
                      >
                        <img
                          src={slot.card.frontUrl}
                          alt="{slot.card.label} front"
                          loading={sheetIndex < 2 ? "eager" : "lazy"}
                          fetchpriority={sheetIndex < 2 ? "high" : "auto"}
                          decoding="async"
                        />
                      </div>
                    {/if}
                  {/each}
                </div>
                <div class="page-guide page-guide-bottom">
                  <span class="guide-text">FRONT SIDE</span>
                  <span class="guide-text"
                    >Sheet {sheetIndex + 1} of {sheets.length}</span
                  >
                </div>
                {#each cropMarks as mark}
                  <div
                    class="crop-mark"
                    style="left:{mark.x}%;top:{mark.y}%;width:{mark.w ||
                      0.1}%;height:{mark.h || 0.1}%"
                  ></div>
                {/each}
              </div>
            </article>
          {/each}
        {/if}

        <!-- ═══ PHASE 2: ALL BACKS ═══ -->
        {#if sideFilter !== "fronts"}
          {#each sheets as sheet, sheetIndex (sheetIndex)}
            {@const elName = capitalize(sheet[0]?.elementName ?? null)}
            <article class="sheet-preview">
              <span class="page-label"
                >Backs{elName ? ` · ${elName}` : ""} · Sheet {sheetIndex + 1} of {sheets.length}</span
              >
              <div
                class="page"
                style:aspect-ratio="{paperSpec.widthInches} / {paperSpec.heightInches}"
              >
                <div class="page-guide page-guide-top">
                  {#if deckName}<span class="guide-text">{deckName}</span>{/if}
                  {#if deckSummary}<span
                      class="guide-text guide-bold guide-recipe"
                      >{deckSummary}</span
                    >{/if}
                  <span class="guide-text guide-bold"
                    >BACKS{elName ? ` · ${elName}` : ""} · Sheet {sheetIndex +
                      1} of {sheets.length}</span
                  >
                </div>
                <div
                  class="page-grid"
                  style:grid-template-columns="repeat({layout.cols}, {colWidthPct}%)"
                >
                  {#each sheet as slot, cardIndex (cardIndex)}
                    {#if !slot.card.backUrl}
                      <div
                        class="card-cell blank"
                        style:aspect-ratio={cardAspect}
                        style:grid-column={mirroredCol(cardIndex, layout.cols) +
                          1}
                        style:grid-row={rowOf(cardIndex, layout.cols) + 1}
                      ></div>
                    {:else}
                      <!-- svelte-ignore a11y_no_static_element_interactions -->
                      <div
                        class="card-cell"
                        class:clickable={!!onCardClick && slot.seqIndex != null}
                        style:aspect-ratio={cardAspect}
                        style:grid-column={mirroredCol(cardIndex, layout.cols) +
                          1}
                        style:grid-row={rowOf(cardIndex, layout.cols) + 1}
                        role="button"
                        tabindex="0"
                        onclick={() => {
                          const idx = slot.seqIndex;
                          if (idx == null) return;
                          const seq = sequences[idx];
                          if (seq)
                            onCardClick?.(seq, slot.card.frontUrl, () =>
                              rerenderCard(idx)
                            );
                        }}
                        onkeydown={(e) => {
                          if (!onCardClick) return;
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            const idx = slot.seqIndex;
                            if (idx == null) return;
                            const seq = sequences[idx];
                            if (seq)
                              onCardClick(seq, slot.card.frontUrl, () =>
                                rerenderCard(idx)
                              );
                          }
                        }}
                        oncontextmenu={(e) => {
                          if (slot.seqIndex != null)
                            handleCardContextMenu(e, slot.seqIndex);
                        }}
                      >
                        <img
                          src={slot.card.backUrl}
                          alt="{slot.card.label} back"
                          loading={sheetIndex < 2 ? "eager" : "lazy"}
                          fetchpriority={sheetIndex < 2 ? "high" : "auto"}
                          decoding="async"
                        />
                      </div>
                    {/if}
                  {/each}
                </div>
                <div class="page-guide page-guide-bottom">
                  <span class="guide-text"
                    >BACK SIDE: columns mirrored for long-edge flip</span
                  >
                  <span class="guide-text">↻ LONG EDGE</span>
                </div>
                {#each cropMarks as mark}
                  <div
                    class="crop-mark"
                    style="left:{mark.x}%;top:{mark.y}%;width:{mark.w ||
                      0.1}%;height:{mark.h || 0.1}%"
                  ></div>
                {/each}
              </div>
            </article>
          {/each}
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .pages-container {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow-y: auto;
    container-type: inline-size;
    padding: clamp(12px, 1.1cqw, 24px);
  }

  .card-grid-scroll {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 16px;
    padding-bottom: 24px;
  }

  .pages-scroll {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: clamp(18px, 1.5cqw, 32px);
    align-items: start;
    width: 100%;
    padding-bottom: 24px;
  }

  .sheet-preview {
    display: grid;
    gap: 8px;
    width: min(100%, 50rem);
    min-width: 0;
    margin: 0;
    justify-self: center;
  }

  .page {
    position: relative;
    background: var(--print-bg, #ffffff);
    border-radius: 4px;
    box-shadow: var(--shadow-card, 0 2px 8px rgba(0, 0, 0, 0.3));
    width: 100%;
    max-width: 800px;
    /* aspect-ratio comes from the paper spec via an inline style. */
    content-visibility: auto;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  @container (min-width: 80rem) {
    .pages-scroll {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .sheet-preview,
    .page {
      width: 100%;
      max-width: none;
    }
  }

  .page-grid {
    display: grid;
    gap: 0;
    width: 100%;
    align-content: center;
    justify-content: center;
  }

  .card-item {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .card-item.clickable {
    cursor: pointer;
  }

  .card-item.clickable .card-cell {
    transition:
      transform 0.15s ease,
      box-shadow 0.15s ease;
  }

  .card-item.clickable:hover .card-cell {
    transform: scale(1.02);
    box-shadow: var(--shadow-card, 0 4px 20px rgba(0, 0, 0, 0.3));
  }

  .card-cell {
    overflow: hidden;
    border-radius: 0;
    background: #ffffff;
  }

  .card-error {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
  }

  .card-cell.blank {
    background: transparent;
    border: 1px dashed rgba(255, 255, 255, 0.08);
  }

  .card-cell.clickable {
    cursor: pointer;
    transition:
      transform 0.15s ease,
      box-shadow 0.15s ease;
  }

  .card-cell.clickable:hover {
    transform: scale(1.02);
    box-shadow: var(--shadow-card, 0 4px 20px rgba(0, 0, 0, 0.3));
  }

  .card-cell img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    display: block;
  }

  .page-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    text-align: center;
    margin: 0;
  }

  .progress-bar-container {
    position: sticky;
    top: 0;
    z-index: 1;
    width: 100%;
    max-width: 800px;
    height: 28px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 4px;
    margin: 0 auto 16px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .progress-bar-fill {
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    background: var(--theme-accent-bg, rgba(100, 180, 255, 0.3));
    transition: width 0.2s ease;
  }

  /* Indeterminate sweep for the setup phase (code resolution + worker warm),
     where there's no card count yet — proves the deck isn't frozen. */
  .progress-bar-fill.indeterminate-fill {
    width: 35%;
    transition: none;
    animation: indeterminate-slide 1.15s ease-in-out infinite;
  }
  @keyframes indeterminate-slide {
    0% {
      left: -35%;
    }
    100% {
      left: 100%;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .progress-bar-fill.indeterminate-fill {
      animation: none;
      left: 0;
      width: 100%;
      opacity: 0.35;
    }
  }

  .progress-label {
    position: relative;
    z-index: 1;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text, #ffffff);
  }

  .state-message {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    height: 300px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    font-size: var(--font-size-min, 14px);
  }

  /* Print guide overlays */
  .crop-mark {
    position: absolute;
    background: #999;
    pointer-events: none;
    z-index: 1;
  }

  .page-guide {
    position: absolute;
    left: 4px;
    right: 4px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    pointer-events: none;
    z-index: 1;
  }

  .page-guide-top {
    top: 1px;
  }

  .page-guide-bottom {
    bottom: 1px;
  }

  .guide-text {
    font-size: 7px;
    color: #a6a6a6;
    font-family: Helvetica, Arial, sans-serif;
    letter-spacing: 0.02em;
    white-space: nowrap;
  }

  .guide-bold {
    font-weight: 600;
  }

  /* Recipe line: absolutely centered in the top margin, mirroring the PDF
     exporter (deckSummary drawn at page-center) so screen == print. Sits above
     the left deckName + right sheet label without shifting them. */
  .guide-recipe {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    max-width: 70%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
