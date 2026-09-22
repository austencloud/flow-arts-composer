<!--
  /test/qr-play-button

  Auth-free preview of the "Scan to play" QR treatment: the center play-button
  badge (from the shared generator's playIconDataUrl + qr-code-styling image
  options, errorCorrectionLevel H) and the printed-card caption cell (mirroring
  image-composer's renderQRCode caption math). No Firestore — uses a sample URL —
  so it renders without a signed-in session. The real card render lives at
  /test/card-back-parity, which needs auth for released decks.
-->
<script lang="ts">
  import { onMount } from "svelte";
  import QRCodeStyling from "qr-code-styling";
  import { playIconDataUrl } from "$lib/shared/qr/services/qr-code-generator";

  const SAMPLE_URL = "https://tka.run/DEMO12";

  let lightHost: HTMLDivElement;
  let darkHost: HTMLDivElement;
  let cellNoneCanvas: HTMLCanvasElement;

  // The exact image/imageOptions/EC block createQROptions now produces: green
  // triangle, badge matched to the card (derived inside playIconDataUrl).
  function makeQr(moduleColor: string, bg: string): QRCodeStyling {
    return new QRCodeStyling({
      width: 360,
      height: 360,
      type: "svg",
      data: SAMPLE_URL,
      margin: 1,
      image: playIconDataUrl(moduleColor),
      imageOptions: { imageSize: 0.25, margin: 3, hideBackgroundDots: true, crossOrigin: "anonymous" },
      qrOptions: { typeNumber: 0, mode: "Byte", errorCorrectionLevel: "H" },
      dotsOptions: { color: moduleColor, type: "rounded" },
      cornersSquareOptions: { color: moduleColor, type: "extra-rounded" },
      cornersDotOptions: { color: moduleColor, type: "dot" },
      backgroundOptions: { color: bg },
    });
  }

  async function qrImage(moduleColor: string, bg: string): Promise<HTMLImageElement> {
    const qr = makeQr(moduleColor, bg);
    const blob = (await qr.getRawData("svg")) as Blob;
    const svgText = await blob.text();
    const img = new Image();
    img.src = `data:image/svg+xml;base64,${btoa(svgText)}`;
    await img.decode();
    return img;
  }

  // Final treatment: no caption, QR centered in the cell — mirrors the centered
  // Start pictograph in the neighbouring cell. Largest square minus side margins.
  async function drawCellNoCaption(c: HTMLCanvasElement) {
    const stepSize = 360;
    c.width = stepSize;
    c.height = stepSize;
    const ctx = c.getContext("2d")!;
    const sideMargin = Math.round(stepSize * 0.055);
    const qrSize = Math.floor(stepSize - 2 * sideMargin);
    const img = await qrImage("#1a1a2e", "#ffffff");
    const xy = Math.floor((stepSize - qrSize) / 2);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, stepSize, stepSize);
    ctx.drawImage(img, xy, xy, qrSize, qrSize);
  }

  onMount(async () => {
    makeQr("#1a1a2e", "#ffffff").append(lightHost);
    makeQr("#ffffff", "#0b1020").append(darkHost);
    await drawCellNoCaption(cellNoneCanvas);
  });
</script>

<svelte:head><title>QR Play Button Preview</title></svelte:head>

<div class="wrap">
  <h1>Scan to Play — QR treatment preview</h1>
  <p>Sample URL <code>{SAMPLE_URL}</code> · error correction H · play badge from the shared generator. Scannable.</p>

  <div class="row">
    <figure>
      <div class="qr" bind:this={lightHost}></div>
      <figcaption>Light card (dark modules)</figcaption>
    </figure>
    <figure>
      <div class="qr dark" bind:this={darkHost}></div>
      <figcaption>Dark card (white modules)</figcaption>
    </figure>
  </div>

  <h2>Printed card cell (light card, as composed)</h2>
  <figure class="cell">
    <canvas bind:this={cellNoneCanvas}></canvas>
    <figcaption>No caption, QR centered — mirrors renderQRCode</figcaption>
  </figure>
</div>

<style>
  .wrap { padding: 2rem; max-width: 920px; margin: 0 auto; font-family: Inter, system-ui, sans-serif; color: #e7e9ee; }
  h1 { font-size: 1.4rem; } h2 { font-size: 1.1rem; margin-top: 2rem; }
  code { background: #1a1f2e; padding: 0.1em 0.4em; border-radius: 4px; }
  .row { display: flex; gap: 2rem; flex-wrap: wrap; margin-top: 1rem; }
  figure { margin: 0; }
  .qr { width: 360px; height: 360px; background: #fff; border-radius: 12px; padding: 8px; }
  .qr.dark { background: #0b1020; }
  figcaption { margin-top: 0.5rem; font-size: 0.85rem; opacity: 0.75; text-align: center; }
  .cell canvas { border-radius: 12px; }
</style>
