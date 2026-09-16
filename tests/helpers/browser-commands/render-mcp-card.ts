import type { BrowserCommand } from "vitest/node";
import { renderSequenceToImage as renderPackaged } from "../../../mcp-server-pkg/src/core/sequence-renderer.js";
import { renderSequenceToImage as renderSource } from "../../../mcp-server/src/core/sequence-renderer.js";

type Adapter = "source" | "packaged";

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
  const render = adapter === "source" ? renderSource : renderPackaged;
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
