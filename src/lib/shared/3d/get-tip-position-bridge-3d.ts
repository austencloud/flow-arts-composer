import { TipPositionBridge3D } from '#lib/shared/3d/effects/tip-position-bridge-3d.js';

let instance: TipPositionBridge3D | null = null;

export function getTipPositionBridge3D(): TipPositionBridge3D {
  return instance ??= new TipPositionBridge3D();
}
