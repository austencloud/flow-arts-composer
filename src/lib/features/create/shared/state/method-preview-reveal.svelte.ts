/**
 * The Create front door's preview cards arrive together.
 *
 * Each card's scene loads on its own clock, so left alone the cards swapped
 * their tints for scenes one at a time in no order, and the first turn began
 * while the rest were still fading in (measured 2026-10-14: three separate
 * arrivals across 1.8 s on a desktop, the last one 15 s late on a slow
 * phone). Here every card holds its tint until all the scenes are ready, or
 * until a hold runs out after the first one is, then the ready cards fade in
 * as one wave in board order. A scene that misses the wave arrives on its own
 * as soon as it is ready. Turns wait for the wave to settle.
 *
 * Owns arrival only: scenes own their drawing, and the turn coordinator owns
 * the turns that follow.
 */
import { untrack } from "svelte";
import {
  METHOD_PREVIEW_TIMING,
  previewMotionReduced,
} from "./method-preview-turns.svelte";

export interface MethodPreviewRevealOptions {
  /** Method ids with a scene, in board order, read when the wave runs. */
  order: () => readonly string[];
  /** A card has arrived: its scene is showing and it can take turns. */
  onReveal?: (id: string) => void;
  /** Defaults to previewMotionReduced(): the system and app settings. */
  reducedMotion?: () => boolean;
  timing?: Partial<
    Pick<
      typeof METHOD_PREVIEW_TIMING,
      "revealHoldMs" | "revealStaggerMs" | "revealFadeMs"
    >
  >;
}

export interface MethodPreviewReveal {
  /** Whether a card's scene is showing. */
  isRevealed(id: string): boolean;
  /** A card's scene has drawn its finished picture. */
  notifyReady(id: string): void;
  /** Runs `go` once the wave has settled (at once if it has); returns a cancel. */
  afterWave(go: () => void): () => void;
  dispose(): void;
}

export function createMethodPreviewReveal(
  options: MethodPreviewRevealOptions
): MethodPreviewReveal {
  const timing = { ...METHOD_PREVIEW_TIMING, ...options.timing };
  const isReduced = options.reducedMotion ?? previewMotionReduced;

  let revealed = $state<ReadonlySet<string>>(new Set());
  const ready = new Set<string>();
  const waiting = new Set<() => void>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let waveStarted = false;
  let settled = false;
  let disposed = false;

  function later(ms: number, step: () => void): void {
    const id = setTimeout(() => {
      timers.delete(id);
      if (!disposed) step();
    }, ms);
    timers.add(id);
  }

  function reveal(id: string): void {
    if (revealed.has(id)) return;
    revealed = new Set([...revealed, id]);
    options.onReveal?.(id);
  }

  function settle(): void {
    settled = true;
    const callbacks = [...waiting];
    waiting.clear();
    for (const go of callbacks) go();
  }

  function runWave(): void {
    if (waveStarted) return;
    waveStarted = true;
    if (holdTimer !== null) clearTimeout(holdTimer);
    holdTimer = null;
    const ids = options.order().filter((id) => ready.has(id));
    if (isReduced()) {
      for (const id of ids) reveal(id);
      settle();
      return;
    }
    ids.forEach((id, index) => {
      if (index === 0) reveal(id);
      else later(index * timing.revealStaggerMs, () => reveal(id));
    });
    later(
      Math.max(0, ids.length - 1) * timing.revealStaggerMs +
        timing.revealFadeMs,
      settle
    );
  }

  function notifyReady(id: string): void {
    if (disposed || ready.has(id)) return;
    ready.add(id);
    // Late for the wave: arrive alone.
    if (waveStarted) {
      reveal(id);
      return;
    }
    if (options.order().every((orderId) => ready.has(orderId))) {
      runWave();
      return;
    }
    if (holdTimer === null) {
      holdTimer = setTimeout(() => {
        holdTimer = null;
        if (!disposed) runWave();
      }, timing.revealHoldMs);
    }
  }

  function afterWave(go: () => void): () => void {
    if (disposed) return () => {};
    if (settled) {
      go();
      return () => {};
    }
    waiting.add(go);
    return () => waiting.delete(go);
  }

  function dispose(): void {
    disposed = true;
    if (holdTimer !== null) clearTimeout(holdTimer);
    holdTimer = null;
    for (const id of timers) clearTimeout(id);
    timers.clear();
    waiting.clear();
  }

  return {
    isRevealed: (id) => revealed.has(id),
    notifyReady: (id) => untrack(() => notifyReady(id)),
    afterWave: (go) => untrack(() => afterWave(go)),
    dispose,
  };
}
