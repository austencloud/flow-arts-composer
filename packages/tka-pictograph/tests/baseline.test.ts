import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { fsArtSource, renderPictographSvg } from "../src/index.js";
import { baselineSvg, cases } from "./cases.js";

const assets = fileURLToPath(new URL("../assets/", import.meta.url));

describe("renderPictographSvg matches the knowledge server's renderer before the move", async () => {
  const art = await fsArtSource(assets);
  it.each(cases)("$name", async ({ name, input, prop }) => {
    const svg = await renderPictographSvg(input, {
      art,
      darkMode: true,
      showTKA: true,
      leftPropType: prop,
      rightPropType: prop,
    });
    expect(svg).toBe(baselineSvg(name));
  });
});
