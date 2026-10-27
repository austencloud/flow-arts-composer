import { resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { build, type Rolldown } from "vite";
import { describe, expect, it } from "vitest";

// The boot worker must stay small (spec budget: 30 KB gzipped) and free of
// the calculator, pictograph modules, Svelte runes and `$app/*`. This bundles
// it the way the app build does (ES module, minified) and weighs the result.
describe("overture worker bundle", () => {
  it("stays under 30 KB gzipped with nothing from the app's heavy modules", async () => {
    const result = (await build({
      configFile: false,
      logLevel: "silent",
      build: {
        write: false,
        minify: true,
        lib: {
          entry: resolve(
            process.cwd(),
            "src/lib/shared/loading/overture/overture.worker.ts"
          ),
          formats: ["es"],
          fileName: "overture-worker",
        },
      },
    })) as Rolldown.RolldownOutput[] | Rolldown.RolldownOutput;
    const outputs = (Array.isArray(result) ? result : [result]).flatMap(
      (r) => r.output
    );
    const chunks = outputs.filter(
      (o): o is Rolldown.OutputChunk => o.type === "chunk"
    );
    expect(chunks).toHaveLength(1);
    const chunk = chunks[0]!;
    const modules = Object.keys(chunk.modules).map((id) =>
      id.replace(/\\/g, "/")
    );
    expect(
      modules.some((id) => /mandala-geometry|pictograph|svelte|\$app/.test(id))
    ).toBe(false);
    const gzipped = gzipSync(chunk.code).length;
    expect(gzipped).toBeLessThan(30 * 1024);
  }, 60_000);
});
