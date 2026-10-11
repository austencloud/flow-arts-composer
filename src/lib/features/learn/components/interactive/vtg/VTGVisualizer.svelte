<!--
VTGVisualizer - Animated visualization of VTG (Vulcan Tech Gospel) modes
Shows how the two hands coordinate across the timing and direction axes.
-->
<script lang="ts">
  import { getHapticFeedback } from "#lib/shared/application/get-haptic-feedback.js";

  type VTGMode = "SS" | "TS" | "SO" | "TO" | "QS" | "QO";

  let {
    mode = "SS" as VTGMode,
    autoPlay = false,
    showLabels = true,
  } = $props<{
    mode?: VTGMode;
    autoPlay?: boolean;
    showLabels?: boolean;
  }>();

  const hapticService = getHapticFeedback();

  // VTG mode info
  const VTG_INFO: Record<
    VTGMode,
    {
      name: string;
      color: string;
      direction: string;
      timing: string;
      description: string;
    }
  > = {
    SS: {
      name: "Split-Same",
      color: "#22D3EE",
      direction: "Same (both hands arc the same way)",
      timing: "Split (180° out of phase)",
      description: "Both hands arc the same way, held 180° out of phase",
    },
    TS: {
      name: "Together-Same",
      color: "#4ADE80",
      direction: "Same (both hands arc the same way)",
      timing: "Together (in sync at the downbeat)",
      description: "Both hands arc the same way, in sync",
    },
    SO: {
      name: "Split-Opposite",
      color: "#F472B6",
      direction: "Opposite (hands arc opposite ways)",
      timing: "Split (180° apart at the downbeat)",
      description:
        "Hands arc opposite ways, sweeping through together and apart; 180° apart at the downbeat",
    },
    TO: {
      name: "Together-Opposite",
      color: "#FB923C",
      direction: "Opposite (hands arc opposite ways)",
      timing: "Together (in sync at the downbeat)",
      description:
        "Hands arc opposite ways, sweeping through apart and back; together at the downbeat",
    },
    QS: {
      name: "Quarter-Same",
      color: "#A78BFA",
      direction: "Same (both hands arc the same way)",
      timing: "Quarter (90° out of phase)",
      description: "Both hands arc the same way, held 90° out of phase",
    },
    QO: {
      name: "Quarter-Opposite",
      color: "var(--semantic-warning)",
      direction: "Opposite (hands arc opposite ways)",
      timing: "Quarter (90° apart at the downbeat)",
      description:
        "Hands arc opposite ways, sweeping through together and apart; 90° apart at the downbeat",
    },
  };

  const LEFT_HAND_COLOR = "var(--prop-blue, #4A9EFF)";
  const RIGHT_HAND_COLOR = "var(--prop-red, #FF4A9E)";

  // Animation state
  let animating = $state(false);
  let animationProgress = $state(0);
  let hasPlayed = $state(false);

  // VTG splits into two independent axes (Flow Arts Knowledge MCP, "VTG"):
  //
  //   Timing (1st letter) = phase relationship at the downbeat:
  //     Together = in sync (0), Split = 180° out of phase (0.5), Quarter = 90° (0.25)
  //   Direction (2nd letter) = hand-path arc direction (NOT prop rotation):
  //     Same = both hands arc the same way (+1)
  //     Opposite = hands arc opposite ways (-1) → the gap is no longer fixed, so
  //     the two hands sweep through together and apart on every cycle.
  function timingOffset(vtgMode: VTGMode): number {
    switch (vtgMode[0]) {
      case "T":
        return 0; // Together — both hands hit the downbeat at the same moment
      case "S":
        return 0.5; // Split — 180° out of phase at the downbeat
      case "Q":
        return 0.25; // Quarter — 90° out of phase
      default:
        return 0;
    }
  }

  function arcSign(vtgMode: VTGMode): number {
    return vtgMode[1] === "O" ? -1 : 1; // Opposite counter-arcs the right hand
  }

  // Angle (radians) of a hand on the shared orbit. Progress 0 places the left
  // hand at the downbeat (bottom of the circle). The right hand carries the
  // timing offset and, for Opposite modes, the reversed arc direction — which is
  // what makes those modes visibly converge and diverge.
  const DOWNBEAT = Math.PI / 2; // bottom of the circle (SVG y grows downward)
  function handAngle(
    progress: number,
    isLeft: boolean,
    vtgMode: VTGMode
  ): number {
    if (isLeft) return DOWNBEAT + progress * Math.PI * 2;
    return (
      DOWNBEAT +
      arcSign(vtgMode) * progress * Math.PI * 2 +
      timingOffset(vtgMode) * Math.PI * 2
    );
  }

  // Both hands orbit the shared center circle; the downbeat is the bottom.
  function getPosition(angle: number): { x: number; y: number } {
    const center = 50;
    const orbitR = 18;
    return {
      x: center + Math.cos(angle) * orbitR,
      y: center + Math.sin(angle) * orbitR,
    };
  }

  // Current hand positions
  const leftPos = $derived(() => {
    const modeVal = mode as VTGMode;
    return getPosition(handAngle(animationProgress, true, modeVal));
  });

  const rightPos = $derived(() => {
    const modeVal = mode as VTGMode;
    return getPosition(handAngle(animationProgress, false, modeVal));
  });

  // Animation loop
  function playAnimation() {
    if (animating) return;

    animating = true;
    animationProgress = 0;
    hasPlayed = true;
    hapticService?.trigger("selection");

    const duration = 2000; // 2 seconds for full cycle
    const startTime = Date.now();

    function animate() {
      const elapsed = Date.now() - startTime;
      animationProgress = (elapsed % duration) / duration;

      if (elapsed < duration * 2) {
        // Run 2 full cycles
        requestAnimationFrame(animate);
      } else {
        animationProgress = 0;
        animating = false;
      }
    }

    requestAnimationFrame(animate);
  }

  // Auto-play on mount if enabled
  $effect(() => {
    if (autoPlay && !hasPlayed) {
      const timer = setTimeout(playAnimation, 500);
      return () => clearTimeout(timer);
    }
    return undefined;
  });
</script>

<div class="vtg-visualizer">
  <!-- Mode badge -->
  {#if true}
    {@const modeVal = mode as VTGMode}
    {@const info = VTG_INFO[modeVal]}
    <div class="mode-badge" style="--badge-color: {info.color}">
      <span class="badge-code">{modeVal}</span>
      <span class="badge-name">{info.name}</span>
    </div>
  {/if}

  <!-- Animation canvas -->
  <svg viewBox="0 0 100 100" class="vtg-canvas">
    <!-- Background grid -->
    <circle
      cx="50"
      cy="50"
      r="30"
      fill="none"
      stroke="var(--theme-stroke)"
      stroke-width="0.5"
      stroke-dasharray="2 2"
    />
    <line
      x1="20"
      y1="50"
      x2="80"
      y2="50"
      stroke="var(--theme-card-bg)"
      stroke-width="0.5"
    />
    <line
      x1="50"
      y1="20"
      x2="50"
      y2="80"
      stroke="var(--theme-card-bg)"
      stroke-width="0.5"
    />

    <!-- Center point -->
    <circle
      cx="50"
      cy="50"
      r="2"
      fill="var(--theme-stroke, rgba(255,255,255,0.2))"
    />

    <!-- Hand trails (when animating) -->
    {#if animating}
      {#if true}
        {@const left = leftPos()}
        {@const right = rightPos()}
        <circle
          cx={left.x}
          cy={left.y}
          r="4"
          fill={LEFT_HAND_COLOR}
          opacity="0.15"
        />
        <circle
          cx={right.x}
          cy={right.y}
          r="4"
          fill={RIGHT_HAND_COLOR}
          opacity="0.15"
        />
      {/if}
    {/if}

    <!-- Hand positions -->
    {#if true}
      {@const left = leftPos()}
      {@const right = rightPos()}

      <!-- Left hand -->
      <circle
        cx={left.x}
        cy={left.y}
        r="10"
        fill={LEFT_HAND_COLOR}
        opacity="0.2"
        class="hand-glow"
      />
      <circle
        cx={left.x}
        cy={left.y}
        r="6"
        fill={LEFT_HAND_COLOR}
        class="hand-point"
      />

      <!-- Right hand -->
      <circle
        cx={right.x}
        cy={right.y}
        r="10"
        fill={RIGHT_HAND_COLOR}
        opacity="0.2"
        class="hand-glow"
      />
      <circle
        cx={right.x}
        cy={right.y}
        r="6"
        fill={RIGHT_HAND_COLOR}
        class="hand-point"
      />

      <!-- Labels -->
      {#if showLabels}
        <text
          x={left.x}
          y={left.y - 12}
          text-anchor="middle"
          fill={LEFT_HAND_COLOR}
          font-size="5"
          font-weight="600">L</text
        >
        <text
          x={right.x}
          y={right.y - 12}
          text-anchor="middle"
          fill={RIGHT_HAND_COLOR}
          font-size="5"
          font-weight="600">R</text
        >
      {/if}
    {/if}
  </svg>

  <!-- Info panel -->
  {#if true}
    {@const modeVal = mode as VTGMode}
    {@const info = VTG_INFO[modeVal]}
    <div class="info-panel">
      <div class="info-row">
        <span class="info-label">Direction:</span>
        <span class="info-value">{info.direction}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Time:</span>
        <span class="info-value">{info.timing}</span>
      </div>
    </div>
  {/if}

  <!-- Play button -->
  <button
    class="play-button"
    onclick={playAnimation}
    disabled={animating}
    aria-label={animating ? "Playing animation" : "Play animation"}
  >
    {#if animating}
      <i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>
      Playing...
    {:else}
      <i class="fa-solid fa-play" aria-hidden="true"></i>
      Play Animation
    {/if}
  </button>
</div>

<style>
  .vtg-visualizer {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 1.25rem;
    background: var(--theme-card-bg, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--theme-stroke);
    border-radius: 16px;
  }

  /* Mode badge */
  .mode-badge {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.5rem 1rem;
    background: color-mix(in srgb, var(--badge-color) 15%, transparent);
    border: 1px solid color-mix(in srgb, var(--badge-color) 40%, transparent);
    border-radius: 20px;
  }

  .badge-code {
    font-size: 1rem;
    font-weight: 800;
    color: var(--badge-color);
    font-family: monospace;
  }

  .badge-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--badge-color);
  }

  /* Canvas */
  .vtg-canvas {
    width: 100%;
    max-width: 240px;
    height: auto;
    aspect-ratio: 1;
  }

  .hand-glow {
    animation: pulseGlow 1.5s ease-in-out infinite;
  }

  @keyframes pulseGlow {
    0%,
    100% {
      opacity: 0.2;
    }
    50% {
      opacity: 0.35;
    }
  }

  .hand-point {
    filter: drop-shadow(0 0 4px currentColor);
  }

  /* Info panel */
  .info-panel {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    width: 100%;
    max-width: 240px;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.8125rem;
  }

  .info-label {
    color: var(--theme-text-dim);
  }

  .info-value {
    color: var(--theme-text, rgba(255, 255, 255, 0.85));
    font-weight: 500;
  }

  /* Play button */
  .play-button {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 20%, transparent) 0%,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 20%, transparent) 100%
    );
    border: 1px solid
      color-mix(in srgb, var(--theme-accent, #22d3ee) 40%, transparent);
    border-radius: 10px;
    color: var(--theme-accent, #22d3ee);
    font-size: 0.9375rem;
    font-weight: 600;
    cursor: pointer;
    transition: all var(--duration-normal) ease;
    min-width: 140px;
  }

  .play-button:hover:not(:disabled) {
    background: linear-gradient(
      135deg,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 30%, transparent) 0%,
      color-mix(in srgb, var(--theme-accent, #22d3ee) 30%, transparent) 100%
    );
    border-color: color-mix(
      in srgb,
      var(--theme-accent, #22d3ee) 60%,
      transparent
    );
  }

  .play-button:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  @media (prefers-reduced-motion: reduce) {
    .hand-glow {
      animation: none;
    }
  }
</style>
