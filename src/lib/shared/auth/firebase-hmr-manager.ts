/**
 * Firebase HMR Manager - Zero-Downtime Hot Module Replacement
 *
 * This module provides bulletproof HMR resilience for Firebase services.
 * The core problem: Firebase SDK caches instances internally, and after
 * calling terminate(), getFirestore(app) still returns the terminated
 * (corrupt) instance.
 *
 * Solution: App Instance Rotation
 * - Create a new Firebase App with unique name on each HMR cycle
 * - Transfer auth state to the new app
 * - Re-subscribe all Firestore/RTDB listeners automatically
 * - Re-establish presence (onDisconnect handlers)
 *
 * @module FirebaseHMRManager
 */

import type { FirebaseApp } from "firebase/app";
import type { Auth, User } from "firebase/auth";
import type { Firestore, Unsubscribe } from "firebase/firestore";
import type { Database } from "firebase/database";
import { createComponentLogger } from "#lib/shared/utils/debug-logger.js";

const debug = createComponentLogger("FirebaseHMR");


export interface FirebaseHMRConfig {
  /** Enable debug logging */
  debug: boolean;
  /** Timeout for auth state transfer (ms) */
  authTransferTimeout: number;
  /** Max listeners to track in registry */
  maxListeners: number;
}

export interface ListenerRegistration {
  id: string;
  type: "firestore" | "rtdb";
  path: string;
  resubscribe: () => Unsubscribe | (() => void);
  unsubscribe: Unsubscribe | (() => void);
  createdAt: number;
}

export interface FirebaseHMRState {
  phase: "idle" | "rotating" | "transferring" | "resubscribing" | "ready";
  currentAppId: number;
  app: FirebaseApp | null;
  auth: Auth | null;
  firestore: Firestore | null;
  database: Database | null;
  lastRotationTime: number | null;
}

export interface FirebaseHMRMetrics {
  totalRotations: number;
  successfulRotations: number;
  failedRotations: number;
  authTransfersSucceeded: number;
  authTransfersFailed: number;
  listenersResubscribed: number;
  averageRotationTime: number;
  rotationTimes: number[];
}


const DEFAULT_CONFIG: FirebaseHMRConfig = {
  debug: import.meta.env?.DEV ?? false,
  authTransferTimeout: 5000,
  maxListeners: 500,
};


export class FirebaseHMRManager {
  private static instance: FirebaseHMRManager | null = null;

  private config: FirebaseHMRConfig;
  private state: FirebaseHMRState;
  private listenerRegistry: Map<string, ListenerRegistration> = new Map();
  private presenceHandlers: Array<() => Promise<void> | void> = [];
  private rotationPromise: Promise<void> | null = null;

  // Cached user for auth state transfer
  private cachedUser: User | null = null;
  private cachedIdToken: string | null = null;

  // Metrics
  private metrics: FirebaseHMRMetrics = {
    totalRotations: 0,
    successfulRotations: 0,
    failedRotations: 0,
    authTransfersSucceeded: 0,
    authTransfersFailed: 0,
    listenersResubscribed: 0,
    averageRotationTime: 0,
    rotationTimes: [],
  };

  // Callbacks for when rotation completes
  private rotationCallbacks: Array<() => void> = [];

  private constructor(config: Partial<FirebaseHMRConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.state = {
      phase: "idle",
      currentAppId: 0,
      app: null,
      auth: null,
      firestore: null,
      database: null,
      lastRotationTime: null,
    };
  }

  static getInstance(config?: Partial<FirebaseHMRConfig>): FirebaseHMRManager {
    // Check globalThis first to survive HMR module re-evaluation
    if (
      !FirebaseHMRManager.instance &&
      typeof globalThis !== "undefined" &&
      globalThis.__FIREBASE_HMR_MANAGER__
    ) {
      FirebaseHMRManager.instance = globalThis.__FIREBASE_HMR_MANAGER__;
    }

    if (!FirebaseHMRManager.instance) {
      FirebaseHMRManager.instance = new FirebaseHMRManager(config);

      // Preserve across HMR via global
      if (typeof globalThis !== "undefined") {
        globalThis.__FIREBASE_HMR_MANAGER__ = FirebaseHMRManager.instance;
      }
    }
    return FirebaseHMRManager.instance;
  }

  /**
   * Restore instance from global (for HMR)
   */
  static restoreFromGlobal(): FirebaseHMRManager | null {
    if (
      typeof globalThis !== "undefined" &&
      globalThis.__FIREBASE_HMR_MANAGER__
    ) {
      FirebaseHMRManager.instance = globalThis.__FIREBASE_HMR_MANAGER__;
      return FirebaseHMRManager.instance;
    }
    return null;
  }

  // PUBLIC API - State

  /**
   * Check if HMR rotation is in progress
   */
  isRotating(): boolean {
    return this.state.phase !== "idle" && this.state.phase !== "ready";
  }

  /**
   * Check if Firebase is ready for use
   */
  isReady(): boolean {
    return this.state.phase === "idle" || this.state.phase === "ready";
  }

  /**
   * Get current Firebase App
   */
  getApp(): FirebaseApp | null {
    return this.state.app;
  }

  getAuth(): Auth | null {
    return this.state.auth;
  }

  /**
   * Get current Firestore instance
   */
  getFirestore(): Firestore | null {
    return this.state.firestore;
  }

  getDatabase(): Database | null {
    return this.state.database;
  }

  /**
   * Get current app ID (increments on each rotation)
   */
  getAppId(): number {
    return this.state.currentAppId;
  }

  getMetrics(): Readonly<FirebaseHMRMetrics> {
    return { ...this.metrics };
  }

  // PUBLIC API - Registration

  /**
   * Set the Firebase App instance (called during initialization)
   */
  setApp(app: FirebaseApp): void {
    this.state.app = app;
    this.log("Firebase App registered");
  }

  /**
   * Set the Auth instance (called during initialization)
   */
  setAuth(auth: Auth): void {
    this.state.auth = auth;
    this.log("Auth instance registered");
  }

  /**
   * Set the Firestore instance (called during lazy init)
   */
  setFirestore(firestore: Firestore): void {
    this.state.firestore = firestore;
    this.log("Firestore instance registered");
  }

  /**
   * Forget a deliberately terminated instance before the page reloads.
   */
  clearFirestore(): void {
    this.state.firestore = null;
    this.log("Firestore instance cleared");
  }

  /**
   * Set the Database instance (called during lazy init)
   */
  setDatabase(database: Database): void {
    this.state.database = database;
    this.log("Database instance registered");
  }

  /**
   * Register a Firestore listener for automatic resubscription after HMR
   *
   * @param id Unique identifier for this listener
   * @param path Document/collection path (for debugging)
   * @param resubscribe Function that creates the listener and returns unsubscribe
   * @returns Unsubscribe function
   */
  registerFirestoreListener(
    id: string,
    path: string,
    resubscribe: () => Unsubscribe
  ): Unsubscribe {
    if (this.listenerRegistry.size >= this.config.maxListeners) {
      this.log(
        `Listener registry full (${this.config.maxListeners}), skipping: ${id}`,
        "warn"
      );
      return resubscribe();
    }

    const unsubscribe = resubscribe();

    const registration: ListenerRegistration = {
      id,
      type: "firestore",
      path,
      resubscribe,
      unsubscribe,
      createdAt: Date.now(),
    };

    this.listenerRegistry.set(id, registration);
    this.log(`Registered Firestore listener: ${id} (${path})`);

    // Return a wrapped unsubscribe that also removes from registry
    return () => {
      unsubscribe();
      this.listenerRegistry.delete(id);
      this.log(`Unregistered Firestore listener: ${id}`);
    };
  }

  /**
   * Register a Realtime Database listener for automatic resubscription
   */
  registerDatabaseListener(
    id: string,
    path: string,
    resubscribe: () => () => void
  ): () => void {
    if (this.listenerRegistry.size >= this.config.maxListeners) {
      this.log(`Listener registry full, skipping: ${id}`, "warn");
      return resubscribe();
    }

    const unsubscribe = resubscribe();

    const registration: ListenerRegistration = {
      id,
      type: "rtdb",
      path,
      resubscribe,
      unsubscribe,
      createdAt: Date.now(),
    };

    this.listenerRegistry.set(id, registration);
    this.log(`Registered RTDB listener: ${id} (${path})`);

    return () => {
      unsubscribe();
      this.listenerRegistry.delete(id);
      this.log(`Unregistered RTDB listener: ${id}`);
    };
  }

  /**
   * Register a presence handler to be called after HMR rotation
   * These typically set up onDisconnect() handlers
   */
  registerPresenceHandler(handler: () => Promise<void> | void): () => void {
    this.presenceHandlers.push(handler);
    this.log(
      `Registered presence handler (${this.presenceHandlers.length} total)`
    );

    return () => {
      const index = this.presenceHandlers.indexOf(handler);
      if (index !== -1) {
        this.presenceHandlers.splice(index, 1);
        this.log(`Unregistered presence handler`);
      }
    };
  }

  /**
   * Wait for rotation to complete (if in progress)
   */
  async waitForReady(): Promise<void> {
    if (this.isReady()) return;

    if (this.rotationPromise) {
      await this.rotationPromise;
      return;
    }

    // Wait for next rotation to complete
    return new Promise((resolve) => {
      this.rotationCallbacks.push(resolve);
    });
  }

  // ============================================================================
  // HMR LIFECYCLE
  // ============================================================================

  /**
   * Called when HMR dispose is triggered - cache auth state
   */
  async onHMRDispose(): Promise<void> {
    this.log("HMR dispose triggered - caching auth state");

    // Cache current user and token for transfer
    if (this.state.auth?.currentUser) {
      this.cachedUser = this.state.auth.currentUser;
      try {
        this.cachedIdToken = await this.cachedUser.getIdToken();
        this.log(`Cached auth state for user: ${this.cachedUser.uid}`);
      } catch (error) {
        this.log(`Failed to cache ID token: ${error}`, "warn");
        this.cachedIdToken = null;
      }
    }

    // Unsubscribe all listeners (they'll be resubscribed after rotation)
    for (const [id, registration] of this.listenerRegistry) {
      try {
        registration.unsubscribe();
        this.log(`Unsubscribed listener for HMR: ${id}`);
      } catch (error) {
        this.log(`Failed to unsubscribe ${id}: ${error}`, "warn");
      }
    }

    // Terminate Firestore if it exists
    if (this.state.firestore) {
      try {
        const { terminate } = await import("firebase/firestore");
        await terminate(this.state.firestore);
        this.log("Firestore terminated");
      } catch (error) {
        this.log(`Firestore terminate failed: ${error}`, "warn");
      }
      this.state.firestore = null;
    }

    // Clear database reference (no terminate needed for RTDB)
    this.state.database = null;
  }

  /**
   * Called when HMR accept is triggered - rotate app and restore state
   */
  async onHMRAccept(
    firebaseConfig: Record<string, string>,
    initializeApp: typeof import("firebase/app").initializeApp, // eslint-disable-line @typescript-eslint/consistent-type-imports
    getAuth: typeof import("firebase/auth").getAuth // eslint-disable-line @typescript-eslint/consistent-type-imports
  ): Promise<void> {
    if (this.rotationPromise) {
      await this.rotationPromise;
      return;
    }

    const startTime = Date.now();
    this.metrics.totalRotations++;

    this.rotationPromise = this.performRotation(
      firebaseConfig,
      initializeApp,
      getAuth
    );

    try {
      await this.rotationPromise;

      const duration = Date.now() - startTime;
      this.recordRotationMetrics(duration, true);
      this.log(`HMR rotation complete in ${duration}ms`);

      // Notify waiting callers
      for (const callback of this.rotationCallbacks) {
        callback();
      }
      this.rotationCallbacks = [];
    } catch (error) {
      const duration = Date.now() - startTime;
      this.recordRotationMetrics(duration, false);
      this.log(`HMR rotation failed: ${error}`, "error");
      throw error;
    } finally {
      this.rotationPromise = null;
    }
  }

  /**
   * Perform the actual app rotation
   */
  private async performRotation(
    firebaseConfig: Record<string, string>,
    initializeApp: typeof import("firebase/app").initializeApp, // eslint-disable-line @typescript-eslint/consistent-type-imports
    getAuth: typeof import("firebase/auth").getAuth // eslint-disable-line @typescript-eslint/consistent-type-imports
  ): Promise<void> {
    this.state.phase = "rotating";
    this.state.currentAppId++;

    // Create new app with unique name
    const appName = `tka-app-hmr-${this.state.currentAppId}`;
    this.log(`Creating new Firebase App: ${appName}`);

    try {
      this.state.app = initializeApp(firebaseConfig, appName);
      this.state.auth = getAuth(this.state.app);
      this.log("New Firebase App and Auth created");
    } catch (error) {
      this.log(`Failed to create new app: ${error}`, "error");
      throw error;
    }

    // Transfer auth state
    this.state.phase = "transferring";
    await this.transferAuthState();

    // Resubscribe listeners
    this.state.phase = "resubscribing";
    await this.resubscribeListeners();

    // Re-establish presence
    await this.reestablishPresence();

    this.state.phase = "ready";
    this.state.lastRotationTime = Date.now();
  }

  /**
   * Transfer auth state to the new app instance
   */
  private async transferAuthState(): Promise<void> {
    if (!this.cachedUser || !this.cachedIdToken || !this.state.auth) {
      this.log("No auth state to transfer");
      return;
    }

    this.log(`Transferring auth state for user: ${this.cachedUser.uid}`);

    try {
      // Firebase Auth maintains its own persistence (IndexedDB/localStorage)
      // and auto-restores the user on the new auth instance. We just wait for it.
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error("Auth state transfer timeout"));
        }, this.config.authTransferTimeout);

        const unsubscribe = this.state.auth!.onAuthStateChanged((user) => {
          if (user) {
            clearTimeout(timeout);
            unsubscribe();
            this.log(`Auth state restored: ${user.uid}`);
            this.metrics.authTransfersSucceeded++;
            resolve();
          }
        });

        // Also check if already signed in
        if (this.state.auth!.currentUser) {
          clearTimeout(timeout);
          unsubscribe();
          this.log(
            `Auth already restored: ${this.state.auth!.currentUser.uid}`
          );
          this.metrics.authTransfersSucceeded++;
          resolve();
        }
      });
    } catch (error) {
      this.log(`Auth state transfer failed: ${error}`, "warn");
      this.metrics.authTransfersFailed++;
      // Don't throw - auth will be restored on next user action
    } finally {
      // Clear cached state
      this.cachedUser = null;
      this.cachedIdToken = null;
    }
  }

  /**
   * Resubscribe all registered listeners
   */
  private async resubscribeListeners(): Promise<void> {
    const listeners = Array.from(this.listenerRegistry.entries());
    this.log(`Resubscribing ${listeners.length} listeners`);

    let resubscribed = 0;

    for (const [id, registration] of listeners) {
      try {
        // Create new subscription
        const newUnsubscribe = registration.resubscribe();

        // Update registration
        registration.unsubscribe = newUnsubscribe;

        resubscribed++;
        this.log(`Resubscribed: ${id}`);
      } catch (error) {
        this.log(`Failed to resubscribe ${id}: ${error}`, "warn");
        // Remove failed listener from registry
        this.listenerRegistry.delete(id);
      }
    }

    this.metrics.listenersResubscribed += resubscribed;
    this.log(`Resubscribed ${resubscribed}/${listeners.length} listeners`);
  }

  /**
   * Re-establish presence handlers (onDisconnect, etc.)
   */
  private async reestablishPresence(): Promise<void> {
    if (this.presenceHandlers.length === 0) {
      this.log("No presence handlers to re-establish");
      return;
    }

    this.log(
      `Re-establishing ${this.presenceHandlers.length} presence handlers`
    );

    for (const handler of this.presenceHandlers) {
      try {
        await handler();
      } catch (error) {
        this.log(`Presence handler failed: ${error}`, "warn");
      }
    }

    this.log("Presence handlers re-established");
  }

  /**
   * Record metrics for rotation
   */
  private recordRotationMetrics(durationMs: number, success: boolean): void {
    if (success) {
      this.metrics.successfulRotations++;
    } else {
      this.metrics.failedRotations++;
    }

    this.metrics.rotationTimes.push(durationMs);
    if (this.metrics.rotationTimes.length > 10) {
      this.metrics.rotationTimes.shift();
    }

    this.metrics.averageRotationTime =
      this.metrics.rotationTimes.reduce((a, b) => a + b, 0) /
      this.metrics.rotationTimes.length;
  }

  /**
   * Log with debug filtering
   */
  private log(message: string, level: "log" | "warn" | "error" = "log"): void {
    if (!this.config.debug) return;

    const prefix = "🔥 Firebase HMR:";
    switch (level) {
      case "error":
        debug.error(`${prefix} ${message}`);
        break;
      case "warn":
        debug.warn(`${prefix} ${message}`);
        break;
      default:
        debug.info(`${prefix} ${message}`);
    }
  }
}

// ============================================================================
// GLOBAL TYPE AUGMENTATION
// ============================================================================

declare global {
  var __FIREBASE_HMR_MANAGER__: FirebaseHMRManager | undefined;
}

// ============================================================================
// CONVENIENCE EXPORTS
// ============================================================================

/**
 * Get the Firebase HMR Manager instance
 */
export function getFirebaseHMRManager(): FirebaseHMRManager {
  // Try to restore from global first (survives HMR)
  const restored = FirebaseHMRManager.restoreFromGlobal();
  if (restored) return restored;

  return FirebaseHMRManager.getInstance();
}

/**
 * Check if Firebase HMR rotation is in progress
 */
export function isFirebaseRotating(): boolean {
  return getFirebaseHMRManager().isRotating();
}

/**
 * Wait for Firebase to be ready after HMR
 */
export async function waitForFirebaseReady(): Promise<void> {
  return getFirebaseHMRManager().waitForReady();
}
