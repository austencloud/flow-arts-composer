import { Matrix4, Quaternion, Vector3 } from 'three';

const avatarBasis = new Matrix4().makeBasis(
  new Vector3(0, -1, 0), new Vector3(0, 0, 1), new Vector3(1, 0, 0));
const avatarBasisInverse = avatarBasis.clone().invert();
const propBasis = new Matrix4().makeBasis(
  new Vector3(0, 1, 0), new Vector3(0, 0, 1), new Vector3(1, 0, 0));
const mirrorX = new Matrix4().makeScale(-1, 1, 1);
const position = new Vector3();
const rotation = new Quaternion();
const scale = new Vector3();
const round = n => Math.round(n * 1e5) / 1e5;

function assertNumbers(values, width, label) {
  if (!Array.isArray(values) || values.length !== width || values.some(n => !Number.isFinite(n)))
    throw new Error(`Invalid ${label}`);
}

function transform(sample, label) {
  if (!sample) throw new Error(`Missing ${label}`);
  assertNumbers(sample.position, 3, `${label} position`);
  assertNumbers(sample.quaternion, 4, `${label} rotation`);
  assertNumbers(sample.scale, 3, `${label} scale`);
  return new Matrix4().compose(
    new Vector3(...sample.position), new Quaternion(...sample.quaternion),
    new Vector3(...sample.scale));
}

function propPose(performerInverse, propRootWorld) {
  performerInverse.clone().multiply(transform(propRootWorld, 'prop root')).decompose(position, rotation, scale);
  if (Math.max(Math.abs(Math.abs(scale.x) - 1), Math.abs(scale.y - 1), Math.abs(scale.z - 1)) > 1e-4)
    throw new Error('Animated prop root has unsupported scale');
  const native = avatarBasis.clone().multiply(new Matrix4().makeRotationFromQuaternion(rotation))
    .multiply(avatarBasisInverse).multiply(propBasis);
  const q = new Quaternion().setFromRotationMatrix(native).normalize();
  return [round(position.z * 100), round(-position.x * 100), round(position.y * 100),
    round(q.x), round(q.y), round(q.z), round(q.w)];
}

function visualRotation(prop, performerInverse) {
  const root = transform(prop?.propRootWorld, 'prop root');
  const reflected = performerInverse.clone().multiply(root).determinant() < 0;
  const local = root.clone().invert()
    .multiply(transform(prop?.rotatedBodyWorld, 'rotated prop body'));
  local.decompose(position, rotation, scale);
  if (position.length() > 1e-4 ||
    Math.max(Math.abs(scale.x - 1), Math.abs(scale.y - 1), Math.abs(scale.z - 1)) > 1e-4)
    throw new Error('Animated prop visual has unsupported pivot or scale');
  const sourceRotation = new Matrix4().makeRotationFromQuaternion(rotation);
  // PerformerRig reflects the root before the animated visual rotation. The
  // native handed mesh already bakes that X reflection (convert-props.py), so
  // carry its conjugation into the rotation rather than reflecting it twice.
  if (reflected) sourceRotation.premultiply(mirrorX).multiply(mirrorX);
  const native = mirrorX.clone().multiply(sourceRotation).multiply(mirrorX);
  const q = new Quaternion().setFromRotationMatrix(native).normalize();
  return [q.x, q.y, q.z, q.w].map(round);
}

function grip(frame, side) {
  const world = frame[`${side}HandWorld`];
  assertNumbers(world, 3, `${side} hand`);
  const local = new Vector3(...world).applyMatrix4(transform(frame.performerWorld, 'performer').invert());
  return local.applyMatrix4(avatarBasis).multiplyScalar(100).toArray().map(round);
}

/** The compact native prop pose used by catalog clips and portable scores. */
export function nativePropFrame(frame) {
  const inverse = transform(frame.performerWorld, 'performer').invert();
  return [
    ...propPose(inverse, frame.leftProp?.propRootWorld),
    ...propPose(inverse, frame.rightProp?.propRootWorld),
    ...grip(frame, 'left'), ...grip(frame, 'right'),
    ...visualRotation(frame.leftProp, inverse), ...visualRotation(frame.rightProp, inverse),
  ];
}
