/**
 * Spinner Metrics Repository Implementation
 *
 * Persists global spinner generation metrics to Firebase.
 * Uses atomic increment() for concurrent safety across all users.
 */

import type {
  Timestamp} from "firebase/firestore";
import {
  doc,
  updateDoc,
  increment,
  onSnapshot,
  type Unsubscribe
} from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import { firestoreGet, firestoreSet } from "#lib/shared/firestore/index.js";
import { SpinnerMetricsSchema } from "../domain/models/spinner-metrics-schemas";
import type { SpinnerMetrics } from "../domain/models/spinner-models";

const METRICS_COLLECTION = "appMetrics";
const METRICS_DOC_ID = "spinner";
const METRICS_PATH = "appMetrics/spinner";

const DEFAULT_METRICS: SpinnerMetrics = {
  totalGenerated: 0,
  lastGeneratedAt: null,
};

export class SpinnerMetricsRepository {
  private cachedMetrics: SpinnerMetrics | null = null;
  private unsubscribe: Unsubscribe | null = null;

  async getMetrics(): Promise<SpinnerMetrics> {
    if (this.cachedMetrics) {
      return this.cachedMetrics;
    }

    try {
      const result = await firestoreGet(METRICS_COLLECTION, METRICS_DOC_ID, SpinnerMetricsSchema);

      if (result) {
        this.cachedMetrics = {
          totalGenerated: result.totalGenerated,
          lastGeneratedAt: result.lastGeneratedAt,
        };
      } else {
        // Initialize the document if it doesn't exist
        await firestoreSet(
          METRICS_COLLECTION,
          METRICS_DOC_ID,
          { totalGenerated: 0, lastGeneratedAt: null } as Record<string, unknown>,
        );
        this.cachedMetrics = {
          totalGenerated: 0,
          lastGeneratedAt: null,
        };
      }

      return this.cachedMetrics;
    } catch (error) {
      console.error("[SpinnerMetricsRepository] Failed to get metrics:", error);
      // Return default metrics on error
      return {
        totalGenerated: 0,
        lastGeneratedAt: null,
      };
    }
  }

  async incrementGeneratedCount(): Promise<number> {
    try {
      // Ensure document exists first
      const existing = await firestoreGet(METRICS_COLLECTION, METRICS_DOC_ID, SpinnerMetricsSchema);
      if (!existing) {
        await firestoreSet(
          METRICS_COLLECTION,
          METRICS_DOC_ID,
          { totalGenerated: 1, lastGeneratedAt: null } as Record<string, unknown>,
        );
        if (this.cachedMetrics) {
          this.cachedMetrics.totalGenerated = 1;
          this.cachedMetrics.lastGeneratedAt = new Date();
        }
        return 1;
      }

      // Atomic increment (requires direct Firestore updateDoc)
      const firestore = await getFirestoreInstance();
      const docRef = doc(firestore, METRICS_PATH);
      await updateDoc(docRef, {
        totalGenerated: increment(1),
      });

      // Re-read to get the updated value
      const updated = await firestoreGet(METRICS_COLLECTION, METRICS_DOC_ID, SpinnerMetricsSchema);
      const newTotal = updated?.totalGenerated ?? 0;

      if (this.cachedMetrics) {
        this.cachedMetrics.totalGenerated = newTotal;
        this.cachedMetrics.lastGeneratedAt = new Date();
      }

      return newTotal;
    } catch (error) {
      console.error(
        "[SpinnerMetricsRepository] Failed to increment count:",
        error
      );
      throw error;
    }
  }

  subscribe(callback: (metrics: SpinnerMetrics) => void): () => void {
    // Clean up any existing subscription
    if (this.unsubscribe) {
      this.unsubscribe();
    }

    let unsubscribed = false;

    // Single-doc onSnapshot — firestoreListen handles collections, not single docs
    const setupSubscription = async () => {
      try {
        const firestore = await getFirestoreInstance();
        const docRef = doc(firestore, METRICS_PATH);

        this.unsubscribe = onSnapshot(
          docRef,
          (snapshot) => {
            if (unsubscribed) return;

            if (snapshot.exists()) {
              const data = snapshot.data();
              const metrics: SpinnerMetrics = {
                totalGenerated: data.totalGenerated ?? 0,
                lastGeneratedAt: data.lastGeneratedAt
                  ? (data.lastGeneratedAt as Timestamp).toDate()
                  : null,
              };
              this.cachedMetrics = metrics;
              callback(metrics);
            } else {
              this.cachedMetrics = DEFAULT_METRICS;
              callback(DEFAULT_METRICS);
            }
          },
          (error) => {
            console.error(
              "[SpinnerMetricsRepository] Subscription error:",
              error
            );
            if (unsubscribed) return;
            // Surface a fallback so a Firestore failure still updates the UI
            // (last-known metrics if we have them, otherwise zeroed defaults)
            // instead of leaving the consumer hanging on a never-resolving load.
            callback(this.cachedMetrics ?? DEFAULT_METRICS);
          }
        );
      } catch (error) {
        console.error(
          "[SpinnerMetricsRepository] Failed to setup subscription:",
          error
        );
        if (!unsubscribed) {
          callback(this.cachedMetrics ?? DEFAULT_METRICS);
        }
      }
    };

    setupSubscription();

    return () => {
      unsubscribed = true;
      if (this.unsubscribe) {
        this.unsubscribe();
        this.unsubscribe = null;
      }
    };
  }
}
