import { describe, expect, it, vi } from "vitest";
import {
  createFavoriteState,
  type FavoriteStateDeps,
} from "$lib/features/create/generate/state/favorite-state.svelte";
import type {
  CommunityFavorite,
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

interface FakeOptions {
  personal?:
    | { setups: SavedGeneratorSetup[]; sharedSetupId: string | null }
    | Error;
  community?: CommunityFavorite[] | Error;
}

function makeDeps(options: FakeOptions = {}) {
  const personal = options.personal ?? {
    setups: [],
    sharedSetupId: null,
  };
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
      async (_userId: string, draft: { name: string }) =>
        makeSetup("new-id", draft.name)
    ),
    renameSetup: vi.fn(async () => undefined),
    updateSetup: vi.fn(async () => undefined),
    deleteSetup: vi.fn(async () => undefined),
    shareSetup: vi.fn(async () => undefined),
    unshareSetup: vi.fn(async () => undefined),
  };
  const deps: Partial<FavoriteStateDeps> = {
    repository,
    isAuthReady: () => true,
    awaitAuthReady: vi.fn(async () => undefined),
    getUserId: () => "u1",
    isPreviewActive: () => false,
    isAnonymousUser: () => false,
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
      "Community favorites could not load"
    );
    expect(state.communityFavorites).toEqual([]);
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
    expect(deps.notifySuccess).toHaveBeenCalledWith("Setup saved");
  });

  it("failed writes mutate nothing", async () => {
    const { deps, repository } = makeDeps({
      personal: {
        setups: [makeSetup("s1")],
        sharedSetupId: "s1",
      },
    });
    repository.deleteSetup.mockRejectedValue(new Error("offline"));
    const state = await settled(
      createFavoriteState(liveSnapshot, deps)
    );

    await expect(state.deleteSetup("s1")).resolves.toBe(false);
    expect(state.setups).toHaveLength(1);
    expect(state.sharedSetupId).toBe("s1");
    expect(deps.reportUserError).toHaveBeenCalled();
  });

  it("deleting the active setup clears provenance", async () => {
    const { deps } = makeDeps({
      personal: {
        setups: [makeSetup("s1")],
        sharedSetupId: null,
      },
    });
    const state = await settled(
      createFavoriteState(liveSnapshot, deps)
    );
    state.setActiveSource({ kind: "setup", setupId: "s1" });

    await expect(state.deleteSetup("s1")).resolves.toBe(true);
    expect(state.activeSource).toBeNull();
    expect(state.setups).toEqual([]);
  });

  it("uses the applied snapshot as the active baseline", async () => {
    const legacyConfig = {
      level: 2,
    } as unknown as SavedGeneratorSetup["config"];
    const { deps } = makeDeps({
      personal: {
        setups: [
          {
            ...makeSetup("legacy"),
            config: legacyConfig,
          },
        ],
        sharedSetupId: null,
      },
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

  it("detaches the applied setup when a control changes", async () => {
    const live = createLiveConfigHarness(CONFIG);
    const { deps } = makeDeps({
      personal: {
        setups: [makeSetup("s1")],
        sharedSetupId: null,
      },
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
      personal: {
        setups: [makeSetup("s1")],
        sharedSetupId: null,
      },
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
      personal: {
        setups: [makeSetup("s1")],
        sharedSetupId: "s1",
      },
    });
    deps.getUserId = () => userId;
    const state = await settled(
      createFavoriteState(liveSnapshot, deps)
    );
    state.setActiveSource({ kind: "setup", setupId: "s1" });

    userId = null;
    await state.loadPersonal();

    expect(state.setups).toEqual([]);
    expect(state.sharedSetupId).toBeNull();
    expect(state.activeSource).toBeNull();
    expect(state.activeStatus).toBeNull();
  });

  it("ignores a stale personal read after the identity changes", async () => {
    let userId: string | null = "u1";
    let resolveFirst!: (value: {
      setups: SavedGeneratorSetup[];
      sharedSetupId: string | null;
    }) => void;
    const firstRead = new Promise<{
      setups: SavedGeneratorSetup[];
      sharedSetupId: string | null;
    }>((resolve) => {
      resolveFirst = resolve;
    });
    const { deps, repository } = makeDeps();
    deps.getUserId = () => userId;
    repository.loadPersonal.mockImplementation(
      async (requestedUserId: string) =>
        requestedUserId === "u1"
          ? firstRead
          : {
              setups: [makeSetup("u2-setup")],
              sharedSetupId: null,
            }
    );

    const state = createFavoriteState(liveSnapshot, deps);
    await vi.waitFor(() => {
      expect(repository.loadPersonal).toHaveBeenCalledWith("u1", {
        allowMigration: true,
      });
    });

    userId = "u2";
    await state.loadPersonal();
    resolveFirst({
      setups: [makeSetup("stale-u1-setup")],
      sharedSetupId: null,
    });
    await firstRead;

    expect(state.setups.map((setup) => setup.id)).toEqual([
      "u2-setup",
    ]);
  });

  it("sharing replaces the shared setup", async () => {
    const { deps } = makeDeps({
      personal: {
        setups: [makeSetup("s1"), makeSetup("s2")],
        sharedSetupId: "s1",
      },
    });
    const state = await settled(
      createFavoriteState(liveSnapshot, deps)
    );

    await expect(state.shareSetup("s2")).resolves.toBe(true);
    expect(state.sharedSetupId).toBe("s2");
  });

  it("anonymous users cannot reach the public share write", async () => {
    const { deps, repository } = makeDeps({
      personal: {
        setups: [makeSetup("s1")],
        sharedSetupId: null,
      },
    });
    deps.isAnonymousUser = () => true;
    const state = await settled(
      createFavoriteState(liveSnapshot, deps)
    );

    await expect(state.shareSetup("s1")).resolves.toBe(false);
    expect(repository.shareSetup).not.toHaveBeenCalled();
  });

  it("admin preview loads read-only", async () => {
    const { deps, repository } = makeDeps({
      personal: {
        setups: [makeSetup("s1")],
        sharedSetupId: null,
      },
    });
    deps.isPreviewActive = () => true;
    const state = await settled(
      createFavoriteState(liveSnapshot, deps)
    );

    expect(repository.loadPersonal).toHaveBeenCalledWith("u1", {
      allowMigration: false,
    });
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
    const { deps } = makeDeps({
      personal: { setups: ten, sharedSetupId: null },
    });
    const state = await settled(
      createFavoriteState(liveSnapshot, deps)
    );

    expect(state.canSave).toBe(false);
    await expect(state.saveCurrentSetup()).resolves.toBe(false);
  });
});
