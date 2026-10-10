import {
  collection,
  doc,
  deleteDoc,
  onSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirestoreInstance } from "#lib/shared/auth/firebase.js";
import { firestoreList, firestoreSet } from "#lib/shared/firestore/index.js";
import { isPermissionDeniedError } from "#lib/shared/auth/utils/is-permission-denied-error.js";
import {
  SpecialArrowPlacementSchema,
  generateSpecialOverrideKey,
  type SpecialArrowPlacement,
  type SpecialArrowPlacementInput,
  type SpecialSuppressionInput,
} from "../domain/special-arrow-placement";
import { createComponentLogger } from "#lib/shared/utils/debug-logger.js";
import { normalizePlacementFrame } from "../../placement/domain/placement-frame";

const logger = createComponentLogger("SpecialArrowPlacementPersister");

const COLLECTION_NAME = "special_arrow_placements";

export class SpecialArrowPlacementPersister {
  private unsubscribe: Unsubscribe | null = null;

  async loadAll(): Promise<SpecialArrowPlacement[]> {
    try {
      const overrides = await firestoreList(
        COLLECTION_NAME,
        SpecialArrowPlacementSchema
      );
      logger.success(`Loaded ${overrides.length} special placement overrides`);
      return overrides as unknown as SpecialArrowPlacement[];
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("permission")) {
        logger.warn("Insufficient permissions — using defaults");
        return [];
      }
      logger.error("Failed to load overrides:", error);
      throw error;
    }
  }

  async save(
    input: SpecialArrowPlacementInput,
    userEmail: string
  ): Promise<void> {
    const placementFrame = normalizePlacementFrame(input.placementFrame);
    const key = generateSpecialOverrideKey({ ...input, placementFrame });
    try {
      await firestoreSet(COLLECTION_NAME, key, {
        key,
        placementFrame,
        oriFolder: input.oriFolder,
        letter: input.letter,
        turnsTuple: input.turnsTuple,
        motionType: input.motionType,
        attributeKey: input.attributeKey,
        propType: input.propType,
        adjustmentX: input.adjustmentX,
        adjustmentY: input.adjustmentY,
        originalX: input.originalX,
        originalY: input.originalY,
        // Written explicitly, never omitted: a real override saved on top of a
        // tombstone at the same key must clear the tombstone, and firestoreSet
        // merges rather than replaces.
        suppressed: false,
        updatedBy: userEmail,
      } as Record<string, unknown>);
      logger.success(
        `Saved special override: ${key} → (${input.adjustmentX}, ${input.adjustmentY})`
      );
    } catch (error) {
      logger.error(`Failed to save override ${key}:`, error);
      throw error;
    }
  }

  /**
   * Write a tombstone that hides the whole Special tier for this key. Adjustments
   * are [0,0] so the "zero = absent" sentinel keeps override readers blind to it;
   * only `suppressed` carries meaning. Clearing one is a plain `delete(key)`.
   */
  async saveSuppression(
    input: SpecialSuppressionInput,
    userEmail: string
  ): Promise<void> {
    const placementFrame = normalizePlacementFrame(input.placementFrame);
    const key = generateSpecialOverrideKey({ ...input, placementFrame });
    try {
      await firestoreSet(COLLECTION_NAME, key, {
        key,
        placementFrame,
        oriFolder: input.oriFolder,
        letter: input.letter,
        turnsTuple: input.turnsTuple,
        motionType: input.motionType,
        attributeKey: input.attributeKey,
        propType: input.propType,
        adjustmentX: 0,
        adjustmentY: 0,
        originalX: input.originalX,
        originalY: input.originalY,
        suppressed: true,
        updatedBy: userEmail,
      } as Record<string, unknown>);
      logger.success(`Suppressed special placement: ${key}`);
    } catch (error) {
      logger.error(`Failed to suppress ${key}:`, error);
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    try {
      const firestore = await getFirestoreInstance();
      const docRef = doc(firestore, COLLECTION_NAME, key);
      await deleteDoc(docRef);
      logger.success(`Deleted special override: ${key}`);
    } catch (error) {
      logger.error(`Failed to delete override ${key}:`, error);
      throw error;
    }
  }

  subscribe(
    onAdd: (override: SpecialArrowPlacement) => void,
    onRemove: (key: string) => void
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
              const key = change.doc.id;
              if (change.type === "added" || change.type === "modified") {
                if (
                  data.placementFrame &&
                  data.letter &&
                  data.motionType &&
                  typeof data.adjustmentX === "number" &&
                  typeof data.adjustmentY === "number"
                ) {
                  onAdd({
                    key,
                    placementFrame: data.placementFrame,
                    oriFolder: data.oriFolder ?? "from_layer1",
                    letter: data.letter,
                    turnsTuple: data.turnsTuple ?? "",
                    motionType: data.motionType,
                    attributeKey: data.attributeKey ?? "",
                    propType: data.propType ?? "staff",
                    adjustmentX: data.adjustmentX,
                    adjustmentY: data.adjustmentY,
                    originalX: data.originalX ?? 0,
                    originalY: data.originalY ?? 0,
                    suppressed: data.suppressed === true,
                    updatedAt: data.updatedAt,
                    updatedBy: data.updatedBy ?? "unknown",
                  });
                }
              } else if (change.type === "removed") {
                onRemove(key);
              }
            });
          },
          (error: unknown) => {
            if (isPermissionDeniedError(error)) {
              // Auth token gone mid-stream (sign-out race) — the repository
              // resubscribes on next sign-in; cached overrides keep serving.
              logger.warn(
                "Subscription permission-denied — paused until next sign-in"
              );
              return;
            }
            logger.error("Subscription error:", error);
          }
        );
      })
      .catch((error: unknown) => {
        logger.error("Failed to initialize subscription:", error);
      });

    return () => {
      if (this.unsubscribe) {
        this.unsubscribe();
        this.unsubscribe = null;
      }
    };
  }
}
