/**
 * URL Sync Service Implementation
 *
 * Handles keeping the browser URL in sync with the current sequence
 * so users can share by simply copying the URL bar at any time.
 *
 * Uses replaceState to avoid filling browser history with edits.
 * Debounces updates to avoid constant URL changes while editing.
 *
 * Domain: Navigation - Live URL Synchronization
 */

import { browser } from "$app/env";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { DebouncedUrlSync, URLSyncOptions } from "./types";
import { generateShareURL } from "./sequence-encoder";
import { mutateCurrentUrl, removeCurrentUrlParams } from "./url-state";

export class URLSyncer {
  private pendingUpdate: ReturnType<typeof setTimeout> | null = null;

  syncURLWithSequence(
    sequence: SequenceData | null,
    module: string,
    options: URLSyncOptions = {}
  ): void {
    if (!browser) return;

    const { debounce = 500, immediate = false, allowClear = true } = options;

    // Clear any pending update
    this.cancelPendingUpdates();

    // If no sequence, only clear if explicitly allowed
    if (!sequence?.steps || sequence.steps.length === 0) {
      if (allowClear) {
        this.clearSequenceFromURL();
      }
      return;
    }

    const updateURL = () => {
      try {
        const { url } = generateShareURL(sequence, module, { compress: true });

        const urlObj = new URL(url);
        const nextOpenParam = urlObj.searchParams.get("open");

        if (
          nextOpenParam &&
          new URL(window.location.href).searchParams.get("open") !==
            nextOpenParam
        ) {
          mutateCurrentUrl((currentUrl) => {
            currentUrl.searchParams.set("open", nextOpenParam);
          });
        }
      } catch (error) {
        console.error("Failed to sync URL with sequence:", error);
      }
    };

    // Immediate update or debounce
    if (immediate) {
      updateURL();
    } else {
      // Debounce to avoid constant updates while editing
      this.pendingUpdate = setTimeout(updateURL, debounce);
    }
  }

  clearSequenceFromURL(): void {
    if (!browser) return;

    removeCurrentUrlParams(["open"]);
  }

  hasSequenceInURL(): boolean {
    if (!browser) return false;
    const params = new URLSearchParams(window.location.search);
    return params.has("open");
  }

  createDebouncedSync(module: string, debounceMs = 500): DebouncedUrlSync {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const sync: DebouncedUrlSync = (sequence: SequenceData | null) => {
      if (timeout) {
        clearTimeout(timeout);
      }

      timeout = setTimeout(() => {
        this.syncURLWithSequence(sequence, module, { immediate: true });
        timeout = null;
      }, debounceMs);
    };

    sync.cancel = () => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
    };

    return sync;
  }

  cancelPendingUpdates(): void {
    if (this.pendingUpdate) {
      clearTimeout(this.pendingUpdate);
      this.pendingUpdate = null;
    }
  }
}
