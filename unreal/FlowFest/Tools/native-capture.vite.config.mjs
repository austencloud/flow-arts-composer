import { fileURLToPath } from "node:url";
import { resolve, dirname, isAbsolute, relative, join } from "node:path";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteOptions } from "../../../src/config/svelte-options.js";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import {
  buildId,
  sha256,
  stableStringify,
} from "../../Shared/Tools/capture-provenance.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const outDir = resolve(
  root,
  "unreal/FlowFest/Intermediate/native-capture-static"
);

async function filesUnder(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await filesUnder(path)));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function captureBuildReceipt() {
  let sourceSHA256;
  return {
    name: "native-capture-build-receipt",
    async generateBundle() {
      const source = {};
      for (const id of this.getModuleIds()) {
        const path = id.split("?")[0];
        if (!path || path[0] === "\0" || !isAbsolute(path)) continue;
        try {
          source[relative(root, path).replaceAll("\\", "/")] = await sha256(
            await readFile(path)
          );
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
      if (
        !Object.keys(source).some((path) =>
          path.endsWith("/NativeCaptureScene.svelte")
        )
      )
        throw new Error(
          "Capture build source graph omitted NativeCaptureScene.svelte"
        );
      sourceSHA256 = await sha256(stableStringify(source));
    },
    async closeBundle() {
      if (!sourceSHA256)
        throw new Error("Capture source graph was not fingerprinted");
      const output = {};
      for (const path of await filesUnder(outDir)) {
        const name = relative(outDir, path).replaceAll("\\", "/");
        if (name === "native-capture-build.json") continue;
        output[name] = await sha256(await readFile(path));
      }
      if (
        !Object.keys(output).some((path) =>
          path.endsWith("native-capture.html")
        )
      )
        throw new Error("Capture build output omitted native-capture.html");
      const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
        cwd: root,
        encoding: "utf8",
      }).trim();
      const build = {
        sourceCommit,
        sourceSHA256,
        outputSHA256: await sha256(stableStringify(output)),
      };
      build.id = await buildId(build);
      await writeFile(
        join(outDir, "native-capture-build.json"),
        JSON.stringify({ schema: "tka-native-capture-build-v1", ...build })
      );
    },
  };
}

export default defineConfig({
  root,
  publicDir: false,
  resolve: {
    alias: [
      { find: "#lib", replacement: resolve(root, "src/lib") },
      {
        find: /^\$app\/env$/,
        replacement: resolve(
          root,
          "unreal/FlowFest/Tools/native-capture-app-env.js"
        ),
      },
      {
        find: /^\$app\/env\/public$/,
        replacement: resolve(
          root,
          "unreal/FlowFest/Tools/native-capture-public-env.js"
        ),
      },
      {
        find: /^\$app\/navigation$/,
        replacement: resolve(
          root,
          "unreal/FlowFest/Tools/native-capture-navigation.js"
        ),
      },
      {
        find: /^\$app\/state$/,
        replacement: resolve(
          root,
          "unreal/FlowFest/Tools/native-capture-state.js"
        ),
      },
    ],
    conditions: ["svelte", "browser", "module"],
  },
  plugins: [svelte(svelteOptions), captureBuildReceipt()],
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(root, "unreal/FlowFest/Tools/native-capture.html"),
    },
  },
});
