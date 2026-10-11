/**
 * Deep Link Service Implementation
 *
 * Handles URL-based deep linking to modules with pre-loaded sequences.
 * Consolidates functionality from deep-link-init.ts and deep-link-handler.ts.
 * Also manages temporary storage for deep link data that modules consume on mount.
 *
 * Domain: Navigation - Deep Linking
 */

import { browser } from "$app/env";
import { goto } from "$app/navigation";
import { navigationState } from "../state/navigation-state.svelte";
import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
import type { DeepLinkResult, DeepLinkData, ModuleMapping } from "./types";
import { parseDeepLink } from "./sequence-encoder";
import { removeCurrentUrlParams } from "./url-state";

/**
 * Internal storage structure for deep link data
 */
interface StoredDeepLinkData {
  moduleId: string;
  tabId: string | undefined;
  sequence: SequenceData;
  timestamp: number;
}

/**
 * Module and tab mappings for deep links
 */
const MODULE_MAPPINGS: Record<string, ModuleMapping> = {
  construct: { moduleId: "create", tabId: "construct" },
  // Legacy alias. `satisfies` needed: TS skips contextual typing for a
  // literal property named `constructor`, so moduleId would widen to string.
  constructor: {
    moduleId: "create",
    tabId: "construct",
  } satisfies ModuleMapping,
  assemble: { moduleId: "create", tabId: "assemble" },
  assembler: { moduleId: "create", tabId: "assemble" }, // Legacy alias
  generate: { moduleId: "create", tabId: "generate" },
  generator: { moduleId: "create", tabId: "generate" }, // Legacy alias
  share: { moduleId: "share", navigateToModule: "create" },
  // Compose module - arrange is the main tab
  compose: { moduleId: "compose", tabId: "arrange" },
  arrange: { moduleId: "compose", tabId: "arrange" },
  // Legacy animation mode deep links - redirect to compose module arrange tab
  animate: { moduleId: "compose", tabId: "arrange" },
  single: { moduleId: "compose", tabId: "arrange" },
  tunnel: { moduleId: "compose", tabId: "arrange" },
  mirror: { moduleId: "compose", tabId: "arrange" },
  grid: { moduleId: "compose", tabId: "arrange" },
  browse: { moduleId: "browse", tabId: "gallery" },
  gallery: { moduleId: "browse", tabId: "gallery" },
  // View module uses standalone route
  view: { moduleId: "view" },
  sequence: { moduleId: "view" },
};

export class DeepLinker {
  /** Internal storage for deep link data (replaces deepLinkStore) */
  private storedData: StoredDeepLinkData | null = null;

  /**
   * Deep-link data is held only in memory, but a cold Create module load can
   * legitimately take more than five seconds on a phone. Keep the handoff
   * alive for one minute so initialization latency cannot silently discard a
   * URL the person just opened.
   */
  private static readonly STALE_THRESHOLD_MS = 60_000;

  initialize(): void {
    if (!browser) {
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);

    // Check for spotlight parameter (Browse module)
    const spotlightId = urlParams.get("spotlight");
    if (spotlightId) {
      // User is viewing a sequence in Browse - ensure we're in the browse module
      navigationState.setCurrentModule("browse");
      navigationState.setActiveTab("explore");
      return;
    }

    // Check for sheet parameter that might indicate a module
    const sheetType = urlParams.get("sheet");
    if (sheetType && !urlParams.has("open")) {
      // If we have a sheet but no sequence data, don't override the module
      return;
    }

    const url = window.location.search;

    if (!url || url.length === 0) {
      return;
    }

    try {
      const parsed = this.parseDeepLinkURL(url);

      if (!parsed) {
        return;
      }

      const mapping = MODULE_MAPPINGS[parsed.module.toLowerCase()];
      if (!mapping) {
        console.warn(`Unknown module in deep link: ${parsed.module}`);
        return;
      }

      // Handle "view" module by redirecting to standalone route
      if (mapping.moduleId === "view") {
        // Get the original encoded sequence from URL and redirect to /sequence/[id]
        const params = new URLSearchParams(url);
        const openParam = params.get("open");
        if (openParam) {
          const colonIndex = openParam.indexOf(":");
          const encodedSequence =
            colonIndex >= 0 ? openParam.substring(colonIndex + 1) : openParam;
          goto(`/sequence/${encodeURIComponent(encodedSequence)}`);
        }
        return;
      }

      // Store the sequence data for the module to consume
      this.setData(mapping.moduleId, parsed.sequence, mapping.tabId);

      // Navigate to the target module (use navigateToModule if specified, otherwise use moduleId)
      const targetModule = mapping.navigateToModule ?? mapping.moduleId;
      if (targetModule === "share") {
        // Unreachable in practice: the "share" pseudo-module always carries
        // navigateToModule. Guarding keeps the union narrowed to ModuleId
        // without a cast ("view" is already excluded by the early return above).
        return;
      }
      navigationState.setCurrentModule(targetModule);

      // Navigate to the target tab if specified
      if (mapping.tabId) {
        navigationState.setActiveTab(mapping.tabId);
      }
    } catch (error) {
      console.error("Error processing deep link:", error);
    }
  }

  processDeepLink(): DeepLinkResult | null {
    if (!browser) return null;

    const url = window.location.search;
    const parsed = this.parseDeepLinkURL(url);

    if (!parsed) return null;

    const mapping = MODULE_MAPPINGS[parsed.module.toLowerCase()];
    if (!mapping) {
      console.warn(`Unknown module in deep link: ${parsed.module}`);
      return null;
    }

    return {
      moduleId: mapping.moduleId,
      tabId: mapping.tabId,
      sequence: parsed.sequence,
    };
  }

  hasDeepLink(): boolean {
    if (!browser) return false;
    const params = new URLSearchParams(window.location.search);
    return params.has("open");
  }

  clearDeepLinkFromURL(): void {
    if (!browser) return;

    removeCurrentUrlParams(["open"]);
  }

  getModuleMapping(moduleName: string): ModuleMapping | undefined {
    return MODULE_MAPPINGS[moduleName.toLowerCase()];
  }

  // ===== Deep Link Data Store Methods =====

  setData(moduleId: string, sequence: SequenceData, tabId?: string): void {
    this.storedData = {
      moduleId,
      tabId,
      sequence,
      timestamp: Date.now(),
    };
  }

  consumeData(moduleId: string): DeepLinkData | null {
    if (this.storedData?.moduleId !== moduleId) {
      return null;
    }

    // Check if data is stale
    const isStale =
      Date.now() - this.storedData.timestamp > DeepLinker.STALE_THRESHOLD_MS;
    if (isStale) {
      this.storedData = null;
      return null;
    }

    // Consume the data (clear after reading)
    const result: DeepLinkData = {
      sequence: this.storedData.sequence,
      tabId: this.storedData.tabId,
    };
    this.storedData = null;
    return result;
  }

  hasDataForModule(moduleId: string): boolean {
    if (this.storedData?.moduleId !== moduleId) {
      return false;
    }

    const isStale =
      Date.now() - this.storedData.timestamp > DeepLinker.STALE_THRESHOLD_MS;
    return !isStale;
  }

  clearData(): void {
    this.storedData = null;
  }

  /**
   * Parse a deep link URL and extract module + sequence data
   */
  private parseDeepLinkURL(url: string): ReturnType<typeof parseDeepLink> {
    return parseDeepLink(url);
  }
}

// ============================================================================
// DIRECT SINGLETON EXPORT
// ============================================================================

export const deepLinker = new DeepLinker();
