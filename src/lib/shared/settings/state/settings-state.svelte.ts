import { getSettingsPersister } from "$lib/shared/settings/get-settings-persister";
import { browser } from "$app/environment";
import { BackgroundType } from "@austencloud/backgrounds";
import { getSceneUndoManager } from "$lib/shared/3d/undo/get-scene-undo-manager";
import { updateBodyBackground } from "../utils/background-preloader";
import { updateTheme as updateThemeService } from "../../theme/services/theme-service";
import { applyThemeForBackground } from "../../settings/utils/background-theme-calculator";
import { GridMode } from "../../pictograph/grid/domain/enums/grid-enums";
import { PropType } from "../../pictograph/prop/domain/enums/prop-type";
import {
  normalizeLegacyAppSettings,
  type AppSettings,
  type PropPreset,
} from "../domain/app-settings";
import { DEFAULT_FAN_APPEARANCE } from "../../pictograph/prop/domain/fan-appearance";
import { DEFAULT_PROP_LOOK } from "../../pictograph/prop/domain/prop-look";
// Dynamic import: posthog-activity-logger → posthog → $env/dynamic/public.
// Static import crashes the composition worker (no globalThis.__sveltekit_dev).
async function logSettingChange(
  key: string,
  oldValue: string | number | boolean,
  newValue: string | number | boolean
): Promise<void> {
  const mod =
    await import("$lib/shared/analytics/services/posthog-activity-logger");
  return mod.logSettingChange(key, oldValue, newValue);
}
import type { FirebaseSettingsPersister } from "../services/firebase-settings-persister";
import { normalizeBackgroundType } from "../domain/background-type-migration";
import { auth } from "../../auth/firebase";
import { createComponentLogger } from "$lib/shared/utils/debug-logger";
import { getAnimationVisibilityManager } from "../../animation-engine/state/animation-visibility-state.svelte";
import {
  getColumnCountPreferenceOwner,
  sanitizeColumnCountPreference,
} from "$lib/shared/share/domain/column-count-preference";

const debug = createComponentLogger("SettingsState");

const SETTINGS_STORAGE_KEY = "tka-modern-web-settings";
const OFFLINE_QUEUE_KEY = "tka-settings-offline-queue";

const DEFAULT_PROP_PRESETS: PropPreset[] = [
  {
    leftPropType: PropType.STAFF,
    rightPropType: PropType.STAFF,
    catDogMode: false,
  },
  { leftPropType: PropType.FAN, rightPropType: PropType.FAN, catDogMode: false },
  {
    leftPropType: PropType.CLUB,
    rightPropType: PropType.CLUB,
    catDogMode: false,
  },
  {
    leftPropType: PropType.BUUGENG,
    rightPropType: PropType.BUUGENG,
    catDogMode: false,
  },
  {
    leftPropType: PropType.MINIHOOP,
    rightPropType: PropType.MINIHOOP,
    catDogMode: false,
  },
  {
    leftPropType: PropType.TRIAD,
    rightPropType: PropType.TRIAD,
    catDogMode: false,
  },
  {
    leftPropType: PropType.DOUBLESTAR,
    rightPropType: PropType.DOUBLESTAR,
    catDogMode: false,
  },
  {
    leftPropType: PropType.BIGDOUBLESTAR,
    rightPropType: PropType.BIGDOUBLESTAR,
    catDogMode: false,
  },
  {
    leftPropType: PropType.QUIAD,
    rightPropType: PropType.QUIAD,
    catDogMode: false,
  },
  { leftPropType: PropType.STAFF, rightPropType: PropType.FAN, catDogMode: true },
];

const DEFAULT_SETTINGS: AppSettings = {
  gridMode: GridMode.DIAMOND,
  backgroundType: BackgroundType.COSMIC,
  backgroundQuality: "medium",
  backgroundEnabled: true,
  hapticFeedback: true,
  reducedMotion: false,
  catDogMode: false,
  leftPropType: PropType.STAFF,
  rightPropType: PropType.STAFF,
  fanAppearance: DEFAULT_FAN_APPEARANCE,
  propArtwork: DEFAULT_PROP_LOOK,
  primaryPropColors: null,
  blockedStartPositions: [],
  blockedStartPositionsByGridMode: {},
  propPresets: DEFAULT_PROP_PRESETS,
  selectedPresetIndex: 0,
  darkMode: true,
} as AppSettings;

const initialSettings = (() => {
  if (!browser) return DEFAULT_SETTINGS;
  try {
    const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!stored) return DEFAULT_SETTINGS;
    const parsed = normalizeLegacyAppSettings(JSON.parse(stored)) as AppSettings & {
      _localTimestamp?: number;
    };
    parsed.backgroundType =
      normalizeBackgroundType(parsed.backgroundType) ??
      DEFAULT_SETTINGS.backgroundType;
    // A timestamp without an owning UID cannot establish that browser-global
    // settings are newer than the account Firebase is about to restore.
    delete parsed._localTimestamp;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
})();

const settingsState = $state<AppSettings>(initialSettings);

class SettingsState {
  private firebasePersistence: FirebaseSettingsPersister | null = null;
  private unsubscribeFirebaseSync: (() => void) | null = null;
  // Fired only when settings that genuinely came off Firestore are applied.
  // Sub-managers (image composition) cache their own slice at construction, which
  // races auth restore; this is how they learn the authoritative copy arrived.
  private remoteAppliedListeners = new Set<
    (settings: AppSettings | null, userId: string) => void
  >();
  private lastRemoteApplication:
    { settings: AppSettings | null; userId: string } | undefined;
  private syncInitialized = false;
  private isSavingToFirebase = false;
  // Keys the signed-in user changed here that Firestore has not confirmed yet.
  // The account document the initial load returns — and any snapshot echoing an
  // earlier write — predates these edits, so applying them wholesale reverts
  // the choice the user just made. `isSavingToFirebase` cannot cover this: the
  // UI is live during the initial load, and with two overlapping writes the
  // first one's `finally` clears the flag while the second is still open.
  // Scoped to the editing UID: browser-local settings are shared by every
  // identity on this device, so a pre-sign-in edit still yields to the account
  // document. Each key carries the sequence number of its latest edit, so a
  // write confirms only the edits its payload actually carried.
  private unsavedLocalKeys = new Map<keyof AppSettings, number>();
  private unsavedLocalOwner: string | null = null;
  private localEditSequence = 0;
  // Newest edit inside the queued offline payload, so a successful replay
  // releases exactly those pins instead of holding them for the session.
  private queuedOfflineEdit: { userId: string; sequence: number } | null = null;
  // Distinguishes queue entries this page load wrote from ones a previous load
  // left behind; edit sequence numbers are only comparable within a session.
  private readonly sessionId = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  private pendingFirebaseSave: Promise<void> | null = null;
  // Bumped by cleanup(). Continuations from a torn-down session captured the
  // old value and must not mutate the new one's flags, queue bookkeeping, or
  // subscription handle — the UID checks alone miss a sign-out and sign-in to
  // the SAME account, where the stale continuation's UID still matches.
  private lifecycleGeneration = 0;
  // Identifies the write that currently owns the in-flight bookkeeping, so an
  // older write's settlement cannot clear a newer one's flags.
  private activeSaveToken = 0;
  private saveTokenCounter = 0;
  // A save requested while another is open. Every payload is a full snapshot,
  // so one coalesced re-run after the open write settles carries everything.
  private resaveWhenIdle = false;
  private onlineHandler: (() => void) | null = null;
  private firebaseSaveDebounceTimer: ReturnType<typeof setTimeout> | null =
    null;
  private static readonly FIREBASE_SAVE_DEBOUNCE_MS = 300;

  constructor() {
    if (browser && typeof window !== "undefined") {
      // The old queue had no UID and could replay account A into account B.
      // UID-scoped queues below are the only safe format.
      try {
        localStorage.removeItem(OFFLINE_QUEUE_KEY);
      } catch {
        // Storage can be unavailable in hardened/private browser contexts.
      }
      this.processOfflineQueue();
      this.ensureOnlineHandler();

      const sceneUndo = getSceneUndoManager();
      sceneUndo.registerDomain("scene", {
        capture: () => ({
          backgroundType: settingsState.backgroundType ?? BackgroundType.COSMIC,
          gridMode: settingsState.gridMode,
        }),
        restore: (snapshot) => {
          this.updateSetting("backgroundType", snapshot.backgroundType);
          this.updateSetting("gridMode", snapshot.gridMode);
        },
      });
    }
  }

  /**
   * The online retry listener has to outlive a sign-out. It used to be
   * registered only in the constructor while cleanup() removed it, so the
   * first sign-out left the singleton with no offline retry for the rest of
   * the page's life.
   */
  private ensureOnlineHandler(): void {
    if (!browser || typeof window === "undefined") return;
    if (this.onlineHandler) return;

    this.onlineHandler = () => {
      this.processOfflineQueue();
    };
    window.addEventListener("online", this.onlineHandler);
  }

  async initializeFirebaseSync(): Promise<void> {
    if (this.syncInitialized) return;
    this.syncInitialized = true;

    const generation = this.lifecycleGeneration;

    try {
      this.firebasePersistence = getSettingsPersister();
    } catch {
      console.warn(
        "⚠️ [SettingsState] Firebase persistence service not available"
      );
      return;
    }

    this.ensureOnlineHandler();
    await this.processOfflineQueue();
    if (this.lifecycleGeneration !== generation) return;

    const syncUserId = auth.currentUser?.uid;
    if (syncUserId && this.firebasePersistence) {
      await this.syncFromFirebase(generation);
      if (
        this.lifecycleGeneration !== generation ||
        auth.currentUser?.uid !== syncUserId
      ) {
        return;
      }

      if (this.firebasePersistence.onSettingsChange) {
        const unsubscribe = this.firebasePersistence.onSettingsChange(
          (remoteSettings) => {
            if (
              this.lifecycleGeneration === generation &&
              auth.currentUser?.uid === syncUserId &&
              !this.isSavingToFirebase &&
              !this.firebaseSaveDebounceTimer
            ) {
              this.applyRemoteSettings(remoteSettings, syncUserId);
            }
          }
        );
        // Torn down while subscribing: drop this subscription rather than
        // overwrite — and orphan — the handle the live session holds.
        if (this.lifecycleGeneration !== generation) {
          unsubscribe();
          return;
        }
        this.unsubscribeFirebaseSync = unsubscribe;
      }
    }
  }

  /**
   * @param generation lifecycle generation of the caller. The UID check alone
   * cannot fence a sign-out and sign-in to the SAME account — the stale load's
   * UID still matches — so a late result would apply an old document over
   * newer state. The caller's outer check runs only after this whole method
   * resolves, which is far too late.
   */
  async syncFromFirebase(
    generation: number = this.lifecycleGeneration
  ): Promise<void> {
    if (!this.firebasePersistence || !auth.currentUser) return;
    const userId = auth.currentUser.uid;

    try {
      const firebaseSettings = await this.firebasePersistence.loadSettings();
      if (
        this.lifecycleGeneration !== generation ||
        auth.currentUser?.uid !== userId
      ) {
        return;
      }

      if (firebaseSettings) {
        // Browser-local settings are shared by every identity that uses this
        // device. They cannot outrank an account document merely because they
        // carry a timestamp with no UID provenance.
        this.applyRemoteSettings(firebaseSettings, userId);

        const localBackground = settingsState.backgroundType;
        // Cosmic normally means "never chosen", but a user who picked Cosmic
        // while this load was in flight made a real choice that the account
        // document cannot know about yet.
        const isUsingDefault =
          localBackground === BackgroundType.COSMIC &&
          !this.hasUnsavedLocalEdit("backgroundType", userId);

        const remoteBackgroundType = normalizeBackgroundType(
          firebaseSettings.backgroundType
        );
        if (remoteBackgroundType && isUsingDefault) {
          if (remoteBackgroundType !== firebaseSettings.backgroundType) {
            const migratedType = remoteBackgroundType;
            debug.success(
              `Firebase has old "${firebaseSettings.backgroundType}", migrating to "${migratedType}"`
            );
            settingsState.backgroundType = migratedType;
            updateBodyBackground(migratedType);
            applyThemeForBackground(migratedType);
            updateThemeService(migratedType);
            this.saveSettingsToStorage(settingsState);
            await this.firebasePersistence.saveSettings(
              this.getSettingsForPersistence(userId)
            );
          } else {
            settingsState.backgroundType = remoteBackgroundType;
            if (firebaseSettings.backgroundCategory) {
              settingsState.backgroundCategory =
                firebaseSettings.backgroundCategory;
            }
            if (firebaseSettings.backgroundColor) {
              settingsState.backgroundColor = firebaseSettings.backgroundColor;
            }
            if (firebaseSettings.gradientColors) {
              settingsState.gradientColors = firebaseSettings.gradientColors;
            }
            if (firebaseSettings.gradientDirection !== undefined) {
              settingsState.gradientDirection =
                firebaseSettings.gradientDirection;
            }

            updateBodyBackground(remoteBackgroundType);
            applyThemeForBackground(remoteBackgroundType);
            updateThemeService(remoteBackgroundType);
            this.saveSettingsToStorage(settingsState);
            debug.success("Applied background from Firebase on initial login");
          }
        }

        if (
          firebaseSettings.darkMode !== undefined &&
          !this.hasUnsavedLocalEdit("darkMode", userId)
        ) {
          const animVisManager = getAnimationVisibilityManager();
          if (animVisManager.isDarkMode() !== firebaseSettings.darkMode) {
            animVisManager.setDarkMode(firebaseSettings.darkMode);
            debug.success(
              `Synced pictograph dark mode from Firebase: ${firebaseSettings.darkMode}`
            );
          }
        }

        debug.success("Applied settings from Firebase");
      } else {
        this.publishRemoteApplication(null, userId);
        await this.firebasePersistence.saveSettings(
          this.getSettingsForPersistence(userId)
        );
        debug.success("Pushed local settings to Firebase");
      }
    } catch (error) {
      console.error("❌ [SettingsState] Failed to sync from Firebase:", error);
    }
  }

  private getSettingsForPersistence(
    userId = auth.currentUser?.uid
  ): AppSettings {
    const snapshot = $state.snapshot(settingsState) as AppSettings & {
      _localTimestamp?: number;
    };
    delete snapshot._localTimestamp;
    if (!snapshot.backgroundType) {
      snapshot.backgroundType = BackgroundType.COSMIC;
    }
    const obj = snapshot as unknown as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      if (obj[key] === undefined) {
        delete obj[key];
      }
    }
    return userId
      ? this.sanitizeImageExportForUser(snapshot, userId)
      : snapshot;
  }

  private sanitizeImageExportForUser(
    settings: AppSettings,
    userId: string
  ): AppSettings {
    const owner = getColumnCountPreferenceOwner({ uid: userId });
    const sanitized = sanitizeColumnCountPreference(
      settings.imageExport,
      owner
    );
    return {
      ...settings,
      imageExport: {
        ...(settings.imageExport ?? {}),
        columnCountOverrides: sanitized.columnCountOverrides,
        columnCountPreferenceVersion: sanitized.columnCountPreferenceVersion,
        columnCountPreferenceOwner: sanitized.columnCountPreferenceOwner,
      },
    };
  }

  private applyRemoteSettings(
    remoteSettings: AppSettings,
    userId: string
  ): void {
    const { _localTimestamp: _remoteTs, ...remoteWithoutMeta } = remoteSettings;
    const merged = { ...DEFAULT_SETTINGS, ...remoteWithoutMeta };

    const excludeFromRealtimeSync = new Set([
      "backgroundType",
      "backgroundCategory",
      "backgroundQuality",
      "backgroundEnabled",
      "backgroundColor",
      "gradientColors",
      "gradientDirection",
      "leftPropType",
      "rightPropType",
      "catDogMode",
      "selectedPresetIndex",
      "compositionRecipeOverrides",
      "visibility",
    ]);

    for (const key in merged) {
      if (
        Object.prototype.hasOwnProperty.call(merged, key) &&
        key !== "_localTimestamp" &&
        !excludeFromRealtimeSync.has(key) &&
        !this.hasUnsavedLocalEdit(key as keyof AppSettings, userId)
      ) {
        settingsState[key as keyof AppSettings] = merged[
          key as keyof AppSettings
        ] as never;
      }
    }
    // Optional account slices must be cleared when the authoritative document
    // omits them; a shallow defaults merge cannot remove a stale local value.
    if (!this.hasUnsavedLocalEdit("imageExport", userId)) {
      settingsState.imageExport = remoteSettings.imageExport;
    }
    if (this.unsavedLocalOwner !== userId || this.unsavedLocalKeys.size === 0) {
      settingsState._localTimestamp = undefined;
    }

    if (
      remoteSettings.darkMode !== undefined &&
      !this.hasUnsavedLocalEdit("darkMode", userId)
    ) {
      const animVisManager = getAnimationVisibilityManager();
      if (animVisManager.isDarkMode() !== remoteSettings.darkMode) {
        animVisManager.setDarkMode(remoteSettings.darkMode);
      }
    }

    this.saveSettingsToStorage(settingsState);
    this.publishRemoteApplication(remoteSettings, userId);
  }

  /** Record an edit this session made but Firestore has not confirmed. */
  private markLocallyEdited(key: keyof AppSettings): void {
    const uid = auth.currentUser?.uid ?? null;
    if (this.unsavedLocalOwner !== uid) {
      this.unsavedLocalKeys.clear();
      this.unsavedLocalOwner = uid;
    }
    // A signed-out edit belongs to the device, not an account, so it must not
    // hold off the document restored at the next sign-in.
    if (!uid) return;
    this.localEditSequence += 1;
    this.unsavedLocalKeys.set(key, this.localEditSequence);
  }

  private hasUnsavedLocalEdit(
    key: keyof AppSettings,
    userId: string
  ): boolean {
    return this.unsavedLocalOwner === userId && this.unsavedLocalKeys.has(key);
  }

  /** Drop the pins on edits a now-confirmed write actually carried. */
  private releaseConfirmedLocalEdits(
    userId: string,
    payloadSequence: number
  ): void {
    if (this.unsavedLocalOwner !== userId) return;
    for (const [key, sequence] of this.unsavedLocalKeys) {
      if (sequence <= payloadSequence) this.unsavedLocalKeys.delete(key);
    }
  }

  private publishRemoteApplication(
    settings: AppSettings | null,
    userId: string
  ): void {
    this.lastRemoteApplication = { settings, userId };
    this.remoteAppliedListeners.forEach((listener) => {
      try {
        listener(settings, userId);
      } catch (error) {
        console.error(
          "❌ [SettingsState] Remote-applied listener failed:",
          error
        );
      }
    });
  }

  /**
   * Subscribe to settings that arrived from Firestore (initial sync or a live
   * snapshot). Distinct from reading `currentSettings`, which at boot is just the
   * localStorage mirror and can be older than both the local slice stores and the
   * server copy.
   */
  onRemoteSettingsApplied(
    listener: (settings: AppSettings | null, userId: string) => void
  ): () => void {
    this.remoteAppliedListeners.add(listener);
    if (this.lastRemoteApplication) {
      const { settings, userId } = this.lastRemoteApplication;
      try {
        listener(settings, userId);
      } catch (error) {
        console.error(
          "❌ [SettingsState] Remote-applied listener failed:",
          error
        );
      }
    }
    return () => this.remoteAppliedListeners.delete(listener);
  }

  cleanup(): void {
    if (this.unsubscribeFirebaseSync) {
      this.unsubscribeFirebaseSync();
      this.unsubscribeFirebaseSync = null;
    }

    if (this.firebaseSaveDebounceTimer) {
      clearTimeout(this.firebaseSaveDebounceTimer);
      this.firebaseSaveDebounceTimer = null;
    }

    // Everything already in flight belongs to the session being torn down.
    // Bumping the generation is what stops its continuations from writing into
    // the next session's bookkeeping.
    this.lifecycleGeneration += 1;
    this.activeSaveToken = 0;
    this.isSavingToFirebase = false;
    this.pendingFirebaseSave = null;
    this.resaveWhenIdle = false;

    this.syncInitialized = false;
    this.firebasePersistence = null;
    this.lastRemoteApplication = undefined;
    // The signed-out account's unconfirmed edits must not pin keys against the
    // next account's document.
    this.unsavedLocalKeys.clear();
    this.unsavedLocalOwner = null;
    this.queuedOfflineEdit = null;
    settingsState.imageExport = undefined;
    settingsState._localTimestamp = undefined;
    this.saveSettingsToStorage(settingsState);

    if (browser && typeof window !== "undefined" && this.onlineHandler) {
      window.removeEventListener("online", this.onlineHandler);
      this.onlineHandler = null;
    }
  }

  get settings() {
    return settingsState;
  }

  get currentSettings() {
    return settingsState;
  }

  async updateSetting<K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K]
  ): Promise<void> {
    const previousValue = settingsState[key];

    if (previousValue === value) {
      return;
    }

    const isSceneUndoable = key === "backgroundType" || key === "gridMode";
    if (isSceneUndoable) {
      const sceneUndo = getSceneUndoManager();
      const opType =
        key === "backgroundType"
          ? ("change-environment" as const)
          : ("change-grid-mode" as const);
      const desc =
        key === "backgroundType" ? `Environment: ${value}` : `Grid: ${value}`;
      sceneUndo.captureState(opType, desc);
    }

    settingsState[key] = value;

    this.markLocallyEdited(key);
    settingsState._localTimestamp = Date.now();

    if (key === "backgroundType") {
      const bgType = value as BackgroundType;
      updateBodyBackground(bgType);
      applyThemeForBackground(bgType);
      updateThemeService(bgType);
    }

    this.saveSettings();

    if (isSceneUndoable) {
      getSceneUndoManager().commitState();
    }

    try {
      void logSettingChange(key, String(previousValue), String(value));
    } catch {
      // Silent
    }
  }

  async updateSettings(newSettings: Partial<AppSettings>): Promise<void> {
    const oldBackgroundType = settingsState.backgroundType;
    const newBackgroundType = newSettings.backgroundType;
    const backgroundTypeChanged =
      newBackgroundType && newBackgroundType !== oldBackgroundType;

    for (const key in newSettings) {
      if (Object.prototype.hasOwnProperty.call(newSettings, key)) {
        settingsState[key as keyof AppSettings] = newSettings[
          key as keyof AppSettings
        ] as never;
        this.markLocallyEdited(key as keyof AppSettings);
      }
    }

    settingsState._localTimestamp = Date.now();

    if (newBackgroundType) {
      if (backgroundTypeChanged) {
        updateBodyBackground(newBackgroundType);
      }
      applyThemeForBackground(newBackgroundType);
      updateThemeService(newBackgroundType);
    }

    this.saveSettings();
  }

  async loadSettings(): Promise<void> {
    const loadedSettings = this.loadSettingsFromStorage();
    Object.assign(settingsState, loadedSettings);
  }

  saveSettings(): void {
    this.saveSettingsToStorage(settingsState);

    if (auth.currentUser && this.firebasePersistence) {
      this.debouncedSaveToFirebase();
    }
  }

  private debouncedSaveToFirebase(): void {
    if (this.firebaseSaveDebounceTimer) {
      clearTimeout(this.firebaseSaveDebounceTimer);
    }

    this.firebaseSaveDebounceTimer = setTimeout(() => {
      this.firebaseSaveDebounceTimer = null;
      this.saveToFirebaseWithRetry();
    }, SettingsState.FIREBASE_SAVE_DEBOUNCE_MS);
  }

  private saveToFirebaseWithRetry(): void {
    const userId = auth.currentUser?.uid;
    if (!this.firebasePersistence || !userId) {
      debug.warn(
        "Cannot save to Firebase: firebasePersistence not initialized"
      );
      return;
    }

    // One write at a time. Overlapping writes could settle in either order,
    // and an older one failing after a newer one succeeded would drop its
    // stale full snapshot into the offline queue — reverting the newer values
    // on the next reconnect. Serializing also means the flags below describe
    // exactly one write. Every payload is a full snapshot, so a request that
    // arrives mid-write is satisfied by one coalesced re-run afterwards.
    if (this.pendingFirebaseSave) {
      this.resaveWhenIdle = true;
      return;
    }

    const generation = this.lifecycleGeneration;
    const saveToken = this.claimWriteSlot();

    const settingsToSave = this.getSettingsForPersistence(userId);
    // The payload is a snapshot, so only edits made up to this point are on
    // their way to the server. The pins stay until the write is CONFIRMED: a
    // snapshot that arrives while this write is still open is still older than
    // local state. Anything edited after this line keeps its newer sequence
    // number and stays pinned for the next write.
    const payloadSequence = this.localEditSequence;

    debug.info("Saving settings to Firebase", {
      propPresetsCount: settingsToSave.propPresets?.length ?? 0,
      selectedPresetIndex: settingsToSave.selectedPresetIndex,
      leftPropType: settingsToSave.leftPropType,
      rightPropType: settingsToSave.rightPropType,
    });

    this.pendingFirebaseSave = this.firebasePersistence
      .saveSettings(settingsToSave)
      .then(() => {
        debug.success("Settings saved to Firebase successfully");
        if (this.lifecycleGeneration !== generation) return;
        this.releaseConfirmedLocalEdits(userId, payloadSequence);
        if (
          auth.currentUser?.uid === userId &&
          !(this.unsavedLocalOwner === userId && this.unsavedLocalKeys.size > 0)
        ) {
          settingsState._localTimestamp = undefined;
          this.saveSettingsToStorage(settingsState);
        }
        this.clearOfflineQueue(userId);
      })
      .catch((error) => {
        console.error("❌ [SettingsState] Failed to save to Firebase:", error);
        if (this.lifecycleGeneration !== generation) return;
        // The pins stay: the server never took these edits, so the account
        // document is still older than local state.
        this.queueOfflineChange(settingsToSave, userId, payloadSequence);
      })
      .finally(() => this.releaseWriteSlot(saveToken, generation));
  }

  /**
   * Take exclusive ownership of the single write slot. Both the debounced save
   * and the offline replay go through here: a replay that only *checked* the
   * slot without claiming it left `pendingFirebaseSave` null, so an edit made
   * mid-replay started a concurrent write — the exact overlap serialization
   * exists to prevent.
   */
  private claimWriteSlot(): number {
    this.saveTokenCounter += 1;
    this.activeSaveToken = this.saveTokenCounter;
    this.isSavingToFirebase = true;
    return this.activeSaveToken;
  }

  private releaseWriteSlot(saveToken: number, generation: number): void {
    // Only the write that owns the flags may clear them.
    if (this.activeSaveToken !== saveToken) return;
    this.isSavingToFirebase = false;
    this.pendingFirebaseSave = null;
    this.activeSaveToken = 0;

    if (this.lifecycleGeneration !== generation) return;
    if (this.resaveWhenIdle) {
      this.resaveWhenIdle = false;
      this.saveToFirebaseWithRetry();
    }
  }

  private offlineQueueKey(userId: string): string {
    return `${OFFLINE_QUEUE_KEY}:${encodeURIComponent(userId)}`;
  }

  private queueOfflineChange(
    settings: AppSettings,
    userId: string,
    sequence: number
  ): void {
    if (!browser) return;

    try {
      // Belt and braces alongside write serialization: a payload can only
      // replace a queued one that is the same age or older. An older snapshot
      // must never become what a reconnect replays.
      //
      // The comparison is scoped to this session. `sequence` counts edits in
      // memory and restarts at zero on reload, so comparing it against a
      // sequence persisted by an EARLIER session rejects the newer payload and
      // loses the edit entirely — a queued 5 from last session would beat this
      // session's 1. A queue entry from any other session is by definition
      // older than what this session is writing now.
      const existing = localStorage.getItem(this.offlineQueueKey(userId));
      if (existing) {
        const queued = JSON.parse(existing) as {
          sequence?: unknown;
          session?: unknown;
        };
        if (
          queued?.session === this.sessionId &&
          typeof queued.sequence === "number" &&
          queued.sequence > sequence
        ) {
          return;
        }
      }

      const queueEntry = {
        settings,
        sequence,
        session: this.sessionId,
        timestamp: Date.now(),
      };
      localStorage.setItem(
        this.offlineQueueKey(userId),
        JSON.stringify(queueEntry)
      );
      this.queuedOfflineEdit = { userId, sequence };
    } catch (error) {
      console.error("Failed to queue offline change:", error);
    }
  }

  private async processOfflineQueue(): Promise<void> {
    if (!browser) return;
    // A write in flight carries a newer full snapshot than anything queued and
    // clears the queue when it lands. Replaying now would race it with older
    // values.
    if (this.pendingFirebaseSave) return;

    const userId = auth.currentUser?.uid;
    if (!userId) return;

    const generation = this.lifecycleGeneration;

    try {
      const queuedData = localStorage.getItem(this.offlineQueueKey(userId));
      if (!queuedData) return;

      const queueEntry = JSON.parse(queuedData);
      if (!queueEntry?.settings) return;

      if (this.firebasePersistence && auth.currentUser?.uid === userId) {
        const settings = this.sanitizeImageExportForUser(
          normalizeLegacyAppSettings(queueEntry.settings),
          userId
        );

        // Claim the slot before awaiting. Checking it once and leaving it free
        // let an edit made DURING the replay start a concurrent write; if that
        // newer write landed first, the replay's older payload settled last and
        // won on the server.
        const replayToken = this.claimWriteSlot();
        const replay = this.firebasePersistence
          .saveSettings(settings)
          .finally(() => this.releaseWriteSlot(replayToken, generation));
        // The slot holds a non-rejecting view; a replay failure surfaces
        // through the await below and leaves the queue in place.
        this.pendingFirebaseSave = replay.catch(() => {});

        await replay;

        if (
          this.lifecycleGeneration !== generation ||
          auth.currentUser?.uid !== userId
        ) {
          return;
        }
        // The replayed payload is now on the server, so the edits it carried
        // no longer need protection from the account document.
        if (this.queuedOfflineEdit?.userId === userId) {
          this.releaseConfirmedLocalEdits(
            userId,
            this.queuedOfflineEdit.sequence
          );
        }
        this.clearOfflineQueue(userId);
      }
    } catch (error) {
      console.error("Failed to process offline queue:", error);
    }
  }

  private clearOfflineQueue(userId: string): void {
    if (this.queuedOfflineEdit?.userId === userId) {
      this.queuedOfflineEdit = null;
    }
    if (!browser) return;

    try {
      localStorage.removeItem(this.offlineQueueKey(userId));
    } catch (error) {
      console.error("Failed to clear offline queue:", error);
    }
  }

  clearStoredSettings(): void {
    if (!browser) return;

    try {
      localStorage.removeItem(SETTINGS_STORAGE_KEY);
      settingsState.imageExport = undefined;
      settingsState._localTimestamp = undefined;
      Object.assign(settingsState, DEFAULT_SETTINGS);

      if (auth.currentUser && this.firebasePersistence) {
        void this.firebasePersistence.clearSettings().catch((error) => {
          console.error(
            "❌ [SettingsState] Failed to clear Firebase settings:",
            error
          );
        });
      }
    } catch (error) {
      console.error("Failed to clear stored settings:", error);
    }
  }

  async resetToDefaults(): Promise<void> {
    settingsState.imageExport = undefined;
    settingsState._localTimestamp = undefined;
    Object.assign(settingsState, DEFAULT_SETTINGS);
    this.saveSettings();
  }

  debugSettings(): void {
    if (!browser) return;
  }

  private loadSettingsFromStorage(): AppSettings {
    if (!browser) return DEFAULT_SETTINGS;

    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (!stored) {
        return DEFAULT_SETTINGS;
      }

      const parsed = normalizeLegacyAppSettings(JSON.parse(stored)) as AppSettings & {
        developerMode?: boolean;
      };
      const merged = { ...DEFAULT_SETTINGS, ...parsed };

      if ("_localTimestamp" in merged) {
        delete merged._localTimestamp;
      }

      if (
        merged.developerMode === false ||
        merged.developerMode === undefined
      ) {
        merged.developerMode = true;
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged));
      }

      if (!merged.propPresets || merged.propPresets.length === 0) {
        merged.propPresets = DEFAULT_PROP_PRESETS;
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged));
      }

      const normalizedBackgroundType = normalizeBackgroundType(
        merged.backgroundType
      );
      if (normalizedBackgroundType !== merged.backgroundType) {
        merged.backgroundType =
          normalizedBackgroundType ?? BackgroundType.COSMIC;
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(merged));
      }

      return merged;
    } catch (error) {
      console.warn("Failed to load settings from localStorage:", error);
      return DEFAULT_SETTINGS;
    }
  }

  private saveSettingsToStorage(settings: AppSettings): void {
    if (!browser) return;

    try {
      localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify($state.snapshot(settings))
      );
    } catch (error) {
      console.error("Failed to save settings to localStorage:", error);
    }
  }
}

export { SettingsState };

export const settingsService = new SettingsState();
