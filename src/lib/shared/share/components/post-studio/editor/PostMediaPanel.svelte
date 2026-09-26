<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type { PostTake } from "$lib/shared/media-composition/domain/post-plan";
  import type {
    CatalogTakeSource,
    PostEditorState,
  } from "$lib/shared/media-composition/state/post-editor-state.svelte";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { formatPostClock } from "../builder/post-builder-format";
  import { readVideoFile, videoFileError } from "./post-editor-files";

  /**
   * The raw videos the post cuts from. One recording can hold both the run
   * through and the slow version: cut it into two clips on the timeline.
   * Each video's beats are tapped once and every clip cut from it uses them.
   */
  interface Props {
    editor: PostEditorState;
    catalog: readonly CatalogTakeSource[];
    catalogLoading?: boolean;
    catalogError?: string;
    busy?: boolean;
    onAddDeviceVideo: () => void;
    onTapBeats: (takeId: string) => void;
  }

  let {
    editor,
    catalog,
    catalogLoading = false,
    catalogError = "",
    busy = false,
    onAddDeviceVideo,
    onTapBeats,
  }: Props = $props();

  let relinkInput = $state<HTMLInputElement | null>(null);
  let relinkTakeId = $state<string | null>(null);
  let error = $state("");

  const takes = $derived(editor.takes);
  const unused = $derived(
    catalog.filter(
      (video) =>
        !takes.some(
          (take) =>
            take.ref.kind === "catalog" && take.ref.videoId === video.videoId
        )
    )
  );

  const STATUS_TEXT = $derived({
    untapped: t("share_studio_timing_unmapped"),
    unconfirmed: t("share_studio_timing_unchecked"),
    confirmed: t("share_studio_timing_checked"),
    stale: t("share_studio_sequence_changed"),
  });

  function sourceText(take: PostTake): string {
    if (take.ref.kind === "catalog") return t("share_studio_saved_video");
    if (take.ref.kind === "linked") return t("share_studio_linked_video");
    return t("share_studio_from_device");
  }

  function clipCount(takeId: string): number {
    let count = 0;
    for (const track of editor.project.tracks) {
      for (const item of track.items) {
        if (item.kind === "video" && item.takeId === takeId) count += 1;
      }
    }
    return count;
  }

  function pickAgain(takeId: string): void {
    relinkTakeId = takeId;
    relinkInput?.click();
  }

  async function relink(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    const takeId = relinkTakeId;
    relinkTakeId = null;
    if (!file || !takeId) return;
    error = "";
    try {
      await readVideoFile(file);
      if (!editor.relinkLocalTake(takeId, file)) {
        error = t("share_studio_wrong_file");
      }
    } catch (caught) {
      error = videoFileError(caught);
    }
  }
</script>

<div class="media">
  {#if takes.length > 0}
    <ul class="list">
      {#each takes as take (take.id)}
        {@const status = editor.timingStatus(take.id)}
        {@const loaded = Boolean(editor.mediaUrl(take.id))}
        {@const clips = clipCount(take.id)}
        <li class="take">
          <input
            class="name"
            value={take.label}
            maxlength="120"
            aria-label={t("share_studio_take_name")}
            onchange={(event) =>
              editor.renameTake(take.id, event.currentTarget.value)}
          />
          <p class="meta">
            {formatPostClock(take.durationSeconds)} · {sourceText(take)} ·
            {clips === 0
              ? t("post_editor_no_clips")
              : clips === 1
                ? t("post_editor_one_clip")
                : t("post_editor_clip_count", { count: clips })}
          </p>
          <p class="meta">
            <span class="status status-{status}">{STATUS_TEXT[status]}</span>
          </p>
          {#if !loaded}
            <p class="warn">
              {take.ref.kind === "local"
                ? t("share_studio_repick_local")
                : t("share_studio_video_not_loaded")}
            </p>
          {/if}
          <div class="row">
            {#if loaded}
              <PanelButton
                variant={status === "confirmed" ? "secondary" : "primary"}
                onclick={() => onTapBeats(take.id)}
              >
                <i class="fa-solid fa-drum" aria-hidden="true"></i>
                {t("post_editor_tap_beats")}
              </PanelButton>
              <PanelButton
                onclick={() => editor.appendTakeClip(take.id)}
                ariaLabel={t("post_editor_add_clip_of", { take: take.label })}
              >
                <i class="fa-solid fa-plus" aria-hidden="true"></i>
                {t("post_editor_add_clip")}
              </PanelButton>
            {:else if take.ref.kind === "local"}
              <PanelButton variant="primary" onclick={() => pickAgain(take.id)}>
                {t("share_studio_pick_file_again")}
              </PanelButton>
            {/if}
            <PanelButton
              onclick={() => editor.removeTake(take.id)}
              ariaLabel={`${t("share_studio_remove")} ${take.label}`}
            >
              {t("share_studio_remove")}
            </PanelButton>
          </div>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="help">{t("post_editor_media_empty")}</p>
  {/if}

  <div class="add">
    <PanelButton
      variant={takes.length === 0 ? "primary" : "secondary"}
      onclick={onAddDeviceVideo}
      disabled={busy}
      ariaBusy={busy}
    >
      <i class="fa-solid fa-film" aria-hidden="true"></i>
      {busy
        ? t("share_studio_reading_video")
        : t("share_studio_choose_device_video")}
    </PanelButton>
    {#if error}<p class="warn" role="alert">{error}</p>{/if}

    {#if catalogLoading}
      <p class="help">{t("share_studio_finding_saved_videos")}</p>
    {:else if catalogError}
      <p class="warn">{catalogError}</p>
    {:else if unused.length > 0}
      <p class="help">{t("share_studio_saved_videos")}</p>
      <ul class="list">
        {#each unused as video (video.videoId)}
          <li class="catalog">
            <span class="catalog-name">
              {video.label}
              <span class="meta">
                {formatPostClock(video.durationSeconds)}{video.legacyStepMap
                  ? ` · ${t("share_studio_timing_saved")}`
                  : ""}
              </span>
            </span>
            <PanelButton
              onclick={() => editor.addCatalogVideo(video)}
              ariaLabel={`${t("share_studio_add")} ${video.label}`}
            >
              {t("share_studio_add")}
            </PanelButton>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <input
    bind:this={relinkInput}
    class="hidden"
    type="file"
    accept="video/*"
    onchange={relink}
    tabindex="-1"
    aria-hidden="true"
  />
</div>

<style>
  .media,
  .add,
  .take {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }

  .media {
    gap: 1rem;
  }

  .list {
    display: grid;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .take {
    padding: 0.75rem;
    border: 1px solid var(--theme-stroke, #484755);
    border-radius: 0.625rem;
    background: var(--theme-card-bg);
  }

  .name {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    min-height: var(--min-touch-target, 44px);
    padding: 0 0.5rem;
    border: 1px solid transparent;
    border-radius: 0.375rem;
    color: var(--theme-text, #fff);
    background: transparent;
    font: inherit;
    font-size: 1rem;
    font-weight: 600;
  }

  .name:hover,
  .name:focus {
    border-color: var(--theme-stroke, #484755);
  }

  .name:focus-visible {
    outline: 2px solid var(--theme-accent, currentColor);
    outline-offset: 1px;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .help,
  .meta,
  .warn {
    margin: 0;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .meta {
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
  }

  .warn {
    color: var(--semantic-warning, #fbbf24);
  }

  .status-confirmed {
    color: var(--semantic-success, #4ade80);
  }

  .status-stale {
    color: var(--semantic-warning, #fbbf24);
  }

  .catalog {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-width: 0;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--theme-stroke, #484755);
    border-radius: 0.625rem;
  }

  .catalog-name {
    display: grid;
    min-width: 0;
    color: var(--theme-text, #fff);
    font-size: 0.875rem;
    overflow-wrap: anywhere;
  }

  .hidden {
    display: none;
  }
</style>
