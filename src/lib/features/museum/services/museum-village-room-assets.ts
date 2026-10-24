/**
 * The Room of Collaboration's big downloads, started as early as the museum
 * knows the visitor is headed there, so the loading view's wait is spent
 * downloading rather than idling.
 *
 * The GLBs go through threlte's per-canvas loader cache, keyed by URL, so the
 * forest and the tree ring later get these same parsed results instead of a
 * second download, and it holds across a cache-disabled reload, unlike
 * warming the HTTP cache with fetch(). The avatars are the manager's
 * (preloadVillageAvatarModels).
 *
 * Call `useVillageRoomGlbs` during a component's init inside the museum
 * Canvas: threlte's loader cache lives in the Canvas context.
 */

import { useDraco, useGltf, useMeshopt } from "@threlte/extras";
import { VILLAGE_TREE_URLS } from "#lib/features/village/components/village-tree-ring.js";

/** Every GLB the village's forest composition loads (VillageClearing with a
 *  config and no clearing radius: environment, near frame and campsite, plus
 *  the tree ring). */
export const VILLAGE_ROOM_GLB_URLS: readonly string[] = [
  "/models/forest/forest-environment.glb",
  "/models/forest/forest-near-frame.glb",
  "/models/forest/forest-campsite.glb",
  ...Object.values(VILLAGE_TREE_URLS),
];

export interface VillageRoomGlbLoad {
  /** Resolves true when every GLB parsed, false if any failed. */
  done: Promise<boolean>;
  /** Called with (loaded, total) as each GLB settles. */
  onProgress(listener: (loaded: number, total: number) => void): void;
}

/**
 * Start (or join) the room's GLB loads. The decoders are the union of what
 * the forest owners pass, so whichever caller loads first can parse every
 * file.
 */
export function useVillageRoomGlbs(): VillageRoomGlbLoad {
  const options = { dracoLoader: useDraco("/draco/"), meshoptDecoder: useMeshopt() };
  const total = VILLAGE_ROOM_GLB_URLS.length;
  const listeners = new Set<(loaded: number, total: number) => void>();
  let loaded = 0;
  let failed = false;

  const settled = VILLAGE_ROOM_GLB_URLS.map((url) =>
    useGltf(url, options)
      .promise.catch((error: unknown) => {
        console.warn(`[MuseumVillageRoom] ${url} failed to load:`, error);
        failed = true;
      })
      .finally(() => {
        loaded++;
        for (const listener of listeners) listener(loaded, total);
      }),
  );

  return {
    done: Promise.all(settled).then(() => !failed),
    onProgress(listener) {
      listeners.add(listener);
      listener(loaded, total);
    },
  };
}
