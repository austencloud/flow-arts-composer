<script lang="ts">
  import type { PostStudioLayerPainter } from "$lib/shared/media-composition/services/post-studio-layer-painter";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import { t } from "$lib/shared/i18n/i18n.svelte.js";
  import PostStudioPaintedLayer from "../PostStudioPaintedLayer.svelte";
  import type { PostTimingSession } from "./post-timing-session.svelte";

  /**
   * The take being mapped, large, with the move the map says is under way
   * drawn in its corner. If the arrow lands when the props land, the map is
   * right; its timeline is mounted below the video and controls.
   */
  interface Props {
    session: PostTimingSession;
    squarePainter?: PostStudioLayerPainter | null;
  }

  let { session, squarePainter = null }: Props = $props();
  let sourceWidth = $state(9);
  let sourceHeight = $state(16);
</script>

{#if !session.take || !session.timing}
  <div class="empty">
    <p>{t("post_editor_add_video_to_tap")}</p>
    <PanelButton onclick={session.exit}
      >{t("post_editor_back_to_editing")}</PanelButton
    >
  </div>
{:else}
  <section class="stage" aria-label={t("share_studio_deep_take_to_map")}>
    {#if session.takes.length > 1}
      <SegmentedControl
        options={session.takes.map((entry) => ({
          value: entry.id,
          label: entry.label,
        }))}
        value={session.take.id}
        onchange={session.selectTake}
        size="sm"
        ariaLabel={t("share_studio_deep_take_to_map")}
      />
    {/if}

    {#if session.url}
      <div class="video-space">
        <div
          class="frame"
          style:--take-ratio={sourceWidth / sourceHeight}
        >
          <!-- svelte-ignore a11y_media_has_caption, a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
          <video
            bind:this={session.video}
            src={session.url}
            playsinline
            preload="auto"
            onloadedmetadata={(event) => {
              sourceWidth = event.currentTarget.videoWidth || 9;
              sourceHeight = event.currentTarget.videoHeight || 16;
            }}
            onplay={() => session.notePlaying(true)}
            onpause={() => session.notePlaying(false)}
            onended={() => session.notePlaying(false)}
            onseeked={session.noteSeeked}
            onclick={session.togglePlay}
          ></video>
          {#if session.showSquare && squarePainter && session.paintFrame}
            <div class="square" aria-hidden="true">
              <PostStudioPaintedLayer
                painter={squarePainter}
                frame={session.paintFrame}
              />
            </div>
          {/if}
        </div>
      </div>
    {:else}
      <div class="empty">
        <p>{t("post_editor_take_file_missing")}</p>
        <PanelButton onclick={session.exit}
          >{t("post_editor_back_to_editing")}</PanelButton
        >
      </div>
    {/if}
  </section>
{/if}

<style>
  .stage {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    gap: 0.75rem;
    min-width: 0;
  }
  .empty {
    display: grid;
    justify-items: center;
    gap: 0.75rem;
    padding: 2rem 1rem;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.875rem;
    text-align: center;
  }
  .empty p {
    margin: 0;
  }
  .video-space {
    flex: 1;
    min-height: 12rem;
    container-type: size;
    display: grid;
    place-items: center;
  }
  .frame {
    position: relative;
    justify-self: center;
    width: min(100cqw, calc(100cqh * var(--take-ratio)));
    aspect-ratio: var(--take-ratio);
    max-width: 100%;
    overflow: hidden;
    border-radius: 0.5rem;
    background: #08080c;
  }
  video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: contain;
    cursor: pointer;
  }
  .square {
    position: absolute;
    right: 3%;
    bottom: 3%;
    width: 34%;
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: 0.375rem;
    box-shadow: 0 0.25rem 1rem rgb(0 0 0 / 0.45);
    pointer-events: none;
  }
</style>
