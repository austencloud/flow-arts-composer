import {
  collection,
  doc,
  deleteDoc,
  getDoc,
  getDocs,
  setDoc,
  runTransaction,
  writeBatch,
  type Firestore,
} from "firebase/firestore";
import { getFirestoreInstance } from "$lib/shared/auth/firebase";
import {
  getDeckReleaseCardPath,
  getDeckReleaseCardsPath,
  getDeckReleaseCounterPath,
  getDeckReleaseManifestPath,
  getDeckReleaseManifestsPath,
} from "$lib/shared/library/data/firestore-paths";
import {
  INSERT_CARD_VERSION,
  type DeckRelease,
  type DeckReleaseCard,
  type DeckReleaseCardData,
  type DeckRecipe,
} from "../domain/models/DeckRelease";
import { normalizeDeckRelease } from "../domain/normalize-deck-release";
import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";

/** Firestore's per-commit write cap. Chunk large decks' card-data writes to it. */
const MAX_BATCH_WRITES = 450;

export async function getNextDeckNumber(): Promise<number> {
  const db = await getFirestoreInstance();
  const counterRef = doc(db, getDeckReleaseCounterPath());
  const snap = await getDoc(counterRef);
  return snap.exists() ? (snap.data().next as number) : 1;
}

export interface ReleaseMeta {
  name: string;
  description: string;
  leftPropType: string;
  rightPropType: string;
}

/**
 * Persist every card's exact reprint data (full SequenceData, plus whether its
 * applied turn pattern closed the loop) to the release's `cards` subcollection,
 * one document per card. Chunked writeBatch calls, NOT part of the release
 * transaction: a deck can have hundreds of cards, well past both the
 * transaction and single-commit write limits.
 */
async function writeDeckReleaseCardData(
  db: Firestore,
  deckNumber: number,
  cardData: DeckReleaseCardData[]
): Promise<void> {
  for (let start = 0; start < cardData.length; start += MAX_BATCH_WRITES) {
    const chunk = cardData.slice(start, start + MAX_BATCH_WRITES);
    const batch = writeBatch(db);
    for (const entry of chunk) {
      batch.set(
        doc(db, getDeckReleaseCardPath(deckNumber, entry.cardIndex)),
        entry
      );
    }
    await batch.commit();
  }
}

export async function releaseDeck(
  cards: DeckReleaseCard[],
  /**
   * The exact rendered SequenceData for each card, positionally matched to
   * `cards` (same length, same order) — whatever produced the deck on screen
   * (catalog draw, gallery pull, TnD generation, or client-side LOOP
   * generation). Saved to the release's `cards` subcollection so a reprint
   * never has to re-read a source that may since have been pruned, deleted,
   * or (for generated LOOP cards) never existed outside this browser.
   * Length mismatch (legacy caller, or an aborted compose) skips the save —
   * the release still completes through the legacy metadata-only path.
   */
  sequences: SequenceData[],
  theme: string,
  notes: string,
  meta: ReleaseMeta,
  recipe?: DeckRecipe
): Promise<DeckRelease> {
  const db = await getFirestoreInstance();
  const counterRef = doc(db, getDeckReleaseCounterPath());

  const { manifest, deckNumber } = await runTransaction(db, async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const deckNumber = counterSnap.exists()
      ? (counterSnap.data().next as number)
      : 1;

    const distribution: Record<number, number> = {};
    for (const card of cards) {
      distribution[card.stepCount] = (distribution[card.stepCount] ?? 0) + 1;
    }

    const manifest: DeckRelease = {
      deckNumber,
      createdAt: new Date().toISOString(),
      name: meta.name,
      description: meta.description,
      theme,
      leftPropType: meta.leftPropType,
      rightPropType: meta.rightPropType,
      cardCount: cards.length,
      notes,
      sequences: cards,
      stepCountDistribution: distribution,
      insertCard: { version: INSERT_CARD_VERSION },
      // Firestore rejects `undefined` fields — only attach recipe when present.
      ...(recipe ? { recipe } : {}),
    };

    const manifestRef = doc(db, getDeckReleaseManifestPath(deckNumber));
    tx.set(manifestRef, manifest);
    tx.set(counterRef, { next: deckNumber + 1 }, { merge: true });

    return { manifest, deckNumber };
  });

  if (cards.length > 0 && sequences.length === cards.length) {
    try {
      const cardData: DeckReleaseCardData[] = sequences.map(
        (sequence, cardIndex) => ({ cardIndex, sequence })
      );
      await writeDeckReleaseCardData(db, deckNumber, cardData);
      await setDoc(
        doc(db, getDeckReleaseManifestPath(deckNumber)),
        { cardDataSaved: true },
        { merge: true }
      );
      manifest.cardDataSaved = true;
    } catch (error) {
      // Best-effort past this point: the release itself already succeeded and
      // deck numbers are permanent (see deleteDeck's note), so we do not roll
      // it back. Reprints fall back to the legacy by-id resolution path,
      // which still works today (the source sequences still exist) — it only
      // loses the durability guarantee this save was meant to add.
      console.error(
        `[deck-release] Deck #${deckNumber} released, but saving exact reprint data failed. ` +
          `Reprints will use the legacy by-id path until this deck is re-released.`,
        error
      );
    }
  } else if (cards.length > 0) {
    console.warn(
      `[deck-release] Deck #${deckNumber}: ${sequences.length} resolved sequences for ${cards.length} cards — skipping exact reprint-data save.`
    );
  }

  return manifest;
}

/**
 * Read a release's saved per-card reprint data, ordered by `cardIndex`.
 * Returns null when the release has no saved card data at all (legacy
 * release — caller should fall back to by-id resolution). Throws naming the
 * missing indices when the manifest claims `cardDataSaved` but the
 * subcollection is incomplete (corrupted/partial write) — a reprint must never
 * silently render fewer cards than the deck actually has.
 */
export async function getDeckReleaseCardData(
  deckNumber: number,
  expectedCardCount: number
): Promise<DeckReleaseCardData[] | null> {
  const db = await getFirestoreInstance();
  const cardsRef = collection(db, getDeckReleaseCardsPath(deckNumber));
  const snapshot = await getDocs(cardsRef);
  if (snapshot.empty) return null;

  const byIndex = new Map<number, DeckReleaseCardData>();
  for (const docSnap of snapshot.docs) {
    const data = docSnap.data() as DeckReleaseCardData;
    byIndex.set(data.cardIndex, data);
  }

  const missing: number[] = [];
  const ordered: DeckReleaseCardData[] = [];
  for (let i = 0; i < expectedCardCount; i++) {
    const entry = byIndex.get(i);
    if (!entry) {
      missing.push(i);
      continue;
    }
    ordered.push(entry);
  }

  if (missing.length > 0) {
    throw new Error(
      `Deck #${deckNumber} is missing saved reprint data for card position(s) ${missing.map((i) => i + 1).join(", ")}. Reprint aborted rather than dropping cards silently.`
    );
  }

  return ordered;
}

/** Patch the editable name/description of an already-released deck. */
export async function updateDeckMeta(
  deckNumber: number,
  patch: { name?: string; description?: string }
): Promise<void> {
  const db = await getFirestoreInstance();
  const manifestRef = doc(db, getDeckReleaseManifestPath(deckNumber));
  await setDoc(manifestRef, patch, { merge: true });
}

/**
 * Every release, archived or not, newest first. Callers that need only the
 * active list (the release-history UI) filter out `archived` themselves —
 * kept unfiltered here so id-pruning (`getAllReleasedSequenceIds`) and QA/
 * parity tooling that walk history by deck number keep seeing archived decks
 * too; archiving hides a deck from the default UI list, it does not erase it.
 */
export async function getAllReleases(): Promise<DeckRelease[]> {
  const db = await getFirestoreInstance();
  const manifestsRef = collection(db, getDeckReleaseManifestsPath());
  const snapshot = await getDocs(manifestsRef);
  return snapshot.docs
    .map((d) => normalizeDeckRelease(d.data() as DeckRelease))
    .sort((a, b) => b.deckNumber - a.deckNumber);
}

/**
 * Soft-delete: hide a released deck from the default list without destroying
 * its manifest or saved card data. Physical cards already printed from this
 * deck keep scanning correctly (short codes point at immutable payloads, not
 * at the release record), and the deck can be restored later.
 */
export async function archiveDeck(deckNumber: number): Promise<void> {
  const db = await getFirestoreInstance();
  await setDoc(
    doc(db, getDeckReleaseManifestPath(deckNumber)),
    { archived: true, archivedAt: new Date().toISOString() },
    { merge: true }
  );
}

/** Undo `archiveDeck` — the deck reappears in the default list. */
export async function restoreDeck(deckNumber: number): Promise<void> {
  const db = await getFirestoreInstance();
  await setDoc(
    doc(db, getDeckReleaseManifestPath(deckNumber)),
    { archived: false, archivedAt: null },
    { merge: true }
  );
}

/**
 * Permanently delete a deck's manifest document. NOT wired to the
 * release-history UI's delete affordance — that now archives (see
 * `archiveDeck`) because every document in this collection represents an
 * already-released deck (draft/generated decks that haven't been released
 * live only in this browser's IndexedDB — see deck-archive-store.ts — and are
 * deleted there via `deleteArchivedDeck`, never through this function). Kept
 * for admin/rollback tooling. The release counter is left untouched — deck
 * numbers are permanent identifiers (content hashes, scan / short codes, and
 * released-id pruning all key off them), so a freed number is never reused.
 *
 * Does NOT delete the manifest's `cards` subcollection (see
 * `getDeckReleaseCardsPath`) — Firestore never cascades subcollection deletes,
 * and this function was left as-is (pre-existing behavior) rather than
 * expanded to also sweep per-card docs. Deleting a deck that has saved card
 * data leaves those documents orphaned (unreachable from `getAllReleases`,
 * but not reclaimed) until someone deletes them directly.
 */
export async function deleteDeck(deckNumber: number): Promise<void> {
  const db = await getFirestoreInstance();
  await deleteDoc(doc(db, getDeckReleaseManifestPath(deckNumber)));
}

export async function getAllReleasedSequenceIds(): Promise<Set<string>> {
  const releases = await getAllReleases();
  const ids = new Set<string>();
  for (const release of releases) {
    for (const card of release.sequences ?? []) {
      ids.add(card.sequenceId);
    }
  }
  return ids;
}
