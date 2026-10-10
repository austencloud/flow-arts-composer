/**
 * Version State
 *
 * Svelte 5 runes-based state for version tracking and release management.
 */

import * as versionService from "#lib/shared/feedback/services/version-service.js";
import type {
  AppVersion,
  VersionFeedbackItem,
  ChangelogEntry,
} from "../domain/models/version-models";
import { generateFromFeedback } from "#lib/shared/feedback/services/changelog-generator.js";

export interface VersionState {
  // Data
  versions: AppVersion[];
  selectedVersion: AppVersion | null;
  selectedVersionFeedback: VersionFeedbackItem[];
  completedFeedback: VersionFeedbackItem[];
  generatedChangelog: ChangelogEntry[];
  unversionedCount: number;
  latestVersion: string | null;

  // UI State
  isLoading: boolean;
  isPreparingRelease: boolean;
  isGeneratingChangelog: boolean;
  error: string | null;
  showPreparePanel: boolean;

  // Actions
  loadVersions: () => Promise<void>;
  loadVersionFeedback: (version: string) => Promise<void>;
  loadUnversionedCount: () => Promise<void>;
  loadCompletedFeedback: () => Promise<void>;
  generateChangelog: () => void;
  prepareRelease: (version: string) => Promise<void>;
  updateReleaseNotes: (version: string, releaseNotes: string) => Promise<void>;
  tagExistingAsPreRelease: () => Promise<number>;
  selectVersion: (version: AppVersion | null) => void;
  openPreparePanel: () => void;
  closePreparePanel: () => void;
}

export function createVersionState(): VersionState {
  // Reactive state
  let versions = $state<AppVersion[]>([]);
  let selectedVersion = $state<AppVersion | null>(null);
  let selectedVersionFeedback = $state<VersionFeedbackItem[]>([]);
  let completedFeedback = $state<VersionFeedbackItem[]>([]);
  let generatedChangelog = $state<ChangelogEntry[]>([]);
  let unversionedCount = $state(0);
  let latestVersion = $state<string | null>(null);
  let isLoading = $state(false);
  let isPreparingRelease = $state(false);
  let isGeneratingChangelog = $state(false);
  let error = $state<string | null>(null);
  let showPreparePanel = $state(false);

  async function loadVersions(): Promise<void> {
    isLoading = true;
    error = null;

    try {
      versions = await versionService.getVersions();
      latestVersion = await versionService.getLatestVersion();
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to load versions";
      console.error("Failed to load versions:", e);
    } finally {
      isLoading = false;
    }
  }

  async function loadVersionFeedback(version: string): Promise<void> {
    isLoading = true;
    error = null;

    try {
      selectedVersionFeedback =
        await versionService.getVersionFeedback(version);
    } catch (e) {
      error =
        e instanceof Error ? e.message : "Failed to load version feedback";
      console.error("Failed to load version feedback:", e);
    } finally {
      isLoading = false;
    }
  }

  async function loadUnversionedCount(): Promise<void> {
    try {
      unversionedCount = await versionService.getCompletedCount();
    } catch (e) {
      console.error("Failed to load completed count:", e);
    }
  }

  async function loadCompletedFeedback(): Promise<void> {
    isGeneratingChangelog = true;
    try {
      completedFeedback = await versionService.getCompletedFeedback();
      // Auto-generate changelog when feedback is loaded
      generatedChangelog = generateFromFeedback(completedFeedback);
    } catch (e) {
      console.error("Failed to load completed feedback:", e);
    } finally {
      isGeneratingChangelog = false;
    }
  }

  function regenerateChangelog(): void {
    generatedChangelog = generateFromFeedback(completedFeedback);
  }

  async function prepareRelease(version: string): Promise<void> {
    isPreparingRelease = true;
    error = null;

    try {
      // Use auto-generated changelog
      await versionService.prepareRelease(version, generatedChangelog);
      // Reload data
      await loadVersions();
      await loadUnversionedCount();
      showPreparePanel = false;
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to prepare release";
      console.error("Failed to prepare release:", e);
      throw e;
    } finally {
      isPreparingRelease = false;
    }
  }

  async function updateReleaseNotes(
    version: string,
    releaseNotes: string
  ): Promise<void> {
    error = null;

    try {
      await versionService.updateReleaseNotes(version, releaseNotes);
      // Update local state
      const idx = versions.findIndex((v) => v.version === version);
      if (idx !== -1 && versions[idx]) {
        versions[idx] = { ...versions[idx], releaseNotes } as AppVersion;
      }
      if (selectedVersion?.version === version) {
        selectedVersion = { ...selectedVersion, releaseNotes } as AppVersion;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : "Failed to update release notes";
      console.error("Failed to update release notes:", e);
      throw e;
    }
  }

  async function tagExistingAsPreRelease(): Promise<number> {
    isLoading = true;
    error = null;

    try {
      const count = await versionService.tagExistingAsPreRelease();
      // Reload data
      await loadVersions();
      await loadUnversionedCount();
      return count;
    } catch (e) {
      error =
        e instanceof Error ? e.message : "Failed to tag existing feedback";
      console.error("Failed to tag existing feedback:", e);
      throw e;
    } finally {
      isLoading = false;
    }
  }

  function selectVersion(version: AppVersion | null): void {
    selectedVersion = version;
    if (version) {
      loadVersionFeedback(version.version);
    } else {
      selectedVersionFeedback = [];
    }
  }

  function openPreparePanel(): void {
    loadUnversionedCount();
    loadCompletedFeedback(); // Auto-generate changelog
    showPreparePanel = true;
  }

  function closePreparePanel(): void {
    showPreparePanel = false;
  }

  return {
    get versions() {
      return versions;
    },
    get selectedVersion() {
      return selectedVersion;
    },
    get selectedVersionFeedback() {
      return selectedVersionFeedback;
    },
    get completedFeedback() {
      return completedFeedback;
    },
    get generatedChangelog() {
      return generatedChangelog;
    },
    get unversionedCount() {
      return unversionedCount;
    },
    get latestVersion() {
      return latestVersion;
    },
    get isLoading() {
      return isLoading;
    },
    get isPreparingRelease() {
      return isPreparingRelease;
    },
    get isGeneratingChangelog() {
      return isGeneratingChangelog;
    },
    get error() {
      return error;
    },
    get showPreparePanel() {
      return showPreparePanel;
    },
    loadVersions,
    loadVersionFeedback,
    loadUnversionedCount,
    loadCompletedFeedback,
    generateChangelog: regenerateChangelog,
    prepareRelease,
    updateReleaseNotes,
    tagExistingAsPreRelease,
    selectVersion,
    openPreparePanel,
    closePreparePanel,
  };
}
