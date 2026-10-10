<script lang="ts">
  /**
   * UserOverrideEditor
   * Main editor panel for user feature overrides
   * Features:
   * - 3-state toggles per feature
   * - Live effective permissions preview
   * - Quick presets
   * - Grouped by module/capability
   */

  import type {
    FeatureFlagConfig,
    FeatureId,
  } from "#lib/shared/auth/domain/models/feature-flag.js";
  import AdminDetailPanel from "#lib/shared/admin/components/AdminDetailPanel.svelte";
  import AdminActionButton from "#lib/shared/admin/components/AdminActionButton.svelte";
  import RoleBadge from "../shared/RoleBadge.svelte";
  import ThreeStateToggle from "../shared/ThreeStateToggle.svelte";
  import CollapsibleSection from "../shared/CollapsibleSection.svelte";
  import FeatureRow from "../shared/FeatureRow.svelte";
  import QuickPresets from "./QuickPresets.svelte";
  import EffectivePermissions from "./EffectivePermissions.svelte";
  import {
    type UserData,
    type OverrideState,
    buildFeatureHierarchy,
    calculateEffectiveAccess,
  } from "../shared/feature-utils";

  interface Props {
    user: UserData;
    featureFlags: FeatureFlagConfig[];
    overrideStates: Map<FeatureId, OverrideState>;
    isSaving: boolean;
    hasChanges: () => boolean;
    onOverrideChange: (featureId: FeatureId, state: OverrideState) => void;
    onPresetApply: (featureIds: FeatureId[], state: OverrideState) => void;
    onSave: () => void;
    onReset: () => void;
    onClose: () => void;
  }

  let {
    user,
    featureFlags,
    overrideStates,
    isSaving,
    hasChanges,
    onOverrideChange,
    onPresetApply,
    onSave,
    onReset,
    onClose,
  }: Props = $props();

  const hierarchy = $derived(buildFeatureHierarchy(featureFlags));

  // Calculate what "inherit" resolves to for a feature
  function getInheritResolvesTo(flag: FeatureFlagConfig): boolean {
    const access = calculateEffectiveAccess(flag, user.role, undefined);
    return access.hasAccess;
  }
</script>

<AdminDetailPanel
  title={user.displayName}
  subtitle={"@" + user.username}
  icon="fa-user-cog"
  {onClose}
>
  {#snippet children()}
    <div class="editor-content">
      <!-- User info header -->
      <div class="user-header">
        <div class="user-avatar">
          {#if user.photoURL}
            <img
              src={user.photoURL}
              alt={user.displayName}
              crossorigin="anonymous"
              referrerpolicy="no-referrer"
            />
          {:else}
            <span class="initials">
              {user.displayName
                .split(" ")
                .map((n) => n[0])
                .join("")
                .toUpperCase()
                .slice(0, 2)}
            </span>
          {/if}
        </div>
        <div class="user-details">
          <RoleBadge role={user.role} size="md" />
          <span class="user-id">ID: {user.id.slice(0, 12)}...</span>
        </div>
      </div>

      <!-- Quick presets -->
      <QuickPresets {onPresetApply} />

      <!-- Effective permissions preview -->
      <EffectivePermissions
        {featureFlags}
        userRole={user.role}
        {overrideStates}
      />

      <!-- Feature overrides -->
      <div class="overrides-section">
        <h3>Feature Overrides</h3>
        <p class="section-description">
          Set each feature to <strong>Inherit</strong> (use role defaults),
          <strong>Grant</strong> (force enable), or <strong>Deny</strong> (force disable).
        </p>

        <!-- Modules -->
        {#each hierarchy.modules as { module, tabs }}
          <CollapsibleSection
            title={module.name}
            icon={module.id.includes("admin") ? "fa-shield-halved" : "fa-cube"}
            iconColor="#8b5cf6"
            count={1 + tabs.length}
          >
            <!-- Module toggle -->
            <div class="feature-toggle-row">
              <FeatureRow flag={module}>
                {#snippet children()}
                  <ThreeStateToggle
                    value={overrideStates.get(module.id) ?? "inherit"}
                    inheritResolvesTo={getInheritResolvesTo(module)}
                    compact
                    onchange={(state) => onOverrideChange(module.id, state)}
                  />
                {/snippet}
              </FeatureRow>
            </div>

            <!-- Tab toggles -->
            {#each tabs as tab}
              <div class="feature-toggle-row indent">
                <FeatureRow flag={tab} indent>
                  {#snippet children()}
                    <ThreeStateToggle
                      value={overrideStates.get(tab.id) ?? "inherit"}
                      inheritResolvesTo={getInheritResolvesTo(tab)}
                      compact
                      onchange={(state) => onOverrideChange(tab.id, state)}
                    />
                  {/snippet}
                </FeatureRow>
              </div>
            {/each}
          </CollapsibleSection>
        {/each}

        <!-- Capabilities -->
        {#if hierarchy.capabilities.length > 0}
          <CollapsibleSection
            title="Capabilities"
            icon="fa-wand-magic-sparkles"
            iconColor="#f59e0b"
            count={hierarchy.capabilities.length}
          >
            {#each hierarchy.capabilities as capability}
              <div class="feature-toggle-row">
                <FeatureRow flag={capability}>
                  {#snippet children()}
                    <ThreeStateToggle
                      value={overrideStates.get(capability.id) ?? "inherit"}
                      inheritResolvesTo={getInheritResolvesTo(capability)}
                      compact
                      onchange={(state) => onOverrideChange(capability.id, state)}
                    />
                  {/snippet}
                </FeatureRow>
              </div>
            {/each}
          </CollapsibleSection>
        {/if}
      </div>
    </div>
  {/snippet}

  {#snippet actions()}
    {#if hasChanges()}
      <AdminActionButton variant="secondary" onclick={onReset}>
        Reset
      </AdminActionButton>
    {/if}
    <AdminActionButton
      saveShortcut={hasChanges()}
      variant="primary"
      icon={hasChanges() ? "fa-save" : "fa-check"}
      loading={isSaving}
      onclick={hasChanges() ? onSave : onClose}
    >
      {hasChanges() ? "Save Changes" : "Done"}
    </AdminActionButton>
  {/snippet}
</AdminDetailPanel>

<style>
  .editor-content {
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .user-header {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border-radius: 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
  }

  .user-avatar {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }

  .user-avatar img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .initials {
    font-size: var(--font-size-lg, 18px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
  }

  .user-details {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .user-id {
    font-size: var(--font-size-compact, 12px);
    font-family: monospace;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .overrides-section h3 {
    margin: 0 0 6px 0;
    font-size: var(--font-size-base, 16px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
  }

  .section-description {
    margin: 0 0 16px 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    line-height: 1.5;
  }

  .section-description strong {
    color: var(--theme-text, #ffffff);
  }

  .overrides-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .feature-toggle-row.indent {
    margin-left: 12px;
  }
</style>
