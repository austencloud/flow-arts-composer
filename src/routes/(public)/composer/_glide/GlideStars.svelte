<script lang="ts">
  /**
   * Near star field behind the /composer stage. The marketing background
   * stays the distant sky; these stars sit between it and the page and drift
   * past while a glide moves the camera, so moving from one section to the
   * next reads as travel. It only draws when the camera moves.
   */
  import { onMount } from "svelte";

  let {
    depth,
  }: {
    /** Camera travel into the scene, in px of depth. */
    depth: number;
  } = $props();

  const FIELD_DEPTH = 3200;
  const NEAR = 60;
  const FOCAL = 420;
  const STARS_PER_MEGAPIXEL = 220;
  const BRIGHTNESS = 0.55;

  interface Star {
    readonly x: number;
    readonly y: number;
    readonly z: number;
    readonly glow: number;
  }

  let canvas: HTMLCanvasElement;
  let context: CanvasRenderingContext2D | null = null;
  let stars: Star[] = [];
  let width = 0;
  let height = 0;
  let ratio = 1;
  let color = "#fff";
  let drawnDepth = 0;
  let frame = 0;

  function seed() {
    const count = Math.round(
      ((width * height) / 1_000_000) * STARS_PER_MEGAPIXEL
    );
    stars = Array.from({ length: count }, () => ({
      x: (Math.random() * 2 - 1) * width * 2,
      y: (Math.random() * 2 - 1) * height * 2,
      z: Math.random() * FIELD_DEPTH,
      glow: 0.35 + Math.random() * 0.65,
    }));
  }

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    color = getComputedStyle(canvas).color;
    seed();
    draw();
  }

  function distanceOf(star: Star): number {
    const travelled = (star.z - drawnDepth) % FIELD_DEPTH;
    return NEAR + (travelled < 0 ? travelled + FIELD_DEPTH : travelled);
  }

  function draw() {
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    context.fillStyle = color;
    const cx = width / 2;
    const cy = height / 2;
    for (const star of stars) {
      const distance = distanceOf(star);
      const sx = cx + (star.x * FOCAL) / distance;
      const sy = cy + (star.y * FOCAL) / distance;
      if (sx < -40 || sx > width + 40 || sy < -40 || sy > height + 40) continue;
      const nearness = 1 - distance / (FIELD_DEPTH + NEAR);
      const radius = 0.35 + 1.25 * nearness * nearness;
      // A star entering at the far end of the field brightens in, so the
      // wrap from near to far never pops.
      const arrival = Math.min(1, (FIELD_DEPTH + NEAR - distance) / 500);
      context.globalAlpha = star.glow * BRIGHTNESS * arrival;
      context.beginPath();
      context.arc(sx, sy, radius, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function step() {
    frame = 0;
    drawnDepth = depth;
    draw();
  }

  $effect(() => {
    void depth;
    if (context && !frame) frame = requestAnimationFrame(step);
  });

  onMount(() => {
    context = canvas.getContext("2d");
    drawnDepth = depth;
    resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      if (frame) cancelAnimationFrame(frame);
    };
  });
</script>

<canvas bind:this={canvas} class="glide-stars" aria-hidden="true"></canvas>

<style>
  .glide-stars {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    color: var(--theme-text, #fff);
  }
</style>
