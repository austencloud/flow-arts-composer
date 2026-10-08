import {
  createEmptyPostProject as createEmptyCore,
  createPostMusicSchema,
  createProjectSchema,
  defaultBoxFor as defaultBoxForCore,
  type PostItemKind,
  type PostProject,
} from "@austencloud/video-editor/core";
import { isFeatureVideoMediaUrl } from "$lib/shared/media-composition/domain/feature-video-url";
import { createTkaPlugin } from "./create-plugin";

export const tkaPlugin = createTkaPlugin();
export const PostProjectSchema = createProjectSchema(tkaPlugin);
export const PostMusicSchema = createPostMusicSchema(isFeatureVideoMediaUrl);

export function defaultBoxFor(kind: PostItemKind) {
  return defaultBoxForCore(kind, tkaPlugin);
}

export function createEmptyPostProject(input: {
  sequenceId: string;
  now: number;
}): PostProject {
  return createEmptyCore(
    { now: input.now },
    tkaPlugin.emptyProjectFields(input)
  );
}
