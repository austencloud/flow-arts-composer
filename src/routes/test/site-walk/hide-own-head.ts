/**
 * A body seen from inside its own head. For a camera that close, the head,
 * hair and lashes are not drawn, so the eye looks down on its own shoulders,
 * chest and feet, while the sun still casts the whole body's shadow, head and
 * all. Only the drawn surface changes: the shadow pass draws the body as it is.
 *
 * Every vertex the head moves is pulled to the head's own joint at the top of
 * the neck, behind and below the eyes, which folds the head away into a
 * stub the eyes look past.
 */
import {
  Matrix4,
  Vector3,
  type Material,
  type Object3D,
  type SkinnedMesh,
} from "three";

/** How many head bones one mesh can hide (head, crown, eyes, jaw...). */
const MOST = 8;
/** A camera this close to the head is inside it (m). Behind the body it is 1.5 m or more away. */
const INSIDE = 0.6;

const headAt = new Vector3();
const cameraAt = new Vector3();
const toLocal = new Matrix4();

const DECLARE = /* glsl */ `
uniform float uHideHead;
uniform float uHeadBones[ ${MOST} ];
uniform vec3 uFold;
`;

const FOLD = /* glsl */ `
#ifdef USE_SKINNING
  if ( uHideHead > 0.5 ) {
    float share = 0.0;
    for ( int b = 0; b < ${MOST}; b ++ ) {
      share += dot( vec4( lessThan( abs( skinIndex - uHeadBones[ b ] ), vec4( 0.5 ) ) ), skinWeight );
    }
    if ( share > 0.02 ) transformed = uFold;
  }
#endif
`;

function under(part: Object3D, head: Object3D): boolean {
  for (let at: Object3D | null = part; at; at = at.parent)
    if (at === head) return true;
  return false;
}

/** Hide the head of every skinned mesh under `root` from a camera inside it. Returns the undo. */
export function hideOwnHead(root: Object3D): () => void {
  const undo: Array<() => void> = [];
  root.traverse((part) => {
    const mesh = part as SkinnedMesh;
    if (!mesh.isSkinnedMesh) return;
    const bones = mesh.skeleton.bones;
    const head = bones.find((bone) => /Head$/.test(bone.name));
    if (!head) return;
    const ids = bones
      .flatMap((bone, i) => (under(bone, head) ? [i] : []))
      .slice(0, MOST);
    const uniforms = {
      uHideHead: { value: 0 },
      uHeadBones: {
        value: Array.from({ length: MOST }, (_, k) => ids[k] ?? -1),
      },
      uFold: { value: new Vector3() },
    };
    const own = mesh.material;
    const made: Material[] = [];
    const fold = (material: Material): Material => {
      const copy = material.clone();
      copy.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", `#include <common>\n${DECLARE}`)
          .replace(
            "#include <skinning_vertex>",
            `#include <skinning_vertex>\n${FOLD}`
          );
      };
      copy.customProgramCacheKey = () => "hide-own-head";
      made.push(copy);
      return copy;
    };
    mesh.material = Array.isArray(own) ? own.map(fold) : fold(own);
    const before = mesh.onBeforeRender;
    mesh.onBeforeRender = function (
      renderer,
      scene,
      camera,
      geometry,
      material,
      group
    ) {
      headAt.setFromMatrixPosition(head.matrixWorld);
      cameraAt.setFromMatrixPosition(camera.matrixWorld);
      const inside = cameraAt.distanceTo(headAt) < INSIDE;
      uniforms.uHideHead.value = inside ? 1 : 0;
      if (inside)
        uniforms.uFold.value
          .copy(headAt)
          .applyMatrix4(toLocal.copy(mesh.matrixWorld).invert());
      before.call(this, renderer, scene, camera, geometry, material, group);
    };
    undo.push(() => {
      mesh.material = own;
      mesh.onBeforeRender = before;
      for (const material of made) material.dispose();
    });
  });
  return () => {
    for (const step of undo) step();
  };
}
