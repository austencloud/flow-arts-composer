import {
  compilePostProject as compileCore,
  createEmptyPostProject as createEmptyCore,
  createPostMusicSchema,
  createProjectSchema,
  defaultBoxFor as defaultBoxForCore,
  normalizeProject as normalizeCore,
  type CompilePostProjectContext,
  type CompiledPostProject,
  type EditContext,
  type MediaCompositionPreset,
  type PostItemKind,
  type PostProject,
} from "@austencloud/video-editor/core";
import {
  evaluatePresetFrame as evaluateFrameCore,
  evaluatePresetLayers as evaluateLayersCore,
  type EvaluatedFrameLayer,
  type SourceTimeOffsets,
} from "@austencloud/video-editor/render";
import { isFeatureVideoMediaUrl } from "#lib/shared/media-composition/domain/feature-video-url.js";
import { tkaFrameAlignment, type SequenceFrameAlignment } from "./alignment";
import { createTkaPlugin } from "./create-plugin";

export const tkaPlugin = createTkaPlugin();
export const PostProjectSchema = createProjectSchema(tkaPlugin);
export const PostMusicSchema = createPostMusicSchema(isFeatureVideoMediaUrl);

export function defaultBoxFor(kind: PostItemKind) {
  return defaultBoxForCore(kind, tkaPlugin);
}

export function normalizeProject(stored: PostProject): PostProject {
  return normalizeCore(stored, tkaPlugin);
}

/** The edit context tka passes to every edit: the clock and the TKA plugin. */
export function editContext(now: number): EditContext {
  return { now, plugin: tkaPlugin };
}

export function compilePostProject(
  project: PostProject,
  context: Omit<CompilePostProjectContext, "presetId">
): CompiledPostProject | null {
  return compileCore(
    project,
    { ...context, presetId: `post-project:${project.sequenceId}` },
    tkaPlugin
  );
}

export function createEmptyPostProject(input: {
  sequenceId: string;
  now: number;
  sourceKind?: "sequence" | "none";
  title?: string;
}): PostProject {
  return createEmptyCore(
    { now: input.now },
    tkaPlugin.emptyProjectFields(input)
  );
}

/**
 * The frame evaluator with tka's call shape: it takes today's
 * `SequenceFrameAlignment` and hands the package its `FrameAlignment`.
 */
export function evaluatePresetFrame(
  preset: MediaCompositionPreset,
  durationSeconds: number,
  timeSeconds: number,
  alignment?: SequenceFrameAlignment | null,
  sourceTimeOffsets: SourceTimeOffsets = {}
): EvaluatedFrameLayer[] {
  return evaluateFrameCore(
    preset,
    durationSeconds,
    timeSeconds,
    alignment ? tkaFrameAlignment(alignment) : alignment,
    sourceTimeOffsets
  );
}

export function evaluatePresetLayers(
  preset: MediaCompositionPreset,
  durationSeconds: number,
  timeSeconds: number,
  alignment?: SequenceFrameAlignment | null,
  sourceTimeOffsets: SourceTimeOffsets = {}
): EvaluatedFrameLayer[] {
  return evaluateLayersCore(
    preset,
    durationSeconds,
    timeSeconds,
    alignment ? tkaFrameAlignment(alignment) : alignment,
    sourceTimeOffsets
  );
}
