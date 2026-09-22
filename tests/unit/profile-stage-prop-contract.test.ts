import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const artifactTile = readFileSync(
  resolve(
    process.cwd(),
    "src/lib/features/creators/components/profile/stage/ArtifactTile.svelte"
  ),
  "utf8"
);

describe("profile stage sequence prop contract", () => {
  it("resolves the sequence prop pair recorded -> settings -> staff, and feeds the SAME pair to both the mandala floor and the animation player", () => {
    // Precedence: the creator's own recorded prop pair wins on their own
    // stage; the visitor's settings are only a fallback for legacy records
    // with nothing recorded, and "staff" is the last-resort default.
    expect(artifactTile).toContain(
      'import { settingsService } from "$lib/shared/settings/state/settings-state.svelte";'
    );
    expect(artifactTile).toContain(
      'import { resolveRecordedPropConfig } from "$lib/shared/foundation/services/recorded-prop-intent";'
    );
    expect(artifactTile).toContain("resolveRecordedPropConfig(sequence)");
    expect(artifactTile).toMatch(
      /left:\s*\n?\s*recordedPropConfig\?\.leftPropType\s*\?\?\s*\n?\s*settingsService\.settings\.leftPropType\s*\?\?\s*\n?\s*"staff"/
    );
    expect(artifactTile).toMatch(
      /right:\s*\n?\s*recordedPropConfig\?\.rightPropType\s*\?\?\s*\n?\s*settingsService\.settings\.rightPropType\s*\?\?\s*\n?\s*"staff"/
    );

    // The mandala floor (the still layer) and the InlineAnimationPlayer (the
    // live layer) are two different renderers sharing one box — they only
    // read as the same motion if they're handed the exact same resolved pair.
    expect(artifactTile).toContain("leftPropType={seqPropTypes.left}");
    expect(artifactTile).toContain("rightPropType={seqPropTypes.right}");
    expect(artifactTile).toMatch(
      /InlineAnimationPlayer\.svelte"[\s\S]{0,500}leftPropType: seqPropTypes\.left,[\s\S]{0,100}rightPropType: seqPropTypes\.right/
    );

    // Same rule for color: an undefined primaryPropColors makes either layer
    // fall back to the viewer's Settings, so both get the creator's look.
    expect(artifactTile).toContain(
      "primaryPropColors={viewingPresentation.primaryPropColors}"
    );
    expect(artifactTile).toContain(
      "primaryPropColors: viewingPresentation.primaryPropColors,"
    );

    // ArtifactTile must go through the resolver, never read the raw
    // creatorIntent field itself — resolveRecordedPropConfig is what owns
    // parsing and validating it (recorded-prop-intent.ts).
    expect(artifactTile).not.toContain("creatorIntent?.propConfig");
  });

  it("passes the resolved creator colors to the hover-card overlay's PropAwareThumbnail, never the viewer's Settings", () => {
    // The hover overlay used to call PropAwareThumbnail with no color prop,
    // which made it fall back to getSettings().primaryPropColors — leaking
    // the VIEWER's palette onto the CREATOR's card art. Explicitly passing
    // viewingPresentation.primaryPropColors (undefined = legacy, null =
    // theme default, object = the creator's pair) closes that leak.
    expect(artifactTile).toMatch(
      /<PropAwareThumbnail\s+\{sequence\}\s+\{lightMode\}\s+leftPropType=\{seqPropTypes\.left as PropType\}\s+rightPropType=\{seqPropTypes\.right as PropType\}\s+primaryPropColors=\{viewingPresentation\.primaryPropColors\}\s*\/>/
    );
  });
});
