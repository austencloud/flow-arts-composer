import type { VideoEditorPlugin } from "@austencloud/video-editor";
import { createTkaPlugin } from "../create-plugin";
import { createTkaSurfaces } from "../surfaces";
import { TKA_KIND_UI } from "./tka-kind-ui";
import { createTkaPluginUi } from "./tka-plugin-ui";

/** tka's plugin with its editor UI: the data plugin, the kinds' UI, the surfaces and the plugin UI. Browser only. */
export function createTkaEditorPlugin(): VideoEditorPlugin {
  const data = createTkaPlugin();
  return {
    ...data,
    itemKinds: data.itemKinds.map((definition) => ({
      ...definition,
      ui: TKA_KIND_UI[definition.kind as keyof typeof TKA_KIND_UI],
    })),
    createSurfaces: createTkaSurfaces,
    ui: createTkaPluginUi(),
  };
}
