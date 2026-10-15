import { flushSync, mount, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as ArcadeSessionModule from "#lib/features/learn/play/state/arcade-session-state.svelte.js";
import { createArcadeSession } from "#lib/features/learn/play/state/arcade-session-state.svelte.js";
import ComposerArcadeDemo from "../ComposerArcadeDemo.svelte";

vi.mock(
  "#lib/features/learn/play/state/arcade-session-state.svelte.js",
  async (importOriginal) => {
    const actual = await importOriginal<typeof ArcadeSessionModule>();
    return {
      ...actual,
      createArcadeSession: vi.fn(actual.createArcadeSession),
    };
  }
);
vi.mock("#lib/features/learn/play/games/PictographToLetterGame.svelte", () => ({
  default: () => {},
}));
vi.mock("#lib/features/learn/services/learn-events", () => ({
  trackQuizStarted: vi.fn(),
  trackQuizAnswer: vi.fn(),
  trackQuizCompleted: vi.fn(),
}));

describe("Composer arcade demo", () => {
  let mounted: ReturnType<typeof mount> | undefined;
  afterEach(async () => {
    if (mounted) await unmount(mounted);
    mounted = undefined;
    document.body.replaceChildren();
    vi.clearAllMocks();
  });

  it("starts the real ten-question Type 1 challenge on mount", () => {
    mounted = mount(ComposerArcadeDemo, { target: document.body });
    flushSync();
    const session = vi.mocked(createArcadeSession).mock.results[0]?.value;
    expect(session).toBeDefined();
    expect(session?.phase.name).toBe("playing");
    if (session?.phase.name !== "playing")
      throw new Error("Demo did not start");
    expect(session.phase.game.id).toBe("pictograph-to-letter");
    expect(session.phase.challenge.challengeNumber).toBe(1);
    expect(session.phase.challenge.mode).toEqual({
      kind: "fixed",
      questionCount: 10,
    });
    expect(session.phase.challenge.constraints.letters?.length).toBeGreaterThan(
      0
    );
    expect(document.body.textContent).toContain("/10");
  });
});
