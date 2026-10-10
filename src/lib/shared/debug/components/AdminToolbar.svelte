<!--
  AdminToolbar - Admin debug tools orchestrator

  Desktop: Top bar with F9 toggle
  Mobile: Bottom sheet triggered by long-press on nav

  Features:
  - Quick access user chips
  - User search for previewing
  - Tab intro reset
  - First-run wizard preview
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { featureFlagService } from "#lib/shared/auth/services/post-hog-feature-flag-service.svelte.js";
  import {
    userPreviewState,
    loadUserPreview,
    clearUserPreview,
    initUserPreview,
  } from "#lib/shared/debug/state/user-preview-state.svelte.js";
  import { adminToolbarState } from "#lib/shared/debug/state/admin-toolbar-state.svelte.js";
  import { firstRunState } from "#lib/shared/onboarding/state/first-run-state.svelte.ts";
  import { appEntryState } from "#lib/shared/onboarding/state/app-entry-state.svelte.ts";
  import { handleModuleChange } from "#lib/shared/navigation-coordinator/navigation-coordinator.svelte.js";
  import type { UserRole } from "#lib/shared/auth/domain/models/user-role.js";
  import * as cloudThumbnailCacheModule from "#lib/shared/browse/services/cloud-thumbnail-cache.js";
  import { getThumbnailLocalCache } from "#lib/shared/browse/get-thumbnail-local-cache.js";
  import { getThumbnailRenderOrchestrator } from "#lib/shared/browse/get-thumbnail-render-orchestrator.js";
  import { startGalleryWarm, type WarmHandle } from "#lib/shared/browse/services/gallery-thumbnail-warmer.js";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import { getQuickAccessPersister } from "#lib/shared/debug/get-quick-access-persister.js";
  import { getImageComposer } from "#lib/shared/render/get-image-composer.js";
  import type { QuickAccessPersister } from "../services/quick-access-persister";
import type { QuickAccessUser } from "../services/types";
  import { tikaPictographCache } from "#lib/shared/tika/services/tika-pictograph-cache.js";
  import AdminToolbarDesktop from "./AdminToolbarDesktop.svelte";
  import AdminToolbarMobile from "./AdminToolbarMobile.svelte";

  // Responsive breakpoint
  const MOBILE_BREAKPOINT = 768;
  let windowWidth = $state(
    typeof window !== "undefined" ? window.innerWidth : 1024
  );
  const isMobile = $derived(windowWidth < MOBILE_BREAKPOINT);

  $effect(() => {
    if (typeof window === "undefined") return;

    // Update immediately in case we're in DevTools mobile simulation
    windowWidth = window.innerWidth;

    const handleResize = () => {
      windowWidth = window.innerWidth;
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  });

  // Quick Access Service (resolved lazily since admin module loads async)
  let quickAccessPersister: QuickAccessPersister | null = $state(null);

  // State
  let quickAccessUsers = $state<QuickAccessUser[]>([]);
  let introResetMessage = $state<string | null>(null);

  // Derived - Admin check
  const actualRole = $derived(featureFlagService.userRole);
  const isAdmin = $derived(actualRole === "admin");
  const isOpen = $derived(adminToolbarState.isOpen);
  const isSearchOpen = $derived(adminToolbarState.isSearchOpen);

  // Derived - Role switching
  const currentRole = $derived(featureFlagService.userRole);
  const effectiveRole = $derived(featureFlagService.effectiveRole);

  function switchRole(role: UserRole) {
    // If clicking the already-active override, clear it (return to real role)
    if (featureFlagService.debugRoleOverride === role) {
      featureFlagService.setDebugRoleOverride(null);
    } else if (role === currentRole) {
      // Clicking your actual role clears any override
      featureFlagService.setDebugRoleOverride(null);
    } else {
      featureFlagService.setDebugRoleOverride(role);
    }
  }

  // Derived - Preview state
  const isUserPreview = $derived(userPreviewState.isActive);
  const previewProfile = $derived(userPreviewState.data.profile);

  // Desktop: show top bar only when F9 toggled (impersonation indicator is now the border + bottom bar)
  const showDesktopToolbar = $derived(isAdmin && !isMobile && isOpen);

  // Mobile: bottom sheet only (FAB and preview banner removed - impersonation uses border + bottom bar)
  const showMobileSheet = $derived(isAdmin && isMobile && isOpen);

  // Check if current preview user is in quick access
  // Uses the reactive quickAccessUsers array so it updates when users are added/removed
  const isCurrentUserInQuickAccess = $derived.by(() => {
    const uid = previewProfile?.uid;
    if (!uid) return false;
    return quickAccessUsers.some((u) => u.uid === uid);
  });

  // Quick Access Functions
  function addToQuickAccess() {
    if (!previewProfile || !quickAccessPersister) return;
    const newUser: QuickAccessUser = {
      uid: previewProfile.uid,
      displayName:
        previewProfile.displayName || previewProfile.username || "Unknown",
      username: previewProfile.username,
      photoURL: previewProfile.photoURL || undefined,
    };
    quickAccessUsers = quickAccessPersister.add(newUser);

    // Show confirmation
    introResetMessage = `Added ${newUser.displayName} to quick access`;
    setTimeout(() => {
      introResetMessage = null;
    }, 2000);
  }

  function removeFromQuickAccess(uid: string) {
    if (!quickAccessPersister) return;
    quickAccessUsers = quickAccessPersister.remove(uid);
  }

  async function selectUser(user: {
    uid: string;
    displayName: string;
    username?: string;
    photoURL?: string;
  }) {
    await loadUserPreview(user.uid, true);
    const previewedRole = userPreviewState.data.profile?.role as
      | UserRole
      | undefined;
    if (previewedRole) {
      featureFlagService.setDebugRoleOverride(previewedRole);
    }
    adminToolbarState.closeSearch();
    // Dismiss toolbar after selection - the border + bottom bar indicate impersonation
    adminToolbarState.close();
  }

  function handleClearPreview() {
    clearUserPreview();
    featureFlagService.clearDebugRoleOverride();
  }

  function previewFirstRunWizard() {
    firstRunState.forceShow();
    introResetMessage = "First-run wizard opened";
    setTimeout(() => {
      introResetMessage = null;
    }, 2000);
  }

  async function previewCreateTutorial() {
    await handleModuleChange("create", "construct");
    appEntryState.replay();
    introResetMessage = "Create tutorial opened";
    setTimeout(() => {
      introResetMessage = null;
    }, 2000);
  }

  let isClearingThumbnails = $state(false);

  async function clearCloudThumbnails() {
    if (isClearingThumbnails) return; // Prevent double-clicks

    console.log("🗑️ Starting cloud thumbnail deletion...");
    isClearingThumbnails = true;
    introResetMessage = "Scanning cloud thumbnails...";

    try {
      let totalDeleted = 0;

      console.log("🗑️ Deleting gallery thumbnails...");
      const galleryCount = await cloudThumbnailCacheModule.deleteVariant("gallery", (p) => {
        introResetMessage = `Gallery: ${p.deleted}/${p.total}`;
      });
      totalDeleted += galleryCount;
      console.log(`🗑️ Deleted ${galleryCount} gallery thumbnails`);

      console.log("🗑️ Deleting wordcard thumbnails...");
      const wordcardCount = await cloudThumbnailCacheModule.deleteVariant("wordcard", (p) => {
        introResetMessage = `Choreo card: ${p.deleted}/${p.total}`;
      });
      totalDeleted += wordcardCount;
      console.log(`🗑️ Deleted ${wordcardCount} wordcard thumbnails`);

      // Also clear local IndexedDB thumbnail cache so stale local copies don't persist
      const localCache = getThumbnailLocalCache();
      await localCache.clear();

      // Nuke ALL remaining in-memory caches (URL cache, knownExists, static manifest)
      // This forces every subsequent thumbnail request to render fresh - including
      // thumbnails that scroll into view later, not just currently visible ones
      const orchestrator = getThumbnailRenderOrchestrator();
      orchestrator.invalidateAllCaches();

      console.log(`✅ Total deleted: ${totalDeleted} cloud thumbnails + all caches nuked`);

      // Notify visible thumbnail components to re-render immediately
      window.dispatchEvent(new CustomEvent("thumbnailCacheCleared"));

      introResetMessage = `Deleted ${totalDeleted} cloud thumbnails`;
      setTimeout(() => {
        introResetMessage = null;
      }, 5000);
    } catch (error) {
      console.error("❌ Failed to clear cloud thumbnails:", error);
      introResetMessage = `Error: ${error instanceof Error ? error.message : "Unknown error"}`;
      setTimeout(() => {
        introResetMessage = null;
      }, 5000);
    } finally {
      isClearingThumbnails = false;
    }
  }

  let isWarming = $state(false);
  let warmHandle: WarmHandle | null = null;

  /**
   * Lean one-click warm: renders + uploads the observed cold set (staff + fan,
   * dark, QR + non-QR) through the real orchestrator so those cloud thumbnails exist.
   * Clicking again while running cancels. Full-matrix control lives at
   * /tools/warm-thumbnails. Follow a run with `npm run thumbnails:manifest`
   * + `npm run thumbnails:sync` to index + bundle the results.
   */
  async function warmGalleryThumbnails() {
    if (isWarming) {
      warmHandle?.cancel();
      return;
    }
    isWarming = true;
    introResetMessage = "Warming gallery thumbnails...";

    warmHandle = startGalleryWarm(
      {
        props: [PropType.STAFF, PropType.FAN],
        modes: ["dark"],
        qr: [false, true],
      },
      (p) => {
        introResetMessage = p.finished
          ? `Warm ${p.cancelled ? "cancelled" : "done"}: ${p.rendered} new, ${p.skipped} cached, ${p.failed} failed`
          : `Warming ${p.done}/${p.total} — ${p.rendered} new`;
        if (p.finished && p.failedCombinations.length > 0) {
          console.warn(
            "[Gallery warm] Failed combinations:",
            p.failedCombinations
          );
        }
      }
    );

    try {
      await warmHandle.promise;
    } catch (error) {
      console.error("❌ Gallery warm failed:", error);
      introResetMessage = `Warm error: ${error instanceof Error ? error.message : "Unknown"}`;
    } finally {
      isWarming = false;
      warmHandle = null;
      setTimeout(() => {
        introResetMessage = null;
      }, 8000);
    }
  }

  let isClearingLocalCache = $state(false);

  async function clearLocalPictographCache() {
    if (isClearingLocalCache) return;

    console.log("🗑️ Starting local pictograph cache clear...");
    isClearingLocalCache = true;
    introResetMessage = "Clearing local pictograph cache...";

    try {
      const imageComposer = getImageComposer();

      // Get stats before clearing
      const statsBefore = imageComposer.getCacheStats();
      const l1StatsBefore = await imageComposer.getLayer1Stats();

      // Clear both L1 (IndexedDB) and L2 (Memory)
      await imageComposer.clearCache(true);

      const totalCleared = statsBefore.memoryCacheSize + l1StatsBefore.count;
      introResetMessage = `Cleared ${totalCleared} cached pictographs`;

      console.log(`✅ Cleared local pictograph cache:
      - Memory (L2): ${statsBefore.memoryCacheSize} entries
      - IndexedDB (L1): ${l1StatsBefore.count} entries (${(l1StatsBefore.sizeBytes / 1024 / 1024).toFixed(1)}MB)`);

      setTimeout(() => {
        introResetMessage = null;
      }, 5000);
    } catch (error) {
      console.error("❌ Failed to clear local cache:", error);
      introResetMessage = `Error: ${error instanceof Error ? error.message : "Unknown"}`;
      setTimeout(() => {
        introResetMessage = null;
      }, 5000);
    } finally {
      isClearingLocalCache = false;
    }
  }

  let isClearingTikaCache = $state(false);

  async function clearTikaPictographCache() {
    if (isClearingTikaCache) return;

    console.log("🗑️ Starting TIKA pictograph cache clear...");
    isClearingTikaCache = true;
    introResetMessage = "Clearing TIKA pictograph cache...";

    try {
      const stats = await tikaPictographCache.getStats();
      await tikaPictographCache.clear();

      introResetMessage = `Cleared ${stats.memoryCount + stats.persistedCount} TIKA pictographs`;

      console.log(`✅ Cleared TIKA pictograph cache:
      - Memory: ${stats.memoryCount} entries
      - Persisted: ${stats.persistedCount} entries`);

      setTimeout(() => {
        introResetMessage = null;
      }, 5000);
    } catch (error) {
      console.error("❌ Failed to clear TIKA cache:", error);
      introResetMessage = `Error: ${error instanceof Error ? error.message : "Unknown"}`;
      setTimeout(() => {
        introResetMessage = null;
      }, 5000);
    } finally {
      isClearingTikaCache = false;
    }
  }

  function showPwaMigrationBanner() {
    window.dispatchEvent(new CustomEvent("pwaMigrationBannerShow"));
    introResetMessage = "PWA migration banner shown";
    setTimeout(() => {
      introResetMessage = null;
    }, 2000);
  }

  /**
   * Presentation mode from the F9 panel, so the ghost can be started without
   * hand-editing the URL. Activating always starts it RUNNING — pressing a
   * button labelled "Ghost" means get to work, even if the last thing that
   * happened was a takeover that parked it.
   */
  let ghostActive = $state(false);
  let presenter: typeof import("#lib/shared/attract/state/presentation-state.svelte.js").presentationState | null =
    null;

  async function toggleGhost() {
    presenter ??= (
      await import("#lib/shared/attract/state/presentation-state.svelte.js")
    ).presentationState;
    if (presenter.armed) {
      presenter.deactivate();
      introResetMessage = "Ghost stopped";
    } else {
      presenter.activate();
      introResetMessage = "Ghost presenting";
      adminToolbarState.close();
    }
    ghostActive = presenter.armed;
    setTimeout(() => {
      introResetMessage = null;
    }, 2000);
  }

  onMount(async () => {
    presenter = (
      await import("#lib/shared/attract/state/presentation-state.svelte.js")
    ).presentationState;
    ghostActive = presenter.armed;
  });

  function handleClose() {
    adminToolbarState.close();
  }

  function handleToggleSearch() {
    adminToolbarState.toggleSearch();
  }

  onMount(() => {
    // Restore preview state from localStorage if one was active
    initUserPreview().then(() => {
      // If preview was restored, also restore the role override
      const previewedRole = userPreviewState.data.profile?.role as
        | UserRole
        | undefined;
      if (userPreviewState.isActive && previewedRole) {
        featureFlagService.setDebugRoleOverride(previewedRole);
      }
    });

    // Resolve the service after mount
    try {
      quickAccessPersister = getQuickAccessPersister();
      quickAccessUsers = quickAccessPersister.load();
    } catch {
      console.warn("QuickAccessPersister not available");
    }
  });
</script>

<!-- Desktop: unchanged top bar (F9 toggle or preview active) -->
{#if showDesktopToolbar}
  <AdminToolbarDesktop
    {quickAccessUsers}
    {previewProfile}
    {isUserPreview}
    {isSearchOpen}
    isLoading={userPreviewState.isLoading}
    {introResetMessage}
    {isCurrentUserInQuickAccess}
    onSelectUser={selectUser}
    onRemoveFromQuickAccess={removeFromQuickAccess}
    onAddToQuickAccess={addToQuickAccess}
    onClearPreview={handleClearPreview}
    onToggleSearch={handleToggleSearch}
    onPreviewFirstRun={previewFirstRunWizard}
    onPreviewCreateTutorial={previewCreateTutorial}
    onClearCloudThumbnails={clearCloudThumbnails}
    {isClearingThumbnails}
    onWarmGallery={warmGalleryThumbnails}
    {isWarming}
    onClearLocalCache={clearLocalPictographCache}
    {isClearingLocalCache}
    onClearTikaCache={clearTikaPictographCache}
    {isClearingTikaCache}
    onShowPwaBanner={showPwaMigrationBanner}
    onToggleGhost={toggleGhost}
    {ghostActive}
    onClose={handleClose}
    {currentRole}
    {effectiveRole}
    onSwitchRole={switchRole}
  />
{/if}

<!-- Mobile: bottom sheet (independently dismissable) -->
{#if showMobileSheet}
  <AdminToolbarMobile
    {quickAccessUsers}
    {previewProfile}
    {isUserPreview}
    {isSearchOpen}
    isLoading={userPreviewState.isLoading}
    {introResetMessage}
    {isCurrentUserInQuickAccess}
    onSelectUser={selectUser}
    onRemoveFromQuickAccess={removeFromQuickAccess}
    onAddToQuickAccess={addToQuickAccess}
    onClearPreview={handleClearPreview}
    onToggleSearch={handleToggleSearch}
    onPreviewFirstRun={previewFirstRunWizard}
    onPreviewCreateTutorial={previewCreateTutorial}
    onClearCloudThumbnails={clearCloudThumbnails}
    {isClearingThumbnails}
    onWarmGallery={warmGalleryThumbnails}
    {isWarming}
    onClearLocalCache={clearLocalPictographCache}
    {isClearingLocalCache}
    onClearTikaCache={clearTikaPictographCache}
    {isClearingTikaCache}
    onShowPwaBanner={showPwaMigrationBanner}
    onClose={handleClose}
  />
{/if}
