<script lang="ts">
  /**
   * Elemental motif harness.
   *
   * Six stations, one per Vulcan Cave room, each running that room's VTG
   * modality with the avatar hidden and the props optionally hidden — so what
   * moves through the air is the effect alone, tracing the timing-and-direction
   * the room exists to teach.
   *
   * This is a decision tool, not a feature. The open question it answers is
   * which effect reads as which element, and it answers it by showing all six
   * at once with the choices switchable.
   */
  import { Canvas, T } from "@threlte/core";
  import { page } from "$app/state";
  import { WebGLRenderer } from "three";
  import OrbitControls from "#lib/shared/3d/components/OrbitControls.svelte";
  import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte";
  import { getRegistration } from "#lib/shared/animation-engine/components/effects-panel/effect-registry.js";
  import ElementMotifScene from "./ElementMotifScene.svelte";
  import { ELEMENT_MOTIFS } from "./element-motifs";

  let showProps = $state(false);
  let showRings = $state(true);
  let playing = $state(true);

  let effects = $state<Record<string, string>>(
    Object.fromEntries(ELEMENT_MOTIFS.map((m) => [m.roomId, m.defaultEffect])),
  );

  /**
   * `?e=<effectId>` puts one effect alone at the origin with the camera pulled
   * in. That is how each effect gets judged on its own terms — in the line of
   * six, an emitter with a scale bug swallows its neighbours and you learn
   * nothing about either. `?room=<roomId>` picks which modality carries it.
   */
  const soloEffect = $derived(page.url.searchParams.get("e"));
  const soloRoomId = $derived(
    soloEffect ? page.url.searchParams.get("room") ?? ELEMENT_MOTIFS[0].roomId : null,
  );
  const resolvedEffects = $derived(
    soloEffect && soloRoomId ? { ...effects, [soloRoomId]: soloEffect } : effects,
  );
  const cameraPosition = $derived<[number, number, number]>(
    soloEffect ? [0, 2.6, 8] : [0, 3.4, 17],
  );

  function effectLabel(id: string): string {
    return getRegistration(id)?.label ?? id;
  }

  const boolOptions = [
    { value: true, label: "On" },
    { value: false, label: "Off" },
  ];
</script>

<svelte:head><title>Elemental motifs — six modalities</title></svelte:head>

<div class="harness">
  <header>
    <h1>Elemental motifs</h1>
    <p>
      Six rooms, six VTG modalities, avatar hidden. With the props off, the only thing
      in the air is the effect drawing the motion. Orbit to look along the line.
    </p>
  </header>

  <section class="stage">
    <Canvas
      createRenderer={(canvas) =>
        new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" })}
    >
      <T.PerspectiveCamera makeDefault position={cameraPosition} fov={52}>
        <OrbitControls enableDamping target={[0, 1.5, 0]} maxPolarAngle={Math.PI / 2} />
      </T.PerspectiveCamera>
      <ElementMotifScene
        effects={resolvedEffects}
        {showProps}
        {playing}
        {showRings}
        {soloRoomId}
      />
    </Canvas>
  </section>

  <section class="controls">
    <div class="globals">
      <label class="global">
        <span>Props</span>
        <SegmentedControl
          options={boolOptions}
          value={showProps}
          onchange={(v) => (showProps = v)}
          size="sm"
          ariaLabel="Show props"
        />
      </label>
      <label class="global">
        <span>Playing</span>
        <SegmentedControl
          options={boolOptions}
          value={playing}
          onchange={(v) => (playing = v)}
          size="sm"
          ariaLabel="Playing"
        />
      </label>
      <label class="global">
        <span>Rings</span>
        <SegmentedControl
          options={boolOptions}
          value={showRings}
          onchange={(v) => (showRings = v)}
          size="sm"
          ariaLabel="Show floor rings"
        />
      </label>
    </div>

    <ul class="stations">
      {#each ELEMENT_MOTIFS as motif (motif.roomId)}
        <li style:--accent={motif.color}>
          <div class="head">
            <span class="swatch" aria-hidden="true"></span>
            <strong>{motif.label}</strong>
            <code>{motif.category}</code>
          </div>
          <p class="mode">{motif.technicalMode} · {motif.letters}</p>
          <p class="intent">{motif.intent}</p>
          <SegmentedControl
            options={motif.candidates.map((id) => ({ value: id, label: effectLabel(id) }))}
            value={resolvedEffects[motif.roomId] ?? motif.defaultEffect}
            onchange={(v) => (effects = { ...effects, [motif.roomId]: v })}
            size="sm"
            ariaLabel={`${motif.label} effect`}
          />
        </li>
      {/each}
    </ul>
  </section>
</div>

<style>
  .harness {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding: 1.5rem;
    min-height: 100svh;
    background: #070a12;
    color: #e8ecf6;
  }

  header h1 {
    margin: 0;
    font-size: 1.5rem;
    letter-spacing: -0.01em;
  }

  header p {
    margin: 0.35rem 0 0;
    color: #9fb0cc;
    max-width: 70ch;
  }

  .stage {
    position: relative;
    /* Reserved box: the canvas must not resize as the scene loads. */
    height: clamp(24rem, 52svh, 44rem);
    border-radius: 0.75rem;
    overflow: hidden;
    background: #04060c;
  }

  .globals {
    display: flex;
    flex-wrap: wrap;
    gap: 1.25rem;
    margin-bottom: 1rem;
  }

  .global {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.9rem;
    color: #9fb0cc;
  }

  .stations {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(3, 1fr);
  }

  .stations li {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 0.9rem 1rem;
    border-radius: 0.6rem;
    background: #0d1220;
    border: 1px solid color-mix(in srgb, var(--accent) 30%, transparent);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .swatch {
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 50%;
    background: var(--accent);
  }

  .head code {
    margin-left: auto;
    font-size: 0.75rem;
    color: #7d8ba6;
  }

  .mode {
    margin: 0;
    font-size: 0.8rem;
    color: #8fa0bd;
  }

  .intent {
    margin: 0 0 0.4rem;
    font-size: 0.8rem;
    color: #6f7f9c;
  }

  /* Big screens: the line of six wants one row of cards under it. */
  @media (min-width: 1680px) {
    .stations {
      grid-template-columns: repeat(6, 1fr);
    }
  }

  @media (max-width: 900px) {
    .stations {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 560px) {
    .stations {
      grid-template-columns: 1fr;
    }
  }
</style>
