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
} from "../domain/app-settings";
import {
  healPropPair,
  isPropPairKey,
  normalizePropPatch,
  PROP_PAIR_KEYS,
} from "../domain/prop-pair-rule";
import { DEFAULT_FAN_APPEARANCE } from "../../pictograph/prop/domain/fan-appearance";
import { DEFAULT_PROP_LOOK } from "../../pictograph/prop/domain/prop-look";
import { DEFAULT_TRIANGLE_GRIP } from "../../pictograph/prop/domain/triangle-appearance";
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
import { defaultPropPresets } from "../domain/prop-presets";
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
// Version 2 queues changes key by key. Unversioned entries held a whole copy
// of the settings and are retired unreplayed.
const OFFLINE_QUEUE_VERSION = 2;

/** One setting a failed write could not upload, and the edit it came from. */
interface QueuedChange {
  value: unknown;
  session: string;
  sequence: number;
}

function isQueuedChanges(
  value: unknown
): value is Record<string, QueuedChange> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every(
    (change) =>
      typeof change === "object" &&
      change !== null &&
      "value" in change &&
      typeof (change as QueuedChange).session === "string" &&
      typeof (change as QueuedChange).sequence === "number"
  );
}

const DEFAULT_PROP_PRESETS = defaultPropPresets();

export const DEFAULT_SETTINGS: AppSettings = {
  gridMode: GridMode.DIAMOND,
  backgroundType: BackgroundType.COSMIC,
  backgroundQuality: "medium",
  backgroundEnabled: true,
  hapticFeedback: true,
  reducedMotion: false,
  catDogMode: false,
  leftPropType: PropType.STAFF,
  rightPropType: PropType.STAFF,
  propType: PropType.STAFF,
  fanAppearance: DEFAULT_FAN_APPEARANCE,
  triangleGrip: DEFAULT_TRIANGLE_GRIP,
  propArtwork: DEFAULT_PROP_LOOK,
  primaryPropColors: null,
  blockedStartPlacements: [],
  blockedStartPlacementsByGridMode: {},
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
    const merged = { ...DEFAULT_SETTINGS, ...parsed };
    // Heal the stored fields, not the defaults-merged object: DEFAULT_SETTINGS
    // always has both hands, which would mask a legacy propType-only profile
    // that never recorded a right hand.
    return { ...merged, ...healPropPair(parsed) };
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
  // Keys the signed-in user changed here that Firestore has not confirmed yet.
  // The account document the initial load returns — and any snapshot echoing an
  // earlier write — predates these edits, so applying them wholesale reverts
  // the choice the user just made. They are also the whole upload: a write
  // carries only these keys, so it cannot send back a value this tab merely
  // received from another tab or device.
  // Scoped to the editing UID: browser-local settings are shared by every
  // identity on this device, so a pre-sign-in edit still yields to the account
  // document. Each key carries the sequence number of its latest edit, so a
  // write confirms only the edits its payload actually carried.
  private unsavedLocalKeys = new Map<keyof AppSettings, number>();
  private unsavedLocalOwner: string | null = null;
  private localEditSequence = 0;
  // Distinguishes queue entries this page load wrote from ones a previous load
  // or another tab left behind; edit sequence numbers are only comparable
  // within a session.
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
  // A save requested while another is open. Every write carries all the edits
  // still unconfirmed when it starts, plus the offline queue, so one coalesced
  // re-run after the open write settles covers everything.
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

      // An edit made after sign-in but before this sync existed is pinned
      // with no write behind it. Until something uploads it, the pin keeps
      // every remote change to that setting out of this tab.
      if (
        this.unsavedLocalOwner === syncUserId &&
        this.unsavedLocalKeys.size > 0
      ) {
        this.debouncedSaveToFirebase();
      }

      if (this.firebasePersistence.onSettingsChange) {
        const unsubscribe = this.firebasePersistence.onSettingsChange(
          (remoteSettings) => {
            // Applied even while a write is open or waiting to go: pins hold
            // every key this tab has not had confirmed, and only those keys
            // are uploaded. Dropping snapshots during a write left this tab
            // holding another tab's old values — for a whole offline stretch,
            // at worst — until its next write put them back on the account.
            if (
              this.lifecycleGeneration === generation &&
              auth.currentUser?.uid === syncUserId
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
            // Only the renamed key. A whole-settings write here would put this
            // tab's copy of every other setting back over whatever another
            // tab changed since the load.
            await this.firebasePersistence.saveSettings({
              backgroundType: migratedType,
            });
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

  private sanitizeImageExportForUser<T extends Partial<AppSettings>>(
    settings: T,
    userId: string
  ): T {
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
      "compositionRecipeOverrides",
      "visibility",
    ]);

    for (const key in merged) {
      if (
        Object.prototype.hasOwnProperty.call(merged, key) &&
        key !== "_localTimestamp" &&
        !excludeFromRealtimeSync.has(key) &&
        !isPropPairKey(key) &&
        !this.hasUnsavedLocalEdit(key as keyof AppSettings, userId)
      ) {
        settingsState[key as keyof AppSettings] = merged[
          key as keyof AppSettings
        ] as never;
      }
    }
    // The prop pair is one choice, so it lands whole or not at all: a hand
    // picked here that the server has not confirmed keeps the local pair.
    // It heals from the remote fields, not the defaults merge, which would
    // mask a legacy propType-only document.
    if (!PROP_PAIR_KEYS.some((key) => this.hasUnsavedLocalEdit(key, userId))) {
      Object.assign(settingsState, healPropPair(remoteWithoutMeta));
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
    this.pendingFirebaseSave = null;
    this.resaveWhenIdle = false;

    this.syncInitialized = false;
    this.firebasePersistence = null;
    this.lastRemoteApplication = undefined;
    // The signed-out account's unconfirmed edits must not pin keys against the
    // next account's document.
    this.unsavedLocalKeys.clear();
    this.unsavedLocalOwner = null;
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

    // Pair fields carry companions (the other hand, the flag, propType), so
    // they go through the normalized patch path and are marked edited together.
    // This must run before the no-op short-circuit below: a legacy propType
    // write that matches the stored propType (e.g. propType already reflects
    // the left hand) can still need to fold the right hand into line, and
    // normalizePropPatch is what handles that no-op-looking patch correctly.
    if (isPropPairKey(key)) {
      await this.updateSettings({ [key]: value } as Partial<AppSettings>);
      try {
        void logSettingChange(key, String(previousValue), String(value));
      } catch {
        // Silent
      }
      return;
    }

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
    newSettings = normalizePropPatch(settingsState, newSettings);
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
    // and an older one failing after a newer one succeeded would queue its
    // stale values — reverting the newer ones on the next reconnect.
    // Serializing also means the bookkeeping in writeToFirebase describes
    // exactly one write. A request that arrives mid-write is satisfied by one
    // coalesced re-run afterwards, which carries whatever is still unconfirmed.
    if (this.pendingFirebaseSave) {
      this.resaveWhenIdle = true;
      return;
    }

    void this.writeToFirebase(userId);
  }

  /**
   * Upload this tab's unconfirmed edits, and whatever the offline queue holds,
   * as one merge write. Only edited keys travel. A whole-settings payload also
   * carried this tab's copy of every other setting, so a change another tab or
   * device had made — one this tab had not applied yet — went back to the old
   * value on every device.
   *
   * Resolves once the write settles; a failure is handled here, never thrown.
   */
  private writeToFirebase(userId: string): Promise<void> {
    const persistence = this.firebasePersistence;
    if (!persistence) return Promise.resolve();

    const generation = this.lifecycleGeneration;
    // Every edit made up to this point is in the payload. The pins stay until
    // the write is CONFIRMED: a snapshot that arrives while it is still open is
    // still older than local state. Anything edited after this line keeps its
    // newer sequence number and stays pinned for the next write.
    const payloadSequence = this.localEditSequence;
    const edits = this.collectUnsavedEdits(userId);
    const queued = this.readOfflineQueue(userId);

    // Queued changes ride along unless a local edit to the same setting
    // replaces them. The prop pair is one unit, so a local pair replaces the
    // queued pair whole.
    const editsPair = PROP_PAIR_KEYS.some((key) => key in edits);
    const payload: Record<string, unknown> = {};
    for (const [key, change] of Object.entries(queued)) {
      if (editsPair && isPropPairKey(key)) continue;
      payload[key] = change.value;
    }
    Object.assign(payload, edits);

    if (Object.keys(payload).length === 0) {
      // Nothing to carry. A pin whose value is unset has nothing to upload,
      // and holding it would keep that setting's remote changes out for good.
      this.releaseConfirmedLocalEdits(userId, payloadSequence);
      return Promise.resolve();
    }

    const upload =
      payload.imageExport === undefined
        ? (payload as Partial<AppSettings>)
        : this.sanitizeImageExportForUser(
            payload as Partial<AppSettings>,
            userId
          );

    debug.info("Saving settings to Firebase", { keys: Object.keys(upload) });

    const saveToken = this.claimWriteSlot();
    const write = persistence
      .saveSettings(upload)
      // Settle this write's bookkeeping BEFORE the slot is released. Releasing
      // it synchronously starts the coalesced next write, which must not read
      // back queue entries this one already delivered.
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
        this.settleOfflineQueue(userId, queued);
      })
      .catch((error) => {
        console.error("❌ [SettingsState] Failed to save to Firebase:", error);
        if (this.lifecycleGeneration !== generation) return;
        // The pins stay: the server never took these edits, so the account
        // document is still older than local state. Only this tab's own edits
        // are queued; the replayed changes never left the queue.
        const failedEdits: Record<string, unknown> = {};
        for (const key of Object.keys(edits)) {
          failedEdits[key] = (upload as Record<string, unknown>)[key];
        }
        this.queueFailedEdits(userId, failedEdits, payloadSequence);
      })
      .finally(() => this.releaseWriteSlot(saveToken, generation));
    this.pendingFirebaseSave = write;
    return write;
  }

  /**
   * This tab's unconfirmed edits for `userId`, read from current state. A
   * pinned pair key brings the whole prop pair: another tab must never receive
   * one hand spliced onto its own copy of the other.
   */
  private collectUnsavedEdits(userId: string): Record<string, unknown> {
    const edits: Record<string, unknown> = {};
    if (this.unsavedLocalOwner !== userId) return edits;

    const keys = new Set<keyof AppSettings>(this.unsavedLocalKeys.keys());
    if (PROP_PAIR_KEYS.some((key) => keys.has(key))) {
      for (const key of PROP_PAIR_KEYS) keys.add(key);
    }
    for (const key of keys) {
      if (key === "_localTimestamp") continue;
      const value = $state.snapshot(settingsState[key]);
      // Firestore rejects undefined; an unset value has nothing to upload.
      if (value !== undefined) edits[key] = value;
    }
    return edits;
  }

  /**
   * Take exclusive ownership of the single write slot, before anything is
   * awaited. A replay that only *checked* the slot left `pendingFirebaseSave`
   * null, so an edit made mid-replay started a concurrent write — the exact
   * overlap serialization exists to prevent.
   */
  private claimWriteSlot(): number {
    this.saveTokenCounter += 1;
    this.activeSaveToken = this.saveTokenCounter;
    return this.activeSaveToken;
  }

  private releaseWriteSlot(saveToken: number, generation: number): void {
    // Only the write that owns the slot may clear it.
    if (this.activeSaveToken !== saveToken) return;
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

  /**
   * The queued changes for `userId`. Every tab on this device shares the one
   * queue. An entry from before changes were queued key by key is retired
   * unreplayed: it held a whole copy of the settings with nothing to say which
   * values were edits, so replaying it put back every value in it.
   */
  private readOfflineQueue(userId: string): Record<string, QueuedChange> {
    if (!browser) return {};

    const storageKey = this.offlineQueueKey(userId);
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) return {};

      const entry = JSON.parse(stored) as {
        version?: unknown;
        changes?: unknown;
      } | null;
      if (
        entry?.version !== OFFLINE_QUEUE_VERSION ||
        !isQueuedChanges(entry.changes)
      ) {
        localStorage.removeItem(storageKey);
        return {};
      }
      return entry.changes;
    } catch (error) {
      console.error("Failed to read offline queue:", error);
      return {};
    }
  }

  private writeOfflineQueue(
    userId: string,
    changes: Record<string, QueuedChange>
  ): void {
    const storageKey = this.offlineQueueKey(userId);
    if (Object.keys(changes).length === 0) {
      localStorage.removeItem(storageKey);
      return;
    }
    localStorage.setItem(
      storageKey,
      JSON.stringify({ version: OFFLINE_QUEUE_VERSION, changes })
    );
  }

  /**
   * Queue the edits a failed write carried, merged key by key into whatever
   * the queue already holds. Replacing the queue whole dropped another tab's
   * failed edits, and a replay then released pins on values it never carried.
   */
  private queueFailedEdits(
    userId: string,
    edits: Record<string, unknown>,
    sequence: number
  ): void {
    if (!browser) return;

    try {
      const changes = this.readOfflineQueue(userId);
      // Belt and braces alongside write serialization: an older edit of this
      // session must never replace a newer queued one, because the queue is
      // what a reconnect replays.
      //
      // The comparison is scoped to this session. `sequence` counts edits in
      // memory and restarts at zero on reload, so comparing it against a
      // sequence persisted by an EARLIER session rejects the newer edit and
      // loses it — a queued 5 from last session would beat this session's 1.
      // A change queued by any other session is taken as older than what this
      // session is writing now.
      const queuedIsNewer = (key: string) => {
        const queued = changes[key];
        return queued?.session === this.sessionId && queued.sequence > sequence;
      };
      // The prop pair is kept or replaced whole, never spliced.
      const keepQueuedPair = PROP_PAIR_KEYS.some(queuedIsNewer);
      if (!keepQueuedPair && PROP_PAIR_KEYS.some((key) => key in edits)) {
        for (const key of PROP_PAIR_KEYS) delete changes[key];
      }

      for (const [key, value] of Object.entries(edits)) {
        if (isPropPairKey(key) ? keepQueuedPair : queuedIsNewer(key)) continue;
        changes[key] = { value, session: this.sessionId, sequence };
      }
      this.writeOfflineQueue(userId, changes);
    } catch (error) {
      console.error("Failed to queue offline change:", error);
    }
  }

  /**
   * Replay the offline queue now: at sign-in, and when the connection returns.
   * The replay is an ordinary write, so it takes the write slot and carries
   * this tab's own unconfirmed edits along with the queue.
   */
  private async processOfflineQueue(): Promise<void> {
    if (!browser || !this.firebasePersistence) return;

    const userId = auth.currentUser?.uid;
    if (!userId) return;
    if (Object.keys(this.readOfflineQueue(userId)).length === 0) return;

    // The write that follows the open one reads the queue afresh.
    if (this.pendingFirebaseSave) {
      this.resaveWhenIdle = true;
      return;
    }
    await this.writeToFirebase(userId);
  }

  /**
   * Remove the queued changes a confirmed write covered — the ones it carried
   * and the ones a newer local edit replaced in its payload. A change queued
   * while the write was open replaced the entry the write read, so it no
   * longer matches and stays for the next write. Deleting it would drop that
   * edit from the server, the queue, and the pin set at once.
   */
  private settleOfflineQueue(
    userId: string,
    covered: Record<string, QueuedChange>
  ): void {
    if (!browser) return;

    try {
      const changes = this.readOfflineQueue(userId);
      let settled = false;
      for (const [key, change] of Object.entries(covered)) {
        const current = changes[key];
        if (
          current?.session === change.session &&
          current.sequence === change.sequence
        ) {
          delete changes[key];
          settled = true;
        }
      }
      if (settled) this.writeOfflineQueue(userId, changes);
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
    // Uploads carry only edited keys, so the reset counts as an edit of every
    // setting it restored.
    for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof AppSettings)[]) {
      this.markLocallyEdited(key);
    }
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
      // Heal the stored fields, not the defaults-merged object: see
      // initialSettings above for why.
      Object.assign(merged, healPropPair(parsed));

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
