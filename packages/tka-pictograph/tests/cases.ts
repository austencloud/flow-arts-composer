import { readFileSync } from "node:fs";

import type { PictographInput } from "../src/index.js";

export const baselineDir = new URL("./baseline/", import.meta.url);

/** The pictographs captured from the knowledge server's renderer before the move. */
export const cases: { name: string; input: PictographInput; prop: string }[] = JSON.parse(
  readFileSync(new URL("cases.json", baselineDir), "utf-8")
);

export const baselineSvg = (name: string) => readFileSync(new URL(`${name}.svg`, baselineDir), "utf-8");
