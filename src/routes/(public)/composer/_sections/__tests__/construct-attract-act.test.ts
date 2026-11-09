// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TrailMode } from "#lib/shared/animation-engine/domain/types/trail-types.js";
import { calculateGridLayout } from "#lib/shared/create/utils/grid-calculations.js";
import {
  HERO_TIP_EFFECT_MAP,
  HERO_TRAIL_PRESET,
} from "@tka/shape-engine/services/hero-trail-preset.js";

const ghostHarness = vi.hoisted(() => ({
  paused: false,
  cycle: null as (() => Promise<void>) | null,
  events: [] as string[],
  sleep: vi.fn<() => Promise<void>>(),
  waitFor: vi.fn<(selector: string) => Promise<HTMLElement[]>>(),
  browseAndPick: vi.fn<(elements: HTMLElement[]) => Promise<void>>(),
  moveAndPress: vi.fn<() => Promise<void>>(),
  restBeside: vi.fn<() => Promise<void>>(),
  dwell: vi.fn<() => Promise<void>>(),
}));

vi.mock("#lib/shared/attract/services/attract-ghost.svelte.js", () => ({
  createAttractGhost: () => {
    const core = {
      ghost: { x: 0, y: 0, pressed: false, visible: false, parked: false },
      start: vi.fn(),
      setVisible: vi.fn(),
      pause: () => {
        ghostHarness.paused = true;
      },
      resume: () => {
        ghostHarness.paused = false;
      },
      kill: vi.fn(),
      get dead() {
        return false;
      },
      get paused() {
        return ghostHarness.paused;
      },
      halted: () => ghostHarness.paused,
      sleep: ghostHarness.sleep,
      dwell: ghostHarness.dwell,
      glideTo: vi.fn(),
      hoverOn: vi.fn(),
      moveAndPress: ghostHarness.moveAndPress,
      browseAndPick: ghostHarness.browseAndPick,
      restBeside: ghostHarness.restBeside,
      setHover: vi.fn(),
      waitFor: ghostHarness.waitFor,
      pick: <T>(items: T[]) => items[0],
      jitter: (base: number) => base,
    };

    return {
      core,
      run: (cycle: () => Promise<void>) => {
        ghostHarness.cycle = cycle;
        return core;
      },
    };
  },
}));

import {
  createConstructAttractAct,
  type ConstructBoardProgress,
} from "../construct-attract-act.svelte";
import type { createAttractGhost as createActualAttractGhost } from "#lib/shared/attract/services/attract-ghost.svelte.js";

describe("createConstructAttractAct", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ghostHarness.paused = false;
    ghostHarness.cycle = null;
    ghostHarness.events.length = 0;
    ghostHarness.sleep.mockImplementation(async () => {
      ghostHarness.events.push("sleep");
    });
    ghostHarness.waitFor.mockResolvedValue([]);
    ghostHarness.browseAndPick.mockResolvedValue(undefined);
    ghostHarness.moveAndPress.mockResolvedValue(undefined);
    ghostHarness.restBeside.mockResolvedValue(undefined);
    ghostHarness.dwell.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resumes the visitor's build immediately without resetting and adds only the missing steps", async () => {
    let progress: ConstructBoardProgress = {
      phase: "pick-start",
      stepCount: 0,
    };
    const resetBoard = vi.fn();
    const act = createConstructAttractAct({
      getRoot: () => document.body,
      resetBoard,
      getBoardProgress: () => progress,
      togglePlayback: vi.fn(),
      stepsPerCycle: 3,
    });

    // The visitor interrupts the first cycle while its opening pause is active.
    ghostHarness.sleep.mockImplementationOnce(async () => {
      ghostHarness.paused = true;
    });
    await ghostHarness.cycle!();
    expect(resetBoard).toHaveBeenCalledTimes(1);

    // They build two steps, then hand control back to the parked ghost.
    ghostHarness.events.length = 0;
    progress = { phase: "add-step", stepCount: 2 };
    act.resume();
    ghostHarness.waitFor.mockImplementation(async (selector: string) => {
      ghostHarness.events.push(`wait:${selector}`);
      return selector.includes("option-card")
        ? [document.createElement("button")]
        : [];
    });
    ghostHarness.browseAndPick.mockImplementationOnce(async () => {
      progress = { phase: "add-step", stepCount: 3 };
    });
    vi.spyOn(Math, "random").mockReturnValue(0.99);

    await ghostHarness.cycle!();

    expect(resetBoard).toHaveBeenCalledTimes(1);
    expect(ghostHarness.browseAndPick).toHaveBeenCalledTimes(1);
    expect(ghostHarness.events[0]).toContain("option-card");
    expect(
      ghostHarness.waitFor.mock.calls.some(([selector]) =>
        selector.includes("start-placement-picker")
      )
    ).toBe(false);
  });

  it("keeps the focused story on start, four beats, and playback", async () => {
    let progress: ConstructBoardProgress = {
      phase: "pick-start",
      stepCount: 0,
    };
    const target = (kind: "start" | "option" | "control") => {
      const button = document.createElement("button");
      button.setAttribute("data-kind", kind);
      return button;
    };

    createConstructAttractAct({
      getRoot: () => document.body,
      resetBoard: vi.fn(),
      getBoardProgress: () => progress,
      togglePlayback: vi.fn(),
      stepsPerCycle: 4,
      focused: true,
    });

    ghostHarness.waitFor.mockImplementation(async (selector: string) => {
      ghostHarness.events.push(`wait:${selector}`);
      if (selector.includes("start-placement-picker")) return [target("start")];
      if (selector.includes("option-card")) return [target("option")];
      return [target("control")];
    });
    let pickCount = 0;
    ghostHarness.browseAndPick.mockImplementation(async () => {
      pickCount += 1;
      if (pickCount === 1) {
        progress = { phase: "add-step", stepCount: 0 };
      } else {
        progress = {
          phase: "add-step",
          stepCount: progress.stepCount + 1,
        };
      }
    });

    await ghostHarness.cycle!();

    expect(progress.stepCount).toBe(4);
    expect(ghostHarness.browseAndPick).toHaveBeenCalledTimes(5);
    expect(ghostHarness.events.join("\n")).not.toMatch(
      /turns-group|filter-toggle|embla__button|prop-option/
    );
  });

  it("settles the resume activation before accepting a later takeover", async () => {
    const { createAttractGhost } = await vi.importActual<{
      createAttractGhost: typeof createActualAttractGhost;
    }>("#lib/shared/attract/services/attract-ghost.svelte.js");
    const { core } = createAttractGhost({ getRoot: () => null });

    core.pause();
    core.resume();
    core.pause();

    expect(core.paused).toBe(true);
    await Promise.resolve();
    expect(core.paused).toBe(false);

    core.pause();
    expect(core.paused).toBe(true);
    core.kill();
  });

  // The other demos keep the default corner; only Construct has controls there.
  it.each([
    ["bottom-right", undefined, 568],
    ["top-right", "top-right", 32],
  ] as const)("parks in the %s corner", async (_name, parkCorner, expectedY) => {
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) =>
      setTimeout(() => cb(performance.now()), 4)
    );
    const { createAttractGhost } = await vi.importActual<{
      createAttractGhost: typeof createActualAttractGhost;
    }>("#lib/shared/attract/services/attract-ghost.svelte.js");
    const root = document.createElement("div");
    root.getBoundingClientRect = () => new DOMRect(0, 0, 1000, 600);
    const { core, run } = createAttractGhost({
      getRoot: () => root,
      ...(parkCorner ? { parkCorner } : {}),
    });

    // The motor idles its glides until it knows it is on screen.
    core.setVisible(true);
    core.pause();
    run(async () => {}).start();
    await vi.waitFor(() => expect(core.ghost.parked).toBe(true), {
      timeout: 4000,
    });

    expect(core.ghost.x).toBe(968);
    expect(core.ghost.y).toBe(expectedY);
    core.kill();
    vi.unstubAllGlobals();
  });
});

describe("Construct animation rendering", () => {
  it("reserves one action box and swaps playback controls sequentially", () => {
    const constructSource = readFileSync(
      resolve(
        process.cwd(),
        "src/routes/(public)/composer/_sections/ConstructSection.svelte"
      ),
      "utf8"
    );

    expect(constructSource).toContain('<div class="action-swap" bind:this={actionSwapEl}>');
    expect(constructSource).toContain('mode="swap"');
    expect(constructSource).toContain('class="action-swap-state"');
    expect(constructSource).toContain("place-items: center");
    expect(constructSource).toContain("@container (min-width: 1100px)");
    expect(constructSource).toContain("inline-size: 21rem");
    expect(constructSource).toContain("align-items: stretch;");
    expect(constructSource).not.toContain("align-items: start;");
    expect(constructSource).toContain("margin-block: auto;");
    expect(constructSource).not.toContain("margin-top: auto;");
  });

  // Lose any one of these and the card quietly fades instead of flying.
  it("lands the start placement flight on the demo's own start cell", () => {
    const read = (path: string) =>
      readFileSync(resolve(process.cwd(), path), "utf8");
    const constructSource = read(
      "src/routes/(public)/composer/_sections/ConstructSection.svelte"
    );

    expect(constructSource).toContain("data-start-morph-landing");
    expect(constructSource).toContain("morphIntoWorkspace");
    for (const seam of [
      "src/lib/features/create/construct/start-placement-picker/services/start-placement-morph.ts",
      "src/lib/shared/transitions/view-transitions.css",
    ]) {
      // The stylesheet wraps the selector over lines.
      expect(read(seam).replace(/\s+/g, " ")).toContain(
        ":is(.workspace-container, [data-start-morph-landing]) [data-history-start-placement]"
      );
    }
  });

  // A legible floor or a pinned column count overflows the short band into an
  // inner scrollbar, and nothing else notices: the page itself still fits.
  it("fits every step in the stacked demo's short band without scrolling", () => {
    const constructSource = readFileSync(
      resolve(
        process.cwd(),
        "src/routes/(public)/composer/_sections/ConstructSection.svelte"
      ),
      "utf8"
    );
    expect(constructSource).toContain(
      'sizingProfile={isCompactDemo ? "preview" : "workbench"}'
    );
    expect(constructSource).toContain(
      "manualColumnCount={isCompactDemo ? null : STEP_COLUMNS}"
    );

    // Measured stacked bands: phone, unfolded Fold, short landscape.
    for (const [width, band] of [
      [311, 109],
      [643, 127],
      [851, 109],
    ] as const) {
      for (let steps = 1; steps <= 7; steps++) {
        const layout = calculateGridLayout(steps, width - 8, band - 8, null, {
          minCellSize: 28,
          maxCellSize: 360,
          fitAllSteps: true,
          widthPaddingRatio: 1,
          heightPaddingRatio: 1,
        });
        expect(layout.rows * layout.cellSize).toBeLessThanOrEqual(band - 8);
        expect(layout.totalColumns * layout.cellSize).toBeLessThanOrEqual(
          width - 8
        );
      }
    }
  });

  // The page still fits when this goes, so only the clipped tiles would show it.
  it("lets the start picker shrink into a short window's pane", () => {
    const constructSource = readFileSync(
      resolve(
        process.cwd(),
        "src/routes/(public)/composer/_sections/ConstructSection.svelte"
      ),
      "utf8"
    );
    expect(constructSource).toMatch(
      /\.picker-pane :global\(\.start-placement-picker\) \{\s*min-height: 0;/
    );
  });

  // Leave the cell's padding out and a height-bound tile is ~10px wider than tall.
  it("keeps a height-bound start tile square", () => {
    const gridSource = readFileSync(
      resolve(
        process.cwd(),
        "src/lib/features/create/construct/start-placement-picker/components/PictographGrid.svelte"
      ),
      "utf8"
    );
    expect(gridSource).toContain("width: min(100%, calc(100cqh - 2 * var(--tile-inset)));");
    expect(gridSource).toContain("padding: var(--tile-inset);");
  });

  it("pins the shared vivid trail preset and assigns trails to the prop tips", () => {
    const constructSource = readFileSync(
      resolve(
        process.cwd(),
        "src/routes/(public)/composer/_sections/ConstructSection.svelte"
      ),
      "utf8"
    );
    const playerSource = readFileSync(
      resolve(
        process.cwd(),
        "src/lib/shared/sequence-viewer/components/AnimationPlayer.svelte"
      ),
      "utf8"
    );

    expect(HERO_TRAIL_PRESET.mode).toBe(TrailMode.FADE);
    expect(HERO_TRAIL_PRESET.lineWidth).toBe(5);
    expect(HERO_TRAIL_PRESET.glowBlur).toBe(8);
    expect(HERO_TIP_EFFECT_MAP["*"]?.effect).toBe("trails");
    expect(constructSource).toContain(
      "trailSettingsOverride={HERO_TRAIL_PRESET}"
    );
    expect(constructSource).toContain("tipEffectMap={HERO_TIP_EFFECT_MAP}");
    expect(playerSource).toContain(
      "const t = trailSettingsOverride ?? animationSettings.trail"
    );
    expect(playerSource.match(/\{tipEffectMap\}/g)).toHaveLength(2);
  });
});
