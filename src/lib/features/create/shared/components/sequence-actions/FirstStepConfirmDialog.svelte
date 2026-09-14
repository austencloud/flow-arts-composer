<!--
  FirstStepConfirmDialog.svelte

  Choose Start confirmation for non-loop sequences. The steps before the
  chosen pose are removed, so the user confirms before it happens.
-->
<script lang="ts">
  interface Props {
    show: boolean;
    stepsToRemove: number;
    onConfirm: () => void;
    onCancel: () => void;
  }

  const { show, stepsToRemove, onConfirm, onCancel }: Props = $props();

  const isPlural = $derived(stepsToRemove > 1);
</script>

{#if show}
  <div class="first-beat-overlay" role="dialog" aria-modal="true">
    <div class="first-beat-dialog">
      <h3>Start from here?</h3>
      <p>
        {isPlural ? `Steps 1 through ${stepsToRemove}` : "Step 1"} will be removed.
      </p>
      <div class="dialog-actions">
        <button class="dialog-btn cancel" onclick={onCancel}> Cancel </button>
        <button class="dialog-btn confirm" onclick={onConfirm}>
          Set Start
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .first-beat-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal);
    padding: 16px;
  }

  .first-beat-dialog {
    background: rgba(30, 35, 45, 0.98);
    border: 1px solid var(--theme-stroke-strong);
    border-radius: 16px;
    padding: 24px;
    max-width: 320px;
    width: 100%;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  }

  .first-beat-dialog h3 {
    margin: 0 0 12px;
    font-size: 1.1rem;
    font-weight: 600;
    color: #06b6d4;
  }

  .first-beat-dialog p {
    margin: 0 0 20px;
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.8);
    line-height: 1.5;
  }

  .dialog-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }

  .dialog-btn {
    padding: 10px 20px;
    border-radius: 10px;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast) ease;
    min-width: 80px;
  }

  .dialog-btn.cancel {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.1));
    border: 1px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    color: white;
  }

  .dialog-btn.cancel:hover {
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.15));
  }

  .dialog-btn.confirm {
    background: linear-gradient(135deg, #06b6d4, #0891b2);
    border: none;
    color: white;
  }

  .dialog-btn.confirm:hover {
    background: linear-gradient(135deg, #22d3ee, #06b6d4);
  }

  @media (prefers-reduced-motion: reduce) {
    .dialog-btn {
      transition: none;
    }
  }
</style>
