<script module lang="ts">
  import type { OceanBackgroundOrchestrator } from "@austencloud/backgrounds";

  interface PointerSnapshot {
    x: number;
    y: number;
    active: boolean;
    pointerType: string;
  }

  interface FishInteractionSnapshot {
    atMilliseconds: number;
    fishId: number | null;
    species: string;
    x: number;
    y: number;
    bodyLength: number;
    speedBodyLengths: number;
    direction: number;
    headingRadians: number;
    behavior: string;
    intent: string;
    escapeEventCount: number;
    escapePhase: string | null;
    pursuitPressure: number;
    cursorDistanceBodyLengths: number | null;
    cursorPosition: "front" | "side" | "behind" | null;
    pointer: PointerSnapshot;
  }

  interface OceanInteractionApi {
    getState: () => {
      ready: boolean;
      dimensions: { width: number; height: number };
      pointer: PointerSnapshot;
      trackedFishId: number | null;
      fishCount: number;
    };
    getFish: () => FishInteractionSnapshot[];
    getInteractionTrace: () => FishInteractionSnapshot[];
    clearInteractionTrace: () => void;
    trackFish: (fishId: number | null) => boolean;
    getSystem: () => OceanBackgroundOrchestrator | null;
    getImplementation: () => {
      perception: string;
      cursorAvoidance: string;
      escapeMovement: string;
      pursuitSteering: string;
    };
  }

  declare global {
    interface Window {
      __oceanMotionBenchmark?: OceanInteractionApi;
    }
  }
</script>

<script lang="ts">
  import { onMount } from "svelte";
  import type { FishMarineLife } from "@austencloud/backgrounds";

  const TRACE_LIMIT = 1200;
  const implementation = {
    perception:
      "E:/shared-packages/packages/backgrounds/src/backgrounds/ocean/services/implementations/FishPerceptionSystem.ts",
    cursorAvoidance:
      "E:/shared-packages/packages/backgrounds/src/backgrounds/ocean/services/implementations/FishCursorAvoidance.ts",
    escapeMovement:
      "E:/shared-packages/packages/backgrounds/src/backgrounds/ocean/services/implementations/FishMovementController.ts",
    pursuitSteering:
      "E:/shared-packages/packages/backgrounds/src/backgrounds/ocean/services/implementations/fish-motion/pursuit-steering.ts",
  } as const;

  let canvas: HTMLCanvasElement | undefined = $state();
  let stage: HTMLElement | undefined = $state();
  let telemetry: HTMLOutputElement | undefined = $state();
  let system: OceanBackgroundOrchestrator | null = null;
  let ready = false;
  let dimensions = { width: 1, height: 1 };
  let trackedFishId: number | null = null;
  let startedAt = 0;
  let lastTelemetryUpdate = 0;
  const interactionTrace: FishInteractionSnapshot[] = [];
  const pointer: PointerSnapshot = {
    x: 0,
    y: 0,
    active: false,
    pointerType: "mouse",
  };

  async function loadOceanBackgrounds(): Promise<
    typeof import("@austencloud/backgrounds")
  > {
    // This revision tag gives Vite a fresh dependency entry when the shared
    // package changes during a fish review. Production still bundles the same
    // package owner; only the dev cache identity changes.
    // @ts-expect-error Vite resolves package import queries during bundling.
    return import("@austencloud/backgrounds?ocean-runtime=turn-side-inertia-20260814");
  }

  function getEscapeSwim(fish: FishMarineLife):
    | (NonNullable<FishMarineLife["escapeSwim"]> & {
        pursuitPressure?: number;
      })
    | undefined {
    return fish.escapeSwim;
  }

  function getHeading(fish: FishMarineLife): number {
    const swim = getEscapeSwim(fish);
    if (swim) return Math.atan2(swim.directionY, swim.directionX);
    if (fish.escapeManeuver) return fish.escapeManeuver.headingAngle;
    return Math.atan2(Math.sin(fish.rotation), fish.headingFactor);
  }

  function cursorPosition(
    fish: FishMarineLife,
    heading: number
  ): "front" | "side" | "behind" | null {
    if (!pointer.active) return null;
    const dx = pointer.x - fish.x;
    const dy = pointer.y - fish.baseY;
    const length = Math.hypot(dx, dy);
    if (length < 1e-6) return "front";
    const alignment =
      Math.cos(heading) * (dx / length) + Math.sin(heading) * (dy / length);
    if (alignment >= 0.35) return "front";
    if (alignment <= -0.35) return "behind";
    return "side";
  }

  function snapshotFish(fish: FishMarineLife): FishInteractionSnapshot {
    const bodyLength = Math.max(1, fish.bodyLength);
    const heading = getHeading(fish);
    const swim = getEscapeSwim(fish);
    return {
      atMilliseconds: performance.now() - startedAt,
      fishId: fish.fishId ?? null,
      species: fish.species,
      x: fish.x,
      y: fish.baseY,
      bodyLength,
      speedBodyLengths: fish.speed / bodyLength,
      direction: fish.direction,
      headingRadians: heading,
      behavior: fish.behavior,
      intent: fish.intent,
      escapeEventCount: fish.escapeEventCount,
      escapePhase: fish.escapeManeuver?.phase ?? (swim ? "swim" : null),
      pursuitPressure: swim?.pursuitPressure ?? 0,
      cursorDistanceBodyLengths: pointer.active
        ? Math.hypot(pointer.x - fish.x, pointer.y - fish.baseY) / bodyLength
        : null,
      cursorPosition: cursorPosition(fish, heading),
      pointer: { ...pointer },
    };
  }

  function chooseTrackedFish(fish: FishMarineLife[]): FishMarineLife | null {
    const current =
      trackedFishId === null
        ? undefined
        : fish.find((candidate) => candidate.fishId === trackedFishId);
    if (current && (current.escapeManeuver || current.escapeSwim))
      return current;

    const escaping = fish
      .filter((candidate) => candidate.escapeManeuver || candidate.escapeSwim)
      .sort(
        (a, b) =>
          Math.hypot(a.x - pointer.x, a.baseY - pointer.y) -
          Math.hypot(b.x - pointer.x, b.baseY - pointer.y)
      )[0];
    if (escaping) {
      trackedFishId = escaping.fishId ?? null;
      return escaping;
    }

    if (current && !pointer.active) return current;
    if (!pointer.active || fish.length === 0) return current ?? null;
    const nearest = [...fish].sort(
      (a, b) =>
        Math.hypot(a.x - pointer.x, a.baseY - pointer.y) -
        Math.hypot(b.x - pointer.x, b.baseY - pointer.y)
    )[0]!;
    trackedFishId = nearest.fishId ?? null;
    return nearest;
  }

  function captureInteractionFrame(): void {
    if (!system) return;
    const fish = system.getFish();
    const tracked = chooseTrackedFish(fish);
    if (
      !tracked ||
      (!pointer.active && !tracked.escapeManeuver && !tracked.escapeSwim)
    ) {
      return;
    }
    const snapshot = snapshotFish(tracked);
    interactionTrace.push(snapshot);
    if (interactionTrace.length > TRACE_LIMIT) {
      interactionTrace.splice(0, interactionTrace.length - TRACE_LIMIT);
    }
    if (telemetry && snapshot.atMilliseconds - lastTelemetryUpdate >= 100) {
      lastTelemetryUpdate = snapshot.atMilliseconds;
      telemetry.value = JSON.stringify(snapshot);
      telemetry.dataset.traceLength = String(interactionTrace.length);
      telemetry.dataset.ready = String(ready);
    }
  }

  function resize(): void {
    if (!canvas || !stage) return;
    const previous = dimensions;
    const rect = stage.getBoundingClientRect();
    dimensions = {
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
    };
    if (
      canvas.width === dimensions.width &&
      canvas.height === dimensions.height
    ) {
      return;
    }
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    system?.handleResize?.(previous, dimensions);
  }

  function handlePointerMove(event: PointerEvent): void {
    if (!canvas || !system) return;
    const rect = canvas.getBoundingClientRect();
    pointer.x =
      (event.clientX - rect.left) * (canvas.width / Math.max(1, rect.width));
    pointer.y =
      (event.clientY - rect.top) * (canvas.height / Math.max(1, rect.height));
    pointer.active = true;
    pointer.pointerType = event.pointerType || "mouse";
    system.setPointer(pointer.x, pointer.y, true);
  }

  function handlePointerLeave(event: PointerEvent): void {
    pointer.active = false;
    pointer.pointerType = event.pointerType || pointer.pointerType;
    system?.setPointer(0, 0, false);
  }

  onMount(() => {
    if (!canvas || !stage) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let disposed = false;
    let animationFrame = 0;
    let previousFrame = performance.now();
    startedAt = previousFrame;

    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    resize();

    const api: OceanInteractionApi = {
      getState: () => ({
        ready,
        dimensions: { ...dimensions },
        pointer: { ...pointer },
        trackedFishId,
        fishCount: system?.getFish().length ?? 0,
      }),
      getFish: () => system?.getFish().map(snapshotFish) ?? [],
      getInteractionTrace: () =>
        interactionTrace.map((sample) => ({
          ...sample,
          pointer: { ...sample.pointer },
        })),
      clearInteractionTrace: () => {
        interactionTrace.length = 0;
      },
      trackFish: (fishId) => {
        if (fishId === null) {
          trackedFishId = null;
          return true;
        }
        const exists = system?.getFish().some((fish) => fish.fishId === fishId);
        if (exists) trackedFishId = fishId;
        return exists ?? false;
      },
      getSystem: () => system,
      getImplementation: () => ({ ...implementation }),
    };
    window.__oceanMotionBenchmark = api;

    async function boot(): Promise<void> {
      const { OceanBackgroundOrchestrator } = await loadOceanBackgrounds();
      if (disposed) return;
      system = OceanBackgroundOrchestrator.create();
      resize();
      await system!.initialize(dimensions, "high", { spawnFishOnScreen: true });
      if (disposed) return;
      ready = true;
      if (telemetry) {
        telemetry.dataset.ready = "true";
        telemetry.dataset.fishCount = String(system!.getFish().length);
      }
    }

    const animate = (now: number): void => {
      if (disposed) return;
      const elapsed = Math.min(50, Math.max(1, now - previousFrame));
      previousFrame = now;
      if (system) {
        system.update(dimensions, elapsed / 16.67);
        captureInteractionFrame();
        context.clearRect(0, 0, dimensions.width, dimensions.height);
        system.draw(context, dimensions);
      }
      animationFrame = requestAnimationFrame(animate);
    };

    void boot();
    animationFrame = requestAnimationFrame(animate);

    return () => {
      disposed = true;
      ready = false;
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      system?.cleanup();
      system = null;
      delete window.__oceanMotionBenchmark;
    };
  });
</script>

<svelte:head>
  <title>Interactive Ocean Background</title>
</svelte:head>

<main
  class="ocean-stage"
  bind:this={stage}
  onpointermove={handlePointerMove}
  onpointerleave={handlePointerLeave}
  onpointercancel={handlePointerLeave}
>
  <canvas
    bind:this={canvas}
    aria-label="Interactive ocean background. Move the pointer near a fish to make it flee."
  ></canvas>
  <output bind:this={telemetry} data-ocean-telemetry hidden></output>
</main>

<style>
  :global(html),
  :global(body) {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    background: #04111c;
  }

  .ocean-stage {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #04111c;
    touch-action: none;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
