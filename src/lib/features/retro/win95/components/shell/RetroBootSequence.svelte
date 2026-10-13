<!--
  RetroBootSequence - Animated startup screen for TKA-OS v1.0

  Three phases:
  1. Black screen with "Starting TKA-OS v1.0..." and blinking cursor (~2s)
  2. Splash screen with institute branding, lying progress bar, rotating
     status messages (~12s)
  3. Quick black flash, then dispatches oncomplete

  Click anywhere to skip. Shows "BOOT SEQUENCE INTERRUPTED" for 0.5s
  before completing.

  Domain: Retro Boot Animation
-->
<script lang="ts">
  import RetroProgressBar from "../primitives/RetroProgressBar.svelte";
  import { motionDuration } from "#lib/shared/transitions/motion.js";
  import { DURATION } from "#lib/shared/transitions/transitions.js";

  type BootPhase = "startup" | "splash" | "interrupted" | "done";

  let { oncomplete }: { oncomplete: () => void } = $props();

  let phase = $state<BootPhase>("startup");
  let progress = $state(0);
  let messageIndex = $state(0);

  /* Status messages - rotated during splash phase                       */

  const statusMessages = [
    "Loading NOTATION.DLL...",
    "Initializing SPIRAL.SYS...",
    "Calibrating prop physics engine...",
    "Checking for Order surveillance... NONE DETECTED",
    "Loading flame subsystem... (this may take a while)",
    "Resolving kinetic dependencies...",
    "Defragmenting movement database...",
  ];

  /* Progress waypoints - the bar lies                                   */

  const progressWaypoints = [
    { target: 12, duration: DURATION.scene * 1.875 },
    { target: 35, duration: DURATION.scene * 1.25 },
    { target: 28, duration: DURATION.scene },
    { target: 55, duration: DURATION.scene * 2.5 },
    { target: 54, duration: DURATION.dramatic + DURATION.fast },
    { target: 78, duration: DURATION.scene * 1.875 },
    { target: 92, duration: DURATION.scene * 2.5 },
    { target: 99, duration: DURATION.scene * 3.125 },
    { target: 100, duration: DURATION.dramatic + DURATION.fast },
  ];

  /* Animation state                                                     */

  let waypointIndex = 0;
  let animationStart = 0;
  let animationFrom = 0;
  let animationTarget = 0;
  let animationDuration = 0;
  let rafId: number | null = null;
  let messageIntervalId: ReturnType<typeof setInterval> | null = null;
  let waypointTimerId: ReturnType<typeof setTimeout> | null = null;

  /* Phase orchestration                                                 */

  $effect((): void | (() => void) => {
    if (phase === "startup") {
      const timer = setTimeout(() => {
        phase = "splash";
      }, 2000);
      return () => clearTimeout(timer);
    }
  });

  $effect((): void | (() => void) => {
    if (phase === "splash") {
      startProgressAnimation();
      startMessageRotation();

      return () => {
        stopProgressAnimation();
        stopMessageRotation();
      };
    }
  });

  $effect((): void | (() => void) => {
    if (phase === "interrupted") {
      const timer = setTimeout(() => {
        phase = "done";
        oncomplete();
      }, 500);
      return () => clearTimeout(timer);
    }
  });

  /* Unmount safety net - cancel any lingering timers / rAF              */

  $effect(() => {
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (messageIntervalId !== null) clearInterval(messageIntervalId);
      if (waypointTimerId !== null) clearTimeout(waypointTimerId);
    };
  });

  /* Progress bar animation (requestAnimationFrame)                      */

  function startProgressAnimation() {
    waypointIndex = 0;
    progress = 0;
    beginNextWaypoint();
  }

  function beginNextWaypoint() {
    if (waypointIndex >= progressWaypoints.length) {
      /* All waypoints complete - brief black flash then finish */
      stopProgressAnimation();
      stopMessageRotation();
      waypointTimerId = setTimeout(() => {
        waypointTimerId = null;
        if (phase === "splash") {
          phase = "done";
          oncomplete();
        }
      }, 300);
      return;
    }

    const wp = progressWaypoints[waypointIndex]!;
    animationFrom = progress;
    animationTarget = wp.target;
    animationDuration = motionDuration(wp.duration);
    if (animationDuration === 0) {
      progress = wp.target;
      waypointIndex++;
      beginNextWaypoint();
      return;
    }
    animationStart = performance.now();

    rafId = requestAnimationFrame(tickProgress);
  }

  function tickProgress(now: number) {
    const elapsed = now - animationStart;
    const t = Math.min(elapsed / animationDuration, 1);

    /* Ease in-out for smoother movement */
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    progress = animationFrom + (animationTarget - animationFrom) * eased;

    if (t < 1) {
      rafId = requestAnimationFrame(tickProgress);
    } else {
      progress = animationTarget;
      waypointIndex++;
      beginNextWaypoint();
    }
  }

  function stopProgressAnimation() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  /* Message rotation                                                    */

  function startMessageRotation() {
    messageIndex = 0;
    messageIntervalId = setInterval(() => {
      messageIndex = (messageIndex + 1) % statusMessages.length;
    }, 1800);
  }

  function stopMessageRotation() {
    if (messageIntervalId !== null) {
      clearInterval(messageIntervalId);
      messageIntervalId = null;
    }
  }

  /* Click to skip                                                       */

  function handleClick() {
    if (phase === "startup" || phase === "splash") {
      stopProgressAnimation();
      stopMessageRotation();
      phase = "interrupted";
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="boot-container" onclick={handleClick}>
  {#if phase === "startup"}
    <!-- Phase 1: Black screen startup text -->
    <div class="startup-screen">
      <span class="startup-text">Starting TKA-OS v1.0...</span>
      <span class="cursor"></span>
    </div>
  {:else if phase === "splash"}
    <!-- Phase 2: Splash screen with branding + lying progress -->
    <div class="splash-screen">
      <div class="splash-branding">
        <div class="institute-name">Bellweather Technical Institute</div>
        <div class="department-name">Department of Movement Sciences</div>
        <div class="copyright">(c) 1995 All Rights Reserved</div>
        <div class="version-label">TKA-OS v1.0</div>
      </div>

      <div class="splash-progress">
        <div class="progress-bar-wrapper">
          <RetroProgressBar value={progress} segmented={true} />
        </div>
        <div class="progress-info">
          <span class="progress-percentage">{Math.round(progress)}%</span>
        </div>
        <div class="status-message">{statusMessages[messageIndex]}</div>
      </div>
    </div>
  {:else if phase === "interrupted"}
    <!-- Click-to-skip: brief interruption message -->
    <div class="interrupted-screen">
      <span class="interrupted-text">BOOT SEQUENCE INTERRUPTED</span>
      <span class="interrupted-subtext">Loading desktop...</span>
    </div>
  {/if}
</div>

<style>
  /* Container - fills viewport, black, above everything                 */
  .boot-container {
    position: absolute;
    inset: 0;
    background: var(--retro-black, #000);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    font-family: var(--retro-font-mono, "Courier New", monospace);
    color: var(--retro-light-gray, #c0c0c0);
    cursor: default;
    z-index: var(--retro-z-boot, 1000);
    user-select: none;
  }

  /* Phase 1: Startup text with blinking cursor                          */
  .startup-screen {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .startup-text {
    font-size: 14px;
    color: var(--retro-light-gray, #c0c0c0);
  }

  .cursor {
    display: inline-block;
    width: 8px;
    height: 14px;
    background: var(--retro-light-gray, #c0c0c0);
    animation: blink 0.8s step-end infinite;
  }

  @keyframes blink {
    50% {
      opacity: 0;
    }
  }

  /* Phase 2: Splash screen                                              */
  .splash-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 48px;
  }

  .splash-branding {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .institute-name {
    font-size: 24px;
    font-weight: bold;
    color: var(--retro-white, #fff);
    letter-spacing: 1px;
  }

  .department-name {
    font-size: 16px;
    color: var(--retro-light-gray, #c0c0c0);
  }

  .copyright {
    font-size: 12px;
    color: var(--retro-dark-gray, #808080);
    margin-top: 4px;
  }

  .version-label {
    font-size: 14px;
    color: var(--retro-light-gray, #c0c0c0);
    margin-top: 8px;
  }

  /* Progress area                                                       */
  .splash-progress {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    width: 300px;
  }

  .progress-bar-wrapper {
    width: 100%;
  }

  .progress-info {
    width: 100%;
    display: flex;
    justify-content: flex-end;
  }

  .progress-percentage {
    font-size: 12px;
    color: var(--retro-light-gray, #c0c0c0);
    font-variant-numeric: tabular-nums;
  }

  .status-message {
    font-size: 12px;
    color: var(--retro-dark-gray, #808080);
    text-align: center;
    min-height: 16px;
  }

  /* Phase 3: Interrupted message                                        */
  .interrupted-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
  }

  .interrupted-text {
    font-size: 16px;
    color: var(--retro-white, #fff);
    font-weight: bold;
  }

  .interrupted-subtext {
    font-size: 14px;
    color: var(--retro-light-gray, #c0c0c0);
  }
</style>
