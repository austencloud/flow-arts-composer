import { browser } from "$app/env";
import type { BackgroundType } from "@austencloud/backgrounds";

import {
  VIEWER_3D_ENVIRONMENT_STORAGE_KEY,
  getSceneEnvironmentRendererKey,
  normalizeSceneEnvironmentId,
} from "../environments/domain/scene-environment";
import { isDesktop } from "#lib/shared/desktop/is-desktop.js";
import { MIN_3D_VIEWPORT_PX } from "#lib/shared/device/domain/constants/device-constants.js";

import { DECODER_RUNTIME_URLS, sceneAssetUrls } from "./scene-asset-manifest";
import {
  _resetForTests as _resetSceneModulesForTests,
  warmSceneModule,
} from "./scene-module-prefetch";

const warmed = new Set<string>();

interface SaveDataConnection {
  saveData?: boolean;
  effectiveType?: string;
}

/**
 * How long a warm-up waits for an idle moment before it starts anyway.
 * Measured 2026-11-14: on a throttled tablet the 2D animation keeps the main
 * thread busy enough that an idle callback with no deadline never ran before
 * the visitor tapped 3D, and on slow 4G it woke 22 to 32 s after the tap and
 * competed with the real load. The downloads themselves are low priority and
 * sequential, so starting them on a deadline costs the 2D view nothing.
 */
export const WARM_IDLE_DEADLINE_MS = 2500;

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
  if (connection?.saveData === true) return true;
  // A 2g link cannot hide megabytes before a tap; it would only slow the page
  // the visitor is reading.
  return /(^|-)2g$/.test(connection?.effectiveType ?? "");
}

/**
 * The viewer only offers 3D when the shorter side of the window is at least
 * MIN_3D_VIEWPORT_PX, so a phone never needs the models.
 */
function threeDIsOffered(): boolean {
  if (typeof window === "undefined") return false;
  return Math.min(window.innerWidth, window.innerHeight) >= MIN_3D_VIEWPORT_PX;
}

function onIdle(run: () => void, signal?: AbortSignal): void {
  const schedule = (
    globalThis as {
      requestIdleCallback?: (callback: () => void) => number;
    }
  ).requestIdleCallback;
  // A busy page can hold an idle callback back for a long time, so it may
  // first get its turn after the caller has gone.
  const runUnlessCancelled = () => {
    if (!signal?.aborted) run();
  };
  if (typeof schedule === "function")
    (schedule as (callback: () => void, options?: { timeout: number }) => number)(
      runUnlessCancelled,
      { timeout: WARM_IDLE_DEADLINE_MS }
    );
  else setTimeout(runUnlessCancelled, 200);
}

async function warmUrls(
  urls: readonly string[],
  signal?: AbortSignal,
  shouldStop?: () => boolean
): Promise<void> {
  // Cancelling can cut any of this warm-up's downloads short, so it gives
  // back every URL it claimed. One that did finish costs only a cache read
  // the next time something warms it.
  const claimed: string[] = [];
  signal?.addEventListener(
    "abort",
    () => {
      for (const url of claimed) warmed.delete(url);
    },
    { once: true }
  );
  // Sequential on purpose: these downloads must never compete with whatever the
  // user is actually looking at. A failure means the asset simply loads the
  // normal way later, so it is not worth reporting.
  for (const url of urls) {
    if (signal?.aborted) return;
    if (shouldStop?.()) return;
    if (warmed.has(url)) continue;
    warmed.add(url);
    claimed.push(url);
    try {
      const response = await fetch(url, {
        priority: "low",
        signal,
      } as RequestInit);
      // Read the body to the end, without keeping it. `fetch` resolves on the
      // headers, so an unread body left the download parked half-way with
      // its connection held: measured 2026-11-14 on a throttled tablet, all
      // six warm-ups sat open at 0 KB while the 3D code queued behind them.
      // Draining keeps the warm-up truly one file at a time and lets each
      // one land in the HTTP cache whole.
      await response.body?.pipeTo(new WritableStream(), { signal });
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
export function warmSceneAssets(
  background: BackgroundType,
  signal?: AbortSignal
): void {
  if (shouldSkipWarming()) return;
  const urls = sceneAssetUrls(background);
  if (urls.length === 0) return;
  onIdle(() => void warmUrls(urls, signal), signal);
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
 *
 * Pass a signal and abort it when the caller goes away. The models run to
 * megabytes, and a warm-up still queued or downloading when the visitor
 * leaves would otherwise spend the next page's bandwidth on a scene that
 * page never shows.
 */
export function warmSelectedSceneAssets(signal?: AbortSignal): void {
  if (shouldSkipWarming()) return;
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(VIEWER_3D_ENVIRONMENT_STORAGE_KEY);
  } catch {
    stored = null;
  }
  warmSceneAssets(
    getSceneEnvironmentRendererKey(normalizeSceneEnvironmentId(stored)),
    signal
  );
  warmDecoderRuntimes(signal);
}

/**
 * The visitor's first performer on a first visit to a production build: the
 * mannequin, while the default cast is not uploaded (performers/default-cast.ts
 * keeps every new performer on it until the whole cast can load). Pinned to the
 * scene package's own path by tests/unit/scene-boot/viewer-3d-warmup.test.ts,
 * so a new revision or the cast switching over fails there instead of warming
 * a file the worker never asks for.
 */
export const FIRST_VISIT_CHARACTER_URL =
  "https://assets.tkaflowarts.com/models/avatars/v2026-07-23-r1/x-bot.glb.bin";
const PERFORMERS_STORAGE_KEY = "tka-viewer3d-performers";

/**
 * Everything the switch into 3D will download for this visitor, in the order
 * it is needed: the decoders the place model waits on, the performer, then the
 * place. Exported for the test.
 */
export function viewer3DWarmupPlan(
  storage: Pick<Storage, "getItem"> | null,
  production: boolean
): string[] {
  let storedEnvironment: string | null = null;
  let hasSavedCast = false;
  try {
    storedEnvironment =
      storage?.getItem(VIEWER_3D_ENVIRONMENT_STORAGE_KEY) ?? null;
    hasSavedCast = !!storage?.getItem(PERFORMERS_STORAGE_KEY);
  } catch {
    storedEnvironment = null;
  }
  // A saved cast can be anyone, and a dev build's default cast is not the
  // mannequin, so only a production first visit knows its performer.
  const character =
    production && !hasSavedCast ? [FIRST_VISIT_CHARACTER_URL] : [];
  const place = sceneAssetUrls(
    getSceneEnvironmentRendererKey(normalizeSceneEnvironmentId(storedEnvironment))
  );
  return [...DECODER_RUNTIME_URLS, ...character, ...place];
}

/**
 * Warm what the viewer's 3D switch will load, one low-priority download at a
 * time, starting on an idle moment or after WARM_IDLE_DEADLINE_MS. Skipped on
 * Data Saver, 2g, offline, the desktop app and where 3D is not offered.
 * `shouldStop` turning true starts nothing new; aborting `signal` (3D opened,
 * or the viewer left) also cancels the download in flight, so a low-priority
 * warm-up never holds a file the real loader is waiting for.
 */
export function warmViewer3DSwitch(
  signal: AbortSignal,
  shouldStop: () => boolean,
  /**
   * Runs after the models, in the same idle slot. Models first: on a tablet
   * on good 4G the code took long enough that, run first, it kept every model
   * out of the cache at the tap and the wait grew from 8.5 s to 13.8 s.
   */
  warmCode?: () => Promise<void>
): void {
  if (shouldSkipWarming() || !threeDIsOffered()) return;
  let storage: Storage | null = null;
  try {
    storage = localStorage;
  } catch {
    storage = null;
  }
  const urls = viewer3DWarmupPlan(storage, import.meta.env.PROD);
  onIdle(() => {
    if (shouldStop()) return;
    void (async () => {
      await warmUrls(urls, signal, shouldStop);
      if (shouldStop() || signal.aborted) return;
      switchAssetsWarmed = true;
      if (warmCode) await warmCode();
    })();
  }, signal);
}

let switchAssetsWarmed = false;

/** True once the switch warm-up got through its whole model list before a tap. */
export function viewer3DSwitchAssetsWarmed(): boolean {
  return switchAssetsWarmed;
}

export function warmDecoderRuntimes(signal?: AbortSignal): void {
  if (shouldSkipWarming()) return;
  onIdle(() => void warmUrls(DECODER_RUNTIME_URLS, signal), signal);
}

export function _resetForTests(): void {
  warmed.clear();
  switchAssetsWarmed = false;
  _resetSceneModulesForTests();
}
