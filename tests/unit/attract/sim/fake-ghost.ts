/**
 * The motor, stubbed onto a virtual clock.
 *
 * Every primitive resolves immediately and advances a counter instead of
 * sleeping, so a four-hour tour runs in under a second. The only behaviour that
 * matters here is that a press really presses (the sim app mutates) and that
 * time really passes (restlessness, dwell gates and the invitation spacing all
 * read the clock, and freezing it would make them lie).
 */

import type { AttractGhost } from "#lib/shared/attract/services/attract-ghost.svelte.js";
import { transitionGhostHover } from "#lib/shared/attract/services/ghost-hover.js";
import type { SimApp } from "./app-model";

export interface FakeGhost {
  ghost: AttractGhost;
  now: () => number;
  /** Every element the ghost actually pressed, in order. */
  pressed: HTMLElement[];
  /** Milliseconds the ghost spent stepped-aside saying nothing. */
  savoredMs: number;
}

export function createFakeGhost(
  app: SimApp,
  pick: <T>(a: T[]) => T
): FakeGhost {
  let clock = 0;
  const pressed: HTMLElement[] = [];
  let savoredMs = 0;
  let hovered: HTMLElement | null = null;

  const advance = (ms: number) => {
    clock += Math.max(0, ms);
  };

  const press = (el: HTMLElement) => {
    // The real motor hit-tests the fingertip and skips a target that has gone.
    if (!document.body.contains(el)) return;
    pressed.push(el);
    app.press(el);
  };

  const hover = (el: HTMLElement | null) => {
    transitionGhostHover(hovered, el);
    hovered = el;
    const sidebar = el?.closest<HTMLElement>(".ghost-hover-boundary");
    if (sidebar) sidebar.classList.add("hover-expanded");
  };

  const ghost = {
    // AttractActHandle surface the mind never calls in a sim, but the type wants.
    ghost: {} as never,
    start: () => {},
    setVisible: () => {},
    pause: () => {},
    resume: () => {},
    kill: () => {},

    halted: () => false,
    sleep: async (ms: number) => advance(ms),
    dwell: async (ms: number) => advance(ms),
    glideTo: async () => advance(500),
    hoverOn: async (el: HTMLElement, dwellMs: number) => {
      hover(el);
      advance(400 + dwellMs);
    },
    moveAndPress: async (el: HTMLElement) => {
      advance(700);
      press(el);
    },
    browseAndPick: async (cands: HTMLElement[]) => {
      advance(900);
      const chosen = pick(cands);
      if (chosen) press(chosen);
    },
    browseThenPress: async (chosen: HTMLElement) => {
      advance(1100);
      press(chosen);
    },
    restBeside: async () => advance(600),
    savor: async (ms: number) => {
      savoredMs += ms;
      advance(ms);
    },
    setHover: hover,
    waitFor: async (selector: string) => {
      advance(30);
      return [...document.querySelectorAll<HTMLElement>(selector)];
    },
    pick: (<T>(arr: T[]) => pick(arr)) as AttractGhost["pick"],
    jitter: (base: number) => base,
  } satisfies Record<string, unknown> as unknown as AttractGhost;

  return {
    ghost,
    now: () => clock,
    pressed,
    get savoredMs() {
      return savoredMs;
    },
  };
}
