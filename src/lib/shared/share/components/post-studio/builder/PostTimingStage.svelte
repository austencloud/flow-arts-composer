<script lang="ts">
  import type { PostStudioLayerPainter } from "$lib/shared/media-composition/services/post-studio-layer-painter";
  import PanelButton from "$lib/shared/components/panel/PanelButton.svelte";
  import SegmentedControl from "$lib/shared/ui/components/SegmentedControl.svelte";
  import PostStudioPaintedLayer from "../PostStudioPaintedLayer.svelte";
  import TakeTimingLane from "./TakeTimingLane.svelte";
  import type { PostTimingSession } from "./post-timing-session.svelte";
  import { formatTakeClock } from "./post-builder-format";

  /**
   * The take being mapped, large, with the move the map says is under way
   * drawn in its corner. If the arrow lands when the props land, the map is
   * right; the lanes below show where every landing sits.
   */
  interface Props {
    session: PostTimingSession;
    squarePainter?: PostStudioLayerPainter | null;
  }

  let { session, squarePainter = null }: Props = $props();
</script>

<svelte:window onkeydown={session.handleKey} />

{#if !session.take || !session.timing}
  <div class="empty">
    <p>Add a take first. Its timing is mapped here.</p>
    <PanelButton onclick={session.goToTakes}>Go to Takes</PanelButton>
  </div>
{:else}
  <section class="stage" aria-label="Take to map">
    {#if session.takes.length > 1}
      <SegmentedControl
        options={session.takes.map((entry) => ({
          value: entry.id,
          label: entry.label,
        }))}
        value={session.take.id}
        onchange={session.selectTake}
        size="sm"
        ariaLabel="Take to map"
      />
    {/if}

    {#if session.url}
      <div class="frame">
        <!-- svelte-ignore a11y_media_has_caption, a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
        <video
          bind:this={session.video}
          src={session.url}
          playsinline
          preload="auto"
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
    {:else}
      <div class="empty">
        <p>This take's file isn't loaded. Pick it again on the Takes step.</p>
        <PanelButton onclick={session.goToTakes}>Go to Takes</PanelButton>
      </div>
    {/if}

    <div class="transport">
      <button
        type="button"
        class="round"
        onclick={session.togglePlay}
        disabled={!session.url}
        aria-label={session.playing ? "Pause" : "Play"}
      >
        <i
          class="fa-solid {session.playing ? 'fa-pause' : 'fa-play'}"
          aria-hidden="true"
        ></i>
      </button>
      <button
        type="button"
        class="round"
        onclick={() => session.stepFrame(-1)}
        disabled={!session.url}
        aria-label="Back one frame"
      >
        <i class="fa-solid fa-backward-step" aria-hidden="true"></i>
      </button>
      <button
        type="button"
        class="round"
        onclick={() => session.stepFrame(1)}
        disabled={!session.url}
        aria-label="Forward one frame"
      >
        <i class="fa-solid fa-forward-step" aria-hidden="true"></i>
      </button>
      <output class="clock">
        {formatTakeClock(session.mediaSeconds)} / {formatTakeClock(
          session.durationSeconds
        )}
      </output>
      <span class="readout">{session.readout}</span>
      <SegmentedControl
        options={[
          { value: "1", label: "1×", ariaLabel: "Full speed" },
          { value: "0.75", label: "¾×", ariaLabel: "Three quarter speed" },
          { value: "0.5", label: "½×", ariaLabel: "Half speed" },
        ]}
        value={session.speed}
        onchange={(value) => (session.speed = value)}
        size="sm"
        density="compact"
        ariaLabel="Playback speed"
      />
    </div>

    <TakeTimingLane
      timing={session.timing}
      resolved={session.resolved}
      durationSeconds={session.durationSeconds}
      mediaSeconds={session.mediaSeconds}
      movesPerPass={session.movesPerPass}
      windowSeconds={Number(session.zoom)}
      selected={session.selected}
      onseek={(seconds) => {
        session.pause();
        session.seek(seconds);
      }}
      onselect={(landing) => (session.selected = landing)}
      onplace={session.placeLanding}
      dragRange={session.landingRange}
    />

    <div class="options">
      <SegmentedControl
        options={[
          { value: "4", label: "4 s" },
          { value: "8", label: "8 s" },
          { value: "16", label: "16 s" },
        ]}
        value={session.zoom}
        onchange={(value) => (session.zoom = value)}
        size="sm"
        density="compact"
        ariaLabel="Close-up width"
      />
      {#if squarePainter}
        <label class="check">
          <input type="checkbox" bind:checked={session.showSquare} />
          Show the move
        </label>
      {/if}
      <span class="hint">T taps · Space plays · , and . step a frame</span>
    </div>
  </section>
{/if}

<style>
  .stage {
    display: grid;
    align-content: start;
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
  .frame {
    position: relative;
    justify-self: center;
    width: fit-content;
    max-width: 100%;
    overflow: hidden;
    border-radius: 0.5rem;
    background: #08080c;
  }
  video {
    display: block;
    max-width: 100%;
    max-height: min(58vh, 40rem);
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
  .transport,
  .options {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
  }
  .round {
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    flex: none;
    border: 1px solid var(--theme-stroke, #484755);
    border-radius: 50%;
    color: var(--theme-text, #fff);
    background: var(--theme-card-bg);
    cursor: pointer;
  }
  .round:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .round:focus-visible {
    outline: 2px solid var(--theme-primary, currentColor);
    outline-offset: 2px;
  }
  .clock {
    color: var(--theme-text, #fff);
    font-size: 0.875rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .readout {
    flex: 1 1 8rem;
    min-width: 0;
    overflow: hidden;
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.875rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .hint {
    color: var(--theme-text-secondary, #aaa);
    font-size: 0.75rem;
  }
  .check {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 2.75rem;
    color: var(--theme-text, #fff);
    font-size: 0.875rem;
    cursor: pointer;
  }
  .check input {
    width: 1.125rem;
    height: 1.125rem;
    accent-color: var(--theme-primary, #d4813a);
  }
</style>
