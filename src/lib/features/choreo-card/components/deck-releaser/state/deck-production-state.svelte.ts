import type { Catalog } from "../../../domain/models/Catalog";
import type { DeckReleaseCard } from "../../../domain/models/DeckRelease";
import {
  buildSequencePool,
  buildTnDCards,
  buildTnDSeedClasses,
  composeDeck,
  getAvailableWeights,
  getCatalogSourceSummaries,
  getTnDFamilyOptions,
  getTnDTurnPatternOptions,
  loopDrawCounts,
  prunePool,
  swapCard,
  TND_BASE_CATALOG_ID,
  type CatalogPoolFilter,
  type PoolEntry,
} from "../../../services/deck-composer";
import {
  applyVariationDescriptor,
  resolveDeckSequences,
  rollVariation,
} from "../../../services/deck-variation";
import { hashRecipe } from "../../../services/deck-recipe";
import { makeRng, childSeed } from "$lib/shared/foundation/utils/seeded-rng";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import {
  GenerationMode,
  type GenerationOptions,
} from "$lib/shared/foundation/domain/models/generation/generate-models";
import { LOOPType } from "$lib/shared/foundation/domain/models/generation/circular-models";
import { levelToDifficulty } from "$lib/shared/create/utils/config-mapper";
import { resolveLoopConfig } from "$lib/shared/create/services/loop-type-utils";
import { Orientation } from "$lib/shared/pictograph/shared/domain/enums/pictograph-enums";
import type { GridMode } from "$lib/shared/pictograph/grid/domain/enums/grid-enums";
import type { PictographData } from "$lib/shared/pictograph/shared/domain/models/pictograph-data";
import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
import { hashSequenceSkeleton } from "$lib/shared/foundation/services/content-hasher";
import type { ArchivedDeckPayload } from "../../../services/deck-archive-store";
import {
  buildGalleryDeckResult,
  normalizeGalleryFilters,
  type GalleryDeckSelection,
} from "../../../services/gallery-deck-source";
import type { DeckReleaserState } from "./deck-releaser-state.svelte";

export interface DeckProductionStateDependencies {
  loadCatalogs: typeof import("../../../services/catalog-loader").loadCatalogs;
  loadSequencesByIds: typeof import("../../../services/catalog-loader").loadSequencesByIds;
  loadDiamondEdges: typeof import("../../../services/pictograph-letter-lookup").loadDiamondEdges;
  queryGalleryDeck: typeof import("../../../services/gallery-deck-source").queryGalleryDeck;
  queryGalleryDeckFromSpec: typeof import("../../../services/gallery-deck-source").queryGalleryDeckFromSpec;
  resolveGalleryCards: typeof import("../../../services/gallery-deck-source").resolveGalleryCards;
  generateSequence(options: GenerationOptions): Promise<SequenceData>;
  getStartPlacementVariations(
    gridMode: GridMode,
    leftOrientation: Orientation,
    rightOrientation: Orientation
  ): PictographData[];
  loadArchivedDeck(refNumber: number): Promise<ArchivedDeckPayload | null>;
  getReleasedSequenceIds(): Set<string>;
  info(message: string): void;
  success(message: string): void;
  error(message: string): void;
}

export function createDeckProductionState(
  deck: DeckReleaserState,
  deps: DeckProductionStateDependencies
) {
  let catalogs: Catalog[] = [];
  let pool = new Map<number, PoolEntry[]>();

  function rebuildPool(): void {
    const filter: CatalogPoolFilter = {
      sliceTypes: deck.selectedSliceTypes,
      loopTypes: deck.selectedLoopTypes,
      levels: deck.selectedLevels,
      startPlacementIds:
        deck.selectedStartPlacementIds.size > 0
          ? deck.selectedStartPlacementIds
          : undefined,
    };
    pool = buildSequencePool(catalogs, filter);
    const releasedIds = deps.getReleasedSequenceIds();
    if (releasedIds.size > 0) prunePool(pool, releasedIds, new Set([4]));

    const fresh = getAvailableWeights(pool);
    const previousWeights = new Map(
      deck.weights.map((weight) => [weight.stepCount, weight.weight])
    );
    deck.weights = fresh.map((weight) =>
      previousWeights.has(weight.stepCount)
        ? { ...weight, weight: previousWeights.get(weight.stepCount)! }
        : weight
    );
  }

  async function initialize(releasesReady: Promise<unknown>): Promise<void> {
    try {
      catalogs = await deps.loadCatalogs();
      deck.sourceSummaries = getCatalogSourceSummaries(catalogs);
      const baseCatalog = catalogs.find(
        (catalog) => catalog.id === TND_BASE_CATALOG_ID
      );
      const baseSeedIds = baseCatalog
        ? baseCatalog.families.flatMap((family) => family.sequenceIds)
        : [];
      if (baseSeedIds.length > 0) {
        const baseSequences = await deps.loadSequencesByIds(
          TND_BASE_CATALOG_ID,
          baseSeedIds
        );
        deck.tndSeedClasses = buildTnDSeedClasses(baseSequences);
      }
      await releasesReady;
      rebuildPool();
    } catch (error) {
      console.warn("Failed to load deck pools:", error);
    } finally {
      deck.isLoadingPools = false;
      deck.poolsLoaded = true;
    }
  }

  function handleSliceTypeToggle(sliceType: "halved" | "quartered"): void {
    const next = new Set(deck.selectedSliceTypes);
    if (next.has(sliceType)) {
      if (next.size > 1) next.delete(sliceType);
    } else {
      next.add(sliceType);
    }
    deck.selectedSliceTypes = next;
    rebuildPool();
  }

  function handleModeChange(mode: "loop" | "tnd" | "gallery"): void {
    deck.deckMode = mode;
    if (mode === "tnd" && deck.selectedTnDFamilies.size === 0) {
      deck.selectedTnDFamilies = new Set(
        deck.tndFamilies.map((family) => family.familyId)
      );
    }
    if (mode === "tnd" && deck.selectedTnDTurnPatterns.size === 0) {
      deck.selectedTnDTurnPatterns = new Set(
        deck.tndTurnPatterns.map((pattern) => pattern.turnPattern)
      );
    }
  }

  function handleTnDFamilyToggle(familyId: string): void {
    const next = new Set(deck.selectedTnDFamilies);
    if (next.has(familyId)) next.delete(familyId);
    else next.add(familyId);
    deck.selectedTnDFamilies = next;
  }

  function selectAllFamilies(): void {
    deck.selectedTnDFamilies = new Set(
      deck.tndFamilies.map((family) => family.familyId)
    );
  }

  function clearFamilies(): void {
    deck.selectedTnDFamilies = new Set();
  }

  function handleTnDTurnPatternToggle(turnPattern: string): void {
    const next = new Set(deck.selectedTnDTurnPatterns);
    if (next.has(turnPattern)) next.delete(turnPattern);
    else next.add(turnPattern);
    deck.selectedTnDTurnPatterns = next;
  }

  function setTnDTurnPatterns(patterns: Set<string>): void {
    deck.selectedTnDTurnPatterns = patterns;
  }

  function handleWeightChange(stepCount: number, weight: number): void {
    deck.weights = deck.weights.map((candidate) =>
      candidate.stepCount === stepCount ? { ...candidate, weight } : candidate
    );
  }

  $effect(() => {
    deck.tndFamilies = getTnDFamilyOptions(deck.tndSeedClasses, [
      ...deck.selectedGridModes,
    ]);
  });

  const tndCardCount = $derived(
    buildTnDCards(
      deck.tndFamilies,
      deck.selectedTnDFamilies,
      deck.selectedTnDTurnPatterns,
      [...deck.selectedStartOriModes]
    ).length
  );

  const selectedFamilyBaseSequences = $derived(
    deck.tndFamilies
      .filter((family) => deck.selectedTnDFamilies.has(family.familyId))
      .reduce((sum, family) => sum + family.sequenceCount, 0)
  );

  $effect(() => {
    deck.tndTurnPatterns = getTnDTurnPatternOptions(
      selectedFamilyBaseSequences
    );
  });

  function composeFullDeck(): DeckReleaseCard[] {
    const registers = [...deck.selectedStartOriModes];
    const grids = [...deck.selectedGridModes];
    if (deck.deckMode === "tnd") {
      const tndCards = buildTnDCards(
        deck.tndFamilies,
        deck.selectedTnDFamilies,
        deck.selectedTnDTurnPatterns,
        registers
      );
      const reversal = deck.reversalPattern;
      const hasReversal = reversal != null && /[PRB]/.test(reversal.sequence);
      return tndCards.map((candidate, index) => {
        const card = { ...candidate, position: index + 1 };
        if (!hasReversal) return card;
        return {
          ...card,
          variation: {
            ...(card.variation ?? {}),
            reversalSequence: reversal.sequence,
            reversalPatternId: reversal.id,
          },
        };
      });
    }

    rebuildPool();
    const recipe = deck.toRecipe();
    const masterKey = `${recipe.seed}:${hashRecipe(recipe)}`;
    const rng = makeRng(masterKey);
    const { base } = loopDrawCounts(
      deck.totalCards,
      registers.length,
      grids.length
    );
    const cards = composeDeck(
      pool,
      deck.weights,
      base,
      { center: deck.notes },
      rng
    );
    const output: DeckReleaseCard[] = [];
    let position = 1;
    let baseIndex = 0;
    for (const card of cards) {
      const rolled = rollVariation(
        card.stepCount,
        deck.variationConfig,
        makeRng(childSeed(masterKey, baseIndex++))
      );
      for (const mode of registers) {
        for (const grid of grids) {
          const variation = {
            ...(rolled ?? {}),
            ...(mode !== "radial" ? { startOriMode: mode } : {}),
            ...(grid !== "diamond" ? { gridMode: grid } : {}),
          };
          output.push(
            Object.keys(variation).length > 0
              ? { ...card, position: position++, variation }
              : { ...card, position: position++ }
          );
        }
      }
    }
    return output;
  }

  async function generateLiveDeck(generation: number): Promise<boolean> {
    const length = deck.selectedLength || 8;
    const gridMode = ([...deck.selectedGridModes][0] ?? "diamond") as
      | "diamond"
      | "box";
    const loopType = ([...deck.selectedLoopTypes][0] ?? "rotated") as LOOPType;
    const resolvedLoop = resolveLoopConfig(
      loopType,
      deck.selectedSliceTypes.has("quartered") ? "quartered" : "halved"
    );
    const motionTypeFilter =
      deck.dashStyle === "low"
        ? "no-dash"
        : deck.dashStyle === "high"
          ? "prefer-dash"
          : null;
    const startPlacements =
      deck.selectedStartPlacementIds.size > 0
        ? deps
            .getStartPlacementVariations(
              gridMode,
              deck.startOriLeft as Orientation,
              deck.startOriRight as Orientation
            )
            .filter((position) =>
              deck.selectedStartPlacementIds.has(String(position.startPlacement))
            )
        : [];

    const options: GenerationOptions = {
      mode: GenerationMode.CIRCULAR,
      length,
      gridMode,
      propType: deck.leftPropType,
      difficulty: levelToDifficulty([...deck.selectedLevels][0] ?? 1),
      loopType,
      period: resolvedLoop.period as GenerationOptions["period"],
      loopSpecWire: resolvedLoop.loopSpecWire,
      loopRhythm: resolvedLoop.loopRhythm,
      constraintPreset: deck.propStyle,
      handPathMode: deck.handStyle,
      motionTypeFilter,
      turnIntensity: deck.turnIntensity,
      leftStartOrientation: deck.startOriLeft,
      rightStartOrientation: deck.startOriRight,
    };

    const target = deck.totalCards || 52;
    const maxPerWordLimit = 2;
    const sequences: SequenceData[] = [];
    const seenSkeletons = new Set<string>();
    const wordCounts = new Map<string, number>();
    deck.isLoadingSequences = true;
    deck.drawProgress = 0;
    let attempts = 0;
    let attemptsSinceAccept = 0;
    let maxPerWord = 1;
    const promoteAfter = Math.max(60, Math.round(target / 3));
    const maxAttempts = target * 12;

    try {
      while (sequences.length < target && attempts < maxAttempts) {
        attempts++;
        if (generation !== deck.drawGeneration) return false;
        if (startPlacements.length) {
          options.startPlacement =
            startPlacements[Math.floor(Math.random() * startPlacements.length)];
        }
        let sequence: SequenceData;
        try {
          sequence = await deps.generateSequence(options);
        } catch (error) {
          console.warn("Live deck: a generation attempt failed", error);
          continue;
        }
        if (sequence.steps.length !== length) continue;

        const skeleton = hashSequenceSkeleton(sequence);
        if (!seenSkeletons.has(skeleton)) {
          const word = simplifyRepeatedWord(sequence.word ?? "") || skeleton;
          const count = wordCounts.get(word) ?? 0;
          if (count < maxPerWord) {
            seenSkeletons.add(skeleton);
            wordCounts.set(word, count + 1);
            sequences.push(sequence);
            deck.drawProgress = sequences.length;
            attemptsSinceAccept = 0;
            continue;
          }
        }

        attemptsSinceAccept++;
        if (attemptsSinceAccept >= promoteAfter) {
          if (maxPerWord < maxPerWordLimit) {
            maxPerWord++;
            attemptsSinceAccept = 0;
          } else {
            break;
          }
        }
      }
    } finally {
      deck.isLoadingSequences = false;
    }

    if (generation !== deck.drawGeneration) return false;
    if (sequences.length === 0) {
      deps.info(
        "Couldn't generate sequences for these settings. Try a different loop type or length."
      );
      return false;
    }
    if (sequences.length < target) {
      deps.info(
        `Generated ${sequences.length} of ${target}. Only ${wordCounts.size} distinct words exist for these settings. For more variety try Halved period or a longer length.`
      );
    }

    deck.sequences = sequences;
    deck.cards = sequences.map((sequence, index) => ({
      sequenceId: `${(sequence.word ?? "loop").slice(0, 16)}-${index}`,
      sourceCatalogId: "live-gen",
      stepCount: sequence.steps?.length ?? length,
      word: sequence.word ?? "",
      position: index + 1,
      footer: { center: deck.notes },
    }));
    return true;
  }

  async function composeGalleryDeck(
    generation: number,
    selection: GalleryDeckSelection
  ): Promise<boolean> {
    deck.isLoadingSequences = true;
    try {
      if (generation !== deck.drawGeneration) return false;
      const prepared = buildGalleryDeckResult(
        selection.sequences,
        deck.totalCards,
        deck.notes
      );
      if (prepared.sequences.length === 0) {
        deps.info("No library sequences match this rule.");
        return false;
      }
      deck.galleryFilterSpec = selection.filterSpec;
      deck.galleryFilters = {};
      deck.sequences = prepared.sequences;
      deck.cards = prepared.cards;
      return true;
    } finally {
      deck.isLoadingSequences = false;
    }
  }

  async function refreshGallery(
    generation = ++deck.drawGeneration
  ): Promise<boolean> {
    const filterSpec =
      deck.viewingRelease?.recipe?.galleryFilterSpec ?? deck.galleryFilterSpec;
    const filters = normalizeGalleryFilters(
      deck.viewingRelease?.recipe?.galleryFilters ?? deck.galleryFilters
    );
    const cap = deck.viewingRelease?.recipe?.totalCards ?? deck.totalCards;
    deck.isLoadingSequences = true;
    try {
      const { cards, sequences } = filterSpec
        ? await deps.queryGalleryDeckFromSpec(filterSpec, cap, deck.notes)
        : await deps.queryGalleryDeck(filters, cap, deck.notes);
      if (generation !== deck.drawGeneration) return false;
      if (sequences.length === 0) {
        deps.info("No library sequences match this rule.");
        return false;
      }
      deck.sequences = sequences;
      deck.cards = cards;
      deck.persist();
      deps.success(
        `Refreshed. ${sequences.length} sequences from your gallery.`
      );
      return true;
    } catch (error) {
      console.warn("Gallery refresh failed:", error);
      deps.error("Gallery refresh failed.");
      return false;
    } finally {
      deck.isLoadingSequences = false;
    }
  }

  async function loadSelectedSequences(generation: number): Promise<void> {
    deck.isLoadingSequences = true;
    try {
      const byCatalog = new Map<string, string[]>();
      const seen = new Set<string>();
      for (const card of deck.cards) {
        const key = `${card.sourceCatalogId}::${card.sequenceId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const ids = byCatalog.get(card.sourceCatalogId) ?? [];
        ids.push(card.sequenceId);
        byCatalog.set(card.sourceCatalogId, ids);
      }

      const baseByKey = new Map<string, SequenceData>();
      for (const [catalogId, sequenceIds] of byCatalog) {
        const loaded =
          catalogId === "gallery"
            ? await deps.resolveGalleryCards(sequenceIds)
            : await deps.loadSequencesByIds(catalogId, sequenceIds);
        for (const sequence of loaded) {
          baseByKey.set(`${catalogId}::${sequence.id}`, sequence);
        }
      }
      if (generation !== deck.drawGeneration) return;

      const needsVariation = deck.cards.some((card) => card.variation);
      const edges = needsVariation ? await deps.loadDiamondEdges() : [];
      if (generation !== deck.drawGeneration) return;

      const resolved = resolveDeckSequences(deck.cards, baseByKey, edges);
      deck.sequences = resolved.map((item) => item.sequence);
      deck.brokenLoopCount = resolved.filter(
        (item) => !item.turnLoopClosed
      ).length;
    } catch (error) {
      console.warn("Failed to load sequences:", error);
    } finally {
      deck.isLoadingSequences = false;
    }
  }

  async function restoreDraft(savedDeckNumber: number | null): Promise<void> {
    if (savedDeckNumber || deck.viewingRelease) return;
    if (deck.step !== "review" || deck.cards.length === 0) return;
    if (deck.sequences.length === deck.cards.length) return;

    const isLiveGeneration = deck.cards.some(
      (card) => card.sourceCatalogId === "live-gen"
    );
    if (isLiveGeneration) {
      if (deck.referenceNumber > 0) {
        const payload = await deps.loadArchivedDeck(deck.referenceNumber);
        if (payload?.sequences.length) {
          deck.sequences = payload.sequences;
          deck.cards = payload.cards;
          return;
        }
      }
      deps.info(
        "This generated deck's cards couldn't be restored. Redraw to rebuild it."
      );
      return;
    }

    const generation = ++deck.drawGeneration;
    await loadSelectedSequences(generation);
  }

  async function swap(index: number): Promise<void> {
    const oldCard = deck.cards[index];
    if (oldCard) {
      const bucket = pool.get(oldCard.stepCount);
      if (bucket) {
        pool.set(
          oldCard.stepCount,
          bucket.filter((entry) => entry.sequenceId !== oldCard.sequenceId)
        );
      }
    }

    deck.cards = swapCard(deck.cards, index, pool);
    const newCard = deck.cards[index];
    if (!newCard) return;

    try {
      const loaded = await deps.loadSequencesByIds(newCard.sourceCatalogId, [
        newCard.sequenceId,
      ]);
      if (loaded.length > 0) {
        const base = loaded[0]!;
        const resolvedSequence = newCard.variation
          ? applyVariationDescriptor(
              base,
              newCard.variation,
              await deps.loadDiamondEdges()
            ).sequence
          : base;
        deck.sequences = deck.sequences.map((sequence, sequenceIndex) =>
          sequenceIndex === index ? resolvedSequence : sequence
        );
      }
    } catch (error) {
      console.warn("Failed to load swapped sequence:", error);
    }
    deck.persist();
  }

  function remove(sequence: SequenceData): boolean {
    if (deck.deckMode !== "loop") return false;
    let index = deck.sequences.indexOf(sequence);
    if (index < 0) {
      index = deck.sequences.findIndex(
        (candidate) => candidate.id === sequence.id
      );
    }
    if (index < 0) return false;
    deck.sequences = deck.sequences.filter(
      (_, sequenceIndex) => sequenceIndex !== index
    );
    deck.cards = deck.cards
      .filter((_, cardIndex) => cardIndex !== index)
      .map((card, cardIndex) => ({ ...card, position: cardIndex + 1 }));
    deck.persist();
    return true;
  }

  return {
    get tndCardCount() {
      return tndCardCount;
    },
    initialize,
    rebuildPool,
    handleSliceTypeToggle,
    handleModeChange,
    handleTnDFamilyToggle,
    selectAllFamilies,
    clearFamilies,
    handleTnDTurnPatternToggle,
    setTnDTurnPatterns,
    handleWeightChange,
    composeFullDeck,
    generateLiveDeck,
    composeGalleryDeck,
    refreshGallery,
    loadSelectedSequences,
    restoreDraft,
    swap,
    remove,
  };
}

export type DeckProductionState = ReturnType<typeof createDeckProductionState>;
