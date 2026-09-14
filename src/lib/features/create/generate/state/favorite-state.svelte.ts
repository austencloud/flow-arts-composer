/**
 * Saved-setups and community-Favorite state for GeneratePanel.
 *
 * Persistence, auth, and the live panel snapshot are dependency injected so
 * the state stays testable. Mutations return false after reporting a failure;
 * callers must not close the drawer or mutate UI optimistically.
 */
import {
  generatorSetupRepository,
  type GeneratorSetupRepository,
} from "../services/favorite-config-repository";
import {
  authState,
  awaitAuthSettled,
  getEffectiveUserId,
} from "$lib/shared/auth/state/auth-state.svelte";
import { userPreviewState } from "$lib/shared/debug/state/user-preview-state.svelte";
import { getErrorHandler } from "$lib/shared/application/get-error-handler";
import { showToast } from "$lib/shared/toast/state/toast-state.svelte";
import {
  captureSetupSnapshot,
  setupSnapshotsEqual,
  type SetupSnapshot,
} from "../domain/setup-snapshot";
import type {
  ActiveSetupSource,
  CommunityFavorite,
  PendingSetupAction,
  SavedGeneratorSetup,
} from "../domain/models/favorite-config";

export const SETUP_CAP = 10;
export const SETUP_NAME_MAX_LENGTH = 60;

export interface FavoriteStateDeps {
  repository: GeneratorSetupRepository;
  isAuthReady: () => boolean;
  awaitAuthReady: () => Promise<void>;
  getUserId: () => string | null;
  isPreviewActive: () => boolean;
  isAnonymousUser: () => boolean;
  getLiveSnapshot: () => SetupSnapshot;
  notifySuccess: (message: string) => void;
  reportUserError: (
    message: string,
    error: unknown,
    action: string
  ) => void;
}

function defaultDeps(
  getLiveSnapshot: () => SetupSnapshot
): FavoriteStateDeps {
  return {
    repository: generatorSetupRepository,
    isAuthReady: () => authState.initialized,
    awaitAuthReady: awaitAuthSettled,
    getUserId: getEffectiveUserId,
    isPreviewActive: () => userPreviewState.isActive,
    isAnonymousUser: () =>
      !authState.isAuthenticated || authState.isAnonymous,
    getLiveSnapshot,
    notifySuccess: (message) => showToast(message, "success"),
    reportUserError: (message, error, action) => {
      getErrorHandler().showUserError({
        message,
        technicalDetails:
          error instanceof Error ? error.message : String(error),
        error:
          error instanceof Error ? error : new Error(String(error)),
        severity: "error",
        context: { module: "create", tab: "generate", action },
      });
    },
  };
}

function nextSetupName(existing: SavedGeneratorSetup[]): string {
  const names = new Set(existing.map((setup) => setup.name));
  for (let index = 1; index <= existing.length; index += 1) {
    const candidate = `Setup ${index}`;
    if (!names.has(candidate)) return candidate;
  }
  return `Setup ${existing.length + 1}`;
}

export function createFavoriteState(
  getLiveSnapshot: () => SetupSnapshot,
  overrides?: Partial<FavoriteStateDeps>
) {
  const deps: FavoriteStateDeps = {
    ...defaultDeps(getLiveSnapshot),
    ...overrides,
  };

  let setups = $state<SavedGeneratorSetup[]>([]);
  let communityFavorites = $state<CommunityFavorite[]>([]);
  let sharedSetupId = $state<string | null>(null);
  let appliedSource = $state<ActiveSetupSource | null>(null);
  let appliedBaseline = $state<SetupSnapshot | null>(null);
  let isLoadingSetups = $state(true);
  let isLoadingCommunity = $state(true);
  let setupsLoadError = $state<string | null>(null);
  let communityLoadError = $state<string | null>(null);
  let pendingAction = $state<PendingSetupAction | null>(null);
  let personalIdentity: string | null = null;
  let personalRequestVersion = 0;
  let communityRequestVersion = 0;
  let personalInFlight: {
    userId: string;
    operation: Promise<void>;
  } | null = null;
  let communityInFlight: {
    userId: string | null;
    operation: Promise<void>;
  } | null = null;

  // A setup is active only while the live panel equals the snapshot captured
  // when it was applied. Any edit detaches it; editing back re-attaches it.
  const activeSource = $derived.by<ActiveSetupSource | null>(() => {
    if (!appliedSource || !appliedBaseline) return null;
    return setupSnapshotsEqual(appliedBaseline, deps.getLiveSnapshot())
      ? appliedSource
      : null;
  });

  const activeStatus = $derived<"active" | null>(
    activeSource ? "active" : null
  );

  const canSave = $derived(
    deps.getUserId() !== null &&
      !deps.isPreviewActive() &&
      !isLoadingSetups &&
      setupsLoadError === null &&
      setups.length < SETUP_CAP &&
      pendingAction === null
  );

  void loadPersonal();
  void loadCommunity();

  async function loadPersonal(): Promise<void> {
    if (!deps.isAuthReady()) await deps.awaitAuthReady();
    const userId = deps.getUserId();
    if (!userId) {
      personalRequestVersion += 1;
      personalInFlight = null;
      personalIdentity = null;
      setups = [];
      sharedSetupId = null;
      setupsLoadError = null;
      if (appliedSource?.kind === "setup") {
        appliedSource = null;
        appliedBaseline = null;
      }
      isLoadingSetups = false;
      return;
    }

    if (personalInFlight?.userId === userId) {
      return personalInFlight.operation;
    }

    if (personalIdentity !== userId) {
      personalIdentity = userId;
      setups = [];
      sharedSetupId = null;
      if (appliedSource?.kind === "setup") {
        appliedSource = null;
        appliedBaseline = null;
      }
    }

    const requestVersion = ++personalRequestVersion;
    isLoadingSetups = true;
    setupsLoadError = null;
    const operation = (async () => {
      try {
        const snapshot = await deps.repository.loadPersonal(userId, {
          allowMigration: !deps.isPreviewActive(),
        });
        if (
          requestVersion !== personalRequestVersion ||
          deps.getUserId() !== userId
        ) {
          return;
        }
        setups = snapshot.setups;
        sharedSetupId = snapshot.sharedSetupId;
      } catch (error) {
        if (
          requestVersion !== personalRequestVersion ||
          deps.getUserId() !== userId
        ) {
          return;
        }
        setupsLoadError = "Saved setups could not load";
        console.error("[FavoriteState] loadPersonal failed:", error);
      } finally {
        if (requestVersion === personalRequestVersion) {
          personalInFlight = null;
          isLoadingSetups = false;
        }
      }
    })();
    personalInFlight = { userId, operation };
    return operation;
  }

  async function loadCommunity(): Promise<void> {
    if (!deps.isAuthReady()) await deps.awaitAuthReady();
    const userId = deps.getUserId();
    if (communityInFlight?.userId === userId) {
      return communityInFlight.operation;
    }

    const requestVersion = ++communityRequestVersion;
    isLoadingCommunity = true;
    communityLoadError = null;
    const operation = (async () => {
      try {
        const all = await deps.repository.loadCommunity(20);
        if (
          requestVersion !== communityRequestVersion ||
          deps.getUserId() !== userId
        ) {
          return;
        }
        communityFavorites = all.filter(
          (favorite) => favorite.userId !== userId
        );
      } catch (error) {
        if (
          requestVersion !== communityRequestVersion ||
          deps.getUserId() !== userId
        ) {
          return;
        }
        communityLoadError = "Community favorites could not load";
        console.error("[FavoriteState] loadCommunity failed:", error);
      } finally {
        if (requestVersion === communityRequestVersion) {
          communityInFlight = null;
          isLoadingCommunity = false;
        }
      }
    })();
    communityInFlight = { userId, operation };
    return operation;
  }

  function guardMutation(): string | null {
    const userId = deps.getUserId();
    if (!userId || deps.isPreviewActive() || pendingAction) return null;
    return userId;
  }

  async function saveCurrentSetup(): Promise<boolean> {
    const userId = guardMutation();
    if (!userId || setups.length >= SETUP_CAP) return false;

    pendingAction = { kind: "create" };
    try {
      const snapshot = deps.getLiveSnapshot();
      const created = await deps.repository.createSetup(userId, {
        name: nextSetupName(setups),
        config: snapshot.config,
        startEndOptions: snapshot.startEndOptions,
      });
      setups = [...setups, created];
      appliedSource = { kind: "setup", setupId: created.id };
      appliedBaseline = captureSetupSnapshot(
        created.config,
        created.startEndOptions
      );
      deps.notifySuccess("Setup saved");
      return true;
    } catch (error) {
      deps.reportUserError(
        "Couldn't save your setup",
        error,
        "saveCurrentSetup"
      );
      return false;
    } finally {
      pendingAction = null;
    }
  }

  async function renameSetup(
    setupId: string,
    rawName: string
  ): Promise<boolean> {
    const userId = guardMutation();
    const name = rawName.trim().slice(0, SETUP_NAME_MAX_LENGTH);
    if (!userId || !name) return false;

    pendingAction = { kind: "rename", setupId };
    try {
      await deps.repository.renameSetup(userId, setupId, name);
      setups = setups.map((setup) =>
        setup.id === setupId
          ? { ...setup, name, updatedAt: new Date() }
          : setup
      );
      deps.notifySuccess("Setup renamed");
      return true;
    } catch (error) {
      deps.reportUserError(
        "Couldn't rename the setup",
        error,
        "renameSetup"
      );
      return false;
    } finally {
      pendingAction = null;
    }
  }

  async function updateSetupFromCurrent(
    setupId: string
  ): Promise<boolean> {
    const userId = guardMutation();
    const existing = setups.find((setup) => setup.id === setupId);
    if (!userId || !existing) return false;

    pendingAction = { kind: "update", setupId };
    try {
      const snapshot = deps.getLiveSnapshot();
      const updated: SavedGeneratorSetup = {
        ...existing,
        config: snapshot.config,
        startEndOptions: snapshot.startEndOptions,
        updatedAt: new Date(),
      };
      await deps.repository.updateSetup(
        userId,
        updated,
        sharedSetupId === setupId
      );
      setups = setups.map((setup) =>
        setup.id === setupId ? updated : setup
      );
      if (
        appliedSource?.kind === "setup" &&
        appliedSource.setupId === setupId
      ) {
        appliedBaseline = snapshot;
      }
      deps.notifySuccess("Setup updated");
      return true;
    } catch (error) {
      deps.reportUserError(
        "Couldn't update the setup",
        error,
        "updateSetupFromCurrent"
      );
      return false;
    } finally {
      pendingAction = null;
    }
  }

  async function shareSetup(setupId: string): Promise<boolean> {
    const userId = guardMutation();
    const setup = setups.find((candidate) => candidate.id === setupId);
    if (!userId || !setup || deps.isAnonymousUser()) return false;

    pendingAction = { kind: "share", setupId };
    try {
      await deps.repository.shareSetup(userId, setup);
      sharedSetupId = setupId;
      deps.notifySuccess("Shared as your Favorite");
      return true;
    } catch (error) {
      deps.reportUserError(
        "Couldn't share the setup",
        error,
        "shareSetup"
      );
      return false;
    } finally {
      pendingAction = null;
    }
  }

  async function unshareSetup(): Promise<boolean> {
    const userId = guardMutation();
    if (!userId || sharedSetupId === null) return false;

    pendingAction = { kind: "unshare" };
    try {
      await deps.repository.unshareSetup(userId);
      sharedSetupId = null;
      deps.notifySuccess("Your setup is no longer shared");
      return true;
    } catch (error) {
      deps.reportUserError(
        "Couldn't stop sharing the setup",
        error,
        "unshareSetup"
      );
      return false;
    } finally {
      pendingAction = null;
    }
  }

  async function deleteSetup(setupId: string): Promise<boolean> {
    const userId = guardMutation();
    if (!userId) return false;

    pendingAction = { kind: "delete", setupId };
    try {
      await deps.repository.deleteSetup(
        userId,
        setupId,
        sharedSetupId === setupId
      );
      setups = setups.filter((setup) => setup.id !== setupId);
      if (sharedSetupId === setupId) sharedSetupId = null;
      if (
        appliedSource?.kind === "setup" &&
        appliedSource.setupId === setupId
      ) {
        appliedSource = null;
        appliedBaseline = null;
      }
      deps.notifySuccess("Setup deleted");
      return true;
    } catch (error) {
      deps.reportUserError(
        "Couldn't delete the setup",
        error,
        "deleteSetup"
      );
      return false;
    } finally {
      pendingAction = null;
    }
  }

  function setActiveSource(
    source: ActiveSetupSource,
    appliedSnapshot?: SetupSnapshot
  ): void {
    appliedSource = source;
    if (appliedSnapshot) {
      appliedBaseline = captureSetupSnapshot(
        appliedSnapshot.config,
        appliedSnapshot.startEndOptions
      );
      return;
    }

    const saved =
      source.kind === "setup"
        ? setups.find((setup) => setup.id === source.setupId)
        : communityFavorites.find(
            (favorite) => favorite.userId === source.userId
          );
    appliedBaseline = saved
      ? captureSetupSnapshot(
          saved.config,
          saved.startEndOptions ?? null
        )
      : null;
  }

  return {
    get setups() {
      return setups;
    },
    get communityFavorites() {
      return communityFavorites;
    },
    get sharedSetupId() {
      return sharedSetupId;
    },
    get activeSource() {
      return activeSource;
    },
    get activeStatus() {
      return activeStatus;
    },
    get isLoadingSetups() {
      return isLoadingSetups;
    },
    get isLoadingCommunity() {
      return isLoadingCommunity;
    },
    get setupsLoadError() {
      return setupsLoadError;
    },
    get communityLoadError() {
      return communityLoadError;
    },
    get pendingAction() {
      return pendingAction;
    },
    get canSave() {
      return canSave;
    },

    loadPersonal,
    loadCommunity,
    saveCurrentSetup,
    renameSetup,
    updateSetupFromCurrent,
    shareSetup,
    unshareSetup,
    deleteSetup,
    setActiveSource,
  };
}

export type FavoriteState = ReturnType<typeof createFavoriteState>;
