import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Built by `npm run build:iife` in packages/shape-engine; skipped until then.
const DIST = join(__dirname, "../../dist");

describe.skipIf(!existsSync(join(DIST, "shape-engine.iife.js")))("the IIFE bundle", () => {
  it("defines window.TkaShapeEngine with both mounts and the domain", () => {
    const code = readFileSync(join(DIST, "shape-engine.iife.js"), "utf8");
    new Function(code)();
    const api = (window as unknown as { TkaShapeEngine: Record<string, any> }).TkaShapeEngine;
    expect(typeof api.mountShapeEngine).toBe("function");
    expect(typeof api.mountElementStrip).toBe("function");
    expect(api.domain.MODE_ORDER.length).toBe(6);
    expect(api.letterFor).toBeTypeOf("function");
    expect(api.propsElementFor).toBeTypeOf("function");
  });
});
