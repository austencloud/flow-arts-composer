import { cardParityCases } from "../card-parity-cases";
import { renderComposerCard } from "../render-composer-card";

async function asPng(canvas: HTMLCanvasElement | OffscreenCanvas) {
  const blob =
    "convertToBlob" in canvas
      ? await canvas.convertToBlob()
      : await new Promise<Blob>((resolve) =>
          canvas.toBlob((blob) => resolve(blob!))
        );
  return new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

async function runComparison() {
  try {
    for (const testCase of cardParityCases()) {
      const canvas = await renderComposerCard(testCase);
      const png = await asPng(canvas);
      const response = await fetch("/compare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: testCase.name, png }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Comparison failed");
      for (const comparison of result.comparisons) {
        const section = document.createElement("section");
        const title = document.createElement("h2");
        title.textContent =
          testCase.name +
          " / " +
          comparison.adapter +
          ": " +
          comparison.diffPercent +
          "% pixels differ";
        section.append(title);
        const images = document.createElement("div");
        images.className = "images";
        for (const [label, source] of [
          ["Composer", png],
          ["MCP", comparison.mcp],
          ["Difference", comparison.diff],
        ]) {
          const figure = document.createElement("figure");
          const caption = document.createElement("figcaption");
          caption.textContent = label;
          const image = document.createElement("img");
          image.src = source;
          figure.append(caption, image);
          images.append(figure);
        }
        section.append(images);
        document.querySelector("#results")!.append(section);
      }
    }
    const badgeCase = cardParityCases().find(
      (testCase) => testCase.name === "composer-light"
    )!;
    const withoutBadge = await asPng(
      await renderComposerCard(badgeCase, { hideBadge: true })
    );
    const negative = await fetch("/negative-control", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: badgeCase.name, png: withoutBadge }),
    });
    if (!negative.ok) throw new Error(await negative.text());
    const complete = await fetch("/complete", { method: "POST" });
    if (!complete.ok) throw new Error(await complete.text());
    document.querySelector("#status")!.textContent =
      "Parity passed for both MCP adapters; missing-badge negative control passed";
  } catch (error) {
    document.querySelector("#status")!.textContent = String(error);
    await fetch("/failed", { method: "POST", body: String(error) });
  }
}
void runComparison();
