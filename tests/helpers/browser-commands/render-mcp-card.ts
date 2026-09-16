import type { BrowserCommand } from "vitest/node";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { tsImport } from "tsx/esm/api";

type Adapter = "source" | "packaged";
type SequenceRenderer =
  typeof import("../../../mcp-server/src/core/sequence-renderer.js");
type RenderSequenceToImage = SequenceRenderer["renderSequenceToImage"];

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The renderers are loaded lazily, and through tsx, on purpose. Vite bundles
 * this file into the vitest config and hands every bare import to Node's own
 * loader. `@tka/render-composition` resolves to TypeScript source whose
 * `./x.js` imports Node's type stripping cannot map back to `x.ts`, so a
 * static import here fails before a single test runs. tsx resolves those
 * paths, scoped to this import tree only.
 */
const RENDERER_ENTRY: Record<Adapter, string> = {
  source: path.resolve(
    here,
    "../../../mcp-server/src/core/sequence-renderer.ts"
  ),
  packaged: path.resolve(
    here,
    "../../../mcp-server-pkg/src/core/sequence-renderer.ts"
  ),
};

const renderers = new Map<Adapter, Promise<RenderSequenceToImage>>();

function loadRenderer(adapter: Adapter): Promise<RenderSequenceToImage> {
  let pending = renderers.get(adapter);
  if (!pending) {
    pending = tsImport(
      pathToFileURL(RENDERER_ENTRY[adapter]).href,
      import.meta.url
    ).then((module: SequenceRenderer) => module.renderSequenceToImage);
    renderers.set(adapter, pending);
  }
  return pending;
}

/** Render through the Node MCP adapter while the test itself runs in Chromium. */
export const renderMcpCard: BrowserCommand<
  [adapter: Adapter, sequence: any, options: Record<string, unknown>],
  string
> = async (_ctx, adapter, sequence, options) => {
  const steps = [sequence.startPlacement, ...sequence.steps].map(
    (step: any, index: number) => ({
      ...step,
      stepNumber: index,
      gridMode: "diamond",
      leftMotion: step.motions?.left ?? step.leftMotion,
      rightMotion: step.motions?.right ?? step.rightMotion,
    })
  );
  const render = await loadRenderer(adapter);
  return (await render(steps, sequence.word, options as any)).toString(
    "base64"
  );
};

declare module "vitest/browser" {
  interface BrowserCommands {
    renderMcpCard: (
      adapter: Adapter,
      sequence: unknown,
      options: Record<string, unknown>
    ) => Promise<string>;
  }
}
