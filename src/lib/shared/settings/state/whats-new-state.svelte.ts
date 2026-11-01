/**
 * What's New Modal State
 *
 * Manages the "What's New" sheet that shows after version updates and keeps
 * two marks about the reader's place in the release history:
 *
 * - seen: the newest release whose notes the reader has actually opened, in
 *   the sheet or on the Release Notes page. Synced through OnboardingPersister
 *   so it follows the account across devices. The unread dot shows while any
 *   published release is newer than this mark.
 * - toasted: the newest release the once-per-version toast has fired for.
 *   Local only; its worst failure after a device switch is one polite toast.
 *
 * Firing the toast no longer counts as seeing the notes. Only opening does.
 *
 * Supports two modes:
 * - "auto": Triggered on app load for new versions (shows "Got it" button)
 * - "manual": Triggered by clicking version number (shows feedback + View All Releases)
 */

import { getOnboardingPersister } from "#lib/shared/onboarding/get-onboarding-persister.js";
import {
  compareVersions,
  pickReleaseNotesVersion,
  selectUnseenVersions,
  type AppVersion,
} from "#lib/shared/versioning/domain/models/version-models.js";
import type { OnboardingPersister } from "#lib/shared/onboarding/services/onboarding-persister.js";
import * as versionService from "#lib/shared/feedback/services/version-service.js";

const STORAGE_KEY = "tka-last-seen-version";
const TOASTED_KEY = "tka-last-toasted-version";

export type WhatsNewMode = "auto" | "manual";

// Lazy service resolution to avoid circular dependencies
let _onboardingService: OnboardingPersister | null = null;

function getOnboardingService(): OnboardingPersister | null {
  if (_onboardingService) return _onboardingService;

  try {
    _onboardingService = getOnboardingPersister();
    return _onboardingService;
  } catch {
    return null;
  }
}

class WhatsNewState {
  isOpen = $state(false);
  /** The releases the sheet shows, newest first. One, unless catching up. */
  versions = $state<AppVersion[]>([]);
  isLoading = $state(false);
  error = $state<string | null>(null);
  mode = $state<WhatsNewMode>("auto");
  /**
   * Published releases the reader has not opened yet, newest first. Filled by
   * WhatsNewChecker once it has the version list; emptied the moment the
   * sheet or the Release Notes page opens. The unread dot reads this.
   */
  unseenVersions = $state<AppVersion[]>([]);

  /** The newest release shown, for the header and the single-release layout. */
  get version(): AppVersion | null {
    return this.versions[0] ?? null;
  }

  /** Whether anything published is still waiting to be read. */
  get hasUnseen(): boolean {
    return this.unseenVersions.length > 0;
  }

  /**
   * Check if user has seen the current version.
   * Uses OnboardingPersister if available, falls back to localStorage.
   */
  hasSeenVersion(version: string): boolean {
    // Try service first for cached cloud data
    const service = getOnboardingService();
    if (service) {
      return service.hasSeenVersion(version);
    }

    // Fall back to localStorage for synchronous access.
    // High-water-mark: seeing version N implies having seen everything <= N,
    // so a stale build never re-shows notes already dismissed elsewhere.
    if (typeof localStorage === "undefined") return true;
    const lastSeen = localStorage.getItem(STORAGE_KEY);
    if (!lastSeen) return false;
    return compareVersions(lastSeen, version) >= 0;
  }

  /** The newest release the reader has opened, or null before any baseline. */
  getLastSeenVersion(): string | null {
    const service = getOnboardingService();
    if (service) return service.getLastSeenVersion();
    if (typeof localStorage === "undefined") return null;
    return localStorage.getItem(STORAGE_KEY);
  }

  /**
   * Whether the user has ever seen ANY version's notes. Distinguishes a
   * first-ever visitor (no baseline) from a returning user landing on a new
   * version — the former should be baselined silently, not greeted with a
   * changelog for a build they're seeing for the first time.
   */
  hasSeenAnyVersion(): boolean {
    const service = getOnboardingService();
    if (service) return service.getLastSeenVersion() != null;

    if (typeof localStorage === "undefined") return true;
    return localStorage.getItem(STORAGE_KEY) != null;
  }

  /**
   * Mark current version as seen.
   * Updates localStorage immediately and syncs to Firebase via OnboardingPersister.
   * Stores the high-water mark — never downgrades to an older version.
   */
  markVersionAsSeen(version: string): void {
    if (typeof localStorage === "undefined") return;

    // Update localStorage immediately for synchronous access, keeping the
    // highest version seen so a stale build can't clobber a newer one.
    const lastSeen = localStorage.getItem(STORAGE_KEY);
    if (!lastSeen || compareVersions(version, lastSeen) > 0) {
      localStorage.setItem(STORAGE_KEY, version);
    }

    // Sync to Firebase via service (non-blocking)
    const service = getOnboardingService();
    if (service) {
      void service.markVersionAsSeen(version);
    }

    // Anything at or below the mark is read now.
    this.unseenVersions = this.unseenVersions.filter(
      (v) => compareVersions(v.version, version) > 0
    );
  }

  /** Whether the once-per-version toast has already fired for this version. */
  hasToastedVersion(version: string): boolean {
    if (typeof localStorage === "undefined") return true;
    const toasted = localStorage.getItem(TOASTED_KEY);
    if (!toasted) return false;
    return compareVersions(toasted, version) >= 0;
  }

  /** Remember that the toast fired, without counting the notes as read. */
  markVersionAsToasted(version: string): void {
    if (typeof localStorage === "undefined") return;
    const toasted = localStorage.getItem(TOASTED_KEY);
    if (!toasted || compareVersions(version, toasted) > 0) {
      localStorage.setItem(TOASTED_KEY, version);
    }
  }

  /**
   * Work out which published releases are still unread, for the dot and the
   * catch-up sheet. The checker calls this with the list it fetched.
   */
  setPublishedVersions(versions: readonly AppVersion[], current: string): void {
    this.unseenVersions = selectUnseenVersions(
      versions,
      this.getLastSeenVersion(),
      current
    );
  }

  /** Opening the sheet is what counts as reading the newest release it shows. */
  private show(versions: AppVersion[], mode: WhatsNewMode) {
    if (versions.length === 0) return;
    this.mode = mode;
    this.versions = versions;
    this.error = null;
    this.isOpen = true;
    this.markVersionAsSeen(versions[0]!.version);
  }

  /**
   * Open the modal with version data (auto mode - triggered by version check on load)
   */
  open(version: AppVersion) {
    this.show([version], "auto");
  }

  /**
   * Open the modal with an already-loaded version (no refetch).
   * Used by the update toast, which already holds the version data — skips the
   * network round-trip openManual() would do. Manual mode so the footer shows
   * the "All Releases" affordance rather than the auto "Got it" framing.
   */
  openDetail(version: AppVersion) {
    this.show([version], "manual");
  }

  /**
   * Catch up: every unread release in one sheet, newest first. Opening it
   * marks everything up to the newest as seen. Falls back to the newest
   * release alone when nothing is unread, so the action never looks dead.
   */
  openRollup(fallback?: AppVersion) {
    const unseen = this.unseenVersions;
    if (unseen.length > 0) {
      this.show([...unseen], "manual");
    } else if (fallback) {
      this.show([fallback], "manual");
    }
  }

  /**
   * Open the modal manually (triggered by clicking version number)
   * Loads the current version data first, then opens modal to prevent layout shift
   */
  async openManual() {
    this.mode = "manual";
    this.error = null;

    let picked: AppVersion | null = null;
    let unseen: AppVersion[] = [];
    try {
      const versions = await versionService.getVersions();
      // The running build can be ahead of the published notes (the version
      // bump ships before the release record exists), so fall back to the
      // newest notes instead of opening a modal with nothing to show.
      picked = pickReleaseNotesVersion(versions, __APP_VERSION__);
      unseen = selectUnseenVersions(
        versions,
        this.getLastSeenVersion(),
        __APP_VERSION__
      );
    } catch (err) {
      this.error = "Failed to load release notes";
      console.error("Failed to load version:", err);
    }

    if (unseen.length > 0) {
      // Open modal only after data is ready - prevents layout shift
      this.show(unseen, "manual");
      return;
    }
    if (picked) {
      this.show([picked], "manual");
      return;
    }

    // The modal renders only with a version, so with nothing to show it would
    // open invisibly and the click would look dead. Go to the Release Notes
    // page instead, which has its own empty and error states.
    const { handleModuleChange } = await import(
      "#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js"
    );
    await handleModuleChange("settings", "release-notes");
  }

  /**
   * The Release Notes page is the other place notes are read. Opening it
   * marks the running build as seen, which clears the dot.
   */
  noteReleaseNotesOpened(current: string = __APP_VERSION__) {
    this.markVersionAsSeen(current);
  }

  /**
   * Close the sheet. The newest release was marked seen when it opened.
   */
  close() {
    this.isOpen = false;
  }

  /**
   * Just close without marking as seen (for escape/backdrop)
   */
  dismiss() {
    this.isOpen = false;
  }

  setLoading(loading: boolean) {
    this.isLoading = loading;
  }

  setError(error: string | null) {
    this.error = error;
  }

  /**
   * Reset state (for testing)
   */
  reset() {
    this.isOpen = false;
    this.versions = [];
    this.unseenVersions = [];
    this.isLoading = false;
    this.error = null;
    this.mode = "auto";
  }
}

export const whatsNewState = new WhatsNewState();
