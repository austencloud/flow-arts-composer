<!--
  Sprite capture driver for the 2D animator "3D model" prop look.

  Walks every 2D prop that has a 3D counterpart, renders it blue then red
  through SpriteCaptureScene, and POSTs each capture to ./save, which writes
  static/images/props/appearances/model/<prop>-<color>.svg and regenerates
  prop-model-sprites.generated.ts. Dev only.

    /test/prop-3d-studio/sprites                    capture everything
    /test/prop-3d-studio/sprites?prop=sword          capture one prop
    /test/prop-3d-studio/sprites?prop=triangle       capture all four Triangle
                                                      jobs (corner/side x blue/red)
    /test/prop-3d-studio/sprites?prop=triangle_side  capture only the side-grip
                                                      pair (blue/red)

  document.body.dataset.spriteCaptureDone flips to "1" when the run ends.
-->
<script lang="ts">
  import { Canvas } from "@threlte/core";
  import { WebGLRenderer } from "three";
  import { page } from "$app/state";
  import { PropType } from "$lib/shared/pictograph/prop/domain/enums/prop-type";
  import { PROP_DIMENSIONS } from "$lib/shared/animation-engine/services/IPropTextureLoader";
  import { toScenePropType } from "$lib/shared/3d/domain/scene-prop-type";
  import { triangleSpriteKey } from "$lib/shared/pictograph/prop/domain/triangle-appearance";
  import {
    PropType as ScenePropType,
    type PropBuild,
  } from "@austencloud/scene-3d";
  import SpriteCaptureScene, {
    type SpriteCaptureResult,
  } from "./SpriteCaptureScene.svelte";

  /** Long axis of the sprite in canvas pixels. */
  const TARGET_WIDTH_PX = 1024;
  const COLORS = ["blue", "red"] as const;

  const SCENE_VALUES = new Set<string>(Object.values(ScenePropType));

  /**
   * Fan keeps its measured appearance builds; energy props are 2D cosmetics
   * that borrow a parent model and must keep their own glow artwork; hand is
   * not a prop; Classic Club is a 2D artwork choice by definition.
   */
  function isCaptureCandidate(prop: PropType): boolean {
    const value = prop as string;
    if (value === "fan" || value === "bigfan" || value === "hand") return false;
    if (value.startsWith("energy_") || value === "classic_club") return false;
    if (!PROP_DIMENSIONS[value]) return false;
    return SCENE_VALUES.has(toScenePropType(prop) as string);
  }

  /** The sprite key is the prop, except where one prop captures more than one look. */
  type Job = {
    prop: PropType;
    key: string;
    color: (typeof COLORS)[number];
    build?: Partial<PropBuild>;
  };

  /** Extra looks captured under their own sprite key. */
  const EXTRA_LOOKS: Partial<
    Record<PropType, { key: string; build: Partial<PropBuild> }[]>
  > = {
    [PropType.TRIANGLE]: [
      { key: triangleSpriteKey("side"), build: { triangleGrip: "side" } },
    ],
  };

  const requested = $derived(page.url.searchParams.get("prop"));
  /** ?force=1 skips the candidate filter (orientation checks against fan artwork). */
  const force = $derived(page.url.searchParams.get("force") === "1");
  const queue = $derived.by(() => {
    const all = (Object.values(PropType) as PropType[]).filter((prop) =>
      force && requested ? true : isCaptureCandidate(prop)
    );
    return requested
      ? all.filter(
          (prop) =>
            (prop as string) === requested ||
            (EXTRA_LOOKS[prop] ?? []).some((look) => look.key === requested)
        )
      : all;
  });

  const jobs = $derived(
    queue
      .flatMap((prop) => {
        const looks = [
          {
            key: prop as string,
            // The scene default grip isn't guaranteed to be corner; state it
            // explicitly so this job always captures the corner look, the
            // same way the side job states its own override below.
            build:
              prop === PropType.TRIANGLE
                ? ({ triangleGrip: "corner" } as Partial<PropBuild>)
                : undefined,
          },
          ...(EXTRA_LOOKS[prop] ?? []),
        ];
        return looks.flatMap((look) =>
          COLORS.map((color) => ({
            prop,
            key: look.key,
            color,
            build: look.build,
          }))
        );
      })
      // queue already narrowed by prop; a requested EXTRA_LOOKS key (e.g.
      // triangle_side) still shares its prop with the plain-look job, so this
      // second filter drops that plain job and keeps only the matching look.
      .filter(
        (job) =>
          !requested ||
          job.key === requested ||
          (job.prop as string) === requested
      )
  );

  let index = $state(0);
  let log = $state<string[]>([]);
  const current = $derived(jobs[index] ?? null);
  const box = $derived(
    current ? (PROP_DIMENSIONS[current.prop as string] ?? null) : null
  );
  const pixelsPerUnit = $derived(box ? TARGET_WIDTH_PX / box.width : 1);
  const stageWidth = $derived(box ? Math.round(box.width * pixelsPerUnit) : 1);
  const stageHeight = $derived(
    box ? Math.round(box.height * pixelsPerUnit) : 1
  );

  async function finalize(): Promise<void> {
    try {
      const response = await fetch("/test/prop-3d-studio/sprites/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ finalize: true }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
      };
      log = [
        ...log,
        payload.ok
          ? "manifest module regenerated"
          : `MANIFEST FAILED ${payload.error ?? ""}`,
      ];
    } catch (error) {
      log = [...log, `MANIFEST FAILED ${String(error)}`];
    }
    document.body.dataset.spriteCaptureDone = "1";
  }

  function advance(message: string): void {
    log = [...log, message];
    index += 1;
    if (index >= jobs.length) void finalize();
  }

  async function handleCaptured(job: Job, result: SpriteCaptureResult) {
    const dims = PROP_DIMENSIONS[job.prop as string];
    if (!dims) {
      advance(`${job.key} ${job.color}: no PROP_DIMENSIONS entry`);
      return;
    }
    try {
      const response = await fetch("/test/prop-3d-studio/sprites/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prop: job.key,
          color: job.color,
          width: dims.width,
          height: dims.height,
          fit: result.fit,
          extent: result.extent,
          gripOffset: result.gripOffset,
          bounds: result.bounds,
          dataUrl: result.dataUrl,
        }),
      });
      const payload = (await response.json()) as {
        ok: boolean;
        error?: string;
      };
      advance(
        payload.ok
          ? `${job.key} ${job.color}: saved (fit ${result.fit.toFixed(1)} u/m, extent ${result.extent.x.toFixed(3)}x${result.extent.y.toFixed(3)} m)`
          : `${job.key} ${job.color}: SAVE FAILED ${payload.error ?? ""}`
      );
    } catch (error) {
      advance(`${job.key} ${job.color}: SAVE FAILED ${String(error)}`);
    }
  }

  function handleEmpty(job: Job) {
    advance(`${job.key} ${job.color}: EMPTY (no geometry after timeout)`);
  }

  function createRenderer(canvas: HTMLCanvasElement) {
    return new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: true,
      premultipliedAlpha: true,
    });
  }
</script>

<svelte:head>
  <title>Prop sprite capture</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="capture-page">
  <div
    class="stage"
    style:width="{stageWidth}px"
    style:height="{stageHeight}px"
  >
    {#if current && box}
      {#key `${current.key}:${current.color}`}
        <Canvas {createRenderer} dpr={1}>
          <SpriteCaptureScene
            propType={toScenePropType(current.prop)}
            color={current.color}
            {box}
            {pixelsPerUnit}
            build={current.build}
            oncaptured={(result) => handleCaptured(current, result)}
            onempty={() => handleEmpty(current)}
          />
        </Canvas>
      {/key}
    {/if}
  </div>
  <section class="log" aria-live="polite">
    <p data-progress>{index} / {jobs.length}</p>
    <ol>
      {#each log as line, i (i)}
        <li>{line}</li>
      {/each}
    </ol>
  </section>
</div>

<style>
  .capture-page {
    min-height: 100vh;
    background: #070911;
    color: #dfe6ff;
    font:
      13px/1.5 system-ui,
      sans-serif;
  }
  .stage {
    background: repeating-conic-gradient(#1a1d2b 0 25%, #10121c 0 50%) 0 0 /
      24px 24px;
  }
  .stage :global(canvas) {
    display: block;
    width: 100% !important;
    height: 100% !important;
  }
  .log {
    padding: 12px 16px;
  }
</style>
