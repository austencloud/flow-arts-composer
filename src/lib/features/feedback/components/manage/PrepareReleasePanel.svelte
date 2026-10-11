<!-- PrepareReleasePanel - Admin UI for preparing a new release version -->
<script lang="ts">
  import type { VersionState } from "#lib/shared/feedback/state/version-state.svelte.js";
  import { PRE_RELEASE_VERSION } from "#lib/shared/feedback/domain/models/version-models.js";

  const { versionState, onClose } = $props<{
    versionState: VersionState;
    onClose: () => void;
  }>();

  // Form state
  let version = $state("");
  let showConfirm = $state(false);

  // Validation
  const versionError = $derived.by(() => {
    if (!version.trim()) return "Version is required";
    // Basic semver validation
    if (!/^\d+\.\d+\.\d+(-\w+)?$/.test(version.trim())) {
      return "Use semver format (e.g., 0.2.0)";
    }
    // Must be greater than latest
    if (
      versionState.latestVersion &&
      version.trim() <= versionState.latestVersion
    ) {
      return `Must be greater than ${versionState.latestVersion}`;
    }
    return null;
  });

  const isValid = $derived(
    !versionError && versionState.generatedChangelog.length > 0
  );

  // Get icon for category
  function getCategoryIcon(category: string): string {
    switch (category) {
      case "fixed":
        return "fa-bug";
      case "added":
        return "fa-lightbulb";
      case "improved":
        return "fa-wrench";
      default:
        return "fa-circle";
    }
  }

  // Suggested next version
  const suggestedVersion = $derived.by(() => {
    if (!versionState.latestVersion) return "0.1.0";
    const parts = versionState.latestVersion.split(".");
    if (parts.length !== 3) return "0.1.0";
    // Increment minor version
    const major = parseInt(parts[0]) || 0;
    const minor = parseInt(parts[1]) || 0;
    return `${major}.${minor + 1}.0`;
  });

  // Auto-fill suggested version on mount
  $effect(() => {
    if (!version && suggestedVersion) {
      version = suggestedVersion;
    }
  });

  async function handleSubmit() {
    if (!isValid) return;
    showConfirm = true;
  }

  async function handleConfirm() {
    try {
      await versionState.prepareRelease(version.trim());
      onClose();
    } catch {
      showConfirm = false;
    }
  }

  async function handleTagPreRelease() {
    try {
      const count = await versionState.tagExistingAsPreRelease();
      if (count > 0) {
        alert(`Tagged ${count} items as ${PRE_RELEASE_VERSION}`);
      } else {
        alert("No unversioned items to tag");
      }
    } catch {
      // Error shown in state
    }
  }
</script>

<div class="prepare-panel">
  <header class="panel-header">
    <h2>
      <i class="fas fa-rocket" aria-hidden="true"></i>
      Prepare Release
    </h2>
    <button
      type="button"
      class="close-btn"
      onclick={onClose}
      aria-label="Close"
    >
      <i class="fas fa-times" aria-hidden="true"></i>
    </button>
  </header>

  {#if !showConfirm}
    <div class="release-prep-body">
      <!-- Stats -->
      <div class="stats-section">
        <div class="stat">
          <span class="stat-value">{versionState.unversionedCount}</span>
          <span class="stat-label">Completed items ready</span>
        </div>
        {#if versionState.latestVersion}
          <div class="stat">
            <span class="stat-value">{versionState.latestVersion}</span>
            <span class="stat-label">Current version</span>
          </div>
        {/if}
      </div>

      {#if versionState.unversionedCount === 0}
        <div class="empty-state">
          <i class="fas fa-check-circle" aria-hidden="true"></i>
          <p>No completed feedback to release.</p>
          <p class="hint">
            Complete some feedback items first, then prepare a release.
          </p>
        </div>
      {:else}
        <!-- Form -->
        <form
          onsubmit={(e) => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <div class="form-group">
            <label for="version">Version Number</label>
            <input
              id="version"
              type="text"
              bind:value={version}
              placeholder="0.2.0"
              class:error={version && versionError}
            />
            {#if version && versionError}
              <span class="error-text">{versionError}</span>
            {/if}
            <p class="field-hint">
              Auto-generated changelog will be used for What's New display
            </p>
          </div>

          <!-- Auto-generated Changelog Preview -->
          <div class="form-group">
            <span class="label-text">
              <i class="fas fa-magic" aria-hidden="true"></i>
              Auto-Generated Changelog
            </span>

            {#if versionState.isGeneratingChangelog}
              <div class="changelog-loading">
                <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
                Generating changelog...
              </div>
            {:else if versionState.generatedChangelog.length > 0}
              <div class="changelog-preview">
                {#each versionState.generatedChangelog as entry (entry.text)}
                  <div class="changelog-entry {entry.category}">
                    <i
                      class="fas {getCategoryIcon(entry.category)}"
                      aria-hidden="true"
                    ></i>
                    <span class="entry-text">{entry.text}</span>
                  </div>
                {/each}
              </div>
              <p class="changelog-hint">
                Generated from {versionState.completedFeedback.length} completed feedback
                items
              </p>
            {:else}
              <div class="changelog-empty">
                <i class="fas fa-exclamation-circle" aria-hidden="true"></i>
                No changelog entries could be generated
              </div>
            {/if}
          </div>

          <div class="actions">
            <button
              type="submit"
              class="primary-btn"
              disabled={!isValid || versionState.isPreparingRelease}
            >
              {#if versionState.isPreparingRelease}
                <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
                Preparing...
              {:else}
                <i class="fas fa-tag" aria-hidden="true"></i>
                Prepare Release
              {/if}
            </button>
          </div>
        </form>
      {/if}

      <!-- Pre-release migration (only show if no versions exist) -->
      {#if !versionState.latestVersion && versionState.unversionedCount > 0}
        <div class="migration-section">
          <h3>First Time Setup</h3>
          <p>
            Tag existing completed feedback as pre-release ({PRE_RELEASE_VERSION})?
          </p>
          <button
            type="button"
            class="secondary-btn"
            onclick={handleTagPreRelease}
            disabled={versionState.isLoading}
          >
            <i class="fas fa-history" aria-hidden="true"></i>
            Tag as Pre-Release
          </button>
        </div>
      {/if}

      {#if versionState.error}
        <div class="error-banner">
          <i class="fas fa-exclamation-triangle" aria-hidden="true"></i>
          {versionState.error}
        </div>
      {/if}
    </div>
  {:else}
    <!-- Confirmation -->
    <div class="confirm-content">
      <div class="confirm-icon">
        <i class="fas fa-tag" aria-hidden="true"></i>
      </div>
      <h3>Confirm Release v{version}</h3>
      <p>This will:</p>
      <ul>
        <li>
          Archive <strong>{versionState.unversionedCount}</strong> completed
          items as v<strong>{version}</strong>
        </li>
        <li>
          Save the auto-generated changelog ({versionState.generatedChangelog
            .length} entries)
        </li>
        <li>Make this version visible in What's New</li>
      </ul>
      <p class="warning">This action cannot be undone.</p>

      <div class="confirm-actions">
        <button
          type="button"
          class="secondary-btn"
          onclick={() => (showConfirm = false)}
          disabled={versionState.isPreparingRelease}
        >
          Cancel
        </button>
        <button
          type="button"
          class="primary-btn"
          onclick={handleConfirm}
          disabled={versionState.isPreparingRelease}
        >
          {#if versionState.isPreparingRelease}
            <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
            Creating...
          {:else}
            <i class="fas fa-check" aria-hidden="true"></i>
            Confirm
          {/if}
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .prepare-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--theme-panel-bg);
    border-radius: 16px;
    border: 1px solid var(--theme-stroke, var(--theme-stroke));
    overflow: hidden;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid var(--theme-stroke, var(--theme-stroke));
    background: linear-gradient(
      135deg,
      color-mix(
        in srgb,
        var(--theme-accent-strong, var(--theme-accent-strong)) 15%,
        transparent
      ),
      color-mix(
        in srgb,
        var(--theme-accent, var(--semantic-info)) 10%,
        transparent
      )
    );
  }

  .panel-header h2 {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 0;
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: var(--theme-text);
  }

  .panel-header h2 i {
    color: var(--theme-accent-strong, var(--theme-accent-strong));
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target); /* WCAG AAA touch target */
    height: var(--min-touch-target);
    background: var(--theme-card-hover-bg);
    border: none;
    border-radius: 8px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    cursor: pointer;
    transition: all var(--duration-normal);
  }

  .close-btn:hover {
    background: var(--theme-stroke);
    color: var(--theme-text);
  }

  .release-prep-body {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .stats-section {
    display: flex;
    gap: 16px;
  }

  .stat {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 16px;
    background: var(--theme-card-bg, var(--theme-card-bg));
    border-radius: 12px;
    border: 1px solid var(--theme-stroke);
  }

  .stat-value {
    font-size: var(--font-size-3xl);
    font-weight: 700;
    color: var(--theme-accent-strong, var(--theme-accent-strong));
  }

  .stat-label {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, var(--theme-text-dim));
    text-align: center;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px;
    text-align: center;
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .empty-state i {
    font-size: var(--font-size-3xl);
    color: var(--semantic-success);
    margin-bottom: 16px;
  }

  .empty-state p {
    margin: 0;
  }

  .empty-state .hint {
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, var(--theme-text-dim));
    margin-top: 8px;
  }

  form {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-compact);
    font-weight: 500;
    color: var(--theme-text);
  }

  .label-text {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--font-size-compact);
    font-weight: 500;
    color: var(--theme-text);
  }

  .label-text i {
    color: var(--theme-accent-strong, var(--theme-accent-strong));
  }

  .required {
    color: var(--semantic-error);
  }

  input {
    padding: 10px 12px;
    background: var(--theme-card-hover-bg, var(--theme-card-bg));
    border: 1px solid var(--theme-stroke, var(--theme-stroke-strong));
    border-radius: 8px;
    color: var(--theme-text);
    font-size: var(--font-size-sm);
    font-family: inherit;
    transition: border-color var(--duration-normal);
  }

  input:focus {
    outline: none;
    border-color: var(--theme-accent-strong, var(--theme-accent-strong));
  }

  input.error {
    border-color: var(--semantic-error);
  }

  .error-text {
    font-size: var(--font-size-compact);
    color: var(--semantic-error);
  }

  .field-hint {
    margin: 4px 0 0 0;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
  }

  /* Changelog preview */
  .changelog-preview {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 200px;
    overflow-y: auto;
    padding: 12px;
    background: var(--theme-card-bg);
    border-radius: 8px;
    border: 1px solid var(--theme-stroke);
  }

  .changelog-entry {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 8px 10px;
    background: var(--theme-card-bg);
    border-radius: 6px;
    border-left: 3px solid;
  }

  .changelog-entry.fixed {
    border-left-color: var(--semantic-error);
  }

  .changelog-entry.fixed i {
    color: var(--semantic-error);
  }

  .changelog-entry.added {
    border-left-color: var(--theme-accent-strong, var(--theme-accent-strong));
  }

  .changelog-entry.added i {
    color: var(--theme-accent-strong, var(--theme-accent-strong));
  }

  .changelog-entry.improved {
    border-left-color: var(--semantic-info);
  }

  .changelog-entry.improved i {
    color: var(--semantic-info);
  }

  .changelog-entry i {
    margin-top: 2px;
    font-size: var(--font-size-compact);
    flex-shrink: 0;
  }

  .changelog-entry .entry-text {
    font-size: var(--font-size-compact);
    color: var(--theme-text);
    line-height: 1.4;
  }

  .changelog-hint {
    margin: 4px 0 0 0;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim);
  }

  .changelog-loading,
  .changelog-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 24px;
    background: var(--theme-card-bg);
    border-radius: 8px;
    color: var(--theme-text-dim, var(--theme-text-dim));
    font-size: var(--font-size-compact);
  }

  .changelog-empty i {
    color: var(--semantic-warning);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    padding-top: 8px;
  }

  .primary-btn,
  .secondary-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal);
  }

  .primary-btn {
    background: linear-gradient(
      135deg,
      var(--theme-accent-strong, var(--theme-accent-strong)),
      var(--theme-accent-strong, var(--theme-accent))
    );
    color: white;
  }

  .primary-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px
      color-mix(
        in srgb,
        var(--theme-accent-strong, var(--theme-accent-strong)) 40%,
        transparent
      );
  }

  .primary-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .secondary-btn {
    background: var(--theme-card-hover-bg);
    color: var(--theme-text, var(--theme-text));
    border: 1px solid var(--theme-stroke);
  }

  .secondary-btn:hover:not(:disabled) {
    background: var(--theme-stroke);
  }

  .secondary-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .migration-section {
    margin-top: 16px;
    padding: 16px;
    background: rgba(245, 158, 11, 0.1);
    border: 1px solid rgba(245, 158, 11, 0.3);
    border-radius: 12px;
  }

  .migration-section h3 {
    margin: 0 0 8px 0;
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--semantic-warning);
  }

  .migration-section p {
    margin: 0 0 12px 0;
    font-size: var(--font-size-compact);
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .error-banner {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 16px;
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 8px;
    color: #fca5a5;
    font-size: var(--font-size-compact);
  }

  /* Confirmation view */
  .confirm-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px;
    text-align: center;
  }

  .confirm-icon {
    width: 64px;
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(
      135deg,
      color-mix(
        in srgb,
        var(--theme-accent-strong, var(--theme-accent-strong)) 20%,
        transparent
      ),
      color-mix(
        in srgb,
        var(--theme-accent-strong, var(--theme-accent)) 10%,
        transparent
      )
    );
    border-radius: 50%;
    margin-bottom: 16px;
  }

  .confirm-icon i {
    font-size: var(--font-size-3xl);
    color: var(--theme-accent-strong, var(--theme-accent-strong));
  }

  .confirm-content h3 {
    margin: 0 0 12px 0;
    font-size: var(--font-size-xl);
    font-weight: 600;
    color: var(--theme-text);
  }

  .confirm-content p {
    margin: 0 0 8px 0;
    font-size: var(--font-size-sm);
    color: var(--theme-text-dim, var(--theme-text-dim));
  }

  .confirm-content ul {
    margin: 12px 0;
    padding: 0;
    list-style: none;
    text-align: left;
  }

  .confirm-content li {
    position: relative;
    padding-left: 20px;
    margin-bottom: 8px;
    font-size: var(--font-size-sm);
    color: var(--theme-text);
  }

  .confirm-content li::before {
    content: "•";
    position: absolute;
    left: 0;
    color: var(--theme-accent-strong, var(--theme-accent-strong));
  }

  .confirm-content li strong {
    color: var(--theme-accent-strong, var(--theme-accent-strong));
  }

  .confirm-content .warning {
    margin-top: 16px;
    padding: 8px 12px;
    background: rgba(245, 158, 11, 0.1);
    border-radius: 6px;
    font-size: var(--font-size-compact);
    color: var(--semantic-warning);
  }

  .confirm-actions {
    display: flex;
    gap: 12px;
    margin-top: 24px;
  }
</style>
