<!--
  Goo 3D lab: the production GooRenderer3D driven by spinning prop tips over a
  tiled floor, with the app's bloom settings, so liquid strands, drops,
  splashes and puddles can be judged frame by frame without a sequence.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import {
    AmbientLight,
    CanvasTexture,
    Color,
    CylinderGeometry,
    DirectionalLight,
    Fog,
    HemisphereLight,
    Mesh,
    MeshStandardMaterial,
    PerspectiveCamera,
    PlaneGeometry,
    RepeatWrapping,
    Scene,
    SphereGeometry,
    SRGBColorSpace,
    Vector3,
    WebGLRenderer,
    ACESFilmicToneMapping,
    HalfFloatType,
  } from "three";
  import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
  import {
    BloomEffect,
    EffectComposer,
    EffectPass,
    RenderPass,
  } from "postprocessing";
  import { GooRenderer3D } from "#lib/shared/3d/effects/water/goo-renderer-3d.js";
  import type { GooTipSource3D } from "#lib/shared/3d/effects/scene-effects/scene-effect-source-3d.js";
  import { resolveGoo3D } from "#lib/shared/effects/translators/webgl3d-translator.js";
  import { DEFAULT_EFFECTS_CONFIG } from "#lib/shared/effects/domain/defaults.js";
  import { GOO_PRESETS } from "#lib/shared/animation-engine/components/effects-panel/presets/goo-presets.js";
  import type { GooIntent } from "#lib/shared/effects/domain/effects-config.js";

  type Style = GooIntent["spewStyle"];
  type Speed = 1 | 0.25 | 0;
  type View = "front" | "low" | "top";

  let host: HTMLDivElement;
  let presetId = $state(GOO_PRESETS[0]!.id);
  let style = $state<Style>("flow");
  let speed = $state<Speed>(1);
  let bloom = $state(true);
  let view = $state<View>("front");
  let stats = $state({ strands: 0, drops: 0, puddles: 0 });

  const STEP = 1 / 60;
  const PERFORMERS = [-1.25, 0, 1.25];

  function intent(): GooIntent {
    const preset = GOO_PRESETS.find((item) => item.id === presetId)!;
    return {
      ...DEFAULT_EFFECTS_CONFIG.goo,
      ...preset.patch,
      spewStyle: style,
    } as GooIntent;
  }

  function floorTexture(): CanvasTexture {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const g = canvas.getContext("2d")!;
    g.fillStyle = "#6c7480";
    g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      const shade = 96 + Math.random() * 30;
      g.fillStyle = `rgba(${shade},${shade + 6},${shade + 14},0.25)`;
      g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    g.strokeStyle = "#4a515c";
    g.lineWidth = 3;
    g.strokeRect(0, 0, 256, 256);
    const texture = new CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = RepeatWrapping;
    texture.repeat.set(12, 12);
    texture.colorSpace = SRGBColorSpace;
    return texture;
  }

  onMount(() => {
    const renderer = new WebGLRenderer({
      antialias: false,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    renderer.toneMapping = ACESFilmicToneMapping;
    host.appendChild(renderer.domElement);

    const scene = new Scene();
    scene.background = new Color("#05070d");
    scene.fog = new Fog("#05070d", 9, 22);
    scene.add(new HemisphereLight("#7d8fb8", "#1a1d26", 0.9));
    scene.add(new AmbientLight("#404a66", 0.4));
    const moon = new DirectionalLight("#c9d6ff", 1.6);
    moon.position.set(-3, 6, 4);
    scene.add(moon);

    const floor = new Mesh(
      new PlaneGeometry(14, 14),
      new MeshStandardMaterial({
        map: floorTexture(),
        roughness: 0.82,
        metalness: 0,
      })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const camera = new PerspectiveCamera(42, 1, 0.05, 60);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const composer = new EffectComposer(renderer, {
      frameBufferType: HalfFloatType,
    });
    composer.addPass(new RenderPass(scene, camera));
    const bloomPass = new EffectPass(
      camera,
      new BloomEffect({
        intensity: 0.8,
        luminanceThreshold: 0.6,
        luminanceSmoothing: 0.3,
        mipmapBlur: true,
        radius: 0.5,
      })
    );
    composer.addPass(bloomPass);

    const goo = new GooRenderer3D();
    goo.initialize(scene);

    // Each performer spins two props in the wall plane; each prop has a far
    // tip on a 0.6 m arc and a near handle end.
    const propMaterial = new MeshStandardMaterial({
      color: "#c8ccd6",
      roughness: 0.4,
    });
    const tipGeometry = new SphereGeometry(0.03, 12, 8);
    const rodGeometry = new CylinderGeometry(0.008, 0.008, 1, 6);
    const tips: {
      mesh: Mesh;
      prev: Vector3;
      pos: Vector3;
      id: number;
      prop: 0 | 1;
      tip: 0 | 1;
    }[] = [];
    const rods: Mesh[] = [];
    let id = 0;
    for (let p = 0; p < PERFORMERS.length; p++) {
      for (const prop of [0, 1] as const) {
        const rod = new Mesh(rodGeometry, propMaterial);
        scene.add(rod);
        rods.push(rod);
        for (const tip of [0, 1] as const) {
          const mesh = new Mesh(tipGeometry, propMaterial);
          scene.add(mesh);
          tips.push({
            mesh,
            prev: new Vector3(),
            pos: new Vector3(),
            id: id++,
            prop,
            tip,
          });
        }
      }
    }

    let time = 0;
    function place(t: number): void {
      for (let p = 0; p < PERFORMERS.length; p++) {
        for (const prop of [0, 1] as const) {
          const side = prop === 0 ? -1 : 1;
          const rate = 2 * Math.PI * (1.05 + 0.12 * p);
          const angle =
            rate * t * (prop === 0 ? 1 : -1) + p * 1.3 + prop * Math.PI;
          const hand = new Vector3(
            PERFORMERS[p]! + side * 0.22 + 0.08 * Math.cos(rate * t * 0.5),
            1.25 + 0.06 * Math.sin(rate * t * 0.5),
            0.1 * Math.sin(p + prop)
          );
          const dir = new Vector3(
            Math.cos(angle),
            Math.sin(angle),
            0.18 * Math.sin(angle * 0.5)
          );
          dir.normalize();
          const far = hand.clone().addScaledVector(dir, 0.62);
          const near = hand.clone().addScaledVector(dir, -0.12);
          const rod = rods[p * 2 + prop]!;
          rod.position.copy(far).add(near).multiplyScalar(0.5);
          rod.scale.set(1, far.distanceTo(near), 1);
          rod.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
          const base = (p * 2 + prop) * 2;
          tips[base]!.pos.copy(far);
          tips[base + 1]!.pos.copy(near);
        }
      }
    }

    function sources(dt: number): GooTipSource3D[] {
      const params = resolveGoo3D(intent());
      return tips.map((tip) => {
        const velocity = tip.pos
          .clone()
          .sub(tip.prev)
          .divideScalar(Math.max(dt, 1e-6));
        return {
          effect: "goo",
          sourceId: tip.id,
          propIndex: tip.prop,
          tipIndex: tip.tip,
          position: { x: tip.pos.x, y: tip.pos.y, z: tip.pos.z },
          velocity: { x: velocity.x, y: velocity.y, z: velocity.z },
          speed: velocity.length(),
          currentStep: 0,
          propColor: "#ffffff",
          params,
          collisionFloorY: 0,
        };
      });
    }

    function step(dt: number): void {
      for (const tip of tips) tip.prev.copy(tip.pos);
      time += dt;
      place(time);
      for (const tip of tips) tip.mesh.position.copy(tip.pos);
      goo.update(sources(dt), dt);
    }

    place(0);
    for (const tip of tips) tip.prev.copy(tip.pos);

    function applyView(next: View): void {
      if (next === "front") camera.position.set(0, 1.55, 4.4);
      if (next === "low") camera.position.set(0.9, 0.45, 1.9);
      if (next === "top") camera.position.set(0.01, 4.2, 1.2);
      controls.target.set(0, next === "low" ? 0.25 : 0.8, 0);
      controls.update();
    }
    applyView(view);

    function resize(): void {
      const { clientWidth: w, clientHeight: h } = host;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    let carry = 0;
    let last = performance.now();
    let raf = 0;
    let frames = 0;
    function frame(now: number): void {
      raf = requestAnimationFrame(frame);
      carry += Math.min(0.1, (now - last) / 1000) * speed;
      last = now;
      while (carry >= STEP) {
        step(STEP);
        carry -= STEP;
      }
      render();
    }
    function render(): void {
      controls.update();
      bloomPass.enabled = bloom;
      if (bloom) composer.render();
      else renderer.render(scene, camera);
      if (++frames % 15 === 0) stats = goo.debugCounts();
    }
    raf = requestAnimationFrame(frame);

    const lab = {
      advance(seconds: number) {
        for (let t = 0; t < seconds; t += STEP) step(STEP);
        render();
      },
      clear: () => goo.clear(),
      view: (next: View) => applyView(next),
      // A hidden browser pane stalls ResizeObserver and rAF; labs call these.
      resize,
      render,
      counts: () => goo.debugCounts(),
      goo,
      camera,
      controls,
    };
    (window as unknown as { __gooLab: typeof lab }).__gooLab = lab;
    clearLab = lab.clear;
    setView = lab.view;

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      goo.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  });

  let clearLab = () => {};
  let setView = (_: View) => {};
</script>

<div class="lab">
  <div class="stage" bind:this={host}></div>
  <div class="bar">
    <div class="group" aria-label="Preset">
      {#each GOO_PRESETS as preset (preset.id)}
        <button
          aria-pressed={presetId === preset.id}
          onclick={() => (presetId = preset.id)}
        >
          {preset.name}
        </button>
      {/each}
    </div>
    <div class="group" aria-label="Style">
      {#each ["flow", "splash", "mist"] as const as item (item)}
        <button aria-pressed={style === item} onclick={() => (style = item)}
          >{item}</button
        >
      {/each}
    </div>
    <div class="group" aria-label="Speed">
      {#each [[1, "1x"], [0.25, "Slow"], [0, "Pause"]] as const as [value, label] (label)}
        <button aria-pressed={speed === value} onclick={() => (speed = value)}
          >{label}</button
        >
      {/each}
    </div>
    <div class="group" aria-label="View">
      {#each ["front", "low", "top"] as const as item (item)}
        <button
          aria-pressed={view === item}
          onclick={() => {
            view = item;
            setView(item);
          }}>{item}</button
        >
      {/each}
    </div>
    <div class="group">
      <button aria-pressed={bloom} onclick={() => (bloom = !bloom)}
        >Bloom</button
      >
      <button onclick={() => clearLab()}>Clear</button>
    </div>
    <span class="stats"
      >{stats.strands} strands, {stats.drops} drops, {stats.puddles} puddles</span
    >
  </div>
</div>

<style>
  .lab {
    position: fixed;
    inset: 0;
    display: grid;
    grid-template-rows: 1fr auto;
    background: #05070d;
    color: #e6e9f2;
    font:
      14px system-ui,
      sans-serif;
  }
  .stage {
    min-height: 0;
    position: relative;
  }
  .stage :global(canvas) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }
  .bar {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 18px;
    align-items: center;
    padding: 10px 14px;
    background: #10141e;
  }
  .group {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  button {
    border: 1px solid #3a4256;
    background: #1a2030;
    color: inherit;
    padding: 6px 12px;
    border-radius: 999px;
    cursor: pointer;
    text-transform: capitalize;
  }
  button:hover {
    background: #252c40;
  }
  button[aria-pressed="true"] {
    background: #3a7fd9;
    border-color: #6fb3ff;
  }
  .stats {
    opacity: 0.7;
    font-variant-numeric: tabular-nums;
  }
</style>
