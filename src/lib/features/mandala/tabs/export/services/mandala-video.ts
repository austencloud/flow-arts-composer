/**
 * Mandala Video (Playground) — build the export spec + run the shared exporter.
 *
 * Thin glue between the Playground detail drawer and the shared
 * `exportMandalaVideo` worker driver. Keeps `MandalaModule.svelte` lean: the
 * component owns UI state, this owns the spec math and delivery.
 */

import type { MandalaFrameSpec } from "$lib/shared/mandala/services/mandala-frame-renderer";
import type { StepLike } from "$lib/shared/mandala/services/types";
import {
  BLUE_STROKE,
  RED_STROKE,
} from "$lib/shared/mandala/domain/mandala-constants";
import {
  exportMandalaVideo,
  mandalaBitrateFor,
  type MandalaVideoExportHandle,
  type MandalaVideoExportCallbacks,
} from "$lib/shared/mandala/services/mandala-video-exporter";
import { shareOrDownloadBlob } from "$lib/shared/foundation/services/file-downloader";
import type {
  MandalaPathShape,
  MandalaRenderOptions,
} from "$lib/shared/mandala/domain/mandala-types";

// Fixed seamless-loop defaults for the Playground (v1: no options UI).
//   period 5s × reps 4 = 20s, 4 breathing cycles;
//   (period*reps / ROTATION_REF_PERIOD[5]) * rotation[90] / 360 = 1.0 → exactly
//   one full 360° turn. deriveLoopMath snaps rotation to whole turns, so the
//   clip is seamless by construction.
const VIDEO_DEFAULTS = {
  period: 5,
  reps: 4,
  rotation: 90,
  rangeMax: 250, // matches the module's ANIMATE_MAX / the live detail breathing
  resolution: 1080 as const,
  fps: 60 as const,
  pathShape: "arc" as const,
  lineWeight: 2.5,
  bgColor: "#000000",
};

export interface MandalaVideoSource {
  name: string;
  steps: StepLike[];
  leftPropType?: string;
  rightPropType?: string;
  variant?: MandalaRenderOptions["show"];
  pathShape?: MandalaPathShape;
}

export function buildMandalaVideoSpec(
  source: MandalaVideoSource
): MandalaFrameSpec {
  // steps may be Svelte reactive proxies / domain class instances. JSON
  // round-trip yields the plain, structured-cloneable data the worker needs.
  const plainSteps = JSON.parse(JSON.stringify(source.steps));
  return {
    steps: plainSteps,
    leftPropType: source.leftPropType,
    rightPropType: source.rightPropType,
    show: source.variant ?? "both",
    pathShape: source.pathShape ?? VIDEO_DEFAULTS.pathShape,
    lineWeight: VIDEO_DEFAULTS.lineWeight,
    bgColor: VIDEO_DEFAULTS.bgColor,
    resolution: VIDEO_DEFAULTS.resolution,
    period: VIDEO_DEFAULTS.period,
    reps: VIDEO_DEFAULTS.reps,
    fps: VIDEO_DEFAULTS.fps,
    rangeMax: VIDEO_DEFAULTS.rangeMax,
    rotation: VIDEO_DEFAULTS.rotation,
    // Solid default palette — matches the still PNG and the live detail preview
    // (which render the default blue/red, not a flow gradient).
    morphColors: null,
    solidPair: [BLUE_STROKE, RED_STROKE],
  };
}

/**
 * Start the mandala video export, returning the worker handle. The caller
 * awaits `handle.done` for the blob (delivered via `shareOrDownloadBlob`) and
 * may `handle.cancel()` on teardown. Progress/phase flow through `callbacks`.
 */
export function runMandalaVideoExport(
  source: MandalaVideoSource,
  callbacks?: MandalaVideoExportCallbacks
): MandalaVideoExportHandle {
  const spec = buildMandalaVideoSpec(source);
  const bitrate = mandalaBitrateFor(spec.resolution);
  const handle = exportMandalaVideo(spec, bitrate, callbacks);
  const safeName = source.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  void handle.done
    .then((blob) =>
      shareOrDownloadBlob(blob, `mandala-${safeName}.mp4`, {
        title: "Flow Arts Composer Mandala",
      })
    )
    .catch(() => {
      // Errors surface through callbacks / the caller's own handle.done handler.
    });
  return handle;
}
