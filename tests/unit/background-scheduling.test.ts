/**
 * `runAtUserVisiblePriority` must start its task at "user-visible" priority.
 * The Create Shape preview starts from an idle callback; at the inherited
 * "background" priority every yield in its loader waits behind the other
 * scenes, and the card misses the reveal wave.
 */
import { afterEach, describe, expect, it } from "vitest";
import { runAtUserVisiblePriority } from "#lib/shared/foundation/utils/background-scheduling.js";

type Global = { scheduler?: unknown };
const host = globalThis as Global;
const original = host.scheduler;

afterEach(() => {
  host.scheduler = original;
});

describe("runAtUserVisiblePriority", () => {
  it("posts the task at user-visible priority and resolves with its result", async () => {
    const priorities: unknown[] = [];
    host.scheduler = {
      postTask: (callback: () => unknown, options?: { priority?: string }) => {
        priorities.push(options?.priority);
        return Promise.resolve().then(callback);
      },
    };
    await expect(runAtUserVisiblePriority(async () => 7)).resolves.toBe(7);
    expect(priorities).toEqual(["user-visible"]);
  });

  it("still runs the task where postTask is missing", async () => {
    host.scheduler = undefined;
    await expect(runAtUserVisiblePriority(() => "ran")).resolves.toBe("ran");
  });
});
