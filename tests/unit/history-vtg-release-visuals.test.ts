import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { archiveEntry } from "../../src/routes/(public)/history/_components/archive/_lib/archive-ledger";
import { archiveSections } from "../../src/routes/(public)/history/_components/archive/_lib/archive-sections";
import {
  VTG_RELEASE_VISUALS,
  vtgReleaseVisual,
} from "../../src/routes/(public)/history/_components/archive/_lib/vtg-release-visuals";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

describe("VTG release imagery", () => {
  it("maps every release to its own visual instead of falling back to VTG 1", () => {
    const sections = archiveSections(archiveEntry("vtg"));
    expect(VTG_RELEASE_VISUALS.map(({ id }) => id)).toEqual(
      sections.map(({ id }) => id)
    );
    expect(
      sections
        .filter(({ id }) => vtgReleaseVisual(id).kind === "chapters")
        .map(({ id }) => id)
    ).toEqual(["VTG 1"]);
    expect(() => vtgReleaseVisual("unknown release")).toThrow();
    const paths = VTG_RELEASE_VISUALS.flatMap(({ images }) =>
      images.map(({ src }) => src)
    );
    expect(new Set(paths).size).toBe(paths.length);
    for (const release of VTG_RELEASE_VISUALS) {
      if (release.kind !== "chapters")
        expect(release.images.length).toBeGreaterThan(0);
      for (const image of release.images) {
        const bytes = readFileSync(
          path.join(repoRoot, "static", image.src.replace(/^\//, ""))
        );
        expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
        expect(bytes.subarray(8, 12).toString()).toBe("WEBP");
        expect(new URL(image.href).protocol).toBe("https:");
      }
    }
  });

  it("keeps the original grids, Book of P.H.A.T. and software captures distinct", () => {
    const grid = vtgReleaseVisual("VTG 3: grid and document · 2019");
    expect(grid.images.map(({ label }) => label)).toEqual([
      "1:1",
      "1:3",
      "1:5",
    ]);
    for (const image of grid.images)
      expect(image.href).toContain("11jlw3ezJ4aSzH5zwlaM5_2mtOYy4U3WX");
    const phat = vtgReleaseVisual("Book of P.H.A.T. Volume 1");
    expect(phat.images).toHaveLength(2);
    expect(phat.images[1]?.href).toMatch(/bop-manual-small\.pdf#page=32$/);
    expect(vtgReleaseVisual("VTG 3: phone and web apps").images[0]?.href).toBe(
      "https://vtg-v3.web.app/"
    );
    expect(vtgReleaseVisual("VTG 4 / SpiroAnim · 2026").images[0]?.href).toBe(
      "https://spiroanim.com/app"
    );
  });
});
