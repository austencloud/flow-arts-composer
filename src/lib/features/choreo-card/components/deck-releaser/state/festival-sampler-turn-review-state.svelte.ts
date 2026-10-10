import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { FestivalSamplerCardManifest } from "../../../services/festival-sampler-manifest";
import {
  formatFestivalTurnPattern,
  parseFestivalTurnPattern,
  readFestivalTurnReviewDecisions,
  readFestivalTurnReviewSession,
  repeatFestivalTurnMotif,
  resolveFestivalTurnPatternContext,
  setFestivalTurnMotifValue,
  smallestFestivalTurnMotifLength,
  writeFestivalTurnReviewDecisions,
  writeFestivalTurnReviewSession,
  type FestivalTurnDecision,
  type FestivalTurnHand,
  type FestivalTurnReviewFilter,
  type FestivalTurnReviewItem,
  type FestivalTurnReviewStorage,
} from "../../../services/festival-sampler-turn-review";

export type { FestivalTurnReviewFilter } from "../../../services/festival-sampler-turn-review";

interface FestivalSamplerTurnReviewDependencies {
  storage: FestivalTurnReviewStorage | null;
  sessionStorage: FestivalTurnReviewStorage | null;
  nowIso: () => string;
  loadBaseSequence: (
    card: FestivalSamplerCardManifest
  ) => Promise<SequenceData>;
  applyTurnAssignment: (
    card: FestivalSamplerCardManifest,
    base: SequenceData
  ) => SequenceData;
}

export function createFestivalSamplerTurnReviewState(
  items: FestivalTurnReviewItem[],
  dependencies: FestivalSamplerTurnReviewDependencies
) {
  const restoredSession = readFestivalTurnReviewSession(
    dependencies.sessionStorage,
    items
  );
  const initialItem =
    items.find((item) => item.id === restoredSession?.selectedId) ?? items[0];
  const initialExample =
    initialItem?.examples.find(
      (example) => example.id === restoredSession?.selectedExampleId
    ) ?? initialItem?.examples[0];
  const initialEntries = restoredSession
    ? parseFestivalTurnPattern(restoredSession.draftPattern)
    : initialExample
      ? parseFestivalTurnPattern(initialExample.pattern)
      : [];
  const initialDecisions = readFestivalTurnReviewDecisions(
    dependencies.storage,
    items
  );
  const restoredFilter = restoredSession?.filter ?? "unreviewed";
  const initialFilter =
    restoredFilter === "unreviewed" &&
    items.every((item) => initialDecisions[item.id]?.decision)
      ? "all"
      : restoredFilter;

  let filter = $state<FestivalTurnReviewFilter>(initialFilter);
  let selectedId = $state(initialItem?.id ?? "");
  let selectedExampleId = $state(initialExample?.id ?? "");
  let decisions = $state(initialDecisions);
  let draftEntries = $state(initialEntries);
  let motifLength = $state(
    restoredSession?.motifLength ??
      (initialEntries.length > 0
        ? smallestFestivalTurnMotifLength(initialEntries)
        : 1)
  );
  let patternScrollTop = $state(restoredSession?.patternScrollTop ?? 0);
  let patternScrollLeft = $state(restoredSession?.patternScrollLeft ?? 0);
  let workspaceScrollTop = $state(restoredSession?.workspaceScrollTop ?? 0);
  let pageScrollTop = $state(restoredSession?.pageScrollTop ?? 0);
  let sequence = $state<SequenceData | null>(null);
  let isLoading = $state(false);
  let validationError = $state("");
  let requestNumber = 0;
  const baseSequences = new Map<string, SequenceData>();

  function itemFor(id: string): FestivalTurnReviewItem | undefined {
    return items.find((item) => item.id === id);
  }

  function exampleFor(item = itemFor(selectedId)) {
    return (
      item?.examples.find((example) => example.id === selectedExampleId) ??
      item?.examples[0]
    );
  }

  function filteredItems(): FestivalTurnReviewItem[] {
    if (filter === "all") return items;
    return items.filter((item) => {
      const decision = decisions[item.id]?.decision;
      return filter === "unreviewed" ? !decision : decision === filter;
    });
  }

  function persistSession(): void {
    if (!itemFor(selectedId) || draftEntries.length === 0) return;
    writeFestivalTurnReviewSession(dependencies.sessionStorage, {
      selectedId,
      selectedExampleId,
      filter,
      draftPattern: formatFestivalTurnPattern(draftEntries),
      motifLength,
      patternScrollTop,
      patternScrollLeft,
      workspaceScrollTop,
      pageScrollTop,
    });
  }

  function currentTurnContext() {
    const item = itemFor(selectedId);
    const example = exampleFor(item);
    if (!item || !example) return null;
    return resolveFestivalTurnPatternContext(
      example.representativeCard,
      formatFestivalTurnPattern(draftEntries)
    );
  }

  async function audition(): Promise<void> {
    const item = itemFor(selectedId);
    const example = exampleFor(item);
    if (!item || !example) return;
    const currentRequest = ++requestNumber;
    isLoading = true;
    validationError = "";
    try {
      let base = baseSequences.get(example.id);
      if (!base) {
        base = await dependencies.loadBaseSequence(example.representativeCard);
        baseSequences.set(example.id, base);
      }
      const card = {
        ...example.representativeCard,
        turnIntensity: example.turnIntensity,
        turnPatternId: undefined,
        turnPattern: formatFestivalTurnPattern(draftEntries),
      };
      const applied = dependencies.applyTurnAssignment(card, base);
      if (currentRequest !== requestNumber) return;
      sequence = applied;
    } catch (cause) {
      if (currentRequest !== requestNumber) return;
      sequence = null;
      validationError = cause instanceof Error ? cause.message : String(cause);
    } finally {
      if (currentRequest === requestNumber) isLoading = false;
    }
  }

  async function select(id: string): Promise<void> {
    const item = itemFor(id);
    if (!item) return;
    selectedId = id;
    selectedExampleId = item.examples[0]?.id ?? "";
    const example = exampleFor(item);
    if (!example) return;
    draftEntries = parseFestivalTurnPattern(example.pattern);
    motifLength = smallestFestivalTurnMotifLength(draftEntries);
    persistSession();
    await audition();
  }

  async function selectExample(id: string): Promise<void> {
    const item = itemFor(selectedId);
    const example = item?.examples.find((candidate) => candidate.id === id);
    if (!item || !example) return;
    selectedExampleId = example.id;
    draftEntries = parseFestivalTurnPattern(example.pattern);
    motifLength = smallestFestivalTurnMotifLength(draftEntries);
    persistSession();
    await audition();
  }

  async function initialize(): Promise<void> {
    if (!selectedId) return;
    persistSession();
    await audition();
  }

  async function setFilter(
    nextFilter: FestivalTurnReviewFilter
  ): Promise<void> {
    filter = nextFilter;
    const visible = filteredItems();
    if (visible.length > 0 && !visible.some((item) => item.id === selectedId)) {
      await select(visible[0]!.id);
      return;
    }
    persistSession();
  }

  async function setMotifLength(nextLength: number): Promise<void> {
    const example = exampleFor();
    if (!example || ![1, 2, 4].includes(nextLength)) return;
    if (
      example.unitLength % nextLength !== 0 ||
      nextLength > example.unitLength
    )
      return;
    motifLength = nextLength;
    draftEntries = repeatFestivalTurnMotif(
      draftEntries,
      motifLength,
      example.unitLength
    );
    persistSession();
    await audition();
  }

  async function toggleTurn(
    stepIndex: number,
    hand: FestivalTurnHand
  ): Promise<void> {
    const example = exampleFor();
    if (!example) return;
    const entry = draftEntries[stepIndex];
    if (!entry) return;
    const nextValue =
      entry[hand] === example.turnIntensity ? 0 : example.turnIntensity;
    draftEntries = setFestivalTurnMotifValue(
      draftEntries,
      motifLength,
      stepIndex,
      hand,
      nextValue
    );
    persistSession();
    await audition();
  }

  async function reset(): Promise<void> {
    const example = exampleFor();
    if (!example) return;
    draftEntries = parseFestivalTurnPattern(example.pattern);
    motifLength = smallestFestivalTurnMotifLength(draftEntries);
    persistSession();
    await audition();
  }

  async function vote(decision: FestivalTurnDecision): Promise<void> {
    const item = itemFor(selectedId);
    const example = exampleFor(item);
    const context = currentTurnContext();
    if (
      !item ||
      !example ||
      !context ||
      (decision === "yay" && validationError)
    )
      return;
    decisions = {
      ...decisions,
      [item.id]: {
        decision,
        originalPattern: example.pattern,
        reviewedPattern: formatFestivalTurnPattern(draftEntries),
        originalEffectivePattern: example.effectivePattern,
        reviewedEffectivePattern: context.effectivePattern,
        loopType: example.loopType,
        period: example.period,
        updatedAt: dependencies.nowIso(),
        source: "browser",
      },
    };
    writeFestivalTurnReviewDecisions(dependencies.storage, decisions);

    const currentIndex = items.findIndex(
      (candidate) => candidate.id === item.id
    );
    const remaining = items.filter((candidate) => !decisions[candidate.id]);
    const next =
      remaining.find((candidate) => items.indexOf(candidate) > currentIndex) ??
      remaining[0];
    if (next) await select(next.id);
    else persistSession();
  }

  async function moveExample(direction: -1 | 1): Promise<void> {
    const item = itemFor(selectedId);
    if (!item || item.examples.length < 2) return;
    const currentIndex = item.examples.findIndex(
      (example) => example.id === selectedExampleId
    );
    const safeIndex = currentIndex < 0 ? 0 : currentIndex;
    const nextIndex =
      (safeIndex + direction + item.examples.length) % item.examples.length;
    await selectExample(item.examples[nextIndex]!.id);
  }

  async function move(direction: -1 | 1): Promise<void> {
    const visible = filteredItems();
    if (visible.length < 2) return;
    const currentIndex = visible.findIndex((item) => item.id === selectedId);
    const safeIndex = currentIndex < 0 ? 0 : currentIndex;
    const nextIndex = (safeIndex + direction + visible.length) % visible.length;
    await select(visible[nextIndex]!.id);
  }

  function normalizeScrollPosition(value: number): number {
    return Math.max(0, Math.round(value));
  }

  function setScrollPositions(
    positions: Partial<
      Pick<
        ReturnType<typeof currentScrollPositions>,
        | "patternScrollTop"
        | "workspaceScrollTop"
        | "pageScrollTop"
        | "patternScrollLeft"
      >
    >
  ): void {
    if (positions.patternScrollTop !== undefined) {
      patternScrollTop = normalizeScrollPosition(positions.patternScrollTop);
    }
    if (positions.patternScrollLeft !== undefined) {
      patternScrollLeft = normalizeScrollPosition(positions.patternScrollLeft);
    }
    if (positions.workspaceScrollTop !== undefined) {
      workspaceScrollTop = normalizeScrollPosition(
        positions.workspaceScrollTop
      );
    }
    if (positions.pageScrollTop !== undefined) {
      pageScrollTop = normalizeScrollPosition(positions.pageScrollTop);
    }
    persistSession();
  }

  function currentScrollPositions() {
    return {
      patternScrollTop,
      patternScrollLeft,
      workspaceScrollTop,
      pageScrollTop,
    };
  }

  return {
    get items() {
      return items;
    },
    get filteredItems() {
      return filteredItems();
    },
    get filter() {
      return filter;
    },
    get selectedId() {
      return selectedId;
    },
    get selected() {
      return itemFor(selectedId) ?? null;
    },
    get selectedExample() {
      return exampleFor() ?? null;
    },
    get decisions() {
      return decisions;
    },
    get currentDecision() {
      return decisions[selectedId] ?? null;
    },
    get draftEntries() {
      return draftEntries;
    },
    get draftPattern() {
      return formatFestivalTurnPattern(draftEntries);
    },
    get assignedEntries() {
      return currentTurnContext()?.assignedEntries ?? [];
    },
    get effectiveEntries() {
      return currentTurnContext()?.effectiveEntries ?? [];
    },
    get effectivePattern() {
      return currentTurnContext()?.effectivePattern ?? "";
    },
    get swapMask() {
      return currentTurnContext()?.swapMask ?? [];
    },
    get motifLength() {
      return motifLength;
    },
    get sequence() {
      return sequence;
    },
    get isLoading() {
      return isLoading;
    },
    get validationError() {
      return validationError;
    },
    get scrollPositions() {
      return currentScrollPositions();
    },
    get isEdited() {
      const example = exampleFor();
      return example
        ? formatFestivalTurnPattern(draftEntries) !== example.pattern
        : false;
    },
    initialize,
    select,
    selectExample,
    setFilter,
    setMotifLength,
    toggleTurn,
    reset,
    vote,
    move,
    moveExample,
    setScrollPositions,
  };
}
