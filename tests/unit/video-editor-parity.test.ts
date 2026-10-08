// @vitest-environment jsdom
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { PostProjectSchema } from "$lib/shared/post-studio-plugin";
import {
  type PostProject,
  POST_STUDIO_ROLE,
  takeRole,
} from "@austencloud/video-editor/core";
import { normalizeProject } from "$lib/shared/media-composition/domain/post-project-normalize";
import {
  compilePostProject,
  itemIdFromMovesAnimationRole,
  textRole,
  type CompiledPostProject,
} from "$lib/shared/media-composition/domain/post-project-compiler";
import {
  resolveTakeTiming,
  takeSampleAt,
} from "$lib/shared/media-composition/domain/take-timing";
import {
  evaluatePresetLayers,
  isVisibleLayer,
  type EvaluatedFrameLayer,
  type TakeClock,
} from "$lib/shared/media-composition/services/frame-evaluator";
import { renderPostStudioFrame } from "$lib/shared/media-composition/services/post-studio-frame-compositor";
import { PostStudioPictographCapture } from "$lib/shared/media-composition/services/post-studio-pictograph-capture";
import { createTextItemPainter } from "$lib/shared/media-composition/services/text-item-painter";
import type { PostStudioLayerPainter } from "$lib/shared/media-composition/services/post-studio-layer-painter";
import type { StepData } from "$lib/shared/foundation/domain/models/step-data";
import {
  NL,
  buildLayerRoot,
  createVideoFrameStandIns,
  installRecordingCanvas,
  roundedJson,
  sha,
  standIn,
  type CaptureSink,
} from "./video-editor-parity/harness";

const capture = vi.hoisted((): CaptureSink => ({ log: [], contexts: 0 }));
vi.mock("modern-screenshot", async () => {
  const { createScreenshotMock } =
    await import("./video-editor-parity/harness");
  return createScreenshotMock(capture);
});

const DIR = "tests/fixtures/video-editor-parity";
const LOG_DIR = `${DIR}/draw-logs`;
const BEFORE = `${DIR}/before.json`;
const RECAPTURE = `${BEFORE} already exists: delete it and ${LOG_DIR}/ on purpose to recapture`;
const WRITE = process.env.PARITY_WRITE === "1";
const PHASE = WRITE ? "before" : "after";
const SCRATCH =
  process.env.PARITY_LOG_DIR ??
  path.join(os.tmpdir(), "claude", "video-editor-step1");
const FIXTURES = ["dck", "plain"] as const;
type FixtureName = (typeof FIXTURES)[number];
// DCK (83.28 s): 0 and 10.5 dck-main-1 with the animation-1 surface; 21.9 the
// crossfade from dck-main-1 into dck-main-2; 41 dck-main-2 with text-2 and the
// moves-1 surface; 70.25 dck-main-2 with moves-1 between text-4 and text-6;
// 81 card-1 with the credit-final-1 text.
// Plain (11.2 s): 0.2 v1; 2.5 v1 with t1; 4.9 the v1 to v2 crossfade with i1;
// 6.5 v2 with i1 and t2 halfway through its fade-in; 9.6 the fade-black from
// v2 into c1, with t2; 11 c1. v2 carries the edge at 4.9, 6.5 and 9.6.
const TIMES: Record<FixtureName, number[]> = {
  dck: [0, 10.5, 21.9, 41, 70.25, 81],
  plain: [0.2, 2.5, 4.9, 6.5, 9.6, 11],
};

type Keyed<T> = Record<string, T>;

interface FixtureHashes {
  project: string;
  compiled: string;
  layers: Keyed<string>;
  draw: Keyed<string>;
  drawCalls: Keyed<number>;
}

interface FixtureRun extends FixtureHashes {
  /** The draw log per time, as committed under draw-logs/. */
  logs: Keyed<string>;
}

const at = (time: number) => `t=${time}`;

function writeScratch(file: string, text: string): void {
  fs.mkdirSync(SCRATCH, { recursive: true });
  fs.writeFileSync(path.join(SCRATCH, `parity-${PHASE}-${file}`), text);
}

async function loadFixture(name: FixtureName): Promise<PostProject> {
  const file = `${DIR}/${name}.project.json`;
  if (name === "plain" && WRITE && !fs.existsSync(file)) {
    // Only the write step loads the builders, so the verify path never does.
    const { plainProject } =
      await import("./video-editor-parity/plain-project");
    fs.writeFileSync(
      file,
      JSON.stringify(PostProjectSchema.parse(plainProject()), null, 2) + NL
    );
  }
  return normalizeProject(
    PostProjectSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")))
  );
}

function alignmentFor(project: PostProject) {
  if (!project.timings || Object.keys(project.timings).length === 0)
    return null;
  const steps = Array.from({ length: 16 }, () => ({ duration: 1 }) as StepData);
  const moveBeats = steps.map((step) => step.duration ?? 1);
  const clocks: Record<string, TakeClock> = {};
  for (const [takeId, timing] of Object.entries(project.timings)) {
    const resolved = resolveTakeTiming(timing, moveBeats);
    clocks[takeRole(takeId)] = {
      sampleAt: (mediaSeconds, options) =>
        takeSampleAt(resolved, mediaSeconds, options),
    };
  }
  return { steps, startPlacementDuration: 1, sequencePeriod: 1, clocks };
}

function paintersFor(
  compiled: CompiledPostProject
): Map<string, PostStudioLayerPainter> {
  if (compiled.titles.length > 0) {
    throw new Error(
      "fixture has titles: build titles painters as PostEditorWorkspace.svelte titlesPainterFor does"
    );
  }
  const painters = new Map<string, PostStudioLayerPainter>();
  for (const entry of compiled.texts) {
    painters.set(
      textRole(entry.itemId),
      createTextItemPainter(
        () => compiled.texts.find((t) => t.itemId === entry.itemId) ?? null
      )
    );
  }
  return painters;
}

function renderModeFor(
  role: string,
  painters: Map<string, PostStudioLayerPainter>
): string {
  if (role === POST_STUDIO_ROLE.card) return "choreo-card";
  if (
    role === POST_STUDIO_ROLE.animation ||
    itemIdFromMovesAnimationRole(role) !== null
  ) {
    return "sequence-animation";
  }
  if (painters.has(role)) return "painted";
  return "external-media";
}

async function run(name: FixtureName): Promise<FixtureRun> {
  const project = await loadFixture(name);
  const compiled = compilePostProject(project, {
    now: project.updatedAt,
    animationOverlay: false,
  });
  if (!compiled)
    throw new Error(`${name}: compilePostProject returned null (no clips)`);
  const { preset } = compiled;
  const alignment = alignmentFor(project);
  const painters = paintersFor(compiled);
  const size =
    project.canvas === "4:5"
      ? { width: 1080, height: 1350 }
      : { width: 1080, height: 1920 };
  // Every DOM surface measures half its region, so each capture is scaled up
  // and the scale shows in the log.
  const boundsFor = (layer: EvaluatedFrameLayer) => {
    const region =
      layer.regionRect ??
      preset.regions.find((candidate) => candidate.id === layer.regionId);
    return {
      width: ((region?.width ?? 0) * preset.output.width) / 2,
      height: ((region?.height ?? 0) * preset.output.height) / 2,
    };
  };
  writeScratch(`${name}-project.json`, roundedJson(project, 2) + NL);
  writeScratch(`${name}-compiled.json`, roundedJson(compiled, 2) + NL);
  const out: FixtureRun = {
    project: sha(roundedJson(project)),
    compiled: sha(roundedJson(compiled)),
    layers: {},
    draw: {},
    drawCalls: {},
    logs: {},
  };
  const evaluated: Keyed<EvaluatedFrameLayer[]> = {};
  try {
    for (const time of TIMES[name]) {
      const layers = evaluatePresetLayers(
        preset,
        compiled.durationSeconds,
        time,
        alignment
      );
      evaluated[at(time)] = layers;
      out.layers[at(time)] = sha(roundedJson(layers));
      const visible = layers.filter(isVisibleLayer);
      const log: string[] = [];
      capture.log = log;
      capture.contexts = 0;
      const restore = installRecordingCanvas(log);
      // The exporter's own capture for sequence-animation surfaces.
      const pictographCapture = new PostStudioPictographCapture();
      try {
        const mediaRoles = new Set(
          visible
            .map((layer) => layer.sourceRole)
            .filter(
              (role) => renderModeFor(role, painters) === "external-media"
            )
        );
        await renderPostStudioFrame({
          canvas: standIn("output", size.width, size.height),
          root: buildLayerRoot(
            visible,
            (role) => renderModeFor(role, painters),
            boundsFor
          ),
          preset,
          layers: visible,
          cardFrameCache: new Map(),
          pictographCapture,
          painters,
          videoFrames: createVideoFrameStandIns(log, mediaRoles) as never,
          timeSeconds: time,
        });
      } finally {
        // As the exporter disposes it once its frames are drawn.
        pictographCapture.dispose();
        restore();
        vi.restoreAllMocks();
        // Written even when the render throws, to show how far it got.
        writeScratch(`${name}-${time}.txt`, log.join(NL) + NL);
      }
      out.draw[at(time)] = sha(log.join(NL));
      out.drawCalls[at(time)] = log.length;
      out.logs[at(time)] = log.join(NL) + NL;
    }
  } finally {
    writeScratch(`${name}-layers.json`, roundedJson(evaluated, 2) + NL);
  }
  return out;
}

function committedLogs(name: FixtureName): Keyed<string> {
  const logs: Keyed<string> = {};
  for (const time of TIMES[name]) {
    const file = `${LOG_DIR}/${name}-${time}.txt`;
    logs[at(time)] = fs.existsSync(file)
      ? fs.readFileSync(file, "utf8")
      : "<missing>";
  }
  return logs;
}

function beforeCapture(name: FixtureName): FixtureHashes {
  if (!fs.existsSync(BEFORE))
    throw new Error(`${BEFORE} is missing: capture it with PARITY_WRITE=1`);
  const before = (
    JSON.parse(fs.readFileSync(BEFORE, "utf8")) as Partial<
      Record<string, FixtureHashes>
    >
  )[name];
  if (!before) throw new Error(`${BEFORE} has no ${name} entry`);
  return before;
}

const moved = (name: FixtureName, part: string) =>
  `${name}: the ${part} moved from the before capture. Before and after logs and JSON are in ${SCRATCH}`;

describe("video editor parity", () => {
  const outcomes: Partial<Record<FixtureName, FixtureRun | Error>> = {};

  // Every fixture renders here, so each test stands alone (a -t run included).
  beforeAll(async () => {
    // Stop before any render or scratch write can touch the capture.
    if (WRITE && fs.existsSync(BEFORE)) throw new Error(RECAPTURE);
    for (const name of FIXTURES) {
      try {
        outcomes[name] = await run(name);
      } catch (error) {
        outcomes[name] =
          error instanceof Error ? error : new Error(String(error));
      }
    }
  }, 60_000);
  afterEach(() => vi.restoreAllMocks());

  function resultFor(name: FixtureName): FixtureRun {
    const outcome = outcomes[name];
    if (outcome instanceof Error) throw outcome;
    if (!outcome) throw new Error(`${name}: no result was computed`);
    return outcome;
  }

  for (const name of FIXTURES) {
    it(`${name}: project, compile and layers match the before capture`, () => {
      const result = resultFor(name);
      if (WRITE) return;
      const before = beforeCapture(name);
      expect(
        {
          project: result.project,
          compiled: result.compiled,
          layers: result.layers,
        },
        moved(name, "project, compile or layers")
      ).toEqual({
        project: before.project,
        compiled: before.compiled,
        layers: before.layers,
      });
    });
    it(`${name}: draw log matches the before capture`, () => {
      const result = resultFor(name);
      if (WRITE) return;
      const before = beforeCapture(name);
      expect(
        { drawCalls: result.drawCalls, draw: result.draw, logs: result.logs },
        moved(name, "draw log")
      ).toEqual({
        drawCalls: before.drawCalls,
        draw: before.draw,
        logs: committedLogs(name),
      });
    });
  }

  it.runIf(WRITE)("writes the before capture", () => {
    if (fs.existsSync(BEFORE)) {
      throw new Error(RECAPTURE);
    }
    const hashes: Partial<Record<FixtureName, FixtureHashes>> = {};
    for (const name of FIXTURES) {
      const { logs: _logs, ...fixture } = resultFor(name);
      hashes[name] = fixture;
    }
    fs.mkdirSync(LOG_DIR, { recursive: true });
    for (const name of FIXTURES) {
      const { logs } = resultFor(name);
      for (const time of TIMES[name]) {
        const file = `${LOG_DIR}/${name}-${time}.txt`;
        if (!fs.existsSync(file)) fs.writeFileSync(file, logs[at(time)]!);
      }
    }
    fs.writeFileSync(BEFORE, JSON.stringify(hashes, null, 2) + NL);
  });
});
