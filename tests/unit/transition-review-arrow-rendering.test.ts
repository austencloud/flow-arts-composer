import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { arrowLifecycleManager } from "$lib/shared/pictograph/arrow/orchestration/services/arrow-lifecycle-manager";
import { pictographPreparer } from "$lib/shared/pictograph/shared/services/pictograph-preparer";
import { TRANSITION_REVIEW_SEQUENCE } from "../../src/routes/test/sequence-viewer-transitions/transition-review-fixture";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const staticDir = path.join(projectRoot, "static");
const realFetch = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  if (url.startsWith("/")) {
    const relativePath = url.split("?")[0]!.replace(/^\//, "");
    const filePath = path.join(staticDir, relativePath);
    if (!fs.existsSync(filePath)) {
      return new Response("not found", { status: 404 });
    }
    const body = fs.readFileSync(filePath, "utf-8");
    const contentType = filePath.endsWith(".json")
      ? "application/json"
      : "image/svg+xml";
    return new Response(body, {
      status: 200,
      headers: { "content-type": contentType },
    });
  }
  return realFetch(input, init);
}) as typeof fetch;

describe("sequence-viewer transition review arrows", () => {
  beforeAll(() => {
    pictographPreparer.clearCache();
  });

  afterAll(() => {
    globalThis.fetch = realFetch;
  });

  it("prepares both canonical arrows for every review pictograph", async () => {
    const pictographs = [
      TRANSITION_REVIEW_SEQUENCE.startPlacement,
      ...TRANSITION_REVIEW_SEQUENCE.steps,
    ];

    for (const pictograph of pictographs) {
      const result = await arrowLifecycleManager.coordinateArrowLifecycle(
        pictograph!,
        { themeMode: "dark", gridMode: "diamond" }
      );

      expect(result.errors, `${pictograph!.letter} arrow errors`).toEqual({});
      expect(
        Object.keys(result.assets),
        `${pictograph!.letter} arrow assets`
      ).toEqual(expect.arrayContaining(["left", "right"]));
      expect(
        Object.keys(result.positions),
        `${pictograph!.letter} arrow positions`
      ).toEqual(expect.arrayContaining(["left", "right"]));
    }
  });
});
