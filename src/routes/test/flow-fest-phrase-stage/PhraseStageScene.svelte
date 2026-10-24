<script lang="ts">
  /**
   * The staff test stage: two fire staff spinners on a small lit floor, each
   * playing their phrase schedule live from the phrase brain.
   *
   * Every frame the clock's beat is sampled into each performer's phrase
   * (`flow-fest-phrase-playback.ts`): the score for the props, where the body
   * stands and faces, and how the feet step. The page rebuilds the schedule
   * whenever a control changes; the clock carries on, so a change shows on
   * the phrase the performer is in now.
   *
   * The hands use the jam's grip (`contactMode="legacy"`): the full finger
   * solve held this stage near 33 fps with two staffs, the legacy grip 60.
   *
   * Loading follows the jam's gate: the library, both bodies and their
   * motion, then a shader compile and a few smooth frames, before the page
   * lifts its screen.
   */
  import { onDestroy, untrack } from "svelte";
  import { T, useTask, useThrelte } from "@threlte/core";
  import { HTML } from "@threlte/extras";
  import {
    Color,
    DoubleSide,
    Fog,
    PointLight,
    WebGLRenderTarget,
    type Camera,
    type Scene,
    type WebGLRenderer,
  } from "three";
  import { Plane } from "@austencloud/scene-3d";
  import LiveSequencePerformer3D from "#lib/shared/3d/performers/LiveSequencePerformer3D.svelte";
  import GaitProbe from "#lib/shared/3d/diagnostics/gait/GaitProbe.svelte";
  import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
  import type { CharacterId } from "#lib/shared/3d/domain/character-model.js";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import type {
    PhraseScheduleFile,
    ScheduledPhrase,
  } from "#lib/features/flow-fest-sim/domain/flow-fest-phrase-brain.js";
  import type { PhrasePlane } from "#lib/features/flow-fest-sim/domain/flow-fest-phrase-library.js";
  import {
    createPhrasePlayback,
    phraseFacingHint,
    phrasePassBeats,
    type PhrasePlaybackFrame,
  } from "#lib/features/flow-fest-sim/domain/flow-fest-phrase-playback.js";
  import {
    JamReadiness,
    type JamLoadProgress,
  } from "../flow-fest-jam/flow-fest-jam-readiness";

  interface Props {
    schedule: PhraseScheduleFile;
    /** The library sequence a phrase plays, rebuilt once per id. */
    sequenceFor: (sequenceId: string) => SequenceData;
    /** Beats per second come from here, so a tempo change does not jump the clock. */
    tempoBpm: number;
    /** The screen has gone: the clock runs. */
    begin: boolean;
    /** The sky and the far floor fade into this: the app theme's dark, deepened. */
    atmosphere: string;
    /** A short name over each performer's head, by performer id. */
    names: Record<string, string>;
    probe?: boolean;
    onLoading?: (progress: JamLoadProgress) => void;
    onPrepared?: () => void;
    onFrames?: (frames: readonly PhrasePlaybackFrame[]) => void;
  }

  const props: Props = $props();
  // The renderer is the WebGLRenderer itself at runtime, as the jam reads it.
  const { renderer, scene, camera } = useThrelte() as unknown as {
    renderer: WebGLRenderer;
    scene: Scene;
    camera: { current: Camera };
  };

  const HAND_PLANES: Record<PhrasePlane, Plane> = {
    wall: Plane.WALL,
    wheel: Plane.WHEEL,
    floor: Plane.FLOOR,
  };

  // Each staff's plane per beat. The baseline is wall on both hands, which
  // the performer stores as no override, so every beat's planes are given
  // explicitly; step 0 is the start placement and takes the first beat's.
  // Cached per phrase so a performer reloads only when its own phrase does.
  const planeOverrides = new WeakMap<
    ScheduledPhrase,
    ReadonlyMap<number, { left: Plane; right: Plane }>
  >();
  function beatPlaneOverridesFor(
    phrase: ScheduledPhrase
  ): ReadonlyMap<number, { left: Plane; right: Plane }> {
    let overrides = planeOverrides.get(phrase);
    if (!overrides) {
      const map = new Map<number, { left: Plane; right: Plane }>();
      const hands = (b: (typeof phrase.beatPlanes)[number]) => ({
        left: HAND_PLANES[b.left],
        right: HAND_PLANES[b.right],
      });
      if (phrase.beatPlanes[0]) map.set(0, hands(phrase.beatPlanes[0]));
      phrase.beatPlanes.forEach((b, i) => map.set(i + 1, hands(b)));
      overrides = map;
      planeOverrides.set(phrase, overrides);
    }
    return overrides;
  }

  // The body response's facing hint (radians against the root, rig sign):
  // eased over the phrase's first pass, then the target alone, because the
  // response's track loops round the sequence. Cached per phrase and pass.
  const facingHints = new WeakMap<
    ScheduledPhrase,
    [(t: number) => number | null, (t: number) => number | null]
  >();
  function facingHintFor(
    i: number,
    frame: PhrasePlaybackFrame
  ): (scoreTime: number) => number | null {
    let hints = facingHints.get(frame.phrase);
    if (!hints) {
      const from = playbacks[i]!.facingFrom(frame.phraseIndex);
      hints = [
        phraseFacingHint(frame.phrase, from),
        phraseFacingHint(frame.phrase, from, true),
      ];
      facingHints.set(frame.phrase, hints);
    }
    return hints[frame.scoreBeat >= phrasePassBeats(frame.phrase) ? 1 : 0];
  }

  const playbacks = $derived(
    props.schedule.performers.map((performer) =>
      createPhrasePlayback(performer, {
        tempoBpm: props.schedule.tempoBpm,
        lengthBeats: props.schedule.lengthBeats,
      })
    )
  );

  let beat = $state(0);
  const frames = $derived(playbacks.map((playback) => playback.sample(beat)));
  // The phrase each performer is in, kept apart from the per-frame samples:
  // the sequence, planes and speed change only when a phrase does, and a
  // performer reloads whenever they look new.
  let phraseIndices = $state<number[]>([]);
  const phrases = $derived(
    props.schedule.performers.map(
      (performer, i) =>
        performer.phrases[phraseIndices[i] ?? 0] ?? performer.phrases[0]!
    )
  );

  // ------------------------------------------------------------------ loading

  // Ids are fixed for the page: a rebuilt schedule keeps its cast.
  const performerIds = untrack(() =>
    props.schedule.performers.map((p) => p.id)
  );
  const readiness = new JamReadiness([
    "stage:library",
    ...performerIds.flatMap((id) => [
      `performer:${id}`,
      `performer-motion:${id}`,
    ]),
    "warm:compiled",
    "warm:smooth",
  ]);
  const SMOOTH_FRAME_MS = 25;
  const SMOOTH_FRAMES = 8;
  const SMOOTH_WAIT_MS = 4000;
  const LOAD_CAP_MS = 45_000;
  const mountedAt = performance.now();
  let gate: "waiting" | "mounting" | "compiling" | "settling" | "done" =
    "waiting";
  let gateFrames = 0;
  let settleStarted = 0;
  let lastReady = -1;

  function piece(name: string): void {
    readiness.mark(name);
    const progress = readiness.progress();
    if (progress.ready === lastReady) return;
    lastReady = progress.ready;
    props.onLoading?.(progress);
  }
  piece("stage:library");

  /** Compile against the composer's linear target, as the jam does, so no program is built twice. */
  async function warmUp(): Promise<void> {
    const c = camera.current;
    const target = new WebGLRenderTarget(1, 1);
    const previous = renderer.getRenderTarget();
    try {
      renderer.setRenderTarget(target);
      const compiled = renderer.compileAsync(scene, c, scene);
      renderer.setRenderTarget(previous);
      await compiled;
    } finally {
      renderer.setRenderTarget(previous);
      target.dispose();
    }
  }

  function stepGate(delta: number): void {
    const now = performance.now();
    if (
      gate === "waiting" &&
      (readiness.loaded || now - mountedAt > LOAD_CAP_MS)
    ) {
      if (!readiness.loaded)
        console.warn(
          "[phrase-stage] still missing, showing anyway:",
          readiness.missing()
        );
      gate = "mounting";
      gateFrames = 0;
    } else if (gate === "mounting" && ++gateFrames >= 4) {
      gate = "compiling";
      void warmUp()
        .catch((error: unknown) =>
          console.warn("[phrase-stage] warm-up compile failed", error)
        )
        .finally(() => {
          piece("warm:compiled");
          gate = "settling";
          gateFrames = 0;
          settleStarted = performance.now();
        });
    } else if (gate === "settling") {
      gateFrames = delta * 1000 < SMOOTH_FRAME_MS ? gateFrames + 1 : 0;
      if (gateFrames >= SMOOTH_FRAMES || now - settleStarted > SMOOTH_WAIT_MS) {
        gate = "done";
        piece("warm:smooth");
        props.onPrepared?.();
      }
    }
  }

  // ------------------------------------------------------------------- lights

  // A fire lights its spinner: one warm point light per performer, at the
  // hands, flickering a little. The stage itself is lit cool and low, as a
  // night stage is, so the fire reads.
  // The theme's atmosphere is the sky, and the floor fades into it rather
  // than ending at an edge.
  $effect(() => {
    const sky = new Color(props.atmosphere);
    scene.background = sky;
    scene.fog = new Fog(sky, 24, 48);
  });
  onDestroy(() => {
    scene.background = null;
    scene.fog = null;
  });

  const fireLights = performerIds.map(() => {
    const light = new PointLight(new Color(1.0, 0.55, 0.22), 6, 7, 1.6);
    light.castShadow = false;
    return light;
  });
  let flicker = 0;

  // -------------------------------------------------------------------- clock

  // Verification can stop the clock on an exact beat (the performers keep
  // their last fifth of a beat looping, fire lit):
  // `__phraseStage.seek(66.5)`, `__phraseStage.hold(true)`.
  let held = $state(false);
  const seek = (to: number) => {
    beat = to;
  };
  const hold = (on: boolean) => {
    held = on;
  };

  useTask((delta) => {
    if (gate !== "done") stepGate(delta);
    if (props.begin && !held)
      beat += Math.min(Math.max(delta, 0), 0.1) * (props.tempoBpm / 60);
    flicker += delta;
    if (frames.some((frame, i) => frame.phraseIndex !== phraseIndices[i]))
      phraseIndices = frames.map((frame) => frame.phraseIndex);
    for (const [i, light] of fireLights.entries()) {
      const frame = frames[i];
      if (!frame) continue;
      light.position.set(frame.position.x, 1.45, frame.position.z);
      light.intensity =
        5.5 +
        Math.sin(flicker * 13.7 + i * 2.1) * 0.6 +
        Math.sin(flicker * 31.3 + i) * 0.4;
    }
    props.onFrames?.(frames);
    (globalThis as Record<string, unknown>).__phraseStage = {
      beat,
      frames,
      schedule: props.schedule,
      scene,
      seek,
      hold,
    };
  });

  onDestroy(() => {
    delete (globalThis as Record<string, unknown>).__phraseStage;
  });
</script>

<T.HemisphereLight args={["#5d6b96", "#14110e", 0.55]} />
<T.AmbientLight intensity={0.12} />
<!-- Cool moonlight from the audience side, high, so faces and the floor read. -->
<T.DirectionalLight position={[3, 7, 9]} intensity={0.55} color="#9fb4ff" />
<!-- The fire is the key. A dim, cool fill from low in front keeps the bodies
     readable between its flickers without washing it out. -->
<T.DirectionalLight position={[-4, 1.6, 8]} intensity={0.35} color="#7f9bd6" />
{#each fireLights as light, i (i)}
  <T is={light} />
{/each}

<!-- A matte stage floor that runs out into the fog, with a faint metre grid
     so footsteps can be judged against it. -->
<T.Mesh rotation.x={-Math.PI / 2} receiveShadow>
  <T.PlaneGeometry args={[80, 80]} />
  <T.MeshStandardMaterial color="#17181c" roughness={0.97} metalness={0} />
</T.Mesh>
<T.GridHelper
  args={[24, 24, "#3a3d44", "#2b2d33"]}
  position.y={0.003}
  material.transparent
  material.opacity={0.2}
  material.depthWrite={false}
/>
<!-- Each performer's area, faint, so travel can be judged against it. -->
{#each props.schedule.performers as performer (performer.id)}
  <T.Mesh
    rotation.x={-Math.PI / 2}
    position={[performer.home.x, 0.005, performer.home.z]}
  >
    <T.RingGeometry
      args={[performer.areaRadius - 0.02, performer.areaRadius, 96]}
    />
    <T.MeshBasicMaterial
      color="#b9a690"
      transparent
      opacity={0.16}
      depthWrite={false}
      side={DoubleSide}
    />
  </T.Mesh>
{/each}

{#each props.schedule.performers as performer, i (performer.id)}
  {@const frame = frames[i]}
  {@const phrase = phrases[i]}
  {#if frame && phrase}
    <LiveSequencePerformer3D
      id={`phrase-stage-${performer.id}`}
      position={{ x: frame.position.x, y: 0, z: frame.position.z }}
      facingAngle={frame.facingAngle}
      characterId={performer.characterId as CharacterId}
      capturePlane="wall"
      leftPlane={Plane.WALL}
      rightPlane={Plane.WALL}
      beatPlaneOverrides={beatPlaneOverridesFor(phrase)}
      propType={PropType.FIRE_DOUBLE_STAFF}
      sequence={props.sequenceFor(phrase.sequenceId)}
      effectId="fire"
      effectQualityTier="medium"
      contactMode="legacy"
      scoreBeat={frame.scoreBeat}
      playbackSpeed={(props.tempoBpm / 60) * frame.scoreRate}
      active={!phrase.rest}
      isMoving={frame.isMoving}
      moveSpeed={frame.moveSpeed}
      moveDirection={frame.moveDirection}
      gaitTimingSample={frame.gaitTimingSample}
      terminalStepPlan={frame.terminalStepPlan}
      turnRequest={frame.turnRequest}
      bodyResponse={true}
      facingHint={facingHintFor(i, frame)}
      onReady={() => piece(`performer:${performer.id}`)}
      onMotionReady={() => piece(`performer-motion:${performer.id}`)}
      onMotionError={(message) => {
        console.warn(
          `[phrase-stage] ${performer.id} motion failed: ${message}`
        );
        piece(`performer-motion:${performer.id}`);
      }}
    />
    <HTML
      position={[frame.position.x, 2.3, frame.position.z]}
      center
      zIndexRange={[10, 0]}
      pointerEvents="none"
    >
      <p class="tag" data-performer={performer.id}>
        {props.names[performer.id] ?? performer.id}
      </p>
    </HTML>
  {/if}
{/each}

{#if props.probe}
  <GaitProbe capacity={1800} />
{/if}

<style>
  /* A name tag only: the dock carries what each spinner is playing. */
  .tag {
    margin: 0;
    color: var(--theme-text-dim);
    font-size: var(--font-size-compact, 12px);
    letter-spacing: 0.04em;
    white-space: nowrap;
    text-shadow: 0 1px 3px rgb(0 0 0 / 0.8);
  }
</style>
