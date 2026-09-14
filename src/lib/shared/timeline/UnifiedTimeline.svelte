<script lang="ts">
  import { Popover } from "bits-ui";
  import type { UnifiedPlaybackContext } from "./unified-playback-context";
  import { formatTime } from "$lib/shared/sequence-viewer/utils/format-time";
  import { onDestroy, type Snippet } from "svelte";
  import BpmChips from "$lib/shared/animation-engine/components/controls/BpmChips.svelte";
  import PlaybackModeToggle from "$lib/shared/animation-engine/components/controls/PlaybackModeToggle.svelte";

  const BPM_PRESETS = [15, 30, 60, 90, 120, 150];

  let {
    playback,
    visible = true,
    hidePlay = false,
    compact = false,
    trailing,
  }: {
    playback: UnifiedPlaybackContext;
    visible?: boolean;
    /** Hide the play/pause button (e.g. when tap-to-toggle on the canvas covers it). */
    hidePlay?: boolean;
    /** Keep a loaned transport in one presentation across differently sized hosts. */
    compact?: boolean;
    /**
     * Host-owned controls that belong to this bar rather than beside it —
     * Post Studio's alignment chip and its Advanced-timing toggle. They ride
     * inside the pill so a host does not need a second bar of its own, which
     * is how the studio ended up with a parallel transport in the first place.
     */
    trailing?: Snippet;
  } = $props();

  const currentTimeLabel = $derived(formatTime(playback.elapsed));
  const totalTimeLabel = $derived(formatTime(playback.duration));

  const beatMarkers = $derived(playback.beatMarkerPositions);

  let scrubberEl: HTMLDivElement | undefined = $state();
  let isDragging = $state(false);
  let wasPlayingBeforeScrub = false;

  let showBpmPopover = $state(false);
  let bpmBtnEl: HTMLButtonElement | undefined = $state();

  function seekFromPointer(e: PointerEvent) {
    if (!scrubberEl) return;
    const rect = scrubberEl.getBoundingClientRect();
    const ratio = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / rect.width)
    );
    playback.seek(ratio);
  }

  function onPointerDown(e: PointerEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    wasPlayingBeforeScrub = playback.isPlaying;
    if (wasPlayingBeforeScrub) playback.togglePlay();
    isDragging = true;
    scrubberEl?.setPointerCapture(e.pointerId);
    seekFromPointer(e);
  }

  function onPointerMove(e: PointerEvent) {
    if (!isDragging) return;
    e.stopPropagation();
    e.preventDefault();
    seekFromPointer(e);
  }

  function onPointerUp(e: PointerEvent) {
    if (!isDragging) return;
    e.stopPropagation();
    isDragging = false;
    scrubberEl?.releasePointerCapture(e.pointerId);
    if (wasPlayingBeforeScrub) playback.togglePlay();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === " " || e.key === "Spacebar") {
      e.preventDefault();
      playback.togglePlay();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      const beatStarts = [0, ...playback.beatMarkerPositions, 1];
      const next = beatStarts.find((p) => p > playback.overallProgress + 0.001);
      if (next !== undefined) playback.seek(next);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const beatStarts = [0, ...playback.beatMarkerPositions];
      const prev = [...beatStarts]
        .reverse()
        .find((p) => p < playback.overallProgress - 0.001);
      if (prev !== undefined) playback.seek(prev);
    }
  }

  const hasTempo = $derived(
    playback.bpm !== undefined && playback.onBpmChange !== undefined
  );
  const hasMode = $derived(
    playback.playbackMode !== undefined &&
      playback.onPlaybackModeChange !== undefined
  );
  const hasAdvancedControls = $derived(
    hasTempo || hasMode || playback.isLooping !== undefined
  );
  let compactControlsOpen = $state(false);
  let compactTriggerEl: HTMLButtonElement | undefined = $state();

  function selectPreset(preset: number) {
    playback.onBpmChange?.(preset);
    showBpmPopover = false;
  }

  function adjustBpm(delta: number) {
    const current = playback.bpm ?? 60;
    const next = Math.max(5, Math.min(300, current + delta));
    playback.onBpmChange?.(next);
  }

  let popoverEl: HTMLDivElement | undefined = $state();

  function handleBpmPopoverToggle(e: MouseEvent) {
    e.stopPropagation();
    showBpmPopover = !showBpmPopover;
    if (showBpmPopover) {
      requestAnimationFrame(() => {
        const first =
          popoverEl?.querySelector<HTMLButtonElement>(".bpm-preset");
        first?.focus();
      });
    }
  }

  function handlePopoverKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.stopPropagation();
      showBpmPopover = false;
      bpmBtnEl?.focus();
    }
  }

  function handleOutsideClick(event: MouseEvent) {
    if (!showBpmPopover) return;
    const target = event.target as HTMLElement;
    const popover = document.querySelector(".bpm-popover");
    if (
      popover &&
      bpmBtnEl &&
      !popover.contains(target) &&
      !bpmBtnEl.contains(target)
    ) {
      showBpmPopover = false;
    }
  }

  let clickTimer: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    if (showBpmPopover) {
      clickTimer = setTimeout(() => {
        document.addEventListener("click", handleOutsideClick);
        clickTimer = null;
      }, 0);
      return () => {
        if (clickTimer !== null) clearTimeout(clickTimer);
        document.removeEventListener("click", handleOutsideClick);
      };
    }
    return undefined;
  });

  onDestroy(() => {
    if (clickTimer !== null) clearTimeout(clickTimer);
    document.removeEventListener("click", handleOutsideClick);
  });
</script>

{#if visible && playback.totalSteps > 0}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    class="unified-timeline"
    class:compact
    role="group"
    aria-label="Playback transport"
    onkeydown={onKeydown}
  >
    <div class="transport-pill">
      {#if !hidePlay}
        <button
          class="pill-play"
          onclick={(e) => {
            e.stopPropagation();
            playback.togglePlay();
          }}
          aria-label={playback.isPlaying ? "Pause" : "Play"}
        >
          <i class="fas {playback.isPlaying ? 'fa-pause' : 'fa-play'}"></i>
        </button>
      {/if}

      {#if hasTempo}
        <div class="tempo-group">
          <button
            class="tempo-adjust"
            onclick={(e) => {
              e.stopPropagation();
              adjustBpm(-5);
            }}
            aria-label="Decrease BPM"
          >
            <i class="fas fa-minus"></i>
          </button>
          <button
            bind:this={bpmBtnEl}
            class="pill-bpm"
            onclick={handleBpmPopoverToggle}
            aria-label="Change tempo"
          >
            <span class="bpm-val">{playback.bpm}</span>
            <span class="bpm-unit">BPM</span>
          </button>
          <button
            class="tempo-adjust"
            onclick={(e) => {
              e.stopPropagation();
              adjustBpm(5);
            }}
            aria-label="Increase BPM"
          >
            <i class="fas fa-plus"></i>
          </button>
        </div>
      {/if}

      <div
        class="pill-track"
        bind:this={scrubberEl}
        onpointerdown={onPointerDown}
        onpointermove={onPointerMove}
        onpointerup={onPointerUp}
        onpointercancel={onPointerUp}
        role="slider"
        tabindex="0"
        aria-label="Playback progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(playback.overallProgress * 100)}
        aria-valuetext="{currentTimeLabel} of {totalTimeLabel}"
      >
        <div
          class="pill-fill"
          style:width="{playback.overallProgress * 100}%"
        ></div>
        {#each beatMarkers as pct (pct)}
          <div class="pill-beat-marker" style:left="{pct * 100}%"></div>
        {/each}
        <div
          class="pill-knob"
          style:left="{playback.overallProgress * 100}%"
        ></div>
      </div>

      {#if hasMode}
        <!-- The same labelled control the settings panels use, in its inline
             form. An icon-only infinity/step button read as decoration and gave
             a first-time viewer nothing to go on; two words do. -->
        <div class="pill-mode-slot">
          <PlaybackModeToggle
            layout="inline"
            playbackMode={playback.playbackMode}
            isPlaying={playback.isPlaying}
            onPlaybackModeChange={(mode) =>
              playback.onPlaybackModeChange?.(mode)}
            onPlaybackToggle={() => playback.togglePlay()}
          />
        </div>
      {/if}

      {#if playback.isLooping !== undefined}
        <button
          class="pill-loop"
          aria-pressed={playback.isLooping}
          aria-label="Loop {playback.isLooping ? 'on' : 'off'}"
          onclick={(e) => {
            e.stopPropagation();
            playback.toggleLoop();
          }}
        >
          <i class="fas fa-sync"></i>
        </button>
      {/if}

      {#if trailing}
        <div class="pill-trailing">{@render trailing()}</div>
      {/if}

      {#if hasAdvancedControls}
        <!-- A narrow animation pane gets one useful row: transport, scrubber,
             and a real button for everything less frequent. The same tempo and
             mode owners render inside the popover, so compact playback does not
             become a second implementation with different rules. -->
        <button
          bind:this={compactTriggerEl}
          type="button"
          class="compact-more"
          aria-label="More playback controls"
          title="More playback controls"
          aria-haspopup="dialog"
          aria-expanded={compactControlsOpen}
          onclick={(event) => {
            event.stopPropagation();
            compactControlsOpen = !compactControlsOpen;
          }}
        >
          <i class="fas fa-ellipsis" aria-hidden="true"></i>
        </button>
        <Popover.Root bind:open={compactControlsOpen}>
          <Popover.Portal>
            <Popover.Content
              customAnchor={compactTriggerEl}
              side="top"
              align="end"
              sideOffset={8}
              collisionPadding={12}
              class="compact-playback-pop"
              data-escape-shortcut-local
              onCloseAutoFocus={(event) => {
                event.preventDefault();
                compactTriggerEl?.focus();
              }}
            >
              <div
                class="compact-playback-panel"
                role="group"
                aria-label="Playback settings"
              >
                {#if hasTempo}
                  <section class="compact-section compact-tempo">
                    <h3>Tempo</h3>
                    <BpmChips
                      bpm={playback.bpm ?? 60}
                      variant="full"
                      onBpmChange={(bpm) => playback.onBpmChange?.(bpm)}
                    />
                  </section>
                {/if}

                {#if hasMode}
                  <section class="compact-section">
                    <h3>Playback</h3>
                    <PlaybackModeToggle
                      layout="inline"
                      playbackMode={playback.playbackMode ?? "continuous"}
                      isPlaying={playback.isPlaying}
                      onPlaybackModeChange={(mode) =>
                        playback.onPlaybackModeChange?.(mode)}
                      onPlaybackToggle={() => playback.togglePlay()}
                    />
                  </section>
                {/if}

                {#if playback.isLooping !== undefined}
                  <button
                    type="button"
                    class="compact-loop"
                    class:active={playback.isLooping}
                    aria-pressed={playback.isLooping}
                    onclick={() => playback.toggleLoop()}
                  >
                    <i class="fas fa-sync" aria-hidden="true"></i>
                    <span>Loop sequence</span>
                    <span class="compact-setting-state">
                      {playback.isLooping ? "On" : "Off"}
                    </span>
                  </button>
                {/if}
                {#if trailing}
                  <!-- Host actions hidden from the compact row must remain
                       reachable here (for example Studio's timing editor). -->
                  <div class="compact-section">{@render trailing()}</div>
                {/if}
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      {/if}
    </div>

    {#if showBpmPopover && hasTempo}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        bind:this={popoverEl}
        class="bpm-popover"
        role="dialog"
        aria-label="Select tempo preset"
        tabindex="-1"
        onkeydown={handlePopoverKeydown}
      >
        <div class="bpm-presets" role="group" aria-label="BPM presets">
          {#each BPM_PRESETS as preset}
            <button
              class="bpm-preset"
              class:active={playback.bpm === preset}
              aria-pressed={playback.bpm === preset}
              onclick={(e) => {
                e.stopPropagation();
                selectPreset(preset);
              }}
            >
              {preset}
            </button>
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .unified-timeline {
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    padding: 0;
    box-sizing: border-box;
    position: relative;
    container-type: inline-size;
    container-name: playback-transport;
  }

  .transport-pill {
    display: flex;
    align-items: center;
    /* Wraps rather than overflows. Every control but the track is
       flex-shrink: 0, so in a column narrower than their combined intrinsic
       width the bar used to spill past its host and get clipped by whatever
       ancestor had overflow set — the mode toggle disappearing was the visible
       symptom. The track hits its 80px floor first, so a second row only
       appears when there is genuinely no room. */
    flex-wrap: wrap;
    gap: 8px 12px;
    padding: 10px 14px;
    width: 100%;
    box-sizing: border-box;
    background: rgba(20, 22, 32, 0.78);
    backdrop-filter: blur(24px) saturate(150%);
    border: none;
    border-top: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 0;
    touch-action: none;
  }

  .pill-play {
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    min-width: var(--min-touch-target, 44px);
    min-height: var(--min-touch-target, 44px);
    border-radius: 50%;
    background: #4338ca;
    border: 1px solid color-mix(in srgb, #4338ca 70%, white);
    color: white;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 15px;
    flex-shrink: 0;
    padding: 0;
    box-shadow: 0 2px 8px rgba(99, 102, 241, 0.35);
    transition:
      transform 120ms ease,
      background 150ms ease;
  }

  .pill-play:hover {
    transform: scale(1.08);
    background: color-mix(in srgb, #4338ca 85%, white 15%);
  }

  .pill-play:active {
    transform: scale(0.94);
  }

  .pill-track {
    flex: 1 1 0;
    height: var(--min-touch-target, 44px);
    background: transparent;
    position: relative;
    cursor: pointer;
    min-width: 80px;
    touch-action: none;
    display: flex;
    align-items: center;
  }

  .pill-track::before {
    content: "";
    position: absolute;
    left: 0;
    right: 0;
    top: 50%;
    height: 6px;
    transform: translateY(-50%);
    background: rgba(255, 255, 255, 0.08);
    border-radius: 999px;
    pointer-events: none;
  }

  .pill-track:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.7);
    border-radius: 8px;
  }

  .pill-fill {
    position: absolute;
    left: 0;
    top: 50%;
    height: 6px;
    transform: translateY(-50%);
    background: #4338ca;
    border-radius: 999px;
    pointer-events: none;
  }

  .pill-knob {
    position: absolute;
    top: 50%;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: white;
    transform: translate(-50%, -50%);
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.5);
    pointer-events: none;
  }

  .pill-beat-marker {
    position: absolute;
    top: 50%;
    width: 1.5px;
    height: 10px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 1px;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  /* ── Tempo group (−  BPM  +) ── */

  .tempo-group {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .tempo-adjust {
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    min-width: var(--min-touch-target, 44px);
    min-height: var(--min-touch-target, 44px);
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    border: 1.5px solid rgba(255, 255, 255, 0.2);
    color: rgba(255, 255, 255, 0.7);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    flex-shrink: 0;
    padding: 0;
    transition:
      background 150ms ease,
      color 150ms ease,
      border-color 150ms ease;
  }

  .tempo-adjust:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.35);
    color: white;
  }

  .tempo-adjust:active {
    transform: scale(0.93);
    background: rgba(255, 255, 255, 0.2);
  }

  .pill-bpm {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1px;
    padding: 6px 14px;
    min-height: var(--min-touch-target, 44px);
    background: rgba(99, 102, 241, 0.18);
    border: 1.5px solid rgba(99, 102, 241, 0.45);
    border-radius: 10px;
    cursor: pointer;
    flex-shrink: 0;
    transition:
      background 150ms ease,
      border-color 150ms ease;
    box-shadow: 0 0 12px rgba(99, 102, 241, 0.15);
  }

  .pill-bpm:hover {
    background: rgba(99, 102, 241, 0.28);
    border-color: rgba(99, 102, 241, 0.6);
    box-shadow: 0 0 16px rgba(99, 102, 241, 0.25);
  }

  .pill-bpm:active {
    transform: scale(0.96);
  }

  .bpm-val {
    font-size: 16px;
    font-weight: 700;
    color: white;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }

  .bpm-unit {
    font-size: var(--font-size-compact, 12px);
    font-weight: 600;
    color: rgba(255, 255, 255, 0.78);
    text-transform: uppercase;
    letter-spacing: 0.5px;
    line-height: 1;
  }

  /* The control itself is PlaybackModeToggle (layout="inline"); this slot only
     keeps it from being stretched by the bar's flex. */
  .pill-mode-slot {
    display: flex;
    flex: 0 0 auto;
  }

  .pill-trailing {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 0 0 auto;
    /* No `margin-left: auto` here. The track is `flex: 1 1 0`, so it already
       eats the free space and pushes this group flush right on a single row;
       an auto margin would only take effect once the bar wraps, where it
       right-aligns the last chip alone on its line and reads as an orphan. */
  }

  .pill-loop {
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    min-width: var(--min-touch-target, 44px);
    min-height: var(--min-touch-target, 44px);
    border-radius: 50%;
    background: rgba(99, 102, 241, 0.18);
    border: 1.5px solid rgba(99, 102, 241, 0.45);
    color: #c7d2fe;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    flex-shrink: 0;
    padding: 0;
    transition:
      background 150ms ease,
      border-color 150ms ease;
  }

  .pill-loop[aria-pressed="false"] {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.78);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .pill-loop:hover {
    background: rgba(99, 102, 241, 0.3);
    border-color: rgba(99, 102, 241, 0.6);
  }

  /* Compact transport ---------------------------------------------------
     A pane can be narrow because the whole device is narrow or because the
     viewer is split. Container width, not device width, is the useful fact. */
  .compact-more {
    display: none;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target, 44px);
    height: var(--min-touch-target, 44px);
    min-width: var(--min-touch-target, 44px);
    min-height: var(--min-touch-target, 44px);
    padding: 0;
    border: 1.5px solid rgba(255, 255, 255, 0.2);
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.88);
    cursor: pointer;
    flex: 0 0 auto;
    font-size: 16px;
    transition:
      background var(--duration-fast, 150ms) ease,
      border-color var(--duration-fast, 150ms) ease,
      transform var(--duration-fast, 150ms) ease;
  }

  .compact-more:hover,
  .compact-more[aria-expanded="true"] {
    background: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 24%,
      transparent
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #6366f1) 58%,
      transparent
    );
  }

  .compact-more:active {
    transform: scale(0.94);
  }

  .compact .transport-pill {
    flex-wrap: nowrap;
    gap: 8px;
    padding: 8px 10px;
  }

  .compact .tempo-group,
  .compact .pill-mode-slot,
  .compact .pill-loop,
  .compact .pill-trailing {
    display: none;
  }

  .compact .pill-track {
    min-width: 0;
  }
  .compact .compact-more {
    display: flex;
  }

  :global(.compact-playback-pop) {
    z-index: var(--z-dropdown, 1000);
    width: min(20rem, calc(100vw - 1.5rem));
    transform-origin: bottom right;
  }

  :global(.compact-playback-pop[data-state="open"]) {
    animation: compactPlaybackIn 170ms
      var(--ease-out, cubic-bezier(0.16, 1, 0.3, 1));
  }

  .compact-playback-panel {
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: 100%;
    max-height: min(
      31rem,
      var(--bits-popover-content-available-height, calc(100dvh - 2rem))
    );
    overflow-y: auto;
    padding: 14px;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.14));
    border-radius: 16px;
    background:
      linear-gradient(
        var(--theme-panel-bg, #0c0e16),
        var(--theme-panel-bg, #0c0e16)
      ),
      linear-gradient(
        var(--theme-panel-bg, #0c0e16),
        var(--theme-panel-bg, #0c0e16)
      ),
      var(--theme-panel-bg, #0c0e16);
    backdrop-filter: blur(24px) saturate(130%);
    box-shadow: 0 14px 42px rgba(0, 0, 0, 0.62);
    overscroll-behavior: contain;
  }

  .compact-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .compact-section + .compact-section,
  .compact-loop {
    padding-top: 12px;
    border-top: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.12));
  }

  .compact-section h3 {
    margin: 0;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.68));
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    letter-spacing: 0.06em;
    line-height: 1.2;
    text-transform: uppercase;
  }

  .compact-playback-panel .compact-section :global(.mode-btn) {
    min-height: var(--min-touch-target, 44px);
  }

  .compact-loop {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    min-height: var(--min-touch-target, 44px);
    margin: 0;
    background: transparent;
    color: var(--theme-text, white);
    border-right: 0;
    border-bottom: 0;
    border-left: 0;
    cursor: pointer;
    font-size: var(--font-size-min, 14px);
    font-weight: 700;
    text-align: left;
  }

  .compact-loop i {
    width: 20px;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.7));
    text-align: center;
  }

  .compact-loop.active i {
    color: var(--theme-accent, #818cf8);
  }

  .compact-setting-state {
    margin-left: auto;
    color: var(--theme-text-dim, rgba(255, 255, 255, 0.64));
    font-variant-numeric: tabular-nums;
  }

  @keyframes compactPlaybackIn {
    from {
      opacity: 0;
      transform: translateY(8px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  @container playback-transport (max-width: 64rem) {
    .transport-pill {
      flex-wrap: nowrap;
      gap: 8px;
      padding: 8px 10px;
    }

    .tempo-group,
    .pill-mode-slot,
    .pill-loop,
    .pill-trailing {
      display: none;
    }

    .pill-track {
      min-width: 0;
    }

    .compact-more {
      display: flex;
    }
  }

  /* ── BPM popover ── */

  .bpm-popover {
    position: absolute;
    bottom: 100%;
    left: 14px;
    margin-bottom: 8px;
    background: rgba(18, 18, 28, 0.96);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(99, 102, 241, 0.4);
    border-radius: 12px;
    padding: 8px;
    z-index: 30;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
    animation: popoverUp 150ms cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes popoverUp {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .bpm-presets {
    display: flex;
    gap: 4px;
  }

  .bpm-preset {
    padding: 8px 12px;
    min-width: var(--min-touch-target, 44px);
    min-height: var(--min-touch-target, 44px);
    background: rgba(255, 255, 255, 0.08);
    border: 1.5px solid rgba(255, 255, 255, 0.15);
    border-radius: 10px;
    color: rgba(255, 255, 255, 0.8);
    font-size: 14px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
    transition: all 150ms ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .bpm-preset:hover {
    background: rgba(255, 255, 255, 0.15);
    border-color: rgba(255, 255, 255, 0.3);
    color: white;
  }

  .bpm-preset.active {
    background: rgba(99, 102, 241, 0.3);
    border-color: rgba(99, 102, 241, 0.6);
    color: white;
    box-shadow: 0 0 12px rgba(99, 102, 241, 0.25);
  }

  .pill-play:focus-visible,
  .tempo-adjust:focus-visible,
  .pill-bpm:focus-visible,
  .pill-loop:focus-visible,
  .compact-more:focus-visible,
  .compact-loop:focus-visible,
  .bpm-preset:focus-visible {
    outline: 2px solid var(--theme-accent, #6366f1);
    outline-offset: 2px;
  }

  @media (prefers-reduced-motion: reduce) {
    .pill-play,
    .pill-loop,
    .pill-bpm,
    .tempo-adjust,
    .compact-more,
    .compact-loop,
    .bpm-preset {
      transition: none;
    }
    .bpm-popover {
      animation-duration: 0.01ms;
    }
    :global(.compact-playback-pop[data-state="open"]) {
      animation: none;
    }
    .pill-play:hover,
    .pill-play:active,
    .pill-bpm:active,
    .tempo-adjust:active,
    .compact-more:active {
      transform: none;
    }
  }
</style>
