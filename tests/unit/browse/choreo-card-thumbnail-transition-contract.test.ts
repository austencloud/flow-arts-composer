// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(
    process.cwd(),
    "src/lib/shared/browse/components/ChoreoCardThumbnail/ChoreoCardThumbnail.svelte"
  ),
  "utf8"
);

describe("Browse card preview view transitions", () => {
  it("handles Chrome's ready rejection for both preview morph directions", () => {
    expect(source.match(/document\.startViewTransition\(/g)).toHaveLength(2);
    expect(source.match(/ignoreViewTransitionSkip\(vt\);/g)).toHaveLength(2);
  });
});
