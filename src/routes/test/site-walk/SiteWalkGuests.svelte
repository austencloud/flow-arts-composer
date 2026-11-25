<script lang="ts">
  /**
   * The standing guests: the jam's own `JamCrowd`, fed plain placements.
   *
   * `JamCrowd` poses a few shared skeletons for many people and takes a
   * position and a facing per person, so it needs nothing from the jam's
   * layout. Figures are made on first need and then only moved or hidden, so
   * switching between 40, 80 and 150 does not reload anyone.
   *
   * Their shadows come from coarse copies of the same standing pose, one
   * instanced mesh per pose, so eighty long shadows cost the sun a fraction of
   * the eighty bodies.
   */
  import { onDestroy } from "svelte";
  import { T, useTask } from "@threlte/core";
  import { getAvatarModelPath } from "@austencloud/scene-3d";
  import { JamCrowd } from "../flow-fest-jam/flow-fest-jam-crowd";
  import { Group, InstancedMesh, Matrix4, MeshBasicMaterial, Euler, Quaternion, Vector3 } from "three";
  import { JAM_HUMAN_AVATARS } from "../flow-fest-jam/flow-fest-jam-people";
  import { coarseShape } from "./look/site-walk-coarse-shape";
  import type { GuestFigure } from "./site-walk-plan";

  interface Props {
    figures: readonly GuestFigure[];
    /** Toward the light that casts their shadows. */
    sun: Vector3;
  }
  const props: Props = $props();

  const crowd = new JamCrowd();
  let disposed = false;
  let version = 0;
  let madeUpTo = 0;
  let kindsReady: Promise<unknown> | null = null;

  const kindFor = (i: number) => `standing:${JAM_HUMAN_AVATARS[(i * 5) % JAM_HUMAN_AVATARS.length]!}`;

  function loadKinds(): Promise<unknown> {
    kindsReady ??= Promise.allSettled(
      JAM_HUMAN_AVATARS.map((id) => crowd.addKind(`standing:${id}`, getAvatarModelPath(id), "standing", undefined, DRIVERS)),
    );
    return kindsReady;
  }

  // ------------------------------------------------------------ their shadows

  const DRIVERS = 2;
  const SHADOW_CELL = window.matchMedia("(pointer: coarse)").matches ? 0.035 : 0.02;
  const shadows = new Group();
  shadows.name = "SiteWalk_GuestShadows";
  // Seen by the sun only.
  const shadowMaterial = new MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const shadowMeshes = new Map<string, InstancedMesh>();
  const placed: { pose: string; matrix: Matrix4 }[] = [];

  async function shadowFor(key: string, driver: number): Promise<InstancedMesh> {
    const pose = `${key}#${driver}`;
    let mesh = shadowMeshes.get(pose);
    if (!mesh) {
      mesh = new InstancedMesh(coarseShape(await crowd.posed(key, driver), SHADOW_CELL), shadowMaterial, SHADOW_CAPACITY);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      mesh.count = 0;
      shadowMeshes.set(pose, mesh);
      shadows.add(mesh);
    }
    return mesh;
  }
  const SHADOW_CAPACITY = 24;

  // A coarse body never quite matches the fine one, and would speckle its sunlit side. Standing it a
  // hand's width further from the light keeps the shadow on the ground and off its own person.
  $effect(() => {
    shadows.position.copy(props.sun).multiplyScalar(-0.09);
  });

  async function apply(list: readonly GuestFigure[]): Promise<void> {
    const mine = ++version;
    if (list.length > 0) await loadKinds();
    for (let i = 0; i < list.length; i++) {
      if (disposed || mine !== version) return;
      const figure = list[i]!;
      const id = `guest-${i}`;
      const key = kindFor(i);
      try {
        const measure = await crowd.measure(key);
        const scale = 0.96 + (((i * 37) % 9) / 9) * 0.08;
        // Nobody stands square: a few degrees off the stage, a slight lean, each different.
        const wobble = Math.sin(i * 12.9898) * 43758.5453;
        const jitter = (wobble - Math.floor(wobble)) * 2 - 1;
        const at = {
          x: figure.x,
          // On the floor where it stands: a platform's top, or the lawn.
          y: (figure.y ?? 0) - measure.minY * scale,
          z: figure.z,
          rotationY: figure.yaw + jitter * 0.14,
          lean: jitter * 0.035,
          scale,
          tint: ((i * 53) % 100) / 100,
        };
        if (crowd.has(id)) crowd.move(id, at);
        else await crowd.place(id, key, at, i % DRIVERS);
        crowd.setVisible(id, true);
        placed[i] = {
          pose: `${key}#${i % DRIVERS}`,
          matrix: new Matrix4().compose(
            new Vector3(at.x, at.y, at.z),
            new Quaternion().setFromEuler(new Euler(0, at.rotationY, at.lean)),
            new Vector3(scale, scale, scale),
          ),
        };
        await shadowFor(key, i % DRIVERS);
      } catch (error) {
        console.warn("[site walk] a guest could not be placed", error);
      }
      madeUpTo = Math.max(madeUpTo, i + 1);
    }
    if (disposed || mine !== version) return;
    for (let i = list.length; i < madeUpTo; i++) crowd.setVisible(`guest-${i}`, false);
    for (const mesh of shadowMeshes.values()) mesh.count = 0;
    for (const { pose, matrix } of placed.slice(0, list.length).filter(Boolean)) {
      const mesh = shadowMeshes.get(pose);
      if (!mesh || mesh.count >= SHADOW_CAPACITY) continue;
      mesh.setMatrixAt(mesh.count++, matrix);
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  $effect(() => {
    void apply(props.figures);
  });

  useTask((delta) => {
    crowd.update(delta);
  });

  onDestroy(() => {
    disposed = true;
    crowd.dispose();
    for (const mesh of shadowMeshes.values()) {
      mesh.geometry.dispose();
      mesh.dispose();
    }
    shadowMaterial.dispose();
  });
</script>

<T is={crowd.group} />
<T is={shadows} />
