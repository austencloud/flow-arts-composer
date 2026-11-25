// Lets a task worktree run an edited copy of @austencloud/scene-3d without an
// install. Set TKA_SCENE3D_SRC to the edited package's `src/index.ts`; vite and
// vitest then resolve the package and its subpath exports to that copy. Unset,
// or pointing at a missing file, it changes nothing.
import fs from "node:fs";
import path from "node:path";

const SUBPATHS = {
  worker: "worker.ts",
  "prop-hand-palette": "lib/components/props/prop-hand-palette.ts",
  state: "lib/state/user-proportions-state.svelte.ts",
};

/** The edited package's `src/` folder, or null when the override is off. */
export function scene3dSourceOverride(env = process.env) {
  const entry = env.TKA_SCENE3D_SRC;
  if (!entry) return null;
  const resolved = path.resolve(entry);
  if (!fs.existsSync(resolved)) return null;
  return path.dirname(resolved);
}

/** Vite alias entries for the override, or [] when it is off. */
export function scene3dSourceAliases(env = process.env) {
  const srcDir = scene3dSourceOverride(env);
  if (!srcDir) return [];
  return [
    {
      find: /^@austencloud\/scene-3d$/,
      replacement: path.join(srcDir, "index.ts"),
    },
    ...Object.entries(SUBPATHS).map(([sub, file]) => ({
      find: new RegExp(`^@austencloud/scene-3d/${sub}$`),
      replacement: path.join(srcDir, file),
    })),
  ];
}
