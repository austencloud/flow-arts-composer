import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { workspaceResolvePlugins } from "../../scripts/lib/workspace-resolution.mjs";

export default defineConfig({
  // This checkout's packages/*, not the primary's, in a task worktree.
  plugins: [workspaceResolvePlugins(fileURLToPath(new URL("../..", import.meta.url)))],
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
