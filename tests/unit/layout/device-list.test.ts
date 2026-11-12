import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The device list lives in two places: the table on the law page, which
// people read, and scripts/layout/device-list.json, which the screen sweep
// reads. A size changed in one and not the other would make the sweep test
// the wrong screens without anyone noticing.
const root = process.cwd();
const LAW = "docs/architecture/layout-law.md";
const DATA = "scripts/layout/device-list.json";

type Device = { name: string; width: number; height: number };

function tableFromLaw(markdown: string): Device[] {
  const section = markdown.split(/^## Device list\s*$/m)[1];
  if (!section) throw new Error(`no "## Device list" section in ${LAW}`);
  const body = section.split(/^## /m)[0];
  const rows: Device[] = [];
  for (const line of body.split(/\r?\n/)) {
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.length !== 2) continue;
    const size = /^(\d+)\s*[×x]\s*(\d+)$/.exec(cells[1]);
    if (!size) continue; // header and divider rows
    rows.push({
      name: cells[0],
      width: Number(size[1]),
      height: Number(size[2]),
    });
  }
  return rows;
}

describe("device list", () => {
  it("the data file matches the table on the law page, row for row", () => {
    const law = tableFromLaw(readFileSync(path.join(root, LAW), "utf8"));
    const data = JSON.parse(readFileSync(path.join(root, DATA), "utf8"))
      .devices as Device[];
    expect(law.length).toBeGreaterThan(0);
    expect(data).toEqual(law);
  });
});
