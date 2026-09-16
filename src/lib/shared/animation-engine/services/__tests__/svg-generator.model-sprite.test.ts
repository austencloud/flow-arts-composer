import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROP_MODEL_SPRITES } from "$lib/shared/pictograph/prop/domain/prop-model-sprites.generated";
import { generatePropSvg, orientModelSpriteToTips } from "../svg-generator";

function fakeSprite(width: number, height: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}"><defs><style>.a{fill:#123}</style></defs><path class="a" d="M0 0h${width / 2}v${height}H0z"/></svg>`;
}

/**
 * Model captures are grip-centred but several one-sided props were captured
 * facing -x while every tip table (and the notation glyph) puts the business
 * end at +x. The animation canvas drew them as captured, so flames, trails
 * and the mandala sat behind the hand on those looks.
 */
describe("model sprite orientation", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        const match = /model\/([a-z_0-9]+)-(blue|red)\.svg/.exec(input);
        const entry = match ? PROP_MODEL_SPRITES[match[1]!] : undefined;
        if (!entry) return new Response("", { status: 404 });
        return new Response(fakeSprite(entry.width, entry.height), {
          status: 200,
        });
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rotates a capture that faces away from its tips about the box centre", () => {
    const svg = orientModelSpriteToTips("club", fakeSprite(258.67, 34.17));
    expect(svg).toContain('transform="rotate(180 129.335 17.085)"');
    expect(svg).toMatch(/<svg[^>]*>\s*<g transform="rotate\(180 [^"]+\)">/);
    expect(svg).toMatch(/<\/g>\s*<\/svg>\s*$/);
  });

  it("leaves a bilateral capture alone", () => {
    const source = fakeSprite(252.8, 77.8);
    expect(orientModelSpriteToTips("staff", source)).toBe(source);
  });

  it("draws the club model sprite facing its tip", async () => {
    const club = await generatePropSvg("club__model", "#2e3192");
    expect(club.svg).toContain("rotate(180 129.335 17.085)");
    expect(club.width).toBe(258.67);

    const staff = await generatePropSvg("staff__model", "#2e3192");
    expect(staff.svg).not.toContain("rotate(180");
  });
});
