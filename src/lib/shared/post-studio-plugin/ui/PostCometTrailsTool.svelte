<script lang="ts">
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import type { PostVideoItem } from "@austencloud/video-editor/core";
  import {
    COMET_DEFAULT_GROW_SECONDS,
    COMET_DEFAULT_LOOK,
    COMET_DEFAULT_PULL_BACK_SECONDS,
    COMET_DEFAULT_SECOND_LOOK,
    COMET_DEFAULT_SWITCH_SECONDS,
    COMET_DEFAULT_TAPER,
    COMET_MAX_GAIN,
    COMET_MAX_LENGTH_SECONDS,
    type PostCometTrails,
  } from "#lib/shared/media-composition/domain/comet-trails.js";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import ValueSlider from "#lib/shared/ui/components/ValueSlider.svelte";

  /**
   * Comet trails: each lit bulb in the clip's own footage leaves a glowing
   * tail that fades and thins behind it. The light is read once from every
   * real camera frame of the take, then the tail's length and brightness
   * are free to change, and can change on cue: grow in, switch to a second
   * look, pull back. Cue times are footage seconds, so a trim leaves each
   * cue on the same moment of the take.
   */
  interface Props {
    item: PostVideoItem;
    /** The take's media URL; the light can be read only from a feature video's own file. */
    mediaUrl: string | null;
    /** The playhead in post seconds. */
    playhead: number;
    locked: boolean;
    onchange: (trails: PostCometTrails | null) => void;
  }

  let { item, mediaUrl, playhead, locked, onchange }: Props = $props();

  const trails = $derived(item.cometTrails ?? null);
  /** The footage to read: a sharper copy read before, or the take's own file. */
  const sourceUrl = $derived(trails?.source ?? mediaUrl);
  const slug = $derived(
    /^\/api\/dev\/feature-videos\/([^/?#]+)\/media\//.exec(mediaUrl ?? "")?.[1] ??
      null
  );

  let reading = $state<string | null>(null);
  let failure = $state<{ id: string; text: string } | null>(null);

  const round = (value: number) => Math.round(value * 1e6) / 1e6;
  const secondsText = (value: number) => `${value.toFixed(2)} s`;
  const timesText = (value: number) => `${value.toFixed(2)}×`;
  const plainText = (value: number) => value.toFixed(1);

  /** The footage second under the playhead, inside the clip. */
  const footageAtPlayhead = $derived(
    round(
      Math.min(
        item.sourceOut,
        Math.max(item.sourceIn, item.sourceIn + (playhead - item.start) * item.speed)
      )
    )
  );
  /** A cue's time as the clip clock: seconds after the clip's first frame. */
  const clipClock = (footage: number) => secondsText(footage - item.sourceIn);

  async function readLight(): Promise<void> {
    if (!slug || !sourceUrl || locked) return;
    const id = item.id;
    reading = id;
    failure = null;
    try {
      const response = await fetch(
        `/api/dev/feature-videos/${slug}/comet-map`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            itemId: id,
            sourceUrl,
            fromSeconds: item.sourceIn,
            toSeconds: item.sourceOut,
          }),
        }
      );
      if (!response.ok)
        throw new Error((await response.text()) || response.statusText);
      const { map } = (await response.json()) as { map: string };
      // The clip may have changed while the light was read: keep its look,
      // and only point it at the new map.
      onchange(
        trails
          ? { ...trails, map }
          : { map, taper: COMET_DEFAULT_TAPER, first: { ...COMET_DEFAULT_LOOK } }
      );
    } catch (cause) {
      failure = {
        id,
        text: cause instanceof Error ? cause.message : String(cause),
      };
    } finally {
      if (reading === id) reading = null;
    }
  }

  function change(next: Partial<PostCometTrails>): void {
    if (!trails || locked) return;
    const merged: PostCometTrails = { ...trails, ...next };
    for (const key of ["second", "growIn", "pullBack"] as const)
      if (merged[key] === undefined) delete merged[key];
    onchange(merged);
  }
</script>

<div class="comet">
  <span class="title">{t("post_comet_trails")}</span>
  {#if !trails}
    <p class="hint">{t("post_comet_intro")}</p>
    <PanelButton
      disabled={locked || !slug || reading === item.id}
      onclick={readLight}
    >
      {reading === item.id ? t("post_comet_reading") : t("post_comet_read")}
    </PanelButton>
    {#if !slug}
      <p class="hint">{t("post_comet_feature_only")}</p>
    {/if}
  {:else}
    <ValueSlider
      label={t("post_comet_length")}
      value={trails.first.length}
      min={0}
      max={COMET_MAX_LENGTH_SECONDS}
      step={0.01}
      format={secondsText}
      disabled={locked}
      onchange={(length) => change({ first: { ...trails.first, length } })}
    />
    <ValueSlider
      label={t("post_comet_brightness")}
      value={trails.first.gain}
      min={0}
      max={COMET_MAX_GAIN}
      step={0.01}
      format={timesText}
      disabled={locked}
      onchange={(gain) => change({ first: { ...trails.first, gain } })}
    />
    <ValueSlider
      label={t("post_comet_taper")}
      value={trails.taper ?? COMET_DEFAULT_TAPER}
      min={0.2}
      max={6}
      step={0.1}
      format={plainText}
      disabled={locked}
      onchange={(taper) => change({ taper })}
    />

    <span class="title">{t("post_comet_cues")}</span>
    <div class="cue">
      {#if trails.growIn}
        <span>{t("post_comet_grow_at", { time: clipClock(trails.growIn.at) })}</span>
        <PanelButton disabled={locked} onclick={() => change({ growIn: undefined })}>
          {t("post_comet_remove")}
        </PanelButton>
      {:else}
        <PanelButton
          disabled={locked}
          onclick={() =>
            change({
              growIn: { at: footageAtPlayhead, seconds: COMET_DEFAULT_GROW_SECONDS },
            })}
        >
          {t("post_comet_grow_here")}
        </PanelButton>
      {/if}
    </div>
    <div class="cue">
      {#if trails.second}
        <span>{t("post_comet_second_at", { time: clipClock(trails.second.at) })}</span>
        <PanelButton disabled={locked} onclick={() => change({ second: undefined })}>
          {t("post_comet_remove")}
        </PanelButton>
      {:else}
        <PanelButton
          disabled={locked}
          onclick={() =>
            change({
              second: {
                ...COMET_DEFAULT_SECOND_LOOK,
                at: footageAtPlayhead,
                seconds: COMET_DEFAULT_SWITCH_SECONDS,
              },
            })}
        >
          {t("post_comet_second_here")}
        </PanelButton>
      {/if}
    </div>
    {#if trails.second}
      {@const second = trails.second}
      <ValueSlider
        label={t("post_comet_second_length")}
        value={second.length}
        min={0}
        max={COMET_MAX_LENGTH_SECONDS}
        step={0.01}
        format={secondsText}
        disabled={locked}
        onchange={(length) => change({ second: { ...second, length } })}
      />
      <ValueSlider
        label={t("post_comet_second_brightness")}
        value={second.gain}
        min={0}
        max={COMET_MAX_GAIN}
        step={0.01}
        format={timesText}
        disabled={locked}
        onchange={(gain) => change({ second: { ...second, gain } })}
      />
    {/if}
    <div class="cue">
      {#if trails.pullBack}
        <span>{t("post_comet_pull_at", { time: clipClock(trails.pullBack.at) })}</span>
        <PanelButton disabled={locked} onclick={() => change({ pullBack: undefined })}>
          {t("post_comet_remove")}
        </PanelButton>
      {:else}
        <PanelButton
          disabled={locked}
          onclick={() =>
            change({
              pullBack: {
                at: footageAtPlayhead,
                seconds: COMET_DEFAULT_PULL_BACK_SECONDS,
              },
            })}
        >
          {t("post_comet_pull_here")}
        </PanelButton>
      {/if}
    </div>

    <div class="cue">
      <PanelButton disabled={locked || !slug || reading === item.id} onclick={readLight}>
        {reading === item.id ? t("post_comet_reading") : t("post_comet_read_again")}
      </PanelButton>
      <PanelButton disabled={locked} onclick={() => onchange(null)}>
        {t("post_comet_off")}
      </PanelButton>
    </div>
  {/if}
  {#if failure?.id === item.id}
    <p class="hint" role="alert">{failure.text}</p>
  {/if}
</div>

<style>
  .comet {
    display: grid;
    gap: 0.5rem;
    min-width: 0;
  }

  .title {
    font-size: var(--font-size-sm);
    font-weight: 600;
  }

  .cue {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    font-size: var(--font-size-sm);
  }

  .hint {
    margin: 0;
    color: var(--theme-text-secondary, #aaa);
    font-size: var(--font-size-sm);
    line-height: 1.4;
  }
</style>
