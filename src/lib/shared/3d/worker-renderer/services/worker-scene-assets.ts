import { BackgroundType } from "@austencloud/backgrounds";
import { DefaultLoadingManager } from "three";
import { sceneAssetUrls } from "../../scene-boot/scene-asset-manifest";
import type { WorkerEnvironmentKey } from "../domain/worker-renderer-protocol";

const ASSET_BUDGET_BYTES = 64 * 1024 * 1024;

interface CachedAsset {
  objectUrl: string;
  bytes: number;
}

interface AssetTransport {
  fetch(url: string, signal: AbortSignal): Promise<Response>;
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

/** Encoded models only; hovering never parses a scene or uploads GPU resources. */
export class WorkerSceneAssetPreloader {
  private readonly assets = new Map<string, CachedAsset>();
  private bytes = 0;
  private generation = 0;
  private pending: {
    key: string;
    controller: AbortController;
    promise: Promise<void>;
  } | null = null;

  constructor(
    private readonly transport: AssetTransport,
    private readonly budgetBytes = ASSET_BUDGET_BYTES
  ) {}

  get snapshot() {
    return { bytes: this.bytes, count: this.assets.size };
  }

  resolve(url: string): string {
    const asset = this.assets.get(url);
    if (!asset) return url;
    this.assets.delete(url);
    this.assets.set(url, asset);
    return asset.objectUrl;
  }

  prepare(key: string, urls: readonly string[]): Promise<void> {
    if (this.pending?.key === key) return this.pending.promise;
    this.pending?.controller.abort();
    const generation = ++this.generation;
    const controller = new AbortController();
    const promise = this.download(urls, controller.signal, generation).finally(
      () => {
        if (this.pending?.controller === controller) this.pending = null;
      }
    );
    this.pending = { key, controller, promise };
    return promise;
  }

  select(key: string): Promise<void> {
    if (this.pending?.key === key) return this.pending.promise;
    this.pending?.controller.abort();
    this.pending = null;
    ++this.generation;
    // A cold click uses the world's parallel loader directly. Pre-downloading
    // all models here would add an extra stage to the user's critical path.
    return Promise.resolve();
  }

  clear(): void {
    ++this.generation;
    this.pending?.controller.abort();
    this.pending = null;
    for (const asset of this.assets.values()) {
      this.transport.revokeObjectURL(asset.objectUrl);
    }
    this.assets.clear();
    this.bytes = 0;
  }

  private async download(
    urls: readonly string[],
    signal: AbortSignal,
    generation: number
  ): Promise<void> {
    for (const url of urls) {
      if (signal.aborted || generation !== this.generation) return;
      if (this.assets.has(url)) continue;
      try {
        const response = await this.transport.fetch(url, signal);
        if (!response.ok)
          throw new Error(`Scene asset returned ${response.status}`);
        const expected = Number(response.headers.get("content-length"));
        if (expected > this.budgetBytes) {
          await response.body?.cancel();
          continue;
        }
        const blob = await this.readBounded(response);
        if (!blob || signal.aborted || generation !== this.generation) continue;
        while (this.bytes + blob.size > this.budgetBytes) this.evictOldest();
        this.assets.set(url, {
          objectUrl: this.transport.createObjectURL(blob),
          bytes: blob.size,
        });
        this.bytes += blob.size;
      } catch {
        // Speculation must not fail the selection. The normal loader retries
        // any model whose bytes could not be prepared ahead of time.
        if (signal.aborted) return;
      }
    }
  }

  private async readBounded(response: Response): Promise<Blob | null> {
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > this.budgetBytes) {
          await reader.cancel();
          return null;
        }
        // Keep the complete budget, including the download in progress, bounded.
        while (this.bytes + bytes > this.budgetBytes) this.evictOldest();
        chunks.push(value);
      }
      return new Blob(chunks, { type: "model/gltf-binary" });
    } finally {
      reader.releaseLock();
    }
  }

  private evictOldest(): void {
    const oldest = this.assets.entries().next().value;
    if (!oldest) return;
    const [url, asset] = oldest;
    this.assets.delete(url);
    this.bytes -= asset.bytes;
    this.transport.revokeObjectURL(asset.objectUrl);
  }
}

let preloader: WorkerSceneAssetPreloader | null = null;

function getWorkerSceneAssets(): WorkerSceneAssetPreloader {
  if (!preloader) {
    preloader = new WorkerSceneAssetPreloader({
      fetch: (url, signal) => fetch(url, { signal, priority: "low" }),
      createObjectURL: (blob) => URL.createObjectURL(blob),
      revokeObjectURL: (url) => URL.revokeObjectURL(url),
    });
    // This module runs only inside the renderer worker. All world loaders,
    // including Autumn's abortable manager, share this Three.js resolution hook.
    DefaultLoadingManager.setURLModifier(
      (url) =>
        preloader?.resolve(new URL(url, globalThis.location.href).href) ?? url
    );
  }
  return preloader;
}

export function waitForWorkerSceneAssets(
  environment: WorkerEnvironmentKey
): Promise<void> {
  const background =
    environment === "rainbow"
      ? BackgroundType.PRIDE
      : (environment as BackgroundType);
  const urls = sceneAssetUrls(background)
    .filter((url) =>
      new URL(url, globalThis.location.href).pathname.endsWith(".glb")
    )
    .map((url) => new URL(url, globalThis.location.href).href);
  return getWorkerSceneAssets().prepare(environment, urls);
}

export function prefetchWorkerSceneAssets(
  environment: WorkerEnvironmentKey
): void {
  void waitForWorkerSceneAssets(environment);
}

export function selectWorkerSceneAssets(
  environment: WorkerEnvironmentKey
): Promise<void> {
  return preloader?.select(environment) ?? Promise.resolve();
}

export function clearWorkerSceneAssets(): void {
  preloader?.clear();
  preloader = null;
  DefaultLoadingManager.setURLModifier((url) => url);
}
