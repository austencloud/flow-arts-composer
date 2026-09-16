/**
 * Layer 1 — the seam-graph closed-walk search.
 *
 * A **seam** is the total placement between two steps (`GridPlacement`, e.g.
 * "beta5"). Every card is a cyclic list of steps, and every step is an edge
 * from one seam to another. A COMBINATION of two cards is a closed walk in the
 * union of those edge sets that uses at least one step from each card — nothing
 * more exotic than that, which is why concatenation ("play all of A, then all
 * of B") and interleaving ("one step of A, one of B, ...") fall out of the same
 * search rather than needing separate code paths.
 *
 * The material the walk may use:
 *   - card A as given (the FRAME — never rotated, mirrored, or hand-swapped,
 *     because the result is expressed in card A's orientation);
 *   - card A's rotation-faithful twin (`buildTwinSource`);
 *   - every distinct variant of card B (`buildVariants` — rotation, mirror,
 *     hand swap, twin, deduped cyclically).
 *
 *   - AMBIENT base-vocabulary steps (ΦΨ bridges and friends), when the caller
 *     supplies an `ambientProvider`. These are not one of the two things being
 *     combined; they are connective tissue that lets two cards sharing no seam
 *     meet at all — AAAA lives in the alpha world and HHHH in the beta world,
 *     and one Ψ across plus one Φ back is the whole difference between
 *     "impossible" and Austen's AAAAΨHHΦ.
 *
 * **Two claims, kept apart.** The reachability precheck below decides
 * `impossible` — a structural, any-length proof that costs O(seams). The walk
 * search decides what EXISTS, and its failure to find something is reported as
 * `searchedToLength` ("nothing of this length or shorter"), never as
 * impossibility. A bounded search cannot prove a negative, and conflating the
 * two would let a budget timeout masquerade as a theorem.
 *
 * **Ambient edges are part of the precheck, not just the search.** The precheck
 * and the DFS must walk the SAME graph, or the engine contradicts its own
 * theorem: a card-material-only precheck would keep proclaiming AAAA + HHHH
 * impossible while the DFS was perfectly able to bridge them. So the ambient
 * pool is built BEFORE the precheck and its edges join the BFS.
 *
 * **Every claim here is CAP-RELATIVE.** The graph is the one the options built:
 * card-B variants only as the liberties admit them, bridge edges only as far as
 * `ambientRunCap` reaches. So `impossible: true` means "no combination under
 * THESE liberties and a bridge of at most N steps" — the strongest thing the
 * engine says, and still not an absolute. `ambientRunCap` rides on the report so
 * a caller can say it out loud. And a pool that could not be built in full (a
 * provider threw) suppresses the claim entirely: a subset graph can only ever
 * manufacture a false proof.
 *
 * **Iterative deepening, not plain DFS.** The walk space is exponential in
 * length, so a depth-first sweep would spend its whole budget on one very deep
 * branch and report the shapes it happened to reach. Deepening by total step
 * count instead makes the emitted order shortest-first — both the useful answer
 * ("what is the SMALLEST way these two cards combine?") and a stable one, and
 * it matches the shortest-first contract Layer 0's `enumerateHybridWords`
 * already settled on.
 */

import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";

import {
  ambientBaseForLetter,
  ambientLetterSet,
} from "../domain/base-sequence-registry";
import {
  COMBINATOR_DEFAULTS,
  type AmbientOptionProvider,
  type CombinationSearchReport,
  type CombinatorOptions,
  type CombinatorTunables,
  type SeamState,
  type WalkBlock,
  type WalkSource,
} from "../domain/types";
import {
  placementLabelsMatchLocations,
  seamEndOf,
  seamOf,
} from "./placement-groups";
import { buildTwinSource, buildVariants } from "./variant-generator";
import {
  classifyAndRank,
  stepContentKey,
  type RawWalk,
} from "./walk-classifier";

/** `CombinatorOptions.maxResultLength` is clamped to this range. */
const MIN_RESULT_LENGTH = 2;
const HARD_MAX_RESULT_LENGTH = 64;

/**
 * `WalkBlock.startStepIndex` for an ambient block. Ambient steps come from a
 * provider, not from a cyclic source, so there is no index for them to have —
 * and -1 makes the absence explicit rather than pretending they entered at 0.
 */
const AMBIENT_START_INDEX = -1;

/** A step of some source that a walk can enter at. */
interface SeamEntry {
  readonly sourceIndex: number;
  readonly stepIndex: number;
}

/** One ambient step, tagged with the roster base it came from. */
interface AmbientOption {
  readonly step: StepData;
  readonly baseWord: string;
}

/** Seam -> the ambient steps that START there. */
type AmbientPool = ReadonlyMap<SeamState, readonly AmbientOption[]>;

/**
 * The pool, plus whether it is the WHOLE pool.
 *
 * `complete: false` means at least one seam's options could not be collected —
 * a provider threw, or answered with something that is not a list. The graph is
 * then a SUBSET of the real one, and a subset can only ever produce a false
 * impossibility proof, never a false result. So an incomplete pool suppresses
 * `impossible` entirely rather than letting a failed lookup masquerade as a
 * theorem about the seam graph.
 */
interface AmbientPoolResult {
  readonly pool: AmbientPool;
  readonly complete: boolean;
}

const EMPTY_AMBIENT_POOL: AmbientPoolResult = Object.freeze({
  pool: Object.freeze(new Map()) as AmbientPool,
  complete: true,
});

/** The one place a `WalkSource`'s step list is read (ambient sources have none). */
function stepsOf(source: WalkSource): readonly StepData[] {
  return source.kind === "ambient" ? [] : source.sequence.steps;
}

function isRotationFaithful(source: WalkSource): boolean {
  return source.kind === "ambient" ? false : source.variant.rotationFaithful;
}

function commitBlock(
  source: WalkSource,
  startStepIndex: number,
  steps: readonly StepData[]
): WalkBlock {
  return {
    sourceId: source.id,
    kind: source.kind,
    startStepIndex,
    steps: [...steps],
    rotationFaithful: isRotationFaithful(source),
    ...(source.kind === "ambient" && { ambientWord: source.ambientWord }),
  };
}

/**
 * One warning per CATEGORY per search. A broken provider fails at every seam it
 * is asked about, and a log line per seam would bury the one that matters —
 * while a single global flag would let a provider throw silently forever after
 * the first bad search, and would hide a label rejection behind an unrelated
 * throw. Per-call, per-category is the pair that stays useful.
 */
function createWarner(): (
  category: string,
  message: string,
  detail?: unknown
) => void {
  const warned = new Set<string>();
  return (category, message, detail) => {
    if (warned.has(category)) return;
    warned.add(category);
    console.warn(`[sequence-combinator] ${message}`, detail ?? "");
  };
}

/**
 * Every ambient step the walk could ever reach, indexed by the seam it starts
 * at — precomputed once, before the DFS, because the provider is async and the
 * search is not.
 *
 * **Why it expands breadth-first.** An ambient RUN of two steps needs options
 * at a seam no card ever visits: Φ leaves beta5 for alpha5, and the Ψ that
 * continues the run starts at alpha5. So the pool seeds from the card seams and
 * then follows its own end seams outward, `maxAmbientRun` hops in total —
 * exactly as far as a legal run can go and no further, which is what keeps a
 * vocabulary-sized provider from being asked about the whole seam space. Each
 * hop's lookups run together, since they are independent by construction.
 *
 * **Every option is re-validated.** A provider is a collaborator, not an
 * authority. A step is kept only when it carries a letter belonging to an
 * ambient-eligible roster base, has both seams, actually STARTS at the seam it
 * was asked about, and carries placement labels its own motion locations agree
 * with. The last two are the load-bearing ones: either would break placement
 * continuity, which is the single invariant everything downstream assumes.
 *
 * **A provider that fails does not get to shrink the answer silently.** A throw
 * or a non-iterable return is caught per seam, warned once, and recorded as an
 * INCOMPLETE pool — which suppresses `impossible` upstream. Losing results to a
 * broken lookup is a degradation; proving a theorem from the smaller graph the
 * failure left behind would be a lie.
 */
async function buildAmbientPool(
  provider: AmbientOptionProvider,
  cardSeams: readonly SeamState[],
  maxHops: number
): Promise<AmbientPoolResult> {
  const pool = new Map<SeamState, readonly AmbientOption[]>();
  if (maxHops <= 0) return { pool, complete: true };

  const eligibleLetters = ambientLetterSet();
  const warn = createWarner();
  const queried = new Set<SeamState>();
  let frontier: SeamState[] = [...new Set(cardSeams)];
  let complete = true;

  for (let hop = 0; hop < maxHops && frontier.length > 0; hop++) {
    const seams = frontier.filter((seam) => {
      if (queried.has(seam)) return false;
      queried.add(seam);
      return true;
    });

    // Independent lookups, so they run together. Order is preserved by
    // `Promise.all`, which is what keeps the pool (and therefore the search)
    // deterministic.
    const answers = await Promise.all(
      seams.map(async (seam) => {
        try {
          const steps = await provider.optionsAt(seam);
          if (!Array.isArray(steps)) {
            complete = false;
            warn(
              "provider",
              `ambient provider returned a non-list for seam ${seam}; ` +
                "treating the pool as incomplete (impossibility is suppressed)"
            );
            return [];
          }
          return steps;
        } catch (error) {
          complete = false;
          warn(
            "provider",
            `ambient provider threw for seam ${seam}; ` +
              "treating the pool as incomplete (impossibility is suppressed)",
            error
          );
          return [];
        }
      })
    );

    const next: SeamState[] = [];
    seams.forEach((seam, i) => {
      const options: AmbientOption[] = [];
      // Two providers (or one provider queried twice) can offer the very same
      // bridge step; the walk would then find every combination twice over.
      const seenContent = new Set<string>();

      for (const step of answers[i]!) {
        const letter = step?.letter;
        if (!letter || !eligibleLetters.has(letter)) continue;

        const from = seamOf(step);
        const to = seamEndOf(step);
        if (!from || !to || from !== seam) continue;
        if (!placementLabelsMatchLocations(step)) {
          warn(
            "labels",
            `ambient step ${letter} at ${from} is labelled ${from}>${to} but ` +
              "its motion locations derive different placements; rejected " +
              "(a mislabelled seam splices into an unperformable sequence)"
          );
          continue;
        }

        const base = ambientBaseForLetter(letter);
        if (!base) continue;

        const content = stepContentKey(step);
        if (seenContent.has(content)) continue;
        seenContent.add(content);

        options.push({ step, baseWord: base.word });
        if (!queried.has(to)) next.push(to);
      }

      if (options.length > 0) pool.set(seam, options);
    });

    frontier = next;
  }

  return { pool, complete };
}

/**
 * One `WalkSource` per ambient base the pool actually offers, in order of first
 * appearance.
 *
 * A base rather than a step is the right grain for a source: consecutive
 * ambient steps of the SAME base are one run of one vocabulary (Φ then Ψ is
 * "some ΦΨ"), and `ambientWord` is what the derivation sentence and the
 * classifier read. A run that changes base changes source, and therefore splits
 * into two blocks — which is the honest partition, because two bases are two
 * ingredients.
 */
function buildAmbientSources(
  pool: AmbientPool,
  firstIndex: number
): { sources: WalkSource[]; indexByWord: Map<string, number> } {
  const sources: WalkSource[] = [];
  const indexByWord = new Map<string, number>();

  for (const options of pool.values()) {
    for (const option of options) {
      if (indexByWord.has(option.baseWord)) continue;
      indexByWord.set(option.baseWord, firstIndex + sources.length);
      sources.push({
        kind: "ambient",
        id: `ambient:${option.baseWord}`,
        ambientWord: option.baseWord,
      });
    }
  }

  return { sources, indexByWord };
}

/**
 * Every seam a walk can STAND at while playing card material — the seeds the
 * ambient pool expands from.
 *
 * Both ends of every step, not just the starts: a walk stands at a step's END
 * seam when it finishes that step, and that is the moment it may reach for a
 * bridge. For a closed card the two sets coincide; for a walk over mixed
 * variants they need not, and missing an end seam would silently make a legal
 * bridge unreachable.
 */
function cardSeamsOf(
  sourceSteps: readonly (readonly StepData[])[]
): SeamState[] {
  const seams: SeamState[] = [];
  for (const steps of sourceSteps) {
    for (const step of steps) {
      const from = seamOf(step);
      const to = seamEndOf(step);
      if (from) seams.push(from);
      if (to) seams.push(to);
    }
  }
  return seams;
}

/**
 * Merge a wrap-split block pair.
 *
 * A closed walk has no start, but the search has to enter it somewhere — and
 * entering in the MIDDLE of a run splits that one run into the walk's first and
 * last blocks. `A[0..2] B[..] A[3..3]` and `A[3..2] B[..]` are the same loop
 * with the same blocks; only the entry differs. Rejoining the pair before the
 * signature is taken means every phase of a walk produces the SAME partition,
 * so the block structure a caller reads is a property of the loop rather than
 * an artefact of where the search happened to start.
 *
 * Only the first/last pair can ever need this: a same-source jump landing where
 * the extend branch would have gone is excluded at the jump site, so no two
 * ADJACENT blocks are ever cyclically contiguous.
 */
function canonicalPartition(
  blocks: readonly WalkBlock[],
  lengthOfSource: ReadonlyMap<string, number>
): readonly WalkBlock[] {
  if (blocks.length < 2) return blocks;

  const first = blocks[0]!;
  const last = blocks[blocks.length - 1]!;
  if (first.sourceId !== last.sourceId) return blocks;

  const length = lengthOfSource.get(first.sourceId) ?? 0;
  if (length === 0) return blocks;
  if (
    (last.startStepIndex + last.steps.length) % length !==
    first.startStepIndex % length
  ) {
    return blocks;
  }

  const merged: WalkBlock = {
    sourceId: first.sourceId,
    kind: first.kind,
    startStepIndex: last.startStepIndex,
    steps: [...last.steps, ...first.steps],
    rotationFaithful: first.rotationFaithful,
  };
  return [merged, ...blocks.slice(1, -1)];
}

/**
 * One key per step: `sourceId#indexWithinSource`, then the lexicographically
 * smallest ROTATION of that list.
 *
 * The rotation is the whole point. The same cyclic combination is reachable
 * from every card-A step it passes through, and a 4-fold symmetric card
 * therefore finds it four times. Keying on the per-STEP list rather than on the
 * blocks makes those phases identical strings, which is what collapses them.
 *
 * Ambient steps have no index to key on — they come from a provider, not from a
 * cyclic source — so they key on CONTENT instead, through the same per-step
 * encoding the classifier dedups results with (`stepContentKey`: letter, both
 * endpoints, and each hand's motion type, rotation direction, turns,
 * orientations and locations).
 *
 * Letter plus seams was not enough. A vocabulary legitimately offers SEVERAL
 * bridges between the same pair of seams — a 0-turn Ψ and a 1-turn Ψ are
 * different material a performer would feel — and keying on the label alone
 * would collapse every combination using one onto the combination using the
 * other, silently deleting real answers.
 */
function canonicalWalkSignature(
  blocks: readonly WalkBlock[],
  lengthOfSource: ReadonlyMap<string, number>
): string {
  const keys: string[] = [];
  for (const block of blocks) {
    if (block.kind === "ambient") {
      for (const step of block.steps) {
        keys.push(`${block.sourceId}#${stepContentKey(step)}`);
      }
      continue;
    }

    const length = lengthOfSource.get(block.sourceId) ?? 0;
    for (let i = 0; i < block.steps.length; i++) {
      const index =
        length > 0
          ? (block.startStepIndex + i) % length
          : block.startStepIndex + i;
      keys.push(`${block.sourceId}#${index}`);
    }
  }

  let best = keys.join(">");
  for (let k = 1; k < keys.length; k++) {
    const rotated = [...keys.slice(k), ...keys.slice(0, k)].join(">");
    if (rotated < best) best = rotated;
  }
  return best;
}

/**
 * Can card-B material be REACHED from card-A material at all?
 *
 * Walk the union seam graph forward from every seam a card-A step starts at. A
 * combination contains at least one step of each card, so it contains a path
 * from some card-A seam to some card-B seam; if the BFS never arrives at one,
 * no such walk exists AT ANY LENGTH. That is the engine's only impossibility
 * proof, and it costs O(seams + steps) rather than an exponential sweep — which
 * is why AAAA + GGGG (alpha world vs beta world) is answered instantly instead
 * of being searched to the budget and reported as an unproven "none found".
 *
 * Empty inputs land here too: a card with no steps contributes no seams, so
 * nothing of its kind is ever reachable.
 *
 * **The ambient pool's edges join the graph.** Bridge material EXPANDS what is
 * reachable, so leaving it out would make the proof unsound in the one
 * direction that matters — claiming impossibility for a pair the search can
 * actually combine. With the pool in, `impossible: true` says something
 * stronger: not even the ambient vocabulary connects these two cards.
 */
function cardBIsReachableFromCardA(
  sources: readonly WalkSource[],
  sourceSteps: readonly (readonly StepData[])[],
  ambientPool: AmbientPool
): boolean {
  const edges = new Map<SeamState, Set<SeamState>>();
  const frontier: SeamState[] = [];
  const cardBSeams = new Set<SeamState>();

  const addEdge = (from: SeamState, to: SeamState): void => {
    const out = edges.get(from);
    if (out) out.add(to);
    else edges.set(from, new Set([to]));
  };

  sourceSteps.forEach((steps, sourceIndex) => {
    const kind = sources[sourceIndex]!.kind;
    for (const step of steps) {
      const from = seamOf(step);
      const to = seamEndOf(step);
      if (!from || !to) continue;

      addEdge(from, to);

      if (kind === "cardA") frontier.push(from);
      if (kind === "cardB") cardBSeams.add(from);
    }
  });

  for (const [from, options] of ambientPool) {
    for (const option of options) {
      const to = seamEndOf(option.step);
      if (to) addEdge(from, to);
    }
  }

  if (cardBSeams.size === 0) return false;

  const seen = new Set<SeamState>(frontier);
  while (frontier.length > 0) {
    const seam = frontier.pop()!;
    if (cardBSeams.has(seam)) return true;
    for (const next of edges.get(seam) ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      frontier.push(next);
    }
  }
  return false;
}

/**
 * Every closed alternating walk over card A and card B, within the requested
 * bounds — or a structural proof that none exists at any length.
 */
export async function findCombinations(
  cardA: SequenceData,
  cardB: SequenceData,
  options: CombinatorOptions = {}
): Promise<CombinationSearchReport> {
  const opts: CombinatorTunables = {
    ...COMBINATOR_DEFAULTS,
    ...options,
    maxResultLength: Math.min(
      Math.max(
        options.maxResultLength ?? COMBINATOR_DEFAULTS.maxResultLength,
        MIN_RESULT_LENGTH
      ),
      HARD_MAX_RESULT_LENGTH
    ),
  };

  /** A structural proof covers every length, so nothing is left unexplored. */
  const proven = (
    gridModeMismatch: boolean,
    ambientRunCap: number
  ): CombinationSearchReport => ({
    results: [],
    impossible: true,
    // Synthesized, not measured: the structural proof holds at every length, so
    // the whole requested depth is covered without a single node being visited.
    searchedToLength: opts.maxResultLength,
    resultsTruncated: false,
    budgetExhausted: false,
    searchComplete: true,
    gridModeMismatch,
    ambientRunCap,
    // A proof is only ever issued from a pool that WAS complete (the caller
    // below checks), and the engine never attempts an auto-wire of its own.
    poolIncomplete: false,
    ambientUnavailable: false,
  });

  // Odd rotations are the only transform that changes grid mode, and the
  // variant generator never emits one — so two cards in different modes share
  // no reachable seam at all. Nothing ambient has been consulted at this point,
  // and nothing needs to be: an odd rotation is the only transform that crosses
  // grid modes and no bridge supplies one.
  if ((cardA.gridMode ?? "diamond") !== (cardB.gridMode ?? "diamond")) {
    return proven(true, 0);
  }

  const frameSource: WalkSource = {
    kind: "cardA",
    id: "A",
    variant: {
      rotation: 0,
      mirrored: false,
      handsSwapped: false,
      rotationFaithful: false,
    },
    sequence: cardA,
  };

  const sources: WalkSource[] = [frameSource];
  if (opts.exploreRotationFaithful) {
    sources.push(await buildTwinSource(cardA));
  }
  sources.push(...(await buildVariants(cardB, opts)));

  // The ambient pool is built HERE — after the card material exists, before the
  // precheck runs — because the precheck has to see the same graph the DFS
  // walks. See `cardBIsReachableFromCardA`.
  const cardSourceSteps = sources.map(stepsOf);
  const provider = options.ambientProvider;
  const ambientRunCap =
    provider && opts.allowAmbient ? Math.max(opts.maxAmbientRun, 0) : 0;

  let ambientPool = EMPTY_AMBIENT_POOL;
  if (provider && ambientRunCap > 0) {
    ambientPool = await buildAmbientPool(
      provider,
      cardSeamsOf(cardSourceSteps),
      ambientRunCap
    );
  }

  const ambient = buildAmbientSources(ambientPool.pool, sources.length);
  sources.push(...ambient.sources);

  // Ambient sources carry no step list of their own, so the card table extends
  // by exactly one empty entry each.
  const sourceSteps = [...cardSourceSteps, ...ambient.sources.map(stepsOf)];

  if (!cardBIsReachableFromCardA(sources, sourceSteps, ambientPool.pool)) {
    // An incomplete pool is a SMALLER graph than the real one, and a smaller
    // graph can only manufacture a false proof. Report the empty result without
    // the theorem: nothing was found, and nothing is claimed about why.
    if (!ambientPool.complete) {
      return {
        results: [],
        impossible: false,
        searchedToLength: 0,
        resultsTruncated: false,
        budgetExhausted: false,
        searchComplete: false,
        gridModeMismatch: false,
        ambientRunCap,
        poolIncomplete: true,
        ambientUnavailable: false,
      };
    }
    return proven(false, ambientRunCap);
  }

  const lengthOfSource = new Map(
    sources.map((source, index) => [source.id, sourceSteps[index]!.length])
  );

  // Seam -> every (source, step) that STARTS there. Steps with no placement
  // never enter the map, so a null seam can never be walked through.
  const entries = new Map<SeamState, SeamEntry[]>();
  sourceSteps.forEach((steps, sourceIndex) => {
    steps.forEach((step, stepIndex) => {
      const seam = seamOf(step);
      if (!seam) return;
      const list = entries.get(seam);
      if (list) list.push({ sourceIndex, stepIndex });
      else entries.set(seam, [{ sourceIndex, stepIndex }]);
    });
  });

  const rawWalks = new Map<string, RawWalk>();
  // How much of the space to LOOK AT, independent of how much of the answer
  // the caller wants to SEE. See `CombinatorTunables.rawWalkCap`.
  const rawWalkCap = Math.max(opts.rawWalkCap, 1);
  let budget = opts.searchBudget;
  let resultsTruncated = false;
  let budgetExhausted = false;
  let stopped = false;

  const record = (blocks: readonly WalkBlock[], totalSteps: number): void => {
    const partition = canonicalPartition(blocks, lengthOfSource);
    const signature = canonicalWalkSignature(partition, lengthOfSource);

    const existing = rawWalks.get(signature);
    if (existing) {
      // The same cyclic walk, entered at a different card-A step. Prefer the
      // representative whose blocks are fewest — with wrap-splits already
      // rejoined the partitions agree, so this only ever settles ties.
      if (partition.length < existing.blocks.length) {
        rawWalks.set(signature, { blocks: partition, totalSteps, signature });
      }
      return;
    }

    rawWalks.set(signature, { blocks: partition, totalSteps, signature });
    if (rawWalks.size >= rawWalkCap) {
      stopped = true;
      resultsTruncated = true;
    }
  };

  /**
   * Card-A material is present from the first step — every anchor is a card-A
   * source — so only card B has to be PROVEN present before a walk may close.
   * That asymmetry is why `usedCardB` has no `usedCardA` twin.
   *
   * @param startSeam   where the walk began; closure means returning here
   * @param currentSeam where the walk stands now
   * @param sourceIndex the source the current (uncommitted) block belongs to
   * @param nextIndex   the next step of that source, cyclically
   * @param blockSteps  steps of the current block, not yet committed
   * @param blockStart  index the current block entered its source at
   * @param blocks      committed blocks
   * @param ambientRun  consecutive ambient steps taken so far, 0 after any card
   *                    step. Counted across the RUN rather than per block, so a
   *                    run that changes base (and therefore splits into two
   *                    blocks) is still capped as one run.
   */
  const visit = (
    limit: number,
    startSeam: SeamState,
    currentSeam: SeamState,
    sourceIndex: number,
    nextIndex: number,
    blockSteps: StepData[],
    blockStart: number,
    blocks: WalkBlock[],
    totalSteps: number,
    usedCardB: boolean,
    ambientRun: number
  ): void => {
    if (stopped) return;
    if (budget <= 0) {
      budgetExhausted = true;
      stopped = true;
      return;
    }
    budget--;

    const source = sources[sourceIndex]!;
    const steps = sourceSteps[sourceIndex]!;

    // `minBlockSize` is a floor on how much of a CARD a block must show — "do
    // not cut this card into single steps". A bridge is not a card, and its
    // length is owned by `maxAmbientRun` instead. Applying the card floor to an
    // ambient block would make a one-step Ψ illegal at minBlockSize 2, which
    // would delete Austen's own AAAAΨHHΦ from the results of a setting that has
    // nothing to say about bridges.
    const blockFloor = source.kind === "ambient" ? 1 : opts.minBlockSize;

    if (
      currentSeam === startSeam &&
      totalSteps >= 2 &&
      // A walk that never left its source is that card played on its own, not
      // a combination — at least one committed block plus the current one.
      blocks.length >= 1 &&
      blockSteps.length >= blockFloor &&
      usedCardB
    ) {
      // Closing off an AMBIENT step is legal: Austen's own AAAAΨHHΦ ends on the
      // Φ that carries the walk back to its start seam. What a bridge can never
      // do is stand in for a card — `usedCardB` is unaffected by ambient
      // material, so both cards are still required to be present.
      record(
        [...blocks, commitBlock(source, blockStart, blockSteps)],
        totalSteps
      );
      if (stopped) return;
    }

    if (totalSteps >= limit) return;

    // Extend: stay in this source and take its next step. Ambient sources have
    // no step list of their own — a run is extended through the pool below.
    let extendIndex = -1;
    if (steps.length > 0) {
      extendIndex = nextIndex % steps.length;
      const nextStep = steps[extendIndex]!;
      const nextEnd = seamEndOf(nextStep);
      if (nextEnd && seamOf(nextStep) === currentSeam) {
        visit(
          limit,
          startSeam,
          nextEnd,
          sourceIndex,
          nextIndex + 1,
          [...blockSteps, nextStep],
          blockStart,
          blocks,
          totalSteps + 1,
          usedCardB || source.kind === "cardB",
          0
        );
        if (stopped) return;
      }
    }

    if (blockSteps.length < blockFloor) return;

    // Jump: hand off to any step sitting at this seam, including one in the
    // SAME source at a different phase. A card that revisits a seam (FALG is at
    // beta5 twice) can legitimately be re-entered elsewhere in its own cycle —
    // forbidding that would silently drop real combinations, and the
    // both-cards close rule already guarantees a result is not one card alone.
    // The single exclusion is the step the extend branch above just took: the
    // same walk, split into two blocks for no reason.
    const committed = commitBlock(source, blockStart, blockSteps);
    for (const entry of entries.get(currentSeam) ?? []) {
      if (
        entry.sourceIndex === sourceIndex &&
        entry.stepIndex === extendIndex
      ) {
        continue;
      }
      const target = sources[entry.sourceIndex]!;
      const step = sourceSteps[entry.sourceIndex]![entry.stepIndex]!;
      const end = seamEndOf(step);
      if (!end) continue;

      visit(
        limit,
        startSeam,
        end,
        entry.sourceIndex,
        entry.stepIndex + 1,
        [step],
        entry.stepIndex,
        [...blocks, committed],
        totalSteps + 1,
        usedCardB || target.kind === "cardB",
        0
      );
      if (stopped) return;
    }

    // Take a bridge step. Consecutive ambient steps of the SAME base extend one
    // block; a change of base commits and starts another, because two bases are
    // two ingredients. `usedCardB` is deliberately untouched — connective
    // tissue is not one of the two things being combined.
    if (ambientRun < ambientRunCap) {
      for (const option of ambientPool.pool.get(currentSeam) ?? []) {
        const end = seamEndOf(option.step);
        if (!end) continue;
        const targetIndex = ambient.indexByWord.get(option.baseWord);
        if (targetIndex === undefined) continue;

        const sameRun = targetIndex === sourceIndex;
        visit(
          limit,
          startSeam,
          end,
          targetIndex,
          0,
          sameRun ? [...blockSteps, option.step] : [option.step],
          sameRun ? blockStart : AMBIENT_START_INDEX,
          sameRun ? blocks : [...blocks, committed],
          totalSteps + 1,
          usedCardB,
          ambientRun + 1
        );
        if (stopped) return;
      }
    }
  };

  // Anchor at every card-A source, identity AND twin. A combination whose only
  // card-A material comes from the twin is a real combination; anchoring solely
  // on the identity source would make it unreachable. Canonical dedup keeps the
  // extra anchors from duplicating anything.
  const anchorSourceIndices = sources
    .map((source, index) => ({ kind: source.kind, index }))
    .filter((entry) => entry.kind === "cardA")
    .map((entry) => entry.index);

  let searchedToLength = 0;
  for (
    let limit = MIN_RESULT_LENGTH;
    limit <= opts.maxResultLength && !stopped;
    limit++
  ) {
    for (const sourceIndex of anchorSourceIndices) {
      if (stopped) break;
      const steps = sourceSteps[sourceIndex]!;
      for (let start = 0; start < steps.length && !stopped; start++) {
        const step = steps[start]!;
        const seam = seamOf(step);
        const end = seamEndOf(step);
        if (!seam || !end) continue;
        visit(
          limit,
          seam,
          end,
          sourceIndex,
          start + 1,
          [step],
          start,
          [],
          1,
          false,
          0
        );
      }
    }
    if (!stopped) searchedToLength = limit;
  }

  const results = await classifyAndRank(
    [...rawWalks.values()],
    cardA,
    cardB,
    sources,
    opts
  );

  return {
    results,
    // Never claimed from an empty bounded search — the precheck above is the
    // only thing that can prove it, and it already returned if it held.
    impossible: false,
    searchedToLength,
    resultsTruncated,
    budgetExhausted,
    searchComplete:
      !resultsTruncated &&
      !budgetExhausted &&
      searchedToLength >= opts.maxResultLength,
    gridModeMismatch: false,
    ambientRunCap,
    // A pool that failed to build still yields sound RESULTS — only the
    // absence claim is unsafe — so the search runs and reports the shortfall
    // rather than bailing.
    poolIncomplete: !ambientPool.complete,
    ambientUnavailable: false,
  };
}
