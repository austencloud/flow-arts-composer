<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { toast } from "$lib/shared/toast/state/toast-state.svelte";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import {
    loadCatalogs,
    loadSequencesByIds,
  } from "../../services/catalog-loader";
  import type {
    DeckRelease,
    DeckRecipe,
  } from "../../domain/models/DeckRelease";
  import {
    getNextDeckNumber,
    releaseDeck,
    getAllReleases,
    updateDeckMeta,
    getDeckReleaseCardData,
    // Aliased: deck-archive-store below also exports an unrelated `archiveDeck`
    // (local IndexedDB archive for unreleased/generated decks).
    archiveDeck as archiveDeckRelease,
    restoreDeck as restoreDeckRelease,
  } from "../../services/deck-release-store";
  import ConfigureStep from "./ConfigureStep.svelte";
  import ReviewStep from "./ReviewStep.svelte";
  import ReleaseHistoryPanel from "./ReleaseHistoryPanel.svelte";
  import GeneratedArchivePanel from "./GeneratedArchivePanel.svelte";
  import {
    archiveDeck,
    listArchivedDecks,
    getArchivedDeck,
    deleteArchivedDeck,
  } from "../../services/deck-archive-store";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import PrintPanel from "../print-preview/PrintPanel.svelte";
  import DeckReleaseNameModal from "./DeckReleaseNameModal.svelte";
  import { createDeckReleaserState } from "./state/deck-releaser-state.svelte";
  import { createDeckPrintState } from "./state/deck-print-state.svelte";
  import { createDeckArchiveState } from "./state/deck-archive-state.svelte";
  import { createDeckReleaseState } from "./state/deck-release-state.svelte";
  import { createDeckProductionState } from "./state/deck-production-state.svelte";
  import {
    isGalleryRelease,
    isHandPathRelease,
    isLoopRelease,
  } from "./deck-release-model";
  import { setDeckReleaserContext } from "./context/deck-releaser-context";
  import { getSettings } from "$lib/shared/application/state/app-state.svelte";
  import { mintSeed, nextReferenceNumber } from "../../services/deck-recipe";
  import { generationOrchestrator } from "$lib/shared/create/services/generation-orchestrator";
  import { startPlacementManager } from "$lib/shared/create/services/start-placement-manager";
  import { loadDiamondEdges } from "../../services/pictograph-letter-lookup";
  import FestivalSamplerPrintView from "./FestivalSamplerPrintView.svelte";
  import FestivalSamplerTurnReview from "./FestivalSamplerTurnReview.svelte";
  import {
    legacyGalleryFiltersToSpec,
    type GalleryDeckSelection,
  } from "../../services/gallery-deck-source";
  import { runDeckReleaserTransition } from "./deck-releaser-motion";

  interface Props {
    onContextMenu?: (
      x: number,
      y: number,
      rerender: () => void,
      sequence?: import("$lib/shared/foundation/domain/models/sequence-data").SequenceData
    ) => void;
  }

  let { onContextMenu }: Props = $props();

  const storage = typeof window === "undefined" ? null : window.localStorage;
  const rs = createDeckReleaserState({
    storage,
    getLeftPropType: () => getSettings().leftPropType,
    getRightPropType: () => getSettings().rightPropType,
    mintSeed,
    nextReferenceNumber,
  });

  const print = createDeckPrintState(rs, {
    storage,
    download(blob, filename) {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    },
    async renderInsertCardPair(options) {
      const { renderInsertCardPair } =
        await import("../../services/PrintCardRenderer");
      return renderInsertCardPair(options);
    },
    async getOrBuildPrintPDF(...args) {
      const { getOrBuildPrintPDF } =
        await import("../../services/print-pdf-cache");
      return getOrBuildPrintPDF(...args);
    },
    async prepareSerializedPrintRun(options) {
      const { prepareSerializedPrintRun } =
        await import("../../services/serialized-print-run");
      return prepareSerializedPrintRun(options);
    },
    async exportHomePrintPDF(...args) {
      const { exportHomePrintPDF } =
        await import("../../services/print-pdf-exporter");
      return exportHomePrintPDF(...args);
    },
    async exportCalibrationPDF(...args) {
      const { exportCalibrationPDF } =
        await import("../../services/print-pdf-exporter");
      return exportCalibrationPDF(...args);
    },
    async printPdfBlob(blob) {
      const { printPdfBlob } = await import("../../services/print-blob");
      printPdfBlob(blob);
    },
    async exportDeckZIP(...args) {
      const { exportDeckZIP } =
        await import("../../services/print-zip-exporter");
      return exportDeckZIP(...args);
    },
  });

  const archive = createDeckArchiveState(rs, {
    list: listArchivedDecks,
    load: getArchivedDeck,
    save: archiveDeck,
    delete: deleteArchivedDeck,
    getWords: () => print.metadata.keywords,
    nowIso: () => new Date().toISOString(),
  });

  const releaseHistory = createDeckReleaseState(rs, {
    getAll: getAllReleases,
    getNextNumber: getNextDeckNumber,
    create: releaseDeck,
    updateMetadata: updateDeckMeta,
    archive: archiveDeckRelease,
    restore: restoreDeckRelease,
  });

  const production = createDeckProductionState(rs, {
    loadCatalogs,
    loadSequencesByIds,
    loadDiamondEdges,
    async queryGalleryDeck(...args) {
      const { queryGalleryDeck } =
        await import("../../services/gallery-deck-source");
      return queryGalleryDeck(...args);
    },
    async queryGalleryDeckFromSpec(...args) {
      const { queryGalleryDeckFromSpec } =
        await import("../../services/gallery-deck-source");
      return queryGalleryDeckFromSpec(...args);
    },
    async resolveGalleryCards(...args) {
      const { resolveGalleryCards } =
        await import("../../services/gallery-deck-source");
      return resolveGalleryCards(...args);
    },
    generateSequence: (options) =>
      generationOrchestrator.generateSequence(options),
    getStartPlacementVariations: (gridMode, leftOrientation, rightOrientation) =>
      startPlacementManager.getAllStartPlacementVariations(
        gridMode,
        leftOrientation,
        rightOrientation
      ),
    loadArchivedDeck: archive.load,
    getReleasedSequenceIds: () => releaseHistory.releasedSequenceIds,
    loadReleaseCardData: getDeckReleaseCardData,
    info: (message) => toast.info(message),
    success: (message) => toast.success(message),
    error: (message) => toast.error(message),
  });
  setDeckReleaserContext({ state: rs });

  // Captured synchronously at component init, BEFORE any $effect runs. The
  // auto-persist effect below would otherwise fire first and overwrite the saved
  // viewingDeckNumber with null (viewingRelease isn't restored until onMount),
  // wiping the very value the restore needs to reopen a released deck.
  const initialViewingDeckNumber = rs.savedViewingDeckNumber;
  // Persist is gated until the mount-time restore finishes, so the effect can
  // never clobber the saved session before restore reads it.
  let persistReady = $state(false);

  // Decks that follow the live prop setting (no pinned canonical prop): TnD +
  // Gallery, composed or released. Drives the in-deck prop switcher + prop unpin.
  const deckFollowsLiveProp = $derived(
    rs.viewingRelease
      ? !isLoopRelease(rs.viewingRelease) &&
          !isHandPathRelease(rs.viewingRelease)
      : rs.deckMode !== "loop"
  );
  // Gallery deck currently on screen (drives the Refresh-from-gallery action).
  const viewingGallery = $derived(
    rs.viewingRelease
      ? isGalleryRelease(rs.viewingRelease)
      : rs.deckMode === "gallery"
  );
  const galleryReviewFilterSpec = $derived.by(() => {
    if (!viewingGallery) return null;

    if (rs.viewingRelease) {
      const recipe = rs.viewingRelease.recipe;
      return (
        recipe?.galleryFilterSpec ??
        (recipe?.galleryFilters
          ? legacyGalleryFiltersToSpec(recipe.galleryFilters)
          : null)
      );
    }

    return (
      rs.galleryFilterSpec ?? legacyGalleryFiltersToSpec(rs.galleryFilters)
    );
  });
  let showNameModal = $state(false);
  const stageOrder = { configure: 0, review: 1, released: 2 } as const;
  const initialVisualStep = untrack(() => rs.step);
  let visibleStep = $state(initialVisualStep);
  let pendingVisibleStep = initialVisualStep;

  // The persisted production step changes inside several state owners (draw,
  // archive, release). Keep one visual step at the shell and carry every owner
  // through the same directional transition instead of teaching each service
  // about animation.
  $effect(() => {
    const nextStep = rs.step;
    if (nextStep === pendingVisibleStep) return;
    const previousStep = pendingVisibleStep;
    pendingVisibleStep = nextStep;
    const direction =
      stageOrder[nextStep] >= stageOrder[previousStep] ? "forward" : "backward";
    queueMicrotask(() => {
      runDeckReleaserTransition("stage", direction, () => {
        visibleStep = nextStep;
      });
    });
  });

  function commitDeckStep(
    nextStep: keyof typeof stageOrder,
    direction: "forward" | "backward",
    mutate: () => void
  ): void {
    pendingVisibleStep = nextStep;
    runDeckReleaserTransition("stage", direction, () => {
      mutate();
      visibleStep = nextStep;
    });
  }
  const showingFestivalSampler = $derived(
    page.url.searchParams.get("pack") === "festival-sampler-2026"
  );
  const showingFestivalTurnReview = $derived(
    showingFestivalSampler &&
      page.url.searchParams.get("review") === "turn-patterns"
  );

  const sourceOrder = { loop: 0, tnd: 1, gallery: 2 } as const;

  function handleDeckModeChange(mode: "loop" | "tnd" | "gallery"): void {
    if (mode === rs.deckMode) return;
    const direction =
      sourceOrder[mode] >= sourceOrder[rs.deckMode] ? "forward" : "backward";
    runDeckReleaserTransition("source", direction, () => {
      production.handleModeChange(mode);
    });
  }

  function handleSidebarModeChange(mode: SidebarMode): void {
    if (mode === sidebarMode) return;
    runDeckReleaserTransition(
      "sidebar",
      mode === "print" ? "forward" : "backward",
      () => {
        sidebarMode = mode;
      }
    );
  }

  async function closeFestivalSampler(): Promise<void> {
    const url = new URL(page.url);
    url.searchParams.delete("pack");
    url.searchParams.delete("review");
    await goto(`${url.pathname}${url.search}${url.hash}`, {
      keepFocus: true,
      noScroll: true,
    });
  }

  async function openFestivalSampler(): Promise<void> {
    const url = new URL(page.url);
    url.searchParams.set("pack", "festival-sampler-2026");
    url.searchParams.delete("review");
    await goto(`${url.pathname}${url.search}${url.hash}`, {
      keepFocus: true,
      noScroll: true,
    });
  }

  async function openFestivalTurnReview(): Promise<void> {
    const url = new URL(page.url);
    url.searchParams.set("pack", "festival-sampler-2026");
    url.searchParams.set("review", "turn-patterns");
    await goto(`${url.pathname}${url.search}${url.hash}`, {
      keepFocus: true,
      noScroll: true,
    });
  }

  async function closeFestivalTurnReview(): Promise<void> {
    const url = new URL(page.url);
    url.searchParams.delete("review");
    await goto(`${url.pathname}${url.search}${url.hash}`, {
      keepFocus: true,
      noScroll: true,
    });
  }

  /** If the composed deck matches an existing release, bounce into it and return
   *  true; the caller skips the fresh-review path. */
  async function bounceIfDuplicate(): Promise<boolean> {
    const match = releaseHistory.findDuplicate(rs.cards);
    if (!match) return false;
    toast.info(
      `This deck already exists as Deck #${String(match.deckNumber).padStart(3, "0")}`
    );
    await handleSelectRelease(match);
    return true;
  }

  // Auto-persist every configure-step modification. Because persist() runs inside
  // the effect, it reactively tracks every field it serializes (dials, weights,
  // selections, draft) — so any change to the catalog config is saved without
  // each handler having to remember to call persist().
  $effect(() => {
    if (!persistReady) return;
    rs.persist();
  });

  type SidebarMode = "browse" | "print";
  // Persist the Browse/Print sidebar tab across refresh / re-open, same lifetime
  // as the print dials. localStorage, not session.
  const SIDEBAR_MODE_KEY = "deckReleaser.sidebarMode";
  function loadSidebarMode(): SidebarMode {
    if (typeof window === "undefined") return "browse";
    try {
      const raw = localStorage.getItem(SIDEBAR_MODE_KEY);
      return raw === "print" || raw === "browse" ? raw : "browse";
    } catch {
      return "browse";
    }
  }
  let sidebarMode = $state<SidebarMode>(loadSidebarMode());

  $effect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(SIDEBAR_MODE_KEY, sidebarMode);
    } catch {
      /* quota / private mode — non-fatal */
    }
  });

  async function handleOpenArchivedDeck(refNumber: number): Promise<void> {
    if (!(await archive.open(refNumber))) {
      toast.info("Couldn't load that archived deck.");
    }
  }

  async function handleDeleteRelease(deckNumber: number) {
    const error = await releaseHistory.remove(deckNumber);
    if (!error) {
      toast.success(`Deck #${String(deckNumber).padStart(3, "0")} archived`);
      return;
    }
    const message = error instanceof Error ? error.message : "Archive failed";
    const isPermission =
      message.includes("permission") || message.includes("PERMISSION_DENIED");
    toast.error(
      isPermission
        ? "Admin access required to archive decks."
        : `Archive failed: ${message}`
    );
  }

  async function handleRestoreRelease(deckNumber: number) {
    const error = await releaseHistory.restore(deckNumber);
    if (!error) {
      toast.success(`Deck #${String(deckNumber).padStart(3, "0")} restored`);
      return;
    }
    const message = error instanceof Error ? error.message : "Restore failed";
    const isPermission =
      message.includes("permission") || message.includes("PERMISSION_DENIED");
    toast.error(
      isPermission
        ? "Admin access required to restore decks."
        : `Restore failed: ${message}`
    );
  }

  onMount(async () => {
    const savedDeckNumber = initialViewingDeckNumber;
    void archive.refresh();
    const releasesReady = releaseHistory.load().catch(() => undefined);
    await production.initialize(releasesReady);
    await releaseHistory.loadNextNumber();
    restoreViewedRelease(savedDeckNumber);
    await production.restoreDraft(savedDeckNumber);
    persistReady = true;
  });

  function restoreViewedRelease(deckNumber: number | null) {
    if (!deckNumber || rs.viewingRelease) return;
    // Check archived too: a session left open on a deck that got archived
    // elsewhere should still reopen it on refresh rather than silently
    // dropping back to Configure.
    const match =
      releaseHistory.releases.find(
        (release) => release.deckNumber === deckNumber
      ) ??
      releaseHistory.archivedReleases.find(
        (release) => release.deckNumber === deckNumber
      );
    if (match) handleSelectRelease(match);
  }

  // The session state restored rs.cards from localStorage, but sequences (heavy
  // SequenceData) are never stored — re-derive them here so the deck renders after
  // an HMR re-eval / refresh / tab reopen. No-op when viewing a release or when a
  // draw already populated sequences this session.
  async function handleDraw(gallerySelection?: GalleryDeckSelection) {
    const gen = ++rs.drawGeneration;
    // Fresh draw = a new, not-yet-named deck. Clear any leftover name.
    rs.name = "";
    rs.seed = mintSeed();
    rs.bumpReference();
    if (rs.deckMode === "loop") {
      const ok = await production.generateLiveDeck(gen);
      if (!ok || gen !== rs.drawGeneration) return;
    } else if (rs.deckMode === "gallery") {
      if (!gallerySelection) {
        toast.error("Choose the Gallery cards before composing the deck.");
        return;
      }
      const ok = await production.composeGalleryDeck(gen, gallerySelection);
      if (!ok || gen !== rs.drawGeneration) return;
    } else {
      rs.cards = production.composeFullDeck();
      if (await bounceIfDuplicate()) return;
      await production.loadSelectedSequences(gen);
      if (gen !== rs.drawGeneration) return;
    }
    archive.archiveCurrent();
    commitDeckStep("review", "forward", () => {
      rs.step = "review";
      rs.persist();
    });
  }

  async function handleRedraw() {
    const gen = ++rs.drawGeneration;
    rs.name = ""; // fresh draw = not-yet-named; title falls back to the deck number
    rs.reroll();
    rs.bumpReference();
    if (rs.deckMode === "loop") {
      const ok = await production.generateLiveDeck(gen);
      if (!ok || gen !== rs.drawGeneration) return;
    } else if (rs.deckMode === "gallery") {
      const ok = await production.refreshGallery(gen);
      if (!ok || gen !== rs.drawGeneration) return;
    } else {
      rs.cards = production.composeFullDeck();
      if (await bounceIfDuplicate()) return;
      await production.loadSelectedSequences(gen);
      if (gen !== rs.drawGeneration) return;
    }
    archive.archiveCurrent();
    rs.persist();
  }

  /** Re-run the gallery filter against the live library and replace the on-screen
   *  deck with the current matches. Works while composing (uses live filters) or
   *  viewing a released gallery deck (uses the release's stamped filters). */
  async function handleRefreshGallery() {
    const wasViewingRelease = rs.viewingRelease != null;
    if (await production.refreshGallery()) {
      if (!wasViewingRelease) archive.archiveCurrent();
    }
  }

  function handleRemoveCard(sequence: SequenceData): void {
    if (production.remove(sequence)) archive.archiveCurrent();
  }

  function openReleaseModal() {
    showNameModal = true;
  }

  async function handleConfirmRelease(name: string, description: string) {
    try {
      await releaseHistory.create(name, description);
      showNameModal = false;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Release failed";
      const isPermission =
        message.includes("permission") || message.includes("PERMISSION_DENIED");
      toast.error(
        isPermission
          ? "Admin access required to release decks."
          : `Release failed: ${message}`
      );
    }
  }

  async function handleRenameDeck(name: string) {
    const error = await releaseHistory.rename(name);
    if (error) {
      const message = error instanceof Error ? error.message : "Rename failed";
      toast.error(`Couldn't save deck name: ${message}`);
    }
  }

  function handleStartNew() {
    commitDeckStep("configure", "backward", () => rs.reset());
  }

  function handleReuseRecipe(recipe: DeckRecipe) {
    commitDeckStep("configure", "backward", () => rs.loadRecipe(recipe));
    toast.success("Recipe loaded. Tweak or press Draw for a fresh deck.");
  }

  async function handleSelectRelease(release: DeckRelease) {
    print.includeHowToRead = Boolean(release.insertCard);
    if (isHandPathRelease(release)) print.copies = 1;
    if (visibleStep === "review") {
      runDeckReleaserTransition("content", "forward", () => {
        releaseHistory.activate(release);
      });
    } else {
      commitDeckStep("review", "forward", () => {
        releaseHistory.activate(release);
      });
    }
    const gen = ++rs.drawGeneration;
    await production.loadSelectedSequences(gen);
  }
</script>

{#if showingFestivalTurnReview}
  <FestivalSamplerTurnReview onBack={closeFestivalTurnReview} />
{:else if showingFestivalSampler}
  <FestivalSamplerPrintView
    onExit={closeFestivalSampler}
    onReviewTurns={openFestivalTurnReview}
  />
{/if}
<div class="deck-releaser" class:festival-hidden={showingFestivalSampler}>
  <div class="releaser-main">
    {#if visibleStep === "configure"}
      <ConfigureStep
        deckMode={rs.deckMode}
        weights={rs.weights}
        totalCards={rs.totalCards}
        notes={rs.notes}
        sourceSummaries={rs.sourceSummaries}
        selectedSliceTypes={rs.selectedSliceTypes}
        tndFamilies={rs.tndFamilies}
        selectedTnDFamilies={rs.selectedTnDFamilies}
        tndTurnPatterns={rs.tndTurnPatterns}
        selectedTnDTurnPatterns={rs.selectedTnDTurnPatterns}
        tndCardCount={production.tndCardCount}
        selectedTurnPatternCount={rs.selectedTnDTurnPatterns.size}
        isLoading={rs.isLoadingPools || rs.isLoadingSequences}
        onModeChange={handleDeckModeChange}
        onWeightChange={production.handleWeightChange}
        onTotalCardsChange={(t) => {
          rs.totalCards = t;
        }}
        onNotesChange={(n) => {
          rs.notes = n;
        }}
        onSliceTypeToggle={production.handleSliceTypeToggle}
        onTnDFamilyToggle={production.handleTnDFamilyToggle}
        onSelectAllFamilies={production.selectAllFamilies}
        onClearFamilies={production.clearFamilies}
        onTnDTurnPatternToggle={production.handleTnDTurnPatternToggle}
        onTnDTurnPatternsSet={production.setTnDTurnPatterns}
        onDraw={handleDraw}
        variationConfig={rs.variationConfig}
        onVariationConfigChange={(c) => {
          rs.variationConfig = c;
        }}
        startOriModes={rs.selectedStartOriModes}
        onToggleStartOriMode={(m) => rs.toggleStartOriMode(m)}
        gridModes={rs.selectedGridModes}
        onToggleGridMode={(m) => rs.toggleGridMode(m)}
        reversalPattern={rs.reversalPattern}
        onReversalChange={(p) => {
          rs.reversalPattern = p;
          rs.persist();
        }}
        isGenerating={rs.isLoadingSequences}
        genProgress={rs.drawProgress}
      />
    {:else if visibleStep === "review"}
      <ReviewStep
        cards={rs.cards}
        sequences={rs.sequences}
        theme={rs.theme}
        leftPropType={rs.leftPropType}
        rightPropType={rs.rightPropType}
        nextDeckNumber={rs.nextDeckNumber}
        refNumber={print.deckRefNumber}
        deckName={rs.name}
        deckSummary={print.metadata.deckSummary}
        galleryFilterSpec={galleryReviewFilterSpec}
        isReleasing={rs.isReleasing}
        readOnly={rs.viewingRelease !== null}
        brokenLoopCount={rs.brokenLoopCount}
        showRedraw={rs.deckMode === "loop"}
        showPropSwitcher={deckFollowsLiveProp}
        showRefresh={viewingGallery}
        footers={print.footers}
        {onContextMenu}
        cardSize={print.cardSize}
        paperSize={print.paperSize}
        copies={print.copies}
        groupByElement={print.groupByElement}
        groupByLetter={print.groupByLetter}
        includeHowToRead={print.includeHowToRead}
        getAiSummary={print.getAiSummary}
        sortedSequences={print.sortedSequences}
        sortedFooters={print.sortedFooters}
        cardTitles={print.cardTitles}
        qrUrls={print.qrUrls}
        cardProfile={print.cardProfile}
        tndElements={print.tndElements}
        copiesPresets={print.copiesPresets}
        copiesAnnotate={print.copiesAnnotate}
        isRendering={print.isRendering}
        renderProgress={print.renderProgress}
        renderTotal={print.renderTotal}
        rerenderKey={print.rerenderKey}
        sideFilter={print.previewSideFilter}
        onCardSizeChange={print.changeCardSize}
        onPaperSizeChange={print.changePaperSize}
        onCopiesChange={(value) => {
          print.copies = value;
        }}
        onGroupByElementChange={(value) => {
          print.groupByElement = value;
        }}
        onGroupByLetterChange={(value) => {
          print.groupByLetter = value;
        }}
        onRerender={print.requestRerender}
        onPairPreparerReady={print.setPairPreparer}
        onRenderStateChange={print.setRenderState}
        onSwapCard={production.swap}
        onRemoveCard={handleRemoveCard}
        allowRemove={rs.deckMode === "loop"}
        onRedraw={handleRedraw}
        onRefresh={handleRefreshGallery}
        onRelease={openReleaseModal}
        onRename={rs.viewingRelease !== null ? handleRenameDeck : undefined}
        onBack={() => {
          commitDeckStep("configure", "backward", () => {
            rs.viewingRelease = null;
            rs.themeOverride = null;
            rs.leftPropOverride = null;
            rs.rightPropOverride = null;
            rs.step = "configure";
            rs.persist();
          });
        }}
      />
    {:else if visibleStep === "released"}
      <div class="released-step">
        <div class="released-card">
          <div class="released-icon">
            <i class="fas fa-check-circle" aria-hidden="true"></i>
          </div>
          <h2 class="released-title">
            Deck #{String(rs.releasedNumber).padStart(3, "0")} Released
          </h2>
          <p class="released-notes">{rs.name}</p>
          {#if rs.description}
            <p class="released-description">{rs.description}</p>
          {/if}
          <p class="released-detail">
            {rs.cards.length} cards saved to Firebase
          </p>
          <div class="released-actions">
            <button type="button" class="new-deck-btn" onclick={handleStartNew}>
              <i class="fas fa-plus" aria-hidden="true"></i>
              Compose Another Deck
            </button>
          </div>
        </div>
      </div>
    {/if}
  </div>

  <div class="releaser-sidebar" class:print-mode={sidebarMode === "print"}>
    <div class="sidebar-switch">
      <SegmentedControl
        options={[
          { value: "browse", label: "Browse" },
          { value: "print", label: "Print" },
        ]}
        value={sidebarMode}
        onchange={handleSidebarModeChange}
        color="accent"
        size="sm"
      />
    </div>

    <div class="sidebar-stage">
      {#if sidebarMode === "browse"}
        <div class="sidebar-view">
          <div class="sidebar-body">
            <section
              class="ready-print-jobs"
              aria-labelledby="ready-print-heading"
            >
              <h2 id="ready-print-heading">Ready to print</h2>
              <button
                type="button"
                class="festival-job"
                onclick={openFestivalSampler}
              >
                <span class="festival-job-icon" aria-hidden="true">
                  <i class="fas fa-ticket-alt"></i>
                </span>
                <span class="festival-job-copy">
                  <strong>Festival Sampler</strong>
                  <small>1 signup + 8 sample cards · duplex batch</small>
                </span>
                <i
                  class="fas fa-chevron-right festival-job-arrow"
                  aria-hidden="true"
                ></i>
              </button>
            </section>
            <GeneratedArchivePanel
              decks={archive.decks}
              isLoading={archive.isLoading}
              activeRefNumber={rs.viewingRelease === null &&
              visibleStep === "review"
                ? rs.referenceNumber
                : null}
              onOpen={handleOpenArchivedDeck}
              onDelete={archive.remove}
            />
            <ReleaseHistoryPanel
              title="Timing &amp; Direction Decks"
              releases={releaseHistory.tndReleases}
              isLoading={releaseHistory.isLoading}
              activeDeckNumber={rs.viewingRelease?.deckNumber ?? null}
              onSelectRelease={handleSelectRelease}
              onDeleteRelease={handleDeleteRelease}
              onReuseRecipe={handleReuseRecipe}
            />
            {#if releaseHistory.handPathReleases.length > 0}
              <ReleaseHistoryPanel
                title="Hand Path Decks"
                releases={releaseHistory.handPathReleases}
                isLoading={releaseHistory.isLoading}
                activeDeckNumber={rs.viewingRelease?.deckNumber ?? null}
                onSelectRelease={handleSelectRelease}
                onDeleteRelease={handleDeleteRelease}
              />
            {/if}
            {#if releaseHistory.galleryReleases.length > 0}
              <ReleaseHistoryPanel
                title="Gallery Decks"
                releases={releaseHistory.galleryReleases}
                isLoading={releaseHistory.isLoading}
                activeDeckNumber={rs.viewingRelease?.deckNumber ?? null}
                onSelectRelease={handleSelectRelease}
                onDeleteRelease={handleDeleteRelease}
                onReuseRecipe={handleReuseRecipe}
              />
            {/if}
            {#if releaseHistory.loopReleases.length > 0}
              <ReleaseHistoryPanel
                title="Released Decks"
                releases={releaseHistory.loopReleases}
                isLoading={releaseHistory.isLoading}
                activeDeckNumber={rs.viewingRelease?.deckNumber ?? null}
                onSelectRelease={handleSelectRelease}
                onDeleteRelease={handleDeleteRelease}
                onReuseRecipe={handleReuseRecipe}
              />
            {/if}
            {#if releaseHistory.archivedReleases.length > 0}
              <ReleaseHistoryPanel
                title="Archived Decks"
                releases={releaseHistory.archivedReleases}
                isLoading={releaseHistory.isLoading}
                activeDeckNumber={rs.viewingRelease?.deckNumber ?? null}
                onSelectRelease={handleSelectRelease}
                onRestoreRelease={handleRestoreRelease}
              />
            {/if}
          </div>
          {#if visibleStep === "review" && rs.viewingRelease === null}
            <div class="sidebar-footer">
              <button
                type="button"
                class="release-btn"
                onclick={openReleaseModal}
                disabled={rs.isReleasing || print.isRendering}
              >
                {#if rs.isReleasing}
                  <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
                  Releasing…
                {:else}
                  <i class="fas fa-stamp" aria-hidden="true"></i>
                  Release Deck #{String(rs.nextDeckNumber).padStart(3, "0")}
                {/if}
              </button>
            </div>
          {/if}
        </div>
      {:else}
        <div class="sidebar-view">
          <div class="sidebar-body">
            {#if visibleStep === "review" && print.renderTotal > 0}
              <PrintPanel
                cardCount={print.renderTotal}
                tndElements={print.tndElements}
                cardSize={print.cardSize}
                paperSize={print.paperSize}
                copies={print.copies}
                groupByElement={print.groupByElement}
                includeHowToRead={print.includeHowToRead}
                onIncludeHowToReadChange={(value) => {
                  print.includeHowToRead = value;
                }}
                theme={rs.theme}
                selectedSide={print.selectedSide}
                onSideChange={(side) => {
                  print.selectedSide = side;
                }}
                isExporting={print.isExporting}
                isPrinting={print.isPrinting}
                isRendering={print.isRendering}
                exportProgress={print.exportProgress}
                exportTotal={print.exportTotal}
                exportError={print.exportError}
                onPrint={print.print}
                onPrintTest={print.printTestSheet}
                onExportPDF={print.exportPDF}
                onExportZIP={print.exportZIP}
                onExportBoth={print.exportFrontsAndBacks}
              />
            {:else}
              <div class="sidebar-empty">
                <i class="fas fa-print" aria-hidden="true"></i>
                <span>Compose or open a deck to print.</span>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<DeckReleaseNameModal
  bind:open={showNameModal}
  deckNumber={rs.nextDeckNumber}
  initialName={rs.name}
  initialDescription={rs.description}
  isReleasing={rs.isReleasing}
  onConfirm={handleConfirmRelease}
  onCancel={() => {
    if (!rs.isReleasing) showNameModal = false;
  }}
/>

<style>
  .deck-releaser {
    display: flex;
    height: 100%;
    min-height: 0;
  }

  .festival-hidden {
    display: none;
  }

  .releaser-main {
    flex: 1;
    min-width: 0;
    overflow: auto;
  }

  :global(html.deck-motion-stage) .releaser-main :global(*),
  :global(html.deck-motion-content) .releaser-main :global(*) {
    view-transition-name: none !important;
  }

  :global(html.deck-motion-stage) .releaser-main,
  :global(html.deck-motion-content) .releaser-main {
    view-transition-name: deck-releaser-stage;
  }

  .releaser-sidebar {
    width: clamp(320px, 18vw, 400px);
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.94));
    border-left: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .sidebar-switch {
    padding: 12px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    flex-shrink: 0;
  }

  .sidebar-stage {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  :global(html.deck-motion-sidebar) .sidebar-stage :global(*) {
    view-transition-name: none !important;
  }

  :global(html.deck-motion-sidebar) .sidebar-stage {
    view-transition-name: deck-releaser-sidebar;
  }

  .sidebar-view {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
  }

  .sidebar-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .ready-print-jobs {
    flex: 0 0 auto;
    padding: 12px;
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .ready-print-jobs h2 {
    margin: 0 0 8px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.58));
    font-size: var(--font-size-compact, 0.75rem);
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .festival-job {
    display: grid;
    grid-template-columns: 40px minmax(0, 1fr) auto;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: 64px;
    padding: 9px 11px;
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 12%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04))
    );
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 35%, transparent);
    border-radius: 11px;
    color: var(--theme-text, #fff);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      transform var(--transition-spring),
      border-color var(--transition-fast),
      background var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .festival-job:hover {
    transform: translateY(var(--hover-lift-sm, -1px));
    border-color: var(--theme-accent, #8b5cf6);
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 18%,
      var(--theme-card-bg, rgba(255, 255, 255, 0.04))
    );
    box-shadow: 0 10px 24px
      color-mix(in srgb, var(--theme-shadow, #000) 40%, transparent);
  }

  .festival-job:active {
    transform: scale(0.985);
  }

  .festival-job:focus-visible {
    outline: 3px solid var(--theme-accent, #8b5cf6);
    outline-offset: 2px;
  }

  .festival-job-icon {
    display: grid;
    width: 40px;
    height: 40px;
    place-items: center;
    border-radius: 10px;
    background: color-mix(
      in srgb,
      var(--theme-accent, #8b5cf6) 25%,
      transparent
    );
    color: var(--theme-accent, #a78bfa);
  }

  .festival-job-copy {
    display: grid;
    min-width: 0;
    gap: 3px;
  }

  .festival-job-copy strong,
  .festival-job-copy small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .festival-job-copy strong {
    font-size: 14px;
  }

  .festival-job-copy small {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.62));
    font-size: 12px;
  }

  .festival-job-arrow {
    color: var(--theme-accent, #a78bfa);
    font-size: 12px;
  }
  /* Browse = two stacked sections (Generated · Released), each scrolls its own list. */
  .sidebar-body > :global(.archive-panel),
  .sidebar-body > :global(.release-history) {
    flex: 1 1 0;
    min-height: 0;
  }
  .sidebar-body > :global(.archive-panel) {
    border-bottom: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .sidebar-footer {
    padding: 12px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    flex-shrink: 0;
  }

  .sidebar-footer .release-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    min-height: 44px;
    padding: 10px 16px;
    background: var(--semantic-success, #10b981);
    border: none;
    border-radius: 10px;
    color: var(--theme-text, #fff);
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition:
      transform var(--transition-spring),
      filter var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .sidebar-footer .release-btn:hover:not(:disabled) {
    transform: translateY(var(--hover-lift-sm, -1px));
    filter: brightness(1.1);
    box-shadow: 0 10px 26px
      color-mix(in srgb, var(--semantic-success, #10b981) 28%, transparent);
  }
  .sidebar-footer .release-btn:active:not(:disabled) {
    transform: scale(0.985);
  }
  .sidebar-footer .release-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .sidebar-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 48px 20px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.3));
    font-size: 13px;
    text-align: center;
  }

  .sidebar-empty i {
    font-size: 24px;
  }

  .released-step {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    padding: 32px;
  }

  .released-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    max-width: 400px;
    padding: 40px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 16px;
    text-align: center;
    box-shadow: 0 24px 70px
      color-mix(in srgb, var(--theme-shadow, #000) 55%, transparent);
  }

  .released-icon {
    font-size: 48px;
    color: var(--semantic-success, #10b981);
  }

  .released-title {
    margin: 0;
    font-size: 24px;
    font-weight: 700;
    color: var(--theme-text, #fff);
  }

  .released-detail {
    margin: 0;
    font-size: 14px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
  }

  .released-notes {
    margin: 0;
    font-size: 18px;
    font-weight: 700;
    color: var(--theme-accent, #a78bfa);
  }

  .released-description {
    margin: 0;
    font-size: 14px;
    line-height: 1.4;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.6));
  }

  .released-actions {
    display: flex;
    gap: 12px;
    margin-top: 8px;
  }

  .new-deck-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 10px 24px;
    background: var(--theme-accent, #8b5cf6);
    border: none;
    border-radius: 10px;
    color: var(--theme-text);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition:
      transform var(--transition-spring),
      filter var(--transition-fast),
      box-shadow var(--transition-fast);
  }

  .new-deck-btn:hover {
    transform: translateY(var(--hover-lift-sm, -1px));
    filter: brightness(1.1);
    box-shadow: 0 10px 26px
      color-mix(in srgb, var(--theme-accent, #8b5cf6) 24%, transparent);
  }

  .new-deck-btn:active {
    transform: scale(0.985);
  }

  @media (min-width: 2600px) {
    .deck-releaser {
      --font-size-compact: 14px;
      --font-size-min: 16px;
      --font-size-sm: 16px;
      --min-touch-target: 52px;
    }

    .releaser-sidebar {
      width: clamp(440px, 13vw, 520px);
    }

    .sidebar-switch,
    .sidebar-footer {
      padding: 16px;
    }
  }

  @media (max-width: 900px) {
    .deck-releaser {
      flex-direction: column;
    }

    .releaser-sidebar {
      width: 100%;
      border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
      border-left: none;
      max-height: 320px;
    }
    .releaser-sidebar.print-mode {
      max-height: min(65%, 640px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .festival-job,
    .sidebar-footer .release-btn,
    .new-deck-btn {
      transition: none;
    }

    .sidebar-footer .fa-spin {
      animation: none;
    }
  }
</style>
