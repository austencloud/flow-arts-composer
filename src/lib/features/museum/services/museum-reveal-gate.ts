/**
 * The museum's loading curtain lifts only on a finished room.
 *
 * Four tracks must finish before the visitor sees anything: the tile geometry,
 * the three.js loading manager going idle (textures and GLBs), the entrance
 * shader warm-up, and the room the visitor stands in. That last one is the
 * room's own say: the Room of Collaboration is a forest, a tree ring, a fire
 * and a village of people, all loaded after the tile geometry, and until they
 * are placed the room is a black void with a few floating meshes in it.
 *
 * The loading manager's first idle used to stand in for "everything loaded",
 * but the village's GLBs begin after that idle, and a 15 s watchdog then
 * forced the reveal on a cold load. The watchdog still exists for the asset
 * and geometry tracks, but it never overrides a room that says it is loading.
 * Only a room failure, or the much longer hard cap, lifts the curtain on an
 * unfinished room, and both say so in the console.
 */

export type RoomReadinessState = "loading" | "ready" | "failed";

export interface RoomReadiness {
  state: RoomReadinessState;
  /** 0-1, how much of the room has arrived. */
  progress: number;
}

export const ROOM_READY: RoomReadiness = { state: "ready", progress: 1 };

/** Asset and geometry tracks that have not reported by now are forced. */
export const ASSET_WATCHDOG_MS = 15_000;
/** A room still loading after this is treated as failed, so a stalled
 *  download can never strand the visitor on the loading view forever. */
export const ROOM_HARD_CAP_MS = 90_000;

export interface RevealGateSnapshot {
  texturesReady: boolean;
  meshesReady: boolean;
  shadersReady: boolean;
  room: RoomReadiness;
  /** What the shader warm-up waits for: assets loaded and the room built, so
   *  the room's own materials compile behind the curtain too. */
  assetsReady: boolean;
  revealed: boolean;
}

export interface MuseumRevealGateOptions {
  onChange?: (snapshot: RevealGateSnapshot) => void;
  onReveal: () => void;
  warn?: (message: string) => void;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export function createMuseumRevealGate(options: MuseumRevealGateOptions) {
  const warn = options.warn ?? ((message: string) => console.warn(message));
  const setTimer =
    options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer =
    options.clearTimer ??
    ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let texturesReady = false;
  let meshesReady = false;
  let shadersReady = false;
  let room: RoomReadiness = ROOM_READY;
  let revealed = false;
  const timers: unknown[] = [];

  function snapshot(): RevealGateSnapshot {
    return {
      texturesReady,
      meshesReady,
      shadersReady,
      room,
      assetsReady: texturesReady && room.state !== "loading",
      revealed,
    };
  }

  function update(): void {
    if (
      !revealed &&
      texturesReady &&
      meshesReady &&
      shadersReady &&
      room.state !== "loading"
    ) {
      revealed = true;
      options.onChange?.(snapshot());
      options.onReveal();
      return;
    }
    options.onChange?.(snapshot());
  }

  return {
    get snapshot(): RevealGateSnapshot {
      return snapshot();
    },

    start(): void {
      timers.push(
        setTimer(() => {
          if (revealed || (texturesReady && meshesReady)) return;
          warn(
            room.state === "loading"
              ? "[MuseumRevealGate] Asset watchdog fired; the room is still loading, so the curtain stays up"
              : "[MuseumRevealGate] Asset watchdog fired - forcing asset and geometry tracks"
          );
          texturesReady = true;
          meshesReady = true;
          update();
        }, ASSET_WATCHDOG_MS)
      );
      timers.push(
        setTimer(() => {
          if (revealed || room.state !== "loading") return;
          warn(
            `[MuseumRevealGate] Room still loading after ${ROOM_HARD_CAP_MS / 1000}s - treating it as failed and revealing`
          );
          texturesReady = true;
          meshesReady = true;
          room = { state: "failed", progress: room.progress };
          update();
        }, ROOM_HARD_CAP_MS)
      );
    },

    markTextures(): void {
      if (texturesReady) return;
      texturesReady = true;
      update();
    },

    markMeshes(): void {
      if (meshesReady) return;
      meshesReady = true;
      update();
    },

    markShaders(): void {
      if (shadersReady) return;
      shadersReady = true;
      update();
    },

    setRoom(next: RoomReadiness): void {
      // Once the curtain is up the room's later reports change nothing.
      if (revealed) return;
      if (next.state === "failed" && room.state !== "failed") {
        warn("[MuseumRevealGate] Room reported a load failure - revealing");
      }
      room = next;
      update();
    },

    /** A restored WebGL context rebuilds from scratch; never strand on it. */
    forceAll(): void {
      texturesReady = true;
      meshesReady = true;
      shadersReady = true;
      if (room.state === "loading") room = { state: "failed", progress: room.progress };
      update();
    },

    dispose(): void {
      for (const timer of timers) clearTimer(timer);
      timers.length = 0;
    },
  };
}

export type MuseumRevealGate = ReturnType<typeof createMuseumRevealGate>;
