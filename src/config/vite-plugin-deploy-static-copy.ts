import fs from "node:fs";
import path from "node:path";
import type { Plugin, ResolvedConfig } from "vite";
import { isExcludedFromDeploy } from "../../scripts/deploy-asset-trim-policy.js";

// Vite copies all of static/ (about 1.8 GB) into the client build, and
// scripts/trim-deploy-assets.js later deletes the dev-only and oversized part
// (about 415 MB) from the deploy output. This plugin takes over that copy for
// SvelteKit's client build and skips whatever the trim would delete, using the
// same policy module, so those files are never copied only to be removed. It
// runs only in `vite build`: the dev server still serves every file in static/.
// vite-plugin-static-copy cannot skip files by size and also serves its targets
// from the dev server, so this switches off Vite's own copy and uses cpSync.
export function deployStaticCopyPlugin(): Plugin {
  let isClientBuild = false;
  let copied = false;
  let resolved: ResolvedConfig | undefined;

  return {
    name: "tka-deploy-static-copy",
    apply: "build",
    // Runs after SvelteKit's config hook, which turns the public-dir copy on
    // for the client build and points it at .svelte-kit/output/client.
    enforce: "post",
    config(config) {
      const outDir = (config.build?.outDir ?? "").replace(/\\/g, "/");
      isClientBuild = outDir.endsWith("/output/client");
      copied = false;
      if (!isClientBuild) return;
      return { build: { copyPublicDir: false } };
    },
    configResolved(config) {
      resolved = config;
    },
    renderStart: {
      // Vite empties the output directory in its own renderStart ("pre").
      order: "post",
      sequential: true,
      handler() {
        if (!isClientBuild || copied || !resolved) return;
        const { build, publicDir, root } = resolved;
        // If Vite still owns the copy, it has already copied everything.
        if (build.copyPublicDir || !build.write) return;
        if (!publicDir || !fs.existsSync(publicDir)) return;
        copied = true;
        copyDeployableStatic(publicDir, path.resolve(root, build.outDir));
      },
    },
  };
}

function copyDeployableStatic(publicDir: string, outDir: string) {
  const startedAt = performance.now();
  let files = 0;
  let bytes = 0;
  let skipped = 0;

  fs.cpSync(publicDir, outDir, {
    recursive: true,
    dereference: true,
    filter(source) {
      const relativePath = path.relative(publicDir, source).split(path.sep).join("/");
      if (!relativePath) return true;
      const stats = fs.statSync(source);
      const isDirectory = stats.isDirectory();
      if (isExcludedFromDeploy(relativePath, { isDirectory, size: stats.size })) {
        skipped += 1;
        return false;
      }
      if (!isDirectory) {
        files += 1;
        bytes += stats.size;
      }
      return true;
    },
  });

  const seconds = ((performance.now() - startedAt) / 1000).toFixed(1);
  console.log(
    `[deploy-static-copy] copied ${files} files (${(bytes / 1024 / 1024).toFixed(1)} MiB) from static/ and skipped ${skipped} entries that never deploy, in ${seconds} s`
  );
}
