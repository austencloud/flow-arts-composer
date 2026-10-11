/**
 * Global Arrow Adjustment Persister
 *
 * Handles Firestore persistence for global arrow adjustments.
 * Uses a top-level collection since adjustments are global (not per-user).
 *
 * Collection: global_arrow_adjustments
 * Document ID: {placementFrame}|{oriKey}|{letter}|{turnsTuple}|{arrowKey}
 */

import {
  collection,
  doc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import { firestoreList, firestoreSet } from "#lib/shared/firestore/index.js";
import { isPermissionDeniedError } from "#lib/shared/auth/utils/is-permission-denied-error.js";
import { GlobalArrowAdjustmentSchema } from "../domain/arrow-adjustment-schemas";
import {
  generateAdjustmentKeyString,
  type GlobalArrowAdjustment,
  type GlobalArrowAdjustmentInput,
} from "../domain/global-arrow-adjustment";
import { createComponentLogger } from "#lib/shared/utils/debug-logger.js";
import { normalizePlacementFrame } from "../../placement/domain/placement-frame";

const logger = createComponentLogger("GlobalArrowAdjustmentPersister");

const COLLECTION_NAME = "global_arrow_adjustments";
const HISTORY_COLLECTION_NAME = "global_arrow_adjustment_history";

export type AdjustmentHistoryAction = "save" | "delete" | "reset" | "undo";

export class GlobalArrowAdjustmentPersister {
  private unsubscribe: Unsubscribe | null = null;

  /**
   * Load all global adjustments from Firestore
   */
  async loadAll(): Promise<GlobalArrowAdjustment[]> {
    try {
      const adjustments = await firestoreList(
        COLLECTION_NAME,
        GlobalArrowAdjustmentSchema
      );

      logger.success(`Loaded ${adjustments.length} global adjustments`);
      return adjustments as unknown as GlobalArrowAdjustment[];
    } catch (error) {
      logger.error("Failed to load adjustments:", error);
      throw error;
    }
  }

  /**
   * Save a single adjustment to Firestore
   */
  async save(
    input: GlobalArrowAdjustmentInput,
    userEmail: string,
    previousX: number = 0,
    previousY: number = 0,
    action: AdjustmentHistoryAction = "save"
  ): Promise<void> {
    const placementFrame = normalizePlacementFrame(input.placementFrame);
    const keyString = generateAdjustmentKeyString({
      placementFrame,
      oriKey: input.oriKey,
      letter: input.letter,
      turnsTuple: input.turnsTuple,
      arrowKey: input.arrowKey,
      ...(input.propType && { propType: input.propType }),
      ...(input.otherPropType && { otherPropType: input.otherPropType }),
    });

    try {
      await firestoreSet(COLLECTION_NAME, keyString, {
        placementFrame,
        oriKey: input.oriKey,
        letter: input.letter,
        turnsTuple: input.turnsTuple,
        arrowKey: input.arrowKey,
        ...(input.propType && { propType: input.propType }),
        ...(input.otherPropType && { otherPropType: input.otherPropType }),
        adjustmentX: input.adjustmentX,
        adjustmentY: input.adjustmentY,
        updatedBy: userEmail,
      } as Record<string, unknown>);

      logger.success(
        `Saved adjustment: ${keyString} → (${input.adjustmentX}, ${input.adjustmentY})`
      );

      // Fire-and-forget history write
      this.appendHistory(
        { ...input, placementFrame },
        action,
        input.adjustmentX,
        input.adjustmentY,
        previousX,
        previousY,
        userEmail,
        keyString
      );
    } catch (error) {
      logger.error(`Failed to save adjustment ${keyString}:`, error);
      throw error;
    }
  }

  /**
   * Delete an adjustment from Firestore
   */
  async delete(
    keyString: string,
    previousX: number = 0,
    previousY: number = 0,
    userEmail: string = "unknown",
    historyInput?: {
      placementFrame: string;
      oriKey: string;
      letter: string;
      turnsTuple: string;
      arrowKey: string;
      propType?: string;
      otherPropType?: string;
    }
  ): Promise<void> {
    try {
      const firestore = await getFirestoreInstance();
      const docRef = doc(firestore, COLLECTION_NAME, keyString);
      await deleteDoc(docRef);
      logger.success(`Deleted adjustment: ${keyString}`);

      // Fire-and-forget history write
      if (historyInput) {
        this.appendHistory(
          historyInput,
          "delete",
          0,
          0,
          previousX,
          previousY,
          userEmail,
          keyString
        );
      }
    } catch (error) {
      logger.error(`Failed to delete adjustment ${keyString}:`, error);
      throw error;
    }
  }

  /**
   * Append a history record. Fire-and-forget - never blocks the main operation.
   */
  private async appendHistory(
    input: {
      placementFrame: string;
      oriKey: string;
      letter: string;
      turnsTuple: string;
      arrowKey: string;
      propType?: string;
      otherPropType?: string;
    },
    action: AdjustmentHistoryAction,
    adjustmentX: number,
    adjustmentY: number,
    previousX: number,
    previousY: number,
    userEmail: string,
    sourceKey: string
  ): Promise<void> {
    try {
      const firestore = await getFirestoreInstance();
      const colRef = collection(firestore, HISTORY_COLLECTION_NAME);
      const historyDoc = doc(colRef);

      await setDoc(historyDoc, {
        placementFrame: input.placementFrame,
        oriKey: input.oriKey,
        letter: input.letter,
        turnsTuple: input.turnsTuple,
        arrowKey: input.arrowKey,
        ...(input.propType && { propType: input.propType }),
        ...(input.otherPropType && { otherPropType: input.otherPropType }),
        action,
        adjustmentX,
        adjustmentY,
        previousX,
        previousY,
        timestamp: serverTimestamp(),
        updatedBy: userEmail,
        sourceKey,
      });
    } catch (error) {
      // Fire-and-forget: log but don't throw
      logger.warn("Failed to write adjustment history:", error);
    }
  }

  /**
   * Subscribe to real-time updates from Firestore
   */
  subscribe(
    onAdd: (adjustment: GlobalArrowAdjustment) => void,
    onRemove: (keyString: string) => void
  ): () => void {
    // Clean up any existing subscription
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

    // Start async subscription
    getFirestoreInstance()
      .then((firestoreDb) => {
        const colRef = collection(firestoreDb, COLLECTION_NAME);

        this.unsubscribe = onSnapshot(
          colRef,
          (snapshot) => {
            snapshot.docChanges().forEach((change) => {
              const data = change.doc.data();
              const keyString = change.doc.id;

              if (change.type === "added" || change.type === "modified") {
                if (
                  data.placementFrame &&
                  data.oriKey &&
                  data.letter &&
                  data.turnsTuple &&
                  data.arrowKey &&
                  typeof data.adjustmentX === "number" &&
                  typeof data.adjustmentY === "number"
                ) {
                  onAdd({
                    placementFrame: data.placementFrame,
                    oriKey: data.oriKey,
                    letter: data.letter,
                    turnsTuple: data.turnsTuple,
                    arrowKey: data.arrowKey,
                    ...(data.propType && { propType: data.propType }),
                    ...(data.otherPropType && {
                      otherPropType: data.otherPropType,
                    }),
                    adjustmentX: data.adjustmentX,
                    adjustmentY: data.adjustmentY,
                    updatedAt: data.updatedAt,
                    updatedBy: data.updatedBy ?? "unknown",
                  });
                }
              } else if (change.type === "removed") {
                onRemove(keyString);
              }
            });
          },
          (subscriptionError: unknown) => {
            if (isPermissionDeniedError(subscriptionError)) {
              // Auth token gone mid-stream (sign-out race) — the repository
              // resubscribes on next sign-in; cached adjustments keep serving.
              logger.warn(
                "Subscription permission-denied — paused until next sign-in"
              );
              return;
            }
            logger.error("Subscription error:", subscriptionError);
          }
        );
      })
      .catch((initError: unknown) => {
        logger.error("Failed to initialize subscription:", initError);
      });

    return () => {
      if (this.unsubscribe) {
        this.unsubscribe();
        this.unsubscribe = null;
      }
    };
  }
}
