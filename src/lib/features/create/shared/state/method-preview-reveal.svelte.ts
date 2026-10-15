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
 * Behind the boot screen there is nothing to see a wave on: cards ready
 * while it covers the page arrive at once, without a fade, so the page is
 * whole when the screen leaves. If the screen has to leave before every
 * scene is ready (its hold ran out), revealNow() brings the ready cards in
 * at once under it rather than after the hold. A card whose scene failed to
 * load counts as done, so the others do not wait out the hold for it.
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
  /** Whether the boot screen covers the page. Defaults to never. */
  covered?: () => boolean;
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
  /** Whether a card arrived behind the boot screen, with no fade. */
  isInstant(id: string): boolean;
  /** A card's scene has drawn its finished picture. */
  notifyReady(id: string): void;
  /** A card's scene could not load; it keeps its tint. */
  notifyFailed(id: string): void;
  /** The boot screen is leaving: the ready cards arrive now, with no fade. */
  revealNow(): void;
  /** Runs `go` once the wave has settled (at once if it has); returns a cancel. */
  afterWave(go: () => void): () => void;
  dispose(): void;
}

export function createMethodPreviewReveal(
  options: MethodPreviewRevealOptions
): MethodPreviewReveal {
  const timing = { ...METHOD_PREVIEW_TIMING, ...options.timing };
  const isReduced = options.reducedMotion ?? previewMotionReduced;
  const isCovered = options.covered ?? (() => false);

  let revealed = $state<ReadonlySet<string>>(new Set());
  let instant = $state<ReadonlySet<string>>(new Set());
  const ready = new Set<string>();
  const failed = new Set<string>();
  const waiting = new Set<() => void>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let waveStarted = false;
  let leaving = false;
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
    if (isCovered() || leaving) instant = new Set([...instant, id]);
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
    if (isReduced() || isCovered() || leaving) {
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

  function allDone(): boolean {
    return options
      .order()
      .every((orderId) => ready.has(orderId) || failed.has(orderId));
  }

  function notifyReady(id: string): void {
    if (disposed || ready.has(id)) return;
    ready.add(id);
    // Late for the wave: arrive alone.
    if (waveStarted) {
      reveal(id);
      return;
    }
    if (allDone()) {
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

  function notifyFailed(id: string): void {
    if (disposed || ready.has(id) || failed.has(id)) return;
    failed.add(id);
    if (!waveStarted && allDone()) runWave();
  }

  function revealNow(): void {
    if (disposed || waveStarted || ready.size === 0) return;
    leaving = true;
    runWave();
    leaving = false;
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
    isInstant: (id) => instant.has(id),
    notifyReady: (id) => untrack(() => notifyReady(id)),
    notifyFailed: (id) => untrack(() => notifyFailed(id)),
    revealNow: () => untrack(revealNow),
    afterWave: (go) => untrack(() => afterWave(go)),
    dispose,
  };
}
