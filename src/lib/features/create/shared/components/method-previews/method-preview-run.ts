/**
 * Scene timelines for Create method previews. A turn runs one scripted
 * timeline. When the turn ends, the timeline stops wherever it is, the demo
 * finger lifts and vanishes, and the scene settles on its finished picture.
 *
 * Taps use the attract ghost's motor (createAttractGhost) and the shared
 * GhostPointer body, the same finger as the Composer page's demos. The
 * attract motor's press resolves real app targets, so scenes tap with
 * tapAt() instead (plan: Spec Corrections 5).
 */
import {
  createAttractGhost,
  type AttractGhost,
} from "$lib/shared/attract/services/attract-ghost.svelte";

export interface SceneRun {
  /** True once the turn ended. A timeline checks it before each step. */
  readonly aborted: boolean;
  /** Wait `ms`. True when the wait finished, false when the turn ended first. */
  wait(ms: number): Promise<boolean>;
  /** Run `cleanup` when the turn ends, or now if it already has. */
  onAbort(cleanup: () => void): void;
}

export function startSceneRun(): { run: SceneRun; abort: () => void } {
  let aborted = false;
  const waits = new Set<(finished: boolean) => void>();
  const cleanups: Array<() => void> = [];

  const run: SceneRun = {
    get aborted() {
      return aborted;
    },
    wait(ms) {
      if (aborted) return Promise.resolve(false);
      return new Promise<boolean>((resolve) => {
        const settle = (finished: boolean) => {
          clearTimeout(timer);
          waits.delete(settle);
          resolve(finished);
        };
        const timer = setTimeout(() => settle(true), Math.max(0, ms));
        waits.add(settle);
      });
    },
    onAbort(cleanup) {
      if (aborted) {
        cleanup();
        return;
      }
      cleanups.push(cleanup);
    },
  };

  function abort(): void {
    if (aborted) return;
    aborted = true;
    for (const settle of [...waits]) settle(false);
    for (const cleanup of cleanups.splice(0)) cleanup();
  }

  return { run, abort };
}

/** The beats of one demo tap, shortened to fit a three-second turn. */
export const SCENE_TAP = Object.freeze({ considerMs: 120, pressMs: 140 });

/** What a tap needs from the ghost: its pose and its glide. */
export type SceneFinger = Pick<AttractGhost, "ghost" | "glideTo">;

/**
 * A demo finger for one turn, in the scene box's coordinates. It moves at
 * once (a preview only plays on screen) and dies with the turn.
 */
export function sceneGhost(
  run: SceneRun,
  getRoot: () => HTMLElement | null
): AttractGhost {
  const { core } = createAttractGhost({ getRoot });
  core.setVisible(true);
  run.onAbort(() => core.kill());
  return core;
}

/**
 * Put the finger at a point without a glide. A ghost's first glide otherwise
 * appears 60 to 120px from its target, outside a small box.
 */
export function placeGhost(finger: SceneFinger, x: number, y: number): void {
  finger.ghost.x = x;
  finger.ghost.y = y;
  finger.ghost.visible = true;
}

/**
 * Glide to a point and tap it: lean in, press, lift. True when the tap
 * landed, false when the turn ended first. The scene acts on true.
 */
export async function tapAt(
  finger: SceneFinger,
  run: SceneRun,
  x: number,
  y: number
): Promise<boolean> {
  const pose = finger.ghost;
  await finger.glideTo(x, y);
  if (run.aborted) return false;
  pose.considering = true;
  const leaned = await run.wait(SCENE_TAP.considerMs);
  pose.considering = false;
  if (!leaned) return false;
  pose.pressed = true;
  const pressed = await run.wait(SCENE_TAP.pressMs);
  pose.pressed = false;
  return pressed;
}
