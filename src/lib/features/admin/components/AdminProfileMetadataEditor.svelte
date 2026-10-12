<script lang="ts">
  import { onDestroy, untrack } from "svelte";

  type MetadataUpdate = {
    adminLabel?: string | null;
    adminNotes?: string | null;
  };

  interface Props {
    userId: string;
    initialLabel?: string;
    initialNotes?: string;
    onsave: (update: MetadataUpdate) => Promise<void>;
    onerror: (message: string) => void;
  }

  let {
    userId,
    initialLabel = "",
    initialNotes = "",
    onsave,
    onerror,
  }: Props = $props();

  let adminLabel = $state("");
  let adminNotes = $state("");
  let labelSaveStatus = $state<"idle" | "saving" | "saved">("idle");
  let notesSaveStatus = $state<"idle" | "saving" | "saved">("idle");
  let syncedUserId = "";
  let notesDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  let labelResetTimer: ReturnType<typeof setTimeout> | null = null;
  let notesResetTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if (userId === syncedUserId) return;
    syncedUserId = userId;
    untrack(() => {
      adminLabel = initialLabel;
      adminNotes = initialNotes;
      labelSaveStatus = "idle";
      notesSaveStatus = "idle";
    });
  });

  onDestroy(() => {
    if (notesDebounceTimer) clearTimeout(notesDebounceTimer);
    if (labelResetTimer) clearTimeout(labelResetTimer);
    if (notesResetTimer) clearTimeout(notesResetTimer);
  });

  async function saveAdminLabel() {
    if (labelSaveStatus === "saving") return;
    const valueBeingSaved = adminLabel;
    labelSaveStatus = "saving";

    try {
      await onsave({ adminLabel: valueBeingSaved.trim() || null });
      if (adminLabel !== valueBeingSaved) {
        labelSaveStatus = "idle";
        await saveAdminLabel();
        return;
      }
      labelSaveStatus = "saved";
      if (labelResetTimer) clearTimeout(labelResetTimer);
      labelResetTimer = setTimeout(() => {
        labelSaveStatus = "idle";
      }, 1500);
    } catch (error) {
      console.error(
        "[AdminProfileMetadataEditor] Failed to save label:",
        error
      );
      labelSaveStatus = "idle";
      onerror("Failed to save label");
    }
  }

  async function saveAdminNotes() {
    if (notesSaveStatus === "saving") return;
    const valueBeingSaved = adminNotes;
    notesSaveStatus = "saving";

    try {
      await onsave({ adminNotes: valueBeingSaved.trim() || null });
      if (adminNotes !== valueBeingSaved) {
        notesSaveStatus = "idle";
        await saveAdminNotes();
        return;
      }
      notesSaveStatus = "saved";
      if (notesResetTimer) clearTimeout(notesResetTimer);
      notesResetTimer = setTimeout(() => {
        notesSaveStatus = "idle";
      }, 1500);
    } catch (error) {
      console.error(
        "[AdminProfileMetadataEditor] Failed to save notes:",
        error
      );
      notesSaveStatus = "idle";
      onerror("Failed to save notes");
    }
  }

  function handleNotesInput() {
    if (notesDebounceTimer) clearTimeout(notesDebounceTimer);
    notesDebounceTimer = setTimeout(saveAdminNotes, 1000);
  }
</script>

<div class="admin-label-row">
  <label class="admin-label-label" for="admin-label-input">
    <i class="fas fa-user-tag" aria-hidden="true"></i>
    Known As
  </label>
  <div class="admin-label-input-wrapper">
    <input
      id="admin-label-input"
      type="text"
      class="admin-label-input"
      bind:value={adminLabel}
      onblur={saveAdminLabel}
      onkeydown={(event) => event.key === "Enter" && saveAdminLabel()}
      placeholder="Real name or identifier"
      maxlength="100"
    />
    {#if labelSaveStatus === "saving"}
      <span class="label-status saving" role="status" aria-live="polite">
        <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        <span class="sr-only">Saving label</span>
      </span>
    {:else if labelSaveStatus === "saved"}
      <span class="label-status saved" role="status" aria-live="polite">
        <i class="fas fa-check" aria-hidden="true"></i>
        <span class="sr-only">Label saved</span>
      </span>
    {/if}
  </div>
</div>

<div class="control-group" role="group" aria-labelledby="notes-label">
  <span id="notes-label" class="control-label">
    Admin notes
    {#if notesSaveStatus === "saving"}
      <span class="save-status saving" role="status" aria-live="polite">
        <i class="fas fa-spinner fa-spin" aria-hidden="true"></i>
        Saving...
      </span>
    {:else if notesSaveStatus === "saved"}
      <span class="save-status saved" role="status" aria-live="polite">
        <i class="fas fa-check" aria-hidden="true"></i>
        Saved
      </span>
    {/if}
  </span>
  <textarea
    class="admin-notes-input"
    aria-label="Admin notes"
    bind:value={adminNotes}
    oninput={handleNotesInput}
    onblur={saveAdminNotes}
    placeholder="Context another admin should know"
    rows="3"
  ></textarea>
  <p class="notes-hint">
    Private to administrators. Saves after you pause typing.
  </p>
</div>

<style>
  .admin-label-row {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
    margin-bottom: 1rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid var(--theme-stroke);
  }

  .admin-label-label {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--theme-text-dim);
    white-space: nowrap;
  }

  .admin-label-input-wrapper {
    position: relative;
    display: flex;
    flex: 1;
    align-items: center;
  }

  .admin-label-input {
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    padding: 0.625rem 2.25rem 0.625rem 0.875rem;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 0.5rem;
    color: var(--theme-text);
    font-size: var(--font-size-sm);
    font-weight: 500;
    outline: none;
    transition: border-color var(--duration-normal) var(--ease-standard);
  }

  .admin-label-input:focus-visible,
  .admin-notes-input:focus-visible {
    border-color: var(--theme-accent);
    outline: 2px solid var(--theme-accent);
    outline-offset: 2px;
  }

  .admin-label-input::placeholder,
  .admin-notes-input::placeholder {
    color: var(--theme-text-dim);
  }

  .label-status {
    position: absolute;
    right: 0.75rem;
    display: flex;
    align-items: center;
    font-size: var(--font-size-compact);
  }

  .saving {
    color: var(--theme-text-dim);
  }

  .saved {
    color: var(--semantic-success);
  }

  .control-group {
    margin-bottom: 0;
  }

  .control-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    font-weight: 500;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }

  .save-status {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    font-size: var(--font-size-xs);
    letter-spacing: normal;
    text-transform: none;
  }

  .admin-notes-input {
    width: 100%;
    min-height: 7rem;
    padding: 0.75rem 0.875rem;
    resize: vertical;
    background: var(--theme-card-bg);
    border: 1px solid var(--theme-stroke);
    border-radius: 0.5rem;
    color: var(--theme-text);
    font-family: inherit;
    font-size: var(--font-size-sm);
    line-height: 1.5;
    outline: none;
    transition: border-color var(--duration-normal) var(--ease-standard);
  }

  .notes-hint {
    margin: 0.5rem 0 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact);
    line-height: 1.4;
  }

  @media (min-width: 2600px) {
    .admin-label-row {
      gap: 0.75rem;
      margin-bottom: 1.5rem;
      padding-bottom: 1.5rem;
    }

    .admin-notes-input {
      min-height: 8.5rem;
    }
  }
</style>
