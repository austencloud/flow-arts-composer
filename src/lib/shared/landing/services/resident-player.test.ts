// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createResidentPlayer,
  moveResidentNode,
  type ResidentClaim,
} from "./resident-player.svelte";

function claimFor(stage: HTMLElement): ResidentClaim {
  return {
    stage,
    railStage: null,
    playerProps: {},
    railProps: {},
    playerActive: true,
    railActive: true,
    placeholder: undefined,
    playerError: (() => {}) as never,
    railError: (() => {}) as never,
    visibilityManager: { id: stage } as never,
  };
}

// The shared test setup mocks document.createElement; this file needs real nodes.
function makeDiv(): HTMLDivElement {
  return Document.prototype.createElement.call(document, "div") as HTMLDivElement;
}

function connectedStage(): HTMLElement {
  return document.body.appendChild(makeDiv());
}

function hosted(idleMs = 1000) {
  const player = createResidentPlayer({ idleMs });
  const detach = player.attachHost();
  return { player, detach };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

describe("resident player claims", () => {
  it("refuses a claim when no host is mounted, so the page keeps its own", () => {
    const player = createResidentPlayer();
    expect(player.claim(claimFor(connectedStage()))).toBeNull();
    expect(player.alive).toBe(false);
  });

  it("gives a second claimant on the same page nothing", () => {
    const { player } = hosted();
    const first = claimFor(connectedStage());
    expect(player.claim(first)).not.toBeNull();
    expect(player.claim(claimFor(connectedStage()))).toBeNull();
    expect(player.current).toBe(first);
  });

  it("lets a new page take over from one that already left the document", () => {
    const { player } = hosted();
    const oldStage = connectedStage();
    const oldHandle = player.claim(claimFor(oldStage))!;
    oldStage.remove();

    const next = claimFor(connectedStage());
    expect(player.claim(next)).not.toBeNull();
    // The old page's late teardown must not evict the page now holding it.
    oldHandle.release();
    expect(player.current).toBe(next);
    expect(player.phase).toBe("claimed");
  });

  it("keeps the first manager for the instance's whole life", () => {
    const { player } = hosted();
    const first = claimFor(connectedStage());
    const firstHandle = player.claim(first)!;
    firstHandle.release();

    const second = player.claim(claimFor(connectedStage()))!;
    expect(second.visibilityManager).toBe(first.visibilityManager);
  });
});

describe("resident player hand-off and parking", () => {
  it("does not pause or park across a same-navigation hand-off", () => {
    vi.useFakeTimers();
    const { player } = hosted();
    player.claim(claimFor(connectedStage()))!.release();
    expect(player.phase).toBe("releasing");
    expect(player.playbackAllowed).toBe(true);

    player.claim(claimFor(connectedStage()));
    vi.advanceTimersByTime(5000);
    expect(player.phase).toBe("claimed");
    expect(player.playbackAllowed).toBe(true);
  });

  it("parks paused when nobody claims, then destroys after the idle", () => {
    vi.useFakeTimers();
    const { player } = hosted(1000);
    player.claim(claimFor(connectedStage()))!.release();

    vi.advanceTimersByTime(0);
    expect(player.phase).toBe("parked");
    expect(player.playbackAllowed).toBe(false);
    expect(player.alive).toBe(true);

    vi.advanceTimersByTime(1000);
    expect(player.phase).toBe("empty");
    expect(player.alive).toBe(false);
  });

  it("resumes when claimed back before the idle runs out", () => {
    vi.useFakeTimers();
    const { player } = hosted(1000);
    player.reportCanvasReady();
    player.reportPlayerStatus("loaded");
    player.claim(claimFor(connectedStage()))!.release();
    vi.advanceTimersByTime(500);

    player.claim(claimFor(connectedStage()));
    vi.advanceTimersByTime(5000);
    expect(player.phase).toBe("claimed");
    expect(player.playbackAllowed).toBe(true);
    expect(player.playerStatus).toBe("loaded");
    expect(player.canvasReady).toBe(true);
  });

  it("forgets the instance's load state once destroyed", () => {
    vi.useFakeTimers();
    const { player } = hosted(1000);
    player.reportCanvasReady();
    player.reportPlayerStatus("loaded");
    player.reportStep(4, "seq");
    player.claim(claimFor(connectedStage()))!.release();
    vi.advanceTimersByTime(1000);

    expect(player.playerStatus).toBe("idle");
    expect(player.canvasReady).toBe(false);
    expect(player.stepFor("seq")).toBe(0);
  });

  it("destroys at once when the chrome unmounts", () => {
    const { player, detach } = hosted();
    player.claim(claimFor(connectedStage()));
    detach();
    expect(player.alive).toBe(false);
    expect(player.current).toBeNull();
  });

  it("reads a reported step only for the sequence it was reported for", () => {
    const { player } = hosted();
    player.reportStep(7, "a");
    expect(player.stepFor("a")).toBe(7);
    expect(player.stepFor("b")).toBe(0);
  });
});

describe("moveResidentNode", () => {
  it("moves into a stage and is a no-op when already there", () => {
    const stage = connectedStage();
    const node = makeDiv();
    moveResidentNode(node, stage);
    expect(node.parentNode).toBe(stage);

    const append = vi.spyOn(stage, "appendChild");
    moveResidentNode(node, stage);
    expect(append).not.toHaveBeenCalled();
  });

  it("uses moveBefore only when both ends are connected", () => {
    const from = connectedStage();
    const to = connectedStage();
    const node = from.appendChild(makeDiv());
    const moveBefore = vi.fn((moved: Node) => to.appendChild(moved));
    Object.assign(to, { moveBefore });
    moveResidentNode(node, to);
    expect(moveBefore).toHaveBeenCalledOnce();

    // Coming out of a page that already left: moveBefore would throw.
    const detachedStage = makeDiv();
    const stranded = detachedStage.appendChild(makeDiv());
    moveBefore.mockClear();
    moveResidentNode(stranded, to);
    expect(moveBefore).not.toHaveBeenCalled();
    expect(stranded.parentNode).toBe(to);
  });
});
