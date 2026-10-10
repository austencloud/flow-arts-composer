/**
 * Composition Root
 *
 * The single sanctioned location where features/ implementations are wired
 * into shared/ service slots. This is the ONLY file in shared/ that may
 * import from features/ — all other shared/ files use interfaces and
 * registration patterns to avoid reverse imports.
 *
 * Boot sequence:
 *   1. +layout.svelte dynamically imports this module
 *   2. Critical registrations fire synchronously (Browse/Create deps)
 *   3. Deferred registrations load via requestIdleCallback
 *   4. Factory getters throughout shared/ can now resolve their deps
 */

// ── Critical: needed before first Browse/Create render ──
import { configureShortCodeManager } from "../qr/get-short-code-manager";
import { getBrowseLoader } from "#lib/shared/browse/get-browse-loader.js";

import { registerLoopDetector } from "../create/get-loop-detector";
import { loopDetector } from "#lib/features/create/generate/circular/services/loop-detector.js";

import {
  registerLoopDisplayResolver,
  registerLoopDisplayCacheClearer,
} from "../loop-labeler/get-loop-display-resolver";
import {
  resolveLoopDisplay,
  clearLoopDisplayCache,
} from "#lib/features/loop-labeler/services/loop-display-resolver.js";

import { registerLibraryRepository } from "./register-library-repository";

import { isBootProfileVerbose } from "../analytics/boot-profiler";

const _bootStart = typeof window !== "undefined" ? performance.now() : 0;

// ── Critical registrations (browser-only) ──
if (typeof window !== "undefined") {
  configureShortCodeManager(getBrowseLoader());
  registerLoopDetector(loopDetector);
  registerLoopDisplayResolver(resolveLoopDisplay);
  registerLoopDisplayCacheClearer(clearLoopDisplayCache);
  registerLibraryRepository();
}

if (typeof window !== "undefined" && isBootProfileVerbose()) {
  const totalBoot = performance.now() - _bootStart;
  console.log(
    `%c Composition root (critical) - ${Math.round(totalBoot)}ms`,
    "font-size: 13px; font-weight: bold; color: #81c784;"
  );
}

// ── Deferred registrations: video export, feedback, tag migration, etc. ──
// These pull heavy dependencies that aren't needed for first render.
if (typeof window !== "undefined") {
  const load = async (): Promise<void> => {
    try {
      await import("./deferred-registrations");
    } catch (error) {
      console.error("[CompositionRoot] Deferred registrations failed:", error);
    }
  };
  const scheduleLoad = () => void load();

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(scheduleLoad, { timeout: 2_000 });
  } else {
    setTimeout(scheduleLoad, 100);
  }
}
