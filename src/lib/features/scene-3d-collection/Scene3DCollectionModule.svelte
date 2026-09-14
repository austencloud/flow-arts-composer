<!--
  Scene3DCollectionModule.svelte — the Playground "Scenes" tab.

  A gallery of saved 3D viewer configurations ("Save scene" in the 3D side
  panel). Selecting one opens a detail view (poster still + meta chips + inline
  rename + two-tap delete). Two reproduce paths: "Open in 3D Studio" reproduces the
  exact performance when steps were captured; "Apply look" seeds the scene/camera
  globals for any sequence.

  Shares the unified gallery/detail/4K layout with the Tunnels + Mandala
  playgrounds (header + count, poster grid, floating back button, footer split,
  container-query tiers). Detail preview is a POSTER STILL — a live Threlte
  re-render per gallery selection is too heavy; live 3D belongs in the viewer.
-->
<script lang="ts">
  import { onMount, tick } from "svelte";
  import { scene3dCollectionState } from "./state/scene-3d-collection-state.svelte";
  import { markFilmSceneKept } from "./services/save-film-recipe";
  import {
    getScene3DEnvironmentId,
    scene3DHasFilm,
    type Collected3DScene,
  } from "./domain/scene-3d-collection-types";
  import { getSceneEnvironmentDefinition } from "$lib/shared/3d/environments/domain/scene-environment";
  import {
    openScene3DInStudio,
    openScene3DFilmInStudio,
    applyScene3DLook,
    scene3DHasSteps,
  } from "./services/open-3d-scene";
  import VideoPreviewPanel from "$lib/shared/sequence-viewer/components/VideoPreviewPanel.svelte";
  import {
    getRenderedFilmsForEntry,
    type RenderedFilmRecord,
  } from "$lib/shared/video-export/services/rendered-film-store";
  import {
    sanitizeFilename,
    shareOrDownloadBlob,
  } from "$lib/shared/foundation/services/file-downloader";
  import PanelSpinner from "$lib/shared/components/panel/PanelSpinner.svelte";
  import CollectionGalleryDetail from "$lib/shared/modules/CollectionGalleryDetail.svelte";
  import FilterChipBase from "$lib/shared/browse/components/filter-chips/FilterChipBase.svelte";
  import { toast, showToast } from "$lib/shared/toast/state/toast-state.svelte";
  import { openLineageSource, hasLineageSource } from "$lib/shared/collections/open-lineage-source";
  import { simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import { revertSettingsCheckpoint } from "$lib/shared/collections/settings-checkpoint.svelte";

  type Phase = "gallery" | "detail";
  let phase = $state<Phase>("gallery");
  let selected = $state<Collected3DScene | null>(null);

  const items = $derived(scene3dCollectionState.collection);

  let rootEl = $state<HTMLDivElement | null>(null);
  let backBtnEl = $state<HTMLButtonElement | null>(null);
  let lastCardId: string | null = null;
  let announce = $state("");

  let confirmingDelete = $state<string | null>(null);
  let deleteTimer: ReturnType<typeof setTimeout> | undefined;

  let renaming = $state(false);
  let renameValue = $state("");
  let renameInputEl = $state<HTMLInputElement | null>(null);

  const dateLabel = $derived(
    selected
      ? new Date(selected.createdAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : "",
  );

  const hasSteps = $derived(selected ? scene3DHasSteps(selected) : false);
  const hasFilm = $derived(selected ? scene3DHasFilm(selected) : false);

  // The finished video, when this device still has it. Recipes live in the
  // collection; the rendered file lives in local retention, so a scene can
  // legitimately have a film and no retained render (rendered elsewhere, or
  // pruned).
  let retainedFilm = $state<RenderedFilmRecord | null>(null);
  let retainedFilmUrl = $state<string | null>(null);
  let previewDismissed = $state(false);

  function releaseRetainedFilm(): void {
    if (retainedFilmUrl) URL.revokeObjectURL(retainedFilmUrl);
    retainedFilmUrl = null;
    retainedFilm = null;
  }

  async function loadRetainedFilm(scene: Collected3DScene): Promise<void> {
    releaseRetainedFilm();
    previewDismissed = false;
    if (!scene3DHasFilm(scene)) return;
    const [newest] = await getRenderedFilmsForEntry(scene.id);
    // The detail view may have moved on while the read was in flight.
    if (!newest || selected?.id !== scene.id) return;
    retainedFilm = newest;
    retainedFilmUrl = URL.createObjectURL(newest.blob);
  }

  async function saveRetainedFilm(): Promise<void> {
    if (!retainedFilm) return;
    const name =
      sanitizeFilename(simplifyRepeatedWord(retainedFilm.word || "")) || "film";
    const extension = retainedFilm.mimeType.includes("webm") ? "webm" : "mp4";
    await shareOrDownloadBlob(retainedFilm.blob, `${name}.${extension}`, {
      title: "Flow Arts Composer 3D Film",
    });
  }

  // What the scene IS, at a glance — derived from the snapshot.
  const meta = $derived.by(() => {
    if (!selected) return [];
    const snap = selected.snapshot;
    const performers = snap.performers.length || 1;
    const scene = getSceneEnvironmentDefinition(
      getScene3DEnvironmentId(snap)
    ).label;
    const activeEffects = Object.entries(snap.effectToggles)
      .filter(([, on]) => on)
      .map(([k]) => cap(k));
    const features = Object.entries(snap.sceneFeatures)
      .filter(([, on]) => on)
      .map(([k]) => k);
    const chips: { icon: string; label: string }[] = [
      { icon: "fa-mountain-sun", label: scene },
      { icon: "fa-users", label: `${performers} performer${performers === 1 ? "" : "s"}` },
      { icon: "fa-hand", label: cap(snap.defaultSettings.prop || "staff") },
      {
        icon: "fa-wand-magic-sparkles",
        label: activeEffects.length ? activeEffects.join(", ") : "No effects",
      },
    ];
    if (features.length) chips.push({ icon: "fa-cubes", label: `${features.length} feature${features.length === 1 ? "" : "s"}` });
    return chips;
  });

  function cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  async function open(s: Collected3DScene) {
    selected = s;
    lastCardId = s.id;
    confirmingDelete = null;
    renaming = false;
    phase = "detail";
    announce = `Opened ${s.name}`;
    void loadRetainedFilm(s);
    await tick();
    backBtnEl?.focus();
  }

  async function back() {
    phase = "gallery";
    selected = null;
    releaseRetainedFilm();
    confirmingDelete = null;
    renaming = false;
    clearTimeout(deleteTimer);
    announce = "Back to scenes gallery";
    await tick();
    rootEl
      ?.querySelector<HTMLButtonElement>(`[data-card-id="${lastCardId}"]`)
      ?.focus();
  }

  async function del(id: string) {
    if (confirmingDelete !== id) {
      confirmingDelete = id;
      deleteTimer = setTimeout(() => {
        confirmingDelete = null;
      }, 3000);
      return;
    }
    clearTimeout(deleteTimer);
    try {
      await scene3dCollectionState.remove(id);
      toast.success("Scene deleted");
      void back();
    } catch (error) {
      console.warn("[Scene3DCollection] Delete failed:", error);
      confirmingDelete = null;
      toast.error("Couldn't delete the scene — try again");
    }
  }

  function handleApplyLook() {
    if (!selected) return;
    // applyScene3DLook captures its own settings checkpoint before writing
    // anything, so the Undo here just replays it — no overlay to close since
    // "Apply look" (unlike "Open in 3D Studio") never opens one.
    const name = selected.name;
    applyScene3DLook(selected);
    showToast({
      message: `Viewer now using "${name}"`,
      type: "success",
      duration: 8000,
      action: {
        label: "Undo",
        onClick: () => revertSettingsCheckpoint(),
      },
    });
  }

  function startRename() {
    if (!selected) return;
    renameValue = selected.name;
    renaming = true;
    void tick().then(() => {
      renameInputEl?.focus();
      renameInputEl?.select();
    });
  }

  async function commitRename() {
    if (!renaming || !selected) return;
    renaming = false;
    const next = renameValue.trim();
    if (!next || next === selected.name) return;
    try {
      const renamed = await scene3dCollectionState.rename(selected.id, next);
      if (renamed) {
        // Naming a recording is how someone says they want to keep it, so it
        // stops counting against the automatic-recording limit.
        await markFilmSceneKept(renamed.id);
        selected =
          scene3dCollectionState.collection.find((e) => e.id === renamed.id) ??
          renamed;
      }
    } catch (error) {
      console.warn("[Scene3DCollection] Rename failed:", error);
      toast.error("Couldn't rename the scene — try again");
    }
  }

  function handleRenameKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      void commitRename();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      renaming = false;
    }
  }

  function handleWindowKeydown(e: KeyboardEvent) {
    if (e.key === "Escape" && phase === "detail" && !renaming) {
      void back();
    }
  }

  onMount(() => {
    // Guest sessions hydrate from localStorage (signed-in boot goes through
    // auth-boot-orchestrator's init(uid) instead — initLocal no-ops then).
    scene3dCollectionState.initLocal();
    return () => {
      clearTimeout(deleteTimer);
      releaseRetainedFilm();
    };
  });
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div class="scene-module" bind:this={rootEl}>
  <div class="sr-only" aria-live="polite">{announce}</div>

  <CollectionGalleryDetail
    open={phase === "detail" && !!selected}
    onClose={() => void back()}
    ariaLabel={selected?.name ?? "Scene"}
    gallery={galleryView}
    detail={detailView}
  />

  {#snippet galleryView()}
      <div class="gallery-view">
        {#if scene3dCollectionState.loading && items.length === 0}
          <div class="loading-state">
            <PanelSpinner size={12} />
            <p class="loading-label">Loading your scenes…</p>
          </div>
        {:else if items.length === 0}
          <div class="empty-state">
            <i class="fas fa-cube empty-icon" aria-hidden="true"></i>
            <p class="empty-title">No scenes yet</p>
            <p class="empty-hint">
              Open a sequence in 3D Studio, set up the shot, and press
              “Save scene” in the scene controls.
            </p>
          </div>
        {:else}
          <header class="gallery-head">
            <h2 class="gallery-title">Saved scenes</h2>
            <span class="gallery-count">{items.length}</span>
          </header>
          <div class="gallery-grid">
            {#each items as item, i (item.id)}
              <button
                type="button"
                class="gallery-card"
                data-card-id={item.id}
                onclick={() => open(item)}
                aria-label="View {item.name}, {i + 1} of {items.length}"
                title={item.name}
              >
                <div class="card-thumb">
                  {#if item.poster}
                    <img src={item.poster} alt={item.name} loading="lazy" />
                  {:else}
                    <i class="fas fa-cube thumb-fallback" aria-hidden="true"></i>
                  {/if}
                </div>
                {#if scene3DHasFilm(item)}
                  <span class="film-badge">
                    <i class="fas fa-clapperboard" aria-hidden="true"></i>
                    Film
                  </span>
                {/if}
                <span class="card-label">{item.name}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
  {/snippet}

  {#snippet detailView({ inDrawer }: { inDrawer: boolean })}
    {#if selected}
      <div class="detail-layout">
        <div class="detail-preview">
          {#if !inDrawer}
            <button
              type="button"
              class="back-btn"
              onclick={back}
              bind:this={backBtnEl}
              aria-label="Back to gallery"
            >
              <i class="fas fa-arrow-left" aria-hidden="true"></i>
              <span>Gallery</span>
            </button>
          {/if}
          <div class="preview-stage" role="img" aria-label="Saved 3D scene {selected.name}">
            {#if selected.poster}
              <img src={selected.poster} alt={selected.name} />
            {:else}
              <i class="fas fa-cube stage-fallback" aria-hidden="true"></i>
            {/if}
          </div>
        </div>

        <div class="detail-panel">
          <div class="detail-info">
            <div class="name-row">
              {#if renaming}
                <!-- svelte-ignore a11y_autofocus -->
                <input
                  type="text"
                  class="name-input"
                  bind:this={renameInputEl}
                  bind:value={renameValue}
                  onkeydown={handleRenameKeydown}
                  onblur={() => void commitRename()}
                  maxlength="60"
                  aria-label="Scene name"
                />
              {:else}
                <h2 class="detail-name" title={selected.name}>{selected.name}</h2>
                {#if !scene3dCollectionState.isReadOnlyPreview}
                  <button
                    type="button"
                    class="rename-btn"
                    onclick={startRename}
                    aria-label="Rename scene"
                  >
                    <i class="fas fa-pen" aria-hidden="true"></i>
                  </button>
                {/if}
              {/if}
            </div>
            <span class="detail-date">{dateLabel}</span>
          </div>

          <div class="meta-chips">
            {#each meta as chip (chip.label)}
              <span class="meta-chip">
                <i class="fas {chip.icon}" aria-hidden="true"></i>
                {chip.label}
              </span>
            {/each}
            {#if hasLineageSource(selected)}
              <FilterChipBase
                mode="action"
                size="sm"
                icon="fa-arrow-up-right-from-square"
                label={`From ${simplifyRepeatedWord(selected.sourceWord ?? "")}`}
                chipColor="var(--theme-accent, #22d3ee)"
                onclick={() => void openLineageSource(selected!)}
              />
            {/if}
          </div>

          {#if retainedFilmUrl && !previewDismissed}
            <VideoPreviewPanel
              blobUrl={retainedFilmUrl}
              saveLabel="Save"
              onRedownload={() => void saveRetainedFilm()}
              onDismiss={() => (previewDismissed = true)}
            />
          {/if}

          <div class="detail-actions">
            {#if hasFilm}
              <button
                type="button"
                class="action-btn film-btn"
                onclick={() => openScene3DFilmInStudio(selected!)}
              >
                <i class="fas fa-clapperboard" aria-hidden="true"></i>
                <span>Render film</span>
              </button>
            {/if}
            {#if hasSteps}
              <button
                type="button"
                class="action-btn open-btn"
                onclick={() => openScene3DInStudio(selected!)}
              >
                <i class="fas fa-up-right-from-square" aria-hidden="true"></i>
                <span>Open in 3D Studio</span>
              </button>
            {/if}
            <button
              type="button"
              class="action-btn apply-btn"
              onclick={handleApplyLook}
            >
              <i class="fas fa-wand-magic-sparkles" aria-hidden="true"></i>
              <span>Apply look</span>
            </button>
            <p class="action-hint">
              {hasFilm
                ? "Render film replays the camera you recorded, at any quality."
                : hasSteps
                  ? "Open reproduces this scene with its sequence. Apply look sets the scene for any sequence."
                  : "Applies this scene’s look — open any sequence in 3D to see it."}
            </p>
          </div>

          {#if !scene3dCollectionState.isReadOnlyPreview}
            <div class="detail-footer">
              <button
                type="button"
                class="action-btn delete-btn"
                class:confirming={confirmingDelete === selected.id}
                onclick={() => del(selected!.id)}
                aria-live="polite"
              >
                {#if confirmingDelete === selected.id}
                  <i class="fas fa-check" aria-hidden="true"></i>
                  <span>Press again to confirm</span>
                {:else}
                  <i class="fas fa-trash-alt" aria-hidden="true"></i>
                  <span>Delete</span>
                {/if}
              </button>
            </div>
          {/if}
        </div>
      </div>
    {/if}
  {/snippet}
</div>

<style>
  .scene-module {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: transparent;
    container-type: inline-size;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .gallery-view {
    width: 100%;
    height: 100%;
    overflow-y: auto;
    padding: 32px;
  }

  .gallery-head {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin-bottom: 20px;
  }
  .gallery-title {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--theme-text, white);
  }
  .gallery-count {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.6));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 999px;
    padding: 2px 10px;
    font-variant-numeric: tabular-nums;
  }

  .gallery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 16px;
  }

  .gallery-card {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 16px 12px 14px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 14px;
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) var(--ease-out, ease);
    min-height: var(--min-touch-target, 44px);
  }

  .card-thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
    transition: transform var(--duration-normal, 250ms) var(--ease-out, ease);
  }

  @media (hover: hover) {
    .gallery-card:hover {
      background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.07));
      border-color: color-mix(in srgb, var(--theme-accent, #22d3ee) 40%, transparent);
      transform: translateY(-2px);
    }
    .gallery-card:hover .card-thumb img {
      transform: scale(1.06);
    }
  }

  .gallery-card:active {
    transform: scale(0.97);
    transition-duration: 50ms;
  }

  .gallery-card:focus-visible {
    outline: 2px solid var(--theme-accent, #22d3ee);
    outline-offset: 2px;
  }

  .card-thumb {
    width: 100%;
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #000;
    border-radius: 10px;
    overflow: hidden;
  }

  .thumb-fallback {
    font-size: 40px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.25));
  }

  .card-label {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--font-size-compact, 13px);
    font-weight: 500;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
  }

  .empty-state,
  .loading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 8px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    text-align: center;
    padding: 0 24px;
  }

  .empty-icon {
    font-size: 48px;
    opacity: 0.3;
  }
  .empty-title {
    font-size: 16px;
    font-weight: 500;
    margin: 0;
    color: var(--theme-text, white);
  }
  .empty-hint {
    font-size: var(--font-size-min, 14px);
    margin: 0;
    max-width: 40ch;
    line-height: 1.5;
  }
  .loading-state {
    gap: 16px;
  }
  .loading-label {
    font-size: var(--font-size-min, 14px);
    margin: 0;
  }

  .detail-layout {
    display: flex;
    height: 100%;
  }

  .detail-preview {
    position: relative;
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 0;
    min-height: 0;
    padding: 24px;
    /* Query container so .preview-stage can size to min(100cqw, 100cqh). MUST be
       `size` (both axes), NOT `inline-size` — the preview's 100cqh (height fit)
       only resolves against a size container; with inline-size it falls through
       to the viewport and the square overflows its slot again. contain: layout
       only (size/layout/style, not paint), so the absolutely-positioned back
       button isn't clipped. */
    container-type: size;
  }

  .preview-stage {
    position: relative;
    /* Fit the square to BOTH the container's width AND height (100cqmin), so it
       never clips or overflows onto the controls — robust at any aspect ratio
       (tiny phone, Z Fold near-square, 4K). Replaces max-width: min(100%, 80vh),
       which ignored the available height and let the square outgrow its slot. */
    width: min(100cqw, 100cqh);
    height: min(100cqw, 100cqh);
    max-width: 100%;
    max-height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #000;
    border-radius: 12px;
    overflow: hidden;
    box-shadow:
      0 0 0 1px var(--theme-stroke, rgba(255, 255, 255, 0.08)),
      0 12px 60px color-mix(in srgb, var(--theme-accent, #22d3ee) 14%, transparent);
  }
  .preview-stage img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .stage-fallback {
    font-size: 64px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.25));
  }

  .detail-panel {
    width: 320px;
    flex-shrink: 0;
    padding: 24px;
    background: var(--theme-panel-bg, rgba(10, 10, 20, 0.85));
    border-left: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  /* Floating glass button over the preview's top-left. */
  .back-btn {
    position: absolute;
    top: 20px;
    left: 20px;
    z-index: 2;
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 48px;
    padding: 8px 18px;
    background: color-mix(in srgb, var(--theme-panel-bg, rgba(10, 10, 20, 0.85)) 80%, transparent);
    backdrop-filter: blur(8px);
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
    border-radius: 999px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) var(--ease-out, ease);
  }

  @media (hover: hover) {
    .back-btn:hover {
      background: var(--theme-card-bg, rgba(255, 255, 255, 0.08));
      border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
      color: var(--theme-text, white);
    }
  }

  .back-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #22d3ee);
    outline-offset: 2px;
  }

  .detail-info {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .name-row {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
  }

  .detail-name {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: var(--theme-text, white);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .name-input {
    flex: 1;
    min-width: 0;
    min-height: 44px;
    padding: 4px 12px;
    font-size: 20px;
    font-weight: 600;
    color: var(--theme-text, white);
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
    border: 1px solid var(--theme-accent, #22d3ee);
    border-radius: 10px;
    outline: none;
  }

  .rename-btn {
    flex-shrink: 0;
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 10px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.45));
    font-size: 13px;
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) var(--ease-out, ease);
  }
  @media (hover: hover) {
    .rename-btn:hover {
      color: var(--theme-text, white);
      background: var(--theme-card-bg, rgba(255, 255, 255, 0.06));
      border-color: var(--theme-stroke, rgba(255, 255, 255, 0.1));
    }
  }
  .rename-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #22d3ee);
    outline-offset: 2px;
  }

  .detail-date {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
  }

  .meta-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .meta-chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    font-size: var(--font-size-compact, 12px);
    font-weight: 500;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    border-radius: 999px;
  }
  .meta-chip i {
    font-size: 11px;
    color: color-mix(in srgb, var(--theme-accent, #22d3ee) 70%, white);
  }

  .detail-actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .film-badge {
    position: absolute;
    top: 8px;
    left: 8px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 8px;
    border-radius: 999px;
    background: color-mix(
      in srgb,
      var(--theme-accent, #22d3ee) 82%,
      transparent
    );
    color: #061014;
    font-size: var(--font-size-compact, 12px);
    font-weight: 700;
    pointer-events: none;
  }

  .action-hint {
    margin: 2px 0 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.5));
    text-align: center;
    line-height: 1.4;
  }

  .detail-footer {
    margin-top: auto;
    padding-top: 16px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
  }
  .detail-footer .action-btn {
    width: 100%;
  }

  .action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    min-height: 48px;
    padding: 12px 18px;
    border-radius: 12px;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-fast, 150ms) var(--ease-out, ease);
  }

  .action-btn:focus-visible {
    outline: 2px solid var(--theme-accent, #22d3ee);
    outline-offset: 2px;
  }

  .open-btn {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 75%, white),
      var(--theme-accent, #22d3ee)
    );
    border: 1px solid rgba(255, 255, 255, 0.15);
    color: white;
    box-shadow: 0 4px 12px color-mix(in srgb, var(--theme-accent, #22d3ee) 30%, transparent);
  }

  .apply-btn {
    background: transparent;
    border: 1px solid color-mix(in srgb, var(--theme-accent, #22d3ee) 45%, transparent);
    color: var(--theme-accent-text, var(--theme-accent, #22d3ee));
  }

  .delete-btn {
    background: transparent;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.08));
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.45));
  }

  .delete-btn.confirming {
    background: var(--semantic-error, #ef4444);
    border-color: var(--semantic-error, #ef4444);
    color: white;
  }

  @media (hover: hover) {
    .open-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px color-mix(in srgb, var(--theme-accent, #22d3ee) 40%, transparent);
    }
    .apply-btn:hover {
      background: color-mix(in srgb, var(--theme-accent, #22d3ee) 12%, transparent);
      border-color: color-mix(in srgb, var(--theme-accent, #22d3ee) 70%, transparent);
    }
    .delete-btn:hover {
      color: var(--semantic-error, #ef4444);
      border-color: color-mix(in srgb, var(--semantic-error, #ef4444) 30%, transparent);
    }
    .delete-btn.confirming:hover {
      background: color-mix(in srgb, var(--semantic-error, #ef4444) 80%, black);
    }
  }

  .action-btn:active {
    transform: scale(0.98);
    transition-duration: 50ms;
  }

  /* ── Responsive (container-relative) ── */
  @container (min-width: 1200px) {
    .gallery-view {
      padding: 40px 48px;
    }
    .gallery-grid {
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 20px;
    }
    .detail-panel {
      width: 380px;
      padding: 32px;
    }
    .detail-preview {
      padding: 32px;
    }
  }

  @container (min-width: 1800px) {
    .gallery-view {
      padding: 56px 72px;
    }
    .gallery-head {
      margin-bottom: 28px;
    }
    .gallery-title {
      font-size: 24px;
    }
    .gallery-count {
      font-size: var(--font-size-min, 14px);
      padding: 3px 14px;
    }
    .gallery-grid {
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      gap: 28px;
    }
    .gallery-card {
      gap: 14px;
      padding: 20px 16px 18px;
      border-radius: 18px;
    }
    .card-thumb {
      border-radius: 14px;
    }
    .card-label {
      font-size: var(--font-size-min, 14px);
    }
    .detail-panel {
      width: 440px;
      padding: 40px 36px;
      gap: 28px;
    }
    .detail-preview {
      padding: 48px;
    }
    .detail-name {
      font-size: 26px;
    }
    .name-input {
      font-size: 26px;
    }
    .detail-date {
      font-size: var(--font-size-min, 14px);
    }
    .meta-chip {
      font-size: var(--font-size-min, 14px);
      padding: 8px 16px;
    }
    .meta-chip i {
      font-size: 13px;
    }
    .action-btn {
      min-height: 56px;
      font-size: 16px;
      border-radius: 14px;
    }
    .back-btn {
      top: 28px;
      left: 28px;
      min-height: 52px;
      padding: 10px 22px;
      font-size: var(--font-size-min, 15px);
    }
  }

  @container (max-width: 768px) {
    .gallery-view {
      padding: 20px;
    }
    .gallery-grid {
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: 12px;
    }
    .detail-layout {
      flex-direction: column;
    }
    .detail-preview {
      flex: 1;
      min-height: 40%;
      padding: 16px;
    }
    .detail-panel {
      width: 100%;
      max-height: 55%;
      border-left: none;
      border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    }
  }

  @container (max-width: 480px) {
    .gallery-view {
      padding: 16px;
    }
    .gallery-grid {
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 10px;
    }
    .gallery-card {
      padding: 10px 8px;
      gap: 8px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .gallery-card,
    .action-btn,
    .back-btn,
    .rename-btn,
    .card-thumb img {
      transition: none !important;
    }
    .gallery-card:hover,
    .gallery-card:hover .card-thumb img,
    .action-btn:active {
      transform: none;
    }
  }
</style>
