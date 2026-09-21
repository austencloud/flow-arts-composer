import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { describe, expect, it, vi } from "vitest";
import type { ComponentProps } from "svelte";
import TnDPanel from "./TnDPanel.svelte";

type Props = ComponentProps<typeof TnDPanel>;

function props(overrides: Partial<Props> = {}): Props {
  return {
    handRelationship: "free",
    propRelationship: "free",
    matchHandTurns: false,
    level: 2,
    onHandRelationshipChange: vi.fn(),
    onPropRelationshipChange: vi.fn(),
    onMatchHandTurnsChange: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

function group(container: HTMLElement, label: string): HTMLElement {
  const element = container.querySelector<HTMLElement>(
    `[role="radiogroup"][aria-label="${label}"]`
  );
  expect(element, `${label} group should render`).not.toBeNull();
  return element!;
}

describe("TnDPanel", () => {
  it("renders the title, two grids and the Free chips", () => {
    const { container } = render(TnDPanel, props({ titleId: "tnd-title" }));

    const title = container.querySelector("#tnd-title");
    expect(title?.textContent?.trim()).toBe("Timing and direction");
    group(container, "Hand timing and direction");
    group(container, "Prop timing and direction");
    expect(
      container.querySelectorAll('button[aria-label="Free hands"]').length
    ).toBe(1);
    expect(
      container.querySelectorAll('button[aria-label="Free props"]').length
    ).toBe(1);
  });

  it("presses Free when a section is free and the mode when it is set", () => {
    const { container } = render(
      TnDPanel,
      props({ handRelationship: "TO", propRelationship: "free" })
    );

    const freeHands = container.querySelector(
      'button[aria-label="Free hands"]'
    );
    const freeProps = container.querySelector(
      'button[aria-label="Free props"]'
    );
    expect(freeHands?.getAttribute("aria-pressed")).toBe("false");
    expect(freeProps?.getAttribute("aria-pressed")).toBe("true");
    expect(
      group(container, "Hand timing and direction")
        .querySelector('button[aria-label^="Together Opposite"]')
        ?.getAttribute("aria-pressed")
    ).toBe("true");
    expect(
      group(container, "Prop timing and direction").querySelectorAll(
        'button[aria-pressed="true"]'
      ).length
    ).toBe(0);
  });

  it("reports hand and prop picks and Free", async () => {
    const onHandRelationshipChange = vi.fn();
    const onPropRelationshipChange = vi.fn();
    render(
      TnDPanel,
      props({
        handRelationship: "TS",
        propRelationship: "QO",
        onHandRelationshipChange,
        onPropRelationshipChange,
      })
    );

    await page.getByRole("button", { name: "Free hands" }).click();
    expect(onHandRelationshipChange).toHaveBeenCalledWith("free");

    await page
      .getByRole("radiogroup", { name: "Prop timing and direction" })
      .getByRole("button", { name: /Split Same/ })
      .click();
    expect(onPropRelationshipChange).toHaveBeenCalledWith("SS");
  });

  it("disables blocked hand modes with the reason", () => {
    const { container } = render(
      TnDPanel,
      props({
        blockedHandModes: { QS: "Not compatible with a Reflection LOOP" },
      })
    );

    const qs = group(
      container,
      "Hand timing and direction"
    ).querySelector<HTMLButtonElement>('button[aria-label^="Quarter Same"]');
    expect(qs?.disabled).toBe(true);
    expect(qs?.title).toBe("Not compatible with a Reflection LOOP");
    const propQs = group(
      container,
      "Prop timing and direction"
    ).querySelector<HTMLButtonElement>('button[aria-label^="Quarter Same"]');
    expect(propQs?.disabled).toBe(false);
  });

  it("Match turns toggles at level 2 and is off at level 1", async () => {
    const onMatchHandTurnsChange = vi.fn();
    const { container, unmount } = render(
      TnDPanel,
      props({ level: 2, onMatchHandTurnsChange })
    );

    const chip = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Match turns"]'
    );
    expect(chip?.disabled).toBe(false);
    expect(chip?.getAttribute("aria-pressed")).toBe("false");
    await page.getByRole("button", { name: "Match turns" }).click();
    expect(onMatchHandTurnsChange).toHaveBeenCalledWith(true);
    unmount();

    const level1 = render(TnDPanel, props({ level: 1 }));
    const chip1 = level1.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Match turns"]'
    );
    expect(chip1?.disabled).toBe(true);
    expect(level1.container.textContent).toContain(
      "Level 1 has no turns to match."
    );
  });

  it("Match turns is forced on while a prop timing is set", () => {
    const { container } = render(
      TnDPanel,
      props({ level: 3, propRelationship: "TS", matchHandTurns: false })
    );

    const chip = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Match turns"]'
    );
    expect(chip?.disabled).toBe(true);
    expect(chip?.getAttribute("aria-pressed")).toBe("true");
    expect(container.textContent).toContain(
      "A prop timing needs equal turns, so turns stay matched."
    );
  });
});
