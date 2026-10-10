import {
  createAccountSetupState,
  type AccountSetupIdentity,
  type AccountSetupTaskId,
} from "#lib/shared/onboarding/state/account-setup-state.svelte.js";
import {
  createDefaultAccountSetupProgress,
  normalizeAccountSetupProgress,
  type AccountSetupProgress,
} from "#lib/shared/onboarding/domain/account-setup-progress.js";
import type { OnboardingStatus } from "#lib/shared/onboarding/services/types.js";

export type FirstVisitScene =
  | "arrival"
  | "guide"
  | "workspace"
  | "compose"
  | "reminder"
  | "profile";

const STEP_BY_SCENE: Record<FirstVisitScene, number> = {
  arrival: 1,
  guide: 1,
  workspace: 2,
  compose: 3,
  reminder: 4,
  profile: 5,
};

function statusWith(accountSetup: AccountSetupProgress): OnboardingStatus {
  return {
    appCompleted: true,
    appSkipped: false,
    appCompletedAt: null,
    lastSeenVersion: null,
    viewer3DIntroSeen: false,
    sceneStudioSetupSeen: false,
    accountSetup: normalizeAccountSetupProgress(accountSetup),
  };
}

export function createFirstVisitSimulationState() {
  const identity = $state<AccountSetupIdentity>({
    userId: "first-visit-sandbox",
    isFullAccount: true,
    displayName: null,
    photoURL: null,
  });

  let storedProgress = createDefaultAccountSetupProgress();
  let propsPresent = false;
  let scene = $state<FirstVisitScene>("arrival");
  let reminderDismissed = $state(false);
  let activeSetupTask = $state<AccountSetupTaskId | null>(null);

  const accountSetup = createAccountSetupState({
    getIdentity: () => identity,
    loadStatus: async () => statusWith(storedProgress),
    saveStatus: async (status) => {
      storedProgress = normalizeAccountSetupProgress(status.accountSetup);
    },
    loadPropPreferences: async () => ({
      propsISpinWith: propsPresent ? (["staff"] as never) : [],
      favoriteProp: null,
      favoriteCatdog: null,
    }),
  });

  const currentStep = $derived(STEP_BY_SCENE[scene]);
  const stepsLeft = $derived(
    accountSetup.totalCount - accountSetup.completedCount
  );

  async function initialize(): Promise<void> {
    await accountSetup.loadForCurrentUser();
  }

  async function reset(): Promise<void> {
    identity.displayName = null;
    identity.photoURL = null;
    storedProgress = createDefaultAccountSetupProgress();
    propsPresent = false;
    accountSetup.markPropsPresent(false);
    reminderDismissed = false;
    activeSetupTask = null;
    scene = "arrival";
    await accountSetup.loadForCurrentUser();
  }

  function startGuide(): void {
    scene = "guide";
  }

  function dismissGuide(): void {
    scene = "workspace";
  }

  function chooseStart(): void {
    scene = "compose";
  }

  function addFirstMove(): void {
    reminderDismissed = false;
    scene = "reminder";
  }

  function openProfile(): void {
    scene = "profile";
    activeSetupTask = null;
  }

  function markReminderDismissed(): void {
    reminderDismissed = true;
  }

  function openSetupDestination(taskId: AccountSetupTaskId): void {
    activeSetupTask = taskId;
  }

  function closeSetupDestination(): void {
    activeSetupTask = null;
  }

  async function finishSetupDestination(): Promise<void> {
    if (!activeSetupTask) return;

    switch (activeSetupTask) {
      case "display-name":
        identity.displayName = "Sky";
        break;
      case "profile-photo":
        identity.photoURL = "sandbox-profile-photo";
        break;
      case "props":
        propsPresent = true;
        accountSetup.markPropsPresent(true);
        break;
      case "theme":
        await accountSetup.markThemeChosen();
        break;
    }

    activeSetupTask = null;
  }

  function previous(): FirstVisitScene {
    switch (scene) {
      case "arrival":
        return scene;
      case "guide":
        scene = "arrival";
        break;
      case "workspace":
        scene = "arrival";
        break;
      case "compose":
        scene = "workspace";
        break;
      case "reminder":
        scene = "compose";
        break;
      case "profile":
        scene = "reminder";
        break;
    }
    return scene;
  }

  function advance(): FirstVisitScene {
    switch (scene) {
      case "arrival":
      case "guide":
        dismissGuide();
        break;
      case "workspace":
        chooseStart();
        break;
      case "compose":
        addFirstMove();
        break;
      case "reminder":
        openProfile();
        break;
      case "profile":
        break;
    }
    return scene;
  }

  return {
    accountSetup,
    get scene() {
      return scene;
    },
    get currentStep() {
      return currentStep;
    },
    get stepsLeft() {
      return stepsLeft;
    },
    get reminderDismissed() {
      return reminderDismissed;
    },
    get activeSetupTask() {
      return activeSetupTask;
    },
    get displayName() {
      return identity.displayName;
    },
    get hasProfilePhoto() {
      return Boolean(identity.photoURL);
    },
    get hasProps() {
      return propsPresent;
    },
    initialize,
    reset,
    startGuide,
    dismissGuide,
    chooseStart,
    addFirstMove,
    openProfile,
    markReminderDismissed,
    openSetupDestination,
    closeSetupDestination,
    finishSetupDestination,
    previous,
    advance,
  };
}

export type FirstVisitSimulationState = ReturnType<
  typeof createFirstVisitSimulationState
>;
