import { build } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";
import { cardParityCases } from "./card-parity-cases";
import { cardProfileCases } from "./card-profile-cases";
import { cardReviewDocument, type CardReviewEntry } from "./card-review-document";
import {
  cardParityMetrics,
  assertCardParity,
  CARD_PARITY_LIMITS,
} from "./card-parity-metrics";
import { renderSequenceToImage } from "../../mcp-server-pkg/src/core/sequence-renderer";
import { renderSequenceToImage as renderSourceSequence } from "../../mcp-server/src/core/sequence-renderer";

const root = process.cwd();
const out = resolve(root, "tests/render-parity/.artifacts/card-parity");
await mkdir(out, { recursive: true });
await build({
  configFile: false,
  root: resolve(root, "tests/render-parity/browser"),
  publicDir: false,
  plugins: [svelte()],
  // The QR generator reaches the viewer's render worker; ES workers are the
  // only format Rollup accepts once the bundle code-splits.
  worker: { format: "es" },
  resolve: {
    conditions: ["browser"],
    alias: {
      $lib: resolve(root, "src/lib"),
      // Always the checkout's own package, never a node_modules link to another one.
      "@tka/render-composition": resolve(
        root,
        "packages/render-composition/src/index.ts"
      ),
      "$app/environment": resolve(
        root,
        "tests/render-parity/stubs/app-environment.ts"
      ),
      "$app/navigation": resolve(
        root,
        "tests/render-parity/stubs/app-navigation.ts"
      ),
      "$app/stores": resolve(root, "tests/setup/stubs/app-stores.ts"),
      "$app/state": resolve(root, "tests/setup/stubs/app-state.ts"),
      "$env/static/public": resolve(
        root,
        "tests/setup/stubs/env-static-public.ts"
      ),
      "$env/dynamic/public": resolve(
        root,
        "tests/setup/stubs/env-dynamic-public.ts"
      ),
    },
  },
  build: {
    outDir: out,
    emptyOutDir: false,
    minify: false,
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code !== "CIRCULAR_DEPENDENCY") warn(warning);
      },
    },
  },
});

const profileCases = cardProfileCases();
const cases = [...cardParityCases(), ...profileCases];
const reviewEntries: CardReviewEntry[] = [];
const results: Array<{
  name: string;
  adapter: string;
  regions: ReturnType<typeof cardParityMetrics>;
  diffPercent: number;
  width: number;
  height: number;
}> = [];
let negativeControlPassed = false;
const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST") {
      const chunks: Buffer[] = [];
      for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks).toString();
      if (request.url === "/profile-complete") {
        if (reviewEntries.length !== profileCases.length)
          throw new Error("Profile review is incomplete");
        await writeFile(resolve(out, "card-profiles.html"), cardReviewDocument(reviewEntries));
        response.end("card-profiles.html");
        return;
      }
      if (request.url === "/complete" || request.url === "/failed") {
        console.log(
          request.url === "/failed" ? body : JSON.stringify(results, null, 2)
        );
        await writeFile(
          resolve(out, "results.json"),
          JSON.stringify(results, null, 2)
        );
        if (request.url === "/complete") {
          if (results.length !== cardParityCases().length * 2 || !negativeControlPassed)
            throw new Error(
              "Incomplete parity run or missing negative control"
            );
          for (const result of results)
            assertCardParity(
              result.regions,
              `${result.name}/${result.adapter}`
            );
        }
        response.end("ok");
        return;
      }
      const { name, png } = JSON.parse(body);
      const testCase = cases.find((testCase) => testCase.name === name);
      if (!testCase) throw new Error("Unknown card parity case");
      const isProfile = profileCases.some((testCase) => testCase.name === name);
      if (request.url === "/negative-control") {
        const baseline = PNG.sync.read(
          await readFile(resolve(out, name + "-composer.png"))
        );
        const withoutBadge = PNG.sync.read(
          Buffer.from(png.split(",")[1], "base64")
        );
        const header = cardParityMetrics(baseline, withoutBadge, testCase).find(
          (region) => region.name === "header"
        )!;
        negativeControlPassed = header.percent > CARD_PARITY_LIMITS.header!;
        if (!negativeControlPassed)
          throw new Error("Parity check failed to detect a removed badge");
        response.end("ok");
        return;
      }
      const sequence = testCase.sequence;
      const steps = [sequence.startPlacement, ...sequence.steps].map(
        (step, index) => ({
          ...step,
          stepNumber: index,
          gridMode: "diamond",
          leftMotion: step.motions.left,
          rightMotion: step.motions.right,
        })
      );
      const browserBytes = Buffer.from(png.split(",")[1], "base64");
      const a = PNG.sync.read(browserBytes);
      const comparisons = [];
      for (const [adapter, render] of [
        ["packaged", renderSequenceToImage],
        ["source", renderSourceSequence],
      ] as const) {
        const mcp = await render(
          steps as any,
          sequence.word,
          testCase.options as any
        );
        const b = PNG.sync.read(mcp);
        const sameDimensions = a.width === b.width && a.height === b.height;
        if (!sameDimensions && !isProfile)
          throw new Error(
            name +
              ": dimensions differ: " +
              a.width +
              "x" +
              a.height +
              " vs " +
              b.width +
              "x" +
              b.height
          );
        const diff = new PNG({ width: a.width, height: a.height });
        const count = sameDimensions ? pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
          threshold: 0.1,
        }) : null;
        const diffBytes = PNG.sync.write(diff);
        const diffPercent = count === null ? null : +((100 * count) / (a.width * a.height)).toFixed(4);
        await Promise.all([
          writeFile(resolve(out, name + "-composer.png"), browserBytes),
          writeFile(resolve(out, name + "-" + adapter + ".png"), mcp),
          writeFile(
            resolve(out, name + "-" + adapter + "-diff.png"),
            diffBytes
          ),
        ]);
        if (!isProfile) results.push({
          regions: cardParityMetrics(a, b, testCase),
          name,
          adapter,
          diffPercent: diffPercent!,
          width: a.width,
          height: a.height,
        });
        comparisons.push({
          adapter,
          diffPercent,
          width: b.width,
          height: b.height,
          mcp: "data:image/png;base64," + mcp.toString("base64"),
          diff: sameDimensions ? "data:image/png;base64," + diffBytes.toString("base64") : "",
        });
      }
      if (isProfile) {
        const entry = profileCases.find((entry) => entry.name === name)!;
        const prior = reviewEntries.findIndex((entry) => entry.name === name);
        if (prior >= 0) reviewEntries.splice(prior, 1);
        reviewEntries.push({
          name, description: entry.description, options: testCase.options,
          composer: png, width: a.width, height: a.height,
          comparisons: comparisons.map(({ mcp, ...comparison }) => ({ ...comparison, png: mcp })),
        });
      }
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ comparisons }));
      return;
    }
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/") {
      results.length = 0;
      negativeControlPassed = false;
      reviewEntries.length = 0;
    }
    if (url.pathname === "/favicon.ico") {
      response.statusCode = 204;
      response.end();
      return;
    }
    const isAsset =
      url.pathname.startsWith("/images/") ||
      url.pathname.startsWith("/fonts/") ||
      url.pathname.startsWith("/data/");
    const base = isAsset ? resolve(root, "static") : out;
    const file = resolve(
      base,
      "." +
        (url.pathname === "/"
          ? "/index.html"
          : decodeURIComponent(url.pathname))
    );
    if (!file.startsWith(base + "/") && !file.startsWith(base + "\\"))
      throw new Error("Invalid path");
    const types: Record<string, string> = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".svg": "image/svg+xml",
      ".json": "application/json",
      ".woff2": "font/woff2",
      ".ttf": "font/ttf",
    };
    response.setHeader(
      "Content-Type",
      types[extname(file)] ?? "application/octet-stream"
    );
    response.end(await readFile(file));
  } catch (error) {
    console.error(error);
    response.statusCode = 500;
    response.end(JSON.stringify({ error: String(error) }));
  }
});
server.listen(5188, "127.0.0.1", () =>
  console.log("Card parity review: http://127.0.0.1:5188")
);
process.on("SIGINT", () => server.close(() => process.exit()));
