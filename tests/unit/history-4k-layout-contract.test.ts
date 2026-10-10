import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), "utf8");

describe("notation 4K layout lab artifacts", () => {
  it("renders the TKA specimen through the real pictograph primitive", () => {
    const source = read(
      "src/routes/test/notation-4k/_components/NotationRosetta.svelte"
    );
    expect(source).toContain(
      'import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte"'
    );
    expect(source).toContain("<PictographContainer");
    expect(source).toContain('aria-label="A two by two grid');
    expect(source).not.toContain("kinetic-alphabet-letter-a.webp");
  });

  it("keeps all 144 Shape Matrix pairings and names both axes", () => {
    const source = read(
      "src/routes/test/notation-4k/_components/NotationShapeMatrix.svelte"
    );
    expect(source).toContain("Array.from({ length: 144 })");
    expect(source).toContain("Left-hand driving styles (12)");
    expect(source).toContain("Right-hand driving styles (12)");
    expect(source).toContain("as _, i (i)");
  });

  it("composes one real live player with real rendered beats", () => {
    const source = read(
      "src/routes/test/notation-4k/_components/NotationSequenceStage.svelte"
    );
    expect(source).toContain(
      'import SequenceHeroDemo from "#lib/shared/landing/components/SequenceHeroDemo.svelte"'
    );
    expect(source).toContain(
      'import PictographContainer from "#lib/shared/pictograph/shared/components/PictographContainer.svelte"'
    );
    expect(source.match(/<SequenceHeroDemo\b/g)).toHaveLength(1);
    expect(source).toContain("{#each sequence.steps as step, index (step.id)}");
    expect(source).not.toMatch(/\{#if\s+layoutMode/);
  });

  it("switches composition on one shared content tree", () => {
    const source = read(
      "src/routes/test/notation-4k/_components/NotationLayoutStudy.svelte"
    );
    expect(source).toContain("data-layout={layoutMode}");
    expect(source.match(/<NotationRosetta\b/g)).toHaveLength(1);
    expect(source.match(/<NotationShapeMatrix\b/g)).toHaveLength(1);
    expect(source.match(/<NotationSequenceStage\b/g)).toHaveLength(1);
    expect(source).not.toMatch(/\{#if\s+layoutMode/);
    expect(source).toContain("@container notation-study (min-width: 96rem)");
    expect(source).toContain('[data-layout="atlas"]');
    expect(source).toContain('[data-layout="cinematic"]');
  });

  it("uses native chrome and controls without duplicating the study", () => {
    const source = read("src/routes/test/notation-4k/+page.svelte");
    expect(source).toContain(
      'import MarketingChrome from "#lib/shared/landing/components/MarketingChrome.svelte"'
    );
    expect(source).toContain(
      'import SegmentedControl from "#lib/shared/ui/components/SegmentedControl.svelte"'
    );
    expect(source.match(/<NotationLayoutStudy\b/g)).toHaveLength(1);
    expect(source).toContain('let layoutMode = $state<LayoutMode>("atlas")');
    expect(source).toContain('content="noindex, nofollow"');
    expect(source).toContain("value={layoutMode}");
  });
});
