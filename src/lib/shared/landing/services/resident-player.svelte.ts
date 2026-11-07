/**
 * Resident player
 *
 * The homepage and /composer show the same live animator at the same size, so
 * they share one instance instead of each building its own. One page at a time
 * claims it by naming the stage it should sit in; ResidentPlayerHost renders the
 * player once, in the persistent marketing chrome, and moves it there.
 *
 * Leaving for a page with no stage parks it, paused. It is destroyed after a
 * short idle, or when the chrome itself unmounts. Coming back in time resumes it.
 *
 * With no host mounted (a test route that renders HomeHero on its own) a claim
 * returns null and the page keeps its own player, as does a second claimant on
 * the same page.
 */
import type { Snippet } from "svelte";
import type { AnimationVisibilityStateManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";

/** Long enough for a quick look at another page, short enough that an engine
    nobody can see does not hold its memory for the rest of the visit. */
export const RESIDENT_IDLE_MS = 30_000;

export type ResidentLoadStatus = "idle" | "loading" | "loaded" | "error";

/**
 * - empty: no player exists.
 * - claimed: sitting in a page's stage and playing.
 * - releasing: its page just left. The next page normally claims it in this
 *   same navigation, so nothing pauses or moves yet.
 * - parked: nobody claimed it. Paused, out of sight, waiting out the idle.
 */
export type ResidentPhase = "empty" | "claimed" | "releasing" | "parked";

/** What a page hands over. Getters stay live: the host reads them reactively. */
export interface ResidentClaim {
  readonly stage: HTMLElement;
  readonly railStage: HTMLElement | null;
  readonly playerProps: Record<string, unknown>;
  readonly railProps: Record<string, unknown>;
  readonly playerActive: boolean;
  readonly railActive: boolean;
  readonly placeholder: Snippet | undefined;
  readonly playerError: Snippet<[unknown, () => void]>;
  readonly railError: Snippet<[unknown, () => void]>;
  /** The player reads its manager once at mount, so the first claimant's stays
      with the instance for its whole life. */
  readonly visibilityManager: AnimationVisibilityStateManager;
}

export interface ResidentHandle {
  release(): void;
  readonly visibilityManager: AnimationVisibilityStateManager;
}

export function createResidentPlayer(options?: {
  idleMs?: number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
}) {
  const idleMs = options?.idleMs ?? RESIDENT_IDLE_MS;
  const setTimer =
    options?.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer =
    options?.clearTimer ??
    ((timer) => clearTimeout(timer as ReturnType<typeof setTimeout>));

  let phase = $state<ResidentPhase>("empty");
  let current = $state.raw<ResidentClaim | null>(null);
  let playerStatus = $state<ResidentLoadStatus>("idle");
  let railStatus = $state<ResidentLoadStatus>("idle");
  let canvasReady = $state(false);
  let step = $state(0);
  let stepSequenceId = $state<string | null>(null);

  let hosts = 0;
  let manager: AnimationVisibilityStateManager | null = null;
  let timer: unknown = null;

  function cancelTimer(): void {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }

  function destroy(): void {
    cancelTimer();
    current = null;
    phase = "empty";
    playerStatus = "idle";
    railStatus = "idle";
    canvasReady = false;
    step = 0;
    stepSequenceId = null;
    manager = null;
  }

  function park(): void {
    phase = "parked";
    timer = setTimer(() => {
      timer = null;
      destroy();
    }, idleMs);
  }

  return {
    get phase() {
      return phase;
    },
    get current() {
      return current;
    },
    /** The manager the mounted player was given. */
    get manager() {
      return manager;
    },
    /** A player instance should exist. False only in `empty`. */
    get alive() {
      return phase !== "empty";
    },
    /** Parked is the only phase that pauses; a hand-off never touches the clock. */
    get playbackAllowed() {
      return phase === "claimed" || phase === "releasing";
    },
    get playerStatus() {
      return playerStatus;
    },
    get railStatus() {
      return railStatus;
    },
    get canvasReady() {
      return canvasReady;
    },
    /** The current step of a given sequence, or 0 if the report is for another. */
    stepFor(sequenceId: string | null): number {
      return stepSequenceId === sequenceId ? step : 0;
    },
    reportPlayerStatus(status: ResidentLoadStatus): void {
      playerStatus = status;
    },
    reportRailStatus(status: ResidentLoadStatus): void {
      railStatus = status;
    },
    reportCanvasReady(): void {
      canvasReady = true;
    },
    reportStep(nextStep: number, sequenceId: string | null): void {
      step = nextStep;
      stepSequenceId = sequenceId;
    },

    attachHost(): () => void {
      hosts += 1;
      return () => {
        hosts -= 1;
        if (hosts === 0) destroy();
      };
    },

    /** Null means: keep your own player. */
    claim(request: ResidentClaim): ResidentHandle | null {
      if (hosts === 0) return null;
      // A stage still in the document belongs to a page that is still here. A
      // detached one is a page whose teardown just has not reached its release.
      if (current && current.stage.isConnected) return null;

      cancelTimer();
      manager ??= request.visibilityManager;
      current = request;
      phase = "claimed";

      const visibilityManager = manager;
      return {
        visibilityManager,
        release() {
          if (current !== request) return;
          current = null;
          phase = "releasing";
          cancelTimer();
          timer = setTimer(() => {
            timer = null;
            park();
          }, 0);
        },
      };
    },
  };
}

export type ResidentPlayer = ReturnType<typeof createResidentPlayer>;

/** The one instance the marketing chrome hosts. */
export const residentPlayer: ResidentPlayer = createResidentPlayer();

/**
 * Moves the player without resetting it. `moveBefore` keeps animations and focus
 * intact but throws unless both ends are connected, and the old page's stage has
 * usually left the document by now, so `appendChild` is the normal path after a
 * navigation. A canvas keeps its context and pixels through either.
 */
export function moveResidentNode(node: Element, parent: Element): void {
  if (node.parentNode === parent) return;
  const moving = parent as Element & {
    moveBefore?: (node: Element, child: Node | null) => void;
  };
  if (
    typeof moving.moveBefore === "function" &&
    node.isConnected &&
    parent.isConnected
  ) {
    moving.moveBefore(node, null);
    return;
  }
  parent.appendChild(node);
}
