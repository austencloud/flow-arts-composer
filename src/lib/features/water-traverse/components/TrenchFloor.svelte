<script lang="ts">
  /**
   * The sculpted trench floor.
   *
   * Replaces the flat `#41504e` plane the middle leg shipped with. That plane
   * is why every frame down here bottomed out in dead teal: there was nothing
   * on the ground to look at and no route through it, so 712 reef specimens
   * were being dressed onto a graybox.
   *
   * The mesh is baked from the same height field the colliders are tiled from
   * (scripts/traverse_seabed.py -> water-traverse-seabed.ts), so what the
   * visitor sees and what they stand on are the same surface by construction.
   *
   * Colour rides on the mesh as COLOR_0 — pale swept sand down the cleared
   * route, silt at the verge, dark rock up the flanks. No texture: at 138 m by
   * 84 m one would be the largest asset in the walk, and what the floor needs
   * is a gradient, not detail.
   *
   * The GLB carries absolute route coordinates for the whole sea leg, so it is
   * placed at the world origin and never offset.
   */
  import { T, useThrelte } from "@threlte/core";
  import { useGltf } from "@threlte/extras";
  import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
  import { MeshStandardMaterial, PMREMGenerator, type Mesh } from "three";
  import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

  interface Props {
    onReady?: () => void;
  }

  const { onReady }: Props = $props();

  const gltf = useGltf("/models/water-traverse/trench-floor.glb", {
    meshoptDecoder: MeshoptDecoder,
  });

  /**
   * The bake ships a Principled BSDF that comes through glTF as metalness 0,
   * roughness 1 — correct — but with `vertexColors` off on the three.js side
   * until something turns it on. Without this the whole sheet renders the
   * material's white base colour and the route disappears.
   */
  /**
   * The exposure correction, and the reason it lives here rather than in the
   * bake.
   *
   * The floor is the only large surface in the trench whose normal points
   * straight at the light, so it catches close to twice the irradiance of the
   * reef standing on it. At full value the sculpted ground rendered as a beach
   * at noon: the bottom half of the frame went to blown-out cream while the
   * water above it stayed deep blue.
   *
   * Multiplying it into the vertex colours instead would push the darkest
   * rock to ~0.03, which is three usable steps out of a u8 channel and bands
   * the mottle. Keeping the palette in a healthy range and stating the
   * correction once, here, is the honest split: the bake owns what the ground
   * is MADE of, this constant owns how much light lands on it.
   */
  const SURFACE_TINT = { r: 0.2, g: 0.25, b: 0.26 };

  const material = new MeshStandardMaterial({
    vertexColors: true,
    roughness: 1,
    metalness: 0,
  });
  material.color.setRGB(SURFACE_TINT.r, SURFACE_TINT.g, SURFACE_TINT.b);

  /**
   * The floor is 18 m under the surface, where the traverse's sun and
   * hemisphere deliver almost nothing. Lit by those alone the whole sheet
   * rendered black and the cleared route was invisible — the sculpted ground
   * looked exactly as dead as the flat plane it replaced.
   *
   * The reef beside it solves this with a PMREM RoomEnvironment probe applied
   * per material (SeaChamberLife.lightTheReef). The ground takes the same
   * treatment for the same reason, at a lower intensity: it is a diffuse
   * surface, not the wet coral the probe was tuned for, and it should read as
   * ambient bounce rather than as a second light source.
   */
  const { renderer } = useThrelte();
  const ENV_INTENSITY = 0.16;
  let envTexture: { dispose: () => void } | null = null;
  $effect(() => () => envTexture?.dispose());

  function lightTheFloor(): void {
    const pmrem = new PMREMGenerator(renderer.current);
    const texture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    material.envMap = texture;
    material.envMapIntensity = ENV_INTENSITY;
    material.needsUpdate = true;
    envTexture = texture;
  }

  let announced = false;

  $effect(() => {
    const scene = $gltf?.scene;
    if (!scene || announced) return;
    lightTheFloor();
    scene.traverse((child) => {
      const mesh = child as Mesh;
      if (!mesh.isMesh) return;
      mesh.material = material;
      mesh.receiveShadow = true;
    });
    announced = true;
    onReady?.();
  });
</script>

{#if $gltf?.scene}
  <T is={$gltf.scene} />
{/if}
