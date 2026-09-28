import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SSR_RESOLVE_CONDITIONS } from "../../../src/config/vite-ssr-conditions";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

// Vitest 4 hands ssr.resolve.conditions to each test process as Node flags,
// turning Vite's "development|production" placeholder into the active mode.
function vitestWorkerConditionFlags(conditions: readonly string[]): string[] {
  return conditions
    .map((condition) =>
      condition === "development|production" ? "development" : condition
    )
    .flatMap((condition) => ["--conditions", condition]);
}

describe("SSR resolve conditions", () => {
  it("leave import, require and default to Vite", () => {
    expect(SSR_RESOLVE_CONDITIONS).not.toContain("import");
    expect(SSR_RESOLVE_CONDITIONS).not.toContain("require");
    expect(SSR_RESOLVE_CONDITIONS).not.toContain("default");
  });

  // Firestore's Node build loads gRPC, whose protobufjs looks up the `long`
  // package with a CommonJS require. The wrong conditions hand it an ES module
  // namespace and the import dies before a single test runs.
  it("let a Vitest process that uses the root Vite config load Firestore", () => {
    const output = execFileSync(
      process.execPath,
      [
        ...vitestWorkerConditionFlags(SSR_RESOLVE_CONDITIONS),
        "--input-type=module",
        "--eval",
        "await import('firebase/firestore'); console.log('firestore loaded');",
      ],
      { cwd: projectRoot, encoding: "utf8", stdio: "pipe" }
    );

    expect(output.trim()).toBe("firestore loaded");
  });
});
