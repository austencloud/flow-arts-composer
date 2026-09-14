/**
 * Card QR rendering for Node.
 *
 * Uses the same qr-code-styling library and the shared style owner the
 * Composer uses, driven through jsdom, so the MCP card carries a QR that is
 * module-for-module the one the app prints. qr-code-styling and jsdom are
 * optional peers: without them the QR slot stays empty and a warning is
 * logged once.
 */
import { Resvg } from "@resvg/resvg-js";
import { loadImage } from "@napi-rs/canvas/node-canvas.js";
import {
  MODERN_QR_STYLE,
  PRINT_QR_RENDER_SIZE,
  applyDarkQrStyle,
  calculateQrCellGeometry,
  createStyledQrOptions,
  paintQrCell,
} from "@tka/render-composition";

type QrRuntime = {
  QRCodeStyling: new (options: Record<string, unknown>) => {
    getRawData(extension: "svg"): Promise<Buffer | Blob | null>;
  };
  JSDOM: typeof import("jsdom").JSDOM;
  nodeCanvas: typeof import("@napi-rs/canvas/node-canvas.js");
};

let runtime: Promise<QrRuntime | null> | undefined;

async function loadQrRuntime(): Promise<QrRuntime | null> {
  return (runtime ??= (async () => {
    try {
      const [styling, jsdom, nodeCanvas] = await Promise.all([
        import("qr-code-styling"),
        import("jsdom"),
        import("@napi-rs/canvas/node-canvas.js"),
      ]);
      return {
        QRCodeStyling: styling.default as unknown as QrRuntime["QRCodeStyling"],
        JSDOM: jsdom.JSDOM,
        nodeCanvas,
      };
    } catch (error) {
      console.warn(
        "[tka-mcp] QR rendering needs qr-code-styling and jsdom; the QR cell stays empty.",
        error instanceof Error ? error.message : error
      );
      return null;
    }
  })());
}

/** The styled QR as SVG markup, or null when the Node runtime is unavailable. */
export async function renderStyledQrSvg(
  url: string,
  size: number,
  darkMode: boolean
): Promise<string | null> {
  const loaded = await loadQrRuntime();
  if (!loaded) return null;
  const { JSDOM } = loaded;
  const windows: { close(): void }[] = [];
  class RenderDOM extends JSDOM {
    constructor(...args: ConstructorParameters<typeof JSDOM>) {
      super(...args);
      windows.push(this.window);
    }
  }
  try {
    const style = darkMode ? applyDarkQrStyle(MODERN_QR_STYLE) : MODERN_QR_STYLE;
    const qr = new loaded.QRCodeStyling({
      ...createStyledQrOptions(url, size, 1, style, "play"),
      jsdom: RenderDOM,
      nodeCanvas: loaded.nodeCanvas,
    });
    const raw = await qr.getRawData("svg");
    if (!raw) return null;
    const svg = raw instanceof Blob ? await raw.text() : raw.toString("utf8");
    // qr-code-styling writes clip-path="url('#id')"; resvg ignores the quoted
    // form and would paint every module rect solid, so unquote the references.
    return svg.replace(/url\('#([^')]+)'\)/g, "url(#$1)");
  } finally {
    for (const window of windows) window.close();
  }
}

/** Paint the card QR into its reserved cell, matching the Composer's cell fill. */
export async function renderCardQrCode(
  ctx: CanvasRenderingContext2D,
  cell: { x: number; y: number; cellSize: number },
  url: string,
  darkMode: boolean
): Promise<void> {
  const { qrSize } = calculateQrCellGeometry(cell.cellSize);
  // Author at the Composer's print size, then scale into the cell like drawImage.
  const svg = await renderStyledQrSvg(url, PRINT_QR_RENDER_SIZE, darkMode);
  if (!svg) return;
  const png = Buffer.from(
    new Resvg(svg, { fitTo: { mode: "width", value: qrSize } })
      .render()
      .asPng()
  );
  const image = await loadImage(png);
  paintQrCell(ctx, image as unknown as CanvasImageSource, cell, darkMode);
}
