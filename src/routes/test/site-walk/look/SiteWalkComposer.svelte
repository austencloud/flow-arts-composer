<script lang="ts">
  /**
   * Draws the frame: the site, then the air and contact shade over it, then the
   * glow, then the print. Owns its own pass chain, because the haze needs the
   * frame's depth and the sky's recipe together.
   *
   * It also owns how many pixels are drawn: as sharp as the screen allows, and
   * one step softer each time the last stretch of frames could not keep up.
   */
  import { onDestroy, untrack } from "svelte";
  import { useTask, useThrelte } from "@threlte/core";
  import {
    BloomEffect,
    EffectComposer,
    EffectPass,
    KernelSize,
    RenderPass,
    SMAAEffect,
  } from "postprocessing";
  import {
    HalfFloatType,
    NoToneMapping,
    Vector2,
    type Camera,
    type Scene,
    type WebGLRenderer,
  } from "three";
  import { SiteWalkAirPass } from "./site-walk-air-pass";
  import { SiteWalkGradeEffect } from "./site-walk-grade-effect";
  import type { LookRecipe } from "./site-walk-look";

  interface Props {
    look: LookRecipe;
  }
  const props: Props = $props();

  const { renderer, scene, camera, dpr, autoRender, renderStage } =
    useThrelte() as unknown as {
      dpr: { current: number; set(value: number): void };
      renderer: WebGLRenderer;
      scene: Scene;
      camera: { current: Camera };
      autoRender: { current: boolean; set(value: boolean): void };
      renderStage: Parameters<typeof useTask>[1] extends { stage?: infer S }
        ? S
        : never;
    };

  autoRender.set(false);
  renderer.toneMapping = NoToneMapping;

  const composer = new EffectComposer(renderer, {
    frameBufferType: HalfFloatType,
    multisampling: 4,
  });
  const renderPass = new RenderPass(scene, camera.current);
  const air = new SiteWalkAirPass(camera.current);
  const bloom = new BloomEffect({
    mipmapBlur: true,
    intensity: 0.6,
    luminanceThreshold: 1,
    luminanceSmoothing: 0.4,
    radius: 0.72,
    levels: 7,
    kernelSize: KernelSize.LARGE,
  });
  const grade = new SiteWalkGradeEffect();
  const smaa = new SMAAEffect();
  const printPass = new EffectPass(camera.current, bloom, grade);
  const edgePass = new EffectPass(camera.current, smaa);
  composer.addPass(renderPass);
  composer.addPass(air);
  composer.addPass(printPass);
  composer.addPass(edgePass);

  $effect(() => {
    const look = props.look;
    untrack(() => {
      air.setLook(look);
      grade.setLook(look);
      bloom.intensity = look.bloom.intensity;
      bloom.luminanceMaterial.threshold = look.bloom.threshold;
    });
  });

  // ------------------------------------------------------------ how sharp

  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const SHARPEST = coarse ? 1.25 : 1.5;
  const SOFTEST = 0.8;
  const STEP = 0.8;
  /** Frames looked at before deciding, and the rate they have to hold. */
  const STRETCH = 45;
  const HOLD = 1 / 42;
  let sharpness = Math.min(SHARPEST, Math.max(1, window.devicePixelRatio || 1));
  let frames = 0;
  let spent = 0;
  let slowStretches = 0;
  dpr.set(sharpness);

  /** Hitches and a hidden tab are not slowness, and nor is one busy stretch while people are still arriving. */
  function keepUp(delta: number): void {
    if (delta > 0.1) return;
    frames += 1;
    spent += delta;
    if (frames < STRETCH) return;
    slowStretches = spent / frames > HOLD ? slowStretches + 1 : 0;
    if (slowStretches >= 3 && sharpness > SOFTEST) {
      sharpness = Math.max(SOFTEST, sharpness * STEP);
      dpr.set(sharpness);
      slowStretches = 0;
    }
    frames = 0;
    spent = 0;
  }

  const size = new Vector2();
  const cssSize = new Vector2();
  let width = 0;
  let height = 0;
  let seen: Camera | null = null;

  useTask(
    (delta) => {
      const view = camera.current;
      if (view !== seen) {
        seen = view;
        renderPass.mainCamera = view;
        printPass.mainCamera = view;
        edgePass.mainCamera = view;
        air.setView(view);
      }
      renderer.getDrawingBufferSize(size);
      if (size.x < 1 || size.y < 1) return;
      if (size.x !== width || size.y !== height) {
        width = size.x;
        height = size.y;
        // The canvas size, which is what setSize() reads when given nothing;
        // false leaves the canvas style to Threlte.
        renderer.getSize(cssSize);
        composer.setSize(cssSize.x, cssSize.y, false);
      }
      composer.render(delta);
      keepUp(delta);
    },
    { stage: renderStage, autoInvalidate: false }
  );

  onDestroy(() => composer.dispose());
</script>
