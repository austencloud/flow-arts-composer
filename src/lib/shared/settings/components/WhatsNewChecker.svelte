<!--
  WhatsNewChecker - Detects version changes and shows What's New modal

  Runs on app load to check if user has seen the current version.
  If not, loads version data and triggers the What's New modal.
-->
<script lang="ts">
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import { appEntryState } from "#lib/shared/onboarding/state/app-entry-state.svelte.js";
  import { whatsNewState } from "../state/whats-new-state.svelte";
  import * as versionService from "#lib/shared/feedback/services/version-service.js";
  import { showToast } from "#lib/shared/toast/state/toast-state.svelte.js";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import WhatsNewModal from "./WhatsNewModal.svelte";

  // Configuration
  const CHECK_DELAY_MS = 1500; // Delay before checking (let app stabilize)
  const WHATS_NEW_TOAST_MS = 10_000;

  // Track if we've already checked this session
  let hasChecked = false;

  // Watch for auth state - only show to authenticated users.
  // The effect runs on mount too, so it covers the already-authenticated case.
  $effect(() => {
    if (!authState.isAuthenticated || !authState.user || hasChecked) return;
    // Never stack What's New onto the first-run onboarding overlays (beta
    // notice, create-tutorial prompt/walkthrough). Wait until app entry has
    // resolved — returning users are already "complete" on mount, so this only
    // holds back a brand-new user, who gets baselined below and never sees a
    // changelog for their debut build anyway.
    if (!appEntryState.isComplete()) return;
    // Small delay to let the app settle
    const timer = setTimeout(checkForNewVersion, CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  });

  async function checkForNewVersion() {
    // Prevent multiple checks
    if (hasChecked) return;
    hasChecked = true;

    // Load cloud data before checking - ensures cross-device persistence works.
    // Without this, hasSeenVersion falls back to localStorage which is empty
    // on new devices, causing the modal to show every time.
    const { syncOnboardingFromCloud } =
      await import("#lib/shared/onboarding/config/storage-keys.js");
    await syncOnboardingFromCloud();

    const currentVersion = __APP_VERSION__;

    // First-ever visitor: no version baseline yet. Don't greet a brand-new user
    // with a changelog for the build they're seeing for the first time — set the
    // baseline silently so What's New only ever fires on a genuine update for a
    // returning user.
    if (!whatsNewState.hasSeenAnyVersion()) {
      whatsNewState.markVersionAsSeen(currentVersion);
      return;
    }

    // Check if user has already seen this version
    if (whatsNewState.hasSeenVersion(currentVersion)) {
      return;
    }

    // Load version data
    whatsNewState.setLoading(true);
    try {
      const versions = await versionService.getVersions();
      const versionData = versions.find((v) => v.version === currentVersion);

      // Every release newer than the seen mark is unread; the dot carries
      // that memory until the sheet or Release Notes page opens.
      whatsNewState.setPublishedVersions(versions, currentVersion);

      if (!versionData || !versionData.changelogEntries?.length) {
        // No changelog for this version: nothing to read, so nothing is owed.
        whatsNewState.markVersionAsSeen(currentVersion);
        return;
      }

      // One polite toast per version. Firing it is not reading it: the seen
      // mark moves only when the sheet actually opens, so an ignored toast
      // leaves the dot on. The toasted mark alone stops it re-firing.
      if (whatsNewState.hasToastedVersion(currentVersion)) return;
      whatsNewState.markVersionAsToasted(currentVersion);
      const count = versionData.changelogEntries.length;
      showToast({
        message: t("settings_update_count_toast", {
          version: currentVersion,
          count,
        }),
        type: "info",
        duration: WHATS_NEW_TOAST_MS,
        action: {
          label: t("settings_see_whats_new"),
          // Catch up on everything unread, this release included.
          onClick: () => whatsNewState.openRollup(versionData),
        },
      });
    } catch (error) {
      console.error("Failed to load version data for What's New:", error);
      // Don't show modal on error, but don't mark as seen either
      // User will see it next time if load succeeds
    } finally {
      whatsNewState.setLoading(false);
    }
  }
</script>

<!-- Render the modal (controlled by whatsNewState) -->
<WhatsNewModal />
