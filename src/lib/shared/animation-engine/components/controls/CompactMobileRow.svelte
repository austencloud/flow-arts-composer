<!--
  CompactMobileRow.svelte

  Compact control row for mobile devices showing:
  - View toggle (left)
  - Play/pause button (center)
  - Expand toggle (right)
-->
<script lang="ts">
  import MobileToolViewToggle from "./MobileToolViewToggle.svelte";
  import ExpandToggleButton from "./ExpandToggleButton.svelte";

  type MobileToolView = "controls" | "step-grid";

  let {
    mobileToolView = "controls",
    isPlaying = false,
    isExpanded = false,
    onToggleToolView = () => {},
    onPlaybackToggle = () => {},
    onToggleExpanded = () => {},
  }: {
    mobileToolView?: MobileToolView;
    isPlaying?: boolean;
    isExpanded?: boolean;
    onToggleToolView?: () => void;
    onPlaybackToggle?: () => void;
    onToggleExpanded?: () => void;
  } = $props();
</script>

<div class="compact-row">
  <!-- Left: View Toggle -->
  <MobileToolViewToggle
    activeView={mobileToolView}
    onToggle={onToggleToolView}
  />

  <!-- Center: Play button -->
  <button
    class="play-pause-btn center-play"
    class:playing={isPlaying}
    onclick={onPlaybackToggle}
    aria-label={isPlaying ? "Pause animation" : "Play animation"}
    type="button"
  >
    <i class="fas {isPlaying ? 'fa-pause' : 'fa-play'}" aria-hidden="true"></i>
  </button>

  <!-- Right: Expand Toggle -->
  <ExpandToggleButton {isExpanded} onToggle={onToggleExpanded} />
</div>

<style>
  /* Compact mode row - layout: toggle (left), play (center), expand (right) */
  .compact-row {
    display: flex;
    flex-wrap: nowrap;
    justify-content: space-between;
    align-items: center;
    gap: 8px;
    position: relative;
  }

  .compact-row .center-play {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
  }

  /* Play/Pause Button */
  .play-pause-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--min-touch-target);
    height: var(--min-touch-target);
    flex-shrink: 0;
    background: color-mix(in srgb, var(--semantic-success) 25%, transparent);
    border: 1.5px solid
      color-mix(in srgb, var(--semantic-success) 40%, transparent);
    border-radius: 50%;
    color: var(--semantic-success);
    cursor: pointer;
    transition:
      background var(--duration-normal) var(--ease-standard),
      border-color var(--duration-normal) var(--ease-standard),
      color var(--duration-normal) var(--ease-standard),
      box-shadow var(--duration-normal) var(--ease-standard),
      transform var(--duration-normal) var(--ease-standard);
    box-shadow:
      0 2px 8px color-mix(in srgb, var(--semantic-success) 15%, transparent),
      0 0 16px color-mix(in srgb, var(--semantic-success) 10%, transparent),
      inset 0 1px 0 var(--theme-stroke);
    -webkit-tap-highlight-color: transparent;
    font-size: var(--font-size-base);
  }

  .play-pause-btn.playing {
    background: color-mix(in srgb, var(--semantic-error) 25%, transparent);
    border-color: color-mix(in srgb, var(--semantic-error) 40%, transparent);
    color: var(--semantic-error);
    box-shadow:
      0 2px 8px color-mix(in srgb, var(--semantic-error) 15%, transparent),
      0 0 16px color-mix(in srgb, var(--semantic-error) 10%, transparent),
      inset 0 1px 0 var(--theme-stroke);
  }

  @media (hover: hover) and (pointer: fine) {
    .play-pause-btn:hover {
      transform: translateX(-50%) scale(1.05);
      background: color-mix(in srgb, var(--semantic-success) 35%, transparent);
      border-color: color-mix(
        in srgb,
        var(--semantic-success) 60%,
        transparent
      );
      box-shadow:
        0 4px 14px color-mix(in srgb, var(--semantic-success) 25%, transparent),
        0 0 20px color-mix(in srgb, var(--semantic-success) 15%, transparent),
        inset 0 1px 0 var(--theme-card-hover-bg);
    }

    .play-pause-btn.playing:hover {
      background: color-mix(in srgb, var(--semantic-error) 35%, transparent);
      border-color: color-mix(in srgb, var(--semantic-error) 60%, transparent);
      box-shadow:
        0 4px 14px color-mix(in srgb, var(--semantic-error) 25%, transparent),
        0 0 20px color-mix(in srgb, var(--semantic-error) 15%, transparent),
        inset 0 1px 0 var(--theme-card-hover-bg);
    }
  }

  .play-pause-btn:active {
    transform: translateX(-50%) scale(0.96);
  }

  /* Responsive adjustments */
  @media (max-width: 480px) {
    .play-pause-btn {
      width: var(--min-touch-target);
      height: var(--min-touch-target);
      font-size: var(--font-size-sm);
    }
  }

  @media (max-width: 375px) and (max-height: 670px) {
    .play-pause-btn {
      width: 44px;
      height: 44px;
      font-size: var(--font-size-sm);
    }
  }
</style>
