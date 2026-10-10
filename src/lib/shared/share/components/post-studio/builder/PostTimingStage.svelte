<script lang="ts">
  import type { Snippet } from "svelte";
  import PanelButton from "#lib/shared/components/panel/PanelButton.svelte";
  import { t } from "#lib/shared/i18n/i18n.svelte.js";
  import { videoMirror } from "#lib/shared/media-composition/services/video-mirror.js";
  import type { PostTimingSession } from "./post-timing-session.svelte";

  /**
   * The take being mapped, large, with the move the map says is under way
   * drawn in its corner. If the arrow lands when the props land, the map is
   * right; its timeline is mounted below the video and controls.
   */
  interface Props {
    session: PostTimingSession;
    ratio?: number;
    preview: Snippet;
    onOpenAnimation: () => void;
  }

  let {
    session,
    preview,
    onOpenAnimation,
    ratio = $bindable(9 / 16),
  }: Props = $props();
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
    {#if session.url}
      <div class="video-space">
        <div class="frame" style:--take-ratio={sourceWidth / sourceHeight}>
          <!-- svelte-ignore a11y_media_has_caption, a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
          <video
            bind:this={session.video}
            src={session.url}
            playsinline
            preload="auto"
            onloadedmetadata={(event) => {
              sourceWidth = event.currentTarget.videoWidth || 9;
              sourceHeight = event.currentTarget.videoHeight || 16;
              ratio = sourceWidth / sourceHeight;
            }}
            onplay={() => session.notePlaying(true)}
            onpause={() => session.notePlaying(false)}
            onended={() => session.notePlaying(false)}
            onseeked={session.noteSeeked}
            onclick={session.togglePlay}
          ></video>
          <!-- Drawn over the video, so the take stays visible if the browser
               stops drawing the video's own layer. -->
          <canvas
            class="video-copy"
            aria-hidden="true"
            {@attach videoMirror(session.video, "contain")}
          ></canvas>
          {#if session.showSquare && session.paintFrame}
            <button
              type="button"
              class="square"
              onclick={onOpenAnimation}
              aria-label="Animation settings"
              title="Animation settings"
            >
              {@render preview()}
              <span class="settings-mark" aria-hidden="true"
                ><i class="fa-solid fa-sliders"></i></span
              >
            </button>
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
    min-height: 0;
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
  .video-copy {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
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
    min-width: 2.75rem;
    min-height: 2.75rem;
    border: 0;
    padding: 0;
    background: var(--theme-card-bg);
    cursor: pointer;
  }
  .square:focus-visible {
    outline: 3px solid var(--theme-accent);
    outline-offset: -3px;
  }
  .settings-mark {
    position: absolute;
    right: 0.25rem;
    top: 0.25rem;
    display: grid;
    place-items: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 0.25rem;
    background: var(--theme-panel-bg);
    color: var(--theme-text);
    font-size: 0.875rem;
  }
</style>
