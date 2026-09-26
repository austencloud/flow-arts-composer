<script lang="ts">
  import type { Snippet } from "svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type {
    CatalogTakeSource,
    PostEditorState,
  } from "$lib/shared/media-composition/state/post-editor-state.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { formatPostClock } from "../builder/post-builder-format";
  import PostMediaPanel from "./PostMediaPanel.svelte";

  /**
   * What the inspector shows with nothing selected: the raw videos, the
   * Tutorial preset, the prop's look and the export.
   */
  interface Props {
    editor: PostEditorState;
    catalog: readonly CatalogTakeSource[];
    catalogLoading?: boolean;
    catalogError?: string;
    /** A picked file is being read. */
    busy?: boolean;
    onAddDeviceVideo: () => void;
    onTapBeats: (takeId: string) => void;
    onTutorial: () => void;
    lookOpen: boolean;
    onLookToggle: () => void;
    look: Snippet;
    output: Snippet;
  }

  let {
    editor,
    catalog,
    catalogLoading = false,
    catalogError = "",
    busy = false,
    onAddDeviceVideo,
    onTapBeats,
    onTutorial,
    lookOpen,
    onLookToggle,
    look,
    output,
  }: Props = $props();

  const id = $props.id();

  const clipCount = $derived(
    editor.project.tracks.reduce((count, track) => count + track.items.length, 0)
  );
</script>

<div class="post-settings">
  <header class="head">
    <i class="fa-solid fa-clapperboard kind-icon" aria-hidden="true"></i>
    <div class="head-text">
      <h3 class="title">{t("post_editor_post")}</h3>
      <p class="meta">
        {formatPostClock(editor.durationSeconds)} ·
        {clipCount === 1
          ? t("post_editor_one_item")
          : t("post_editor_item_count", { count: clipCount })}
      </p>
    </div>
  </header>
  {#if clipCount > 0}
    <p class="hint">{t("post_editor_select_hint")}</p>
  {/if}

  <section class="group" aria-labelledby="{id}-videos">
    <h3 id="{id}-videos">{t("post_editor_videos")}</h3>
    <PostMediaPanel
      {editor}
      {catalog}
      {catalogLoading}
      {catalogError}
      {busy}
      {onAddDeviceVideo}
      {onTapBeats}
    />
  </section>

  <section class="group" aria-labelledby="{id}-tutorial">
    <h3 id="{id}-tutorial">{t("post_editor_tutorial")}</h3>
    <p class="hint">{t("post_editor_tutorial_hint")}</p>
    <div class="row">
      <PanelButton onclick={onTutorial} disabled={editor.takes.length === 0}>
        <i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>
        {t("post_editor_apply_tutorial")}
      </PanelButton>
    </div>
  </section>

  <section class="group">
    <div class="row">
      <PanelButton
        onclick={onLookToggle}
        ariaExpanded={lookOpen}
        ariaControls="{id}-look"
      >
        <i
          class="fa-solid fa-chevron-right chevron"
          class:open={lookOpen}
          aria-hidden="true"
        ></i>
        {t("share_studio_look")}
      </PanelButton>
    </div>
    <div id="{id}-look" class="look" hidden={!lookOpen}>
      {#if lookOpen}
        {@render look()}
      {/if}
    </div>
  </section>

  <section class="group" aria-labelledby="{id}-export">
    <h3 id="{id}-export">{t("post_editor_export")}</h3>
    {@render output()}
  </section>
</div>

<style>
  .post-settings,
  .group {
    display: grid;
    gap: 0.625rem;
    min-width: 0;
  }

  .post-settings {
    gap: 1.125rem;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    min-width: 0;
  }

  .kind-icon {
    display: grid;
    place-items: center;
    width: 2.25rem;
    height: 2.25rem;
    flex: none;
    border-radius: 0.5rem;
    color: var(--theme-accent, #d4813a);
    background: color-mix(in srgb, var(--theme-accent, #d4813a) 14%, transparent);
  }

  .head-text {
    display: grid;
    gap: 0.125rem;
    min-width: 0;
  }

  h3 {
    margin: 0;
    color: var(--theme-text, #fff);
    font-size: 0.9375rem;
  }

  .title {
    font-size: 1rem;
  }

  .meta,
  .hint {
    margin: 0;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.8125rem;
    line-height: 1.4;
  }

  .meta {
    font-variant-numeric: tabular-nums;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .chevron {
    transition: transform var(--transition-normal);
  }

  .chevron.open {
    transform: rotate(90deg);
  }

  .look {
    min-width: 0;
  }

  @media (prefers-reduced-motion: reduce) {
    .chevron {
      transition: none;
    }
  }
</style>
