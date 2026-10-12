<script lang="ts">
  import type { AvatarState } from "../../state/avatar-state.svelte";

  interface Props {
    x: number;
    y: number;
    facing: string; // 8-direction: north, northeast, east, southeast, south, southwest, west, northwest
    tileSize: number;
    isMoving: boolean;
    avatar: AvatarState;
  }

  let { x, y, facing, tileSize, isMoving, avatar }: Props = $props();

  const FACING_ROTATION: Record<string, number> = {
    north: 0,
    northeast: 45,
    east: 90,
    southeast: 135,
    south: 180,
    southwest: 225,
    west: 270,
    northwest: 315,
  };

  let posStyle = $derived(
    `transform: translate(${x * tileSize}px, ${y * tileSize}px); ` +
      `width: ${tileSize}px; height: ${tileSize}px;`
  );

  // All sizes relative to tileSize
  let ts = $derived(tileSize);
  let facingDeg = $derived(FACING_ROTATION[facing]);
</script>

<div class="museum-player" class:moving={isMoving} style={posStyle}>
  <div
    class="figure-rotator"
    style="transform: rotate({facingDeg}deg); width: {ts}px; height: {ts}px;"
  >
    <!-- Hair: sits on top of head -->
    <div
      class="figure-hair"
      style="
        width: {ts * 0.4}px;
        height: {ts * 0.22}px;
        background: {avatar.config.hairColor};
        left: {ts * 0.3}px;
        top: {ts * 0.08}px;
      "
    ></div>

    <!-- Head -->
    <div
      class="figure-head"
      style="
        width: {ts * 0.38}px;
        height: {ts * 0.32}px;
        background: {avatar.skinGradient};
        left: {ts * 0.31}px;
        top: {ts * 0.12}px;
      "
    ></div>

    <!-- Body -->
    <div
      class="figure-body"
      style="
        width: {ts * 0.65}px;
        height: {ts * 0.48}px;
        background: {avatar.jacketGradient};
        left: {ts * 0.175}px;
        top: {ts * 0.38}px;
      "
    ></div>
  </div>
</div>

<style>
  .museum-player {
    position: absolute;
    top: 0;
    left: 0;
    pointer-events: none;
    z-index: 20;
    will-change: transform;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .figure-rotator {
    position: relative;
    transition: transform var(--duration-instant) var(--ease-standard);
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3));
  }

  .figure-hair {
    position: absolute;
    border-radius: 50% 50% 30% 30%;
    z-index: 3;
  }

  .figure-head {
    position: absolute;
    border-radius: 50%;
    border: 1px solid rgba(0, 0, 0, 0.1);
    z-index: 2;
    animation: idle-breathe 3.5s ease-in-out infinite;
  }

  .figure-body {
    position: absolute;
    border-radius: 5px 5px 3px 3px;
    border: 1px solid rgba(0, 0, 0, 0.08);
    z-index: 1;
  }

  @keyframes idle-breathe {
    0%,
    100% {
      transform: translateY(0) scale(1);
    }
    50% {
      transform: translateY(-0.4px) scale(1.02);
    }
  }

  .moving .figure-head {
    animation: walk-bob 0.32s steps(2) infinite;
  }

  .moving .figure-body {
    animation: walk-sway 0.32s steps(2) infinite;
  }

  @keyframes walk-bob {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-1.5px);
    }
  }

  @keyframes walk-sway {
    0%,
    100% {
      transform: translateX(0) rotate(0deg);
    }
    50% {
      transform: translateX(0.5px) rotate(1deg);
    }
  }
</style>
