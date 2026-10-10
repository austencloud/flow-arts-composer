<script lang="ts">
  /**
   * UserOverrides
   * Main container for managing per-user feature overrides
   * Features:
   * - Visual user browser with all users visible
   * - Users with overrides prioritized at top
   * - 3-state toggles (Inherit/Grant/Deny)
   * - Effective permissions preview
   * - Quick presets
   * - Impact summary before save
   */

  import { featureFlagService, featureFlagState } from "#lib/shared/auth/services/post-hog-feature-flag-service.svelte.js";
  import type { FeatureId, UserFeatureOverrides } from "#lib/shared/auth/domain/models/feature-flag.js";
  import type { UserProfile } from "#lib/shared/community/domain/models/enhanced-user-profile.js";
  import AdminTwoPanelLayout from "#lib/shared/admin/components/AdminTwoPanelLayout.svelte";
  import AdminModal from "#lib/shared/admin/components/AdminModal.svelte";
  import FeatureFlagUserBrowser from "./FeatureFlagUserBrowser.svelte";
  import UserOverrideEditor from "./UserOverrideEditor.svelte";
  import {
    type UserData,
    type OverrideState,
    getOverrideState,
    buildOverridesFromStates,
    calculateImpact,
  } from "../shared/feature-utils";

  type UserWithOverrides = UserProfile & { featureOverrides?: UserFeatureOverrides };

  interface Props {
    onError: (message: string) => void;
  }

  let { onError }: Props = $props();

  // State - users list owned by parent, passed to browser
  let allUsers = $state<UserWithOverrides[]>([]);
  let selectedUser = $state<UserData | null>(null);
  let isSaving = $state(false);

  // Override states map: featureId -> state
  let overrideStates = $state<Map<FeatureId, OverrideState>>(new Map());

  // Impact preview modal
  let showImpactModal = $state(false);
  let pendingImpact = $state<{ gained: string[]; lost: string[]; unchanged: string[] } | null>(null);

  // Feature flags - track flagsVersion for cross-component reactivity
  const featureFlags = $derived.by(() => {
    const _version = featureFlagState.flagsVersion;
    return featureFlagService.featureConfigs;
  });

  function selectUser(user: UserWithOverrides) {
    // Convert UserProfile to UserData format for the editor
    const userData: UserData = {
      id: user.id,
      displayName: user.displayName,
      username: user.username,
      photoURL: user.avatar || null,
      role: user.role || "user",
      featureOverrides: user.featureOverrides,
    };
    selectedUser = userData;
    // Initialize override states from user's current overrides
    const states = new Map<FeatureId, OverrideState>();
    for (const flag of featureFlags) {
      states.set(flag.id, getOverrideState(flag.id, user.featureOverrides));
    }
    overrideStates = states;
  }

  function handleOverrideChange(featureId: FeatureId, state: OverrideState) {
    overrideStates = new Map(overrideStates).set(featureId, state);
  }

  function handlePresetApply(featureIds: FeatureId[], state: OverrideState) {
    const newStates = new Map(overrideStates);
    if (featureIds.length === 0) {
      // "Full access" - grant all
      for (const flag of featureFlags) {
        newStates.set(flag.id, state);
      }
    } else {
      for (const id of featureIds) {
        newStates.set(id, state);
      }
    }
    overrideStates = newStates;
  }

  function hasChanges(): boolean {
    if (!selectedUser) return false;
    for (const flag of featureFlags) {
      const current = getOverrideState(flag.id, selectedUser.featureOverrides);
      const edited = overrideStates.get(flag.id) ?? "inherit";
      if (current !== edited) return true;
    }
    return false;
  }

  function handleSaveRequest() {
    if (!selectedUser || !hasChanges()) return;

    const newOverrides = buildOverridesFromStates(overrideStates);
    const impact = calculateImpact(
      featureFlags,
      selectedUser.role,
      selectedUser.featureOverrides,
      newOverrides
    );

    pendingImpact = impact;
    showImpactModal = true;
  }

  async function confirmSave() {
    if (!selectedUser) return;

    isSaving = true;
    showImpactModal = false;

    try {
      const newOverrides = buildOverridesFromStates(overrideStates);
      await featureFlagService.setUserFeatureOverrides(selectedUser.id, newOverrides);

      // Update local users list
      allUsers = allUsers.map((u) =>
        u.id === selectedUser!.id
          ? { ...u, featureOverrides: newOverrides }
          : u
      );

      // Update selected user
      selectedUser = { ...selectedUser, featureOverrides: newOverrides };
    } catch (error) {
      console.error("Failed to save overrides:", error);
      onError("Failed to save overrides. Please try again.");
    } finally {
      isSaving = false;
      pendingImpact = null;
    }
  }

  function handleReset() {
    if (!selectedUser) return;
    const states = new Map<FeatureId, OverrideState>();
    for (const flag of featureFlags) {
      states.set(flag.id, getOverrideState(flag.id, selectedUser.featureOverrides));
    }
    overrideStates = states;
  }

  function handleClose() {
    selectedUser = null;
    overrideStates = new Map();
  }
</script>

<AdminTwoPanelLayout
  hasSelection={selectedUser !== null}
  onClose={handleClose}
>
  {#snippet list()}
    <FeatureFlagUserBrowser
      bind:allUsers
      onUserSelect={selectUser}
      {onError}
    />
  {/snippet}

  {#snippet detail()}
    {#if selectedUser}
      <UserOverrideEditor
        user={selectedUser}
        {featureFlags}
        {overrideStates}
        {isSaving}
        {hasChanges}
        onOverrideChange={handleOverrideChange}
        onPresetApply={handlePresetApply}
        onSave={handleSaveRequest}
        onReset={handleReset}
        onClose={handleClose}
      />
    {/if}
  {/snippet}
</AdminTwoPanelLayout>

{#if showImpactModal && pendingImpact}
  {@const impact = pendingImpact}
  <AdminModal
    title="Apply Changes"
    variant={impact.lost.length > 0 ? "warning" : "info"}
    confirmLabel="Apply Changes"
    cancelLabel="Cancel"
    onConfirm={confirmSave}
    onCancel={() => {
      showImpactModal = false;
      pendingImpact = null;
    }}
    loading={isSaving}
  >
    {#snippet children()}
      <div class="impact-summary">
        <p class="impact-intro">
          Applying changes to <strong>{selectedUser?.displayName}</strong>:
        </p>

        {#if impact.gained.length > 0}
          <div class="impact-section gained">
            <h4>
              <i class="fas fa-plus-circle" aria-hidden="true"></i>
              Will gain access to ({impact.gained.length})
            </h4>
            <ul>
              {#each impact.gained as feature}
                <li>{feature}</li>
              {/each}
            </ul>
          </div>
        {/if}

        {#if impact.lost.length > 0}
          <div class="impact-section lost">
            <h4>
              <i class="fas fa-minus-circle" aria-hidden="true"></i>
              Will lose access to ({impact.lost.length})
            </h4>
            <ul>
              {#each impact.lost as feature}
                <li>{feature}</li>
              {/each}
            </ul>
          </div>
        {/if}

        {#if impact.gained.length === 0 && impact.lost.length === 0}
          <p class="no-effective-change">
            <i class="fas fa-info-circle" aria-hidden="true"></i>
            Override settings changed but effective access remains the same.
          </p>
        {/if}
      </div>
    {/snippet}
  </AdminModal>
{/if}

<style>
  .impact-summary {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .impact-intro {
    margin: 0;
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text, #ffffff);
  }

  .impact-section {
    padding: 12px;
    border-radius: 8px;
  }

  .impact-section.gained {
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.2);
  }

  .impact-section.lost {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.2);
  }

  .impact-section h4 {
    margin: 0 0 8px 0;
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .impact-section.gained h4 {
    color: #34d399;
  }

  .impact-section.lost h4 {
    color: #f87171;
  }

  .impact-section ul {
    margin: 0;
    padding-left: 20px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.8));
  }

  .impact-section li {
    margin: 4px 0;
  }

  .no-effective-change {
    margin: 0;
    padding: 12px;
    border-radius: 8px;
    background: rgba(99, 102, 241, 0.1);
    border: 1px solid rgba(99, 102, 241, 0.2);
    color: #a5b4fc;
    font-size: var(--font-size-sm, 14px);
    display: flex;
    align-items: center;
    gap: 10px;
  }
</style>
