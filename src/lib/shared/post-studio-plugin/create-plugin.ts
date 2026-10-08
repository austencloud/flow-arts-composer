import type { VideoEditorPlugin } from "@austencloud/video-editor/core";
import { isFeatureVideoMediaUrl } from "$lib/shared/media-composition/domain/feature-video-url";
import { TKA_COMPILE_HOOKS, TKA_COMPILE_OUTPUTS } from "./compile-hooks";
import { TKA_ITEM_KINDS, TKA_KIND_EXTENSIONS } from "./item-kinds";
import { TKA_NORMALIZE } from "./normalize-hooks";
import { TKA_PROJECT_EXTENSION, emptyProjectFields } from "./project-extension";

export type TkaPlugin = VideoEditorPlugin & {
  emptyProjectFields: typeof emptyProjectFields;
};

export function createTkaPlugin(): TkaPlugin {
  return {
    id: "tka",
    itemKinds: TKA_ITEM_KINDS,
    kindExtensions: TKA_KIND_EXTENSIONS,
    projectExtension: TKA_PROJECT_EXTENSION,
    normalize: TKA_NORMALIZE,
    compileHooks: TKA_COMPILE_HOOKS,
    compileOutputs: TKA_COMPILE_OUTPUTS,
    isMediaUrl: isFeatureVideoMediaUrl,
    emptyProjectFields,
  };
}
