<!--
  Floating music-player bubble - bottom-left of the museum.
  Collapsed: round button with a music note. Click to open.
  Expanded: panel listing candidate tracks for the current wing.
-->
<script lang="ts">
  import "../museum-theme.css";
  import { getSoundscapeContext } from "../../audio/soundscape-context";
  import SoundscapePanel from "./SoundscapePanel.svelte";

  const player = getSoundscapeContext();
</script>

<div class="soundscape-root museum-gold-scope">
  {#if player.panelOpen}
    <SoundscapePanel />
  {/if}

  <button
    type="button"
    class="bubble"
    class:playing={player.isPlaying}
    class:muted={player.muted}
    aria-label={player.panelOpen
      ? "Close soundscape panel"
      : "Open soundscape panel"}
    aria-expanded={player.panelOpen}
    onclick={() => player.togglePanel()}
  >
    {#if player.muted}
      <i class="fas fa-volume-mute" aria-hidden="true"></i>
    {:else if player.isPlaying}
      <i class="fas fa-music" aria-hidden="true"></i>
      <span class="pulse" aria-hidden="true"></span>
    {:else}
      <i class="fas fa-music" aria-hidden="true"></i>
    {/if}
  </button>
</div>

<style>
  .soundscape-root {
    position: fixed;
    bottom: 20px;
    left: 20px;
    z-index: 40;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    pointer-events: none;
  }

  .soundscape-root > :global(*) {
    pointer-events: auto;
  }

  .bubble {
    position: relative;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    border: 1px solid var(--museum-gold-25);
    background: rgba(18, 15, 12, 0.82);
    backdrop-filter: blur(8px);
    color: rgba(220, 200, 160, 0.85);
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      transform var(--duration-fast) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard),
      background var(--duration-normal) var(--ease-standard);
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
  }

  .bubble:hover {
    transform: scale(1.05);
    border-color: rgba(220, 200, 160, 0.5);
    background: rgba(28, 24, 20, 0.9);
  }

  .bubble:focus-visible {
    outline: 2px solid rgba(220, 200, 160, 0.7);
    outline-offset: 3px;
  }

  .bubble.muted {
    color: rgba(180, 180, 180, 0.45);
  }

  .pulse {
    position: absolute;
    inset: -3px;
    border-radius: 50%;
    border: 2px solid rgba(220, 200, 160, 0.5);
    animation: pulse-ring 2.2s ease-out infinite;
  }

  @keyframes pulse-ring {
    0% {
      transform: scale(0.9);
      opacity: 0.7;
    }
    100% {
      transform: scale(1.25);
      opacity: 0;
    }
  }
</style>
