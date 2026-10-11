<script lang="ts">
  import { getFestivalContext } from "../../context/festival-context";
  import { auth, getStorageInstance } from "#lib/shared/auth/firebase.js";
  import type {
    TeachingPortfolio,
    ActTemplate,
  } from "../../domain/models/teaching-portfolio";
  import ActTemplateCard from "./ActTemplateCard.svelte";
  import BaseModal from "#lib/shared/foundation/ui/modal/BaseModal.svelte";
  import ModalHeader from "#lib/shared/foundation/ui/modal/ModalHeader.svelte";
  import ModalFooter from "#lib/shared/foundation/ui/modal/ModalFooter.svelte";
  import { toast } from "#lib/shared/toast/state/toast-state.svelte.js";

  const { state: festivalState } = getFestivalContext();

  let showActForm = $state(false);
  let editingActId = $state<string | null>(null);

  let aTitle = $state("");
  let aDescription = $state("");
  let aDuration = $state("");
  let aPerformerCount = $state(1);
  let aSolo = $state(true);
  let aPropsRaw = $state("");
  let aFire = $state(false);
  let aRequirements = $state("");
  let aVideoUrl = $state("");
  let aActImageUrl = $state<string | undefined>(undefined);
  let aActImageUploading = $state(false);
  let aActImageProgress = $state(0);
  let actImageFileInput: HTMLInputElement | undefined = $state(undefined);

  function openNewActForm() {
    editingActId = null;
    aTitle = "";
    aDescription = "";
    aDuration = "";
    aPerformerCount = 1;
    aSolo = true;
    aPropsRaw = "";
    aFire = false;
    aRequirements = "";
    aVideoUrl = "";
    aActImageUrl = undefined;
    aActImageUploading = false;
    aActImageProgress = 0;
    showActForm = true;
  }

  function openEditActForm(act: ActTemplate) {
    editingActId = act.id;
    aTitle = act.title;
    aDescription = act.description;
    aDuration = act.duration;
    aPerformerCount = act.performerCount;
    aSolo = act.solo;
    aPropsRaw = act.props.join(", ");
    aFire = act.fire;
    aRequirements = act.requirements;
    aVideoUrl = act.videoUrl ?? "";
    aActImageUrl = act.imageUrl;
    aActImageUploading = false;
    aActImageProgress = 0;
    showActForm = true;
  }

  async function handleActImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const uid = auth.currentUser?.uid;
    if (!uid) return;

    const actId = editingActId ?? crypto.randomUUID();
    if (!editingActId) {
      editingActId = actId;
    }

    aActImageUploading = true;
    aActImageProgress = 0;

    try {
      const { ref, uploadBytesResumable, getDownloadURL } = await import("firebase/storage");
      const storage = await getStorageInstance();
      const storageRef = ref(storage, `acts/${uid}/${actId}/cover`);

      const uploadTask = uploadBytesResumable(storageRef, file, {
        contentType: file.type,
      });

      uploadTask.on("state_changed", (snapshot) => {
        aActImageProgress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
      });

      await uploadTask;
      const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
      aActImageUrl = downloadUrl;
    } catch (error) {
      console.error("Failed to upload act cover image:", error);
      toast.error("Couldn't upload the cover image. Please try again.");
    } finally {
      aActImageUploading = false;
      if (actImageFileInput) actImageFileInput.value = "";
    }
  }

  function cancelActForm() {
    showActForm = false;
    editingActId = null;
  }

  function saveActForm() {
    const uid = auth.currentUser?.uid;
    const portfolio = festivalState.portfolio;
    if (!uid || !portfolio) return;

    const props = aPropsRaw
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);

    if (editingActId) {
      const updated: TeachingPortfolio = {
        ...portfolio,
        acts: portfolio.acts.map((a) =>
          a.id === editingActId
            ? {
                ...a,
                title: aTitle,
                description: aDescription,
                duration: aDuration,
                performerCount: aPerformerCount,
                solo: aSolo,
                props,
                fire: aFire,
                requirements: aRequirements,
                videoUrl: aVideoUrl || undefined,
                imageUrl: aActImageUrl,
              }
            : a
        ),
      };
      festivalState.savePortfolio(uid, updated);
    } else {
      const newAct: ActTemplate = {
        id: crypto.randomUUID(),
        title: aTitle,
        description: aDescription,
        duration: aDuration,
        performerCount: aPerformerCount,
        solo: aSolo,
        props,
        fire: aFire,
        requirements: aRequirements,
        videoUrl: aVideoUrl || undefined,
        imageUrl: aActImageUrl,
      };
      const updated: TeachingPortfolio = {
        ...portfolio,
        acts: [...portfolio.acts, newAct],
      };
      festivalState.savePortfolio(uid, updated);
    }

    cancelActForm();
  }

  function deleteAct(actId: string) {
    const uid = auth.currentUser?.uid;
    const portfolio = festivalState.portfolio;
    if (!uid || !portfolio) return;
    const updated: TeachingPortfolio = {
      ...portfolio,
      acts: portfolio.acts.filter((a) => a.id !== actId),
    };
    festivalState.savePortfolio(uid, updated);
  }
</script>

<section class="section-card">
  <div class="section-header">
    <h3 class="section-title">Acts</h3>
    <button class="add-btn" onclick={openNewActForm}>
      <i class="fas fa-plus" aria-hidden="true"></i>
      Add Act
    </button>
  </div>

  {#if festivalState.portfolio!.acts.length > 0}
    <div class="act-list">
      {#each festivalState.portfolio!.acts as act (act.id)}
        <ActTemplateCard
          {act}
          onclick={() => openEditActForm(act)}
        />
      {/each}
    </div>
  {:else if !showActForm}
    <p class="empty-section">No acts yet.</p>
  {/if}
</section>

<BaseModal
  bind:open={showActForm}
  onclose={() => cancelActForm()}
  size="fit"
  animation="pop"
>
  {#snippet header()}
    <ModalHeader
      title={editingActId ? "Edit Act" : "New Act"}
      icon={editingActId ? "fa-pencil-alt" : "fa-plus"}
      iconColor="var(--semantic-warning, #f59e0b)"
      onClose={() => cancelActForm()}
    />
  {/snippet}

  <div class="act-form-body" data-animate="3">
    <input
      type="file"
      accept="image/*"
      class="hidden-file-input"
      bind:this={actImageFileInput}
      onchange={handleActImageSelected}
    />
    <button
      type="button"
      class="image-upload-area"
      class:has-image={!!aActImageUrl}
      aria-label={aActImageUrl ? "Change act cover image" : "Upload act cover image"}
      onclick={() => actImageFileInput?.click()}
      disabled={aActImageUploading}
    >
      {#if aActImageUrl}
        <img src={aActImageUrl} alt="Act cover preview" />
        <div class="image-change-overlay">
          <i class="fas fa-camera" aria-hidden="true"></i>
          <span>Change image</span>
        </div>
      {:else}
        <div class="upload-placeholder">
          <i class="fas fa-camera" aria-hidden="true"></i>
          <span>Click to add a promo image</span>
        </div>
      {/if}
      {#if aActImageUploading}
        <div class="upload-progress-overlay">
          <div class="upload-progress-bar" style="width: {aActImageProgress}%"></div>
        </div>
      {/if}
    </button>

    <label class="field-label">
      Title
      <input
        class="field-input"
        type="text"
        bind:value={aTitle}
        placeholder="e.g. Fire Ensemble, Solo LED Staff"
      />
    </label>

    <label class="field-label">
      Description
      <textarea
        class="field-textarea"
        bind:value={aDescription}
        rows={4}
        placeholder="What the audience sees..."
      ></textarea>
    </label>

    <label class="field-label">
      Duration
      <input
        class="field-input"
        type="text"
        bind:value={aDuration}
        placeholder="e.g. 8 minutes, 30-60 min roaming"
      />
    </label>

    <label class="field-label">
      Performer Count
      <input
        class="field-input"
        type="number"
        bind:value={aPerformerCount}
        min="1"
        max="20"
      />
    </label>

    <label class="field-label">
      Format
      <div class="level-toggle-row">
        <button class="level-btn" class:active={aSolo} onclick={() => (aSolo = true)} type="button">Solo</button>
        <button class="level-btn" class:active={!aSolo} onclick={() => (aSolo = false)} type="button">Group</button>
      </div>
    </label>

    <label class="field-label">
      Props (comma-separated)
      <input
        class="field-input"
        type="text"
        bind:value={aPropsRaw}
        placeholder="double-staves, fans"
      />
    </label>

    <label class="field-label">
      Fire
      <div class="level-toggle-row">
        <button class="level-btn" class:active={aFire} onclick={() => (aFire = true)} type="button">
          <i class="fas fa-fire" aria-hidden="true" style="margin-right: 4px;"></i>Fire
        </button>
        <button class="level-btn" class:active={!aFire} onclick={() => (aFire = false)} type="button">Non-fire</button>
      </div>
    </label>

    <label class="field-label">
      Requirements
      <textarea
        class="field-textarea"
        bind:value={aRequirements}
        rows={3}
        placeholder="Stage dimensions, safety needs, sound, lighting..."
      ></textarea>
    </label>

    <label class="field-label">
      Video URL
      <input
        class="field-input"
        type="url"
        bind:value={aVideoUrl}
        placeholder="https://youtu.be/..."
      />
    </label>
  </div>

  {#snippet footer()}
    <ModalFooter align="between">
      <div class="modal-left-actions">
        {#if editingActId}
          <button
            class="ghost"
            onclick={() => navigator.clipboard.writeText(aDescription)}
            title="Copy description to clipboard"
            type="button"
          >
            <i class="fas fa-copy" aria-hidden="true"></i>
            Copy
          </button>
          <button
            class="ghost danger-text"
            onclick={() => { deleteAct(editingActId!); cancelActForm(); }}
            title="Delete this act"
            type="button"
          >
            <i class="fas fa-trash" aria-hidden="true"></i>
            Delete
          </button>
        {/if}
      </div>
      <div class="modal-right-actions">
        <button class="secondary" onclick={cancelActForm} type="button">Cancel</button>
        <button data-save-shortcut class="primary" onclick={saveActForm} disabled={!aTitle.trim()} type="button">
          {editingActId ? "Save Changes" : "Add Act"}
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
    background: color-mix(in srgb, var(--semantic-warning, #f59e0b) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--semantic-warning, #f59e0b) 30%, transparent);
    border-radius: 8px;
    color: var(--semantic-warning, #f59e0b);
    font-size: var(--font-size-sm, 14px);
    cursor: pointer;
    transition: background var(--transition-fast, 0.15s);
  }

  .add-btn:not(:disabled):hover {
    background: color-mix(in srgb, var(--semantic-warning, #f59e0b) 25%, transparent);
  }

  .act-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 16px;
  }


  .act-form-body {
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
