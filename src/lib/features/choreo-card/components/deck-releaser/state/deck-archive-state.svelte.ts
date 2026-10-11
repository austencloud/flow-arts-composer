import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import type { DeckReleaseCard } from "../../../domain/models/DeckRelease";
import type {
  ArchivedDeckMeta,
  ArchivedDeckPayload,
} from "../../../services/deck-archive-store";
import type { DeckReleaserState } from "./deck-releaser-state.svelte";

export interface DeckArchiveStateDependencies {
  list(): Promise<ArchivedDeckMeta[]>;
  load(refNumber: number): Promise<ArchivedDeckPayload | null>;
  save(meta: ArchivedDeckMeta, payload: ArchivedDeckPayload): Promise<void>;
  delete(refNumber: number): Promise<void>;
  getWords(): string[];
  nowIso(): string;
}

export function createDeckArchiveState(
  deck: DeckReleaserState,
  deps: DeckArchiveStateDependencies
) {
  let decks = $state<ArchivedDeckMeta[]>([]);
  let isLoading = $state(true);

  async function refresh(): Promise<void> {
    decks = await deps.list();
    isLoading = false;
  }

  function buildMeta(): ArchivedDeckMeta {
    return {
      refNumber: deck.referenceNumber,
      createdAt: deps.nowIso(),
      deckMode: deck.deckMode,
      loopType: [...deck.selectedLoopTypes][0],
      length: deck.selectedLength,
      level: [...deck.selectedLevels][0],
      period: [...deck.selectedSliceTypes][0],
      prop: String(deck.leftPropType),
      cardCount: deck.cards.length,
      words: deps.getWords(),
    };
  }

  function archiveCurrent(): void {
    if (
      deck.viewingRelease ||
      deck.cards.length === 0 ||
      deck.referenceNumber <= 0
    ) {
      return;
    }
    const payload: ArchivedDeckPayload = {
      refNumber: deck.referenceNumber,
      cards: $state.snapshot(deck.cards) as DeckReleaseCard[],
      sequences: $state.snapshot(deck.sequences) as SequenceData[],
    };
    void deps.save(buildMeta(), payload).then(refresh);
  }

  async function open(refNumber: number): Promise<boolean> {
    const payload = await deps.load(refNumber);
    if (!payload) return false;

    ++deck.drawGeneration;
    const meta = decks.find((candidate) => candidate.refNumber === refNumber);
    deck.viewingRelease = null;
    deck.name = "";
    deck.referenceNumber = refNumber;
    deck.sequences = payload.sequences;
    deck.cards = payload.cards;
    if (meta) {
      deck.deckMode = meta.deckMode;
      if (meta.loopType) deck.selectedLoopTypes = new Set([meta.loopType]);
      if (meta.length) deck.selectedLength = meta.length;
      if (meta.level) deck.selectedLevels = new Set([meta.level]);
      if (meta.period) {
        deck.selectedSliceTypes = new Set([
          meta.period as "halved" | "quartered",
        ]);
      }
      if (meta.prop) deck.selectedPropType = meta.prop as PropType;
    }
    deck.step = "review";
    deck.persist();
    return true;
  }

  async function remove(refNumber: number): Promise<void> {
    await deps.delete(refNumber);
    await refresh();
  }

  return {
    get decks() {
      return decks;
    },
    get isLoading() {
      return isLoading;
    },
    refresh,
    load: deps.load,
    archiveCurrent,
    open,
    remove,
  };
}

export type DeckArchiveState = ReturnType<typeof createDeckArchiveState>;
