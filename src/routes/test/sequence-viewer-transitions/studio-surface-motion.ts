export interface SurfaceBox {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Sample {
  selectedMode: string;
  workspace?: { sharedSurfaces?: Record<string, SurfaceBox> };
}

/** Each direction is measured separately: a deliberate round trip isn't a wobble. */
export function summarizeStudioSurfaceMotion(samples: Sample[]) {
  const result: Record<
    string,
    {
      backtrackPx: number;
      sizeBacktrackPx: number;
      maxStepPx: number;
      frames: number;
    }
  > = {};
  for (let start = 1; start < samples.length; start++) {
    const from = samples[start - 1]!.selectedMode;
    const to = samples[start]!.selectedMode;
    if (from === to || ![from, to].includes("post-studio")) continue;
    let end = start + 1;
    while (end < samples.length && samples[end]!.selectedMode === to) end++;
    const segment = samples.slice(start - 1, end);
    for (const name of Object.keys(
      segment.at(-1)?.workspace?.sharedSurfaces ?? {}
    )) {
      const boxes = segment.map((s) => s.workspace?.sharedSurfaces?.[name]);
      // Hidden panes have no trajectory. Do not turn their appearance into a
      // huge move from (0,0), or bridge across unmeasured/collapsed frames.
      if (boxes.some((b) => !b || b.width <= 0 || b.height <= 0)) continue;
      const measured = boxes as SurfaceBox[];
      let travelX = 0,
        travelY = 0,
        sizeTravel = 0,
        maxStepPx = 0;
      for (let i = 1; i < measured.length; i++) {
        const previousBox = measured[i - 1]!;
        const box = measured[i]!;
        const dx = box.left - previousBox.left;
        const dy = box.top - previousBox.top;
        travelX += Math.abs(dx);
        travelY += Math.abs(dy);
        sizeTravel +=
          Math.abs(box.width - previousBox.width) +
          Math.abs(box.height - previousBox.height);
        maxStepPx = Math.max(maxStepPx, Math.hypot(dx, dy));
      }
      const first = measured[0]!,
        last = measured.at(-1)!;
      const backtrackPx = Math.max(
        0,
        (travelX -
          Math.abs(last.left - first.left) +
          travelY -
          Math.abs(last.top - first.top)) /
          2
      );
      const previous = result[name];
      const sizeBacktrackPx = Math.max(
        0,
        (sizeTravel -
          Math.abs(last.width - first.width) -
          Math.abs(last.height - first.height)) /
          2
      );
      result[name] = {
        sizeBacktrackPx:
          Math.round(
            Math.max(sizeBacktrackPx, previous?.sizeBacktrackPx ?? 0) * 10
          ) / 10,
        backtrackPx:
          Math.round(Math.max(backtrackPx, previous?.backtrackPx ?? 0) * 10) /
          10,
        maxStepPx:
          Math.round(Math.max(maxStepPx, previous?.maxStepPx ?? 0) * 10) / 10,
        frames: (previous?.frames ?? 0) + measured.length,
      };
    }
    start = end - 1;
  }
  return result;
}
