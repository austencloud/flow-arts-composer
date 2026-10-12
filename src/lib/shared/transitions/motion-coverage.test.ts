import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { scanTree } from "@austencloud/motion/coverage";
import { SKIP } from "./motion-coverage-skip";
import { NOT_YET } from "./motion-not-yet";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

describe("motion coverage", () => {
  it("no raw motion outside the files still waiting for an owner", () => {
    const findings = scanTree(SRC, (file) => SKIP(file) || NOT_YET.has(file));
    expect(findings.map((f) => `${f.file}: ${f.rule}: ${f.text}`)).toEqual([]);
  });

  it("the waiting list only shrinks", () => {
    const findings = scanTree(SRC, SKIP);
    const stillRaw = new Set(findings.map((f) => f.file));
    const clean = [...NOT_YET].filter((file) => !stillRaw.has(file));
    expect(clean, "remove these from motion-not-yet.ts").toEqual([]);
  });
});
