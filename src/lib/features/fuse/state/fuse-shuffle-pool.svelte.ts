/**
 * One side of the Fuse discovery deck.
 *
 * Loading is staged before it touches the visible card. The parent Fuse state
 * can therefore prepare a new source and its combined preview, then commit
 * both in the same update. This is what keeps a path name from getting ahead
 * of the animation the user is looking at.
 */

import type { PublicSequencesLoader } from "#lib/shared/browse/services/public-sequences-loader.js";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";

export type FuseSide = "left" | "right";

export type FuseBrowseLoader = Pick<
  PublicSequencesLoader,
  "loadSequenceMetadata" | "loadFullSequenceData"
>;

export interface StagedFuseCandidate {
  sequence: SequenceData;
  poolPosition: number;
  nextCursor: number;
}

export interface FuseHistoryEntry {
  sequence: SequenceData;
  poolPosition: number;
}

interface FuseShufflePoolDeps {
  browseLoader: FuseBrowseLoader;
  side: FuseSide;
  random?: () => number;
}

function sequenceLength(sequence: SequenceData): number {
  if (sequence.steps.length > 0) return sequence.steps.length;
  return sequence.sequenceLength ?? 0;
}

function hasRequiredSideData(sequence: SequenceData, side: FuseSide): boolean {
  return side === "left" ? !!sequence.leftSoloProp : !!sequence.rightSoloProp;
}

function shuffledCopy(
  sequences: readonly SequenceData[],
  random: () => number
): SequenceData[] {
  const shuffled = [...sequences];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target]!, shuffled[index]!];
  }
  return shuffled;
}

export function createFuseShufflePool({
  browseLoader,
  side,
  random = Math.random,
}: FuseShufflePoolDeps) {
  let pool = $state<SequenceData[]>([]);
  let requestedLength = $state(0);
  let nextCursor = $state(0);
  let currentItem = $state<SequenceData | null>(null);
  let currentPosition = $state(0);
  let history = $state<FuseHistoryEntry[]>([]);
  let historyIndex = $state(-1);
  let revision = $state(0);

  // The candidate the next Shuffle will land on, staged ahead of the tap. The
  // in-flight scan is cached so the tap consumes a warm result instead of
  // hitting the network; the resolved sequence is exposed so the card can
  // pre-render its pictographs. Both are invalidated on any cursor change.
  let staged: Promise<StagedFuseCandidate | null> | null = null;
  let stagedItem = $state<SequenceData | null>(null);
  let stageGeneration = 0;

  function reset(sequences: readonly SequenceData[], length: number): void {
    requestedLength = length;
    pool = shuffledCopy(
      sequences.filter((sequence) => sequenceLength(sequence) === length),
      random
    );
    nextCursor = 0;
    currentItem = null;
    currentPosition = 0;
    history = [];
    historyIndex = -1;
    clearStaged();
  }

  function clearStaged(): void {
    stageGeneration += 1;
    staged = null;
    stagedItem = null;
  }

  async function hydrateCandidate(
    candidate: SequenceData
  ): Promise<SequenceData | null> {
    if (candidate.steps.length > 0 && hasRequiredSideData(candidate, side)) {
      return candidate;
    }

    const hydrated = await browseLoader.loadFullSequenceData(
      candidate.word || candidate.name,
      candidate.id
    );
    return hydrated;
  }

  /**
   * Find the next usable entry without changing the visible source. The deck
   * cursor advances only when the parent commits the returned candidate.
   */
  async function findNext(): Promise<StagedFuseCandidate | null> {
    if (pool.length === 0) return null;

    const startCursor = nextCursor;
    for (let offset = 0; offset < pool.length; offset += 1) {
      const poolIndex = (startCursor + offset) % pool.length;
      const candidate = pool[poolIndex]!;
      const hydrated = await hydrateCandidate(candidate);

      if (
        !hydrated ||
        sequenceLength(hydrated) !== requestedLength ||
        hydrated.steps.length === 0 ||
        !hasRequiredSideData(hydrated, side)
      ) {
        continue;
      }

      return {
        sequence: hydrated,
        poolPosition: poolIndex + 1,
        nextCursor: (poolIndex + 1) % pool.length,
      };
    }

    return null;
  }

  /**
   * Stage the next candidate, consuming the prefetched scan when one is warm.
   * The staged promise was computed against the current cursor (prefetchNext is
   * always called straight after a commit), so it is valid until the next
   * commit consumes it.
   */
  function stageNext(): Promise<StagedFuseCandidate | null> {
    const pending = staged ?? findNext();
    clearStaged();
    return pending;
  }

  /**
   * Warm the next Shuffle: run the scan (hydrating its network data) now and
   * cache both the promise and, once resolved, the sequence — so the tap is a
   * cache hit and the card can pre-render the pictographs ahead of the swap.
   */
  function prefetchNext(): void {
    if (pool.length === 0) return;
    const generation = ++stageGeneration;
    const pending = findNext();
    staged = pending;
    pending
      .then((candidate) => {
        if (generation === stageGeneration) {
          stagedItem = candidate?.sequence ?? null;
        }
      })
      .catch(() => {
        if (generation === stageGeneration) stagedItem = null;
      });
  }

  function commit(candidate: StagedFuseCandidate, resetHistory: boolean): void {
    nextCursor = candidate.nextCursor;
    currentItem = candidate.sequence;
    currentPosition = candidate.poolPosition;

    if (resetHistory) {
      history = [
        {
          sequence: candidate.sequence,
          poolPosition: candidate.poolPosition,
        },
      ];
      historyIndex = 0;
    } else {
      const retainedHistory = history.slice(0, historyIndex + 1);
      history = [
        ...retainedHistory,
        {
          sequence: candidate.sequence,
          poolPosition: candidate.poolPosition,
        },
      ];
      historyIndex = history.length - 1;
    }

    revision += 1;
  }

  function peekPrevious(): FuseHistoryEntry | null {
    return historyIndex > 0 ? (history[historyIndex - 1] ?? null) : null;
  }

  function commitPrevious(): SequenceData | null {
    const previous = peekPrevious();
    if (!previous) return null;

    historyIndex -= 1;
    currentItem = previous.sequence;
    currentPosition = previous.poolPosition;
    revision += 1;
    return previous.sequence;
  }

  /**
   * Place an already-hydrated sequence as the visible source, used when the
   * parent restores a persisted selection on mount. The sequence may or may not
   * be present in the freshly shuffled pool; when it is, the deck cursor is
   * aligned to it so a following Shuffle continues from the right spot,
   * otherwise the next Shuffle simply scans from the top of the pool. History is
   * reset to just this entry, matching a fresh initial commit.
   */
  function commitRestored(sequence: SequenceData): void {
    const poolIndex = pool.findIndex((candidate) =>
      sequence.id
        ? candidate.id === sequence.id
        : !!sequence.word && candidate.word === sequence.word
    );
    const poolPosition = poolIndex >= 0 ? poolIndex + 1 : 0;

    currentItem = sequence;
    currentPosition = poolPosition;
    nextCursor =
      poolIndex >= 0 && pool.length > 0 ? (poolIndex + 1) % pool.length : 0;
    history = [{ sequence, poolPosition }];
    historyIndex = 0;
    clearStaged();
    revision += 1;
  }

  return {
    get sequence() {
      return currentItem;
    },
    get poolSize() {
      return pool.length;
    },
    get poolPosition() {
      return currentPosition;
    },
    get canGoBack() {
      return historyIndex > 0;
    },
    get revision() {
      return revision;
    },
    get nextSequence() {
      return stagedItem;
    },
    reset,
    stageNext,
    prefetchNext,
    commit,
    peekPrevious,
    commitPrevious,
    commitRestored,
  };
}

export type FuseShufflePool = ReturnType<typeof createFuseShufflePool>;
