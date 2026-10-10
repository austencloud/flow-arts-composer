<script lang="ts">
  import StudioProjectLibrary from "./components/StudioProjectLibrary.svelte";
  import { goto } from "$app/navigation";
  import { page } from "$app/state";
  import {
    isTkaWord,
    simplifyRepeatedWord,
  } from "#lib/shared/foundation/utils/word-simplifier.js";
  import TKAWordGlyph from "#lib/shared/choreo-card/components/TKAWordGlyph.svelte";
  import { getExportOptionsState } from "#lib/shared/animation-panel/state/export-options-state.svelte.js";
  import { createCardPreviewState } from "#lib/shared/share/state/card-preview-state.svelte.js";
  import PostStudio from "#lib/shared/share/components/post-studio/PostStudio.svelte";
  import { authState } from "#lib/shared/auth/state/auth-state.svelte.js";
  import {
    listSyncedPostProjects,
    loadSyncedPostDraft,
    resolveSyncedPostSequence,
    saveSyncedPostDraft,
  } from "./services/post-account-projects";
  import { savePostDraft } from "#lib/shared/media-composition/services/post-draft-storage.js";
  import type { PostProject } from "#lib/shared/media-composition/domain/post-project.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import {
    createPostModuleState,
    featureSelectionId,
  } from "./state/post-module-state.svelte";
  import { setPostModuleContext } from "./context/post-module-context";
  import { canAccessPostStudio } from "#lib/shared/sequence-viewer/services/post-studio-access.js";
  import { providePostEditorHeader } from "#lib/shared/share/components/post-studio/editor/post-editor-header.svelte.js";

  interface Props {
    visible?: boolean;
  }
  let { visible = true }: Props = $props();
  const moduleState = createPostModuleState({
    list: listSyncedPostProjects,
    resolve: resolveSyncedPostSequence,
    loadDraft: loadSyncedPostDraft,
    // Feature videos are folders the dev server reads. A production build
    // drops this branch, and the client with it.
    ...(import.meta.env.DEV
      ? {
          listFeatures: async () =>
            (
              await import("#lib/shared/media-composition/services/feature-video-client.js")
            ).listFeatureVideos(),
          loadFeature: async (slug: string) => {
            const client =
              await import("#lib/shared/media-composition/services/feature-video-client.js");
            return client.createFeatureVideoSync(
              await client.loadFeatureVideo(slug)
            );
          },
        }
      : {}),
  });
  setPostModuleContext(moduleState);
  /** The editor puts Save, more actions and Export in this header row. */
  const editorHeader = providePostEditorHeader();
  const exportOptions = getExportOptionsState();
  const cardPreview = createCardPreviewState({
    getSequence: () => moduleState.sequence,
    getEnabled: () => visible && !moduleState.showingProjects,
    getDarkMode: () => exportOptions.imageDarkMode,
    getResolvedAutoLayout: () => null,
  });
  let previousParam: string | null = null;
  let previousFeature: string | null = null;
  let initialVisit = true;
  let footageToImport = $state.raw<{ projectId: string; file: File } | null>(
    null
  );
  const currentWord = $derived(
    simplifyRepeatedWord(moduleState.sequence?.word || "")
  );
  const currentTitle = $derived(
    moduleState.feature?.title ??
      moduleState.draft?.title ??
      simplifyRepeatedWord(
        moduleState.sequence?.displayName ||
          moduleState.sequence?.name ||
          currentWord ||
          moduleState.selectedId ||
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
      (page.url.searchParams.has("feature") || moduleState.feature !== null)
  );

  let previousAccount: string | null | undefined = undefined;
  $effect(() => {
    if (!authState.initialized) return;
    const uid =
      authState.user && !authState.user.isAnonymous ? authState.user.uid : null;
    if (previousAccount === uid) return;
    previousAccount = uid;
    initialVisit = true;
    previousParam = null;
    previousFeature = null;
    footageToImport = null;
    moduleState.resetForAccount();
  });
  $effect(() => {
    if (!authState.initialized) return;
    authState.user?.uid;
    const project = page.url.searchParams.get("project");
    const library = page.url.searchParams.get("library") === "1";
    const feature = import.meta.env.DEV
      ? page.url.searchParams.get("feature")
      : null;
    if (initialVisit) {
      initialVisit = false;
      previousParam = project;
      previousFeature = feature;
      if (feature) void moduleState.openFeature(feature);
      else {
        const target = project || (!library && moduleState.lastSelectedId());
        if (target) void moduleState.open(target);
      }
      return;
    }
    if (library) moduleState.showProjects();
    else if (feature && feature !== previousFeature)
      void moduleState.openFeature(feature);
    else if (project && project !== previousParam)
      void moduleState.open(project);
    previousParam = project;
    previousFeature = feature;
  });

  function openProject(id: string, footage?: File): void {
    if (id === moduleState.selectedId && !moduleState.showingProjects) return;
    footageToImport = footage ? { projectId: id, file: footage } : null;
    void goto(`/post?project=${encodeURIComponent(id)}`);
  }

  function openFeature(slug: string): void {
    if (
      featureSelectionId(slug) === moduleState.selectedId &&
      !moduleState.showingProjects
    )
      return;
    void goto(`/post?feature=${encodeURIComponent(slug)}`);
  }

  function showProjects(): void {
    moduleState.showProjects();
    void goto("/post", { replace: true });
  }

  /**
   * The account save for one sequence, bound when the editor opens: a copy
   * it still holds when another post opens saves with its own sequence.
   */
  function saveSyncedFor(sequence: SequenceData | null) {
    return (project: PostProject) => saveSyncedPostDraft(project, sequence);
  }
</script>

<section class="post-module" aria-label="Studio">
  {#if !canAccessPostStudio() && !featureMode}
    <div class="editor-status" role="status">Studio is in early access.</div>
  {:else}
    <div class="project-list" hidden={!moduleState.showingProjects}>
      {#if moduleState.showingProjects}
        {#key authState.user?.uid ?? "guest"}
          <StudioProjectLibrary
            projects={moduleState.projects}
            features={moduleState.features}
            loading={moduleState.loadingCatalog}
            error={moduleState.catalogError}
            featureError={moduleState.featureError}
            unreadableFeatures={moduleState.unreadableFeatures}
            onopen={openProject}
            onfeature={openFeature}
            onrefresh={() => void moduleState.refreshProjects()}
          />
        {/key}
      {/if}
    </div>
    <div class="editor-host" hidden={moduleState.showingProjects}>
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
          {#if editorHeader.actions && !moduleState.loadingProject && moduleState.editorReady}{@render editorHeader.actions()}{/if}
        </div>
      </div>
      {#if moduleState.loadingProject}<div class="editor-status" role="status">
          Opening project…
        </div>
      {:else if !moduleState.editorReady}<div
          class="editor-status error"
          role="alert"
        >
          <p>
            {moduleState.projectError || "This project could not be opened."}
          </p>
          <button type="button" onclick={() => void moduleState.retry()}
            >Try again</button
          >
        </div>
      {:else}
        {#key `${authState.user && !authState.user.isAnonymous ? authState.user.uid : "guest"}:${moduleState.selectedId}`}
          <PostStudio
            editArrangementOnOpen={!!moduleState.selectedId?.startsWith(
              "studio-arrangement:"
            )}
            active={visible && !moduleState.showingProjects}
            sequence={moduleState.sequence}
            initialFootage={footageToImport?.projectId ===
            moduleState.selectedId
              ? footageToImport.file
              : null}
            feature={moduleState.feature ?? undefined}
            initialProject={moduleState.feature
              ? moduleState.feature.initialProject
              : (moduleState.draft ?? undefined)}
            onSaveDraft={moduleState.feature
              ? moduleState.feature.save
              : authState.user && !authState.user.isAnonymous
                ? saveSyncedFor(moduleState.sequence)
                : moduleState.diskAvailable
                  ? savePostDraft
                  : undefined}
            draftLoadError={moduleState.projectError}
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
    height: 100%;
    overflow-y: auto;
  }
  .post-module [hidden] {
    display: none;
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
</style>
