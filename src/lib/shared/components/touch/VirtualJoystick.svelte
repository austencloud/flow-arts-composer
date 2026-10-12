<script lang="ts">
  /**
   * VirtualJoystick
   *
   * Reusable virtual joystick for touch-based movement in 3D environments.
   * Renders a base ring with a movable knob that outputs normalized x/y values.
   *
   * Features:
   * - 48px+ touch targets (WCAG AAA compliant)
   * - Configurable size and position
   * - Deadzone support
   * - Smooth visual feedback
   */

  import { onMount, onDestroy } from "svelte";

  interface Props {
    /** Callback when joystick input changes (x: -1 to 1, y: -1 to 1) */
    onInput: (x: number, y: number) => void;
    /** Whether the joystick is enabled */
    enabled?: boolean;
    /** Position from left edge (pixels) */
    left?: number;
    /** Position from bottom edge (pixels) */
    bottom?: number;
    /** Outer ring diameter (pixels) */
    size?: number;
    /** Inner knob diameter (pixels, min 48 for touch accessibility) */
    knobSize?: number;
    /** Deadzone in pixels before registering input */
    deadzone?: number;
  }

  let {
    onInput,
    enabled = true,
    left = 24,
    bottom = 24,
    size = 120,
    knobSize = 56,
    deadzone = 8,
  }: Props = $props();

  // Joystick state
  let active = $state(false);
  let touchId = $state<number | null>(null);
  let offset = $state({ x: 0, y: 0 });

  // Calculated values
  const maxDistance = $derived((size - knobSize) / 2);
  const centerX = $derived(left + size / 2);
  let centerY = $state(0); // Set on mount based on window height

  // Check if a touch/click is in the joystick zone
  function isInZone(clientX: number, clientY: number): boolean {
    const zoneWidth = size + left * 2;
    const zoneHeight = size + bottom * 2;
    return clientX < zoneWidth && clientY > window.innerHeight - zoneHeight;
  }

  // Calculate normalized input from offset
  function calculateInput(
    offsetX: number,
    offsetY: number
  ): { x: number; y: number } {
    const distance = Math.sqrt(offsetX * offsetX + offsetY * offsetY);

    if (distance < deadzone) {
      return { x: 0, y: 0 };
    }

    // Normalize to -1 to 1 range
    const normalized = Math.min(distance, maxDistance) / maxDistance;
    const angle = Math.atan2(offsetY, offsetX);

    return {
      x: Math.cos(angle) * normalized,
      y: -Math.sin(angle) * normalized, // Invert Y (screen coords are inverted)
    };
  }

  // Touch handlers
  function handleTouchStart(e: TouchEvent) {
    if (!enabled || touchId !== null) return;

    for (const touch of Array.from(e.changedTouches)) {
      const { clientX, clientY, identifier } = touch;

      if (isInZone(clientX, clientY)) {
        touchId = identifier;
        active = true;
        offset = { x: 0, y: 0 };
        e.preventDefault();
        break;
      }
    }
  }

  function handleTouchMove(e: TouchEvent) {
    if (!enabled || touchId === null) return;

    for (const touch of Array.from(e.changedTouches)) {
      if (touch.identifier !== touchId) continue;

      const { clientX, clientY } = touch;

      let offsetX = clientX - centerX;
      let offsetY = clientY - centerY;

      // Clamp to max distance
      const distance = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
      if (distance > maxDistance) {
        offsetX = (offsetX / distance) * maxDistance;
        offsetY = (offsetY / distance) * maxDistance;
      }

      offset = { x: offsetX, y: offsetY };

      const input = calculateInput(offsetX, offsetY);
      onInput(input.x, input.y);
      e.preventDefault();
      break;
    }
  }

  function handleTouchEnd(e: TouchEvent) {
    for (const touch of Array.from(e.changedTouches)) {
      if (touch.identifier === touchId) {
        reset();
        break;
      }
    }
  }

  function reset() {
    touchId = null;
    active = false;
    offset = { x: 0, y: 0 };
    onInput(0, 0);
  }

  // Mouse handlers (for DevTools touch emulation fallback)
  let isMouseActive = $state(false);

  function handleMouseDown(e: MouseEvent) {
    if (!enabled || isMouseActive) return;
    if (!isInZone(e.clientX, e.clientY)) return;

    isMouseActive = true;
    active = true;
    offset = { x: 0, y: 0 };
    e.preventDefault();
  }

  function handleMouseMove(e: MouseEvent) {
    if (!enabled || !isMouseActive) return;

    let offsetX = e.clientX - centerX;
    let offsetY = e.clientY - centerY;

    // Clamp to max distance
    const distance = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
    if (distance > maxDistance) {
      offsetX = (offsetX / distance) * maxDistance;
      offsetY = (offsetY / distance) * maxDistance;
    }

    offset = { x: offsetX, y: offsetY };

    const input = calculateInput(offsetX, offsetY);
    onInput(input.x, input.y);
  }

  function handleMouseUp() {
    if (isMouseActive) {
      isMouseActive = false;
      reset();
    }
  }

  // Lifecycle
  onMount(() => {
    // Set vertical center position (from bottom)
    centerY = window.innerHeight - bottom - size / 2;

    // Touch events
    window.addEventListener("touchstart", handleTouchStart, { passive: false });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("touchcancel", handleTouchEnd);

    // Mouse events (fallback)
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    const handleResize = () => {
      centerY = window.innerHeight - bottom - size / 2;
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  });

  onDestroy(() => {
    window.removeEventListener("touchstart", handleTouchStart);
    window.removeEventListener("touchmove", handleTouchMove);
    window.removeEventListener("touchend", handleTouchEnd);
    window.removeEventListener("touchcancel", handleTouchEnd);
    window.removeEventListener("mousedown", handleMouseDown);
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
  });
</script>

{#if enabled}
  <div class="joystick-container" aria-hidden="true">
    <!-- Base ring -->
    <div
      class="joystick-base"
      class:active
      style="
        left: {left}px;
        bottom: {bottom}px;
        width: {size}px;
        height: {size}px;
      "
    >
      <!-- Movable knob -->
      <div
        class="joystick-knob"
        style="
          width: {knobSize}px;
          height: {knobSize}px;
          transform: translate({offset.x}px, {offset.y}px);
        "
      ></div>
    </div>
  </div>
{/if}

<style>
  .joystick-container {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 100;
    touch-action: none;
  }

  .joystick-base {
    position: absolute;
    border-radius: 50%;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.15));
    border: 2px solid var(--theme-stroke-strong, rgba(255, 255, 255, 0.3));
    display: flex;
    align-items: center;
    justify-content: center;
    transition: opacity var(--duration-fast) var(--ease-standard);
    opacity: 0.6;
    pointer-events: auto;
    touch-action: none;
  }

  .joystick-base.active {
    opacity: 1;
    background: var(--theme-card-hover-bg, rgba(255, 255, 255, 0.2));
    border-color: var(--theme-stroke-strong, rgba(255, 255, 255, 0.5));
  }

  .joystick-knob {
    border-radius: 50%;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.8));
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    transition: transform var(--duration-instant) var(--ease-standard-out);
  }

  .joystick-base.active .joystick-knob {
    background: white;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
  }

  /* Respect reduced motion preferences */
  @media (prefers-reduced-motion: reduce) {
    .joystick-base,
    .joystick-knob {
      transition: none;
    }
  }
</style>
