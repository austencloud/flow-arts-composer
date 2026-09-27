<!--
  WhatsNewChecker - Detects version changes and shows What's New modal

  Runs on app load to check if user has seen the current version.
  If not, loads version data and triggers the What's New modal.
-->
<script lang="ts">
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import { appEntryState } from "$lib/shared/onboarding/state/app-entry-state.svelte";
  import { whatsNewState } from "../state/whats-new-state.svelte";
  import * as versionService from "$lib/shared/feedback/services/version-service";
  import { showToast } from "$lib/shared/toast/state/toast-state.svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import WhatsNewModal from "./WhatsNewModal.svelte";

  // Configuration
  const CHECK_DELAY_MS = 1500; // Delay before checking (let app stabilize)

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
    const { syncOnboardingFromCloud } = await import(
      "$lib/shared/onboarding/config/storage-keys"
    );
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

      if (versionData && versionData.changelogEntries?.length) {
        // Non-blocking update toast instead of an auto-popup modal. Mark seen
        // on fire so it never re-nags even if ignored; the "See what's new"
        // action opens the full modal for detail on demand.
        whatsNewState.markVersionAsSeen(currentVersion);
        const count = versionData.changelogEntries.length;
        showToast({
          message: t("settings_update_count_toast", { version: currentVersion, count }),
          type: "info",
          duration: 10000,
          action: {
            label: t("settings_see_whats_new"),
            onClick: () => whatsNewState.openDetail(versionData),
          },
        });
      } else {
        // No changelog for this version, mark as seen silently
        whatsNewState.markVersionAsSeen(currentVersion);
      }
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
