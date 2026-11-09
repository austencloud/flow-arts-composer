<script lang="ts">
  import LandscapeFooterControls from "./LandscapeFooterControls.svelte";
  import MidFooterControls from "./MidFooterControls.svelte";
  import DesktopFooterControls from "./DesktopFooterControls.svelte";

  interface Props {
    controlsVisible?: boolean;
    landscape?: boolean;
    practiceActive?: boolean;
    onSave: () => void;
    onEdit: () => void;
    onExportVideo?: () => void;
    onExportImage?: () => void;
    onPracticeStart?: () => void;
    onPracticeStop?: () => void;
    isOwned?: boolean;
    onDeleteRequest?: () => void;
    onVideoUpload?: () => void;
    videoCount?: number;
    isSaved?: boolean;
    isPublished?: boolean;
    isFavorite?: boolean;
    onFavorite?: () => void;
    onPublish?: () => void;
    onUnpublish?: () => void;
    onCopyLink?: () => void;
    linkCopied?: boolean;
  }

  let {
    controlsVisible = true,
    landscape = false,
    practiceActive = false,
    onSave,
    onEdit,
    onExportVideo,
    onExportImage,
    onPracticeStart,
    onPracticeStop,
    isOwned = false,
    onDeleteRequest,
    onVideoUpload,
    videoCount,
    isSaved = true,
    isPublished = true,
    isFavorite = false,
    onFavorite,
    onPublish,
    onUnpublish,
    onCopyLink,
    linkCopied = false,
  }: Props = $props();

  type FooterLayout = "mid" | "desktop";
  let layout = $state<FooterLayout>("mid");
  let footerEl: HTMLElement | null = $state(null);

  $effect(() => {
    if (!footerEl) return;

    const selectLayout = () => {
      const minDesktopWidth = 960;
      layout = footerEl!.clientWidth >= minDesktopWidth ? "desktop" : "mid";
    };

    const observer = new ResizeObserver(() => selectLayout());
    observer.observe(footerEl);
    selectLayout();

    return () => observer.disconnect();
  });
</script>

{#if landscape}
  <LandscapeFooterControls
    {practiceActive}
    {onSave}
    {onEdit}
    {onPracticeStart}
    {onPracticeStop}
    {isOwned}
    {onDeleteRequest}
    {onVideoUpload}
    {videoCount}
    {isSaved}
    {isPublished}
    {isFavorite}
    {onFavorite}
    {onPublish}
    {onUnpublish}
  />
{:else}
<footer
  bind:this={footerEl}
  class="viewer-footer"
  data-controls-visible={controlsVisible}
>
  {#if layout === "mid"}
    <MidFooterControls
      {practiceActive}
      {onSave}
      {onEdit}
      {onPracticeStart}
      {onPracticeStop}
      {isOwned}
      {onDeleteRequest}
      {onVideoUpload}
      {videoCount}
      {isSaved}
      {isPublished}
      {isFavorite}
      {onFavorite}
      {onPublish}
      {onUnpublish}
      {onCopyLink}
      {linkCopied}
    />
  {:else}
    <DesktopFooterControls
      {practiceActive}
      {onSave}
      {onEdit}
      {onExportVideo}
      {onExportImage}
      {onPracticeStart}
      {onPracticeStop}
      {isOwned}
      {onDeleteRequest}
      {onVideoUpload}
      {videoCount}
      {isSaved}
      {isPublished}
      {isFavorite}
      {onFavorite}
      {onPublish}
      {onUnpublish}
      {onCopyLink}
      {linkCopied}
    />
  {/if}
</footer>
{/if}

<style>
  .viewer-footer {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 8px;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.04));
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.1));
    flex-shrink: 0;
  }
</style>
