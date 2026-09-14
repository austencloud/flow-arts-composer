<!--
  Generator setup drawer

  Saved setups are private workspace snapshots. Community Favorites are
  intentionally shared projections. Desktop uses a compact side drawer;
  narrow layouts match the measured Generate panel bounds.
-->
<script lang="ts">
  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";
  import DrawerHeader from "$lib/shared/foundation/ui/DrawerHeader.svelte";
  import ConfirmDialog from "$lib/shared/foundation/ui/ConfirmDialog.svelte";
  import SkeletonLoader from "$lib/shared/foundation/ui/SkeletonLoader.svelte";
  import RobustAvatar from "$lib/shared/components/avatar/RobustAvatar.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import { portal } from "../modals/portal";
  import SavedSetupRow from "./SavedSetupRow.svelte";
  import type { FavoriteState } from "../../state/favorite-state.svelte";
  import type {
    ActiveSetupSource,
    CommunityFavorite,
    SavedGeneratorSetup,
  } from "../../domain/models/favorite-config";

  let {
    isOpen,
    favoriteState,
    isSignedOut,
    isPreview,
    isAnonymous,
    onApply,
    onRequestCommunityAccount,
    onRequestShareAccount,
    onRequestSignIn,
    onClose,
  }: {
    isOpen: boolean;
    favoriteState: FavoriteState;
    isSignedOut: boolean;
    isPreview: boolean;
    isAnonymous: boolean;
    onApply: (source: ActiveSetupSource) => void;
    onRequestCommunityAccount: () => void;
    onRequestShareAccount: () => void;
    onRequestSignIn: () => void;
    onClose: () => void;
  } = $props();

  let activeTab = $state<"saved" | "community">("saved");
  let deleteTarget = $state<SavedGeneratorSetup | null>(null);

  function summarize(item: SavedGeneratorSetup | CommunityFavorite): string {
    const config = item.config;
    const parts = [
      `L${config.level}`,
      config.gridMode === "diamond" ? "Diamond" : "Box",
      `${config.length} ${config.length === 1 ? "step" : "steps"}`,
    ];
    if (config.loopEnabled) parts.push("LOOP");
    return parts.join(" \u00B7 ");
  }

  function handleTabChange(value: "saved" | "community"): void {
    if (value === "community" && isAnonymous) {
      onRequestCommunityAccount();
      return;
    }
    activeTab = value;
  }

  function handleCommunityApply(userId: string): void {
    if (isAnonymous) {
      onRequestCommunityAccount();
      return;
    }
    onApply({ kind: "community", userId });
  }

  function isSetupSource(setupId: string): boolean {
    return (
      favoriteState.activeSource?.kind === "setup" &&
      favoriteState.activeSource.setupId === setupId
    );
  }

  function isCommunitySource(userId: string): boolean {
    return (
      favoriteState.activeSource?.kind === "community" &&
      favoriteState.activeSource.userId === userId
    );
  }

  function setupIsBusy(setupId: string): boolean {
    const pending = favoriteState.pendingAction;
    return (
      pending !== null && "setupId" in pending && pending.setupId === setupId
    );
  }

  function handleShareToggle(setupId: string, shared: boolean): void {
    if (shared) {
      void favoriteState.unshareSetup();
    } else if (isAnonymous) {
      onRequestShareAccount();
    } else {
      void favoriteState.shareSetup(setupId);
    }
  }

  async function handleDeleteConfirm(): Promise<void> {
    const target = deleteTarget;
    if (!target) return;
    const deleted = await favoriteState.deleteSetup(target.id);
    if (deleted) deleteTarget = null;
  }

  $effect(() => {
    if (isAnonymous && activeTab === "community") {
      activeTab = "saved";
    }
  });
</script>

<div use:portal>
  <Drawer
    {isOpen}
    placement="right"
    respectLayoutMode={true}
    closeOnBackdrop={true}
    showHandle={false}
    ariaLabel="Generator setups"
    class="preset-drawer-sheet"
    backdropClass="preset-drawer-backdrop"
    onclose={onClose}
  >
    <div class="preset-drawer-content">
      <DrawerHeader title="Generator setups" {onClose} />

      <div class="drawer-body">
        <SegmentedControl
          options={[
            {
              value: "saved",
              label: "Saved",
              id: "setups-tab-saved",
              controls: "setups-panel-saved",
            },
            {
              value: "community",
              label: "Community",
              id: "setups-tab-community",
              controls: "setups-panel-community",
            },
          ]}
          value={activeTab}
          onchange={handleTabChange}
          semantics="tabs"
          ariaLabel="Setup lists"
        />

        <div
          class="setup-panel"
          class:hidden={activeTab !== "saved"}
          role="tabpanel"
          id="setups-panel-saved"
          aria-labelledby="setups-tab-saved"
        >
          {#if isPreview}
            <div class="preview-banner" role="status">
              <strong>Previewing saved setups</strong>
              <span>Apply is available. Changes are disabled in preview.</span>
            </div>
          {/if}

          {#if isSignedOut}
            <div class="empty-state signed-out-state">
              <i class="fa-solid fa-bookmark" aria-hidden="true"></i>
              <strong>Save generator setups</strong>
              <span>Sign in to keep setups across sessions.</span>
              <button
                type="button"
                class="save-button"
                onclick={onRequestSignIn}
              >
                Sign in
              </button>
            </div>
          {:else}
            <button
              data-save-shortcut
              type="button"
              class="save-button primary-action"
              disabled={!favoriteState.canSave}
              aria-busy={favoriteState.pendingAction?.kind === "create" ||
                undefined}
              onclick={() => void favoriteState.saveCurrentSetup()}
            >
              {favoriteState.pendingAction?.kind === "create"
                ? "Saving..."
                : "Save current setup"}
            </button>

            {#if favoriteState.setups.length >= 10}
              <p class="cap-message" role="status">
                10 setups saved. Delete one to save another.
              </p>
            {/if}

            {#if favoriteState.isLoadingSetups}
              <SkeletonLoader variant="rect" height="64px" count={3} />
            {:else if favoriteState.setupsLoadError}
              <div class="load-state error-state" role="alert">
                <span>Saved setups could not load</span>
                <button
                  type="button"
                  class="retry-button"
                  onclick={() => void favoriteState.loadPersonal()}
                >
                  Try again
                </button>
              </div>
            {:else if favoriteState.setups.length === 0}
              <div class="empty-state">
                <i class="fa-regular fa-bookmark" aria-hidden="true"></i>
                <strong>No saved setups yet</strong>
                <span
                  >Save the current controls so you can bring them back in one
                  tap.</span
                >
              </div>
            {:else}
              <div class="setup-list">
                {#each favoriteState.setups as setup (setup.id)}
                  <SavedSetupRow
                    {setup}
                    summary={summarize(setup)}
                    isActive={isSetupSource(setup.id) &&
                      favoriteState.activeStatus === "active"}
                    isShared={favoriteState.sharedSetupId === setup.id}
                    isBusy={setupIsBusy(setup.id)}
                    disableMutations={isPreview || isSignedOut}
                    onApply={() =>
                      onApply({ kind: "setup", setupId: setup.id })}
                    onUpdate={() =>
                      void favoriteState.updateSetupFromCurrent(setup.id)}
                    onRenameSubmit={(name) =>
                      favoriteState.renameSetup(setup.id, name)}
                    onShareToggle={() =>
                      handleShareToggle(
                        setup.id,
                        favoriteState.sharedSetupId === setup.id
                      )}
                    onDelete={() => (deleteTarget = setup)}
                  />
                {/each}
              </div>
            {/if}
          {/if}
        </div>

        <div
          class="setup-panel"
          class:hidden={activeTab !== "community"}
          role="tabpanel"
          id="setups-panel-community"
          aria-labelledby="setups-tab-community"
        >
          {#if favoriteState.isLoadingCommunity}
            <SkeletonLoader variant="rect" height="64px" count={3} />
          {:else if favoriteState.communityLoadError}
            <div class="load-state error-state" role="alert">
              <span>Community favorites could not load</span>
              <button
                type="button"
                class="retry-button"
                onclick={() => void favoriteState.loadCommunity()}
              >
                Try again
              </button>
            </div>
          {:else if favoriteState.communityFavorites.length === 0}
            <div class="empty-state">
              <i class="fa-regular fa-heart" aria-hidden="true"></i>
              <strong>No shared setups yet</strong>
              <span
                >Community Favorites will appear here when people choose to
                share.</span
              >
            </div>
          {:else}
            <div class="setup-list">
              {#each favoriteState.communityFavorites as favorite (favorite.userId)}
                <button
                  type="button"
                  class="favorite-item community-item"
                  class:active={isCommunitySource(favorite.userId) &&
                    favoriteState.activeStatus === "active"}
                  aria-current={isCommunitySource(favorite.userId) &&
                  favoriteState.activeStatus === "active"
                    ? "true"
                    : undefined}
                  onclick={() => handleCommunityApply(favorite.userId)}
                >
                  <RobustAvatar
                    src={favorite.avatar}
                    name={favorite.displayName}
                    alt={`${favorite.displayName}'s avatar`}
                    size="sm"
                  />
                  <span class="favorite-info">
                    <span class="favorite-name">{favorite.displayName}</span>
                    <span class="favorite-summary">{summarize(favorite)}</span>
                  </span>
                  <span class="status-slot">
                    {isCommunitySource(favorite.userId) &&
                    favoriteState.activeStatus === "active"
                      ? "Active"
                      : ""}
                  </span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  </Drawer>
</div>

<ConfirmDialog
  isOpen={deleteTarget !== null}
  title={deleteTarget ? `Delete “${deleteTarget.name}”?` : ""}
  message={deleteTarget && favoriteState.sharedSetupId === deleteTarget.id
    ? "This removes the saved setup and stops sharing it as your Favorite. Your current generator settings will not change."
    : "This removes the saved setup. Your current generator settings will not change."}
  confirmText="Delete"
  cancelText="Cancel"
  variant="danger"
  onConfirm={handleDeleteConfirm}
  onCancel={() => (deleteTarget = null)}
/>

<style>
  :global(.drawer-content.preset-drawer-sheet) {
    --sheet-bg: var(--theme-panel-bg, #161824);
    --sheet-border: none;
    --sheet-border-strong: 1px solid
      var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    --sheet-shadow: -0.5rem 0 1.75rem rgba(0, 0, 0, 0.42);
  }

  /* Bottom sheet on mobile - auto-size to content, don't take full screen */
  :global(.drawer-content.preset-drawer-sheet[data-placement="bottom"]) {
    --sheet-shadow: 0 -0.5rem 1.75rem rgba(0, 0, 0, 0.42);
    height: auto;
    min-height: auto;
    max-height: 85dvh;
  }

  :global(.drawer-overlay.preset-drawer-backdrop.side-by-side-layout) {
    left: var(--desktop-sidebar-width, 0);
    right: 0;
    top: var(--create-panel-top, 0);
    bottom: var(--create-panel-bottom, 0);
  }

  /* Keep this list aligned with the neighboring LOOP drawer. The measured
     Generate panel expands when the workspace has room, but a short picker
     should remain a compact desktop column. */
  :global(
    .drawer-content.preset-drawer-sheet.side-by-side-layout[data-placement="right"]
  ) {
    width: min(var(--create-panel-width, 400px), 400px);
    max-width: 100%;
  }

  /* Wide-short and unfolded foldable layouts split the workspace into two
     measured panels. Cover the Generate panel exactly so no preset cards peek
     around the drawer edge. Desktop keeps the compact 400px column above. */
  @media (max-width: 1023px) {
    :global(
      .drawer-content.preset-drawer-sheet.side-by-side-layout[data-placement="right"]
    ) {
      width: var(--create-panel-width, min(25rem, 100vw));
    }
  }

  .preset-drawer-content {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    background: transparent;
  }

  .drawer-body {
    display: flex;
    flex: 1;
    min-height: 0;
    flex-direction: column;
    gap: 0.875rem;
    padding: 0.875rem 1rem calc(1rem + env(safe-area-inset-bottom, 0px));
  }

  .setup-panel {
    display: flex;
    flex: 1;
    min-height: 0;
    flex-direction: column;
    gap: 0.75rem;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }

  .setup-panel.hidden {
    display: none;
  }

  .preview-banner {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    padding: 0.75rem;
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #3b82f6) 45%, transparent);
    border-radius: var(--radius-md, 8px);
    background: color-mix(
      in srgb,
      var(--theme-accent, #3b82f6) 12%,
      transparent
    );
    color: var(--theme-text, #fff);
    font-size: var(--font-size-compact, 12px);
  }

  .preview-banner strong {
    font-size: var(--font-size-min, 14px);
  }

  .save-button,
  .retry-button {
    min-height: var(--min-touch-target, 44px);
    border-radius: var(--radius-md, 8px);
    font: inherit;
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
    cursor: pointer;
  }

  .save-button {
    width: 100%;
    padding: 0.75rem 1rem;
    border: 1.5px dashed
      color-mix(in srgb, var(--theme-accent, #3b82f6) 55%, transparent);
    background: color-mix(
      in srgb,
      var(--theme-accent, #3b82f6) 17%,
      transparent
    );
    color: color-mix(in srgb, var(--theme-accent, #3b82f6) 72%, white);
    transition:
      background var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease;
  }

  .save-button.primary-action {
    flex-shrink: 0;
  }

  .save-button:not(:disabled):hover {
    border-color: var(--theme-accent, #3b82f6);
    background: color-mix(
      in srgb,
      var(--theme-accent, #3b82f6) 27%,
      transparent
    );
  }

  .save-button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .save-button:focus-visible,
  .retry-button:focus-visible,
  .favorite-item:focus-visible {
    outline: 2px solid var(--theme-accent, #3b82f6);
    outline-offset: 2px;
  }

  .cap-message {
    margin: -0.25rem 0 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.66));
    font-size: var(--font-size-compact, 12px);
    text-align: center;
  }

  .setup-list {
    display: flex;
    min-height: 0;
    flex-direction: column;
    gap: 0.5rem;
  }

  .load-state,
  .empty-state {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 8rem;
    flex-direction: column;
    gap: 0.45rem;
    padding: 1rem;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-lg, 12px);
    background: color-mix(
      in srgb,
      var(--theme-card-bg, rgba(255, 255, 255, 0.06)) 70%,
      transparent
    );
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.66));
    font-size: var(--font-size-min, 14px);
    text-align: center;
  }

  .empty-state i {
    margin-bottom: 0.25rem;
    color: color-mix(in srgb, var(--semantic-error, #e11d48) 70%, white);
    font-size: 1.4rem;
  }

  .empty-state strong {
    color: var(--theme-text, #fff);
    font-size: var(--font-size-base, 16px);
  }

  .signed-out-state .save-button {
    margin-top: 0.5rem;
    max-width: 12rem;
  }

  .error-state {
    color: var(--theme-text, #fff);
  }

  .retry-button {
    margin-top: 0.35rem;
    padding: 0.55rem 1rem;
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text, #fff);
  }

  .retry-button:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.1));
  }

  .favorite-item {
    display: flex;
    align-items: center;
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    gap: 0.75rem;
    padding: 0.75rem 0.875rem;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: var(--radius-md, 8px);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    color: var(--theme-text, #fff);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition:
      border-color var(--duration-fast, 150ms) ease,
      background var(--duration-fast, 150ms) ease;
  }

  .favorite-item:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.25));
  }

  .favorite-item.active {
    border-color: var(--theme-accent, #3b82f6);
    background: color-mix(
      in srgb,
      var(--theme-accent, #3b82f6) 15%,
      transparent
    );
  }

  .favorite-info {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    gap: 0.125rem;
  }

  .favorite-name,
  .favorite-summary {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .favorite-name {
    font-size: var(--font-size-min, 14px);
    font-weight: 650;
  }

  .favorite-summary {
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.66));
    font-size: var(--font-size-compact, 12px);
  }

  .status-slot {
    flex-shrink: 0;
    min-width: 4.5rem;
    color: var(--theme-accent, #3b82f6);
    font-size: var(--font-size-compact, 12px);
    font-weight: 650;
    text-align: right;
  }

  @media (prefers-reduced-motion: reduce) {
    .save-button,
    .favorite-item {
      transition: none;
    }
  }
</style>
