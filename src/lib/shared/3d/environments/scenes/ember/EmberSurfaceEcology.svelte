<script lang="ts">
  import { T, useTask, useThrelte } from "@threlte/core";
  import { userProportionsState } from "@austencloud/scene-3d";
  import { onDestroy, untrack } from "svelte";
  import {
    BufferAttribute,
    BufferGeometry,
    Euler,
    InstancedMesh,
    Matrix4,
    Mesh,
    Quaternion,
    Vector3,
    type Material,
  } from "three";
  import {
    createEmberHorizonApron,
    createEmberSurfaceEcology,
    createEmberTerrainHeightField,
    type EmberSurfacePlacement,
    type EmberTerrainHeightField,
  } from "./ember-surface-ecology";
  import { createEmberSurfacePlateGeometry } from "./ember-surface-plate-geometry";
  import { createEmberBoulderGeometry } from "./ember-boulder-geometry";

  interface Props {
    stageRadius?: number;
  }

  // The basin is the only mesh in the production slice that spans the whole
  // world, so it is both the terrain the outer scatter has to sit on and the
  // surface the horizon apron has to continue. It is resolved from the scene
  // graph rather than handed down as a prop because the slice's ready hook is
  // owned elsewhere in EmberScene.
  const BASIN_NODE_NAME = "Ember_Volcanic_Basin_living_caldera";

  let { stageRadius = 3 }: Props = $props();
  const { scene } = useThrelte();
  const groundY = $derived(userProportionsState.groundY);
  let basin = $state<Mesh | null>(null);
  const families = ["cold", "iron", "glass"] as const;
  // Glass was a blue-grey that the hemisphere light lifted to a pale, almost
  // translucent ball beside the cold basalt. Obsidian is black; its identity is
  // the tighter specular, not a lighter albedo.
  const colors = {
    cold: "#16191a",
    iron: "#3a1a12",
    glass: "#141a1c",
  } as const;
  const plateGeometry = untrack(() => createEmberSurfacePlateGeometry());
  const boulderGeometry = untrack(() => createEmberBoulderGeometry());

  // Bounded so a failed slice load cannot leave a graph walk running for the
  // life of the scene. Roughly ten seconds at 60fps.
  let basinSearchFrames = 0;
  const { stop: stopBasinSearch } = useTask(
    () => {
      const found = scene.getObjectByName(BASIN_NODE_NAME);
      if (found && (found as Mesh).isMesh) {
        basin = found as Mesh;
        stopBasinSearch();
        return;
      }
      basinSearchFrames += 1;
      if (basinSearchFrames > 600) stopBasinSearch();
    },
    { autoInvalidate: false }
  );

  const heightField = $derived.by<EmberTerrainHeightField | null>(() => {
    const mesh = basin;
    if (!mesh) return null;
    const attribute = mesh.geometry.getAttribute("position");
    if (!attribute) return null;
    mesh.updateWorldMatrix(true, false);
    const point = new Vector3();
    const world = new Float32Array(attribute.count * 3);
    for (let index = 0; index < attribute.count; index += 1) {
      point.fromBufferAttribute(attribute, index).applyMatrix4(mesh.matrixWorld);
      world[index * 3] = point.x;
      world[index * 3 + 1] = point.y;
      world[index * 3 + 2] = point.z;
    }
    return createEmberTerrainHeightField(world, groundY);
  });

  const ecology = $derived(
    createEmberSurfaceEcology(stageRadius, 9413, heightField)
  );
  const scatterKey = $derived(`${stageRadius}:${heightField ? "seated" : "flat"}`);

  const apronGeometry = $derived.by(() => {
    const field = heightField;
    if (!field) return null;
    const data = createEmberHorizonApron(field);
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(data.positions, 3));
    geometry.setAttribute("normal", new BufferAttribute(data.normals, 3));
    geometry.setAttribute("uv", new BufferAttribute(data.uvs, 2));
    geometry.setIndex(new BufferAttribute(data.indices, 1));
    geometry.computeBoundingSphere();
    return geometry;
  });

  // The apron borrows the basin's material so the world-space ground detail
  // continues across the rim without a second patched material or a second
  // program.
  const apronMaterial = $derived(
    (basin?.material as Material | Material[] | undefined) ?? null
  );

  $effect(() => {
    const geometry = apronGeometry;
    return () => geometry?.dispose();
  });

  onDestroy(() => {
    stopBasinSearch();
    plateGeometry.dispose();
    boulderGeometry.dispose();
  });

  function placementsFor(
    placements: EmberSurfacePlacement[],
    family: (typeof families)[number]
  ): EmberSurfacePlacement[] {
    return placements.filter((placement) => placement.family === family);
  }

  function fill(
    mesh: InstancedMesh | null,
    placements: EmberSurfacePlacement[]
  ) {
    if (!mesh) return;
    const matrix = new Matrix4();
    const position = new Vector3();
    const rotation = new Quaternion();
    const euler = new Euler();
    const scale = new Vector3();
    for (const [index, placement] of placements.entries()) {
      position.set(
        placement.position[0],
        groundY + placement.position[1],
        placement.position[2]
      );
      euler.set(...placement.rotation);
      rotation.setFromEuler(euler);
      scale.set(...placement.scale);
      matrix.compose(position, rotation, scale);
      mesh.setMatrixAt(index, matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }
</script>

{#if apronGeometry && apronMaterial}
  <T.Mesh
    geometry={apronGeometry}
    material={apronMaterial}
    position={[0, groundY, 0]}
    castShadow={false}
    receiveShadow={false}
  />
{/if}

{#key scatterKey}
  {#each families as family}
    {@const rubble = placementsFor(
      [...ecology.rubble, ...ecology.outcrops],
      family
    )}
    {@const plates = placementsFor(ecology.plates, family)}
    {#if rubble.length > 0}
      <T.InstancedMesh
        args={[undefined, undefined, rubble.length]}
        geometry={boulderGeometry}
        receiveShadow
        oncreate={(mesh: InstancedMesh) => fill(mesh, rubble)}
      >
        <T.MeshStandardMaterial
          color={colors[family]}
          roughness={family === "glass" ? 0.74 : 0.92}
          metalness={family === "glass" ? 0.08 : 0.02}
          flatShading
        />
      </T.InstancedMesh>
    {/if}
    {#if plates.length > 0}
      <T.InstancedMesh
        args={[undefined, undefined, plates.length]}
        geometry={plateGeometry}
        receiveShadow
        oncreate={(mesh: InstancedMesh) => fill(mesh, plates)}
      >
        <T.MeshStandardMaterial
          color={colors[family]}
          emissive={family === "iron" ? "#2a0904" : "#050708"}
          emissiveIntensity={family === "iron" ? 0.1 : 0.025}
          roughness={family === "glass" ? 0.62 : 0.9}
          metalness={family === "glass" ? 0.18 : 0.02}
          flatShading
        />
      </T.InstancedMesh>
    {/if}
  {/each}
{/key}
