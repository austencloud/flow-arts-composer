<script lang="ts">
  import { featureFlagService } from "#lib/shared/auth/services/post-hog-feature-flag-service.svelte.js";
  import {
    purgeOneCountSequences,
    type PurgeOneCountResult,
  } from "#lib/shared/library/services/admin-sequence-actions.js";
  import ConfirmDialog from "#lib/shared/foundation/ui/ConfirmDialog.svelte";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";

  let dryRun = $state<PurgeOneCountResult | null>(null);
  let busy = $state(false);
  let confirmOpen = $state(false);

  async function runDryRun() {
    busy = true;
    try {
      dryRun = await purgeOneCountSequences(true);
    } catch (err) {
      console.error(err);
      toast.error("Dry run failed");
    } finally {
      busy = false;
    }
  }

  async function execute() {
    confirmOpen = false;
    busy = true;
    try {
      const result = await purgeOneCountSequences(false);
      toast.success(
        `Deleted ${result.deleted} sequences (${result.publicRemoved} from gallery).`
      );
      dryRun = null;
    } catch (err) {
      console.error(err);
      toast.error("Purge failed");
    } finally {
      busy = false;
    }
  }
</script>

{#if featureFlagService.isAdmin}
  <div class="admin-cleanup">
    <h1>Purge one-count sequences</h1>
    <p>
      Finds every sequence with one motion step or fewer across all users and
      deletes it from their library and the community gallery.
    </p>

    <button class="action" onclick={runDryRun} disabled={busy}>
      {busy ? "Scanning…" : "Scan (dry run)"}
    </button>

    {#if dryRun}
      <div class="results">
        <p><strong>{dryRun.candidates}</strong> one-count sequences found across
          <strong>{dryRun.scanned}</strong> scanned.</p>
        {#if dryRun.candidates > 0}
          <ul>
            {#each dryRun.sample as s (s.id)}
              <li>{s.word || "(untitled)"} · owner {s.ownerId}</li>
            {/each}
          </ul>
          <button class="action danger" onclick={() => (confirmOpen = true)} disabled={busy}>
            Delete all {dryRun.candidates}
          </button>
        {/if}
      </div>
    {/if}
  </div>

  <ConfirmDialog
    bind:isOpen={confirmOpen}
    title="Delete one-count sequences?"
    message={`${dryRun?.candidates ?? 0} sequences across all users will be permanently deleted. This cannot be undone.`}
    confirmText="Delete all"
    cancelText="Cancel"
    variant="danger"
    confirmDelay={3}
    onConfirm={execute}
    onCancel={() => (confirmOpen = false)}
  />
{:else}
  <p class="not-authorized">Not authorized.</p>
{/if}

<style>
  .admin-cleanup {
    max-width: 640px;
    margin: 0 auto;
    padding: var(--spacing-lg);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    color: var(--theme-text);
  }
  .action {
    min-height: 44px;
    padding: 0 var(--spacing-md);
    border-radius: var(--radius-md);
    border: 1px solid var(--theme-border);
    background: var(--theme-surface);
    color: var(--theme-text);
    cursor: pointer;
    align-self: flex-start;
  }
  .action.danger {
    border-color: var(--color-danger, #e5484d);
    color: var(--color-danger, #e5484d);
  }
  .action:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .results ul {
    margin: var(--spacing-sm) 0;
    padding-left: var(--spacing-md);
    font-size: 0.85rem;
    opacity: 0.85;
  }
  .not-authorized {
    padding: var(--spacing-lg);
    text-align: center;
    color: var(--theme-text);
  }
</style>
