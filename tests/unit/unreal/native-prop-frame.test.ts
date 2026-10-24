import { describe, expect, it } from 'vitest';
import { Euler, Matrix4, Quaternion, Vector3 } from 'three';
import { nativePropFrame } from '../../../unreal/Shared/Tools/native-prop-frame.mjs';

const reflection = new Matrix4().makeScale(-1, 1, 1);
const avatarBasis = new Matrix4().makeBasis(
  new Vector3(0, -1, 0), new Vector3(0, 0, 1), new Vector3(1, 0, 0));
function sample(matrix: Matrix4) {
  const p = new Vector3(), q = new Quaternion(), s = new Vector3();
  matrix.decompose(p, q, s);
  return { position: p.toArray(), quaternion: q.toArray(), scale: s.toArray() };
}

describe('native handed prop transforms', () => {
  it.each([false, true])('reconstructs rendered points with reflected=%s and noncommuting rotations', reflected => {
    const performer = new Matrix4().compose(new Vector3(2, 3, 4),
      new Quaternion().setFromEuler(new Euler(.3, -.2, .5)), new Vector3(1, 1, 1));
    const root = new Matrix4().compose(new Vector3(.2, .5, -.4),
      new Quaternion().setFromEuler(new Euler(.6, -.4, .9)), new Vector3(reflected ? -1 : 1, 1, 1));
    const visual = new Matrix4().makeRotationFromEuler(new Euler(-.7, .2, .4));
    const rootWorld = performer.clone().multiply(root);
    const prop = { propRootWorld: sample(rootWorld), rotatedBodyWorld: sample(rootWorld.clone().multiply(visual)) };
    const frame = { performerWorld: sample(performer), leftProp: prop, rightProp: prop,
      leftHandWorld: [2, 3, 4], rightHandWorld: [2, 3, 4] };
    const values = nativePropFrame(frame);
    const nativeRoot = new Matrix4().compose(new Vector3(...values.slice(0, 3)),
      new Quaternion(...values.slice(3, 7)), new Vector3(1, 1, 1));
    const nativeVisual = new Matrix4().makeRotationFromQuaternion(new Quaternion(...values.slice(20, 24)));
    // Native mesh coordinates include the basis reflection; handed variants
    // additionally bake their selected X reflection into the imported mesh.
    const meshPoint = new Vector3(.17, -.31, .23);
    const bakedPoint = meshPoint.clone().applyMatrix4(reflection);
    if (reflected) bakedPoint.applyMatrix4(reflection);
    const actual = bakedPoint.multiplyScalar(100).applyMatrix4(nativeVisual).applyMatrix4(nativeRoot);
    const expected = meshPoint.clone().applyMatrix4(visual).applyMatrix4(root)
      .applyMatrix4(avatarBasis).multiplyScalar(100);
    expect(actual.distanceTo(expected)).toBeLessThan(.002);
    expect(values.slice(14, 20)).toEqual([0, 0, 0, 0, 0, 0]);
  });
});
