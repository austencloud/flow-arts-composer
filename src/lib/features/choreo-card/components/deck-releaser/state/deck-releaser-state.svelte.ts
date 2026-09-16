import type {
  DeckRelease,
  DeckReleaseCard,
  DeckRecipe,
  GalleryFilters,
  StepCountWeight,
} from "../../../domain/models/DeckRelease";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { SmartFilterSpec } from "$lib/shared/library/domain/models/collection";
import type {
  CatalogSourceSummary,
  TnDFamilyOption,
  TnDSeedClass,
  TnDTurnPatternOption,
} from "../../../services/deck-composer";
import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
import {
  DEFAULT_VARIATION_CONFIG,
  type StartOriMode,
  type VariationConfig,
} from "../../../services/deck-variation";
import type { ResolvedReversalPattern } from "../../../domain/reversal-transform";
import { GENERATOR_VERSION } from "../../../services/deck-recipe";
import {
  loadDeckReleaserSession,
  saveDeckReleaserSession,
  type DeckReleaserMode,
  type DeckReleaserSessionStorage,
  type DeckReleaserStep,
} from "./deck-releaser-session";

export interface DeckReleaserStateDependencies {
  storage: DeckReleaserSessionStorage;
  getLeftPropType(): PropType | null | undefined;
  getRightPropType(): PropType | null | undefined;
  mintSeed(): string;
  nextReferenceNumber(): number;
}

export interface DeckReleaserState {
  step: DeckReleaserStep;
  cards: DeckReleaseCard[];
  sequences: SequenceData[];
  weights: StepCountWeight[];
  totalCards: number;
  notes: string;
  name: string;
  description: string;
  themeOverride: string | null;
  leftPropOverride: PropType | null;
  rightPropOverride: PropType | null;
  brokenLoopCount: number;
  variationConfig: VariationConfig;
  selectedStartOriModes: Set<StartOriMode>;
  selectedGridModes: Set<"diamond" | "box">;
  reversalPattern: ResolvedReversalPattern | null;
  selectedPropType: PropType | null;
  nextDeckNumber: number;
  releasedNumber: number | null;
  sourceSummaries: CatalogSourceSummary[];
  selectedSliceTypes: Set<"halved" | "quartered">;
  seed: string;
  selectedLoopTypes: Set<string>;
  selectedLevels: Set<number>;
  selectedStartPlacementIds: Set<string>;
  startOriLeft: string;
  startOriRight: string;
  propStyle: "smooth" | "mixed" | "choppy";
  handStyle: "smooth" | "mixed" | "choppy";
  dashStyle: "low" | "mixed" | "high";
  selectedLength: number;
  turnIntensity: number;
  drawProgress: number;
  referenceNumber: number;
  tndSeedClasses: TnDSeedClass[];
  tndFamilies: TnDFamilyOption[];
  tndTurnPatterns: TnDTurnPatternOption[];
  deckMode: DeckReleaserMode;
  galleryFilterSpec: SmartFilterSpec | null;
  galleryFilters: GalleryFilters;
  selectedTnDFamilies: Set<string>;
  selectedTnDTurnPatterns: Set<string>;
  viewingRelease: DeckRelease | null;
  isReleasing: boolean;
  isLoadingSequences: boolean;
  isLoadingPools: boolean;
  drawGeneration: number;
  poolsLoaded: boolean;
  readonly theme: string;
  readonly leftPropType: PropType;
  readonly rightPropType: PropType;
  readonly savedViewingDeckNumber: number | null;
  persist(): void;
  toggleStartOriMode(mode: StartOriMode): void;
  toggleGridMode(mode: "diamond" | "box"): void;
  toRecipe(): DeckRecipe;
  loadRecipe(recipe: DeckRecipe): void;
  bumpReference(): void;
  reroll(): void;
  reset(): void;
}

export function createDeckReleaserState(
  deps: DeckReleaserStateDependencies
): DeckReleaserState {
  const saved = loadDeckReleaserSession(deps.storage);
  const restoredStartOriModes = saved?.startOriModes?.length
    ? saved.startOriModes
    : saved?.startOriMode
      ? [saved.startOriMode]
      : ["radial" as const];

  let step = $state<DeckReleaserStep>(saved?.step ?? "configure");
  let cards = $state<DeckReleaseCard[]>(
    saved?.cards?.length && saved.viewingDeckNumber == null ? saved.cards : []
  );
  let sequences = $state<SequenceData[]>([]);
  let weights = $state<StepCountWeight[]>(saved?.weights ?? []);
  let totalCards = $state(saved?.totalCards ?? 54);
  let notes = $state(saved?.notes ?? "Fire Drums 2026");
  let name = $state(saved?.name ?? "");
  let description = $state(saved?.description ?? "");
  let themeOverride = $state<string | null>(null);
  let leftPropOverride = $state<PropType | null>(null);
  let rightPropOverride = $state<PropType | null>(null);
  let brokenLoopCount = $state(0);
  let variationConfig = $state<VariationConfig>(
    saved?.variationConfig ?? { ...DEFAULT_VARIATION_CONFIG }
  );
  let selectedStartOriModes = $state<Set<StartOriMode>>(
    new Set(restoredStartOriModes)
  );
  let selectedGridModes = $state<Set<"diamond" | "box">>(
    new Set(saved?.gridModes?.length ? saved.gridModes : ["diamond"])
  );
  let reversalPattern = $state<ResolvedReversalPattern | null>(
    saved?.reversalPattern ?? null
  );
  let selectedPropType = $state<PropType | null>(
    (saved?.selectedPropType as PropType | undefined) ?? null
  );
  let nextDeckNumber = $state(1);
  let releasedNumber = $state<number | null>(null);
  let sourceSummaries = $state<CatalogSourceSummary[]>([]);
  let selectedSliceTypes = $state<Set<"halved" | "quartered">>(
    new Set(saved?.sliceTypes?.length ? saved.sliceTypes : ["quartered"])
  );
  let seed = $state(saved?.seed ?? deps.mintSeed());
  let selectedLoopTypes = $state<Set<string>>(
    new Set(saved?.loopTypes?.length ? saved.loopTypes : ["rotated"])
  );
  let selectedLevels = $state<Set<number>>(
    new Set(saved?.levels?.length ? saved.levels : [1])
  );
  let selectedStartPlacementIds = $state<Set<string>>(
    new Set(saved?.startPlacementIds ?? [])
  );
  let startOriLeft = $state(saved?.startOriLeft ?? "in");
  let startOriRight = $state(saved?.startOriRight ?? "in");
  let propStyle = $state<"smooth" | "mixed" | "choppy">(
    saved?.propStyle ?? "mixed"
  );
  let handStyle = $state<"smooth" | "mixed" | "choppy">(
    saved?.handStyle ?? "mixed"
  );
  let dashStyle = $state<"low" | "mixed" | "high">(saved?.dashStyle ?? "mixed");
  let selectedLength = $state(saved?.selectedLength ?? 8);
  let turnIntensity = $state(saved?.turnIntensity ?? 1);
  let drawProgress = $state(0);
  let referenceNumber = $state(saved?.referenceNumber ?? 0);
  let tndSeedClasses = $state<TnDSeedClass[]>([]);
  let tndFamilies = $state<TnDFamilyOption[]>([]);
  let tndTurnPatterns = $state<TnDTurnPatternOption[]>([]);
  let deckMode = $state<DeckReleaserMode>(saved?.deckMode ?? "loop");
  let galleryFilterSpec = $state<SmartFilterSpec | null>(
    saved?.galleryFilterSpec ?? null
  );
  let galleryFilters = $state<GalleryFilters>(saved?.galleryFilters ?? {});
  let selectedTnDFamilies = $state<Set<string>>(
    new Set(saved?.tndFamilyIds ?? [])
  );
  let selectedTnDTurnPatterns = $state<Set<string>>(
    new Set(saved?.tndTurnPatternIds ?? [])
  );
  let viewingRelease = $state<DeckRelease | null>(null);
  let isReleasing = $state(false);
  let isLoadingSequences = $state(false);
  let isLoadingPools = $state(true);
  let drawGeneration = 0;
  let poolsLoaded = false;

  function persist(): void {
    saveDeckReleaserSession(deps.storage, {
      step,
      viewingDeckNumber: viewingRelease?.deckNumber ?? null,
      deckMode,
      totalCards,
      notes,
      name,
      description,
      variationConfig,
      startOriModes: [...selectedStartOriModes],
      gridModes: [...selectedGridModes],
      reversalPattern,
      sliceTypes: [...selectedSliceTypes],
      seed,
      loopTypes: [...selectedLoopTypes],
      levels: [...selectedLevels],
      startPlacementIds: [...selectedStartPlacementIds],
      startOriLeft,
      startOriRight,
      propStyle,
      handStyle,
      dashStyle,
      selectedLength,
      turnIntensity,
      referenceNumber,
      selectedPropType: selectedPropType ?? undefined,
      tndFamilyIds: [...selectedTnDFamilies],
      tndTurnPatternIds: [...selectedTnDTurnPatterns],
      galleryFilterSpec: galleryFilterSpec ?? undefined,
      galleryFilters,
      weights,
      cards: viewingRelease ? undefined : cards,
    });
  }

  function toggleStartOriMode(mode: StartOriMode): void {
    const next = new Set(selectedStartOriModes);
    if (next.has(mode)) {
      if (next.size === 1) return;
      next.delete(mode);
    } else {
      next.add(mode);
    }
    selectedStartOriModes = next;
    persist();
  }

  function toggleGridMode(mode: "diamond" | "box"): void {
    const next = new Set(selectedGridModes);
    if (next.has(mode)) {
      if (next.size === 1) return;
      next.delete(mode);
    } else {
      next.add(mode);
    }
    selectedGridModes = next;
    persist();
  }

  function toRecipe(): DeckRecipe {
    const recipe: DeckRecipe = {
      deckMode,
      startOriModes: [...selectedStartOriModes],
      gridModes: [...selectedGridModes],
      reversalPattern,
    };

    if (deckMode === "loop") {
      recipe.weights = weights.map(({ stepCount, weight }) => ({
        stepCount,
        weight,
      }));
      recipe.totalCards = totalCards;
      recipe.sliceTypes = [...selectedSliceTypes];
      recipe.variationConfig = variationConfig;
      recipe.seed = seed;
      recipe.generatorVersion = GENERATOR_VERSION;
      recipe.schemaVersion = 1;
      recipe.loopTypes = [...selectedLoopTypes];
      recipe.levels = [...selectedLevels];
      if (selectedStartPlacementIds.size > 0) {
        recipe.startPlacementIds = [...selectedStartPlacementIds];
      }
      recipe.startOriLeft = startOriLeft;
      recipe.startOriRight = startOriRight;
      recipe.propStyle = propStyle;
      recipe.handStyle = handStyle;
      recipe.dashStyle = dashStyle;
      recipe.length = selectedLength;
      recipe.turnIntensity = turnIntensity;
    } else if (deckMode === "gallery") {
      if (galleryFilterSpec) {
        recipe.galleryFilterSpec = {
          ...galleryFilterSpec,
          filters: galleryFilterSpec.filters.map((filter) => ({ ...filter })),
          connectives: galleryFilterSpec.connectives
            ? { ...galleryFilterSpec.connectives }
            : undefined,
        };
      } else {
        recipe.galleryFilters = { ...galleryFilters };
      }
      recipe.totalCards = totalCards;
    } else {
      recipe.tndFamilyIds = [...selectedTnDFamilies];
      recipe.tndTurnPatternIds = [...selectedTnDTurnPatterns];
    }

    return recipe;
  }

  function loadRecipe(recipe: DeckRecipe): void {
    cards = [];
    sequences = [];
    releasedNumber = null;
    viewingRelease = null;
    name = "";
    description = "";
    themeOverride = null;
    leftPropOverride = null;
    rightPropOverride = null;
    brokenLoopCount = 0;
    deckMode = recipe.deckMode;
    selectedStartOriModes = new Set(
      recipe.startOriModes.length ? recipe.startOriModes : ["radial"]
    );
    selectedGridModes = new Set(
      recipe.gridModes.length ? recipe.gridModes : ["diamond"]
    );
    reversalPattern = recipe.reversalPattern ?? null;

    if (recipe.deckMode === "loop") {
      if (recipe.weights?.length) {
        const byStep = new Map(
          recipe.weights.map((weight) => [weight.stepCount, weight.weight])
        );
        weights = weights.length
          ? weights.map((weight) => ({
              ...weight,
              weight: byStep.get(weight.stepCount) ?? weight.weight,
            }))
          : recipe.weights.map((weight) => ({ ...weight, available: 0 }));
      }
      if (recipe.totalCards != null) totalCards = recipe.totalCards;
      if (recipe.sliceTypes?.length)
        selectedSliceTypes = new Set(recipe.sliceTypes);
      if (recipe.variationConfig) variationConfig = recipe.variationConfig;
      seed = recipe.seed ?? deps.mintSeed();
      selectedLoopTypes = new Set(
        recipe.loopTypes?.length ? recipe.loopTypes : ["rotated"]
      );
      selectedLevels = new Set(recipe.levels?.length ? recipe.levels : [1]);
      selectedStartPlacementIds = new Set(recipe.startPlacementIds ?? []);
      if (recipe.startOriLeft) startOriLeft = recipe.startOriLeft;
      if (recipe.startOriRight) startOriRight = recipe.startOriRight;
      if (recipe.propStyle) propStyle = recipe.propStyle;
      if (recipe.handStyle) handStyle = recipe.handStyle;
      if (recipe.dashStyle) dashStyle = recipe.dashStyle;
      if (recipe.length) selectedLength = recipe.length;
      if (recipe.turnIntensity != null) turnIntensity = recipe.turnIntensity;
    } else if (recipe.deckMode === "gallery") {
      galleryFilterSpec = recipe.galleryFilterSpec ?? null;
      galleryFilters = recipe.galleryFilters ?? {};
      if (recipe.totalCards != null) totalCards = recipe.totalCards;
    } else {
      selectedTnDFamilies = new Set(recipe.tndFamilyIds ?? []);
      selectedTnDTurnPatterns = new Set(recipe.tndTurnPatternIds ?? []);
    }

    step = "configure";
    persist();
  }

  function bumpReference(): void {
    referenceNumber = deps.nextReferenceNumber();
  }

  function reroll(): void {
    seed = deps.mintSeed();
    cards = [];
    sequences = [];
    persist();
  }

  function reset(): void {
    cards = [];
    sequences = [];
    releasedNumber = null;
    viewingRelease = null;
    name = "";
    description = "";
    themeOverride = null;
    leftPropOverride = null;
    rightPropOverride = null;
    brokenLoopCount = 0;
    seed = deps.mintSeed();
    selectedLoopTypes = new Set(["rotated"]);
    selectedLevels = new Set([1]);
    selectedStartPlacementIds = new Set();
    startOriLeft = "in";
    startOriRight = "in";
    step = "configure";
    persist();
  }

  return {
    get step() {
      return step;
    },
    set step(value) {
      step = value;
    },
    get cards() {
      return cards;
    },
    set cards(value) {
      cards = value;
    },
    get sequences() {
      return sequences;
    },
    set sequences(value) {
      sequences = value;
    },
    get weights() {
      return weights;
    },
    set weights(value) {
      weights = value;
    },
    get totalCards() {
      return totalCards;
    },
    set totalCards(value) {
      totalCards = value;
    },
    get notes() {
      return notes;
    },
    set notes(value) {
      notes = value;
    },
    get name() {
      return name;
    },
    set name(value) {
      name = value;
    },
    get description() {
      return description;
    },
    set description(value) {
      description = value;
    },
    get themeOverride() {
      return themeOverride;
    },
    set themeOverride(value) {
      themeOverride = value;
    },
    get leftPropOverride() {
      return leftPropOverride;
    },
    set leftPropOverride(value) {
      leftPropOverride = value;
    },
    get rightPropOverride() {
      return rightPropOverride;
    },
    set rightPropOverride(value) {
      rightPropOverride = value;
    },
    get brokenLoopCount() {
      return brokenLoopCount;
    },
    set brokenLoopCount(value) {
      brokenLoopCount = value;
    },
    get variationConfig() {
      return variationConfig;
    },
    set variationConfig(value) {
      variationConfig = value;
    },
    get selectedStartOriModes() {
      return selectedStartOriModes;
    },
    set selectedStartOriModes(value) {
      selectedStartOriModes = value;
    },
    get selectedGridModes() {
      return selectedGridModes;
    },
    set selectedGridModes(value) {
      selectedGridModes = value;
    },
    get reversalPattern() {
      return reversalPattern;
    },
    set reversalPattern(value) {
      reversalPattern = value;
    },
    get selectedPropType() {
      return selectedPropType;
    },
    set selectedPropType(value) {
      selectedPropType = value;
    },
    get nextDeckNumber() {
      return nextDeckNumber;
    },
    set nextDeckNumber(value) {
      nextDeckNumber = value;
    },
    get releasedNumber() {
      return releasedNumber;
    },
    set releasedNumber(value) {
      releasedNumber = value;
    },
    get sourceSummaries() {
      return sourceSummaries;
    },
    set sourceSummaries(value) {
      sourceSummaries = value;
    },
    get selectedSliceTypes() {
      return selectedSliceTypes;
    },
    set selectedSliceTypes(value) {
      selectedSliceTypes = value;
    },
    get seed() {
      return seed;
    },
    set seed(value) {
      seed = value;
    },
    get selectedLoopTypes() {
      return selectedLoopTypes;
    },
    set selectedLoopTypes(value) {
      selectedLoopTypes = value;
    },
    get selectedLevels() {
      return selectedLevels;
    },
    set selectedLevels(value) {
      selectedLevels = value;
    },
    get selectedStartPlacementIds() {
      return selectedStartPlacementIds;
    },
    set selectedStartPlacementIds(value) {
      selectedStartPlacementIds = value;
    },
    get startOriLeft() {
      return startOriLeft;
    },
    set startOriLeft(value) {
      startOriLeft = value;
    },
    get startOriRight() {
      return startOriRight;
    },
    set startOriRight(value) {
      startOriRight = value;
    },
    get propStyle() {
      return propStyle;
    },
    set propStyle(value) {
      propStyle = value;
    },
    get handStyle() {
      return handStyle;
    },
    set handStyle(value) {
      handStyle = value;
    },
    get dashStyle() {
      return dashStyle;
    },
    set dashStyle(value) {
      dashStyle = value;
    },
    get selectedLength() {
      return selectedLength;
    },
    set selectedLength(value) {
      selectedLength = value;
    },
    get turnIntensity() {
      return turnIntensity;
    },
    set turnIntensity(value) {
      turnIntensity = value;
    },
    get drawProgress() {
      return drawProgress;
    },
    set drawProgress(value) {
      drawProgress = value;
    },
    get referenceNumber() {
      return referenceNumber;
    },
    set referenceNumber(value) {
      referenceNumber = value;
    },
    get tndSeedClasses() {
      return tndSeedClasses;
    },
    set tndSeedClasses(value) {
      tndSeedClasses = value;
    },
    get tndFamilies() {
      return tndFamilies;
    },
    set tndFamilies(value) {
      tndFamilies = value;
    },
    get tndTurnPatterns() {
      return tndTurnPatterns;
    },
    set tndTurnPatterns(value) {
      tndTurnPatterns = value;
    },
    get deckMode() {
      return deckMode;
    },
    set deckMode(value) {
      deckMode = value;
    },
    get galleryFilterSpec() {
      return galleryFilterSpec;
    },
    set galleryFilterSpec(value) {
      galleryFilterSpec = value;
    },
    get galleryFilters() {
      return galleryFilters;
    },
    set galleryFilters(value) {
      galleryFilters = value;
    },
    get selectedTnDFamilies() {
      return selectedTnDFamilies;
    },
    set selectedTnDFamilies(value) {
      selectedTnDFamilies = value;
    },
    get selectedTnDTurnPatterns() {
      return selectedTnDTurnPatterns;
    },
    set selectedTnDTurnPatterns(value) {
      selectedTnDTurnPatterns = value;
    },
    get viewingRelease() {
      return viewingRelease;
    },
    set viewingRelease(value) {
      viewingRelease = value;
    },
    get isReleasing() {
      return isReleasing;
    },
    set isReleasing(value) {
      isReleasing = value;
    },
    get isLoadingSequences() {
      return isLoadingSequences;
    },
    set isLoadingSequences(value) {
      isLoadingSequences = value;
    },
    get isLoadingPools() {
      return isLoadingPools;
    },
    set isLoadingPools(value) {
      isLoadingPools = value;
    },
    get drawGeneration() {
      return drawGeneration;
    },
    set drawGeneration(value) {
      drawGeneration = value;
    },
    get poolsLoaded() {
      return poolsLoaded;
    },
    set poolsLoaded(value) {
      poolsLoaded = value;
    },
    get theme() {
      return "rainbow";
    },
    get leftPropType() {
      return (
        leftPropOverride ??
        selectedPropType ??
        deps.getLeftPropType() ??
        PropType.STAFF
      );
    },
    get rightPropType() {
      return (
        rightPropOverride ??
        selectedPropType ??
        deps.getRightPropType() ??
        PropType.STAFF
      );
    },
    get savedViewingDeckNumber() {
      return loadDeckReleaserSession(deps.storage)?.viewingDeckNumber ?? null;
    },
    persist,
    toggleStartOriMode,
    toggleGridMode,
    toRecipe,
    loadRecipe,
    bumpReference,
    reroll,
    reset,
  };
}
