<script lang="ts">
  /**
   * Near star field for the Composer fly-through prototypes. The marketing
   * background stays the distant sky; these stars sit between it and the page
   * and stream past as the camera moves, so a scroll reads as travel. It only
   * draws while the camera or the streaks behind the stars are still moving.
   */
  import { onMount } from "svelte";

  let {
    depth,
    lift = 0,
    trail = 7,
  }: {
    /** Camera travel into the scene, in px of depth. */
    depth: number;
    /** Camera travel down the stage, in px, for a slight vertical parallax. */
    lift?: number;
    /** Streak length in depth per px of camera travel per frame; 0 keeps
        every star a point. */
    trail?: number;
  } = $props();

  const FIELD_DEPTH = 3200;
  const NEAR = 60;
  const FOCAL = 420;
  const STARS_PER_MEGAPIXEL = 220;
  const MAX_STREAK = 420;
  const BRIGHTNESS = 0.55;
  const LIFT_PARALLAX = 0.35;

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
  let speed = 0;
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
    context.strokeStyle = color;
    context.lineCap = "round";
    const cx = width / 2;
    const cy = height / 2;
    const streak = Math.max(-MAX_STREAK, Math.min(MAX_STREAK, speed * trail));
    for (const star of stars) {
      const distance = distanceOf(star);
      const y = star.y - lift * LIFT_PARALLAX;
      const sx = cx + (star.x * FOCAL) / distance;
      const sy = cy + (y * FOCAL) / distance;
      if (sx < -40 || sx > width + 40 || sy < -40 || sy > height + 40) continue;
      const nearness = 1 - distance / (FIELD_DEPTH + NEAR);
      const radius = 0.35 + 1.25 * nearness * nearness;
      const arrival = Math.min(1, (FIELD_DEPTH + NEAR - distance) / 500);
      context.globalAlpha = star.glow * BRIGHTNESS * arrival;
      const behind = Math.max(NEAR, distance + streak);
      const tx = cx + (star.x * FOCAL) / behind;
      const ty = cy + (y * FOCAL) / behind;
      if (Math.abs(tx - sx) + Math.abs(ty - sy) < 1) {
        context.beginPath();
        context.arc(sx, sy, radius, 0, Math.PI * 2);
        context.fill();
      } else {
        context.lineWidth = radius * 2;
        context.beginPath();
        context.moveTo(tx, ty);
        context.lineTo(sx, sy);
        context.stroke();
      }
    }
    context.globalAlpha = 1;
  }

  function step() {
    frame = 0;
    speed = speed * 0.8 + (depth - drawnDepth) * 0.2;
    drawnDepth = depth;
    draw();
    if (Math.abs(speed) > 0.05) frame = requestAnimationFrame(step);
  }

  $effect(() => {
    void depth;
    void lift;
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

<canvas bind:this={canvas} class="flight-stars" aria-hidden="true"></canvas>

<style>
  .flight-stars {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    color: var(--theme-text, #fff);
  }
</style>
