import type { PropPreferences } from "#lib/shared/community/services/types.js";
import {
  createDefaultAccountSetupProgress,
  normalizeAccountSetupProgress,
  type AccountSetupProgress,
} from "../domain/account-setup-progress";
import type { OnboardingStatus } from "../services/types";

export type AccountSetupTaskId =
  | "display-name"
  | "profile-photo"
  | "props"
  | "theme";

export const ACCOUNT_SETUP_SETTINGS_DESTINATIONS = {
  "display-name": "profile",
  "profile-photo": "profile",
  props: "profile",
  theme: "theme",
} as const satisfies Record<AccountSetupTaskId, string>;

export interface AccountSetupTask {
  id: AccountSetupTaskId;
  label: string;
  description: string;
  complete: boolean;
  actionLabel: string;
  icon: string;
}

export interface AccountSetupIdentity {
  userId: string | null;
  isFullAccount: boolean;
  displayName: string | null;
  photoURL: string | null;
}

export interface AccountSetupDependencies {
  getIdentity: () => AccountSetupIdentity;
  loadStatus: () => Promise<OnboardingStatus>;
  saveStatus: (status: OnboardingStatus) => Promise<void>;
  loadPropPreferences: (userId: string) => Promise<PropPreferences>;
  now?: () => number;
}

export interface AccountSetupState {
  readonly tasks: AccountSetupTask[];
  readonly completedCount: number;
  readonly totalCount: number;
  readonly isComplete: boolean;
  readonly loading: boolean;
  readonly available: boolean;
  readonly saveError: string | null;
  readonly reminderRequested: boolean;
  readonly reminderDismissals: number;
  readonly reminderSnoozedUntil: string | null;
  loadForCurrentUser: () => Promise<void>;
  markThemeChosen: () => Promise<void>;
  retrySave: () => Promise<void>;
  markPropsPresent: (value?: boolean) => void;
  refreshProps: () => Promise<void>;
  requestReminder: () => boolean;
  canShowReminder: () => boolean;
  consumeReminderRequest: () => boolean;
  cancelReminderRequest: () => void;
  dismissReminder: () => Promise<void>;
}

const REMINDER_LIMIT = 2;
const REMINDER_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function identityKey(identity: AccountSetupIdentity): string {
  return identity.isFullAccount && identity.userId
    ? `account:${identity.userId}`
    : "guest";
}

export function createAccountSetupState(
  deps: AccountSetupDependencies
): AccountSetupState {
  const now = deps.now ?? Date.now;

  let progress = $state<AccountSetupProgress>(
    createDefaultAccountSetupProgress()
  );
  let hasProps = $state(false);
  let loading = $state(true);
  let available = $state(false);
  let saveError = $state<string | null>(null);
  let loadedIdentityKey = $state<string | null>(null);
  let reminderRequested = $state(false);
  let reminderShownThisSession = $state(false);
  let loadSequence = 0;
  let saveRevision = 0;
  let saveQueue = Promise.resolve();
  let failedProgress: AccountSetupProgress | null = null;

  const identity = $derived.by(() => deps.getIdentity());

  const tasks = $derived.by<AccountSetupTask[]>(() => [
    {
      id: "display-name",
      label: "Display name",
      description: "Give people a name to recognize.",
      complete: Boolean(identity.displayName?.trim()),
      actionLabel: identity.displayName?.trim() ? "Edit" : "Add name",
      icon: "fa-signature",
    },
    {
      id: "profile-photo",
      label: "Profile photo",
      description: "Add a face, prop, or image.",
      complete: Boolean(identity.photoURL?.trim()),
      actionLabel: identity.photoURL?.trim() ? "Change" : "Add photo",
      icon: "fa-camera",
    },
    {
      id: "props",
      label: "Props you spin",
      description: "Add the props that are part of your flow practice.",
      complete: hasProps,
      actionLabel: hasProps ? "Change" : "Choose props",
      icon: "fa-fire",
    },
    {
      id: "theme",
      label: "Theme",
      description: "Choose how the app looks.",
      complete: Boolean(progress.backgroundChosenAt),
      actionLabel: progress.backgroundChosenAt ? "Change" : "Choose",
      icon: "fa-palette",
    },
  ]);

  const completedCount = $derived(tasks.filter((task) => task.complete).length);
  const isComplete = $derived(completedCount === tasks.length);

  async function loadForCurrentUser(): Promise<void> {
    const requestedIdentity = deps.getIdentity();
    const requestedKey = identityKey(requestedIdentity);
    const request = ++loadSequence;
    loading = true;
    available = false;
    saveError = null;
    failedProgress = null;

    try {
      const statusPromise = deps.loadStatus();
      const propPromise =
        requestedIdentity.isFullAccount && requestedIdentity.userId
          ? deps.loadPropPreferences(requestedIdentity.userId)
          : Promise.resolve(null);
      const [status, propPreferences] = await Promise.all([
        statusPromise,
        propPromise,
      ]);

      if (request !== loadSequence) return;

      progress = normalizeAccountSetupProgress(status.accountSetup);
      hasProps = Boolean(propPreferences?.propsISpinWith.length);
      loadedIdentityKey = requestedKey;
      available = true;
    } catch (error) {
      if (request !== loadSequence) return;
      console.warn(
        "[accountSetupState] Setup progress could not be loaded",
        error
      );
      progress = createDefaultAccountSetupProgress();
      hasProps = false;
      loadedIdentityKey = null;
      available = false;
    } finally {
      if (request === loadSequence) {
        loading = false;
      }
    }
  }

  function persistProgress(next: AccountSetupProgress): Promise<void> {
    const previous = normalizeAccountSetupProgress(progress);
    const requested = normalizeAccountSetupProgress(next);
    const revision = ++saveRevision;

    progress = requested;
    saveError = null;
    failedProgress = null;

    saveQueue = saveQueue
      .catch(() => undefined)
      .then(async () => {
        const status = await deps.loadStatus();
        await deps.saveStatus({
          ...status,
          // Firestore must receive a plain object, not Svelte's reactive proxy.
          accountSetup: requested,
        });
        if (revision === saveRevision) {
          progress = requested;
        }
      })
      .catch((error) => {
        console.warn(
          "[accountSetupState] Setup progress could not be saved",
          error
        );
        if (revision === saveRevision) {
          progress = previous;
          failedProgress = requested;
          saveError = "Account setup couldn't be saved. Try again.";
        }
      });

    return saveQueue;
  }

  function markThemeChosen(): Promise<void> {
    if (progress.backgroundChosenAt) return saveQueue;

    return persistProgress({
      ...progress,
      backgroundChosenAt: new Date(now()).toISOString(),
    });
  }

  function retrySave(): Promise<void> {
    return failedProgress ? persistProgress(failedProgress) : saveQueue;
  }

  function markPropsPresent(value = true): void {
    hasProps = value;
  }

  async function refreshProps(): Promise<void> {
    const currentIdentity = deps.getIdentity();
    if (!currentIdentity.isFullAccount || !currentIdentity.userId) {
      hasProps = false;
      return;
    }

    try {
      const propPreferences = await deps.loadPropPreferences(
        currentIdentity.userId
      );
      hasProps = propPreferences.propsISpinWith.length > 0;
    } catch (error) {
      console.warn("[accountSetupState] Props could not be refreshed", error);
    }
  }

  function requestReminder(): boolean {
    const currentIdentity = deps.getIdentity();
    if (
      !available ||
      !currentIdentity.isFullAccount ||
      reminderShownThisSession
    ) {
      return false;
    }

    reminderRequested = true;
    return true;
  }

  function canShowReminder(): boolean {
    const currentIdentity = deps.getIdentity();
    if (
      loading ||
      !available ||
      loadedIdentityKey !== identityKey(currentIdentity) ||
      !currentIdentity.isFullAccount ||
      isComplete ||
      reminderShownThisSession ||
      progress.reminderDismissals >= REMINDER_LIMIT
    ) {
      return false;
    }

    const snoozedUntil = progress.reminderSnoozedUntil
      ? Date.parse(progress.reminderSnoozedUntil)
      : 0;
    return !Number.isFinite(snoozedUntil) || snoozedUntil <= now();
  }

  function consumeReminderRequest(): boolean {
    if (!reminderRequested || !canShowReminder()) return false;
    reminderRequested = false;
    reminderShownThisSession = true;
    return true;
  }

  function cancelReminderRequest(): void {
    reminderRequested = false;
  }

  function dismissReminder(): Promise<void> {
    return persistProgress({
      ...progress,
      reminderDismissals: progress.reminderDismissals + 1,
      reminderSnoozedUntil: new Date(now() + REMINDER_SNOOZE_MS).toISOString(),
    });
  }

  return {
    get tasks() {
      return tasks;
    },
    get completedCount() {
      return completedCount;
    },
    get totalCount() {
      return tasks.length;
    },
    get isComplete() {
      return isComplete;
    },
    get loading() {
      return loading;
    },
    get available() {
      return available;
    },
    get saveError() {
      return saveError;
    },
    get reminderRequested() {
      return reminderRequested;
    },
    get reminderDismissals() {
      return progress.reminderDismissals;
    },
    get reminderSnoozedUntil() {
      return progress.reminderSnoozedUntil;
    },
    loadForCurrentUser,
    markThemeChosen,
    retrySave,
    markPropsPresent,
    refreshProps,
    requestReminder,
    canShowReminder,
    consumeReminderRequest,
    cancelReminderRequest,
    dismissReminder,
  };
}
