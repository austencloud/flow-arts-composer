import { describe, expect, it } from "vitest";
import {
  loadRules,
  scanPatch,
  scanTree,
} from "../../../scripts/private-check.mjs";

const rules = loadRules();

function patch(file: string, lines: string[], deleted = false): string {
  return [
    "@@commit 0123456789abcdef0123456789abcdef01234567",
    `diff --git a/${file} b/${file}`,
    deleted ? `--- a/${file}` : "--- /dev/null",
    deleted ? "+++ /dev/null" : `+++ b/${file}`,
    "@@ -0,0 +1 @@",
    ...lines.map((l) => (deleted ? `-${l}` : `+${l}`)),
  ].join("\n");
}

describe("private-check", () => {
  it("refuses a private bridge's files and the private folder", () => {
    for (const file of [
      "src/lib/features/poi/services/ignis/ignis-codec.ts",
      "src/lib/features/poi/services/lighttoys/lighttoys-show.ts",
      "src/lib/features/poi/flowtoys-packet.ts",
      "src/lib/private/bridges/usb-props/DevicePanel.svelte",
      "docs/research/poi-recon/all-strings.txt",
    ])
      expect(scanPatch(rules, patch(file, ["x"])), file).not.toHaveLength(0);
  });

  it("refuses lines that describe the protocols", () => {
    for (const line of [
      "// Ignis frames start with a TLV header",
      "the Lighttoys protocol keeps four banks",
      "const FLOWTOYS_MODES = [];",
      "decoded from the Pixel Utility",
    ])
      expect(
        scanPatch(rules, patch("docs/notes.md", [line])),
        line
      ).not.toHaveLength(0);
  });

  it("lets brand credits and look-alike words through", () => {
    for (const line of [
      "<title>Lighttoys Moon LED fan</title>",
      'sourceUrl: "https://flowtoys.com/flowgeng",',
      "über wichtige Administratorereignisse benachrichtigen",
    ])
      expect(
        scanPatch(rules, patch("src/lib/x.ts", [line])),
        line
      ).toHaveLength(0);
  });

  it("lets a private file be deleted", () => {
    expect(
      scanPatch(
        rules,
        patch("docs/reference/ignis-protocol.md", ["# Ignis"], true)
      )
    ).toHaveLength(0);
  });

  it("finds nothing private in the committed tree", () => {
    expect(scanTree(rules, "HEAD")).toEqual([]);
  });
});
