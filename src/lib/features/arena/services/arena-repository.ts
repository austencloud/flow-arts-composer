/**
 * ArenaRepository
 *
 * Firestore implementation for arena data persistence.
 * Collections:
 *   arenaRatings/{entryId}       - ArenaRating documents
 *   arenaVotes/{autoId}          - Individual vote records
 *   arenaSnapshots/{YYYY-MM-DD}  - Daily rank snapshots
 */

import type { ArenaRating, ArenaVote, ArenaLeaderboardEntry, ArenaUserStats, ArenaEntry, } from "../domain/models/arena-models";
import type { MatchupCandidate } from "./types";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
import { hydrate } from "$lib/shared/foundation/services/sequence-hydrator";
import { normalizeLegacySequence } from "@tka/tka-types";
import {
  INITIAL_MU,
  INITIAL_PHI,
  INITIAL_SIGMA,
} from "../domain/constants/arena-constants";
import { z } from "zod";
import {
  firestoreGet,
  firestoreList,
  firestoreSet,
} from "$lib/shared/firestore";
import { ArenaRatingSchema, ArenaVoteSchema } from "../domain/models/arena-schemas";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  writeBatch,
  Timestamp,
} from "firebase/firestore";
import { getFirestoreInstance } from "$lib/shared/auth/firebase";

const RATINGS_COLLECTION = "arenaRatings";
const VOTES_COLLECTION = "arenaVotes";
const SNAPSHOTS_COLLECTION = "arenaSnapshots";
const PUBLIC_SEQUENCES_COLLECTION = "publicSequences";

export async function loadPool(): Promise<MatchupCandidate[]> {
  const firestore = await getFirestoreInstance();
  const publicSnap = await getDocs(collection(firestore, PUBLIC_SEQUENCES_COLLECTION));
  const candidates: MatchupCandidate[] = [];

  // publicSequences is a lightweight index - steps live in the source doc.
  // Build entries from the index, then batch-fetch full data via sourceRef.

  for (const seqDoc of publicSnap.docs) {
    const raw = seqDoc.data() as Record<string, unknown>;
    const word = raw.word as string | undefined;
    if (!word) continue;

    // Arena is loop-only - skip sequences without a labeled loop type
    const loopType = raw.loopType as string | null | undefined;
    if (!loopType) continue;

    const entry: ArenaEntry = {
      id: seqDoc.id,
      kind: "sequence",
      word,
      ownerId: (raw.ownerId as string) ?? "",
      ownerDisplayName: raw.ownerDisplayName as string | undefined,
    };

    const rating = await getOrCreateRating(entry);

    // Build lightweight SequenceData from the index document.
    // Steps are NOT stored in publicSequences - full data is fetched
    // on demand via sourceRef when a matchup is presented.
    const data: SequenceData = {
      id: seqDoc.id,
      name: (raw.name as string) ?? "",
      word,
      steps: [],
      thumbnails: (raw.thumbnails as readonly string[]) ?? [],
      sequenceLength: raw.sequenceLength as number | undefined,
      level: raw.level as number | undefined,
      difficultyLevel: raw.difficultyLevel as string | undefined,
      isFavorite: false,
      isCircular: true, // Arena only loads loops
      loopType: loopType as SequenceData["loopType"],
      tags: (raw.tags as readonly string[]) ?? [],
      metadata: {},
      ownerId: (raw.ownerId as string) ?? "",
      ownerDisplayName: raw.ownerDisplayName as string | undefined,
    };

    candidates.push({
      entry,
      rating,
      data,
      sourceRef: raw.sourceRef as string | undefined,
    });
  }

  return candidates;
}

export async function getRating(entryId: string): Promise<ArenaRating | null> {
  const parsed = await firestoreGet(RATINGS_COLLECTION, entryId, ArenaRatingSchema);
  if (!parsed) return null;
  return parsed as ArenaRating;
}

export async function saveRatings(winner: ArenaRating, loser: ArenaRating): Promise<void> {
  const firestore = await getFirestoreInstance();
  const batch = writeBatch(firestore);
  batch.set(
    doc(firestore, RATINGS_COLLECTION, winner.entryId),
    serializeRating(winner)
  );
  batch.set(
    doc(firestore, RATINGS_COLLECTION, loser.entryId),
    serializeRating(loser)
  );
  await batch.commit();
}

export async function saveVote(vote: ArenaVote): Promise<void> {
  await firestoreSet(VOTES_COLLECTION, null, {
    ...vote,
    timestamp: Timestamp.fromDate(vote.timestamp),
  });
}

export async function loadLeaderboard(limit: number): Promise<ArenaLeaderboardEntry[]> {
  const ratings = await firestoreList(RATINGS_COLLECTION, ArenaRatingSchema, {
    orderBy: [{ field: "displayRating", direction: "desc" }],
    limit,
  });
  const previousRanks = await loadPreviousSnapshot();

  return ratings.map((parsed, idx) => {
    const rating = parsed as ArenaRating;
    const rank = idx + 1;
    const prevRank = previousRanks.get(rating.entryId);
    const rankChange = prevRank != null ? prevRank - rank : 0;

    return {
      rank,
      rating,
      entry: {
        id: rating.entryId,
        kind: rating.entryKind,
        word: rating.word,
        ownerId: rating.ownerId,
      },
      rankChange,
    };
  });
}

export async function loadUserStats(userId: string): Promise<ArenaUserStats> {
  const votes = await firestoreList(VOTES_COLLECTION, ArenaVoteSchema, {
    where: [{ field: "voterId", op: "==", value: userId }],
    orderBy: [{ field: "timestamp", direction: "desc" }],
  });

  if (votes.length === 0) {
    return {
      totalVotes: 0,
      currentStreak: 0,
      longestStreak: 0,
      firstVoteDate: null,
    };
  }

  const totalVotes = votes.length;
  const firstVoteDate = votes[votes.length - 1]?.timestamp ?? null;

  return {
    totalVotes,
    currentStreak: 0, // Computed from session state, not persisted
    longestStreak: 0,
    firstVoteDate,
  };
}

export async function loadRecentVotePairs(userId: string, limit: number): Promise<Set<string>> {
  const votes = await firestoreList(VOTES_COLLECTION, ArenaVoteSchema, {
    where: [{ field: "voterId", op: "==", value: userId }],
    orderBy: [{ field: "timestamp", direction: "desc" }],
    limit,
  });
  const pairs = new Set<string>();

  for (const vote of votes) {
    const a = vote.winnerEntryId;
    const b = vote.loserEntryId;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    pairs.add(key);
  }

  return pairs;
}

export async function saveDailySnapshot(entries: ArenaLeaderboardEntry[]): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const rankMap: Record<string, number> = {};
  for (const entry of entries) {
    rankMap[entry.entry.id] = entry.rank;
  }
  await firestoreSet(SNAPSHOTS_COLLECTION, today, {
    ranks: rankMap,
  });
}

const SnapshotSchema = z.object({
  ranks: z.record(z.string(), z.number()),
}).passthrough();

export async function loadPreviousSnapshot(): Promise<Map<string, number>> {
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const parsed = await firestoreGet(SNAPSHOTS_COLLECTION, yesterday, SnapshotSchema);
  const map = new Map<string, number>();
  if (!parsed) return map;

  for (const [id, rank] of Object.entries(parsed.ranks)) {
    map.set(id, rank);
  }
  return map;
}

export async function loadFullSequenceData(sourceRef: string): Promise<SequenceData | null> {
  const firestore = await getFirestoreInstance();
  try {
    const fullDoc = await getDoc(doc(firestore, sourceRef));
    if (!fullDoc.exists()) return null;

    // Normalize legacy blue/red and position/placement keys before picking
    // fields off the raw Firestore doc, so a document written before either
    // rename shipped still resolves startPlacement/startingPlacement.
    const raw = normalizeLegacySequence(fullDoc.data());
    const mapped: SequenceData = {
      id: fullDoc.id,
      name: (raw.name as string) ?? "",
      displayName: raw.displayName as string | undefined,
      word: (raw.word as string) ?? "",
      steps: (raw.steps as SequenceData["steps"]) ?? (raw.beats as SequenceData["steps"]) ?? [],
      startPlacement: raw.startPlacement as SequenceData["startPlacement"],
      startingPlacement: raw.startingPlacement as SequenceData["startingPlacement"],
      startingPlacementGroup: raw.startingPlacementGroup as SequenceData["startingPlacementGroup"],
      thumbnails: (raw.thumbnails as readonly string[]) ?? [],
      sequenceLength: raw.sequenceLength as number | undefined,
      level: raw.level as number | undefined,
      gridMode: raw.gridMode as SequenceData["gridMode"],
      isFavorite: false,
      isCircular: (raw.isCircular as boolean) ?? false,
      loopType: raw.loopType as SequenceData["loopType"],
      difficultyLevel: raw.difficultyLevel as string | undefined,
      tags: (raw.tags as readonly string[]) ?? [],
      metadata: (raw.metadata as Record<string, unknown>) ?? {},
      ownerId: raw.ownerId as string | undefined,
      ownerDisplayName: raw.ownerDisplayName as string | undefined,
      // Pass through compositional fields from Firestore
      leftSoloProp: raw.leftSoloProp as SequenceData["leftSoloProp"],
      rightSoloProp: raw.rightSoloProp as SequenceData["rightSoloProp"],
      stepPairings: raw.stepPairings as SequenceData["stepPairings"],
    };

    // Hydrate: re-derive steps from compositional fields if present
    return hydrate(mapped);
  } catch (err) {
    console.error(`[Arena] Failed to load full sequence from ${sourceRef}:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Module-private helpers
// ---------------------------------------------------------------------------

async function getOrCreateRating(entry: ArenaEntry): Promise<ArenaRating> {
  const existing = await getRating(entry.id);
  if (existing) return existing;

  const now = new Date();
  const rating: ArenaRating = {
    entryId: entry.id,
    entryKind: entry.kind,
    mu: INITIAL_MU,
    phi: INITIAL_PHI,
    sigma: INITIAL_SIGMA,
    displayRating: INITIAL_MU - 2 * INITIAL_PHI,
    totalMatchups: 0,
    wins: 0,
    losses: 0,
    peakRating: INITIAL_MU - 2 * INITIAL_PHI,
    peakRatingDate: now,
    lastMatchAt: now,
    enteredPoolAt: now,
    word: entry.word,
    ownerId: entry.ownerId,
  };

  await firestoreSet(RATINGS_COLLECTION, entry.id, serializeRating(rating));
  return rating;
}

function serializeRating(r: ArenaRating): Record<string, unknown> {
  return {
    ...r,
    peakRatingDate: Timestamp.fromDate(r.peakRatingDate),
    lastMatchAt: Timestamp.fromDate(r.lastMatchAt),
    enteredPoolAt: Timestamp.fromDate(r.enteredPoolAt),
  };
}
