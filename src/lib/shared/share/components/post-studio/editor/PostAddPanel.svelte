<script lang="ts">
  import { useStrings } from "@austencloud/video-editor/strings";
  import type {
    PostItemKind,
    PostTextSize,
    NewOverlaySpec,
  } from "@austencloud/video-editor/core";
  import type {
    LibraryTake,
    PluginAddItem,
    VideoEditorPlugin,
    VideoEditorState,
  } from "@austencloud/video-editor";
  import { Icon, faCloud } from "@austencloud/video-editor/icons";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import {
    formatPostClock,
    ITEM_KIND_ICON,
    itemKindLabel,
    translateKey,
    newItemStart,
    overlayAt,
  } from "@austencloud/video-editor/ui";

  const t = useStrings();

  /**
   * Everything a post can hold, one button each. Videos join the end of the
   * main track; the rest start at the playhead.
   */
  interface Props {
    editor: VideoEditorState;
    plugin: VideoEditorPlugin | null;
    catalog: readonly LibraryTake[];
    /** A picked file is being read. */
    busy?: boolean;
    onAddDeviceVideo: () => void;
    /** Runs once the new item is in and selected. */
    onAdded: (kind: PostItemKind) => void;
  }

  let {
    editor,
    plugin,
    catalog,
    busy = false,
    onAddDeviceVideo,
    onAdded,
  }: Props = $props();

  /** Catalog videos the post does not use yet. */
  const savedVideos = $derived(
    catalog.filter(
      (video) =>
        !editor.takes.some(
          (take) => take.ref.kind === "catalog" && take.ref.videoId === video.id
        )
    )
  );

  function addOverlay(spec: Omit<NewOverlaySpec, "at" | "fill">): void {
    editor.pause();
    const at = newItemStart(editor.durationSeconds, editor.previewSeconds);
    if (editor.addOverlay(overlayAt(editor.project, spec, at))) {
      onAdded(spec.kind);
    }
  }

  function addSavedVideo(video: LibraryTake): void {
    editor.pause();
    if (
      editor.addLibraryVideo({
        videoId: video.id,
        label: video.label,
        url: video.url,
        durationSeconds: video.durationSeconds,
      })
    )
      onAdded("video");
  }

  function addCard(): void {
    editor.pause();
    if (editor.addCard()) onAdded("card");
  }

  const TEXT_SIZE: PostTextSize = "m";

  /** One button: a core entry holds its icon, a plugin's brings its own. */
  interface AddEntry {
    id: string;
    icon: PluginAddItem["icon"];
    label: string;
    run: () => void;
  }

  const CORE_ITEMS = ["text", "card"];
  const coreItem = (id: string): AddEntry =>
    id === "text"
      ? {
          id,
          icon: ITEM_KIND_ICON.text,
          label: itemKindLabel(t, "text"),
          run: () =>
            addOverlay({
              kind: "text",
              text: t("post_editor_text_placeholder"),
              size: TEXT_SIZE,
            }),
        }
      : {
          id,
          icon: ITEM_KIND_ICON.card,
          label: t("post_editor_add_card_end"),
          run: addCard,
        };
  const ITEMS = $derived(
    (plugin?.ui?.addItems?.(CORE_ITEMS) ?? CORE_ITEMS).flatMap(
      (entry): AddEntry[] =>
        typeof entry === "string"
          ? [coreItem(entry)]
          : entry.available(editor)
            ? [
                {
                  id: entry.id,
                  icon: entry.icon,
                  label: entry.label(translateKey(t)),
                  run: () => {
                    editor.pause();
                    const kind = entry.add(editor);
                    if (kind) onAdded(kind as PostItemKind);
                  },
                },
              ]
            : []
    )
  );
</script>

<div class="add-panel">
  <div class="grid">
    <PanelButton
      onclick={onAddDeviceVideo}
      disabled={busy}
      ariaBusy={busy}
      fullWidth
    >
      <Icon icon={ITEM_KIND_ICON.video} />
      {busy
        ? t("share_studio_reading_video")
        : t("post_editor_add_video_device")}
    </PanelButton>
    {#each savedVideos as video (video.id)}
      <PanelButton
        onclick={() => addSavedVideo(video)}
        ariaLabel={`${t("share_studio_add")} ${video.label}`}
        fullWidth
      >
        <Icon icon={faCloud} />
        <span class="saved">
          <span class="saved-name">{video.label}</span>
          <span class="saved-meta">
            {t("post_editor_saved_video")} &middot; {formatPostClock(
              video.durationSeconds
            )}
          </span>
        </span>
      </PanelButton>
    {/each}
    {#each ITEMS as item (item.id)}
      <PanelButton onclick={item.run} fullWidth>
        <Icon icon={item.icon} />
        {item.label}
      </PanelButton>
    {/each}
  </div>
</div>

<style>
  .add-panel {
    min-width: 0;
  }

  /* Two across when the panel is wide enough, one per line otherwise. */
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 10rem), 1fr));
    gap: 0.5rem;
  }

  .saved {
    display: grid;
    min-width: 0;
  }

  .saved-name,
  .saved-meta {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .saved-meta {
    color: var(--ve-theme-text-secondary, #aaa);
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
  }
</style>
