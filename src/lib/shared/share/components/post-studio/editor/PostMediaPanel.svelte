<script lang="ts">
  import { useStrings } from "@austencloud/video-editor/strings";
  import type { PostTake } from "@austencloud/video-editor/core";
  import type {
    LibraryTake,
    VideoEditorState,
  } from "@austencloud/video-editor";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { formatPostClock } from "./post-format";
  import { readVideoFile, videoFileError } from "./post-editor-files";
  import {
    Icon,
    faDrum,
    faFilm,
    faPlus,
  } from "@austencloud/video-editor/icons";

  const MIDDOT = String.fromCharCode(183);

  const t = useStrings();

  /**
   * The raw videos the post cuts from. One recording can hold both the run
   * through and the slow version: cut it into two clips on the timeline.
   * Each video's beats are tapped once and every clip cut from it uses them.
   */
  interface Props {
    editor: VideoEditorState;
    catalog: readonly LibraryTake[];
    catalogLoading?: boolean;
    catalogError?: string | null;
    busy?: boolean;
    onAddDeviceVideo: () => void;
    onTapBeats: (takeId: string) => void;
    /** A take's status line, from the plugin's bindings. Absent or null: no line. */
    takeStatus?: (takeId: string) => { id: string; text: string } | null;
  }

  let {
    editor,
    catalog,
    catalogLoading = false,
    catalogError = null,
    busy = false,
    onAddDeviceVideo,
    onTapBeats,
    takeStatus,
  }: Props = $props();

  let relinkInput = $state<HTMLInputElement | null>(null);
  let relinkTakeId = $state<string | null>(null);
  let error = $state("");

  const takes = $derived(editor.takes);
  const unused = $derived(
    catalog.filter(
      (video) =>
        !takes.some(
          (take) => take.ref.kind === "catalog" && take.ref.videoId === video.id
        )
    )
  );

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
      await readVideoFile(t, file);
      if (!editor.relinkLocalTake(takeId, file)) {
        error = t("share_studio_wrong_file");
      }
    } catch (caught) {
      error = videoFileError(t, caught);
    }
  }
</script>

<div class="media">
  {#if takes.length > 0}
    <ul class="list">
      {#each takes as take (take.id)}
        {@const status = takeStatus?.(take.id) ?? null}
        {@const loaded = Boolean(editor.mediaUrl(take.id))}
        {@const clips = clipCount(take.id)}
        {@const name = editor.takeDisplayLabel(take.id)}
        <li class="take">
          <input
            class="name"
            value={name}
            maxlength="120"
            aria-label={t("share_studio_take_name")}
            onchange={(event) =>
              editor.renameTake(take.id, event.currentTarget.value)}
          />
          <p class="meta">
            {formatPostClock(take.durationSeconds)} &middot; {sourceText(take)} &middot;
            {clips === 0
              ? t("post_editor_no_clips")
              : clips === 1
                ? t("post_editor_one_clip")
                : t("post_editor_clip_count", { count: clips })}
          </p>
          {#if status}
            <p class="meta">
              <span class="status status-{status.id}">{status.text}</span>
            </p>
          {/if}
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
                variant={status?.id === "confirmed" ? "secondary" : "primary"}
                onclick={() => onTapBeats(take.id)}
              >
                <Icon icon={faDrum} />
                {t("post_editor_tap_beats")}
              </PanelButton>
              <PanelButton
                onclick={() => editor.appendTakeClip(take.id)}
                ariaLabel={t("post_editor_add_clip_of", { take: name })}
              >
                <Icon icon={faPlus} />
                {t("post_editor_add_clip")}
              </PanelButton>
            {:else if take.ref.kind === "local"}
              <PanelButton variant="primary" onclick={() => pickAgain(take.id)}>
                {t("share_studio_pick_file_again")}
              </PanelButton>
            {/if}
            <PanelButton
              onclick={() => editor.removeTake(take.id)}
              ariaLabel={`${t("share_studio_remove")} ${name}`}
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
      <Icon icon={faFilm} />
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
        {#each unused as video (video.id)}
          <li class="catalog">
            <span class="catalog-name">
              {video.label}
              <span class="meta">
                {formatPostClock(video.durationSeconds)}{video.detail
                  ? ` ${MIDDOT} ${video.detail}`
                  : ""}
              </span>
            </span>
            <PanelButton
              onclick={() =>
                editor.addLibraryVideo({
                  videoId: video.id,
                  label: video.label,
                  url: video.url,
                  durationSeconds: video.durationSeconds,
                })}
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
    border: 1px solid var(--ve-theme-stroke, #484755);
    border-radius: 0.625rem;
    background: var(--ve-theme-card-bg);
  }

  .name {
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    min-height: var(--ve-min-touch-target, 44px);
    padding: 0 0.5rem;
    border: 1px solid transparent;
    border-radius: 0.375rem;
    color: var(--ve-theme-text, #fff);
    background: transparent;
    font: inherit;
    font-size: 1rem;
    font-weight: 600;
  }

  .name:hover,
  .name:focus {
    border-color: var(--ve-theme-stroke, #484755);
  }

  .name:focus-visible {
    outline: 2px solid var(--ve-theme-accent, currentColor);
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
    color: var(--ve-theme-text-secondary, #aaa);
    font-size: 0.875rem;
    line-height: 1.4;
  }

  .meta {
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
  }

  .warn {
    color: var(--ve-semantic-warning, #fbbf24);
  }

  .status-confirmed {
    color: var(--ve-semantic-success, #4ade80);
  }

  .status-stale {
    color: var(--ve-semantic-warning, #fbbf24);
  }

  .catalog {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    min-width: 0;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--ve-theme-stroke, #484755);
    border-radius: 0.625rem;
  }

  .catalog-name {
    display: grid;
    min-width: 0;
    color: var(--ve-theme-text, #fff);
    font-size: 0.875rem;
    overflow-wrap: anywhere;
  }

  .hidden {
    display: none;
  }
</style>
