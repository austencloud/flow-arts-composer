import {
  firestoreSet,
  firestoreDelete,
  firestoreGet,
  firestoreList,
} from "$lib/shared/firestore";
import { getFirestoreInstance } from "$lib/shared/auth/firebase";
import { unpublishPublicSequence } from "$lib/shared/library/services/public-sequence-persister";
import { LabeledSequenceSchema } from "../domain/models/loop-label-schemas";
import type { LabeledSequence } from "./types";

const LOOP_LABELS_COLLECTION = "loop-labels";
const LOCAL_STORAGE_KEY = "loop-labels";

/**
 * Service for Firebase persistence of LOOP labels
 *
 * Sync strategy:
 * - Firebase is the source of truth
 * - localStorage is a cache for fast startup and offline fallback
 * - On load: Fetch from Firebase, merge with localStorage (recover any local-only items)
 * - On save: Write to Firebase FIRST, then update localStorage cache
 *
 * public-index-syncer.ts reads this same "loop-labels" collection keyed by
 * stripWordNotation(word); this repository still keys by the raw word and
 * has no callers today. Whoever reconnects the loop-labeler UI must strip here too.
 */
export class LOOPLabelsFirebaseRepository {
  private syncStatus: "synced" | "syncing" | "error" = "synced";

  async saveLabelToFirebase(
    word: string,
    label: LabeledSequence
  ): Promise<void> {
    try {
      this.syncStatus = "syncing";

      await firestoreSet(
        LOOP_LABELS_COLLECTION,
        word,
        { ...label } as Record<string, unknown>,
        { trackOffline: true, repoName: "loop-labels" },
      );

      this.syncStatus = "synced";
    } catch (error) {
      console.error(`[LOOP Labels] Failed to save "${word}" to Firebase:`, error);
      this.syncStatus = "error";
      throw error;
    }
  }

  async deleteLabelFromFirebase(word: string): Promise<void> {
    try {
      this.syncStatus = "syncing";

      await firestoreDelete(LOOP_LABELS_COLLECTION, word, {
        trackOffline: true,
        repoName: "loop-labels",
      });

      this.syncStatus = "synced";
    } catch (error) {
      console.error(`[LOOP Labels] Failed to delete "${word}" from Firebase:`, error);
      this.syncStatus = "error";
      throw error;
    }
  }

  subscribeToLabels(
    callback: (labels: Map<string, LabeledSequence>) => void
  ): () => void {
    // Load and merge data from Firebase and localStorage
    this.loadAndMergeLabels()
      .then((labels) => {
        callback(labels);
      })
      .catch((error) => {
        console.error("[LOOP Labels] Failed to load from Firebase:", error);
        // Fall back to localStorage only
        const localLabels = this.loadFromLocalStorage();
        callback(localLabels);
      });

    return () => {
      // Cleanup function (no-op for now - could use onSnapshot for real-time)
    };
  }

  /**
   * Load from Firebase and merge with localStorage.
   * Any labels in localStorage but not in Firebase get synced up (recovery).
   */
  private async loadAndMergeLabels(): Promise<Map<string, LabeledSequence>> {
    const firebaseLabels = await this.loadFromFirebase();
    const localLabels = this.loadFromLocalStorage();

    // Find labels in localStorage that aren't in Firebase (need recovery sync)
    const localOnlyWords: string[] = [];
    for (const [word, localLabel] of localLabels) {
      if (!firebaseLabels.has(word)) {
        localOnlyWords.push(word);
        firebaseLabels.set(word, localLabel);
      }
    }

    // Sync any local-only labels to Firebase (recovery)
    if (localOnlyWords.length > 0) {
      for (const word of localOnlyWords) {
        const label = localLabels.get(word)!;
        try {
          await this.saveLabelToFirebase(word, label);
        } catch (error) {
          console.error(
            `[LOOP Labels] Failed to recover-sync "${word}":`,
            error
          );
        }
      }
    }

    // Update localStorage cache with merged data
    this.saveToLocalStorage(firebaseLabels);

    return firebaseLabels;
  }

  saveToLocalStorage(labels: Map<string, LabeledSequence>): void {
    try {
      const obj = Object.fromEntries(labels);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(obj));
    } catch (error) {
      console.error("Failed to save to localStorage:", error);
    }
  }

  loadFromLocalStorage(): Map<string, LabeledSequence> {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return new Map(Object.entries(parsed));
      }
    } catch (error) {
      console.error("Failed to load from localStorage:", error);
    }
    return new Map();
  }

  async syncLocalStorageToFirebase(
    labels: Map<string, LabeledSequence>
  ): Promise<void> {
    try {
      this.syncStatus = "syncing";

      const entries = Array.from(labels.entries());

      let successCount = 0;
      for (const [word, label] of entries) {
        try {
          await firestoreSet(
            LOOP_LABELS_COLLECTION,
            word,
            { ...label } as Record<string, unknown>,
          );
          successCount++;
        } catch (error) {
          console.error(`Failed to sync "${word}":`, error);
        }
      }

      this.syncStatus = successCount === entries.length ? "synced" : "error";
    } catch (error) {
      console.error("Failed to sync to Firebase:", error);
      this.syncStatus = "error";
      throw error;
    }
  }

  /**
   * Load all labels from Firebase
   */
  private async loadFromFirebase(): Promise<Map<string, LabeledSequence>> {
    const items = await firestoreList(LOOP_LABELS_COLLECTION, LabeledSequenceSchema);

    const labels = new Map<string, LabeledSequence>();
    for (const item of items) {
      labels.set(item.word, item as LabeledSequence);
    }

    return labels;
  }

  getSyncStatus(): "synced" | "syncing" | "error" {
    return this.syncStatus;
  }

  /**
   * Delete a sequence from the publicSequences collection
   * Also deletes the associated LOOP label
   */
  async deleteSequenceFromDatabase(
    sequenceId: string,
    word: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      this.syncStatus = "syncing";

      // Route through the unpublish transaction, not a raw document delete
      // (parity-repair spec section 7). A bare delete of publicSequences/{id}
      // left the owner document stamped `visibility: "public"` with no mirror
      // and left the hash claim behind — exactly the drift class the parity
      // repair removes, and a state the phase-4 strict rules will reject.
      // unpublishPublicSequence removes the mirror, releases the owned claim,
      // and clears the owner's projection stamps in one transaction. Rules
      // allow this for the sequence owner or an admin; for anyone else the
      // transaction fails instead of half-deleting.
      await unpublishPublicSequence(await getFirestoreInstance(), sequenceId);

      // Also delete the LOOP label if it exists
      const label = await firestoreGet(
        LOOP_LABELS_COLLECTION,
        word,
        LabeledSequenceSchema,
      );
      if (label) {
        await firestoreDelete(LOOP_LABELS_COLLECTION, word);
      }

      this.syncStatus = "synced";
      return { success: true };
    } catch (error) {
      console.error("Failed to delete sequence from database:", error);
      this.syncStatus = "error";
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }
}
