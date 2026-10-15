import { getContext, setContext, untrack } from "svelte";
import { motionDuration } from "#lib/shared/transitions/motion.js";
import { DURATION } from "#lib/shared/transitions/transitions.js";
import { LAYOUT_MOTION_EASING } from "#lib/shared/transitions/layout-flip.js";
import type {
  BoardLook,
  HighlightPhase,
  Phase,
} from "../grid-merge/grid-merge-constants";

export interface LiveBoardScene {
  phase: Phase;
  highlightPhase: HighlightPhase;
  look: BoardLook;
}

export interface LiveLessonBoard {
  readonly scene: LiveBoardScene;
  setScene(scene: Partial<LiveBoardScene>): void;
  /** Hand the board to a lesson's slot. Returns the release. */
  dock(slot: HTMLElement): () => void;
  /** Remember where the board is drawn, before the lesson around it changes. */
  capture(): void;
  /**
   * Fly a square layer drawn over the board's slot (the next lesson's hands)
   * from where the board started, in step with the board's own flight, so
   * what sat on the old board arrives with it. Does nothing when the board is
   * not moving between lessons.
   */
  follow(layer: HTMLElement): void;
}

const LIVE_BOARD = Symbol("live-lesson-board");

/** The square a 950-unit board actually draws in, inside its element box. */
function drawnSquare(rect: DOMRect) {
  const side = Math.min(rect.width, rect.height);
  return {
    left: rect.left + (rect.width - side) / 2,
    top: rect.top + (rect.height - side) / 2,
    side,
  };
}

/**
 * One grid for the whole Learn session. Each lesson docks it into its own
 * stage instead of drawing a grid of its own, so continuing to the next lesson
 * moves and restyles the grid the learner was already looking at.
 */
export function createLiveLessonBoard(
  initial: LiveBoardScene = {
    phase: "intro",
    highlightPhase: "none",
    look: "lesson",
  }
): LiveLessonBoard & {
  attach(board: HTMLElement): () => void;
} {
  let scene = $state<LiveBoardScene>(initial);
  let board: HTMLElement | null = null;
  let home: ParentNode | null = null;
  let slot: HTMLElement | null = null;
  let captured: DOMRect | null = null;
  let flight: Animation | null = null;
  /** Where the board lands, while it flies. */
  let to: DOMRect | null = null;
  /**
   * Layers riding the board: each is lifted into the flying board at its own
   * landing spot, so the board's one transform carries both, and goes back
   * where it was when the board lands. `home` is null while a layer waits for
   * a flight that has not started yet.
   */
  let riders: {
    layer: HTMLElement;
    home: { parent: ParentNode; next: Node | null; style: string | null } | null;
  }[] = [];

  function ride(layer: HTMLElement) {
    if (!board || !to || !layer.parentNode) return;
    const rect = layer.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    riders.push({
      layer,
      home: {
        parent: layer.parentNode,
        next: layer.nextSibling,
        style: layer.getAttribute("style"),
      },
    });
    board.appendChild(layer);
    Object.assign(layer.style, {
      position: "absolute",
      inset: "auto",
      left: `${rect.left - to.left}px`,
      top: `${rect.top - to.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      margin: "0",
    });
  }

  function dismount() {
    for (const { layer, home } of riders) {
      if (!home) continue;
      if (home.style === null) layer.removeAttribute("style");
      else layer.setAttribute("style", home.style);
      // A lesson that unmounted mid-flight takes its layer with it.
      if (home.parent.isConnected)
        home.parent.insertBefore(
          layer,
          home.next?.parentNode === home.parent ? home.next : null
        );
      else layer.remove();
    }
    riders = riders.filter((rider) => !rider.home);
  }

  function measure(): DOMRect | null {
    if (!board?.isConnected) return null;
    const rect = board.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 ? rect : null;
  }

  function land() {
    const animation = flight;
    flight = null;
    to = null;
    dismount();
    animation?.cancel();
    if (!board || board.dataset.boardFlight === undefined) return;
    delete board.dataset.boardFlight;
    board.removeAttribute("style");
    (slot ?? home)?.appendChild(board);
  }

  /**
   * The board travels above both lesson stages, so neither one's clipping can
   * cut it off mid-flight, then lands in the new slot. It is never cloned: the
   * grid keeps restyling into the new lesson's scene while it moves.
   */
  function fly(from: DOMRect) {
    const landing = measure();
    const duration = motionDuration(DURATION.emphasis);
    if (!board || !landing || duration <= 0) return;
    const start = drawnSquare(from);
    const end = drawnSquare(landing);
    const scale = end.side > 0 ? start.side / end.side : 1;
    const dx = start.left - end.left;
    const dy = start.top - end.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(scale - 1) < 0.01)
      return;
    const origin = `${end.left - landing.left}px ${end.top - landing.top}px`;
    board.ownerDocument.body.appendChild(board);
    board.dataset.boardFlight = "";
    Object.assign(board.style, {
      position: "fixed",
      inset: "auto",
      left: `${landing.left}px`,
      top: `${landing.top}px`,
      width: `${landing.width}px`,
      height: `${landing.height}px`,
      margin: "0",
      zIndex: "var(--z-debug, 1000)",
      pointerEvents: "none",
    });
    const animation = board.animate(
      [
        {
          transformOrigin: origin,
          transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
        },
        { transformOrigin: origin, transform: "none" },
      ],
      { duration, easing: LAYOUT_MOTION_EASING }
    );
    flight = animation;
    to = landing;
    const waiting = riders.filter((rider) => !rider.home);
    riders = riders.filter((rider) => rider.home);
    for (const { layer } of waiting) ride(layer);
    void animation.finished.then(
      () => {
        if (flight === animation) land();
      },
      () => undefined
    );
  }

  function dock(next: HTMLElement) {
    const from = captured ?? measure();
    captured = null;
    land();
    slot = next;
    if (board) {
      next.appendChild(board);
      if (from) fly(from);
    }
    // Layers waiting on a flight that did not happen stay where they are.
    riders = riders.filter((rider) => rider.home);
    return () => {
      if (slot !== next) return;
      land();
      slot = null;
      if (board && home) home.appendChild(board);
    };
  }

  return {
    get scene() {
      return scene;
    },
    setScene(next) {
      // Slots call this from an effect, so reading the scene must not make
      // that effect depend on the scene it writes.
      const current = untrack(() => scene);
      const merged = { ...current, ...next };
      if (
        merged.phase === current.phase &&
        merged.highlightPhase === current.highlightPhase &&
        merged.look === current.look
      )
        return;
      scene = merged;
    },
    attach(element) {
      board = element;
      home = element.parentNode;
      // A lesson that mounted first is still waiting for the board.
      if (slot) slot.appendChild(element);
      return () => {
        land();
        board = null;
        home = null;
      };
    },
    capture() {
      captured = measure();
    },
    follow(layer) {
      if (flight && to) ride(layer);
      else if (captured) riders.push({ layer, home: null });
    },
    dock,
  };
}

export function provideLiveLessonBoard(board: LiveLessonBoard) {
  setContext(LIVE_BOARD, board);
}

/** The session's board, or undefined when a lesson renders on its own. */
export function getLiveLessonBoard(): LiveLessonBoard | undefined {
  return getContext<LiveLessonBoard | undefined>(LIVE_BOARD);
}
