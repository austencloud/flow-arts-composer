import { describe, expect, it } from "vitest";
import { createWatcher, DEFAULTS } from "../../../scripts/preflight-watch.mjs";

const MIN = 60_000;
const TREE_A = "a".repeat(40);
const TREE_B = "b".repeat(40);

type Verdict = "green" | "red" | null;

// A fake main, cache and d2: the test moves main and the clock, and settles
// each started run by hand.
function harness() {
  const world = {
    now: 0,
    main: { sha: "1".repeat(40), tree: TREE_A },
    movedAt: 0 as number | null,
    published: null as string | null,
    cache: new Map<string, Verdict>(),
    otherGate: false,
    runs: [] as { sha: string; settle: (code: number) => void }[],
    lines: [] as string[],
  };
  const watcher = createWatcher(
    {
      now: () => world.now,
      readMain: () => world.main,
      mainMovedAt: () => world.movedAt,
      publishedTree: () => world.published,
      cached: (tree: string) => world.cache.get(tree) ?? null,
      otherGateLive: () => world.otherGate,
      runPreflight: (sha: string) =>
        new Promise((done) => {
          world.runs.push({ sha, settle: (code) => done({ code, job: null }) });
        }),
      log: (line: string) => world.lines.push(line),
    },
    DEFAULTS
  );
  const moveMain = (n: string, tree: string) => {
    world.main = { sha: n.repeat(40), tree };
    world.movedAt = world.now;
  };
  return { world, watcher, moveMain };
}

describe("preflight-watch", () => {
  it("waits out the quiet period, then starts exactly one run", async () => {
    const { world, watcher } = harness();
    expect(watcher.tick().action).toBe("waiting");
    world.now = 9 * MIN;
    expect(watcher.tick().action).toBe("waiting");
    world.now = 10 * MIN;
    const started = watcher.tick();
    expect(started.action).toBe("start");
    expect(world.runs.map((run) => run.sha)).toEqual([world.main.sha]);

    world.now = 11 * MIN;
    expect(watcher.tick().action).toBe("running");
    expect(world.runs).toHaveLength(1);

    world.cache.set(TREE_A, "green");
    world.runs[0].settle(0);
    await started.done;
    expect(watcher.tick().action).toBe("cached-green");
    expect(world.runs).toHaveLength(1);
  });

  it("counts quiet from the reflog, so a restart does not reset it", () => {
    const { world, watcher } = harness();
    world.movedAt = 0;
    world.now = 30 * MIN;
    expect(watcher.tick().action).toBe("start");
  });

  it("skips a tree that is cached green or red, or already published", () => {
    for (const [setup, action] of [
      [
        (w: ReturnType<typeof harness>["world"]) =>
          w.cache.set(TREE_A, "green"),
        "cached-green",
      ],
      [
        (w: ReturnType<typeof harness>["world"]) => w.cache.set(TREE_A, "red"),
        "cached-red",
      ],
      [
        (w: ReturnType<typeof harness>["world"]) => (w.published = TREE_A),
        "published",
      ],
    ] as const) {
      const { world, watcher } = harness();
      setup(world);
      world.now = 60 * MIN;
      expect(watcher.tick().action).toBe(action);
      expect(world.runs).toHaveLength(0);
    }
  });

  it("waits while another publish on this machine holds a preflight lock", () => {
    const { world, watcher } = harness();
    world.otherGate = true;
    world.now = 20 * MIN;
    expect(watcher.tick().action).toBe("busy");
    world.otherGate = false;
    expect(watcher.tick().action).toBe("start");
  });

  it("finishes a run when main moves mid-run, then gives the new tree its own quiet period", async () => {
    const { world, watcher, moveMain } = harness();
    world.now = 10 * MIN;
    const first = watcher.tick();
    expect(first.action).toBe("start");

    world.now = 15 * MIN;
    moveMain("2", TREE_B);
    expect(watcher.tick().action).toBe("running");

    world.cache.set(TREE_A, "green");
    world.now = 20 * MIN;
    world.runs[0].settle(0);
    await first.done;
    expect(watcher.tick().action).toBe("waiting");
    world.now = 25 * MIN;
    expect(watcher.tick().action).toBe("start");
    expect(world.runs.map((run) => run.sha)).toEqual([
      "1".repeat(40),
      "2".repeat(40),
    ]);
  });

  it("retries a run that left no verdict only after the backoff", async () => {
    const { world, watcher } = harness();
    world.now = 10 * MIN;
    const first = watcher.tick();
    world.runs[0].settle(2);
    await first.done;
    expect(watcher.tick().action).toBe("backoff");
    world.now = 10 * MIN + DEFAULTS.retryMs;
    expect(watcher.tick().action).toBe("start");
    expect(world.runs).toHaveLength(2);
  });

  it("only says it would start on a dry run", () => {
    const { world, watcher } = harness();
    world.now = 10 * MIN;
    expect(watcher.tick({ dryRun: true }).action).toBe("start");
    expect(world.runs).toHaveLength(0);
    expect(world.lines.at(-1)).toMatch(/^would start/);
  });

  it("logs a repeated decision once", () => {
    const { world, watcher } = harness();
    world.now = 10 * MIN;
    world.cache.set(TREE_A, "green");
    watcher.tick();
    watcher.tick();
    watcher.tick();
    expect(
      world.lines.filter((line) => line.startsWith("skipped-cached"))
    ).toHaveLength(1);
  });
});
