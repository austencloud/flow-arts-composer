/**
 * What's New Modal State
 *
 * Manages the "What's New" modal that shows after version updates.
 * Tracks whether user has seen the current version's changelog.
 *
 * Uses OnboardingPersister for Firebase sync so the seen version
 * persists across devices and browser data clearing.
 *
 * Supports two modes:
 * - "auto": Triggered on app load for new versions (shows "Got it" button)
 * - "manual": Triggered by clicking version number (shows feedback + View All Releases)
 */

import { getOnboardingPersister } from "#lib/shared/onboarding/get-onboarding-persister.js";
import {
  compareVersions,
  type AppVersion,
} from "#lib/shared/versioning/domain/models/version-models.js";
import type { OnboardingPersister } from "#lib/shared/onboarding/services/onboarding-persister.js";
import * as versionService from "#lib/shared/feedback/services/version-service.js";

const STORAGE_KEY = "tka-last-seen-version";

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
  version = $state<AppVersion | null>(null);
  isLoading = $state(false);
  error = $state<string | null>(null);
  mode = $state<WhatsNewMode>("auto");

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
  }

  /**
   * Open the modal with version data (auto mode - triggered by version check on load)
   */
  open(version: AppVersion) {
    this.mode = "auto";
    this.version = version;
    this.isOpen = true;
  }

  /**
   * Open the modal with an already-loaded version (no refetch).
   * Used by the update toast, which already holds the version data — skips the
   * network round-trip openManual() would do. Manual mode so the footer shows
   * the "All Releases" affordance rather than the auto "Got it" framing.
   */
  openDetail(version: AppVersion) {
    this.mode = "manual";
    this.version = version;
    this.error = null;
    this.isOpen = true;
  }

  /**
   * Open the modal manually (triggered by clicking version number)
   * Loads the current version data first, then opens modal to prevent layout shift
   */
  async openManual() {
    this.mode = "manual";
    this.error = null;

    try {
      const versions = await versionService.getVersions();
      const currentVersion = versions.find((v) => v.version === __APP_VERSION__);
      this.version = currentVersion || null;
      // Open modal only after data is ready - prevents layout shift
      this.isOpen = true;
    } catch (err) {
      this.error = "Failed to load release notes";
      console.error("Failed to load version:", err);
      // Still open modal to show error state
      this.isOpen = true;
    }
  }

  /**
   * Close and mark as seen
   */
  close() {
    if (this.version) {
      this.markVersionAsSeen(this.version.version);
    }
    this.isOpen = false;
  }

  /**
   * Just close without marking as seen (for escape/backdrop)
   */
  dismiss() {
    if (this.version) {
      this.markVersionAsSeen(this.version.version);
    }
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
    this.version = null;
    this.isLoading = false;
    this.error = null;
    this.mode = "auto";
  }
}

export const whatsNewState = new WhatsNewState();
