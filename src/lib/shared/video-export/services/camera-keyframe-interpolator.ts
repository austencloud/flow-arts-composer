import type { CameraKeyframe } from "#lib/shared/video-export/domain/camera-keyframe.js";
import type { InterpolatedCamera } from "./types";

function lerpVec3(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function slerp(
  a: [number, number, number, number],
  b: [number, number, number, number],
  t: number
): [number, number, number, number] {
  let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];

  let bx = b[0], by = b[1], bz = b[2], bw = b[3];
  if (dot < 0) {
    dot = -dot;
    bx = -bx; by = -by; bz = -bz; bw = -bw;
  }

  if (dot > 0.9995) {
    const result: [number, number, number, number] = [
      a[0] + (bx - a[0]) * t,
      a[1] + (by - a[1]) * t,
      a[2] + (bz - a[2]) * t,
      a[3] + (bw - a[3]) * t,
    ];
    const len = Math.sqrt(result[0] ** 2 + result[1] ** 2 + result[2] ** 2 + result[3] ** 2);
    result[0] /= len; result[1] /= len; result[2] /= len; result[3] /= len;
    return result;
  }

  const theta = Math.acos(dot);
  const sinTheta = Math.sin(theta);
  const wa = Math.sin((1 - t) * theta) / sinTheta;
  const wb = Math.sin(t * theta) / sinTheta;

  return [
    a[0] * wa + bx * wb,
    a[1] * wa + by * wb,
    a[2] * wa + bz * wb,
    a[3] * wa + bw * wb,
  ];
}

export function interpolateKeyframes(
  keyframes: readonly CameraKeyframe[],
  t: number
): InterpolatedCamera {
  if (keyframes.length === 0) {
    return { position: [0, 0, 0], quaternion: [0, 0, 0, 1], fov: 50 };
  }

  if (keyframes.length === 1) {
    const k = keyframes[0]!;
    return { position: [...k.position], quaternion: [...k.quaternion], fov: k.fov };
  }

  const first = keyframes[0]!;
  if (t <= first.timestamp) {
    return { position: [...first.position], quaternion: [...first.quaternion], fov: first.fov };
  }

  const last = keyframes[keyframes.length - 1]!;
  if (t >= last.timestamp) {
    return { position: [...last.position], quaternion: [...last.quaternion], fov: last.fov };
  }

  let lo = 0;
  let hi = keyframes.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (keyframes[mid]!.timestamp <= t) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const a = keyframes[lo]!;
  const b = keyframes[hi]!;
  const segDur = b.timestamp - a.timestamp;
  const alpha = segDur > 0 ? (t - a.timestamp) / segDur : 0;

  return {
    position: lerpVec3(a.position, b.position, alpha),
    quaternion: slerp(a.quaternion, b.quaternion, alpha),
    fov: a.fov + (b.fov - a.fov) * alpha,
  };
}
