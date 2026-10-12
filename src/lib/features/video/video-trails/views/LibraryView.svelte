<script lang="ts">
  import { getVideoTrailsContext } from "../context/video-trails-context";
  import type { VideoTrailsProject } from "../domain/types";

  const { state: trailsState } = getVideoTrailsContext();

  let searchQuery = $state("");
  let selectedProjectId = $state<string | null>(null);
  let confirmingDeleteId = $state<string | null>(null);

  const filteredProjects = $derived(
    trailsState.projects.filter((p) =>
      p.title.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const selectedProject = $derived(
    filteredProjects.find((p) => p.id === selectedProjectId) ?? null
  );

  $effect(() => {
    trailsState.loadProjectList();
  });

  function hashColor(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash) % 360;
    return `hsl(${h}, 60%, 30%)`;
  }

  function hashColorEnd(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = (Math.abs(hash) + 40) % 360;
    return `hsl(${h}, 50%, 20%)`;
  }

  function formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  function formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }

  function correctionCountFor(project: VideoTrailsProject): number {
    return Object.keys(project.detection.corrections).length;
  }

  function handleSaveCurrent(): void {
    if (trailsState.currentProject) {
      trailsState.saveProject();
      return;
    }

    if (!trailsState.source) return;

    const newProject: VideoTrailsProject = {
      id: crypto.randomUUID(),
      title: trailsState.source.originalFileName ?? "Untitled",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      source: {
        type: trailsState.source.type,
        originalFileName: trailsState.source.originalFileName,
        duration: trailsState.source.duration,
        resolution: { ...trailsState.source.resolution },
        frameCount: trailsState.source.frameCount,
        fps: trailsState.source.fps,
      },
      detection: {
        detectorId: trailsState.activeDetectorId,
        config: { ...trailsState.detectionConfig },
        results: { ...trailsState.frameDetections },
        corrections: { ...trailsState.corrections },
        trainingDataExported: false,
      },
      effects: { ...trailsState.effectConfig },
      exports: [],
      attachments: {},
      thumbnail: "",
    };

    trailsState.currentProject = newProject;
    trailsState.saveProject();
  }

  function handleRefresh(): void {
    trailsState.loadProjectList();
  }

  function handleSelectCard(id: string): void {
    selectedProjectId = selectedProjectId === id ? null : id;
    confirmingDeleteId = null;
  }

  function handleOpenWorkspace(project: VideoTrailsProject): void {
    trailsState.loadProject(project.id);
    trailsState.activeView = "workspace";
  }

  function handleOpenStudio(project: VideoTrailsProject): void {
    trailsState.loadProject(project.id);
    trailsState.activeView = "detection-studio";
  }

  function handleDeleteClick(id: string): void {
    confirmingDeleteId = id;
  }

  function handleDeleteConfirm(id: string): void {
    trailsState.deleteProject(id);
    if (selectedProjectId === id) selectedProjectId = null;
    confirmingDeleteId = null;
  }

  function handleDeleteCancel(): void {
    confirmingDeleteId = null;
  }

  const canSave = $derived(
    trailsState.source !== null || trailsState.currentProject !== null
  );

  const saveLabel = $derived(
    trailsState.currentProject ? "Update Project" : "Save Current"
  );
</script>

<div class="library-view">
  <div class="toolbar">
    <div class="toolbar-left">
      <button
        class="toolbar-btn save-btn"
        onclick={handleSaveCurrent}
        disabled={!canSave}
      >
        <i class="fas fa-save" aria-hidden="true"></i>
        {saveLabel}
      </button>
      <button class="toolbar-btn" onclick={handleRefresh}>
        <i class="fas fa-sync-alt" aria-hidden="true"></i>
        Refresh
      </button>
    </div>
    <div class="toolbar-right">
      <div class="search-wrapper">
        <i class="fas fa-search search-icon" aria-hidden="true"></i>
        <input
          type="text"
          class="search-input"
          placeholder="Search projects..."
          bind:value={searchQuery}
        />
      </div>
    </div>
  </div>

  {#if filteredProjects.length === 0 && trailsState.projects.length === 0}
    <div class="empty-state">
      <i class="fas fa-film" aria-hidden="true"></i>
      <h3>No saved projects</h3>
      <p>
        Load a video in the workspace, run detection, and save your work here.
        Projects store detection data, corrections, and effect settings.
      </p>
    </div>
  {:else if filteredProjects.length === 0}
    <div class="empty-state">
      <i class="fas fa-search" aria-hidden="true"></i>
      <h3>No matches</h3>
      <p>No projects match "{searchQuery}"</p>
    </div>
  {:else}
    <div class="project-grid">
      {#each filteredProjects as project (project.id)}
        <button
          class="project-card"
          class:selected={selectedProjectId === project.id}
          onclick={() => handleSelectCard(project.id)}
        >
          <div
            class="card-thumbnail"
            style="background: linear-gradient(135deg, {hashColor(
              project.title
            )}, {hashColorEnd(project.title)});"
          >
            <div class="thumb-overlay">
              <i class="fas fa-video" aria-hidden="true"></i>
            </div>
            {#if project.source.frameCount > 0}
              <span class="frame-badge">{project.source.frameCount} frames</span
              >
            {/if}
          </div>
          <div class="card-body">
            <p class="card-title" title={project.title}>{project.title}</p>
            <div class="card-meta">
              {#if project.source.duration > 0}
                <span>{formatDuration(project.source.duration)}</span>
              {/if}
              {#if correctionCountFor(project) > 0}
                <span>{correctionCountFor(project)} corrections</span>
              {/if}
            </div>
            <p class="card-date">{formatDate(project.updatedAt)}</p>
          </div>
        </button>
      {/each}
    </div>

    {#if selectedProject}
      <div class="detail-panel">
        <div class="detail-header">
          <h3>{selectedProject.title}</h3>
          <div class="detail-actions">
            <button
              class="action-btn primary"
              onclick={() => handleOpenWorkspace(selectedProject)}
            >
              <i class="fas fa-drafting-compass" aria-hidden="true"></i>
              Open in Workspace
            </button>
            <button
              class="action-btn"
              onclick={() => handleOpenStudio(selectedProject)}
            >
              <i class="fas fa-crosshairs" aria-hidden="true"></i>
              Open in Studio
            </button>
            {#if confirmingDeleteId === selectedProject.id}
              <button
                class="action-btn danger"
                onclick={() => handleDeleteConfirm(selectedProject.id)}
              >
                Confirm Delete
              </button>
              <button class="action-btn" onclick={handleDeleteCancel}>
                Cancel
              </button>
            {:else}
              <button
                class="action-btn danger"
                onclick={() => handleDeleteClick(selectedProject.id)}
              >
                <i class="fas fa-trash" aria-hidden="true"></i>
                Delete
              </button>
            {/if}
          </div>
        </div>

        <div class="detail-info-note">
          <i class="fas fa-info-circle" aria-hidden="true"></i>
          The video file is not stored with the project. You'll need to re-upload
          the video after opening.
        </div>

        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label">Created</span>
            <span class="detail-value"
              >{formatDate(selectedProject.createdAt)}</span
            >
          </div>
          <div class="detail-item">
            <span class="detail-label">Updated</span>
            <span class="detail-value"
              >{formatDate(selectedProject.updatedAt)}</span
            >
          </div>
          <div class="detail-item">
            <span class="detail-label">Source</span>
            <span class="detail-value"
              >{selectedProject.source.originalFileName ?? "Unknown"}</span
            >
          </div>
          <div class="detail-item">
            <span class="detail-label">Duration</span>
            <span class="detail-value"
              >{formatDuration(selectedProject.source.duration)}</span
            >
          </div>
          <div class="detail-item">
            <span class="detail-label">Resolution</span>
            <span class="detail-value"
              >{selectedProject.source.resolution.width}x{selectedProject.source
                .resolution.height}</span
            >
          </div>
          <div class="detail-item">
            <span class="detail-label">Frames</span>
            <span class="detail-value">{selectedProject.source.frameCount}</span
            >
          </div>
          <div class="detail-item">
            <span class="detail-label">FPS</span>
            <span class="detail-value">{selectedProject.source.fps}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Detector</span>
            <span class="detail-value"
              >{selectedProject.detection.detectorId}</span
            >
          </div>
          <div class="detail-item">
            <span class="detail-label">Corrections</span>
            <span class="detail-value"
              >{correctionCountFor(selectedProject)} frames</span
            >
          </div>
          <div class="detail-item">
            <span class="detail-label">Exports</span>
            <span class="detail-value">{selectedProject.exports.length}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Training Exported</span>
            <span class="detail-value"
              >{selectedProject.detection.trainingDataExported
                ? "Yes"
                : "No"}</span
            >
          </div>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .library-view {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 16px;
    padding: 16px;
    overflow-y: auto;
  }

  /* Toolbar */
  .toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .toolbar-left {
    display: flex;
    gap: 8px;
  }

  .toolbar-right {
    flex: 1;
    max-width: 280px;
    min-width: 160px;
  }

  .toolbar-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 14px);
    cursor: pointer;
    transition:
      border-color var(--duration-fast),
      background var(--duration-fast);
    white-space: nowrap;
  }

  .toolbar-btn:hover:not(:disabled) {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.15));
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.06));
  }

  .toolbar-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .toolbar-btn.save-btn {
    border-color: var(--theme-accent, #f43f5e);
    color: var(--theme-accent, #f43f5e);
  }

  .toolbar-btn.save-btn:hover:not(:disabled) {
    background: color-mix(
      in srgb,
      var(--theme-accent, #f43f5e) 10%,
      transparent
    );
  }

  .search-wrapper {
    position: relative;
    width: 100%;
  }

  .search-icon {
    position: absolute;
    left: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    font-size: var(--font-size-compact, 12px);
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    padding: 8px 12px 8px 32px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #fff);
    font-size: var(--font-size-min, 14px);
    outline: none;
    box-sizing: border-box;
  }

  .search-input::placeholder {
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
  }

  .search-input:focus {
    border-color: var(--theme-accent, #f43f5e);
  }

  /* Empty state */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    gap: 12px;
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    text-align: center;
    padding: 40px 20px;
  }

  .empty-state i {
    font-size: 48px;
    opacity: 0.3;
  }

  .empty-state h3 {
    margin: 0;
    font-size: 18px;
    color: var(--theme-text, #fff);
  }

  .empty-state p {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    max-width: 400px;
    line-height: 1.5;
  }

  /* Project grid */
  .project-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
  }

  .project-card {
    display: flex;
    flex-direction: column;
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    overflow: hidden;
    cursor: pointer;
    transition:
      border-color var(--duration-fast),
      transform var(--duration-instant);
    text-align: left;
    padding: 0;
    color: inherit;
    font: inherit;
  }

  .project-card:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    transform: translateY(-1px);
  }

  .project-card.selected {
    border-color: var(--theme-accent, #f43f5e);
    box-shadow: 0 0 0 1px var(--theme-accent, #f43f5e);
  }

  .card-thumbnail {
    position: relative;
    height: 110px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .thumb-overlay {
    color: rgba(255, 255, 255, 0.25);
    font-size: 28px;
  }

  .frame-badge {
    position: absolute;
    bottom: 6px;
    right: 6px;
    padding: 2px 6px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.6);
    color: rgba(255, 255, 255, 0.8);
    font-size: var(--font-size-compact, 12px);
  }

  .card-body {
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .card-title {
    margin: 0;
    font-size: var(--font-size-min, 14px);
    font-weight: 600;
    color: var(--theme-text, #fff);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .card-meta {
    display: flex;
    gap: 8px;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.5));
  }

  .card-date {
    margin: 0;
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.35));
  }

  /* Detail panel */
  .detail-panel {
    border: 1.5px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 10px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .detail-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 12px;
    flex-wrap: wrap;
  }

  .detail-header h3 {
    margin: 0;
    font-size: 16px;
    color: var(--theme-text, #fff);
  }

  .detail-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 6px 12px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    border-radius: 6px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    color: var(--theme-text, #fff);
    font-size: var(--font-size-compact, 12px);
    cursor: pointer;
    transition:
      border-color var(--duration-fast),
      background var(--duration-fast);
    white-space: nowrap;
  }

  .action-btn:hover {
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.2));
    background: var(--theme-card-bg-hover, rgba(255, 255, 255, 0.06));
  }

  .action-btn.primary {
    border-color: var(--theme-accent, #f43f5e);
    color: var(--theme-accent, #f43f5e);
  }

  .action-btn.primary:hover {
    background: color-mix(
      in srgb,
      var(--theme-accent, #f43f5e) 10%,
      transparent
    );
  }

  .action-btn.danger {
    border-color: var(--semantic-error, #ef4444);
    color: var(--semantic-error, #ef4444);
  }

  .action-btn.danger:hover {
    background: color-mix(
      in srgb,
      var(--semantic-error, #ef4444) 10%,
      transparent
    );
  }

  .detail-info-note {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 6px;
    background: color-mix(
      in srgb,
      var(--semantic-warning, #facc15) 8%,
      transparent
    );
    border: 1px solid
      color-mix(in srgb, var(--semantic-warning, #facc15) 20%, transparent);
    font-size: var(--font-size-compact, 12px);
    color: color-mix(
      in srgb,
      var(--semantic-warning, #facc15) 80%,
      transparent
    );
  }

  .detail-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 8px;
  }

  .detail-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 0;
  }

  .detail-label {
    font-size: var(--font-size-compact, 12px);
    color: var(--theme-text-muted, rgba(255, 255, 255, 0.4));
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .detail-value {
    font-size: var(--font-size-min, 14px);
    color: var(--theme-text, #fff);
    word-break: break-all;
  }
</style>
