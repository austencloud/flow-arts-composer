/**
 * Prop Geometry Adjustment Repository
 *
 * Coordinates state and persistence for prop geometry adjustments.
 * Mirrors GlobalArrowAdjustmentRepository but for the letter-free tier.
 */

import {
  generatePropGeometryKeyString,
  parsePropGeometryKeyString,
  type PropGeometryAdjustment,
  type PropGeometryAdjustmentInput,
  type PropGeometryKey,
} from "../domain/prop-geometry-adjustment";
import type { CascadingPropGeometryResult } from "./types";
import type { PropGeometryAdjustmentPersister } from "./prop-geometry-adjustment-persister";
import {
  createPropGeometryAdjustmentState,
  type PropGeometryAdjustmentState,
} from "../state/prop-geometry-adjustment-state.svelte";
import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
import { createComponentLogger } from "#lib/shared/utils/debug-logger.js";
import type { Timestamp } from "firebase/firestore";
import { normalizePlacementFrame } from "../../placement/domain/placement-frame";
import { normalizeLegacyHandSide } from "@tka/tka-types";

const logger = createComponentLogger("PropGeometryAdjustmentRepository");
const ADMIN_EMAIL = "austencloud@gmail.com";

function normalizeArrowHand(value: string): string {
  return normalizeLegacyHandSide(value) ?? value;
}

function normalizeKey(key: PropGeometryKey): PropGeometryKey {
  return { ...key, arrowColor: normalizeArrowHand(key.arrowColor) };
}

function normalizeInput(
  input: PropGeometryAdjustmentInput
): PropGeometryAdjustmentInput {
  return { ...input, arrowColor: normalizeArrowHand(input.arrowColor) };
}

function normalizeAdjustment(
  adjustment: PropGeometryAdjustment
): PropGeometryAdjustment {
  return {
    ...adjustment,
    arrowColor: normalizeArrowHand(adjustment.arrowColor),
  };
}

export class PropGeometryAdjustmentRepository {
  private readonly state: PropGeometryAdjustmentState;
  private unsubscribe: (() => void) | null = null;
  private initializePromise: Promise<void> | null = null;

  constructor(private readonly persister: PropGeometryAdjustmentPersister) {
    this.state = createPropGeometryAdjustmentState();
  }

  get isInitialized(): boolean {
    return this.state.isInitialized;
  }

  async initialize(): Promise<void> {
    if (this.initializePromise) return this.initializePromise;
    if (this.state.isInitialized) return;

    this.initializePromise = this.doInitialize();
    return this.initializePromise;
  }

  private async doInitialize(): Promise<void> {
    try {
      this.state.setLoading(true);
      logger.info("Initializing prop geometry adjustments...");

      const adjustments = await this.persister.loadAll();
      this.state.loadAll(adjustments.map(normalizeAdjustment));

      this.unsubscribe = this.persister.subscribe(
        (adjustment: PropGeometryAdjustment) => {
          const normalized = normalizeAdjustment(adjustment);
          this.state.setAdjustment(normalized);
          logger.info(
            `Real-time update: ${generatePropGeometryKeyString({
              placementFrame: normalized.placementFrame,
              propType: normalized.propType,
              otherPropType: normalized.otherPropType,
              positionType: normalized.positionType,
              endOrientation: normalized.endOrientation,
              otherEndOrientation: normalized.otherEndOrientation,
              motionType: normalized.motionType,
              turns: normalized.turns,
              arrowColor: normalized.arrowColor,
            })}`
          );
        },
        (keyString: string) => {
          const parsedKey = parsePropGeometryKeyString(keyString);
          const key = parsedKey ? normalizeKey(parsedKey) : null;
          if (key) {
            this.state.removeAdjustment(key);
            logger.info(`Real-time removal: ${keyString}`);
          }
        }
      );

      logger.success(
        `Initialized with ${this.state.count} prop geometry adjustments`
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to initialize prop geometry adjustments";
      this.state.setError(message);
      logger.error("Initialization failed:", error);
    } finally {
      this.state.setLoading(false);
      this.initializePromise = null;
    }
  }

  getAdjustmentCascading(
    key: PropGeometryKey
  ): CascadingPropGeometryResult | null {
    return this.state.getAdjustmentCascading(normalizeKey(key));
  }

  /** Exact (non-cascading) lookup. */
  getAdjustment(key: PropGeometryKey): { x: number; y: number } | null {
    return this.state.getAdjustment(normalizeKey(key));
  }

  /** All loaded adjustments, in the exact shape `state.loadAll` consumes (bundle snapshot). */
  getAll(): PropGeometryAdjustment[] {
    return this.state.getAllAdjustments();
  }

  hasAdjustment(key: PropGeometryKey): boolean {
    return this.state.hasAdjustment(normalizeKey(key));
  }

  /** In-memory only — live WASD preview before persisting (admin only). */
  saveAdjustmentLocal(input: PropGeometryAdjustmentInput): void {
    if (!this.isAdmin()) {
      throw new Error("Only admin can save prop geometry adjustments");
    }
    const fakeTimestamp = {
      seconds: Math.floor(Date.now() / 1000),
      nanoseconds: 0,
      toDate: () => new Date(),
      toMillis: () => Date.now(),
      isEqual: () => false,
    } as unknown as Timestamp;

    const normalized = normalizeInput(input);
    this.state.setAdjustment({
      placementFrame: normalizePlacementFrame(normalized.placementFrame),
      propType: normalized.propType,
      otherPropType: normalized.otherPropType,
      positionType: normalized.positionType,
      endOrientation: normalized.endOrientation,
      otherEndOrientation: normalized.otherEndOrientation,
      motionType: normalized.motionType,
      turns: normalized.turns,
      arrowColor: normalized.arrowColor,
      adjustmentX: input.adjustmentX,
      adjustmentY: input.adjustmentY,
      updatedAt: fakeTimestamp,
      updatedBy: authState.user?.email ?? "unknown",
    });
  }

  /** In-memory only — revert preview (admin only). */
  deleteAdjustmentLocal(key: PropGeometryKey): void {
    if (!this.isAdmin()) {
      throw new Error("Only admin can delete prop geometry adjustments");
    }
    this.state.removeAdjustment(normalizeKey(key));
  }

  /** Persist a delete (admin only). */
  async deleteAdjustment(key: PropGeometryKey): Promise<void> {
    if (!this.isAdmin()) {
      throw new Error("Only admin can delete prop geometry adjustments");
    }
    await this.persister.delete(
      generatePropGeometryKeyString(normalizeKey(key))
    );
  }

  async saveAdjustment(input: PropGeometryAdjustmentInput): Promise<void> {
    if (!this.isAdmin()) {
      throw new Error("Only admin can save prop geometry adjustments");
    }

    const userEmail = authState.user?.email;
    if (!userEmail) {
      throw new Error("User email not available");
    }

    await this.persister.save(normalizeInput(input), userEmail);
  }

  private isAdmin(): boolean {
    return authState.user?.email === ADMIN_EMAIL;
  }

  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.state.clear();
    logger.info("Disposed");
  }
}
