<script lang="ts">
  import { getFestivalContext } from "../../context/festival-context";
  import { auth } from "#lib/shared/auth/firebase.js";
  import type { BioVersion, TeachingPortfolio } from "../../domain/models/teaching-portfolio";
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ModalHeader from "#lib/shared/foundation/ui/modal/ModalHeader.svelte";
  import ModalFooter from "#lib/shared/foundation/ui/modal/ModalFooter.svelte";

  interface Props {
    editBioId?: string | null;
  }

  let { editBioId = $bindable(null) }: Props = $props();

  const { state: festivalState } = getFestivalContext();

  // Modal state
  let modalOpen = $state(false);
  let editingLabel = $state("");
  let editingText = $state("");
  let editingBioId = $state<string | null>(null);
  let confirmingDelete = $state(false);

  $effect(() => {
    if (editBioId) {
      const bio = festivalState.portfolio?.bios.find((b) => b.id === editBioId);
      if (bio) {
        openEditModal(bio);
      }
      editBioId = null;
    }
  });

  function openEditModal(bio: BioVersion) {
    editingBioId = bio.id;
    editingLabel = bio.label;
    editingText = bio.text;
    confirmingDelete = false;
    modalOpen = true;
  }

  function closeModal() {
    modalOpen = false;
    editingBioId = null;
    editingLabel = "";
    editingText = "";
    confirmingDelete = false;
  }

  function saveEdit() {
    const uid = auth.currentUser?.uid;
    if (!uid || !festivalState.portfolio || !editingBioId) return;
    const updated: TeachingPortfolio = {
      ...festivalState.portfolio,
      bios: festivalState.portfolio.bios.map((b) =>
        b.id === editingBioId ? { ...b, text: editingText, label: editingLabel } : b
      ),
    };
    festivalState.savePortfolio(uid, updated);
    closeModal();
  }

  function deleteBio() {
    const uid = auth.currentUser?.uid;
    if (!uid || !festivalState.portfolio || !editingBioId) return;
    const updated: TeachingPortfolio = {
      ...festivalState.portfolio,
      bios: festivalState.portfolio.bios.filter((b) => b.id !== editingBioId),
    };
    festivalState.savePortfolio(uid, updated);
    closeModal();
  }

  function copyBio() {
    navigator.clipboard.writeText(editingText);
  }
</script>

<div class="bio-editor">
  {#if festivalState.portfolio && festivalState.portfolio.bios.length > 0}
    <div class="bio-cards">
      {#each festivalState.portfolio.bios as bio (bio.id)}
        <div
          class="bio-card"
          role="button"
          tabindex="0"
          aria-label="Edit {bio.label}"
          onclick={() => openEditModal(bio)}
          onkeydown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openEditModal(bio);
            }
          }}
        >
          <span class="bio-char-badge">{bio.text.length} chars</span>
          <h4 class="bio-card-label">{bio.label}</h4>
          {#if bio.text}
            <p class="bio-preview">{bio.text}</p>
          {:else}
            <p class="bio-preview empty">No text yet. Click to edit.</p>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <p class="no-bios">No bios yet.</p>
  {/if}
</div>

<BaseModal bind:open={modalOpen} onclose={() => closeModal()} size="fit" animation="pop">
  {#snippet header()}
    <ModalHeader
      title={editingLabel || "Edit Bio"}
      icon="fa-pencil-alt"
      iconColor="var(--theme-accent, #6366f1)"
      onClose={() => closeModal()}
    />
  {/snippet}

  <div class="bio-modal-body" data-animate="3">
    <label class="field-label">
      Label
      <input
        class="field-input"
        type="text"
        bind:value={editingLabel}
        placeholder="e.g. Teaching Bio, Performance Bio"
      />
    </label>
    <label class="field-label">
      Bio Text
      <textarea
        class="field-textarea"
        bind:value={editingText}
        rows={8}
        placeholder="Write your bio..."
      ></textarea>
    </label>
    <div class="bio-modal-char-count">{editingText.length} characters</div>
  </div>

  {#snippet footer()}
    <ModalFooter align="between">
      <div class="modal-left-actions">
        <button class="ghost" onclick={copyBio} type="button" title="Copy bio text">
          <i class="fas fa-copy" aria-hidden="true"></i>
          Copy
        </button>
        {#if confirmingDelete}
          <span class="confirm-delete-label">Delete?</span>
          <button class="ghost danger-text" onclick={deleteBio} type="button">Yes</button>
          <button class="ghost" onclick={() => (confirmingDelete = false)} type="button">No</button>
        {:else}
          <button
            class="ghost danger-text"
            onclick={() => (confirmingDelete = true)}
            type="button"
            title="Delete this bio"
          >
            <i class="fas fa-trash" aria-hidden="true"></i>
            Delete
          </button>
        {/if}
      </div>
      <div class="modal-right-actions">
        <button class="secondary" onclick={() => closeModal()} type="button">Cancel</button>
        <button class="primary" onclick={saveEdit} disabled={!editingLabel.trim()} type="button">
          Save
        </button>
      </div>
    </ModalFooter>
  {/snippet}
</BaseModal>

<style>
  .bio-editor {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .bio-cards {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .bio-card {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-lg, 12px);
    padding: 16px;
    cursor: pointer;
    transition: border-color 0.15s;
    position: relative;
  }

  .bio-card:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
  }

  .bio-card:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  .bio-card-label {
    margin: 0 0 8px;
    font-size: var(--font-size-sm, 14px);
    font-weight: 600;
    color: var(--theme-text, #ffffff);
    padding-right: 80px; /* space for badge */
  }

  .bio-preview {
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.7));
    line-height: 1.6;
    margin: 0;
  }

  .bio-preview.empty {
    font-style: italic;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.4));
  }

  .bio-char-badge {
    position: absolute;
    top: 12px;
    right: 12px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.5));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    padding: 2px 8px;
    border-radius: 10px;
  }

  .no-bios {
    margin: 0;
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.45));
    font-style: italic;
  }


  .bio-modal-body {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .field-label {
    display: flex;
    flex-direction: column;
    gap: 5px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.6));
    font-weight: 500;
  }

  .field-input,
  .field-textarea {
    background: var(--theme-panel-bg, rgba(18, 18, 28, 0.98));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 5px;
    color: var(--theme-text, #ffffff);
    font-size: var(--font-size-sm, 14px);
    padding: 7px 10px;
    font-family: inherit;
  }

  .field-input:focus,
  .field-textarea:focus {
    outline: none;
    border-color: var(--theme-accent, #6366f1);
  }

  .field-textarea {
    resize: vertical;
    line-height: 1.5;
  }

  .bio-modal-char-count {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.5));
    text-align: right;
  }

  .modal-left-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .modal-right-actions {
    display: flex;
    gap: 8px;
  }

  .danger-text {
    color: var(--semantic-error, #ef4444) !important;
  }

  .danger-text:hover {
    background: rgba(239, 68, 68, 0.1) !important;
  }

  .confirm-delete-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--semantic-error, #ef4444);
  }

  @media (prefers-reduced-motion: reduce) {
    .bio-card {
      transition: none;
    }
  }
</style>
