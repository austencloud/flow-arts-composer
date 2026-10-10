<script lang="ts">
  import { useThrelte, useTask } from "@threlte/core";
  import { Vector3 } from "three";
  import {
    readyEffectIds,
    getRegistration,
  } from "#lib/shared/animation-engine/components/effects-panel/effect-registry.js";
  import { computeCovenLayout } from "#lib/features/coven-hub/domain/coven-hub-layout.js";
  import { computeCovenLods, type LodBand } from "#lib/features/coven-hub/domain/coven-lod.js";
  import CovenStation from "./CovenStation.svelte";
  import type { SequenceData } from "#lib/shared/foundation/domain/models/sequence-data.js";
  import SceneEffectsCoordinator3D from "#lib/shared/3d/effects/scene-effects/SceneEffectsCoordinator3D.svelte";
  import { SceneEffectsManager3D } from "#lib/shared/3d/effects/scene-effects/scene-effects-manager-3d.js";
  import { setSceneEffectsContext } from "#lib/shared/3d/effects/scene-effects/scene-effects-context.js";

  interface Props { sequence: SequenceData | null; }
  const props: Props = $props();
  const sceneEffectsManager = setSceneEffectsContext(new SceneEffectsManager3D());

  const slots = $derived(computeCovenLayout(readyEffectIds()));
  let lods = $state<Map<string, LodBand>>(new Map());

  const { camera } = useThrelte();
  const tmp = new Vector3();

  // Recompute LOD from camera position. Throttle to ~6 Hz to avoid churn.
  let acc = 0;
  useTask((delta) => {
    acc += delta;
    if (acc < 0.16) return;
    acc = 0;
    const cam = camera.current;
    if (!cam) return;
    cam.getWorldPosition(tmp);
    lods = computeCovenLods(
      tmp.x,
      tmp.z,
      slots.map((s) => ({ id: s.id, x: s.x, z: s.z })),
      lods,
    );
  });

  function stageModelFor(effectId: string | null): string | null {
    if (!effectId) return null;
    return getRegistration(effectId)?.meta.stageModel ?? null;
  }
</script>

<SceneEffectsCoordinator3D manager={sceneEffectsManager} />

{#each slots as slot (slot.id)}
  <CovenStation
    stationId={slot.id}
    worldX={slot.x}
    worldZ={slot.z}
    sequence={props.sequence}
    effectId={slot.effectId}
    stageModel={stageModelFor(slot.effectId)}
    lod={lods.get(slot.id) ?? (slot.kind === "seed" ? "hero" : "frozen")}
  />
{/each}
