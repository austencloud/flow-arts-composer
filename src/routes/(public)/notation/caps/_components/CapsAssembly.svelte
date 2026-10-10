<!--
  CapsAssembly — the juicy "watch it assemble" demonstration for the What-is
  card. The Yuta CAP's two fragments draw on in two colors: the PRO extension
  half (E->S->W) in cyan, then the ANTI antispin half (W->S->E) in pink, a
  glowing tip leading each stroke, then both hold as one closed loop. Replay
  redraws. Reduced motion shows the finished two-colour loop with no draw-on.

  Geometry reuses the mandala calculator on the two step-halves of the real
  sequence (both halves are out->out, so each computes correctly in isolation),
  with the same club tip (dx 150) as the live hero, so this is the exact path
  the prop traces, just split and colour-coded.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { calculate as calculateMandalaGeometry } from "#lib/shared/mandala/services/mandala-geometry-calculator.js";
  import { buildYutaCapSequence } from "./yuta-cap-sequence";

  const EXT_COLOR = "#38bdf8"; // extension half (PRO)
  const ANTI_COLOR = "#f472b6"; // antispin half (ANTI)
  const DRAW_MS = 2600;

  const seq = buildYutaCapSequence();
  const opts = { tipEnds: 1 as const, pathShape: "arc" as const };
  const tip = { dx: 150, dy: 0 };
  const pathA =
    calculateMandalaGeometry(seq.steps.slice(0, 2), undefined, undefined, opts, tip).right[0]?.d ?? "";
  const pathB =
    calculateMandalaGeometry(seq.steps.slice(2, 4), undefined, undefined, opts, tip).right[0]?.d ?? "";

  const reduceMotion = new MediaQuery("(prefers-reduced-motion: reduce)");

  let aEl = $state<SVGPathElement | null>(null);
  let bEl = $state<SVGPathElement | null>(null);
  let la = $state(1);
  let lb = $state(1);
  let drawnA = $state(0);
  let drawnB = $state(0);
  let marker = $state<{ x: number; y: number; anti: boolean } | null>(null);
  let raf = 0;

  function lengths() {
    la = aEl?.getTotalLength() ?? 1;
    lb = bEl?.getTotalLength() ?? 1;
  }

  function play() {
    cancelAnimationFrame(raf);
    lengths();
    if (reduceMotion.current) {
      drawnA = la;
      drawnB = lb;
      marker = null;
      return;
    }
    const total = la + lb;
    const start = performance.now();
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / DRAW_MS);
      const drawn = t * total;
      if (drawn <= la) {
        drawnA = drawn;
        drawnB = 0;
        const p = aEl?.getPointAtLength(drawn);
        marker = p ? { x: p.x, y: p.y, anti: false } : null;
      } else {
        drawnA = la;
        drawnB = drawn - la;
        const p = bEl?.getPointAtLength(Math.min(drawn - la, lb));
        marker = t >= 1 ? null : p ? { x: p.x, y: p.y, anti: true } : null;
      }
      if (t < 1) raf = requestAnimationFrame(frame);
      else marker = null;
    };
    raf = requestAnimationFrame(frame);
  }

  onMount(() => {
    lengths();
    play();
    return () => cancelAnimationFrame(raf);
  });
</script>

<div class="assembly">
  <svg class="assembly-stage" viewBox="-176 -176 352 352" role="img" aria-label="The two halves of the CAP drawing on and joining into one closed loop">
    <defs>
      <filter id="caps-assembly-glow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="4" result="b" />
        <feMerge>
          <feMergeNode in="b" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>

    <!-- faint target loop -->
    <path class="ghost" d={pathA} />
    <path class="ghost" d={pathB} />

    <!-- drawn fragments -->
    <path
      bind:this={aEl}
      class="frag"
      d={pathA}
      stroke={EXT_COLOR}
      style:stroke-dasharray={la}
      style:stroke-dashoffset={la - drawnA}
    />
    <path
      bind:this={bEl}
      class="frag"
      d={pathB}
      stroke={ANTI_COLOR}
      style:stroke-dasharray={lb}
      style:stroke-dashoffset={lb - drawnB}
    />

    {#if marker}
      <circle
        class="marker"
        cx={marker.x}
        cy={marker.y}
        r="7"
        fill={marker.anti ? ANTI_COLOR : EXT_COLOR}
        filter="url(#caps-assembly-glow)"
      />
    {/if}
  </svg>

  <div class="assembly-caption">
    <span class="leg" style="--c: {EXT_COLOR}">Extension</span>
    <span class="op">+</span>
    <span class="leg" style="--c: {ANTI_COLOR}">Antispin</span>
    <span class="eq">= one closed loop</span>
  </div>

  <button class="replay" type="button" onclick={play}>
    <i class="fas fa-rotate-right" aria-hidden="true"></i>
    Replay
  </button>
</div>

<style>
  .assembly {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: clamp(0.8rem, 2vh, 1.4rem);
    width: 100%;
    height: 100%;
    min-height: 0;
  }
  .assembly-stage {
    flex: 1 1 auto;
    min-height: 0;
    width: auto;
    max-width: 100%;
    aspect-ratio: 1;
    overflow: visible;
  }

  .ghost {
    fill: none;
    stroke: rgba(255, 255, 255, 0.12);
    stroke-width: 2;
    stroke-linecap: round;
  }
  .frag {
    fill: none;
    stroke-width: 4.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    filter: drop-shadow(0 0 6px currentColor);
  }
  .marker {
    opacity: 0.95;
  }

  .assembly-caption {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 0.55rem;
    flex-wrap: wrap;
    justify-content: center;
    font-size: clamp(0.95rem, 1.3vw, 1.25rem);
    font-weight: 600;
  }
  .leg {
    color: var(--c);
  }
  .op,
  .eq {
    color: rgba(255, 255, 255, 0.72);
    font-weight: 500;
  }

  .replay {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 40px;
    padding: 0 1.1rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.06);
    color: #f2f1fb;
    font-size: 0.9rem;
    cursor: pointer;
    transition:
      background 0.2s ease,
      border-color 0.2s ease;
  }
  .replay:hover,
  .replay:focus-visible {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.4);
  }

  @media (prefers-reduced-motion: reduce) {
    .replay {
      transition: none;
    }
  }
</style>
