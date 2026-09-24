<script lang="ts">
  /**
   * PropMotionEffects Component
   *
   * Combined motion effects wrapper for a single prop.
   * Provides motion blur (ghost trail) and speed lines effects.
   *
   * Manages previous position tracking internally, so consumers
   * only need to pass the current position.
   */

  import { Vector3 } from "three";
  import { reactivePropHandPalette } from "@austencloud/scene-3d";
  import MotionBlur from "./MotionBlur.svelte";
  import SpeedLines from "./SpeedLines.svelte";

  interface Props {
    /** Current prop position in world space */
    position: Vector3;
    /** Performer-relative prop identity. */
    hand: "left" | "right";
    /** Enable motion blur effect */
    enableBlur?: boolean;
    /** Enable speed lines effect */
    enableSpeedLines?: boolean;
    /** Effect intensity (0-1) */
    intensity?: number;
    /** Minimum velocity to trigger effects (units per frame) */
    threshold?: number;
  }

  let {
    position,
    hand,
    enableBlur = true,
    enableSpeedLines = true,
    intensity = 0.6,
    threshold = 5,
  }: Props = $props();

  // The hand's prop colors
  const palette = $derived(reactivePropHandPalette(hand === "left" ? "blue" : "red"));
  const colorHex = $derived(palette.main);
  const colorLight = $derived(palette.light);

  // Track previous position internally - synced with position on mount
  let previousPosition = $state(new Vector3());
  let hasInitializedPosition = $state(false);

  // Initialize previousPosition when position first becomes available
  $effect(() => {
    if (!hasInitializedPosition) {
      previousPosition = position.clone();
      hasInitializedPosition = true;
    }
  });

  // Update previous position when current position changes
  $effect(() => {
    // Store current as previous for next frame
    const current = position.clone();

    // Use setTimeout to ensure this runs after render
    const timeoutId = setTimeout(() => {
      previousPosition = current;
    }, 0);

    return () => clearTimeout(timeoutId);
  });
</script>

{#if enableBlur}
  <MotionBlur
    currentPosition={position}
    {previousPosition}
    enabled={enableBlur}
    {intensity}
    {threshold}
    color={colorHex}
    trailCount={5}
    ghostSize={8}
  />
{/if}

{#if enableSpeedLines}
  <SpeedLines
    currentPosition={position}
    {previousPosition}
    enabled={enableSpeedLines}
    intensity={intensity * 0.8}
    {threshold}
    color={colorLight}
    lineCount={5}
    maxLength={0.6}
    spread={12}
  />
{/if}
