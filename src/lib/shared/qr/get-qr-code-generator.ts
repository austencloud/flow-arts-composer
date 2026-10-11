import { browser } from "$app/env";
import { QRCodeGenerator } from "./services/qr-code-generator";
import { getShortCodeManager } from "./get-short-code-manager";

let instance: QRCodeGenerator | null = null;
let urlInstance: QRCodeGenerator | null = null;

/** Published links only: no account, cloud warm, or short-code creation. */
export function getUrlQRCodeGenerator(): QRCodeGenerator {
  if (!browser) throw new Error("getUrlQRCodeGenerator() is browser-only");
  return (urlInstance ??= new QRCodeGenerator());
}

export function getQRCodeGenerator(): QRCodeGenerator {
  if (!browser) throw new Error("getQRCodeGenerator() is browser-only");
  return (instance ??= new QRCodeGenerator(getShortCodeManager()));
}
