/**
 * Public rendering entry point for consumers that need a card image without
 * starting the MCP stdio server. It deliberately imports the same production
 * renderer that MCP tools call, so a packed-card check cannot drift to a
 * second implementation.
 */
export {
  renderSequenceToImage,
  type SequenceRenderOptions,
} from "./src/core/sequence-renderer.js";
export type { SequenceStep } from "./src/core/sequence-builder.js";
