import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { workspaceResolvePlugins } from "../../scripts/lib/workspace-resolution.mjs";

export default defineConfig({
  // This checkout's packages/*, not the primary's, in a task worktree.
  plugins: [workspaceResolvePlugins(fileURLToPath(new URL("../..", import.meta.url)))],
  resolve: {
    alias: {
      "@tka/render-core": fileURLToPath(new URL("../render-core/src/index.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
