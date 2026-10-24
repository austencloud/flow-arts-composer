import { Matrix4, type Object3D } from "three";

export interface CapturedPropTransform {
  readonly bodyWorld: Matrix4;
  readonly visible: boolean;
}

const active = new WeakMap<Object3D, readonly CapturedPropTransform[]>();

/** Present only between captured-pose apply and restore. */
export function setCapturedPropTransforms(
  performer: Object3D,
  transforms: readonly CapturedPropTransform[]
): void {
  active.set(performer, transforms);
}

export function clearCapturedPropTransforms(
  performer: Object3D,
  transforms: readonly CapturedPropTransform[]
): void {
  if (active.get(performer) === transforms) active.delete(performer);
}

/** Preserve the complete reflected/scaled body matrix in the effects frame. */
export function resolveCapturedPropTransforms(parent: Object3D | undefined) {
  if (!parent) return undefined;
  for (
    let ancestor: Object3D | null = parent;
    ancestor;
    ancestor = ancestor.parent
  ) {
    const transforms = active.get(ancestor);
    if (!transforms) continue;
    parent.updateWorldMatrix(true, false);
    const inverse = parent.matrixWorld.clone().invert();
    return transforms.map(({ bodyWorld, visible }) => ({
      bodyToEffects: inverse.clone().multiply(bodyWorld),
      visible,
    }));
  }
  return undefined;
}
