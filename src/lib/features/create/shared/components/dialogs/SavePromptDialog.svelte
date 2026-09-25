<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  /**
   * Save Prompt Dialog
   *
   * Prompts user to save their sequence before proceeding with export actions.
   * Used when user tries to share/record/export without having saved the sequence.
   *
   * Domain: Create module - Session management
   */

  import Drawer from "$lib/shared/foundation/ui/Drawer.svelte";

  interface Props {
    show: boolean;
    title?: string;
    message?: string;
    onSave?: () => void;
    onCancel?: () => void;
  }

  let {
    show = $bindable(false),
    title = "Save Sequence First?",
    message = "This sequence needs to be saved to your library before you can proceed. This allows you to view recordings and shared content later.",
    onSave,
    onCancel,
  }: Props = $props();

  function handleSave() {
    onSave?.();
    show = false;
  }

  function handleCancel() {
    onCancel?.();
    show = false;
  }
</script>

<Drawer bind:isOpen={show}>
  <div class="save-prompt-dialog">
    <div class="dialog-header">
      <h2>{title}</h2>
    </div>

    <div class="dialog-content">
      <p class="message">{message}</p>

      <div class="info-box">
        <i class="fas fa-info-circle" aria-hidden="true"></i>
        <span>
          Saving allows you to:
          <ul>
            <li>{t("create_ui_access_recordings_in_your_library")}</li>
            <li>{t("create_ui_find_shared_sequences_later")}</li>
            <li>{t("create_ui_track_your_progress_over_time")}</li>
          </ul>
        </span>
      </div>
    </div>

    <div class="dialog-actions">
      <button class="btn-secondary" onclick={handleCancel}>
        <i class="fas fa-times" aria-hidden="true"></i>
        Cancel
      </button>
      <button data-save-shortcut class="btn-primary" onclick={handleSave}>
        <i class="fas fa-save" aria-hidden="true"></i>
        Save & Continue
      </button>
    </div>
  </div>
</Drawer>

<style>
  .save-prompt-dialog {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    padding: 1.5rem;
    max-width: 500px;
    margin: 0 auto;
  }

  .dialog-header h2 {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .dialog-content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .message {
    margin: 0;
    line-height: 1.6;
    color: var(--text-secondary);
  }

  .info-box {
    display: flex;
    gap: 0.75rem;
    padding: 1rem;
    background: var(--background-secondary);
    border-radius: 8px;
    border: 1px solid var(--border-color);
  }

  .info-box i {
    color: var(--color-info);
    font-size: 1.25rem;
    flex-shrink: 0;
  }

  .info-box ul {
    margin: 0.5rem 0 0;
    padding-left: 1.25rem;
  }

  .info-box li {
    margin: 0.25rem 0;
    color: var(--text-secondary);
  }

  .dialog-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  }

  .dialog-actions button {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    font-weight: 500;
    transition: all var(--duration-normal);
    border: none;
    cursor: pointer;
  }

  .btn-secondary {
    background: var(--background-secondary);
    color: var(--text-primary);
  }

  .btn-secondary:hover {
    background: var(--background-tertiary);
  }

  .btn-primary {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
  }

  .btn-primary:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px
      color-mix(in srgb, var(--theme-accent) 40%, transparent);
  }
</style>
