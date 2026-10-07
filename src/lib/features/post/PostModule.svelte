<script lang="ts">
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import { isTkaWord, simplifyRepeatedWord } from "$lib/shared/foundation/utils/word-simplifier";
  import TKAWordGlyph from "$lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import { getExportOptionsState } from "$lib/shared/animation-panel/state/export-options-state.svelte";
  import { createCardPreviewState } from "$lib/shared/share/state/card-preview-state.svelte";
  import PostStudio from "$lib/shared/share/components/post-studio/PostStudio.svelte";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import {
    listSyncedPostProjects,
    loadSyncedPostDraft,
    resolveSyncedPostSequence,
    saveSyncedPostDraft,
  } from "./services/post-account-projects";
  import { savePostDraft } from "$lib/shared/media-composition/services/post-draft-storage";
  import type { PostProject } from "$lib/shared/media-composition/domain/post-project";
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import {
    createPostModuleState,
    featureSelectionId,
  } from "./state/post-module-state.svelte";
  import { setPostModuleContext } from "./context/post-module-context";
  import { canAccessPostStudio } from "$lib/shared/sequence-viewer/services/post-studio-access";
  import { providePostEditorHeader } from "$lib/shared/share/components/post-studio/editor/post-editor-header.svelte";

  interface Props {
    visible?: boolean;
  }
  let { visible = true }: Props = $props();
  const state = createPostModuleState({
    list: listSyncedPostProjects,
    resolve: resolveSyncedPostSequence,
    loadDraft: loadSyncedPostDraft,
    // Feature videos are folders the dev server reads. A production build
    // drops this branch, and the client with it.
    ...(import.meta.env.DEV
      ? {
          listFeatures: async () =>
            (
              await import(
                "$lib/shared/media-composition/services/feature-video-client"
              )
            ).listFeatureVideos(),
          loadFeature: async (slug: string) => {
            const client = await import(
              "$lib/shared/media-composition/services/feature-video-client"
            );
            return client.createFeatureVideoSync(
              await client.loadFeatureVideo(slug)
            );
          },
        }
      : {}),
  });
  setPostModuleContext(state);
  /** The editor puts Save, more actions and Export in this header row. */
  const editorHeader = providePostEditorHeader();
  const exportOptions = getExportOptionsState();
  const cardPreview = createCardPreviewState({
    getSequence: () => state.sequence,
    getEnabled: () => visible && !state.showingProjects,
    getDarkMode: () => exportOptions.imageDarkMode,
    getResolvedAutoLayout: () => null,
  });
  let previousParam: string | null = null;
  let previousFeature: string | null = null;
  let initialVisit = true;
  const currentWord = $derived(
    simplifyRepeatedWord(state.sequence?.word || "")
  );
  const currentTitle = $derived(
    state.feature?.title ??
      simplifyRepeatedWord(
        state.sequence?.displayName ||
          state.sequence?.name ||
          currentWord ||
          state.selectedId ||
          ""
      )
  );
  /**
   * A feature video opens on a dev server without Post's early access:
   * everything behind it exists only there, and the signed-out capture
   * browser must be able to open and render one.
   */
  const featureMode = $derived(
    import.meta.env.DEV &&
      (page.url.searchParams.has("feature") || state.feature !== null)
  );

  let previousAccount: string | null | undefined = undefined;
  $effect(() => {
    if (!authState.initialized) return;
    const uid = authState.user && !authState.user.isAnonymous ? authState.user.uid : null;
    if (previousAccount === uid) return;
    previousAccount = uid;
    initialVisit = true;
    previousParam = null;
    previousFeature = null;
    state.resetForAccount();
  });
  $effect(() => {
    if (!authState.initialized) return;
    authState.user?.uid;
    const project = page.url.searchParams.get("project");
    const feature = import.meta.env.DEV
      ? page.url.searchParams.get("feature")
      : null;
    if (initialVisit) {
      initialVisit = false;
      previousParam = project;
      previousFeature = feature;
      if (feature) void state.openFeature(feature);
      else {
        const target = project || state.lastSelectedId();
        if (target) void state.open(target);
      }
      return;
    }
    if (feature && feature !== previousFeature) void state.openFeature(feature);
    else if (project && project !== previousParam) void state.open(project);
    previousParam = project;
    previousFeature = feature;
  });

  function openProject(id: string): void {
    if (id === state.selectedId && !state.showingProjects) return;
    void goto(`/post?project=${encodeURIComponent(id)}`);
  }

  function openFeature(slug: string): void {
    if (featureSelectionId(slug) === state.selectedId && !state.showingProjects)
      return;
    void goto(`/post?feature=${encodeURIComponent(slug)}`);
  }

  function showProjects(): void {
    state.showProjects();
    void goto("/post", { replaceState: true });
  }

  /**
   * The account save for one sequence, bound when the editor opens: a copy
   * it still holds when another post opens saves with its own sequence.
   */
  function saveSyncedFor(sequence: SequenceData) {
    return (project: PostProject) => saveSyncedPostDraft(project, sequence);
  }
</script>

<section class="post-module" aria-label="Post">
  {#if !canAccessPostStudio() && !featureMode}
    <div class="editor-status" role="status">Post is in early access.</div>
  {:else}
    <div class="project-list" hidden={!state.showingProjects}>
      <header class="list-header">
        <h1>Projects</h1>
        <p>Open a saved post or choose Edit in Post from a sequence.</p>
      </header>
      {#if authState.user && !authState.user.isAnonymous}<p class="notice">Saved edits sync with your account. You need to select this device’s videos again on another device.</p>{/if}
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
            {@const projectWord = project.word || project.sequenceId}
            {@const showProjectWord = projectWord !== project.title}
            <li>
              <button
                type="button"
                aria-label={`Open ${project.title}`}
                onclick={() => openProject(project.sequenceId)}
              >
                <span class="project-mark"
                  ><i class="fas fa-clapperboard" aria-hidden="true"></i></span
                >
                <div class="project-info">
                  {#if isTkaWord(project.title)}
                    <TKAWordGlyph word={project.title} height={24} darkMode />
                  {:else}
                    <strong>{project.title}</strong>
                  {/if}
                  {#if showProjectWord || project.hasDraft}
                    <div class="project-details">
                      {#if showProjectWord}
                        {#if isTkaWord(projectWord)}
                          <TKAWordGlyph word={projectWord} height={14} darkMode />
                        {:else}
                          <span>{projectWord}</span>
                        {/if}
                      {/if}
                      {#if project.hasDraft}
                        <span>{showProjectWord ? "· " : ""}Saved draft</span>
                      {/if}
                    </div>
                  {/if}
                </div>
                <span class="project-date"
                  >{new Date(project.updatedAt).toLocaleDateString()}</span
                >
                <i class="fas fa-chevron-right" aria-hidden="true"></i>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
      {#if state.features.length || state.unreadableFeatures.length || state.featureError}
        <section class="feature-videos" aria-labelledby="feature-videos-title">
          <h2 id="feature-videos-title">Feature videos</h2>
          {#if state.featureError}<p class="notice" role="status">
              {state.featureError}
            </p>{/if}
          {#if state.unreadableFeatures.length}<p class="notice" role="status">
              Could not read the project.json in {state.unreadableFeatures.join(", ")}.
              Each folder's history keeps earlier copies.
            </p>{/if}
          {#if state.features.length}
            <ul>
              {#each state.features as video (video.slug)}
                <li>
                  <button
                    type="button"
                    aria-label={`Open ${video.title}`}
                    onclick={() => openFeature(video.slug)}
                  >
                    <span class="project-mark"
                      ><i class="fas fa-film" aria-hidden="true"></i></span
                    >
                    <div class="project-info">
                      <strong>{video.title}</strong>
                      <div class="project-details">
                        <span>{video.slug} · {video.sequenceId}</span>
                      </div>
                    </div>
                    <span class="project-date"
                      >{new Date(video.savedAt).toLocaleDateString()}</span
                    >
                    <i class="fas fa-chevron-right" aria-hidden="true"></i>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </section>
      {/if}
    </div>
    <div class="editor-host" hidden={state.showingProjects}>
      <div class="project-toolbar">
        <div class="toolbar-row">
          <button
            type="button"
            onclick={showProjects}
            aria-label="Back to projects"
            ><i class="fas fa-folder-open" aria-hidden="true"></i><span
              class="projects-label">Projects</span
            ></button
          >
          <div class="current-name" aria-label={currentTitle}>
            {#if isTkaWord(currentTitle)}
              <TKAWordGlyph word={currentTitle} height={20} darkMode />
            {:else}
              {currentTitle}
            {/if}
          </div>
          {#if editorHeader.actions && !state.loadingProject && state.sequence}{@render editorHeader.actions()}{/if}
        </div>
      </div>
      {#if state.loadingProject}<div class="editor-status" role="status">
          Opening post…
        </div>
      {:else if !state.sequence}<div class="editor-status error" role="alert">
          <p>{state.projectError || "This sequence could not be opened."}</p>
          <button type="button" onclick={() => void state.retry()}
            >Try again</button
          >
        </div>
      {:else}
        {#key `${authState.user && !authState.user.isAnonymous ? authState.user.uid : "guest"}:${state.feature ? featureSelectionId(state.feature.slug) : state.sequence.id}`}
          <PostStudio
            active={visible && !state.showingProjects}
            sequence={state.sequence}
            feature={state.feature ?? undefined}
            initialProject={state.feature ? state.feature.initialProject : (state.draft ?? undefined)}
            onSaveDraft={state.feature ? state.feature.save : authState.user && !authState.user.isAnonymous ? saveSyncedFor(state.sequence) : state.diskAvailable ? savePostDraft : undefined}
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
  .feature-videos {
    margin-top: 36px;
  }
  .feature-videos h2 {
    margin: 0;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--theme-stroke);
    font-size: 18px;
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
  .project-details {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .project-details,
  .project-date {
    color: var(--theme-text-secondary);
    font-size: 12px;
  }
  .project-details {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .project-details > span {
    flex-shrink: 0;
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
    container: post-editor-header / inline-size;
    border-bottom: 1px solid var(--theme-stroke);
  }
  .toolbar-row {
    display: flex;
    align-items: center;
    gap: 16px;
    min-height: 48px;
    padding: 2px 12px;
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
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--theme-text-secondary);
    font-size: 12px;
  }
  /* A narrow header keeps the folder; its name stays in the label. */
  @container post-editor-header (max-width: 30rem) {
    .toolbar-row {
      gap: 8px;
    }
    .project-toolbar button i {
      margin-right: 0;
    }
    .projects-label {
      display: none;
    }
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
