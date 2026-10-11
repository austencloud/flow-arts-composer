import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { HandSide } from "#lib/shared/pictograph/shared/domain/enums/pictograph-enums.js";
import { PropType } from "#lib/shared/pictograph/prop/domain/enums/prop-type.js";
import {
  applyTorchContrastPalette,
  isTorchProp,
  TORCH_CONTRAST_PALETTE,
  TORCH_FLAME_OUTLINE,
} from "#lib/shared/pictograph/prop/domain/torch-contrast.js";
import { contrastRatio } from "#lib/shared/settings/utils/background-theme-calculator.js";
import { applyMotionColorToSvg } from "#lib/shared/utils/svg-color-utils.js";
import { getPropDimensions } from "#lib/shared/animation-engine/services/IPropTextureLoader.js";
import { generatePropSvg } from "#lib/shared/animation-engine/services/svg-generator.js";

const readProp = (family: "pictograph" | "animated", filename: string) =>
  readFileSync(
    resolve(process.cwd(), "static", "images", "props", family, filename),
    "utf8"
  );

const handColor = (svg: string, color: HandSide, themeMode: "dark" | "light") =>
  applyMotionColorToSvg(svg, color, {
    makeClassNamesUnique: true,
    selectiveColorMode: true,
    themeMode,
  });

const viewBoxOf = (svg: string) =>
  (svg.match(/viewBox="([^"]+)"/)?.[1] ?? "")
    .trim()
    .split(/\s+/)
    .map(Number);

const frameTranslate = (svg: string) =>
  (
    svg.match(
      /data-torch-contrast-frame="true" transform="translate\(([^)]+)\)"/
    )?.[1] ?? ""
  )
    .trim()
    .split(/\s+/)
    .map(Number);

describe("torch contrast contract", () => {
  it.each([PropType.TORCH, PropType.BIGTORCH])(
    "targets %s props",
    (propType) => {
      expect(isTorchProp(propType)).toBe(true);
    }
  );

  it("does not target unrelated props", () => {
    expect(isTorchProp(PropType.STAFF)).toBe(false);
    expect(isTorchProp(undefined)).toBe(false);
  });

  it.each(["dark", "light"] as const)(
    "keeps the %s shaft and metal above WCAG 2.2's 3:1 target",
    (mode) => {
      const colors = TORCH_CONTRAST_PALETTE[mode];
      expect(
        contrastRatio(colors.shaft, colors.background)
      ).toBeGreaterThanOrEqual(3);
      expect(
        contrastRatio(colors.metal, colors.background)
      ).toBeGreaterThanOrEqual(3);
    }
  );

  it("keeps the original flame colors discernible across real grid points", () => {
    expect(
      contrastRatio(
        TORCH_CONTRAST_PALETTE.dark.flame,
        TORCH_CONTRAST_PALETTE.dark.background
      )
    ).toBeGreaterThanOrEqual(3);
    expect(
      contrastRatio(TORCH_FLAME_OUTLINE, "#d0d0d0")
    ).toBeGreaterThanOrEqual(3);
    expect(
      contrastRatio(TORCH_CONTRAST_PALETTE.light.flame, "#000000")
    ).toBeGreaterThanOrEqual(3);
    expect(
      contrastRatio(TORCH_FLAME_OUTLINE, TORCH_CONTRAST_PALETTE.light.background)
    ).toBeGreaterThanOrEqual(3);
  });

  it("replaces the wick with the flame in both themes", () => {
    expect(TORCH_CONTRAST_PALETTE.dark.wick).toBe("none");
    expect(TORCH_CONTRAST_PALETTE.light.wick).toBe("none");
  });

  it("returns non-torch artwork byte-identical", () => {
    const original = '<path data-torch-shaft="true" style="fill:#231F20;" />';

    expect(applyTorchContrastPalette(original, PropType.STAFF, "dark")).toBe(
      original
    );
    expect(applyTorchContrastPalette(original, undefined, "dark")).toBe(
      original
    );
  });

  it.each([
    [PropType.TORCH, "torch.svg", HandSide.LEFT, 1],
    [PropType.TORCH, "torch.svg", HandSide.RIGHT, 1],
    [PropType.BIGTORCH, "bigtorch.svg", HandSide.LEFT, 3],
    [PropType.BIGTORCH, "bigtorch.svg", HandSide.RIGHT, 3],
  ])(
    "marks and recolors the real %s (%s) geometry for the %s hand",
    (propType, filename, color, shaftPartCount) => {
      const original = readProp("pictograph", filename);

      expect(original.match(/data-torch-shaft="true"/g)).toHaveLength(
        shaftPartCount
      );
      expect(original.match(/data-torch-metal="true"/g)).toHaveLength(1);
      expect(original.match(/data-torch-wick="true"/g)).toHaveLength(1);

      const treated = applyTorchContrastPalette(
        handColor(original, color, "dark"),
        propType,
        "dark"
      );

      expect(
        treated.match(new RegExp(`fill:${TORCH_CONTRAST_PALETTE.dark.shaft}`, "g"))
      ).toHaveLength(shaftPartCount);
      expect(
        treated.match(new RegExp(`fill:${TORCH_CONTRAST_PALETTE.dark.metal}`, "g"))
      ).toHaveLength(1);
      const wickTag = treated.match(
        /<[^>]+\sdata-torch-wick=(?:"[^"]*"|'[^']*')[^>]*>/i
      )?.[0];
      expect(wickTag).toContain(`fill:${TORCH_CONTRAST_PALETTE.dark.wick}`);
      expect(treated.match(/data-torch-flame="true"/g)).toHaveLength(1);
      expect(treated.match(/data-torch-flame-part=/g)).toHaveLength(2);
      expect(treated).toContain(`fill="${TORCH_CONTRAST_PALETTE.dark.flame}"`);
      expect(treated).toContain(
        `data-torch-flame-size="${propType === PropType.BIGTORCH ? "big" : "standard"}"`
      );
    }
  );

  it.each([
    [PropType.TORCH, "torch.svg"],
    [PropType.BIGTORCH, "bigtorch.svg"],
  ])("hides the %s wick behind the flame", (propType, filename) => {
    const original = handColor(
      readProp("pictograph", filename),
      HandSide.LEFT,
      "light"
    );
    const treated = applyTorchContrastPalette(original, propType, "light");
    const wickTag = treated.match(
      /<[^>]+\sdata-torch-wick=(?:"[^"]*"|'[^']*')[^>]*>/i
    )?.[0];

    expect(wickTag).toContain(`fill:${TORCH_CONTRAST_PALETTE.light.wick}`);
  });

  // The raster path behind a choreo card draws each prop into exactly its own
  // viewBox, so a flame reaching past the authored box would be clipped off the
  // card. The box grows symmetrically and the content shifts by the same margin,
  // because both render paths rotate the prop about (width / 2, height / 2).
  it.each([
    [PropType.TORCH, "torch.svg"],
    [PropType.BIGTORCH, "bigtorch.svg"],
  ])("grows the %s box around the flame", (propType, filename) => {
    const original = handColor(
      readProp("pictograph", filename),
      HandSide.LEFT,
      "dark"
    );
    const [sourceMinX, sourceMinY, sourceWidth, sourceHeight] =
      viewBoxOf(original);
    const treated = applyTorchContrastPalette(original, propType, "dark");
    const [minX, minY, width, height] = viewBoxOf(treated);
    const [padX, padY] = frameTranslate(treated);

    expect(minX).toBe(sourceMinX);
    expect(minY).toBe(sourceMinY);
    expect(width - sourceWidth).toBeCloseTo(padX * 2, 6);
    expect(height - sourceHeight).toBeCloseTo(padY * 2, 6);

    const flame = treated.match(
      /data-torch-flame="true"[\s\S]*?transform="translate\((-?[\d.]+) (-?[\d.]+)\) rotate\(90\) scale\(([\d.]+)\)/
    );
    expect(flame).not.toBeNull();
    const baseX = Number(flame?.[1]);
    const centerY = Number(flame?.[2]);
    const scale = Number(flame?.[3]);

    // rotate(90) lays the flame's authored height along +x and its width along y.
    expect(padX + baseX).toBeGreaterThanOrEqual(minX);
    expect(padX + baseX + 125 * scale).toBeLessThanOrEqual(minX + width);
    expect(padY + centerY - 48.77 * scale).toBeGreaterThanOrEqual(minY);
    expect(padY + centerY + 48.77 * scale).toBeLessThanOrEqual(minY + height);
  });

  it("drops the root width and height so the grown box governs", () => {
    const treated = applyTorchContrastPalette(
      '<svg viewBox="0 0 300 15.5" width="300" height="15.5"><path data-torch-shaft="true" /></svg>',
      PropType.TORCH,
      "dark"
    );
    const root = treated.match(/<svg\b[^>]*>/)?.[0] ?? "";

    expect(root).not.toMatch(/\swidth=/);
    expect(root).not.toMatch(/\sheight=/);
  });

  it("replaces an existing flame instead of duplicating it", () => {
    const original = '<path data-torch-wick="true" fill="#F6E5B6" />';
    const firstPass = applyTorchContrastPalette(
      original,
      PropType.TORCH,
      "dark"
    );
    const secondPass = applyTorchContrastPalette(
      firstPass,
      PropType.TORCH,
      "light"
    );

    expect(secondPass.match(/data-torch-flame="true"/g)).toHaveLength(1);
    expect(secondPass).toContain(
      `fill="${TORCH_CONTRAST_PALETTE.light.flame}"`
    );
  });

  it.each([
    [
      PropType.TORCH,
      "torch.svg",
      -30,
      -10.1,
      360,
      35.7,
      284.4,
      7.75,
      0.36,
      150,
      7.75,
    ],
    [
      PropType.BIGTORCH,
      "bigtorch.svg",
      -38.5,
      -12.35,
      402,
      57.3,
      290.4,
      16.3,
      0.53,
      162.5,
      16.3,
    ],
  ])(
    "replaces the %s wick with an unclipped two-tone flame in animation assets",
    (
      propType,
      filename,
      minX,
      minY,
      width,
      height,
      baseX,
      centerY,
      scale,
      pivotX,
      pivotY
    ) => {
      const original = readProp("animated", filename);
      const handColored = handColor(original, HandSide.LEFT, "dark");
      const wickTag = handColored.match(
        /<[^>]+\sdata-animated-torch-wick=(?:"[^"]*"|'[^']*')[^>]*>/i
      )?.[0];

      expect(wickTag).toContain("fill:none");
      expect(wickTag).toContain("stroke:none");
      expect(
        handColored.match(/data-animated-torch-flame="true"/g)
      ).toHaveLength(1);
      expect(
        handColored.match(/data-animated-torch-flame-part=/g)
      ).toHaveLength(2);
      expect(handColored).toContain('fill="#F2673A"');
      expect(handColored).toContain('fill="#F4EA02"');
      expect(handColored).toContain(
        `transform="translate(${baseX} ${centerY}) rotate(90) scale(${scale}) translate(-48.77 -125)"`
      );
      expect(original).toContain(`viewBox="${minX} ${minY} ${width} ${height}"`);

      const maxX = minX + width;
      const maxY = minY + height;
      expect(baseX + 125 * scale).toBeLessThanOrEqual(maxX);
      expect(centerY - 48.77 * scale).toBeGreaterThanOrEqual(minY);
      expect(centerY + 48.77 * scale).toBeLessThanOrEqual(maxY);

      // The expanded artwork stays centered on the original hand pivot.
      expect(minX + width / 2).toBeCloseTo(pivotX);
      expect(minY + height / 2).toBeCloseTo(pivotY);
    }
  );

  it.each([
    [PropType.TORCH, "torch.svg", 2],
    [PropType.BIGTORCH, "bigtorch.svg", 3],
  ])(
    "uses a light %s shaft in dark animation and a black shaft in light animation",
    async (propType, filename, shaftPartCount) => {
      const original = readProp("animated", filename);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          text: async () => original,
        }))
      );

      try {
        const dark = await generatePropSvg(propType, "#3575E2", "dark");
        const light = await generatePropSvg(propType, "#3D44B8", "light");
        const markedTagPattern =
          /<[^>]+\sdata-animated-torch-shaft=(?:"[^"]*"|'[^']*')[^>]*>/gi;
        const darkShaftParts = dark.svg.match(markedTagPattern) ?? [];
        const lightShaftParts = light.svg.match(markedTagPattern) ?? [];

        expect(darkShaftParts).toHaveLength(shaftPartCount);
        expect(lightShaftParts).toHaveLength(shaftPartCount);
        expect(
          darkShaftParts.every((tag) =>
            tag.includes(`fill:${TORCH_CONTRAST_PALETTE.dark.shaft}`)
          )
        ).toBe(true);
        expect(
          lightShaftParts.every((tag) =>
            tag.includes(`fill:${TORCH_CONTRAST_PALETTE.light.shaft}`)
          )
        ).toBe(true);
      } finally {
        vi.unstubAllGlobals();
      }
    }
  );

  it("uses the expanded flame-safe bounds before animated textures finish loading", () => {
    expect(getPropDimensions("torch")).toEqual({ width: 360, height: 35.7 });
    expect(getPropDimensions("bigtorch")).toEqual({
      width: 402,
      height: 57.3,
    });
  });
});
