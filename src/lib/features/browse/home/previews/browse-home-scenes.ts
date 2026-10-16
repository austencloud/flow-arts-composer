/**
 * The Browse home's tile previews, keyed by tile id. Each is a scene in
 * Create's preview contract (MethodPreviewSceneProps), loaded on demand by
 * the shared preview box (CreateMethodPreview's `loader`).
 */
import type { MethodPreviewSceneModule } from "#lib/features/create/shared/components/method-previews/method-preview-scenes.js";

export const BROWSE_HOME_SCENES: Readonly<
  Record<string, () => Promise<MethodPreviewSceneModule>>
> = {
  sequences: () => import("./SequencesScene.svelte"),
  collections: () => import("./CollectionsScene.svelte"),
  visuals: () => import("./VisualsScene.svelte"),
  you: () => import("./YouScene.svelte"),
};
