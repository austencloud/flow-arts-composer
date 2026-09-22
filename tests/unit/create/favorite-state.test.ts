import { describe, expect, it, vi } from "vitest";
import {
  createFavoriteState,
  type FavoriteStateDeps,
} from "$lib/features/create/generate/state/favorite-state.svelte";
import type {
  CommunitySetup,
  SavedGeneratorSetup,
} from "$lib/features/create/generate/domain/models/favorite-config";
import { captureSetupSnapshot } from "$lib/features/create/generate/domain/setup-snapshot";
import { createLiveConfigHarness } from "./favorite-state-live-harness.svelte";

const NOW = new Date();
const CONFIG = {
  level: 2,
  length: 8,
  mode: "freeform",
  spellTargetLength: null,
} as unknown as SavedGeneratorSetup["config"];

function makeSetup(id: string, name = id): SavedGeneratorSetup {
  return {
    id,
    name,
    config: CONFIG,
    startEndOptions: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeCommunitySetup(
  userId: string,
  setupId: string,
  name = setupId
): CommunitySetup {
  return {
    setupId,
    userId,
    displayName: `User ${userId}`,
    name,
    config: CONFIG,
    startEndOptions: null,
    createdAt: NOW,
  };
}

interface FakeOptions {
  personal?: SavedGeneratorSetup[] | Error;
  community?: CommunitySetup[] | Error;
}

function makeDeps(options: FakeOptions = {}) {
  const personal = options.personal ?? [];
  const community = options.community ?? [];
  const repository = {
    loadPersonal: vi.fn(async () => {
      if (personal instanceof Error) throw personal;
      return personal;
    }),
    loadCommunity: vi.fn(async () => {
      if (community instanceof Error) throw community;
      return community;
    }),
    createSetup: vi.fn(
      async (
        _userId: string,
        draft: {
          name: string;
          config: SavedGeneratorSetup["config"];
          startEndOptions: SavedGeneratorSetup["startEndOptions"];
        }
      ) => ({
        ...makeSetup("new-id", draft.name),
        config: draft.config,
        startEndOptions: draft.startEndOptions,
      })
    ),
    renameSetup: vi.fn(async () => undefined),
    updateSetup: vi.fn(async () => undefined),
    deleteSetup: vi.fn(async () => undefined),
  };
  const deps: Partial<FavoriteStateDeps> = {
    repository,
    isAuthReady: () => true,
    awaitAuthReady: vi.fn(async () => undefined),
    getUserId: () => "u1",
    isPreviewActive: () => false,
    notifySuccess: vi.fn(),
    reportUserError: vi.fn(),
  };
  return { repository, deps };
}

const liveSnapshot = () => captureSetupSnapshot(CONFIG, null);

async function settled<
  T extends {
    isLoadingSetups: boolean;
    isLoadingCommunity: boolean;
  },
>(state: T): Promise<T> {
  await vi.waitFor(() => {
    expect(state.isLoadingSetups).toBe(false);
    expect(state.isLoadingCommunity).toBe(false);
  });
  return state;
}

describe("favorite state", () => {
  it("waits for restored auth before reading saved setups", async () => {
    let releaseAuth!: () => void;
    const authReady = new Promise<void>((resolve) => {
      releaseAuth = resolve;
    });
    const { deps, repository } = makeDeps();
    deps.isAuthReady = () => false;
    deps.awaitAuthReady = () => authReady;

    const state = createFavoriteState(liveSnapshot, deps);
    await Promise.resolve();
    expect(repository.loadPersonal).not.toHaveBeenCalled();
    expect(repository.loadCommunity).not.toHaveBeenCalled();

    releaseAuth();
    await settled(state);

    expect(repository.loadPersonal).toHaveBeenCalledOnce();
    expect(repository.loadCommunity).toHaveBeenCalledOnce();
  });

  it("personal and community loads settle independently", async () => {
    const { deps } = makeDeps({ community: new Error("outage") });
    const state = await settled(
      createFavoriteState(liveSnapshot, deps)
    );
    expect(state.setupsLoadError).toBeNull();
    expect(state.communityLoadError).toBe(
      "Community setups could not load"
    );
    expect(state.communitySetups).toEqual([]);
  });

  it("failed personal read exposes error state", async () => {
    const { deps } = makeDeps({
      personal: new Error("permission-denied"),
    });
    const state = await settled(
      createFavoriteState(liveSnapshot, deps)
    );
    expect(state.setupsLoadError).toBe(
      "Saved setups could not load"
    );
    expect(state.canSave).toBe(false);
  });

  it("hides the viewer's own setups from the community list", async () => {
    const { deps } = makeDeps({
      community: [
        makeCommunitySetup("u1", "mine"),
        makeCommunitySetup("u2", "theirs"),
      ],
    });
    const state = await settled(
      createFavoriteState(liveSnapshot, deps)
    );
    expect(state.communitySetups.map((setup) => setup.setupId)).toEqual([
      "theirs",
    ]);
  });

  it("save activates the returned setup and reports success", async () => {
    const { deps } = makeDeps();
    const state = await settled(
      createFavoriteState(liveSnapshot, deps)
    );
    await expect(state.saveCurrentSetup()).resolves.toBe(true);
    expect(state.setups.map((setup) => setup.id)).toEqual([
      "new-id",
    ]);
    expect(state.activeSource).toEqual({
      kind: "setup",
      setupId: "new-id",
    });
    expect(state.activeStatus).toBe("active");
    expect(deps.notifySuccess).toHaveBeenCalledWith(
      "Saved and shared with the community"
    );
  });

  it("update writes the setup without a share flag", async () => {
    const live = createLiveConfigHarness(CONFIG);
    const { deps, repository } = makeDeps({
      personal: [makeSetup("s1")],
    });
    const state = await settled(
      createFavoriteState(live.getLiveSnapshot, deps)
    );
    state.setActiveSource(
      { kind: "setup", setupId: "s1" },
      live.getLiveSnapshot()
    );
    live.setLevel(3);
    expect(state.activeStatus).toBeNull();

    await expect(state.updateSetupFromCurrent("s1")).resolves.toBe(true);
    expect(repository.updateSetup).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ id: "s1" })
    );
    expect(repository.updateSetup.mock.calls[0]).toHaveLength(2);
    expect(state.activeStatus).toBe("active");
    expect(state.setups[0].config.level).toBe(3);
  });

  it("rename requires a known setup", async () => {
    const { deps, repository } = makeDeps({
      personal: [makeSetup("s1")],
    });
    const state = await settled(
      createFavoriteState(liveSnapshot, deps)
    );

    const longName = "x".repeat(70);
    await expect(
      state.renameSetup("s1", "  " + longName + "  ")
    ).resolves.toBe(true);
    expect(repository.renameSetup).toHaveBeenCalledWith(
      "u1",
      "s1",
      "x".repeat(60)
    );
    expect(state.setups[0].name).toBe("x".repeat(60));

    await expect(state.renameSetup("s1", "   ")).resolves.toBe(false);
    await expect(state.renameSetup("missing", "Name")).resolves.toBe(
      false
    );
    expect(repository.renameSetup).toHaveBeenCalledOnce();
  });

  it("failed writes mutate nothing", async () => {
    const { deps, repository } = makeDeps({
      personal: [makeSetup("s1")],
    });
    repository.deleteSetup.mockRejectedValue(new Error("offline"));
    const state = await settled(
      createFavoriteState(liveSnapshot, deps)
    );

    await expect(state.deleteSetup("s1")).resolves.toBe(false);
    expect(state.setups).toHaveLength(1);
    expect(deps.reportUserError).toHaveBeenCalled();
  });

  it("deleting the active setup clears provenance", async () => {
    const { deps, repository } = makeDeps({
      personal: [makeSetup("s1")],
    });
    const state = await settled(
      createFavoriteState(liveSnapshot, deps)
    );
    state.setActiveSource({ kind: "setup", setupId: "s1" });

    await expect(state.deleteSetup("s1")).resolves.toBe(true);
    expect(repository.deleteSetup).toHaveBeenCalledWith("u1", "s1");
    expect(state.activeSource).toBeNull();
    expect(state.setups).toEqual([]);
  });

  it("uses the applied snapshot as the active baseline", async () => {
    const legacyConfig = {
      level: 2,
    } as unknown as SavedGeneratorSetup["config"];
    const { deps } = makeDeps({
      personal: [
        {
          ...makeSetup("legacy"),
          config: legacyConfig,
        },
      ],
    });
    const state = await settled(
      createFavoriteState(liveSnapshot, deps)
    );

    state.setActiveSource(
      { kind: "setup", setupId: "legacy" },
      liveSnapshot()
    );

    expect(state.activeStatus).toBe("active");
  });

  it("resolves a community source by setup id", async () => {
    const { deps } = makeDeps({
      community: [
        {
          ...makeCommunitySetup("u2", "first"),
          config: {
            ...CONFIG,
            level: 5,
          } as unknown as SavedGeneratorSetup["config"],
        },
        makeCommunitySetup("u2", "second"),
      ],
    });
    const state = await settled(
      createFavoriteState(liveSnapshot, deps)
    );

    state.setActiveSource({
      kind: "community",
      userId: "u2",
      setupId: "first",
    });
    expect(state.activeStatus).toBeNull();

    state.setActiveSource({
      kind: "community",
      userId: "u2",
      setupId: "second",
    });

    expect(state.activeSource).toEqual({
      kind: "community",
      userId: "u2",
      setupId: "second",
    });
    expect(state.activeStatus).toBe("active");
  });

  it("detaches the applied setup when a control changes", async () => {
    const live = createLiveConfigHarness(CONFIG);
    const { deps } = makeDeps({
      personal: [makeSetup("s1")],
    });
    const state = await settled(
      createFavoriteState(live.getLiveSnapshot, deps)
    );
    state.setActiveSource(
      { kind: "setup", setupId: "s1" },
      live.getLiveSnapshot()
    );
    expect(state.activeStatus).toBe("active");

    live.setLevel(3);

    expect(state.activeSource).toBeNull();
    expect(state.activeStatus).toBeNull();
  });

  it("re-attaches the applied setup when the controls match it again", async () => {
    const live = createLiveConfigHarness(CONFIG);
    const { deps } = makeDeps({
      personal: [makeSetup("s1")],
    });
    const state = await settled(
      createFavoriteState(live.getLiveSnapshot, deps)
    );
    state.setActiveSource(
      { kind: "setup", setupId: "s1" },
      live.getLiveSnapshot()
    );

    live.setLevel(3);
    expect(state.activeSource).toBeNull();

    live.setLevel(CONFIG.level);

    expect(state.activeSource).toEqual({ kind: "setup", setupId: "s1" });
    expect(state.activeStatus).toBe("active");
  });

  it("clears private setups when the active identity signs out", async () => {
    let userId: string | null = "u1";
    const { deps } = makeDeps({
      personal: [makeSetup("s1")],
    });
    deps.getUserId = () => userId;
    const state = await settled(
      createFavoriteState(liveSnapshot, deps)
    );
    state.setActiveSource({ kind: "setup", setupId: "s1" });

    userId = null;
    await state.loadPersonal();

    expect(state.setups).toEqual([]);
    expect(state.activeSource).toBeNull();
    expect(state.activeStatus).toBeNull();
  });

  it("ignores a stale personal read after the identity changes", async () => {
    let userId: string | null = "u1";
    let resolveFirst!: (value: SavedGeneratorSetup[]) => void;
    const firstRead = new Promise<SavedGeneratorSetup[]>((resolve) => {
      resolveFirst = resolve;
    });
    const { deps, repository } = makeDeps();
    deps.getUserId = () => userId;
    repository.loadPersonal.mockImplementation(
      async (requestedUserId: string) =>
        requestedUserId === "u1" ? firstRead : [makeSetup("u2-setup")]
    );

    const state = createFavoriteState(liveSnapshot, deps);
    await vi.waitFor(() => {
      expect(repository.loadPersonal).toHaveBeenCalledWith("u1");
    });
    const staleOperation = state.loadPersonal();

    userId = "u2";
    await state.loadPersonal();
    resolveFirst([makeSetup("stale-u1-setup")]);
    await staleOperation;

    expect(state.setups.map((setup) => setup.id)).toEqual([
      "u2-setup",
    ]);
  });

  it("admin preview loads read-only", async () => {
    const { deps, repository } = makeDeps({
      personal: [makeSetup("s1")],
    });
    deps.isPreviewActive = () => true;
    const state = await settled(
      createFavoriteState(liveSnapshot, deps)
    );

    expect(repository.loadPersonal).toHaveBeenCalledWith("u1");
    await expect(state.saveCurrentSetup()).resolves.toBe(false);
    expect(state.canSave).toBe(false);
  });

  it("retry clears the error after a successful reload", async () => {
    const { deps, repository } = makeDeps({
      community: new Error("outage"),
    });
    const state = await settled(
      createFavoriteState(liveSnapshot, deps)
    );
    repository.loadCommunity.mockResolvedValue([]);

    await state.loadCommunity();

    expect(state.communityLoadError).toBeNull();
  });

  it("disables save at the ten-setup cap", async () => {
    const ten = Array.from({ length: 10 }, (_, index) =>
      makeSetup(`s${index}`, `Setup ${index + 1}`)
    );
    const { deps } = makeDeps({ personal: ten });
    const state = await settled(
      createFavoriteState(liveSnapshot, deps)
    );

    expect(state.canSave).toBe(false);
    await expect(state.saveCurrentSetup()).resolves.toBe(false);
  });
});
