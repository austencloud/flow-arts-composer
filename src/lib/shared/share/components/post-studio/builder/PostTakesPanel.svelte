<script lang="ts">
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import type {
    CatalogTakeSource,
    PostBuilderState,
  } from "$lib/shared/media-composition/state/post-builder-state.svelte";
  import type { PostTake } from "$lib/shared/media-composition/domain/post-plan";
  import { getVideoFileMetadata } from "$lib/shared/video-collaboration/helpers/create-video-from-upload";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import { formatPostClock, postActDisplayLabel } from "./post-builder-format";

  /**
   * The videos the post cuts between. The first one runs both performance
   * acts; a second, slowly performed take takes over the breakdown.
   */
  interface Props {
    builder: PostBuilderState;
    catalog: readonly CatalogTakeSource[];
    catalogLoading?: boolean;
    catalogError?: string;
  }

  let {
    builder,
    catalog,
    catalogLoading = false,
    catalogError = "",
  }: Props = $props();

  const MAX_BYTES = 500 * 1024 * 1024;

  let fileInput = $state<HTMLInputElement | null>(null);
  let relinkInput = $state<HTMLInputElement | null>(null);
  let relinkTakeId = $state<string | null>(null);
  let error = $state("");
  let busy = $state(false);

  const takes = $derived(builder.plan.takes);
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

  function usedBy(take: PostTake): string {
    const acts = builder.plan.acts.filter(
      (act) =>
        act.kind === "performance" && act.enabled && act.takeId === take.id
    );
    return acts.length > 0
      ? acts
          .map((act) => postActDisplayLabel(act.id, act.label))
          .join(` ${t("share_studio_and")} `)
      : t("share_studio_not_in_act");
  }

  async function readFile(file: File): Promise<number> {
    if (!file.type.startsWith("video/"))
      throw new Error(t("share_studio_choose_video_file"));
    if (file.size > MAX_BYTES)
      throw new Error(t("share_studio_video_under_500"));
    const metadata = await getVideoFileMetadata(file);
    if (!Number.isFinite(metadata.duration) || metadata.duration <= 0) {
      throw new Error(t("share_studio_video_duration_unreadable"));
    }
    return metadata.duration;
  }

  async function addFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    error = "";
    busy = true;
    try {
      const duration = await readFile(file);
      const take = builder.addLocalTake(file, duration);
      builder.selectedTakeId = take.id;
    } catch (caught) {
      error =
        caught instanceof Error
          ? caught.message
          : t("share_studio_video_unreadable");
    } finally {
      busy = false;
    }
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
      await readFile(file);
      if (!builder.relinkLocalTake(takeId, file)) {
        error = t("share_studio_wrong_file");
      }
    } catch (caught) {
      error =
        caught instanceof Error
          ? caught.message
          : t("share_studio_video_unreadable");
    }
  }

  function mapTiming(takeId: string): void {
    builder.selectedTakeId = takeId;
    builder.step = "timing";
  }
</script>

<div class="takes">
  <p class="help">
    {t("share_studio_takes_hint")}
  </p>

  {#if takes.length > 0}
    <ul class="list">
      {#each takes as take (take.id)}
        {@const status = builder.timingStatus(take.id)}
        {@const loaded = Boolean(builder.mediaUrl(take.id))}
        <li class="take">
          <div class="take-head">
            <input
              class="name"
              value={take.label}
              maxlength="120"
              aria-label={t("share_studio_take_name")}
              onchange={(event) =>
                builder.renameTake(take.id, event.currentTarget.value)}
            />
            <span class="meta">
              {formatPostClock(take.durationSeconds)} · {sourceText(take)}
            </span>
          </div>
          <p class="meta">
            <span class="status status-{status}">{STATUS_TEXT[status]}</span>
            · {usedBy(take)}
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
                onclick={() => mapTiming(take.id)}
              >
                {status === "confirmed"
                  ? t("share_studio_timing")
                  : t("share_studio_map_timing")}
              </PanelButton>
            {:else if take.ref.kind === "local"}
              <PanelButton variant="primary" onclick={() => pickAgain(take.id)}>
                {t("share_studio_pick_file_again")}
              </PanelButton>
            {/if}
            <PanelButton
              onclick={() => builder.removeTake(take.id)}
              ariaLabel={`${t("share_studio_remove")} ${take.label}`}
            >
              {t("share_studio_remove")}
            </PanelButton>
          </div>
        </li>
      {/each}
    </ul>
  {/if}

  <div class="add">
    <h3>{t("share_studio_add_take")}</h3>
    <PanelButton
      variant={takes.length === 0 ? "primary" : "secondary"}
      onclick={() => fileInput?.click()}
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
              onclick={() => {
                const take = builder.addCatalogTake(video);
                builder.selectedTakeId = take.id;
              }}
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
    bind:this={fileInput}
    class="hidden"
    type="file"
    accept="video/*"
    onchange={addFile}
    tabindex="-1"
    aria-hidden="true"
  />
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
  .takes,
  .add,
  .take {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }
  .takes {
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
  .take-head {
    display: grid;
    gap: 0.25rem;
    min-width: 0;
  }
  .name {
    min-width: 0;
    min-height: 2.75rem;
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
    outline: 2px solid var(--theme-primary, currentColor);
    outline-offset: 1px;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  h3 {
    margin: 0;
    color: var(--theme-text, #fff);
    font-size: 0.9375rem;
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
