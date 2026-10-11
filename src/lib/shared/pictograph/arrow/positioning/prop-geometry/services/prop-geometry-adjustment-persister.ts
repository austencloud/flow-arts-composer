/**
 * Prop Geometry Adjustment Persister
 *
 * Firestore persistence for prop geometry adjustments.
 * Collection: prop_geometry_adjustments
 * Document ID: the full 9-part key string
 */

import { collection, onSnapshot, type Unsubscribe } from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import {
  firestoreList,
  firestoreSet,
  firestoreDelete,
} from "#lib/shared/firestore/index.js";
import { PropGeometryAdjustmentSchema } from "../domain/prop-geometry-schemas";
import {
  generatePropGeometryKeyString,
  type PropGeometryAdjustment,
  type PropGeometryAdjustmentInput,
} from "../domain/prop-geometry-adjustment";
import { createComponentLogger } from "#lib/shared/utils/debug-logger.js";
import { normalizePlacementFrame } from "../../placement/domain/placement-frame";

const logger = createComponentLogger("PropGeometryAdjustmentPersister");

const COLLECTION_NAME = "prop_geometry_adjustments";

export class PropGeometryAdjustmentPersister {
  private unsubscribe: Unsubscribe | null = null;

  async loadAll(): Promise<PropGeometryAdjustment[]> {
    try {
      const adjustments = await firestoreList(
        COLLECTION_NAME,
        PropGeometryAdjustmentSchema
      );

      logger.success(`Loaded ${adjustments.length} prop geometry adjustments`);
      return adjustments as unknown as PropGeometryAdjustment[];
    } catch (error) {
      // Permissions errors are expected when Firestore rules don't allow
      // public reads on this collection. Fall back to empty data gracefully.
      const isPermissionError =
        error instanceof Error &&
        (error.message.includes("Missing or insufficient permissions") ||
          error.message.includes("permission-denied"));

      if (isPermissionError) {
        logger.warn(
          "Prop geometry adjustments not accessible (permissions). Using defaults."
        );
        return [];
      }

      logger.error("Failed to load prop geometry adjustments:", error);
      throw error;
    }
  }

  async save(
    input: PropGeometryAdjustmentInput,
    userEmail: string
  ): Promise<void> {
    const placementFrame = normalizePlacementFrame(input.placementFrame);
    const keyString = generatePropGeometryKeyString({
      placementFrame,
      propType: input.propType,
      otherPropType: input.otherPropType,
      positionType: input.positionType,
      endOrientation: input.endOrientation,
      otherEndOrientation: input.otherEndOrientation,
      motionType: input.motionType,
      turns: input.turns,
      arrowColor: input.arrowColor,
    });

    try {
      await firestoreSet(COLLECTION_NAME, keyString, {
        placementFrame,
        propType: input.propType,
        otherPropType: input.otherPropType,
        positionType: input.positionType,
        endOrientation: input.endOrientation,
        otherEndOrientation: input.otherEndOrientation,
        motionType: input.motionType,
        turns: input.turns,
        arrowColor: input.arrowColor,
        adjustmentX: input.adjustmentX,
        adjustmentY: input.adjustmentY,
        updatedBy: userEmail,
      } as Record<string, unknown>);

      logger.success(
        `Saved prop geometry: ${keyString} → (${input.adjustmentX}, ${input.adjustmentY})`
      );
    } catch (error) {
      logger.error(`Failed to save prop geometry ${keyString}:`, error);
      throw error;
    }
  }

  async delete(keyString: string): Promise<void> {
    try {
      await firestoreDelete(COLLECTION_NAME, keyString);
      logger.success(`Deleted prop geometry: ${keyString}`);
    } catch (error) {
      logger.error(`Failed to delete prop geometry ${keyString}:`, error);
      throw error;
    }
  }

  subscribe(
    onAdd: (adjustment: PropGeometryAdjustment) => void,
    onRemove: (keyString: string) => void
  ): () => void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }

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
                  data.propType &&
                  data.positionType &&
                  typeof data.adjustmentX === "number" &&
                  typeof data.adjustmentY === "number"
                ) {
                  onAdd({
                    placementFrame: data.placementFrame,
                    propType: data.propType,
                    otherPropType: data.otherPropType ?? "*",
                    positionType: data.positionType,
                    endOrientation: data.endOrientation,
                    otherEndOrientation: data.otherEndOrientation,
                    motionType: data.motionType,
                    turns: String(data.turns),
                    arrowColor: data.arrowColor ?? "*",
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
            const isPermissionError =
              subscriptionError instanceof Error &&
              (subscriptionError.message.includes(
                "Missing or insufficient permissions"
              ) ||
                subscriptionError.message.includes("permission-denied"));

            if (isPermissionError) {
              logger.warn(
                "Prop geometry subscription not accessible (permissions). Real-time updates disabled."
              );
            } else {
              logger.error("Subscription error:", subscriptionError);
            }
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
