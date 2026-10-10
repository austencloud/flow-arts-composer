import { PrintCardRenderer } from "./services/PrintCardRenderer";
import { getImageComposer } from "#lib/shared/render/get-image-composer.js";
import { getQRCodeGenerator } from "#lib/shared/qr/get-qr-code-generator.js";

let instance: PrintCardRenderer | null = null;
export function getPrintCardRenderer(): PrintCardRenderer {
  // Deferred app bootstrap can finish after the first cards render. Wire the
  // generator before any print starts so early fronts never cache an empty QR.
  getImageComposer().setQRCodeGenerator(getQRCodeGenerator());
  return (instance ??= new PrintCardRenderer(getImageComposer()));
}
