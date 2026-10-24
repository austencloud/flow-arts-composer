interface Point { x: number; y: number; z: number }
interface GripDiagnostics {
  gripRelaxation?: number;
  leftPalm: Point | null;
  rightPalm: Point | null;
  renderedBlueGrip: Point | null;
  renderedRedGrip: Point | null;
}

export function captureGripAttachment(diagnostics: GripDiagnostics) {
  if (typeof diagnostics.gripRelaxation !== "number")
    throw new Error("Native capture has no grip relaxation measurement");
  const point = (value: Point | null): [number, number, number] | null =>
    value && [value.x, value.y, value.z].every(Number.isFinite)
      ? [value.x, value.y, value.z] : null;
  return {
    gripRelaxation: diagnostics.gripRelaxation,
    leftPalmWorld: point(diagnostics.leftPalm),
    rightPalmWorld: point(diagnostics.rightPalm),
    leftRenderedGripWorld: point(diagnostics.renderedBlueGrip),
    rightRenderedGripWorld: point(diagnostics.renderedRedGrip),
  };
}

export function assertCaptureGripAttachment(
  attachment: ReturnType<typeof captureGripAttachment> | undefined,
  fresh: boolean,
  visibility: readonly [boolean, boolean] = [true, true],
  sample?: { frame: number; score: number },
): void {
  if (!fresh || !attachment) throw new Error("Native capture has no fresh post-IK grip measurement");
  for (const [index, side] of (["left", "right"] as const).entries()) {
    if (!visibility[index]) continue;
    const palm = attachment[`${side}PalmWorld`];
    const grip = attachment[`${side}RenderedGripWorld`];
    if (!palm || !grip) throw new Error(`Native capture has no measured ${side} palm/prop grip`);
    const errorM = Math.hypot(...palm.map((coordinate, index) => coordinate - grip[index]!));
    if (errorM > 0.002)
      throw new Error(`Native capture ${side} palm is detached from rendered prop grip (${(errorM * 100).toFixed(3)} cm)` +
        (sample ? ` at frame ${sample.frame}, score ${sample.score.toFixed(6)}` : "") +
        `; palm=[${palm.map((n) => n.toFixed(5)).join(",")}], grip=[${grip.map((n) => n.toFixed(5)).join(",")}], pair relaxation=${attachment.gripRelaxation.toFixed(5)}`);
  }
}
