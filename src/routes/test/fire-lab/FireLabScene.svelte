<script module lang="ts">
  export type MotionMode = "idle" | "spin" | "reversals";
</script>

<script lang="ts">
  /**
   * FireLabScene - exercises the REAL production fire path (FireRenderer3D's
   * Lagrangian particle system + velocity-stretched flame-lick shader) under
   * simulated staff motion.
   *
   * Three columns driven at increasing spin speed (rest / medium / fast) so the
   * full range - rising tongues at rest, streaking trails under motion, a poof
   * knot on reversals - is visible side by side. This is shipped code, not a
   * lab prototype: what renders here is what renders in the viewer.
   */
  import { onMount, onDestroy } from "svelte";
  import { T, useTask, useThrelte } from "@threlte/core";
  import { OrbitControls } from "@threlte/extras";
  import { Vector3, Group, HalfFloatType, Vector2 } from "three";
  import { EffectComposer, RenderPass, EffectPass, BloomEffect } from "postprocessing";
  import { FireRenderer3D, type FireTipInput } from "#lib/shared/3d/effects/fire/fire-renderer-3d.js";
  import { QualityTier } from "#lib/shared/3d/effects/types.js";

  interface Props {
    motionMode: MotionMode;
    /** base revolutions per second; columns run at 0x / 1x / 2x of this */
    speed: number;
    bloomOn: boolean;
  }

  const { motionMode, speed, bloomOn }: Props = $props();

  const COLUMN_X = [-1.6, 0, 1.6];
  const SPEED_MULT = [0, 1, 2];
  const ORBIT_RADIUS = 0.55;
  const BASE_Y = 1.0;
  const REVERSAL_PERIOD = 1.4;

  const _ctx = useThrelte() as any;
  const renderer: import("three").WebGLRenderer = _ctx.renderer;
  const camera: { current: import("three").Camera } = _ctx.camera;
  const scene: import("three").Scene = (_ctx.scene as any).current ?? _ctx.scene;
  const autoRender: { current: boolean; set: (v: boolean) => void } = _ctx.autoRender;
  const renderStage = _ctx.renderStage;

  let fireRenderer: FireRenderer3D | null = null;
  let fireParent: Group | null = null;
  let theta = 0;
  let spinSign = 1;
  let reversalClock = 0;

  // Per-column previous raw velocity, to synthesize jerk for the poof exactly
  // as the orchestrator does from the tip bridge.
  const prevVel = COLUMN_X.map(() => new Vector3());
  const tips: FireTipInput[] = COLUMN_X.map(() => ({
    position: new Vector3(),
    velocityX: 0,
    velocityY: 0,
    velocityZ: 0,
    speed: 0,
    jerk: 0,
  }));

  onMount(() => {
    fireParent = new Group();
    scene.add(fireParent);
    fireRenderer = new FireRenderer3D(QualityTier.HIGH);
    fireRenderer.initialize(fireParent);
  });

  onDestroy(() => {
    fireRenderer?.dispose();
    if (fireParent) scene.remove(fireParent);
    fireRenderer = null;
    fireParent = null;
    disposeComposer();
  });

  useTask((dt) => {
    if (!fireRenderer) return;
    const safeDt = Math.min(dt, 1 / 15);

    const moving = motionMode !== "idle";
    if (motionMode === "reversals") {
      reversalClock += safeDt;
      if (reversalClock >= REVERSAL_PERIOD) {
        reversalClock = 0;
        spinSign = -spinSign;
      }
    }

    for (let i = 0; i < COLUMN_X.length; i++) {
      const cx = COLUMN_X[i]!;
      const omega = moving ? speed * SPEED_MULT[i]! * Math.PI * 2 * spinSign : 0;
      const a = theta * SPEED_MULT[i]!;

      let tipX = cx;
      let tipY = BASE_Y;
      let velX = 0;
      let velY = 0;
      if (omega !== 0) {
        tipX = cx + ORBIT_RADIUS * Math.cos(a);
        tipY = BASE_Y + ORBIT_RADIUS * Math.sin(a);
        velX = -ORBIT_RADIUS * omega * Math.sin(a);
        velY = ORBIT_RADIUS * omega * Math.cos(a);
      }

      const jx = (velX - prevVel[i]!.x) / Math.max(safeDt, 1e-4);
      const jy = (velY - prevVel[i]!.y) / Math.max(safeDt, 1e-4);
      prevVel[i]!.set(velX, velY, 0);

      const tip = tips[i]!;
      tip.position.set(tipX, tipY, 0);
      tip.velocityX = velX;
      tip.velocityY = velY;
      tip.velocityZ = 0;
      tip.speed = Math.hypot(velX, velY);
      tip.jerk = Math.hypot(jx, jy);
    }

    theta += Math.PI * 2 * speed * safeDt * spinSign;
    fireRenderer.update(tips, safeDt);
  });

  // ── Lab bloom: production bloom values (ScenePostProcessing.svelte) ──
  let composer: EffectComposer | null = null;
  let lastW = 0;
  let lastH = 0;
  const _sizeVec = new Vector2();

  function disposeComposer(): void {
    composer?.dispose();
    composer = null;
  }

  $effect(() => {
    const cam = camera.current;
    if (bloomOn && cam) {
      disposeComposer();
      composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType });
      composer.addPass(new RenderPass(scene, cam));
      composer.addPass(
        new EffectPass(
          cam,
          new BloomEffect({
            intensity: 0.8,
            luminanceThreshold: 0.6,
            luminanceSmoothing: 0.3,
            mipmapBlur: true,
            radius: 0.5,
            levels: 8,
          }),
        ),
      );
      autoRender.set(false);
    } else {
      disposeComposer();
      autoRender.set(true);
    }
    return () => {
      disposeComposer();
      autoRender.set(true);
    };
  });

  useTask(
    (delta) => {
      if (!composer) return;
      const cam = camera.current;
      if (cam) composer.setMainCamera(cam);
      renderer.getSize(_sizeVec);
      const w = Math.round(_sizeVec.x);
      const h = Math.round(_sizeVec.y);
      if (w < 1 || h < 1) return;
      if (w !== lastW || h !== lastH) {
        composer.setSize(w, h);
        lastW = w;
        lastH = h;
      }
      composer.render(delta);
    },
    { stage: renderStage, autoInvalidate: false },
  );
</script>

<T.PerspectiveCamera makeDefault position={[0, 1.4, 4.6]} fov={50}>
  <OrbitControls target={[0, 1.1, 0]} enableDamping />
</T.PerspectiveCamera>

<T.AmbientLight intensity={0.12} />

<!-- Dark floor so the flame lights have something to paint -->
<T.Mesh rotation.x={-Math.PI / 2} position.y={0}>
  <T.CircleGeometry args={[8, 48]} />
  <T.MeshStandardMaterial color="#14161c" roughness={0.85} metalness={0.05} />
</T.Mesh>

<!-- Backdrop wall -->
<T.Mesh position={[0, 3, -3.5]}>
  <T.PlaneGeometry args={[16, 8]} />
  <T.MeshStandardMaterial color="#0b0d12" roughness={0.95} />
</T.Mesh>
