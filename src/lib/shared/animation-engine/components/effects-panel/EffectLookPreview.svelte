<script lang="ts">
  import type { EffectLookPreviewModel } from "./effect-look-preview";
  import { SPARKLE_ARC_PATH, createSparkleField } from "./effect-look-preview";

  interface Props {
    model: EffectLookPreviewModel;
    active?: boolean;
  }

  const { model, active = false }: Props = $props();
  const colorA = $derived(model.colors[0] ?? "#94a3b8");
  const colorB = $derived(model.colors[1] ?? colorA);
  const colorC = $derived(model.colors[2] ?? colorB);
  // Seeded off model.signature, so the field is stable until the preset changes.
  const sparkleField = $derived(
    model.motif === "sparkles" ? createSparkleField(model) : []
  );
</script>

<div
  class="look-preview"
  class:active
  style="--preview-a: {colorA}; --preview-b: {colorB}; --preview-c: {colorC}; --preview-energy: {model.energy}; --preview-extent: {model.extent};"
  aria-hidden="true"
>
  <svg viewBox="0 0 120 56" preserveAspectRatio="none">
    {#if model.motif === "trail"}
      <path class="ghost-stroke" d="M2 43 C22 7 39 48 63 22 S93 6 118 14" />
      <path
        class="stroke-a motion-drift"
        d="M2 39 C22 3 39 44 63 18 S93 2 118 10"
      />
      <path class="stroke-b" d="M1 48 C24 14 41 53 66 27 S95 12 119 20" />
    {:else if model.motif === "fire"}
      <path
        class="fill-b motion-pulse"
        d="M22 53 C14 41 23 33 31 25 C29 36 39 35 40 18 C52 30 55 39 48 53 Z"
      />
      <path
        class="fill-a motion-pulse delay"
        d="M48 53 C39 38 53 31 57 9 C73 26 78 38 69 53 Z"
      />
      <path
        class="fill-c motion-pulse slow"
        d="M72 53 C65 43 76 35 82 22 C94 35 101 45 94 53 Z"
      />
    {:else if model.motif === "led"}
      <path class="dim-line" d="M4 36 C25 8 47 47 69 21 S99 5 116 17" />
      {#each [12, 27, 42, 57, 72, 87, 102] as x, i}
        <circle
          class:fill-a={i % 3 === 0}
          class:fill-b={i % 3 === 1}
          class:fill-c={i % 3 === 2}
          cx={x}
          cy={i % 2 === 0 ? 28 : 21}
          r="4.5"
        />
      {/each}
    {:else if model.motif === "embers"}
      <path
        class="stroke-b motion-drift"
        d="M10 48 Q35 35 57 17 Q75 5 108 10"
      />
      {#each [[18, 42, 3], [34, 33, 2], [49, 25, 4], [66, 17, 2], [82, 13, 3], [101, 9, 2]] as ember, i}
        <circle
          class:fill-a={i % 2 === 0}
          class:fill-b={i % 2 === 1}
          cx={ember[0]}
          cy={ember[1]}
          r={ember[2]}
        />
      {/each}
    {:else if model.motif === "zap"}
      {#if model.variant === "web"}
        <path
          class="stroke-a"
          d="M4 43 L24 11 L48 35 L70 8 L92 33 L116 12 M24 11 L70 8 M48 35 L92 33 M4 43 L92 33"
        />
        <circle class="fill-b" cx="48" cy="35" r="3" />
        <circle class="fill-c" cx="70" cy="8" r="3" />
      {:else if model.variant === "plasma"}
        <path
          class="ghost-stroke wide"
          d="M3 34 C18 5 31 52 47 19 S77 48 91 15 S108 25 118 8"
        />
        <path
          class="stroke-a wide motion-drift"
          d="M3 34 C18 5 31 52 47 19 S77 48 91 15 S108 25 118 8"
        />
      {:else}
        <path
          class="stroke-a"
          d="M3 41 L24 18 L39 26 L57 7 L75 24 L94 12 L117 19"
        />
        <path
          class="stroke-b thin"
          d="M24 18 L17 7 M39 26 L47 42 M57 7 L65 1 M75 24 L69 43 M94 12 L105 2"
        />
      {/if}
    {:else if model.motif === "sparkles"}
      <!-- Four-point stars on a swept arc, laid out from the preset's own
           density / glint size / fall / spawn mode - see createSparkleField. -->
      <path class="dim-line" d={SPARKLE_ARC_PATH} />
      {#each sparkleField as glint, i (i)}
        <g
          transform={`translate(${glint.x.toFixed(2)} ${glint.y.toFixed(2)}) rotate(${glint.rot.toFixed(1)})`}
          style:--glint-color={model.colors[glint.ci] ?? colorA}
          style:opacity={glint.opacity}
        >
          <!-- Twinkle lives on an inner group so the keyframed opacity composes
               with the per-glint age opacity above instead of replacing it. -->
          <g class="glint" style:animation-delay={`${(i % 5) * -0.38}s`}>
            <path
              class="glint-star"
              d={`M0 ${-glint.r} Q${glint.r * 0.16} ${-glint.r * 0.16} ${glint.r} 0 Q${glint.r * 0.16} ${glint.r * 0.16} 0 ${glint.r} Q${-glint.r * 0.16} ${glint.r * 0.16} ${-glint.r} 0 Q${-glint.r * 0.16} ${-glint.r * 0.16} 0 ${-glint.r} Z`}
            />
            <circle class="glint-core" r={Math.max(0.35, glint.r * 0.22)} />
          </g>
        </g>
      {/each}
    {:else if model.motif === "ghost"}
      {#each [0, 1, 2, 3] as i}
        <g
          class="ghost-copy"
          style:opacity={0.18 + i * 0.15}
          transform={`translate(${12 + i * 25} ${10 - i * 2}) rotate(${-18 + i * 12} 8 20)`}
        >
          <rect
            class={i % 2 === 0 ? "fill-a" : "fill-b"}
            x="4"
            y="3"
            width="8"
            height="36"
            rx="4"
          />
          <circle
            class={i % 2 === 0 ? "fill-a" : "fill-b"}
            cx="8"
            cy="4"
            r="5"
          />
        </g>
      {/each}
    {:else if model.motif === "bloom"}
      {#if model.variant === "starburst"}
        <g class="motion-spin" transform="translate(60 28)">
          {#each [0, 30, 60, 90, 120, 150] as angle}
            <line
              class="stroke-b thin"
              x1="0"
              y1="-23"
              x2="0"
              y2="23"
              transform={`rotate(${angle})`}
            />
          {/each}
        </g>
        <circle class="fill-a motion-pulse" cx="60" cy="28" r="11" />
      {:else if model.variant === "comet"}
        <path class="ghost-stroke wide" d="M7 43 C34 35 53 30 81 23" />
        <path class="stroke-b wide" d="M7 43 C34 35 53 30 81 23" />
        <circle class="fill-a motion-pulse" cx="88" cy="21" r="13" />
      {:else}
        <circle class="stroke-b wide motion-pulse" cx="60" cy="28" r="19" />
        <circle class="fill-a" cx="60" cy="28" r="5" />
      {/if}
    {:else if model.motif === "goo"}
      <path
        class="fill-a motion-pulse"
        d="M8 39 C12 23 31 23 39 32 C45 12 70 11 78 29 C91 20 111 27 112 43 C95 53 28 53 8 39 Z"
      />
      <circle class="fill-b" cx="38" cy="47" r="5" />
      <circle class="fill-c" cx="86" cy="48" r="3" />
    {:else if model.motif === "bubbles"}
      {#each [[16, 40, 8], [32, 20, 5], [51, 35, 11], [72, 17, 7], [91, 35, 9], [108, 14, 4]] as bubble, i}
        <circle
          class={i % 2 === 0 ? "stroke-a" : "stroke-b"}
          cx={bubble[0]}
          cy={bubble[1]}
          r={bubble[2]}
        />
      {/each}
    {:else if model.motif === "petals"}
      {#each [[16, 39, -25], [34, 19, 30], [54, 37, 10], [75, 16, -35], [95, 35, 28], [110, 13, -10]] as petal, i}
        <ellipse
          class:fill-a={i % 3 === 0}
          class:fill-b={i % 3 === 1}
          class:fill-c={i % 3 === 2}
          cx={petal[0]}
          cy={petal[1]}
          rx="7"
          ry="3.5"
          transform={`rotate(${petal[2]} ${petal[0]} ${petal[1]})`}
        />
      {/each}
    {:else if model.motif === "smoke"}
      <path
        class="stroke-a wide motion-drift"
        d="M6 45 C24 27 38 51 48 31 S73 29 67 13 S91 2 114 13"
      />
      <path
        class="stroke-b wide faint"
        d="M14 50 C31 32 42 54 58 37 S84 34 80 18 S100 9 116 20"
      />
    {:else if model.motif === "ink"}
      <path
        class="stroke-a brush motion-drift"
        d="M5 42 C29 12 45 50 68 22 S97 8 116 18"
      />
      {#each [[23, 16, 3], [47, 45, 2], [74, 9, 4], [96, 34, 3], [109, 8, 2]] as drop, i}
        <circle
          class={i % 2 === 0 ? "fill-b" : "fill-c"}
          cx={drop[0]}
          cy={drop[1]}
          r={drop[2]}
        />
      {/each}
    {:else if model.motif === "frost"}
      {#each [[20, 36], [50, 18], [78, 37], [103, 16]] as crystal, i}
        <g
          class="motion-spin"
          transform={`translate(${crystal[0]} ${crystal[1]})`}
        >
          {#each [0, 60, 120] as angle}
            <line
              class={i % 2 === 0 ? "stroke-a thin" : "stroke-b thin"}
              x1="-8"
              y1="0"
              x2="8"
              y2="0"
              transform={`rotate(${angle})`}
            />
          {/each}
        </g>
      {/each}
    {:else if model.motif === "silk"}
      <path
        class="stroke-a ribbon motion-drift"
        d="M3 39 C21 4 43 50 62 17 S94 45 117 9"
      />
      <path
        class="stroke-b ribbon faint"
        d="M3 46 C24 11 44 55 66 24 S96 51 118 16"
      />
    {:else if model.motif === "animal"}
      {#if model.variant === "caterpillar"}
        {#each [20, 34, 48, 62, 76, 90, 104] as x, i}
          <circle
            class:fill-a={i % 2 === 0}
            class:fill-b={i % 2 === 1}
            cx={x}
            cy={32 - Math.sin(i) * 8}
            r={i === 6 ? 8 : 7}
          />
        {/each}
      {:else}
        <path
          class="stroke-a animal-body motion-drift"
          d="M4 39 C23 7 43 50 64 20 S95 45 114 13"
        />
        <circle class="fill-b" cx="114" cy="13" r="7" />
        <circle class="eye" cx="116" cy="11" r="1.5" />
      {/if}
    {:else if model.motif === "pulse"}
      {#each [10, 18, 26] as radius, i}
        <circle
          class:stroke-a={i % 2 === 0}
          class:stroke-b={i % 2 === 1}
          class="motion-pulse"
          cx="60"
          cy="28"
          r={radius}
          style:opacity={0.9 - i * 0.25}
        />
      {/each}
      <circle class="fill-c" cx="60" cy="28" r="4" />
    {/if}
  </svg>
</div>

<style>
  .look-preview {
    width: 100%;
    aspect-ratio: 15 / 7;
    overflow: hidden;
    border-radius: 8px;
    background:
      radial-gradient(
        circle at 50% 45%,
        color-mix(in srgb, var(--preview-a) 16%, transparent),
        transparent 58%
      ),
      color-mix(in srgb, var(--theme-panel-bg, #11131a) 86%, black);
    border: 1px solid
      color-mix(in srgb, var(--preview-a) 20%, var(--theme-stroke));
  }

  svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  path,
  line,
  circle,
  ellipse,
  rect {
    vector-effect: non-scaling-stroke;
  }

  .stroke-a,
  .stroke-b,
  .stroke-c,
  .ghost-stroke,
  .dim-line {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .stroke-a {
    stroke: var(--preview-a);
    stroke-width: 2.5;
    filter: drop-shadow(0 0 4px var(--preview-a));
  }
  .stroke-b {
    stroke: var(--preview-b);
    stroke-width: 2.5;
    filter: drop-shadow(0 0 4px var(--preview-b));
  }
  .stroke-c {
    stroke: var(--preview-c);
    stroke-width: 2.5;
  }
  .ghost-stroke {
    stroke: color-mix(in srgb, var(--preview-a) 35%, transparent);
    stroke-width: 8;
    filter: blur(3px);
  }
  .dim-line {
    stroke: color-mix(in srgb, var(--theme-text) 22%, transparent);
    stroke-width: 1.25;
  }
  .fill-a {
    fill: var(--preview-a);
    filter: drop-shadow(0 0 5px var(--preview-a));
  }
  .fill-b {
    fill: var(--preview-b);
    filter: drop-shadow(0 0 5px var(--preview-b));
  }
  .fill-c {
    fill: var(--preview-c);
    filter: drop-shadow(0 0 5px var(--preview-c));
  }
  .wide {
    stroke-width: 5;
  }
  .thin {
    stroke-width: 1.25;
  }
  .faint {
    opacity: 0.4;
  }
  .brush {
    stroke-width: calc(5px + var(--preview-extent) * 5px);
  }
  .ribbon {
    stroke-width: calc(4px + var(--preview-extent) * 4px);
  }
  .animal-body {
    stroke-width: calc(5px + var(--preview-extent) * 5px);
  }
  .eye {
    fill: white;
  }

  .glint-star {
    fill: var(--glint-color);
    filter: drop-shadow(0 0 2.5px var(--glint-color));
  }
  .glint-core {
    fill: #fff;
  }
  .active .glint {
    animation: preview-twinkle 1.9s ease-in-out infinite;
  }

  .active .motion-pulse {
    animation: preview-pulse var(--preview-cycle-duration, 1.8s) ease-in-out
      infinite;
    transform-box: fill-box;
    transform-origin: center;
  }
  .active .motion-drift {
    animation: preview-drift 2.4s ease-in-out infinite alternate;
  }
  .active .motion-spin {
    animation: preview-spin 7s linear infinite;
    transform-box: fill-box;
    transform-origin: center;
  }
  .active .delay {
    animation-delay: -0.6s;
  }
  .active .slow {
    --preview-cycle-duration: 2.6s;
  }

  @keyframes preview-pulse {
    0%,
    100% {
      opacity: 0.72;
      transform: scale(0.94);
    }
    50% {
      opacity: 1;
      transform: scale(1.05);
    }
  }

  @keyframes preview-drift {
    from {
      transform: translateX(-1.5px);
    }
    to {
      transform: translateX(1.5px);
    }
  }

  @keyframes preview-spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Opacity only - the parent group owns the glint's transform. */
  @keyframes preview-twinkle {
    0%,
    100% {
      opacity: 0.55;
    }
    50% {
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .active .motion-pulse,
    .active .motion-drift,
    .active .motion-spin,
    .active .glint {
      animation: none;
    }
  }
</style>
