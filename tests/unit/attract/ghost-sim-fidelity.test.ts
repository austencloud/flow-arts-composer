// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createSimApp } from "./sim/app-model";

describe("ghost simulator fidelity", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("renders one real transport configuration and moves its current step", () => {
    const app = createSimApp(
      (items) => items[0]!,
      () => 0
    );
    app.state.blockerUp = false;
    app.state.seqLen = 4;
    app.render();

    const controls = [
      ...document.querySelectorAll<HTMLElement>('[data-ghost-kind="step-nav"]'),
    ];
    expect(controls.map((control) => control.dataset.ghostLabel)).toEqual([
      "Previous step",
      "Next step",
    ]);
    expect((controls[0] as HTMLButtonElement).disabled).toBe(true);
    expect((controls[1] as HTMLButtonElement).disabled).toBe(false);

    const next = controls.find(
      (control) => control.dataset.ghostLabel === "Next step"
    );
    expect(next).toBeDefined();
    app.press(next!);
    expect(
      (app.state as typeof app.state & { currentStep: number }).currentStep
    ).toBe(1);
  });

  it("undo restores the exact sequence mutation immediately before it", () => {
    const app = createSimApp(
      (items) => items[0]!,
      () => 0
    );
    app.state.blockerUp = false;
    app.state.seqLen = 4;
    app.state.actionsPanelOpen = true;
    app.render();

    const transform = document.querySelector<HTMLElement>(
      '[data-ghost-kind="transform"]'
    );
    expect(transform).not.toBeNull();
    app.press(transform!);
    expect(app.state.word).not.toBe("");

    const undo = document.querySelector<HTMLElement>(
      '[data-ghost-kind="undo"]'
    );
    expect(undo).not.toBeNull();
    app.press(undo!);

    expect(app.state.seqLen).toBe(4);
    expect(app.state.word).toBe("");
  });

  it("clear starts a genuinely new sequence", () => {
    const app = createSimApp(
      (items) => items[0]!,
      () => 0
    );
    app.state.blockerUp = false;
    app.state.seqLen = 4;
    app.state.word = "***'''";
    app.render();

    app.press(
      document.querySelector<HTMLElement>('[data-ghost-kind="clear"]')!
    );
    app.press(
      document.querySelector<HTMLElement>('[data-ghost-kind="confirm"]')!
    );

    expect(app.state.seqLen).toBe(0);
    expect(app.state.word).toBe("");
  });
});
