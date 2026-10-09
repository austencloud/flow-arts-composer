/**
 * One cancellable run per turn for a Create method preview scene. A scene
 * calls playSceneTurns() during init. Each time its card starts playing, or
 * a new turn arrives while it plays, the last run ends and a fresh one
 * starts.
 *
 * When a run ends, the scene settles on its finished picture. A run cut off
 * mid-scene (a held card took the turn, or the turn ran out) fades through
 * the tint: the frozen frame fades out, the scene settles, and the finished
 * picture fades in (spec: Turns; plan: Spec Corrections 12). A run that
 * already finished, reduced motion, or a scene leaving the page settles at
 * once.
 */
import { untrack } from "svelte";
import { previewMotionReduced } from "$lib/features/create/shared/state/method-preview-turns.svelte";
import { startSceneRun, type SceneRun } from "./method-preview-run";

/** The fade through the tint when a run is cut. */
export const SCENE_SETTLE = Object.freeze({ outMs: 120, inMs: 200 });

export interface SceneTurnHooks {
  /** The scene's root element. It fades when a run is cut. */
  root: () => HTMLElement | null;
  /** Show the finished picture. Runs whenever a run ends, so it must be idempotent. */
  settle: () => void;
  /** Defaults to previewMotionReduced(): the system and app settings. */
  reducedMotion?: () => boolean;
}

export function playSceneTurns(
  read: () => { playing: boolean; turn: number },
  play: (run: SceneRun) => Promise<void>,
  hooks: SceneTurnHooks
): void {
  const isReduced = hooks.reducedMotion ?? previewMotionReduced;
  /** The fade of a cut run, until it finishes. */
  let fading: Animation | null = null;

  /** End a fade early: the finished picture shows at full opacity. */
  function finishFade(): void {
    const animation = fading;
    if (!animation) return;
    fading = null;
    animation.cancel();
    hooks.settle();
  }

  function fadeThrough(element: HTMLElement): void {
    const out = element.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: SCENE_SETTLE.outMs,
      easing: "ease-in",
      fill: "forwards",
    });
    fading = out;
    out.onfinish = () => {
      if (fading !== out) return;
      hooks.settle();
      const back = element.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: SCENE_SETTLE.inMs,
        easing: "ease-out",
      });
      out.cancel();
      fading = back;
      back.onfinish = () => {
        if (fading === back) fading = null;
      };
    };
  }

  function end(cut: boolean): void {
    const element = hooks.root();
    // An unmounting scene has left the page before its run ends, while
    // bind:this still holds the root. Nobody sees a fade there.
    if (
      cut &&
      element?.isConnected &&
      typeof element.animate === "function" &&
      !isReduced()
    ) {
      fadeThrough(element);
      return;
    }
    hooks.settle();
  }

  $effect(() => {
    const { playing, turn } = read();
    if (!playing) return;
    void turn;
    const { run, abort } = startSceneRun();
    let finished = false;
    untrack(() => {
      finishFade();
      void (async () => play(run))()
        .catch((error: unknown) => {
          console.error("[method preview] scene run failed", error);
        })
        .finally(() => {
          finished = true;
        });
    });
    return () => {
      const cut = !finished;
      abort();
      untrack(() => end(cut));
    };
  });
}
