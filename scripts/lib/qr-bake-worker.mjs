import { parentPort, workerData } from "node:worker_threads";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const QRCodeStyling = require("qr-code-styling");
const { JSDOM } = require("jsdom");
const nodeCanvas = require(workerData.canvasModule);

parentPort.on("message", async ({ id, options }) => {
  const windows = [];
  class RenderDOM extends JSDOM {
    constructor(...args) {
      super(...args);
      windows.push(this.window);
    }
  }
  try {
    const qr = new QRCodeStyling({ ...options, jsdom: RenderDOM, nodeCanvas });
    const svg = await qr.getRawData("svg");
    parentPort.postMessage({ id, svg: svg.toString("utf8") });
  } catch (error) {
    parentPort.postMessage({ id, error: error.message });
  } finally {
    for (const window of windows) window.close();
  }
});
