<script lang="ts">
  import type { SequenceData } from "$lib/shared/foundation/domain/models/sequence-data";
  import type { ResolvedAutoLayout } from "$lib/shared/render/services/container-aware-layout";
  import { getExportOptionsState } from "$lib/shared/animation-panel/state/export-options-state.svelte";
  import { createCardPreviewState } from "$lib/shared/share/state/card-preview-state.svelte";
  import PostStudio from "$lib/shared/share/components/post-studio/PostStudio.svelte";
  import type { PostStudioShareExport } from "$lib/shared/share/components/post-studio/post-studio-share-export";
  import type { PostProject } from "$lib/shared/media-composition/domain/post-project";
  import { authState } from "$lib/shared/auth/state/auth-state.svelte";
  import { savePostDraft } from "$lib/shared/media-composition/services/post-draft-storage";
  import { loadSyncedPostDraft, saveSyncedPostDraft } from "$lib/features/post/services/post-account-projects";

  /**
   * Post Studio as a sequence-viewer surface.
   *
   * Thin by design: it resolves the one thing the studio cannot get for itself
   * — the rendered choreo card — and hands the finished MP4 back to the shell
   * so the share sheet can post it. Everything else (header, close, going back
   * via the content rail) belongs to the viewer shell, which is the whole
   * reason this stopped being a full-screen modal inside the share sheet.
   */
  interface Props {
    active?: boolean;
    sequence: SequenceData;
    resolvedCardAutoLayout: ResolvedAutoLayout | null;
    /** Hands the rendered post to the shell's share-video seam. */
    onExported: (blob: Blob) => void;
    /** Opens the shell's share sheet on the render just handed over. */
    onSharePost: () => void;
    previewTarget?: HTMLElement | null;
    onRegisterShareExport?: (controls: PostStudioShareExport | null) => void;
    /** The shell's share panel is open beside or under the studio. */
    sharing?: boolean;
  }

  let {
    active = true,
    sequence,
    resolvedCardAutoLayout,
    onExported,
    onSharePost,
    previewTarget = null,
    onRegisterShareExport,
    sharing = false,
  }: Props = $props();

  const exportOptions = getExportOptionsState();

  // Same dark-mode source the on-screen card preview uses, so the card baked
  // into the post matches the card the user was just looking at.
  const cardPreview = createCardPreviewState({
    getSequence: () => sequence,
    getEnabled: () => true,
    getDarkMode: () => exportOptions.imageDarkMode,
    getResolvedAutoLayout: () => resolvedCardAutoLayout,
  });

  let draft = $state<{
    sequenceId: string;
    project: PostProject | null;
    diskAvailable: boolean;
    error: string | null;
  } | null>(null);

  $effect(() => {
    const sequenceId = sequence.id;
    authState.user?.uid;
    let current = true;
    draft = null;
    void loadSyncedPostDraft(sequenceId)
      .then((loaded) => {
        if (current) draft = { sequenceId, ...loaded };
      })
      .catch((cause: unknown) => {
        if (current) draft = {
          sequenceId,
          project: null,
          diskAvailable: false,
          error: cause instanceof Error ? cause.message : "The saved post could not be opened.",
        };
      });
    return () => {
      current = false;
    };
  });
</script>

<div class="post-studio-pane">
  {#if draft?.sequenceId === sequence.id}
    {#key `${authState.user && !authState.user.isAnonymous ? authState.user.uid : "guest"}:${sequence.id}`}
    <PostStudio
      {active}
      {sequence}
      initialProject={draft.project ?? undefined}
      onSaveDraft={authState.user && !authState.user.isAnonymous ? (project) => saveSyncedPostDraft(project, sequence) : draft.diskAvailable ? savePostDraft : undefined}
      draftLoadError={draft.error}
      cardPreviewUrl={cardPreview.url}
      cardRenderOptions={cardPreview.renderOptions}
      {resolvedCardAutoLayout}
      animationPreviewUrl={null}
      isPreparingCard={cardPreview.isPreparing}
      isPreparingAnimation={false}
      onRequestAnimation={() => undefined}
      {onExported}
      {onSharePost}
      {previewTarget}
      {onRegisterShareExport}
      {sharing}
    />
    {/key}
  {:else}
    <div class="draft-loading" role="status">Loading saved post…</div>
  {/if}
</div>

<style>
  .post-studio-pane {
    height: 100%;
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .draft-loading {
    display: flex;
    flex: 1;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary, #a3a3a3);
  }
</style>
