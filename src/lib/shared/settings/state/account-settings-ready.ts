/**
 * Account settings readiness
 *
 * At boot the settings are this browser's saved copy. For a signed-in user,
 * the account's own copy arrives from Firestore a moment later and replaces
 * it, and a browser that last saw a different prop (another device changed
 * it, or another account used this browser) swaps props mid-picture. A
 * surface that draws pictographs early and would rather not show that swap
 * waits here first.
 *
 * Resolves once auth has settled and either nobody is signed in or the
 * signed-in user's settings have been applied. Never rejects. A failed or
 * slow sync must not hold a surface back for good, so the wait is capped.
 */
import { awaitAuthSettled, getUser } from "../../auth/state/auth-state.svelte";
import { settingsService } from "./settings-state.svelte";

/**
 * Long enough for auth restore plus a Firestore read on a slow phone, short
 * enough that a failed sync never leaves a surface waiting for good.
 */
export const ACCOUNT_SETTINGS_WAIT_CAP_MS = 4000;

interface AccountSettingsSources {
  awaitAuthSettled: () => Promise<void>;
  getUserId: () => string | null;
  onRemoteSettingsApplied: (
    listener: (settings: unknown, userId: string) => void
  ) => () => void;
}

const liveSources: AccountSettingsSources = {
  awaitAuthSettled,
  getUserId: () => getUser()?.uid ?? null,
  onRemoteSettingsApplied: (listener) =>
    settingsService.onRemoteSettingsApplied(listener),
};

export function awaitAccountSettings(
  capMs = ACCOUNT_SETTINGS_WAIT_CAP_MS,
  sources: AccountSettingsSources = liveSources
): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    let unsubscribe: (() => void) | null = null;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      unsubscribe?.();
      resolve();
    };
    const timer = setTimeout(finish, capMs);

    void sources.awaitAuthSettled().then(() => {
      if (done) return;
      const userId = sources.getUserId();
      if (!userId) {
        finish();
        return;
      }
      // The listener replays the last application synchronously, before
      // this assignment, when the settings have already arrived.
      unsubscribe = sources.onRemoteSettingsApplied((_settings, appliedFor) => {
        if (appliedFor === userId) finish();
      });
      if (done) unsubscribe();
    });
  });
}
