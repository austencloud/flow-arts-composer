import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, expect, it, vi } from "vitest";
import { createFuseRule } from "../domain/fuse-rule";
import type { FuseState } from "../state/fuse-state.svelte";
import FuseRelationshipComposerTestHarness from "./FuseRelationshipComposerTestHarness.svelte";

function relationshipState(): FuseState {
  return {
    mode: "symmetry",
    driverSide: "left",
    rule: createFuseRule({ reflect: "mirror" }),
    isLoadingLength: false,
    pendingSide: null,
    isFusing: false,
    tndSelection: {
      mode: "TO",
      quarterOffset: "cw",
      invert: false,
      rewind: false,
    },
    tndCheck: null,
    ruleAdjusted: false,
    previewSequence: null,
    setMode: vi.fn(),
    setRelationship: vi.fn(),
    previewRelationship: vi.fn().mockResolvedValue(undefined),
    cancelRelationshipPreview: vi.fn(),
  } as unknown as FuseState;
}

describe("FuseRelationshipComposer", () => {
  it("does not preview the relationship that is already applied", () => {
    const state = relationshipState();
    render(FuseRelationshipComposerTestHarness, { state });

    expect(state.previewRelationship).not.toHaveBeenCalled();
  });

  it("offers six modes and no rotation dial or reflect chips", async () => {
    const state = relationshipState();
    render(FuseRelationshipComposerTestHarness, { state });

    for (const name of [
      /^Together Same/,
      /^Together Opposite/,
      /^Split Same/,
      /^Split Opposite/,
      /^Quarter Same/,
      /^Quarter Opposite/,
    ]) {
      await expect.element(page.getByRole("button", { name })).toBeVisible();
    }
    await expect
      .element(page.getByRole("radio", { name: "90° clockwise" }))
      .not.toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: /^Mirror/ }))
      .not.toBeInTheDocument();
    await expect
      .element(page.getByRole("button", { name: /^Flip/ }))
      .not.toBeInTheDocument();
  });

  it("rebuilds the follower as soon as a mode is picked", async () => {
    const state = relationshipState();
    render(FuseRelationshipComposerTestHarness, { state });

    await page.getByRole("button", { name: /^Split Same/ }).click();

    const splitSame = createFuseRule({ rotationSteps: 4, reflect: "none" });
    expect(state.previewRelationship).toHaveBeenLastCalledWith(
      "left",
      splitSame
    );

    await page.getByRole("button", { name: "Use this relationship" }).click();
    expect(state.setRelationship).toHaveBeenCalledWith("left", splitSame);

    await page.getByRole("button", { name: "Cancel" }).click();
    expect(state.cancelRelationshipPreview).toHaveBeenCalled();
  });

  it("shows the offset pair only for quarter modes", async () => {
    const state = relationshipState();
    render(FuseRelationshipComposerTestHarness, { state });

    await expect
      .element(page.getByRole("button", { name: "Quarter clockwise" }))
      .not.toBeInTheDocument();

    await page.getByRole("button", { name: /^Quarter Opposite/ }).click();
    await expect
      .element(page.getByRole("button", { name: "Quarter clockwise" }))
      .toBeVisible();

    await page
      .getByRole("button", { name: "Quarter counterclockwise" })
      .click();
    expect(state.previewRelationship).toHaveBeenLastCalledWith(
      "left",
      createFuseRule({ rotationSteps: 6, reflect: "mirror" })
    );
  });

  it("keeps invert and rewind independent of the mode", async () => {
    const state = relationshipState();
    render(FuseRelationshipComposerTestHarness, { state });

    await page.getByRole("button", { name: /^Split Opposite/ }).click();
    await page.getByRole("button", { name: /^Invert/ }).click();

    expect(state.previewRelationship).toHaveBeenLastCalledWith(
      "left",
      createFuseRule({ rotationSteps: 0, reflect: "flip", invert: true })
    );
  });

  it("leads the result with the mode name", async () => {
    const state = relationshipState();
    render(FuseRelationshipComposerTestHarness, { state });

    await expect.element(page.getByText("Together, opposite")).toBeVisible();
  });
});
