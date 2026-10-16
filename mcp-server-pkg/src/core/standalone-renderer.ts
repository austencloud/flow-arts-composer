/**
 * The knowledge server's pictograph renderer: @austencloud/tka-pictograph
 * draws the SVG from the art in assets/, and this adds PNG output.
 */
import { Resvg } from "@resvg/resvg-js";
import { createCanvas, loadImage } from "@napi-rs/canvas/node-canvas.js";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { drawHandColorKey } from "@tka/render-core";
import {
  fsArtSource,
  handColor,
  PICTOGRAPH_VIEWBOX,
  renderPictographSvg,
  type ArtSource,
  type PictographInput,
  type RenderVisibilityOptions,
} from "../../../packages/tka-pictograph/src/render.js";
import { ensureGelasioRegistered } from "./gelasio-fonts.js";

export type {
  MotionInput,
  PictographInput,
  RenderVisibilityOptions,
} from "../../../packages/tka-pictograph/src/render.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export class StandaloneRenderer {
  private readonly assetsRoot: string;
  private art: Promise<ArtSource> | null = null;

  constructor() {
    // Bundled: dist/index.js sits one level below the package root.
    // From source (tsx): src/core sits two levels below it.
    const packageRoot = __dirname.includes("dist")
      ? join(__dirname, "..")
      : join(__dirname, "../..");
    this.assetsRoot = join(packageRoot, "assets");
  }

  async renderToSvg(
    input: PictographInput,
    options: RenderVisibilityOptions = {}
  ): Promise<string> {
    this.art ??= fsArtSource(this.assetsRoot);
    return renderPictographSvg(input, { ...options, art: await this.art });
  }

  async renderToPng(
    input: PictographInput,
    options: RenderVisibilityOptions = {}
  ): Promise<Buffer> {
    const svg = await this.renderToSvg(input, {
      ...options,
      // Canvas supplies the key below because Resvg cannot rasterize bundled WOFF2 text.
      showHandColorKey: false,
    });
    const size = options.size || PICTOGRAPH_VIEWBOX;
    const png = this.svgToPng(svg, size);
    return options.showHandColorKey
      ? this.drawHandColorKeyOnPng(png, size, input, options)
      : png;
  }

  async renderToBase64(
    input: PictographInput,
    options: RenderVisibilityOptions = {}
  ): Promise<string> {
    const png = await this.renderToPng(input, options);
    return png.toString("base64");
  }

  /** Draw the complete key with bundled Gelasio after Resvg draws every other glyph. */
  private async drawHandColorKeyOnPng(
    png: Buffer,
    size: number,
    input: PictographInput,
    options: RenderVisibilityOptions
  ): Promise<Buffer> {
    ensureGelasioRegistered();
    const canvas = createCanvas(size, size);
    const context = canvas.getContext("2d");
    context.drawImage(await loadImage(png), 0, 0, size, size);

    const scale = size / PICTOGRAPH_VIEWBOX;
    const darkMode = options.darkMode !== false;
    drawHandColorKey(context, {
      showLeft: (options.showLeftMotion ?? true) && !!input.leftMotion,
      showRight: (options.showRightMotion ?? true) && !!input.rightMotion,
      scale,
      centerX: (PICTOGRAPH_VIEWBOX / 2) * scale,
      textColor: darkMode ? "#ffffff" : "#231f20",
      colorForHand: (hand) => handColor(hand, darkMode, options.primaryPropColors),
    });
    return canvas.toBuffer("image/png");
  }

  private svgToPng(svg: string, size: number): Buffer {
    const resvg = new Resvg(svg, {
      fitTo: { mode: "width", value: size },
      font: { loadSystemFonts: true },
    });
    return Buffer.from(resvg.render().asPng());
  }
}

let rendererInstance: StandaloneRenderer | null = null;

export function getStandaloneRenderer(): StandaloneRenderer {
  rendererInstance ??= new StandaloneRenderer();
  return rendererInstance;
}
