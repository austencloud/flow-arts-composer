import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
import type {
  DefaultArrowPlacementDoc,
  PlacementValue,
} from "../domain/default-arrow-placement";
import type { DefaultArrowPlacementPersister } from "./default-arrow-placement-persister";
import {
  createDefaultArrowPlacementState,
  type DefaultArrowPlacementState,
} from "../state/default-arrow-placement-state.svelte";
import { createComponentLogger } from "#lib/shared/utils/debug-logger.js";
import { globalAdjustmentVersion } from "../../global/state/global-adjustment-version.svelte";

const logger = createComponentLogger("DefaultArrowPlacementRepository");
const ADMIN_EMAIL = "austencloud@gmail.com";

export class DefaultArrowPlacementRepository {
  private readonly state: DefaultArrowPlacementState;
  private unsubscribe: (() => void) | null = null;
  private initializePromise: Promise<void> | null = null;
  private versionBumpQueued = false;

  constructor(private readonly persister: DefaultArrowPlacementPersister) {
    this.state = createDefaultArrowPlacementState();
  }

  /**
   * Bump the global adjustment version at most once per microtask.
   *
   * A Firestore snapshot delivers each doc as its own `docChange`, so the
   * `subscribe` callback fires once per doc — the initial snapshot alone is N
   * synchronous calls. `globalAdjustmentVersion` is read by every mounted
   * PictographContainer's prepare key, so an unbatched per-doc bump turns one
   * snapshot into N synchronous re-prepare passes. With many pictographs on
   * screen at once (the guide reader stacks 100+), that trips Svelte's
   * `effect_update_depth_exceeded` guard and freezes the tab. Coalescing to a
   * single deferred bump means one snapshot → one re-prepare, and moves the
   * bump out of the current flush so it can't re-enter synchronously.
   */
  private queueVersionBump(): void {
    if (this.versionBumpQueued) return;
    this.versionBumpQueued = true;
    queueMicrotask(() => {
      this.versionBumpQueued = false;
      globalAdjustmentVersion.increment();
    });
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
      logger.info("Initializing default placement overrides...");

      const docs = await this.persister.loadAll();
      this.state.loadAll(docs);

      if (docs.length > 0) {
        globalAdjustmentVersion.increment();
      }

      this.unsubscribe = this.persister.subscribe((doc) => {
        this.state.setDoc(doc);
        this.queueVersionBump();
        logger.info(`Real-time update: ${doc.id}`);
      });

      logger.success(
        `Initialized with ${this.state.count} default placement docs`
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

  /** Firestore-first base value, or null when no override exists (resolver consumes this). */
  getValue(
    placementFrame: string,
    propType: string,
    motionType: string,
    placementKey: string,
    turns: string
  ): PlacementValue | null {
    return this.state.getValue(
      placementFrame,
      propType,
      motionType,
      placementKey,
      turns
    );
  }

  /** All loaded docs, in the exact shape `state.loadAll` consumes (bundle snapshot). */
  getAll(): DefaultArrowPlacementDoc[] {
    return this.state.getAllDocs();
  }

  hasValue(
    placementFrame: string,
    propType: string,
    motionType: string,
    placementKey: string,
    turns: string
  ): boolean {
    return (
      this.state.getValue(
        placementFrame,
        propType,
        motionType,
        placementKey,
        turns
      ) !== null
    );
  }

  /** In-memory live preview during WASD (admin only). */
  saveDefaultLocal(
    placementFrame: string,
    propType: string,
    motionType: string,
    placementKey: string,
    turns: string,
    value: PlacementValue
  ): void {
    this.state.setValue(
      placementFrame,
      propType,
      motionType,
      placementKey,
      turns,
      value,
      authState.user?.email ?? "unknown"
    );
  }

  /** In-memory revert preview (admin only). */
  deleteDefaultLocal(
    placementFrame: string,
    propType: string,
    motionType: string,
    placementKey: string,
    turns: string
  ): void {
    this.state.removeValue(
      placementFrame,
      propType,
      motionType,
      placementKey,
      turns
    );
  }

  /** Persist a single base value (admin only). */
  async saveDefault(
    placementFrame: string,
    propType: string,
    motionType: string,
    placementKey: string,
    turns: string,
    value: PlacementValue
  ): Promise<void> {
    const email = authState.user?.email;
    if (email !== ADMIN_EMAIL) {
      throw new Error("Only admin can save default placement overrides");
    }
    // Capture the prior value before the write so the audit row records prev→new.
    const prev = this.state.getValue(
      placementFrame,
      propType,
      motionType,
      placementKey,
      turns
    );
    await this.persister.saveValue(
      placementFrame,
      propType,
      motionType,
      placementKey,
      turns,
      value,
      email,
      prev
    );
  }

  /** Persist a single delete (admin only). */
  async deleteDefault(
    placementFrame: string,
    propType: string,
    motionType: string,
    placementKey: string,
    turns: string
  ): Promise<void> {
    const email = authState.user?.email;
    if (email !== ADMIN_EMAIL) {
      throw new Error("Only admin can delete default placement overrides");
    }
    // Capture the prior value before the delete so the audit row records it.
    const prev = this.state.getValue(
      placementFrame,
      propType,
      motionType,
      placementKey,
      turns
    );
    await this.persister.deleteValue(
      placementFrame,
      propType,
      motionType,
      placementKey,
      turns,
      email,
      prev
    );
    this.state.removeValue(
      placementFrame,
      propType,
      motionType,
      placementKey,
      turns
    );
  }

  isAdmin(): boolean {
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
