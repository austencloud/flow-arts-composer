/**
 * The Create front door's method cards take turns playing their previews.
 *
 * One turn passes around the cards in board order. A turn plays one card's
 * scene for about three seconds, then a short gap passes it on. After two
 * rounds every card rests on its finished picture. A pointer resting on a
 * card, or keyboard focus, plays that card now; those extra turns do not
 * count toward the rounds and keep working after them. Automatic turns wait
 * while any card is held, then resume where they left off, replaying the
 * card an extra turn cut short.
 *
 * Spec: docs/superpowers/specs/2026-10-06-create-method-previews-design.md
 * (Turns). Owns order, rounds, holds, and pauses only: scenes own their
 * drawing, and the front door's render gate calls setActive().
 */
import { getSettings } from "$lib/shared/application/state/app-state.svelte";
import { DURATION } from "$lib/shared/transitions/transitions";
import { reducedMotion as systemReducedMotion } from "$lib/shared/transitions/motion";

/**
 * Reduced motion for previews. `reducedMotion()` covers the system setting
 * and the reduced-motion attribute on <html>; the app's own Reduce Motion
 * setting lives in settings and is read beside it, as PictographArrivalStage
 * and FuseSourceCard do (plan: Spec Corrections 10).
 */
export function previewMotionReduced(): boolean {
  return systemReducedMotion() || (getSettings().reducedMotion ?? false);
}

export interface MethodPreviewTiming {
  /** How long one card's scene plays. */
  turnMs: number;
  /** The pause between one card's turn and the next. */
  gapMs: number;
  /** How long a pointer rests on a card, or focus stays, before it plays. */
  hoverDelayMs: number;
  /** How long a turn waits for a scene that has not loaded before skipping it. */
  readyWaitMs: number;
  /** The pause after the page settles before the first turn. */
  startDelayMs: number;
  /** Automatic rounds each time the front door opens. */
  rounds: number;
}

/** The one owner of preview timing. Six cards take about 42 seconds. */
export const METHOD_PREVIEW_TIMING: Readonly<MethodPreviewTiming> =
  Object.freeze({
    turnMs: 3000,
    gapMs: 500,
    hoverDelayMs: 350,
    readyWaitMs: 2500,
    startDelayMs: DURATION.emphasis,
    rounds: 2,
  });

export interface MethodPreviewTurnOptions {
  /** Method ids in board order, read before each turn. */
  order: () => readonly string[];
  /** Whether a card's scene has loaded and drawn its finished picture. */
  isReady: (id: string) => boolean;
  /** Defaults to previewMotionReduced(): the system and app settings. */
  reducedMotion?: () => boolean;
  /**
   * Runs `go` once the page is quiet and returns a cancel function. The front
   * door passes runAfterNamedRouteMorphIdle. Defaults to the next task.
   */
  defer?: (go: () => void) => () => void;
  timing?: Partial<MethodPreviewTiming>;
}

export interface MethodPreviewTurns {
  /** The card playing now, or null between turns and at rest. */
  readonly playingId: string | null;
  /** Counts every turn started, so a scene can tell a new turn from the last. */
  readonly turn: number;
  /** Begin two rounds from the first card: the front door opened or came back. */
  start(): void;
  /** End every turn: a method was chosen or the front door closed. */
  stop(): void;
  /** Pause while the page is hidden or the board is off screen. */
  setActive(active: boolean): void;
  /** A pointer or keyboard focus arrived on a card. */
  hold(id: string): void;
  /** That pointer or focus left. */
  release(id: string): void;
  /** A card's scene finished loading. */
  notifyReady(id: string): void;
  dispose(): void;
}

type TurnKind = "auto" | "extra";

const nextTask = (go: () => void): (() => void) => {
  const id = setTimeout(go, 0);
  return () => clearTimeout(id);
};

export function createMethodPreviewTurns(
  options: MethodPreviewTurnOptions
): MethodPreviewTurns {
  const timing: MethodPreviewTiming = {
    ...METHOD_PREVIEW_TIMING,
    ...options.timing,
  };
  const isReduced = options.reducedMotion ?? previewMotionReduced;
  const defer = options.defer ?? nextTask;

  let playingId = $state<string | null>(null);
  let turn = $state(0);

  let open = false;
  let active = true;
  let disposed = false;
  /** Position in the automatic schedule: rounds times cards. */
  let cursor = 0;
  let roundsDone = false;
  /** Automatic turns move the cursor when they finish; extra turns never do. */
  let playingKind: TurnKind | null = null;
  /** The one pending step: a turn's end, a gap, a start delay, or a wait. */
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** Set while start() waits for the page to settle. */
  let cancelDefer: (() => void) | null = null;
  /** A card whose scene has not loaded yet; its turn waits a while for it. */
  let waitingFor: string | null = null;
  /** Holds per card: a pointer and focus can hold one card at once. */
  const holds = new Map<string, number>();
  let pendingHold: ReturnType<typeof setTimeout> | null = null;

  function clearTimer(): void {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function schedule(ms: number, step: () => void): void {
    clearTimer();
    timer = setTimeout(step, ms);
  }

  function clearPendingHold(): void {
    if (pendingHold !== null) clearTimeout(pendingHold);
    pendingHold = null;
  }

  function begin(id: string, kind: TurnKind): void {
    playingId = id;
    playingKind = kind;
    turn += 1;
    schedule(timing.turnMs, endTurn);
  }

  function endTurn(): void {
    timer = null;
    if (playingKind === "auto") cursor += 1;
    playingId = null;
    playingKind = null;
    schedule(timing.gapMs, advance);
  }

  function advance(): void {
    timer = null;
    if (!open || !active || disposed || roundsDone || holds.size > 0) return;
    const order = options.order();
    if (order.length === 0 || cursor >= order.length * timing.rounds) {
      roundsDone = true;
      return;
    }
    const id = order[cursor % order.length]!;
    if (!options.isReady(id)) {
      waitingFor = id;
      schedule(timing.readyWaitMs, () => {
        waitingFor = null;
        cursor += 1;
        advance();
      });
      return;
    }
    begin(id, "auto");
  }

  /** An extra turn cuts whatever plays. A cut automatic turn keeps its place. */
  function playExtra(id: string): void {
    clearTimer();
    waitingFor = null;
    begin(id, "extra");
  }

  /** Whether the rounds may move on now: nothing playing, pending, or held. */
  function idle(): boolean {
    return (
      open &&
      active &&
      !disposed &&
      cancelDefer === null &&
      playingId === null &&
      timer === null
    );
  }

  function stop(): void {
    open = false;
    clearTimer();
    cancelDefer?.();
    cancelDefer = null;
    clearPendingHold();
    holds.clear();
    waitingFor = null;
    playingId = null;
    playingKind = null;
  }

  function start(): void {
    if (disposed) return;
    stop();
    cursor = 0;
    roundsDone = false;
    if (isReduced()) return;
    open = true;
    let settledAlready = false;
    const cancel = defer(() => {
      settledAlready = true;
      cancelDefer = null;
      if (open && playingId === null && timer === null) {
        schedule(timing.startDelayMs, advance);
      }
    });
    // A defer that runs at once has already cleared the wait.
    if (!settledAlready) cancelDefer = cancel;
  }

  function setActive(value: boolean): void {
    if (disposed || active === value) return;
    active = value;
    if (!value) {
      // The cut card keeps its place and replays on resume.
      clearTimer();
      clearPendingHold();
      waitingFor = null;
      playingId = null;
      playingKind = null;
      return;
    }
    if (idle()) schedule(timing.gapMs, advance);
  }

  function hold(id: string): void {
    if (disposed || !open || isReduced()) return;
    holds.set(id, (holds.get(id) ?? 0) + 1);
    clearPendingHold();
    pendingHold = setTimeout(() => {
      pendingHold = null;
      if (!active || !open || !holds.has(id)) return;
      if (playingId === id || !options.isReady(id)) return;
      playExtra(id);
    }, timing.hoverDelayMs);
  }

  function release(id: string): void {
    const count = holds.get(id);
    if (!count) return;
    if (count > 1) {
      holds.set(id, count - 1);
      return;
    }
    holds.delete(id);
    clearPendingHold();
    if (holds.size === 0 && idle()) schedule(timing.gapMs, advance);
  }

  function notifyReady(id: string): void {
    if (disposed || !open) return;
    const waited = waitingFor === id;
    if (waited) {
      clearTimer();
      waitingFor = null;
    }
    // A card held before its scene loaded plays as soon as it can.
    if (active && holds.has(id) && pendingHold === null && playingId !== id) {
      playExtra(id);
      return;
    }
    if (waited) advance();
  }

  function dispose(): void {
    stop();
    disposed = true;
  }

  return {
    get playingId() {
      return playingId;
    },
    get turn() {
      return turn;
    },
    start,
    stop,
    setActive,
    hold,
    release,
    notifyReady,
    dispose,
  };
}
