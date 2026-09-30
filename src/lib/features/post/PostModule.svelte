<script lang="ts">
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { getExportOptionsState } from "$lib/shared/animation-panel/state/export-options-state.svelte";
  import { createCardPreviewState } from "$lib/shared/share/state/card-preview-state.svelte";
  import PostStudio from "$lib/shared/share/components/post-studio/PostStudio.svelte";
  import {
    loadPostDraft,
    savePostDraft,
  } from "$lib/shared/media-composition/services/post-draft-storage";
  import { createPostModuleState } from "./state/post-module-state.svelte";
  import { setPostModuleContext } from "./context/post-module-context";
  import {
    listPostProjects,
    resolvePostSequence,
  } from "./services/post-workspace-projects";
  import { canAccessPostStudio } from "$lib/shared/sequence-viewer/services/post-studio-access";

  interface Props {
    visible?: boolean;
  }
  let { visible = true }: Props = $props();
  const state = createPostModuleState({
    list: listPostProjects,
    resolve: resolvePostSequence,
    loadDraft: loadPostDraft,
  });
  setPostModuleContext(state);
  const exportOptions = getExportOptionsState();
  const cardPreview = createCardPreviewState({
    getSequence: () => state.sequence,
    getEnabled: () => visible && !state.showingProjects,
    getDarkMode: () => exportOptions.imageDarkMode,
    getResolvedAutoLayout: () => null,
  });
  let previousParam: string | null = null;
  let initialVisit = true;

  onMount(() => {
    void state.refreshProjects();
  });
  $effect(() => {
    const project = page.url.searchParams.get("project");
    if (initialVisit) {
      initialVisit = false;
      const target = project || state.lastSelectedId();
      if (target) void state.open(target);
      previousParam = project;
      return;
    }
    if (project && project !== previousParam) void state.open(project);
    previousParam = project;
  });

  function openProject(id: string): void {
    if (id === state.selectedId && !state.showingProjects) return;
    void goto(`/post?project=${encodeURIComponent(id)}`);
  }

  function showProjects(): void {
    state.showProjects();
    void goto("/post", { replaceState: true });
  }
</script>

<section class="post-module" aria-label="Post">
  {#if !canAccessPostStudio()}
    <div class="editor-status" role="status">Post is in early access.</div>
  {:else}
    <div class="project-list" hidden={!state.showingProjects}>
      <header class="list-header">
        <h1>Projects</h1>
        <p>Open a saved post or choose Edit in Post from a sequence.</p>
      </header>
      {#if state.catalogError}<p class="notice" role="status">
          {state.catalogError}
        </p>{/if}
      {#if state.loadingCatalog}<p class="list-status" role="status">
          Loading projects…
        </p>
      {:else if state.projects.length === 0}<p class="list-status">
          No post projects yet. Open a sequence and choose Edit in Post.
        </p>
      {:else}
        <ul>
          {#each state.projects as project (project.sequenceId)}
            <li>
              <button
                type="button"
                onclick={() => openProject(project.sequenceId)}
              >
                <span class="project-mark"
                  ><i class="fas fa-clapperboard" aria-hidden="true"></i></span
                >
                <span class="project-info"
                  ><strong>{project.title}</strong><small
                    >{project.word || project.sequenceId}{project.hasDraft
                      ? " · Saved draft"
                      : ""}</small
                  ></span
                >
                <span class="project-date"
                  >{new Date(project.updatedAt).toLocaleDateString()}</span
                >
                <i class="fas fa-chevron-right" aria-hidden="true"></i>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
    <div class="editor-host" hidden={state.showingProjects}>
      <div class="project-toolbar">
        <button
          type="button"
          onclick={showProjects}
          aria-label="Back to projects"
          ><i class="fas fa-folder-open" aria-hidden="true"></i><span
            >Projects</span
          ></button
        ><span class="current-name"
          >{state.sequence?.displayName ||
            state.sequence?.name ||
            state.selectedId}</span
        >
      </div>
      {#if state.loadingProject}<div class="editor-status" role="status">
          Opening post…
        </div>
      {:else if !state.sequence}<div class="editor-status error" role="alert">
          <p>{state.projectError || "This sequence could not be opened."}</p>
          <button
            type="button"
            onclick={() =>
              state.selectedId && void state.open(state.selectedId)}
            >Try again</button
          >
        </div>
      {:else}
        {#key state.sequence.id}
          <PostStudio
            active={visible && !state.showingProjects}
            sequence={state.sequence}
            initialProject={state.draft ?? undefined}
            onSaveDraft={state.diskAvailable ? savePostDraft : undefined}
            draftLoadError={state.projectError}
            cardPreviewUrl={cardPreview.url}
            cardRenderOptions={cardPreview.renderOptions}
            animationPreviewUrl={null}
            isPreparingCard={cardPreview.isPreparing}
            isPreparingAnimation={false}
            onRequestAnimation={() => undefined}
          />
        {/key}
      {/if}
    </div>
  {/if}
</section>

<style>
  .post-module {
    height: 100%;
    min-height: 0;
    min-width: 0;
    color: var(--theme-text);
    background: var(--theme-panel-bg);
  }
  .project-list {
    max-width: 940px;
    height: 100%;
    overflow-y: auto;
    margin: 0 auto;
    padding: clamp(20px, 4vw, 52px);
  }
  .post-module [hidden] {
    display: none;
  }
  .list-header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 24px;
    padding-bottom: 24px;
    border-bottom: 1px solid var(--theme-stroke);
  }
  .list-header h1 {
    margin: 2px 0 0;
    font-size: clamp(28px, 4vw, 40px);
  }
  .list-header p {
    max-width: 250px;
    margin: 0;
    color: var(--theme-text-secondary);
    font-size: 14px;
    line-height: 1.45;
  }
  .notice {
    color: var(--theme-text-secondary);
    font-size: 13px;
  }
  .list-status {
    padding: 40px 0;
    color: var(--theme-text-secondary);
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  li {
    border-bottom: 1px solid var(--theme-stroke);
  }
  li button {
    display: flex;
    align-items: center;
    gap: 16px;
    width: 100%;
    min-height: 76px;
    padding: 12px 6px;
    border: 0;
    color: inherit;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }
  li button:hover,
  li button:focus-visible {
    background: var(--theme-card-bg);
    outline: 2px solid transparent;
  }
  li button:focus-visible {
    outline-color: var(--theme-text-secondary);
  }
  .project-mark {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    border-radius: 10px;
    background: var(--theme-card-bg);
    color: var(--theme-text-secondary);
    flex: none;
  }
  .project-info {
    display: grid;
    gap: 4px;
    min-width: 0;
    flex: 1;
  }
  .project-info strong,
  .project-info small {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .project-info small,
  .project-date {
    color: var(--theme-text-secondary);
    font-size: 12px;
  }
  .project-date {
    white-space: nowrap;
  }
  .editor-host {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }
  .project-toolbar {
    display: flex;
    align-items: center;
    gap: 16px;
    min-height: 48px;
    padding: 2px 12px;
    border-bottom: 1px solid var(--theme-stroke);
  }
  .project-toolbar button {
    min-height: 44px;
    padding: 6px 9px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }
  .project-toolbar button:hover,
  .project-toolbar button:focus-visible {
    background: var(--theme-card-bg);
  }
  .project-toolbar button i {
    margin-right: 7px;
  }
  .current-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--theme-text-secondary);
    font-size: 12px;
  }
  .editor-status {
    display: grid;
    place-content: center;
    flex: 1;
    color: var(--theme-text-secondary);
    text-align: center;
    padding: 20px;
  }
  .error button {
    min-height: 44px;
    border: 1px solid var(--theme-stroke);
    border-radius: 6px;
    color: inherit;
    background: transparent;
    cursor: pointer;
  }
  :global(
    .post-module
      > .editor-host
      > :last-child:not(.project-toolbar):not(.editor-status)
  ) {
    flex: 1;
    min-height: 0;
  }
  @media (max-width: 600px) {
    .list-header {
      display: block;
    }
    .list-header p {
      margin-top: 10px;
    }
    .project-date {
      display: none;
    }
    .project-list {
      padding: 20px 16px;
    }
  }
</style>
