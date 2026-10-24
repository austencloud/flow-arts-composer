<script lang="ts">
  /**
   * Exposes the live scene on `window.__ocean` so placements can be MEASURED
   * rather than eyeballed.
   *
   * Judging a composed reef from screenshots alone means arguing about whether
   * a thing looks the right size. It doesn't scale, and it gets the answer
   * wrong: an arch that should be 8 m across was rendering at ~2 m, and no
   * amount of staring at frames separates "wrong scale" from "seen edge-on"
   * from "buried". `__ocean.measure()` returns every placed object's world
   * bounding box, so mis-scaled and sunk placements fall out as numbers.
   *
   * Harness-only, and only in dev. It attaches nothing to the scene graph and
   * renders nothing.
   */
  import { useRenderer, useScene, useThrelte } from "@threlte/core";
  import {
    Box3,
    Matrix4,
    Vector3,
    type Mesh,
    type Object3D,
    type ToneMapping,
    type WebGLRenderer,
  } from "three";

  const { camera } = useThrelte();
  const { scene } = useScene();
  const { renderer } = useRenderer<WebGLRenderer>();

  $effect(() => {
    if (!import.meta.env.DEV) return;

    const box = new Box3();
    const size = new Vector3();
    const centre = new Vector3();

    const scratch = new Matrix4();
    const local = new Box3();

    const row = (name: string, index: number | null) => {
      box.getSize(size);
      box.getCenter(centre);
      return {
        name:
          index === null
            ? name || "(unnamed)"
            : `${name || "(unnamed)"}#${index}`,
        size: [+size.x.toFixed(2), +size.y.toFixed(2), +size.z.toFixed(2)],
        centre: [
          +centre.x.toFixed(2),
          +centre.y.toFixed(2),
          +centre.z.toFixed(2),
        ],
        bottom: +box.min.y.toFixed(2),
      };
    };

    /**
     * The composed GLB is GPU-instanced, so an InstancedMesh's own bounding box
     * is the union of every copy -- a 40 m box for a scatter of 30 cm corals,
     * which is useless for judging any single placement. Instances are expanded
     * to one row each, transformed by matrixWorld * instanceMatrix.
     */
    const measure = (minExtent = 0) => {
      const rows: ReturnType<typeof row>[] = [];
      scene.updateMatrixWorld(true);
      scene.traverse((o: Object3D) => {
        const mesh = o as Mesh & {
          isMesh?: boolean;
          isInstancedMesh?: boolean;
          count?: number;
          getMatrixAt?: (i: number, m: Matrix4) => void;
        };
        if (!mesh.isMesh) return;
        const geometry = mesh.geometry;
        if (!geometry) return;
        if (!geometry.boundingBox) geometry.computeBoundingBox();
        const bounds = geometry.boundingBox;
        if (!bounds) return;

        const push = (matrix: Matrix4, index: number | null) => {
          local.copy(bounds).applyMatrix4(matrix);
          box.copy(local);
          box.getSize(size);
          if (Math.max(size.x, size.y, size.z) < minExtent) return;
          rows.push(row(o.name, index));
        };

        if (mesh.isInstancedMesh && mesh.getMatrixAt && mesh.count) {
          for (let i = 0; i < mesh.count; i++) {
            mesh.getMatrixAt(i, scratch);
            push(scratch.premultiply(o.matrixWorld), i);
          }
        } else {
          push(o.matrixWorld, null);
        }
      });
      return rows;
    };

    const near = (x: number, z: number, radius = 3) =>
      (measure() as { centre: number[] }[]).filter(
        (r) => Math.hypot(r.centre[0]! - x, r.centre[2]! - z) <= radius
      );

    const w = window as unknown as Record<string, unknown>;
    w.__ocean = {
      scene,
      get camera() {
        return camera.current;
      },
      measure,
      near,
      renderer,
      /**
       * Swap the tone curve live. "Washed out" and "too dark" are the same
       * complaint when the grade is the cause, and the only way to tell a grade
       * problem from a lighting problem is to change one and look. Recompiles
       * every material, because tone mapping is baked into the shader.
       */
      grade: (toneMapping: ToneMapping, exposure = 1) => {
        renderer.toneMapping = toneMapping;
        renderer.toneMappingExposure = exposure;
        scene.traverse((o: Object3D) => {
          const m = (o as Mesh).material;
          if (!m) return;
          for (const mat of Array.isArray(m) ? m : [m]) mat.needsUpdate = true;
        });
      },
      /** Objects whose largest dimension is under `metres` -- invisible specks. */
      specks: (metres = 0.3) =>
        (measure() as { size: number[] }[]).filter(
          (r) => Math.max(...r.size) < metres
        ),
    };
    return () => {
      delete w.__ocean;
    };
  });
</script>
