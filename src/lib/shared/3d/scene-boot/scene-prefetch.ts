import { browser } from "$app/env";
import type { BackgroundType } from "@austencloud/backgrounds";

import {
  VIEWER_3D_ENVIRONMENT_STORAGE_KEY,
  getSceneEnvironmentRendererKey,
  normalizeSceneEnvironmentId,
} from "../environments/domain/scene-environment";
import { isDesktop } from "#lib/shared/desktop/is-desktop.js";

import { DECODER_RUNTIME_URLS, sceneAssetUrls } from "./scene-asset-manifest";
import {
  _resetForTests as _resetSceneModulesForTests,
  warmSceneModule,
} from "./scene-module-prefetch";

const warmed = new Set<string>();

interface SaveDataConnection {
  saveData?: boolean;
}

function shouldSkipWarming(): boolean {
  if (!browser) return true;
  // The desktop build reads its scenes from the local asset bundle; there is
  // no network transfer to hide.
  if (isDesktop()) return true;
  if (navigator.onLine === false) return true;
  // Warming spends bandwidth the user has not asked to spend yet. Data Saver is
  // an explicit request not to.
  const connection = (navigator as Navigator & { connection?: SaveDataConnection })
    .connection;
  return connection?.saveData === true;
}

function onIdle(run: () => void): void {
  const schedule = (
    globalThis as {
      requestIdleCallback?: (callback: () => void) => number;
    }
  ).requestIdleCallback;
  if (typeof schedule === "function") schedule(run);
  else setTimeout(run, 200);
}

async function warmUrls(urls: readonly string[]): Promise<void> {
  // Sequential on purpose: these downloads must never compete with whatever the
  // user is actually looking at. A failure means the asset simply loads the
  // normal way later, so it is not worth reporting.
  for (const url of urls) {
    if (warmed.has(url)) continue;
    warmed.add(url);
    try {
      await fetch(url, { priority: "low" } as RequestInit);
    } catch {
      warmed.delete(url);
    }
  }
}

/**
 * Pull the selected environment's models into the HTTP cache while the browser
 * is idle, so opening 3D reads them from disk instead of the network. Only the
 * selected background — the ten scenes together run to hundreds of megabytes.
 */
export function warmSceneAssets(background: BackgroundType): void {
  if (shouldSkipWarming()) return;
  const urls = sceneAssetUrls(background);
  if (urls.length === 0) return;
  onIdle(() => void warmUrls(urls));
}

/**
 * Warm just the scene's component chunk. Environment3D cannot request a single
 * model until that module has landed, so on a scene the session has not shown
 * yet this download is the front of the wait — and it is small enough to start
 * on a glance. Safe to call for every tile a pointer crosses.
 *
 * Deliberately code only. Warming the scene's MODELS from the same gesture was
 * measured and removed: a hover-warmed 12.3 MB `blossom_environment.glb`
 * transferred in full a second time when the mount asked for it 450 ms later
 * (`transferSize` 12,324,516 on both entries), and a controlled retry put the
 * boundary between a 5 MB model, which came back from cache, and models of
 * 12 MB and up, which never did. Those are exactly the scenes worth warming, so
 * on that path the warm-up only doubles the bytes and the decode the user is
 * already waiting through.
 */
export function warmSceneCode(background: BackgroundType): void {
  if (shouldSkipWarming()) return;
  warmSceneModule(background);
}

/**
 * Warm specific models a caller knows its scene waits on, when the manifest's
 * whole list would fetch models that renderer never loads.
 */
export function warmSceneUrls(urls: readonly string[]): void {
  if (shouldSkipWarming() || urls.length === 0) return;
  onIdle(() => void warmUrls(urls));
}

/**
 * Warm the environment the viewer will actually open, read from the same
 * remembered choice the viewer boots with, plus the shared decoders. Callers
 * that only know 3D is one click away — the split pane, fullscreen, a saved
 * scene preview — use this rather than resolving the environment themselves.
 */
export function warmSelectedSceneAssets(): void {
  if (shouldSkipWarming()) return;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(VIEWER_3D_ENVIRONMENT_STORAGE_KEY);
  } catch {
    stored = null;
  }
  warmSceneAssets(
    getSceneEnvironmentRendererKey(normalizeSceneEnvironmentId(stored))
  );
  warmDecoderRuntimes();
}

export function warmDecoderRuntimes(): void {
  if (shouldSkipWarming()) return;
  onIdle(() => void warmUrls(DECODER_RUNTIME_URLS));
}

export function _resetForTests(): void {
  warmed.clear();
  _resetSceneModulesForTests();
}
