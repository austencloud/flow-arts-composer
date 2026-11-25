import { render } from "vitest-browser-svelte";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { decodeSequenceWithCompression } from "#lib/shared/navigation/services/sequence-encoder.js";

import StepGrid from "./StepGrid.svelte";
import WordLabel from "./WordLabel.svelte";

/**
 * Arabic turns the page right to left. A sequence keeps its own direction:
 * the steps, the word that names them and the text drawn inside a picture
 * read left to right in every language.
 */

const ABC = decodeSequenceWithCompression(
  "d1:y8wMDq4pzi_OrzCwysvPA1JAXnlqMoiXmphsUFOempdfamCVmlgMpGpAgkAeRAkA"
);

let host: HTMLDivElement;

beforeEach(() => {
  document.documentElement.dir = "rtl";
  host = document.createElement("div");
  host.style.cssText = "width:360px;height:240px;display:flex";
  document.body.append(host);
});

afterEach(() => {
  host.remove();
  document.documentElement.removeAttribute("dir");
});

const leftEdges = (selector: string) =>
  Array.from(
    host.querySelectorAll(selector),
    (element) => element.getBoundingClientRect().left
  );

const ascending = (values: number[]) =>
  values.every((value, index) => index === 0 || value > values[index - 1]!);

async function drawGrid(isTimelineMode: boolean) {
  render(StepGrid, {
    target: host,
    props: {
      steps: [...ABC.steps],
      startPlacement: ABC.startPlacement ?? null,
      isTimelineMode,
      manualColumnCount: 3,
    },
  });
  await expect
    .poll(
      () => host.querySelectorAll(".grid-surface [data-step-number]").length
    )
    .toBeGreaterThanOrEqual(ABC.steps.length);
}

describe.each([
  ["the grid", false],
  ["the timeline", true],
])("%s in a right-to-left language", (_name, isTimelineMode) => {
  it("puts the start first, then the steps to its right", async () => {
    await drawGrid(isTimelineMode);

    const start = leftEdges(".grid-surface [data-history-start-placement]")[0]!;
    const steps = Array.from(
      host.querySelectorAll<HTMLElement>(".grid-surface [data-step-number]")
    )
      .map((element) => ({
        number: Number(element.dataset.stepNumber),
        left: element.getBoundingClientRect().left,
        top: element.getBoundingClientRect().top,
      }))
      .filter((step) => step.number >= 1)
      .sort((a, b) => a.number - b.number);
    const firstRow = steps.filter(
      (step) => Math.abs(step.top - steps[0]!.top) < 2
    );

    expect(firstRow.length).toBeGreaterThan(1);
    expect(ascending([start, ...firstRow.map((step) => step.left)])).toBe(true);
  });

  it("keeps each step's number inside its picture", async () => {
    await drawGrid(isTimelineMode);
    await expect
      .poll(() => host.querySelectorAll(".beat-number").length, {
        timeout: 10000,
      })
      .toBeGreaterThanOrEqual(ABC.steps.length);

    for (const number of host.querySelectorAll(".beat-number")) {
      const text = number.getBoundingClientRect();
      const picture = number.closest("svg")!.getBoundingClientRect();
      expect(text.left).toBeGreaterThanOrEqual(picture.left);
      expect(text.right).toBeLessThanOrEqual(picture.right);
    }
  });
});

describe("the word in a right-to-left language", () => {
  it("spells itself left to right, with the menu arrow after it", async () => {
    render(WordLabel, { target: host, props: { word: "JD" } });
    await expect
      .poll(() => host.querySelectorAll(".word-fit-row .letter").length)
      .toBe(2);

    const letters = Array.from(
      host.querySelectorAll(".word-fit-row .letter"),
      (letter) => letter.textContent?.trim()
    );
    expect(letters).toEqual(["J", "D"]);
    expect(
      ascending([
        ...leftEdges(".word-fit-row .letter"),
        ...leftEdges(".word-fit-row .menu-indicator"),
      ])
    ).toBe(true);
  });
});
