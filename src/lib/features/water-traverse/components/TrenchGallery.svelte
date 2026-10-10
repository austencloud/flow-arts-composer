<script lang="ts">
  /**
   * The composed trench reef: 513 instances of 37 researched assets, spread
   * across the whole 98 m middle leg.
   *
   * This replaces the single baked ocean reef GLB the trench used to borrow.
   * That asset is composed for the ocean stage — a theatre arranged around a
   * proscenium and a hero camera — so dropping it here produced a 40 m island
   * in a 98 m room with bare sand either side of it.
   *
   * The composition is authored offline and baked, per
   * .claude/rules/blender-first-3d-scenes.md:
   *
   *   scripts/water-traverse-reef-layout.json   the art layer
   *   scripts/generate-traverse-reef.py         -> water-traverse-reef.json
   *   scripts/build-traverse-reef.py            -> trench-reef_raw.glb
   *   scripts/optimize-ocean-glb.mjs <in> <out> -> trench-reef.glb
   *
   * Placements carry ABSOLUTE route z, so this group sits at z = 0 and only
   * the seabed elevation is applied. Do not centre it on the trench.
   *
   * Design: docs/superpowers/specs/active/2026-08-09-trench-gallery-composition-design.md
   */
  import { T } from "@threlte/core";
  import { useDraco, useKtx2, useMeshopt } from "@threlte/extras";
  import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
  import type { Group, Mesh, MeshStandardMaterial } from "three";
  import { R2_CDN } from "#lib/shared/3d/constants/r2-cdn.js";

  interface Props {
    /** Seabed elevation. Placement y is measured from it. */
    floorY: number;
    onProgress?: (fraction: number) => void;
    onReady?: (root: Group) => void;
  }

  const { floorY, onProgress, onReady }: Props = $props();

  // Same large-asset split as the ocean flora scene: anything over Cloudflare
  // Pages' 25 MiB per-file limit is stripped from the deploy by
  // trim-deploy-assets.js and has to come from R2 in production. Dev serves it
  // out of static/ so iterating on the composition costs no round trip.
  const GLB_URL = import.meta.env.DEV
    ? "/models/water-traverse/trench-reef.glb"
    : `${R2_CDN}/models/water-traverse/trench-reef.glb`;

  let root = $state.raw<Group | null>(null);

  /**
   * Make the source assets dielectric.
   *
   * Most of the 38 specimens arrive with `metalness: 1` — a glTF default that
   * survives when the exporter writes no metallicRoughness texture. A fully
   * metallic PBR surface has NO diffuse response: it shows only the specular
   * reflection of an environment map, and this trench has no environment map.
   * The result was the largest specimens rendering as black cutouts with a pale
   * rim where the single directional light's rough specular lobe caught them.
   *
   * It also made the chamber immune to lighting work. Hemisphere light is
   * diffuse, so raising the seabed's upwelling fill changed nothing at all on
   * the surfaces that most needed it — the failure looked like a lighting bug
   * and was a material one.
   *
   * Coral, sponge, sand-rock and basalt are dielectrics. Metalness 0 is not a
   * look choice here, it is the correct value; the 1 is junk metadata. Fixed at
   * load rather than in the bake so it also covers any specimen added later
   * from the same third-party sources.
   */
  function makeDielectric(group: Group) {
    const seen = new Set<string>();
    group.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      const material = mesh.material as MeshStandardMaterial;
      if (!material || seen.has(material.uuid)) return;
      seen.add(material.uuid);
      if (material.metalness === undefined) return;
      material.metalness = 0;
      material.needsUpdate = true;
    });
  }

  const loader = new GLTFLoader();
  loader.setDRACOLoader(useDraco("/draco/"));
  loader.setMeshoptDecoder(useMeshopt());
  loader.setKTX2Loader(useKtx2("/basis/"));

  loader.load(
    GLB_URL,
    (gltf) => {
      root = gltf.scene as Group;
      makeDielectric(root);
      onProgress?.(1);
      onReady?.(root);
    },
    (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    },
    (error) => {
      console.error("[TrenchGallery] failed to load", GLB_URL, error);
      // Report ready anyway: the walk must not sit on a loading gate forever
      // because its scenery is missing. A trench with no reef is a worse scene,
      // not a broken one.
      onProgress?.(1);
    }
  );
</script>

{#if root}
  <T.Group position={[0, floorY, 0]}>
    <T is={root} />
  </T.Group>
{/if}
