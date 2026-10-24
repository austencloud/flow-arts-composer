const DOLLY_LOG_STEP = -Math.log(0.95);

/** camera-controls measures both drag axes against the viewport height. */
export function nativeDragDelta(
  movementX: number,
  movementY: number,
  viewportHeight: number
) {
  const height = Math.max(1, viewportHeight);
  return { deltaX: movementX / height, deltaY: movementY / height };
}

/** Match camera-controls' wheel scale before Unreal applies exp(delta). */
export function nativeWheelZoomDelta(
  deltaY: number,
  deltaMode: number,
  isMac: boolean,
  ctrlKey = false
) {
  const divisor = (isMac ? 1 : 3) * (deltaMode === 1 && !ctrlKey ? 1 : 10);
  return (DOLLY_LOG_STEP * deltaY) / divisor;
}

/** Ctrl+wheel/trackpad pinch changes perspective zoom in camera-controls. */
export function nativeProjectionFov(verticalFov: number, wheelDelta: number) {
  const tangent = Math.tan((verticalFov * Math.PI) / 360);
  return (Math.atan(tangent * Math.exp(wheelDelta)) * 360) / Math.PI;
}

/** camera-controls measures from the two-finger midpoint to either finger. */
export function nativePinchZoomDelta(previousDistance: number, distance: number) {
  return (DOLLY_LOG_STEP * (previousDistance - distance)) / 16;
}

export function nativeDollyDragDelta(movementY: number) {
  return (-DOLLY_LOG_STEP * movementY) / 8;
}
