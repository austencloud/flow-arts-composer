<!--
  PhraseEasingCurveOverlay.svelte

  Renders easing curve visualization below the timeline.
  Steep = fast motion, flat = lingering.
  In blend mode, shows crossfade regions where adjacent curves merge.
-->
<script lang="ts">
  import type { EffortTimeline, EffortPhrase } from "../domain/effort-timeline-types";
  import type { EffortId } from "#lib/shared/effort/domain/effort-types.js";
  import { EFFORTS } from "#lib/shared/effort/domain/effort-types.js";
  import { applyEffort } from "#lib/shared/effort/domain/effort-easing-unified.js";

  interface Props {
    timeline: EffortTimeline;
    totalSteps: number;
    height?: number;
  }

  let { timeline, totalSteps, height = 40 }: Props = $props();

  const SAMPLES = 48;

  function getColor(effortId: EffortId): string {
    return EFFORTS.find((e) => e.id === effortId)?.color ?? "#94a3b8";
  }

  function stepToPct(beat: number): number {
    return ((beat - 1) / totalSteps) * 100;
  }

  function buildCurvePath(
    effortId: EffortId,
    leftPct: number,
    widthPct: number,
  ): string {
    const points: string[] = [];
    for (let i = 0; i <= SAMPLES; i++) {
      const t = i / SAMPLES;
      const eased = applyEffort(effortId, t);
      const x = leftPct + t * widthPct;
      const y = (1 - eased) * height;
      points.push(`${i === 0 ? "M" : "L"} ${x} ${y}`);
    }
    return points.join(" ");
  }

  /** Build a blended crossfade curve between two adjacent phrases */
  function buildBlendPath(
    phraseA: EffortPhrase,
    phraseB: EffortPhrase,
    blendSteps: number,
  ): string {
    const halfBlend = blendSteps / 2;
    // Blend region: [boundary - halfBlend, boundary + halfBlend]
    const boundary = phraseB.startStep; // where B starts (integer)
    const blendStart = boundary - halfBlend;
    const blendEnd = boundary + halfBlend;

    const blendStartPct = stepToPct(blendStart);
    const blendEndPct = stepToPct(blendEnd);
    const blendWidthPct = blendEndPct - blendStartPct;

    const points: string[] = [];
    const BLEND_SAMPLES = 32;

    for (let i = 0; i <= BLEND_SAMPLES; i++) {
      const t = i / BLEND_SAMPLES; // 0 to 1 across blend region
      const currentStep = blendStart + t * blendSteps;

      // Evaluate both curves at this beat position
      const durationA = phraseA.endStep - phraseA.startStep + 1;
      const progressA = Math.min((currentStep - phraseA.startStep) / durationA, 1);
      const easedA = applyEffort(phraseA.effortId, Math.max(0, progressA));

      const durationB = phraseB.endStep - phraseB.startStep + 1;
      const progressB = Math.max((currentStep - phraseB.startStep) / durationB, 0);
      const easedB = applyEffort(phraseB.effortId, Math.min(progressB, 1));

      // Lerp between the two based on blend progress
      const blended = easedA * (1 - t) + easedB * t;

      const x = blendStartPct + t * blendWidthPct;
      const y = (1 - blended) * height;
      points.push(`${i === 0 ? "M" : "L"} ${x} ${y}`);
    }

    return points.join(" ");
  }

  const phraseData = $derived(
    timeline.phrases.map((phrase) => {
      const color = getColor(phrase.effortId);
      const leftPct = stepToPct(phrase.startStep);
      const rightPct = stepToPct(phrase.endStep + 1);
      const widthPct = rightPct - leftPct;
      const path = buildCurvePath(phrase.effortId, leftPct, widthPct);
      return { id: phrase.id, color, leftPct, widthPct, path, phrase };
    })
  );

  /** Blend curves between adjacent phrases (only in blend mode) */
  const blendCurves = $derived.by(() => {
    if (timeline.transition !== "blend" || !timeline.blendSteps) return [];

    const curves: { path: string; colorA: string; colorB: string; id: string }[] = [];
    const phrases = timeline.phrases;

    for (let i = 0; i < phrases.length - 1; i++) {
      const a = phrases[i]!;
      const b = phrases[i + 1]!;
      if (!a || !b) continue;
      // Only blend adjacent phrases (no gap between them)
      if (a.endStep + 1 === b.startStep) {
        curves.push({
          path: buildBlendPath(a, b, timeline.blendSteps!),
          colorA: getColor(a.effortId),
          colorB: getColor(b.effortId),
          id: `blend-${a.id}-${b.id}`,
        });
      }
    }
    return curves;
  });

  /** Blend zone markers for visual indication */
  const blendZones = $derived.by(() => {
    if (timeline.transition !== "blend" || !timeline.blendSteps) return [];

    const zones: { leftPct: number; widthPct: number; id: string }[] = [];
    const phrases = timeline.phrases;
    const halfBlend = timeline.blendSteps! / 2;

    for (let i = 0; i < phrases.length - 1; i++) {
      const a = phrases[i]!;
      const b = phrases[i + 1]!;
      if (!a || !b) continue;
      if (a.endStep + 1 === b.startStep) {
        const boundary = b.startStep;
        const leftPct = stepToPct(boundary - halfBlend);
        const rightPct = stepToPct(boundary + halfBlend);
        zones.push({ leftPct, widthPct: rightPct - leftPct, id: `zone-${i}` });
      }
    }
    return zones;
  });
</script>

<svg
  class="easing-curve-overlay"
  viewBox="0 0 100 {height}"
  preserveAspectRatio="none"
  style:height="{height}px"
  aria-hidden="true"
>
  <!-- Background grid lines -->
  {#each Array.from({ length: totalSteps }, (_, i) => i) as beat}
    <line
      x1={((beat) / totalSteps) * 100}
      y1="0"
      x2={((beat) / totalSteps) * 100}
      y2={height}
      stroke="rgba(255,255,255,0.06)"
      stroke-width="0.2"
    />
  {/each}

  <!-- Blend zone highlights -->
  {#each blendZones as zone (zone.id)}
    <rect
      x={zone.leftPct}
      y="0"
      width={zone.widthPct}
      height={height}
      fill="rgba(255,255,255,0.04)"
      stroke="rgba(255,255,255,0.1)"
      stroke-width="0.15"
      stroke-dasharray="0.5 0.5"
    />
  {/each}

  <!-- Linear reference lines -->
  {#each phraseData as { id, leftPct, widthPct }}
    <line
      x1={leftPct}
      y1={height}
      x2={leftPct + widthPct}
      y2="0"
      stroke="rgba(255,255,255,0.08)"
      stroke-width="0.15"
      stroke-dasharray="1 1"
    />
  {/each}

  <!-- Per-phrase easing curves -->
  {#each phraseData as { id, color, path }}
    <path
      d={path}
      fill="none"
      stroke={color}
      stroke-width="0.5"
      opacity="0.8"
      vector-effect="non-scaling-stroke"
    />
  {/each}

  <!-- Blend crossfade curves (white, overlaid on top) -->
  {#each blendCurves as curve (curve.id)}
    <path
      d={curve.path}
      fill="none"
      stroke="white"
      stroke-width="0.7"
      opacity="0.9"
      vector-effect="non-scaling-stroke"
    />
  {/each}
</svg>

<style>
  .easing-curve-overlay {
    width: 100%;
    display: block;
    border: 1px solid var(--theme-stroke, rgba(255, 255, 255, 0.06));
    border-top: none;
    border-radius: 0 0 8px 8px;
    background: rgba(0, 0, 0, 0.15);
  }
</style>
