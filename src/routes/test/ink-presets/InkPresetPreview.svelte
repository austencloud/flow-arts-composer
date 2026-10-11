<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import type { InkIntent } from "#lib/shared/effects/domain/effects-config.js";
  import type { EmitterTip } from "#lib/shared/effects/renderers/emitter-tip.js";
  import { Ink2DRenderer } from "#lib/shared/effects/renderers/ink-2d-renderer.js";
  import { resolveInk2D } from "#lib/shared/effects/translators/canvas2d-translator.js";

  interface Props {
    intent: InkIntent;
    accent: string;
    ordinal: number;
  }

  const { intent, accent, ordinal }: Props = $props();

  let canvas = $state<HTMLCanvasElement>();
  let animationFrame = 0;
  let resizeObserver: ResizeObserver | null = null;
  let intersectionObserver: IntersectionObserver | null = null;
  let motionPreference: MediaQueryList | null = null;
  let renderer = new Ink2DRenderer();
  let previousTime = 0;
  let dpr = 1;
  let frameTick = 0;
  let isVisible = true;

  const params = resolveInk2D(intent);

  function tipsAt(time: number, width: number, height: number): EmitterTip[] {
    const phase = time * Math.PI * 2 * 0.24;
    const centerX = width * 0.5;
    const centerY = height * 0.5;
    const radiusX = width * 0.32;
    const radiusY = height * 0.3;

    const pointAt = (
      angle: number,
      propIndex: number,
      end: "A" | "B"
    ): EmitterTip => ({
      x: centerX + Math.sin(angle) * radiusX,
      y: centerY + Math.sin(angle * 2) * radiusY,
      propIndex,
      tipIndex: propIndex,
      end,
      color: accent,
    });

    return [pointAt(phase, 0, "A"), pointAt(phase + Math.PI, 1, "B")];
  }

  function sizeCanvas(): void {
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(bounds.width * dpr));
    canvas.height = Math.max(1, Math.round(bounds.height * dpr));
  }

  function renderScene(time: number, dt: number): void {
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const width = canvas.width / dpr;
    const height = canvas.height / dpr;
    const scale = Math.max(0.7, Math.min(1.15, Math.min(width, height) / 320));
    const tips = tipsAt(time, width, height);

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#07080d";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    renderer.render(context, params, tips, dt, scale);

    for (const tip of tips) {
      context.beginPath();
      context.arc(tip.x, tip.y, Math.max(2.5, scale * 3.2), 0, Math.PI * 2);
      context.fillStyle = "rgba(255, 255, 255, 0.92)";
      context.fill();
    }
  }

  function animate(now: number): void {
    frameTick += 1;
    if (!isVisible) {
      previousTime = now;
      animationFrame = requestAnimationFrame(animate);
      return;
    }

    // Nine production renderers at once can monopolize a frame. Each visible
    // card updates at 20fps, split across three browser frames, while
    // preserving the same timeline and effect settings.
    if ((frameTick + ordinal) % 3 !== 0) {
      animationFrame = requestAnimationFrame(animate);
      return;
    }

    const dt =
      previousTime === 0
        ? 1 / 60
        : Math.min((now - previousTime) / 1000, 1 / 30);
    previousTime = now;
    renderScene(now / 1000, dt);
    animationFrame = requestAnimationFrame(animate);
  }

  function renderReducedMotionFrame(): void {
    renderer.dispose();
    renderer = new Ink2DRenderer();
    for (let frame = 0; frame < 100; frame++) {
      renderScene(frame / 60, 1 / 60);
    }
  }

  function restartForMotionPreference(): void {
    cancelAnimationFrame(animationFrame);
    previousTime = 0;
    renderer.dispose();
    renderer = new Ink2DRenderer();
    if (motionPreference?.matches) {
      renderReducedMotionFrame();
    } else {
      animationFrame = requestAnimationFrame(animate);
    }
  }

  onMount(() => {
    sizeCanvas();
    resizeObserver = new ResizeObserver(() => {
      sizeCanvas();
      if (motionPreference?.matches) renderReducedMotionFrame();
    });
    resizeObserver.observe(canvas!);

    intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        const nextVisible = entry?.isIntersecting ?? true;
        if (nextVisible && !isVisible) {
          renderer.dispose();
          renderer = new Ink2DRenderer();
          previousTime = 0;
        }
        isVisible = nextVisible;
      },
      { rootMargin: "120px" }
    );
    intersectionObserver.observe(canvas!);

    motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    motionPreference.addEventListener("change", restartForMotionPreference);
    restartForMotionPreference();
  });

  onDestroy(() => {
    cancelAnimationFrame(animationFrame);
    resizeObserver?.disconnect();
    intersectionObserver?.disconnect();
    motionPreference?.removeEventListener("change", restartForMotionPreference);
    renderer.dispose();
  });
</script>

<canvas bind:this={canvas} aria-label="Live {intent.palette} ink preview"
></canvas>

<style>
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    background: #07080d;
  }
</style>
