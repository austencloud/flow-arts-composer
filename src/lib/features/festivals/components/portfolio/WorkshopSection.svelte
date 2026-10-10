<script lang="ts">
  import { getFestivalContext } from "../../context/festival-context";
  import { auth, getStorageInstance } from "#lib/shared/auth/firebase.js";
  import type {
    TeachingPortfolio,
    WorkshopTemplate,
    WorkshopLevel,
  } from "../../domain/models/teaching-portfolio";
  import WorkshopTemplateCard from "./WorkshopTemplateCard.svelte";
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ModalHeader from "#lib/shared/foundation/ui/modal/ModalHeader.svelte";
  import ModalFooter from "#lib/shared/foundation/ui/modal/ModalFooter.svelte";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";

  const { state: festivalState } = getFestivalContext();

  let showWorkshopForm = $state(false);
  let editingWorkshopId = $state<string | null>(null);

  let wTitle = $state("");
  let wLevel = $state<WorkshopLevel>("beginner");
  let wPropsRaw = $state("");
  let wDescription = $state("");
  let wSolo = $state(true);
  let wImageUrl = $state<string | undefined>(undefined);
  let wImageUploading = $state(false);
  let wImageProgress = $state(0);
  let imageFileInput: HTMLInputElement | undefined = $state(undefined);

  const LEVELS: WorkshopLevel[] = ["introductory", "beginner", "intermediate", "advanced", "mixed"];

  function openNewWorkshopForm() {
    editingWorkshopId = null;
    wTitle = "";
    wLevel = "beginner";
    wPropsRaw = "";
    wDescription = "";
    wSolo = true;
    wImageUrl = undefined;
    wImageUploading = false;
    wImageProgress = 0;
    showWorkshopForm = true;
  }

  function openEditWorkshopForm(workshop: WorkshopTemplate) {
    editingWorkshopId = workshop.id;
    wTitle = workshop.title;
    wLevel = workshop.level;
    wPropsRaw = workshop.props.join(", ");
    wDescription = workshop.description;
    wSolo = workshop.solo;
    wImageUrl = workshop.imageUrl;
    wImageUploading = false;
    wImageProgress = 0;
    showWorkshopForm = true;
  }

  async function handleImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const workshopId = editingWorkshopId ?? crypto.randomUUID();
    if (!editingWorkshopId) {
      editingWorkshopId = workshopId;
    }

    wImageUploading = true;
    wImageProgress = 0;

    try {
      const { ref, uploadBytesResumable, getDownloadURL } = await import("firebase/storage");
      const storage = await getStorageInstance();
      const storageRef = ref(storage, `workshops/${uid}/${workshopId}/cover`);

      const uploadTask = uploadBytesResumable(storageRef, file, {
        contentType: file.type,
      });

      uploadTask.on("state_changed", (snapshot) => {
        wImageProgress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
      });

      await uploadTask;
      const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
      wImageUrl = downloadUrl;
    } catch (error) {
      console.error("Failed to upload workshop cover image:", error);
      toast.error("Couldn't upload the cover image. Please try again.");
    } finally {
      wImageUploading = false;
      if (imageFileInput) imageFileInput.value = "";
    }
  }

  function cancelWorkshopForm() {
    showWorkshopForm = false;
    editingWorkshopId = null;
  }

  function saveWorkshopForm() {
    const uid = auth.currentUser?.uid;
    const portfolio = festivalState.portfolio;
    if (!uid || !portfolio) return;

    const props = wPropsRaw
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    if (editingWorkshopId) {
      const updated: TeachingPortfolio = {
        ...portfolio,
        classes: portfolio.classes.map((c) =>
          c.id === editingWorkshopId
            ? { ...c, title: wTitle, level: wLevel, props, description: wDescription, solo: wSolo, imageUrl: wImageUrl }
            : c
        ),
      };
      festivalState.savePortfolio(uid, updated);
    } else {
      const newWorkshop: WorkshopTemplate = {
        id: crypto.randomUUID(),
        title: wTitle,
        level: wLevel,
        props,
        description: wDescription,
        themes: [],
        solo: wSolo,
        imageUrl: wImageUrl,
      };
      const updated: TeachingPortfolio = {
        ...portfolio,
        classes: [...portfolio.classes, newWorkshop],
      };
      festivalState.savePortfolio(uid, updated);
    }

    cancelWorkshopForm();
  }

  function deleteWorkshop(workshopId: string) {
    const uid = auth.currentUser?.uid;
    const portfolio = festivalState.portfolio;
    if (!uid || !portfolio) return;
    const updated: TeachingPortfolio = {
      ...portfolio,
      classes: portfolio.classes.filter((c) => c.id !== workshopId),
    };
    festivalState.savePortfolio(uid, updated);
  }
</script>

<section class="section-card">
  <div class="section-header">
    <h3 class="section-title">Workshops</h3>
    <button class="add-btn" onclick={openNewWorkshopForm}>
      <i class="fas fa-plus" aria-hidden="true"></i>
      Add Workshop
    </button>
  </div>

  {#if festivalState.portfolio!.classes.length > 0}
    <div class="workshop-list">
      {#each festivalState.portfolio!.classes as workshop (workshop.id)}
        <WorkshopTemplateCard
          {workshop}
          onclick={() => openEditWorkshopForm(workshop)}
        />
      {/each}
    </div>
  {:else if !showWorkshopForm}
    <p class="empty-section">No workshops yet.</p>
  {/if}
</section>

<BaseModal
  bind:open={showWorkshopForm}
  onclose={() => cancelWorkshopForm()}
  size="fit"
  animation="pop"
>
  {#snippet header()}
    <ModalHeader
      title={editingWorkshopId ? "Edit Workshop" : "New Workshop"}
      icon={editingWorkshopId ? "fa-pencil-alt" : "fa-plus"}
      iconColor="var(--theme-accent, #6366f1)"
      onClose={() => cancelWorkshopForm()}
    />
  {/snippet}

  <div class="workshop-form-body" data-animate="3">
    <input
      type="file"
      accept="image/*"
      class="hidden-file-input"
      bind:this={imageFileInput}
      onchange={handleImageSelected}
    />
    <button
      type="button"
      class="image-upload-area"
      class:has-image={!!wImageUrl}
      onclick={() => imageFileInput?.click()}
      disabled={wImageUploading}
    >
      {#if wImageUrl}
        <img src={wImageUrl} alt="Workshop cover preview" />
        <div class="image-change-overlay">
          <i class="fas fa-camera" aria-hidden="true"></i>
          <span>Change image</span>
        </div>
      {:else}
        <div class="upload-placeholder">
          <i class="fas fa-camera" aria-hidden="true"></i>
          <span>Click to add a cover image</span>
        </div>
      {/if}
      {#if wImageUploading}
        <div class="upload-progress-overlay">
          <div class="upload-progress-bar" style="width: {wImageProgress}%"></div>
        </div>
      {/if}
    </button>

    <label class="field-label">
      Title
      <input
        class="field-input"
        type="text"
        bind:value={wTitle}
        placeholder="Workshop title"
      />
    </label>

    <label class="field-label">
      Level
      <div class="level-toggle-row">
        {#each LEVELS as level (level)}
          <button
            class="level-btn"
            class:active={wLevel === level}
            onclick={() => (wLevel = level)}
            type="button"
          >
            {level}
          </button>
        {/each}
      </div>
    </label>

    <label class="field-label">
      Props (comma-separated)
      <input
        class="field-input"
        type="text"
        bind:value={wPropsRaw}
        placeholder="double-staves, clubs"
      />
    </label>

    <label class="field-label">
      Description
      <textarea
        class="field-textarea"
        bind:value={wDescription}
        rows={6}
        placeholder="What you teach in this workshop..."
      ></textarea>
    </label>

    <label class="field-label">
      Format
      <div class="level-toggle-row">
        <button class="level-btn" class:active={wSolo} onclick={() => (wSolo = true)} type="button">Solo</button>
        <button class="level-btn" class:active={!wSolo} onclick={() => (wSolo = false)} type="button">Partner</button>
      </div>
    </label>
  </div>

  {#snippet footer()}
    <ModalFooter align="between">
      <div class="modal-left-actions">
        {#if editingWorkshopId}
          <button
            class="ghost"
            onclick={() => navigator.clipboard.writeText(wDescription)}
            title="Copy description to clipboard"
            type="button"
          >
            <i class="fas fa-copy" aria-hidden="true"></i>
            Copy
          </button>
          <button
            class="ghost danger-text"
            onclick={() => { deleteWorkshop(editingWorkshopId!); cancelWorkshopForm(); }}
            title="Delete this workshop"
            type="button"
          >
            <i class="fas fa-trash" aria-hidden="true"></i>
            Delete
          </button>
        {/if}
      </div>
      <div class="modal-right-actions">
        <button class="secondary" onclick={cancelWorkshopForm} type="button">Cancel</button>
        <button data-save-shortcut class="primary" onclick={saveWorkshopForm} disabled={!wTitle.trim()} type="button">
          {editingWorkshopId ? "Save Changes" : "Add Workshop"}
        </button>
      </div>
    </ModalFooter>
  {/snippet}
</BaseModal>

<style>
  .section-card {
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: var(--radius-lg, 12px);
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 14px;
    grid-column: 1 / -1;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .section-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--theme-text, #ffffff);
  }

  .empty-section {
    margin: 0;
    font-size: var(--font-size-sm, 14px);
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.45));
    font-style: italic;
  }

  .add-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 14px;
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--theme-accent, #6366f1) 30%, transparent);
    border-radius: 8px;
    color: var(--theme-accent, #6366f1);
    font-size: var(--font-size-sm, 14px);
    cursor: pointer;
    transition: background var(--transition-fast, 0.15s);
  }

  .add-btn:not(:disabled):hover {
    background: color-mix(in srgb, var(--theme-accent, #6366f1) 25%, transparent);
  }

  .workshop-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 16px;
  }


  .workshop-form-body {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .modal-left-actions,
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

  .level-toggle-row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .level-btn {
    padding: 4px 10px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 4px;
    background: none;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.6));
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    text-transform: capitalize;
    transition: color 0.15s, border-color 0.15s, background 0.15s;
  }

  .level-btn.active {
    background: var(--theme-accent, #6366f1);
    border-color: var(--theme-accent, #6366f1);
    color: #fff;
  }


  .hidden-file-input {
    display: none;
  }

  .image-upload-area {
    all: unset;
    position: relative;
    width: 100%;
    height: 120px;
    border: 2px dashed var(--theme-stroke, rgba(255, 255, 255, 0.15));
    border-radius: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    overflow: hidden;
    transition: border-color var(--transition-fast, 0.15s);
    box-sizing: border-box;
  }

  .image-upload-area:hover {
    border-color: var(--theme-accent, #6366f1);
  }

  .image-upload-area:disabled {
    cursor: wait;
    opacity: 0.7;
  }

  .image-upload-area.has-image {
    border: none;
  }

  .image-upload-area img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .upload-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    color: var(--theme-text-secondary, rgba(255, 255, 255, 0.35));
    font-size: var(--font-size-compact, 12px);
  }

  .upload-placeholder i {
    font-size: 20px;
  }

  .image-change-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    background: rgba(0, 0, 0, 0.5);
    color: rgba(255, 255, 255, 0.8);
    font-size: var(--font-size-compact, 12px);
    opacity: 0;
    transition: opacity var(--transition-fast, 0.15s);
  }

  .image-upload-area:hover .image-change-overlay {
    opacity: 1;
  }

  .upload-progress-overlay {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 4px;
    background: rgba(0, 0, 0, 0.3);
  }

  .upload-progress-bar {
    height: 100%;
    background: var(--theme-accent, #6366f1);
    transition: width 0.2s;
  }

  @media (prefers-reduced-motion: reduce) {
    .image-upload-area,
    .image-change-overlay,
    .upload-progress-bar,
    .level-btn,
    .add-btn {
      transition: none;
    }
  }
</style>
