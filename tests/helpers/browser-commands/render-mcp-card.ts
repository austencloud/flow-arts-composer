import type { BrowserCommand } from "vitest/node";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { tsImport } from "tsx/esm/api";

export type McpCardAdapter = "source" | "packaged" | "installed";
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
const SOURCE_RENDERER_ENTRY = path.resolve(
  here,
  "../../../mcp-server/src/core/sequence-renderer.ts"
);
const PACKAGED_RENDERER_ENTRY = path.resolve(
  here,
  "../../../mcp-server-pkg/src/core/sequence-renderer.ts"
);

/** The release runner sets this to its isolated installed-package directory. */
const packedRoot = process.env.MCP_PACKED_ROOT;

function installedRendererEntry(): string {
  if (!packedRoot) {
    throw new Error(
      "MCP_PACKED_ROOT is required to load the installed MCP card renderer"
    );
  }
  const entry = path.resolve(packedRoot, "dist/card-renderer.js");
  if (!existsSync(entry)) {
    throw new Error(
      `Installed MCP card renderer is missing: ${entry}. Build and pack dist/card-renderer.js before running parity.`
    );
  }
  return entry;
}

const renderers = new Map<McpCardAdapter, Promise<RenderSequenceToImage>>();

function loadRenderer(adapter: McpCardAdapter): Promise<RenderSequenceToImage> {
  let pending = renderers.get(adapter);
  if (!pending) {
    pending =
      adapter === "installed"
        ? import(pathToFileURL(installedRendererEntry()).href).then(
            (module) => {
              if (typeof module.renderSequenceToImage !== "function") {
                throw new Error(
                  `Installed MCP card renderer has no renderSequenceToImage export: ${installedRendererEntry()}`
                );
              }
              return module.renderSequenceToImage as RenderSequenceToImage;
            }
          )
        : tsImport(
            pathToFileURL(
              adapter === "source"
                ? SOURCE_RENDERER_ENTRY
                : PACKAGED_RENDERER_ENTRY
            ).href,
            import.meta.url
          ).then((module: SequenceRenderer) => module.renderSequenceToImage);
    renderers.set(adapter, pending);
  }
  return pending;
}

/** Render through the Node MCP adapter while the test itself runs in Chromium. */
export const renderMcpCard: BrowserCommand<
  [adapter: McpCardAdapter, sequence: any, options: Record<string, unknown>],
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
      adapter: McpCardAdapter,
      sequence: unknown,
      options: Record<string, unknown>
    ) => Promise<string>;
  }
}
