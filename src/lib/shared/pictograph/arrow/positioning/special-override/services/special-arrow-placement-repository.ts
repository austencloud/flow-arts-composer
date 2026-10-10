/**
 * Special Arrow Placement Repository
 *
 * Coordinates state and persistence for special arrow placement overrides.
 * Provides the main interface for the rendering pipeline and UI.
 */

import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
import {
  generateSpecialOverrideKey,
  type SpecialArrowPlacement,
  type SpecialArrowPlacementInput,
  type SpecialSuppressionInput,
} from "../domain/special-arrow-placement";
import type { SpecialArrowPlacementPersister } from "./special-arrow-placement-persister";
import {
  createSpecialArrowPlacementState,
  type SpecialArrowPlacementState,
} from "../state/special-arrow-placement-state.svelte";
import { createComponentLogger } from "#lib/shared/utils/debug-logger.js";
import { globalAdjustmentVersion } from "../../global/state/global-adjustment-version.svelte";
import { normalizePlacementFrame } from "../../placement/domain/placement-frame";

const logger = createComponentLogger("SpecialArrowPlacementRepository");
const ADMIN_EMAIL = "austencloud@gmail.com";

export class SpecialArrowPlacementRepository {
  private readonly state: SpecialArrowPlacementState;
  private unsubscribe: (() => void) | null = null;
  private initializePromise: Promise<void> | null = null;

  constructor(private readonly persister: SpecialArrowPlacementPersister) {
    this.state = createSpecialArrowPlacementState();
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
      logger.info("Initializing special placement overrides...");

      const overrides = await this.persister.loadAll();
      this.state.loadAll(overrides);

      if (overrides.length > 0) {
        globalAdjustmentVersion.increment();
      }

      this.startSubscription();

      logger.success(
        `Initialized with ${this.state.count} special placement overrides`
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to initialize";
      this.state.setError(message);
      logger.error("Initialization failed:", error);
      throw error;
    } finally {
      this.state.setLoading(false);
      this.initializePromise = null;
    }
  }

  private startSubscription(): void {
    this.unsubscribe = this.persister.subscribe(
      (override: SpecialArrowPlacement) => {
        this.state.setOverride(override);
        logger.info(`Real-time update: ${override.key}`);
      },
      (key: string) => {
        this.state.removeOverride(key);
        logger.info(`Real-time removal: ${key}`);
      }
    );
  }

  getOverride(key: string): { x: number; y: number } | null {
    return this.state.getOverride(key);
  }

  getFullOverride(key: string): SpecialArrowPlacement | null {
    return this.state.getFullOverride(key);
  }

  /** All loaded overrides, in the exact shape `state.loadAll` consumes (bundle snapshot). */
  getAll(): SpecialArrowPlacement[] {
    return this.state.getAllOverrides();
  }

  hasOverride(key: string): boolean {
    return this.state.hasOverride(key);
  }

  /** True when a tombstone hides the whole Special tier (static JSON included). */
  isSuppressed(key: string): boolean {
    return this.state.isSuppressed(key);
  }

  /**
   * Save an override to local cache only (admin only).
   * Use this for live preview during WASD adjustment.
   */
  saveOverrideLocal(input: SpecialArrowPlacementInput): void {
    const placementFrame = normalizePlacementFrame(input.placementFrame);
    const key = generateSpecialOverrideKey({ ...input, placementFrame });
    const fakeTimestamp = {
      seconds: Math.floor(Date.now() / 1000),
      nanoseconds: 0,
      toDate: () => new Date(),
      toMillis: () => Date.now(),
      isEqual: () => false,
    } as unknown as import("firebase/firestore").Timestamp;

    this.state.setOverride({
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
      // A live nudge is a real override — it lifts any tombstone at this key,
      // matching what the Firestore write does.
      suppressed: false,
      updatedAt: fakeTimestamp,
      updatedBy: authState.user?.email ?? "unknown",
    });
  }

  /**
   * Delete an override from local cache only (admin only).
   * Use this for live preview during reset.
   */
  deleteOverrideLocal(key: string): void {
    this.state.removeOverride(key);
  }

  /**
   * Save an override to Firestore (admin only).
   * A [0,0] adjustment is treated as a removal — it deletes the Firestore doc
   * rather than persisting an empty record that would shadow lower tiers.
   * @throws Error if user is not admin
   */
  async saveOverride(input: SpecialArrowPlacementInput): Promise<void> {
    const email = authState.user?.email;
    if (email !== ADMIN_EMAIL)
      throw new Error("Only admin can save special placement overrides");
    if (input.adjustmentX === 0 && input.adjustmentY === 0) {
      await this.deleteOverride(generateSpecialOverrideKey(input)); // zero = remove, never persist [0,0]
      return;
    }
    await this.persister.save(input, email);
  }

  /** In-memory suppression preview (admin only) — instant, before the Firestore write. */
  saveSuppressionLocal(input: SpecialSuppressionInput): void {
    const placementFrame = normalizePlacementFrame(input.placementFrame);
    const key = generateSpecialOverrideKey({ ...input, placementFrame });
    const fakeTimestamp = {
      seconds: Math.floor(Date.now() / 1000),
      nanoseconds: 0,
      toDate: () => new Date(),
      toMillis: () => Date.now(),
      isEqual: () => false,
    } as unknown as import("firebase/firestore").Timestamp;

    this.state.setOverride({
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
      updatedAt: fakeTimestamp,
      updatedBy: authState.user?.email ?? "unknown",
    });
  }

  /**
   * Persist a tombstone hiding the whole Special tier for this key (admin only).
   * NOT routed through saveOverride: that treats a [0,0] adjustment as a removal,
   * which would delete the very doc that carries the suppression.
   * @throws Error if user is not admin
   */
  async saveSuppression(input: SpecialSuppressionInput): Promise<void> {
    const email = authState.user?.email;
    if (email !== ADMIN_EMAIL) {
      throw new Error("Only admin can suppress special placements");
    }
    await this.persister.saveSuppression(input, email);
  }

  /**
   * Delete an override from Firestore (admin only).
   * Also the way a tombstone is lifted — deleting the doc restores the static
   * JSON value, since the Special tier reads the shipped file again.
   * @throws Error if user is not admin
   */
  async deleteOverride(key: string): Promise<void> {
    const email = authState.user?.email;
    if (email !== ADMIN_EMAIL) {
      throw new Error("Only admin can delete special placement overrides");
    }
    await this.persister.delete(key);
    this.state.removeOverride(key);
  }

  /**
   * Check if the current user is an admin
   */
  isAdmin(): boolean {
    return authState.user?.email === ADMIN_EMAIL;
  }

  /**
   * Dispose of resources (unsubscribe from Firestore)
   */
  dispose(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.state.clear();
    logger.info("Disposed");
  }
}
