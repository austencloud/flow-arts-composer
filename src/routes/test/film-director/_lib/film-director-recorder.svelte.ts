/**
 * Records a film to an MP4, one exact frame at a time.
 *
 * The live page runs about 32 frames a second with eight performers, so a
 * screen capture would drop and repeat frames. Instead the recorder takes the
 * film's clock: it seeks to `start + index / fps` for every output frame,
 * renders that one frame through the viewer's own pipeline, and hands it to the
 * app's encoder through `Offline3DExporter.exportDriven`, which owns pacing,
 * the H.264 worker and cancellation. Nothing here encodes.
 *
 * Three things the live page does with the wall clock are redone here on film
 * time, so the file shows what the film says rather than what a slow machine
 * managed:
 *
 * - Scene changes. The first frame of every scene waits, with the live render
 *   loop running, until the scene's world has settled, the director has
 *   released its hold, and every performer's character is in. Only then is
 *   the frame drawn. No frame shows a half-built cast.
 * - Dissolves. The live dissolve is a DOM overlay fading on a CSS timer. Here
 *   the last frame of the outgoing scene is blended over the incoming one by
 *   how far into the transition the frame's film time is.
 * - Fades through black. The live black is a DOM overlay too, so it is painted
 *   onto each frame at the opacity the film's sampler gives for that time.
 *
 * The film stays in its playing state throughout (effects and live poses only
 * draw while it plays). `setExternalClock` stops the rAF tick from moving the
 * playhead underneath the recorder.
 */

import { tick } from "svelte";

import { getOffline3DExporter } from "#lib/shared/3d/get-offline-3d-exporter.js";
import type { FilmDirectorState } from "./film-director-state.svelte";
import type { FilmDirectorInput } from "./film-director-schema";
import {
  FilmRecordingError,
  frameTimeSeconds,
  planFilmRecording,
  type FilmRecordingOptions,
  type FilmRecordingPlan,
} from "./film-recording-plan";

/** What the scene registers so the recorder can drive its viewer. */
export interface FilmRecordingHost {
  /** The WebGL canvas the viewer draws to, once it has one. */
  canvas(): HTMLCanvasElement | null;
  /**
   * The render loop's handles. Null when the viewer is not on the main-thread
   * renderer, which is the only one a recorder can step frame by frame.
   */
  drive(): FilmRecordingDrive | null;
  /** The scene whose world, cast and camera are currently applied. */
  appliedSceneId(): string;
  /** Every performer on stage has their character in, and so their props. */
  castReady(): boolean;
  /** Resolves once every directed sequence in the film has been generated. */
  sequencesReady(): Promise<void>;
}

export interface FilmRecordingDrive {
  runFrame: (timeMs: number) => void;
  pauseAutoLoop: () => void;
  resumeAutoLoop: () => void;
  renderer: {
    getPixelRatio(): number;
    setPixelRatio(ratio: number): void;
    setSize(width: number, height: number, updateStyle?: boolean): void;
  };
  camera: { aspect?: number } | null;
}

export type FilmRecorderPhase =
  | "idle"
  | "preparing"
  | "rendering"
  | "encoding"
  | "saving"
  | "saved"
  | "failed";

export interface FilmRecorderStatus {
  phase: FilmRecorderPhase;
  /** One plain line for a person, also what the status element shows. */
  message: string;
  name: string | null;
  fps: number | null;
  width: number | null;
  height: number | null;
  startSeconds: number | null;
  endSeconds: number | null;
  frame: number;
  totalFrames: number;
  /** Where the dev endpoint wrote the MP4, once saved. */
  path: string | null;
  bytes: number | null;
  error: string | null;
  /** Wall-clock milliseconds from start to saved or failed. */
  elapsedMs: number | null;
}

/**
 * How long a scene must stay settled, with the live loop running, before its
 * first frame is drawn. Long enough for a character's fade in after a swap
 * (the longest is about a third of a second) to finish, short enough that a
 * film of many cuts does not spend most of its recording time waiting.
 */
const SCENE_SETTLE_MS = 1000;
const SCENE_SETTLE_PAINTS = 20;
const SCENE_TIMEOUT_MS = 120_000;
const PREPARATION_TIMEOUT_MS = 10 * 60_000;
/** The same black the live editorial fade uses. */
const FADE_COLOR = "#020206";

const IDLE: FilmRecorderStatus = {
  phase: "idle",
  message: "",
  name: null,
  fps: null,
  width: null,
  height: null,
  startSeconds: null,
  endSeconds: null,
  frame: 0,
  totalFrames: 0,
  path: null,
  bytes: null,
  error: null,
  elapsedMs: null,
};

const nextPaint = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function seconds(value: number): string {
  return `${Math.round(value * 100) / 100} s`;
}

export function createFilmRecorder(director: FilmDirectorState) {
  let status = $state<FilmRecorderStatus>({ ...IDLE });
  let busy = false;

  function update(patch: Partial<FilmRecorderStatus>): void {
    status = { ...status, ...patch };
  }

  async function waitForPreparation(): Promise<void> {
    const started = performance.now();
    while (!director.preparation.complete) {
      if (performance.now() - started > PREPARATION_TIMEOUT_MS) {
        throw new FilmRecordingError(
          "The film never finished preparing, so nothing was recorded."
        );
      }
      await nextPaint();
    }
  }

  /**
   * Holds until the scene is really on screen: its world settled and the
   * director's transition hold released, its cast's characters loaded, and all
   * of that true for a second of live frames in a row. The live loop runs while
   * waiting because world and character loading progress inside it.
   */
  async function waitForScene(
    host: FilmRecordingHost,
    drive: FilmRecordingDrive,
    sceneId: string
  ): Promise<void> {
    drive.resumeAutoLoop();
    try {
      const started = performance.now();
      let settledSince: number | null = null;
      let settledPaints = 0;
      for (;;) {
        await nextPaint();
        const now = performance.now();
        const settled =
          host.appliedSceneId() === sceneId &&
          director.sceneReady &&
          !director.transitionHolding &&
          host.castReady();
        if (!settled) {
          settledSince = null;
          settledPaints = 0;
        } else {
          settledSince ??= now;
          settledPaints += 1;
          if (
            now - settledSince >= SCENE_SETTLE_MS &&
            settledPaints >= SCENE_SETTLE_PAINTS
          ) {
            return;
          }
        }
        if (now - started > SCENE_TIMEOUT_MS) {
          throw new FilmRecordingError(
            `Scene "${sceneId}" did not finish loading within ${SCENE_TIMEOUT_MS / 1000} seconds, so the recording stopped rather than show it half built.`
          );
        }
      }
    } finally {
      drive.pauseAutoLoop();
    }
  }

  async function renderToBlob(
    plan: FilmRecordingPlan,
    host: FilmRecordingHost,
    drive: FilmRecordingDrive
  ): Promise<Blob> {
    const { width, height, fps } = plan;
    const frameMs = 1000 / fps;
    const waits = new Set(plan.sceneWaits.map((wait) => wait.frameIndex));

    const output = document.createElement("canvas");
    output.width = width;
    output.height = height;
    const context = output.getContext("2d", { alpha: false });
    // The last frame of the scene before, for a dissolve into the next one.
    const outgoing = document.createElement("canvas");
    outgoing.width = width;
    outgoing.height = height;
    const outgoingContext = outgoing.getContext("2d", { alpha: false });
    if (!context || !outgoingContext) {
      throw new FilmRecordingError(
        "This browser has no 2D canvas to compose frames on."
      );
    }
    let outgoingSceneIndex: number | null = null;

    // The scheduler's clock. It only ever moves forward: after a live wait the
    // auto loop has stamped real time, so the next manual frame continues
    // from now rather than from a recorded time already in its past.
    let clockMs: number | null = null;

    return getOffline3DExporter().exportDriven(
      {
        width,
        height,
        fps,
        totalFrames: plan.frameCount,
        pauseAutoLoop: drive.pauseAutoLoop,
        resumeAutoLoop: drive.resumeAutoLoop,
        renderFrame: async ({ index }) => {
          const time = frameTimeSeconds(plan, index);
          director.seek(time);
          await tick();

          const sceneId = director.frame.scene.id;
          if (
            waits.has(index) ||
            host.appliedSceneId() !== sceneId ||
            director.transitionHolding
          ) {
            if (index > 0) {
              outgoingContext.drawImage(output, 0, 0);
              outgoingSceneIndex = director.frame.sceneIndex - 1;
            }
            await waitForScene(host, drive, sceneId);
            clockMs = null;
            director.seek(time);
            await tick();
          }

          const canvas = host.canvas();
          if (!canvas) {
            throw new FilmRecordingError(
              "The 3D canvas went away mid-recording."
            );
          }
          // The live renderer follows the window's pixel ratio and the quality
          // governor; the file must be exactly the size asked for.
          if (
            canvas.width !== width ||
            canvas.height !== height ||
            drive.renderer.getPixelRatio() !== 1
          ) {
            drive.renderer.setPixelRatio(1);
            drive.renderer.setSize(width, height, false);
          }

          clockMs = (clockMs ?? performance.now()) + frameMs;
          drive.runFrame(clockMs);

          // Copy straight after the render, in the same task: the WebGL canvas
          // does not keep its pixels once the browser composites.
          context.globalAlpha = 1;
          context.drawImage(canvas, 0, 0, width, height);

          const frame = director.frame;
          const transition = frame.scene.transition;
          if (
            transition.kind === "environment-dissolve" &&
            transition.durationSeconds > 0 &&
            frame.sceneTimeSeconds < transition.durationSeconds &&
            outgoingSceneIndex === frame.sceneIndex - 1
          ) {
            context.globalAlpha =
              1 - frame.sceneTimeSeconds / transition.durationSeconds;
            context.drawImage(outgoing, 0, 0);
          }
          if (frame.fadeOpacity > 0) {
            context.globalAlpha = Math.min(1, frame.fadeOpacity);
            context.fillStyle = FADE_COLOR;
            context.fillRect(0, 0, width, height);
          }
          context.globalAlpha = 1;
          return output;
        },
      },
      (progress) => {
        if (progress.stage === "capturing") {
          update({
            phase: "rendering",
            frame: (progress.currentFrame ?? 0) + 1,
            message: `Rendering frame ${(progress.currentFrame ?? 0) + 1} of ${plan.frameCount}`,
          });
        } else if (progress.stage === "encoding") {
          update({
            phase: "encoding",
            frame: plan.frameCount,
            message: `Encoding ${Math.round(progress.progress * 100)}%`,
          });
        }
      }
    );
  }

  async function checkEncoder(plan: FilmRecordingPlan): Promise<void> {
    if (typeof VideoEncoder === "undefined") {
      throw new FilmRecordingError(
        "This browser has no VideoEncoder, so it cannot write an MP4."
      );
    }
    const { selectCodec } = await import("@austencloud/video-editor/encoder");
    const support = await VideoEncoder.isConfigSupported({
      codec: selectCodec(plan.width, plan.height),
      width: plan.width,
      height: plan.height,
      framerate: plan.fps,
    }).catch(() => ({ supported: false }));
    if (!support.supported) {
      throw new FilmRecordingError(
        `The browser's H.264 encoder refuses ${plan.width} by ${plan.height} at ${plan.fps} frames a second.`
      );
    }
  }

  /**
   * Record the film on stage. Resolves with the final status, saved or
   * failed; it never rejects, so a script can read the outcome either way.
   */
  async function record(
    options: FilmRecordingOptions = {}
  ): Promise<FilmRecorderStatus> {
    if (busy) {
      return { ...status, error: "A recording is already running." };
    }
    busy = true;
    const startedAt = performance.now();
    let restorePixelRatio: (() => void) | null = null;

    try {
      const plan = planFilmRecording(director.film, options);
      status = {
        ...IDLE,
        phase: "preparing",
        message: `Preparing ${plan.name}`,
        name: plan.name,
        fps: plan.fps,
        width: plan.width,
        height: plan.height,
        startSeconds: plan.startSeconds,
        endSeconds: plan.endSeconds,
        totalFrames: plan.frameCount,
      };

      await checkEncoder(plan);
      await waitForPreparation();

      const host = director.recordingHost;
      const drive = host?.drive() ?? null;
      if (!host || !drive) {
        throw new FilmRecordingError(
          "The 3D scene is not on the renderer a recording can drive."
        );
      }
      await host.sequencesReady();

      const livePixelRatio = drive.renderer.getPixelRatio();
      restorePixelRatio = () => drive.renderer.setPixelRatio(livePixelRatio);

      // Recording plays the film straight through, so a solo loop would wrap
      // the playhead back inside one scene.
      director.setSoloScene(null);
      director.setRecordingFrame({ width: plan.width, height: plan.height });
      director.setExternalClock(true);
      director.seek(plan.startSeconds);
      director.play();
      await tick();
      await nextPaint();

      const blob = await renderToBlob(plan, host, drive);

      update({ phase: "saving", message: "Saving" });
      const response = await fetch(
        `/api/dev/release-media?name=${encodeURIComponent(plan.name)}`,
        { method: "POST", body: blob }
      );
      if (!response.ok) {
        throw new FilmRecordingError(
          `The dev server would not save the file (HTTP ${response.status}). Recording saves only on a dev server.`
        );
      }
      const saved = (await response.json()) as { path: string; bytes: number };
      const elapsedMs = Math.round(performance.now() - startedAt);
      update({
        phase: "saved",
        path: saved.path,
        bytes: saved.bytes,
        elapsedMs,
        message: `Saved ${saved.path} (${plan.frameCount} frames, ${seconds(plan.endSeconds - plan.startSeconds)} of film in ${seconds(elapsedMs / 1000)})`,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      update({
        phase: "failed",
        error: message,
        elapsedMs: Math.round(performance.now() - startedAt),
        message: `Recording failed: ${message}`,
      });
    } finally {
      // Pixel ratio first, so the stage's resize back to the window lays the
      // canvas out at the live ratio rather than at the recording's 1.
      restorePixelRatio?.();
      director.setExternalClock(false);
      director.setRecordingFrame(null);
      busy = false;
    }
    return status;
  }

  /**
   * Put a film document on stage, as the JSON editor would. Returns null when
   * it loaded, or the validation message when it did not.
   */
  function loadFilm(input: FilmDirectorInput): string | null {
    if (busy) return "A recording is running.";
    return director.loadFilm(input) ? null : director.validationError;
  }

  return {
    get status() {
      return status;
    },
    get busy() {
      return busy;
    },
    record,
    loadFilm,
    cancel(): void {
      getOffline3DExporter().cancel();
    },
  };
}

export type FilmRecorder = ReturnType<typeof createFilmRecorder>;
