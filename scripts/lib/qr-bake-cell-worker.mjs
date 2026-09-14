import { parentPort, workerData } from "node:worker_threads";
import { createRequire } from "node:module";
import { ModuleRunner, createNodeImportMeta } from "vite/module-runner";
import { installQrBakeNodeRuntime } from "./qr-bake-node-runtime.mjs";

const require = createRequire(import.meta.url);
const canvas = require(workerData.canvasModule);
let nextRpc = 0;
const pending = new Map();
const runner = new ModuleRunner({
  hmr: false,
  sourcemapInterceptor: false,
  createImportMeta: createNodeImportMeta,
  transport: {
    invoke: (payload) =>
      new Promise((resolve) => {
        const rpc = nextRpc++;
        pending.set(rpc, resolve);
        parentPort.postMessage({ rpc, payload });
      }),
  },
});
const ready = (async () => {
  const load = (name) => runner.import(`/src/lib/${name}.ts`);
  const { pictographPreparer } = await load(
    "shared/pictograph/shared/services/pictograph-preparer"
  );
  const { resolvePreviewCellRender } = await load(
    "shared/sequence-viewer/services/preview-cell-render-contract"
  );
  const { LayerCompositor } = await load(
    "shared/render/services/layer-compositor"
  );
  const { clearSvgImageCache } = await load(
    "shared/render/services/svg-image-cache"
  );
  const { isVisibleMotion } = await load(
    "shared/pictograph/shared/domain/models/motion-data"
  );
  const strictly = installQrBakeNodeRuntime(canvas, workerData.staticRoot);
  const compositor = new LayerCompositor();
  let count = 0;
  const clear = () => {
    compositor.clearCache();
    pictographPreparer.clearCache();
    clearSvgImageCache();
  };
  return async (cell) => {
    try {
      return await strictly(async () => {
        const resolved = resolvePreviewCellRender(
          cell.data,
          cell.darkMode,
          cell.options
        );
        const prepared = await pictographPreparer.prepareSingle(
          resolved.data,
          resolved.prepareOptions
        );
        for (const hand of ["left", "right"]) {
          const visible =
            hand === "left"
              ? cell.options.showLeftMotion
              : cell.options.showRightMotion;
          if (
            visible !== false &&
            isVisibleMotion(resolved.data.motions?.[hand]) &&
            (!prepared._prepared?.propAssets[hand] ||
              !prepared._prepared?.propPositions[hand])
          )
            throw new Error(`Missing prepared ${hand} prop`);
        }
        const result = await compositor.compose(
          prepared,
          resolved.renderOptions,
          resolved.visibility
        );
        return await result.canvas.encode("webp", 90);
      });
    } finally {
      if (++count % 100 === 0) clear();
    }
  };
})();
// Attach a rejection handler immediately; the render request receives the error.
ready.catch(() => {});
parentPort.on("message", async ({ rpc, response, id, options }) => {
  if (rpc !== undefined) {
    pending.get(rpc)(response);
    pending.delete(rpc);
    return;
  }
  try {
    parentPort.postMessage({ id, bytes: await (await ready)(options) });
  } catch (error) {
    parentPort.postMessage({ id, error: error.message });
  }
});
