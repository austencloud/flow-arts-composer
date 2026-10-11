import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, expect, it } from "vitest";
import { expectNoA11yViolations } from "#test-helpers/component-a11y.js";
import LetterTypeGuide from "./LetterTypeGuide.svelte";

const TYPE_EXPLANATIONS = [
  ["Type 1", "Both hands shift."],
  ["Type 2", "One hand shifts. The other stays in place."],
  ["Type 3", "One hand shifts. The other dashes."],
  ["Type 4", "One hand dashes. The other stays in place."],
  ["Type 5", "Both hands dash."],
  ["Type 6", "Both hands stay in place. The props can still rotate."],
] as const;

describe("LetterTypeGuide", () => {
  it("keeps the six canonical explanations together in one accessible guide", async () => {
    render(LetterTypeGuide);

    await expect
      .element(page.getByRole("heading", { name: "Letter types" }))
      .toBeVisible();

    for (const [typeName, explanation] of TYPE_EXPLANATIONS) {
      await expect
        .element(page.getByText(typeName, { exact: true }))
        .toBeVisible();
      await expect.element(page.getByText(explanation)).toBeVisible();
    }

    expect(document.querySelectorAll(".type-card")).toHaveLength(6);
    expect(document.querySelectorAll(".type-palette")).toHaveLength(6);
    await expectNoA11yViolations();
  });
});
