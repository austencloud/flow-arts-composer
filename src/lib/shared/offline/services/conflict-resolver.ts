/**
 * ConflictResolver - Detects and resolves version conflicts
 * for sequences edited on multiple devices.
 *
 * Uses the _version field on LibrarySequence to detect when
 * the server has a newer version than expected (indicating
 * another device saved changes while this device was offline).
 */

import type { LibrarySequence } from "#lib/shared/library/domain/models/library-sequence.js";
import type { VersionConflict, ConflictResolution, ConflictPromptCallback } from "./types";

export class ConflictResolver {
  private promptCallback: ConflictPromptCallback | null = null;

  /**
   * Track sequences we've already written locally but haven't synced.
   * Maps sequenceId -> version we wrote locally.
   * Cleared when the server confirms our write.
   */
  private localWriteVersions = new Map<string, number>();

  /**
   * Track which conflicts we've already prompted about to avoid
   * showing the dialog repeatedly for the same conflict.
   */
  private resolvedConflicts = new Set<string>();

  /**
   * Record that we just wrote a local version of a sequence.
   * Called by LibraryRepository after a non-blocking write.
   */
  trackLocalWrite(sequenceId: string, version: number): void {
    this.localWriteVersions.set(sequenceId, version);
  }

  /**
   * Clear the local write tracking for a sequence.
   * Called when the server confirms our write (snapshot matches our version).
   */
  confirmServerSync(sequenceId: string): void {
    this.localWriteVersions.delete(sequenceId);
    this.resolvedConflicts.delete(sequenceId);
  }

  detectConflict(
    localSequence: LibrarySequence,
    serverSequence: LibrarySequence
  ): VersionConflict | null {
    const sequenceId = localSequence.id;

    // Skip if we've already resolved this conflict
    if (this.resolvedConflicts.has(sequenceId)) {
      return null;
    }

    const localWriteVersion = this.localWriteVersions.get(sequenceId);

    // No pending local write for this sequence - no conflict possible
    if (localWriteVersion === undefined) {
      return null;
    }

    const serverVersion = (serverSequence._version ?? 0);

    // Server version is what we wrote - our write was accepted, no conflict
    if (serverVersion === localWriteVersion) {
      this.confirmServerSync(sequenceId);
      return null;
    }

    // Server version is HIGHER than what we wrote - another device saved
    if (serverVersion > localWriteVersion) {
      return {
        sequenceId,
        localVersion: localSequence,
        serverVersion: serverSequence,
      };
    }

    // Server version is lower - shouldn't happen, but not a conflict
    return null;
  }

  onConflict(callback: ConflictPromptCallback): void {
    this.promptCallback = callback;
  }

  async resolveConflict(
    conflict: VersionConflict,
    resolution: ConflictResolution
  ): Promise<void> {
    const { sequenceId } = conflict;

    // Mark as resolved so we don't prompt again
    this.resolvedConflicts.add(sequenceId);
    this.localWriteVersions.delete(sequenceId);

    if (resolution === "keep-local") {
      // Re-save the local version with an incremented version
      // This is handled by the caller (LibraryRepository) who has the write methods
      return;
    }

    // "use-server" - no action needed, the server version is already
    // in the snapshot listener and will update the UI
  }

  /**
   * Prompt the user to resolve a conflict (if a callback is registered).
   * Returns the resolution, or defaults to "use-server" if no prompt is registered.
   */
  async promptForResolution(conflict: VersionConflict): Promise<ConflictResolution> {
    if (this.promptCallback) {
      return this.promptCallback(conflict);
    }
    // Default: accept server version (safe default - preserves the most recent save)
    return "use-server";
  }
}
