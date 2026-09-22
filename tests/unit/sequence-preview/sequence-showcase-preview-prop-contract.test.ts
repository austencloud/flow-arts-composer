import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(
    process.cwd(),
    "src/lib/shared/sequence-preview/components/SequenceShowcasePreview.svelte"
  ),
  "utf8"
);

describe("SequenceShowcasePreview card-art prop contract", () => {
  it("feeds the resting card art (PropAwareThumbnail) the same resolved colors as the live player, never the viewer's Settings", () => {
    // playerPropColors is already the caller-override-else-creator's-look
    // resolution (a caller-supplied primaryPropColors prop wins; otherwise
    // viewingPresentation.primaryPropColors). The card-art PropAwareThumbnail
    // used to omit primaryPropColors entirely, which made IT fall back to
    // getSettings().primaryPropColors — leaking the viewer's palette onto the
    // creator's resting card art while the live player showed the correct
    // colors. Passing playerPropColors explicitly keeps both layers in sync.
    expect(source).toContain(
      "const playerPropColors = $derived(\n    primaryPropColors !== undefined\n      ? primaryPropColors\n      : viewingPresentation.primaryPropColors\n  );"
    );
    expect(source).toMatch(
      /<PropAwareThumbnail\s+\{sequence\}\s+leftPropType=\{cardPropConfig\.leftPropType\}\s+rightPropType=\{cardPropConfig\.rightPropType\}\s+catDogModeEnabled=\{cardPropConfig\.catDogMode\}\s+primaryPropColors=\{playerPropColors\}\s+eager\s+\{allowQR\}\s*\/>/
    );
  });

  it("resolves the card's props in the player's fallback order (caller, recording, viewer Settings), never a staff default", () => {
    expect(source).toMatch(
      /const cardPropConfig = \$derived\(\s*resolveShowcasePropPair\(\{\s*leftPropType,\s*rightPropType,\s*recorded: recordedPropConfig,\s*viewer: captureActivePropConfig\(getSettings\(\)\),\s*\}\)\s*\);/
    );
  });
});
