<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import { DropdownMenu } from "bits-ui";
  import type { HTMLButtonAttributes } from "svelte/elements";
  import {
    POST_DEFAULT_OVERLAY_SECONDS,
    POST_MIN_ITEM_SECONDS,
    mainItemAt,
  } from "$lib/shared/media-composition/domain/post-project";
  import type { NewOverlaySpec } from "$lib/shared/media-composition/domain/post-project-edits";
  import type {
    CatalogTakeSource,
    PostEditorState,
  } from "$lib/shared/media-composition/state/post-editor-state.svelte";
  import { formatPostClock } from "../builder/post-builder-format";
  import { ITEM_KIND_ICON, MANDALA_ICON, itemKindLabel } from "./post-editor-labels";

  /**
   * Everything a post can hold. Videos join the end of the main track; the
   * rest start at the playhead, and the sequence views fill the clip there
   * so they follow it when it moves.
   */
  interface Props {
    editor: PostEditorState;
    catalog: readonly CatalogTakeSource[];
    disabled?: boolean;
    onAddDeviceVideo: () => void;
  }

  let { editor, catalog, disabled = false, onAddDeviceVideo }: Props = $props();

  let open = $state(false);

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

  function asButtonAttributes(props: unknown): HTMLButtonAttributes {
    return props as HTMLButtonAttributes;
  }

  /** At the end of the post, a new item starts early enough to be seen. */
  function startTime(): number {
    const end = editor.durationSeconds;
    const at = editor.previewSeconds;
    return end > 0 && at >= end - POST_MIN_ITEM_SECONDS
      ? Math.max(0, end - POST_DEFAULT_OVERLAY_SECONDS)
      : at;
  }

  function addOverlay(spec: Omit<NewOverlaySpec, "at">): void {
    const at = startTime();
    const underClip = mainItemAt(editor.project, at) !== null;
    const sequenceView =
      spec.kind === "animation" ||
      spec.kind === "moves" ||
      spec.kind === "carousel";
    editor.pause();
    editor.addOverlay({ ...spec, at, fill: sequenceView && underClip });
  }

  const ITEMS = $derived([
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
          size: "m",
        }),
    },
    {
      id: "card",
      icon: ITEM_KIND_ICON.card,
      label: t("post_editor_add_card_end"),
      run: () => {
        editor.pause();
        editor.addCard();
      },
    },
  ]);
</script>

<DropdownMenu.Root bind:open>
  <DropdownMenu.Trigger {disabled}>
    {#snippet child({ props })}
      <button
        {...asButtonAttributes(props)}
        type="button"
        class="post-editor-tool"
        aria-label={t("post_editor_add")}
        title={t("post_editor_add")}
      >
        <i class="fa-solid fa-plus" aria-hidden="true"></i>
        <span class="post-editor-tool-label">{t("post_editor_add")}</span>
      </button>
    {/snippet}
  </DropdownMenu.Trigger>

  <DropdownMenu.Portal>
    <DropdownMenu.Content
      side="bottom"
      align="start"
      sideOffset={8}
      collisionPadding={12}
      class="post-editor-menu"
      aria-label={t("post_editor_add")}
    >
      <DropdownMenu.Item
        class="post-editor-menu-item"
        textValue={t("post_editor_add_video_device")}
        onSelect={onAddDeviceVideo}
      >
        <i class="fa-solid {ITEM_KIND_ICON.video}" aria-hidden="true"></i>
        <span>{t("post_editor_add_video_device")}</span>
      </DropdownMenu.Item>
      {#each savedVideos as video (video.videoId)}
        <DropdownMenu.Item
          class="post-editor-menu-item"
          textValue={video.label}
          onSelect={() => {
            editor.pause();
            editor.addCatalogVideo(video);
          }}
        >
          <i class="fa-solid fa-cloud" aria-hidden="true"></i>
          <span class="item-text">
            <span class="item-name">{video.label}</span>
            <span class="item-meta">
              {t("post_editor_saved_video")} · {formatPostClock(
                video.durationSeconds
              )}
            </span>
          </span>
        </DropdownMenu.Item>
      {/each}
      <DropdownMenu.Separator class="post-editor-menu-separator" />
      {#each ITEMS as item (item.id)}
        <DropdownMenu.Item
          class="post-editor-menu-item"
          textValue={item.label}
          onSelect={item.run}
        >
          <i class="fa-solid {item.icon}" aria-hidden="true"></i>
          <span>{item.label}</span>
        </DropdownMenu.Item>
      {/each}
    </DropdownMenu.Content>
  </DropdownMenu.Portal>
</DropdownMenu.Root>

<style>
  :global(.post-editor-menu) {
    z-index: var(--z-dropdown);
    width: 17rem;
    max-width: calc(100vw - 24px);
    max-height: min(70dvh, 32rem);
    overflow-y: auto;
    padding: 4px;
    border: 1px solid var(--theme-stroke-strong);
    border-radius: var(--radius-md, 12px);
    background: var(--theme-panel-bg);
    box-shadow:
      0 8px 24px var(--theme-shadow),
      0 2px 8px var(--theme-shadow);
    outline: none;
  }

  :global(.post-editor-menu-item) {
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    padding: 0.375rem 12px;
    border-radius: var(--radius-sm, 8px);
    color: var(--theme-text);
    cursor: pointer;
    font-size: var(--font-size-min, 14px);
    font-weight: 500;
    outline: none;
    user-select: none;
  }

  :global(.post-editor-menu-item[data-highlighted]) {
    background: var(--theme-card-hover-bg);
  }

  :global(.post-editor-menu-item i) {
    width: 20px;
    flex: 0 0 20px;
    color: var(--theme-accent);
    font-size: var(--font-size-sm);
    text-align: center;
  }

  .item-text {
    display: grid;
    min-width: 0;
  }

  .item-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-meta {
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
  }

  :global(.post-editor-menu-separator) {
    height: 1px;
    margin: 4px 8px;
    background: var(--theme-stroke);
  }

  @media (forced-colors: active) {
    :global(.post-editor-menu-item[data-highlighted]) {
      background: Highlight;
      color: HighlightText;
    }
  }
</style>
