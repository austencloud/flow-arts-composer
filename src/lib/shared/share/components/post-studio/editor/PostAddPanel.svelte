<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type {
    PostItemKind,
    PostTextSize,
  } from "#lib/shared/media-composition/domain/post-project.js";
  import type { NewOverlaySpec } from "#lib/shared/media-composition/domain/post-project-edits.js";
  import type {
    CatalogTakeSource,
    PostEditorState,
  } from "#lib/shared/media-composition/state/post-editor-state.svelte.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { formatPostClock } from "../builder/post-builder-format";
  import {
    ITEM_KIND_ICON,
    MANDALA_ICON,
    itemKindLabel,
  } from "./post-editor-labels";
  import { newItemStart, overlayAt } from "./post-editor-add";
  import { createBlankArrangementSnapshot } from "./post-editor-arrangement";

  /**
   * Everything a post can hold, one button each. Videos join the end of the
   * main track; the rest start at the playhead.
   */
  interface Props {
    editor: PostEditorState;
    catalog: readonly CatalogTakeSource[];
    hasSequence?: boolean;
    /** A picked file is being read. */
    busy?: boolean;
    onAddDeviceVideo: () => void;
    /** Runs once the new item is in and selected. */
    onAdded: (kind: PostItemKind) => void;
  }

  let {
    editor,
    catalog,
    hasSequence = true,
    busy = false,
    onAddDeviceVideo,
    onAdded,
  }: Props = $props();

  /** Catalog videos the post does not use yet. */
  const savedVideos = $derived(
    catalog.filter(
      (video) =>
        !editor.takes.some(
          (take) =>
            take.ref.kind === "catalog" && take.ref.videoId === video.videoId
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

  function addSavedVideo(video: CatalogTakeSource): void {
    editor.pause();
    if (editor.addCatalogVideo(video)) onAdded("video");
  }

  function addTitles(): void {
    editor.pause();
    const at = newItemStart(editor.durationSeconds, editor.previewSeconds);
    if (editor.addTitles(at)) onAdded("titles");
  }

  function addCard(): void {
    editor.pause();
    if (editor.addCard()) onAdded("card");
  }

  function addArrangement(): void {
    editor.pause();
    if (
      editor.addArrangement(
        createBlankArrangementSnapshot(),
        newItemStart(editor.durationSeconds, editor.previewSeconds)
      )
    ) {
      onAdded("arrangement");
    }
  }

  function addTunnelHook(): void {
    editor.pause();
    if (editor.addTunnelHook()) onAdded("animation");
  }

  function removeTunnelHook(): void {
    editor.pause();
    editor.removeTunnelHook();
  }

  const TEXT_SIZE: PostTextSize = "m";

  const ITEMS = $derived([
    {
      id: "arrangement",
      icon: ITEM_KIND_ICON.arrangement,
      label: "Arrangement",
      run: addArrangement,
    },
    {
      id: "animation",
      icon: ITEM_KIND_ICON.animation,
      label: itemKindLabel("animation"),
      run: () => addOverlay({ kind: "animation", overlay: true }),
    },
    {
      id: "moves",
      icon: ITEM_KIND_ICON.moves,
      label: itemKindLabel("moves", "arrows"),
      run: () => addOverlay({ kind: "moves", mode: "arrows" }),
    },
    {
      id: "mandala",
      icon: MANDALA_ICON,
      label: itemKindLabel("moves", "mandala"),
      run: () => addOverlay({ kind: "moves", mode: "mandala" }),
    },
    {
      id: "carousel",
      icon: ITEM_KIND_ICON.carousel,
      label: itemKindLabel("carousel"),
      run: () => addOverlay({ kind: "carousel" }),
    },
    {
      id: "text",
      icon: ITEM_KIND_ICON.text,
      label: itemKindLabel("text"),
      run: () =>
        addOverlay({
          kind: "text",
          text: t("post_editor_text_placeholder"),
          size: TEXT_SIZE,
        }),
    },
    {
      id: "titles",
      icon: ITEM_KIND_ICON.titles,
      label: itemKindLabel("titles"),
      run: addTitles,
    },
    {
      id: "card",
      icon: ITEM_KIND_ICON.card,
      label: t("post_editor_add_card_end"),
      run: addCard,
    },
    editor.tunnelHook
      ? {
          id: "tunnel-hook",
          icon: "fa-xmark",
          label: t("post_editor_remove_tunnel_hook"),
          run: removeTunnelHook,
        }
      : {
          id: "tunnel-hook",
          icon: "fa-circle-nodes",
          label: t("post_editor_add_tunnel_hook"),
          run: addTunnelHook,
        },
  ]);
</script>

<div class="add-panel">
  <div class="grid">
    <PanelButton
      onclick={onAddDeviceVideo}
      disabled={busy}
      ariaBusy={busy}
      fullWidth
    >
      <i class="fa-solid {ITEM_KIND_ICON.video}" aria-hidden="true"></i>
      {busy
        ? t("share_studio_reading_video")
        : t("post_editor_add_video_device")}
    </PanelButton>
    {#each savedVideos as video (video.videoId)}
      <PanelButton
        onclick={() => addSavedVideo(video)}
        ariaLabel={`${t("share_studio_add")} ${video.label}`}
        fullWidth
      >
        <i class="fa-solid fa-cloud" aria-hidden="true"></i>
        <span class="saved">
          <span class="saved-name">{video.label}</span>
          <span class="saved-meta">
            {t("post_editor_saved_video")} · {formatPostClock(
              video.durationSeconds
            )}
          </span>
        </span>
      </PanelButton>
    {/each}
    {#each ITEMS.filter((item) => hasSequence || ["arrangement", "text"].includes(item.id)) as item (item.id)}
      <PanelButton onclick={item.run} fullWidth>
        <i class="fa-solid {item.icon}" aria-hidden="true"></i>
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
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
  }
</style>
