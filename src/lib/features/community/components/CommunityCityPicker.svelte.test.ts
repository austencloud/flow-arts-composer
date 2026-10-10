import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { beforeEach, describe, expect, it, vi } from "vitest";

import CommunityCityPicker from "./CommunityCityPicker.svelte";
import type { CitySuggestion } from "../domain/canonical-city";
import { expectNoA11yViolations } from "#test-helpers/component-a11y.js";

// Hoisted: the picker imports the service at module load, which happens before
// ordinary top-level consts in this file are initialized.
const { search, reset, canonicalize } = vi.hoisted(() => ({
  search: vi.fn(),
  reset: vi.fn(),
  canonicalize: vi.fn(),
}));

vi.mock("../services/places-city-search", () => ({
  createPlacesCitySearch: () => ({ search, reset }),
}));

function suggestion(id: string, city: string, region: string): CitySuggestion {
  return { id, city, region, canonicalize };
}

const CITIES = [
  suggestion("chi", "Chicago", "IL, USA"),
  suggestion("chn", "Chandler", "AZ, USA"),
];

/** The combobox debounces by 300ms; anything past this has definitely run. */
const PAST_DEBOUNCE = 450;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface PickerProps {
  apiKey: string;
  onPick: (suggestion: CitySuggestion) => void;
  onCancel: () => void;
  busy?: boolean;
}

function mount(overrides: Partial<PickerProps> = {}) {
  const props: PickerProps = {
    apiKey: "test-key",
    onPick: vi.fn(),
    onCancel: vi.fn(),
    ...overrides,
  };
  return render(CommunityCityPicker, props);
}

function input(): HTMLInputElement {
  const element = document.querySelector<HTMLInputElement>(
    'input[name="community-city-query"]',
  );
  if (!element) throw new Error("city input is not rendered");
  return element;
}

/** Types the way an ordinary keyboard does — no IME flags. */
function type(text: string): void {
  const element = input();
  element.focus();
  element.value = text;
  element.dispatchEvent(new InputEvent("input", { bubbles: true }));
}

function key(name: string): void {
  input().dispatchEvent(
    new KeyboardEvent("keydown", { key: name, bubbles: true }),
  );
}

const firstOption = () => page.getByRole("option").first();

beforeEach(() => {
  vi.clearAllMocks();
  search.mockResolvedValue(CITIES);
});

describe("CommunityCityPicker", () => {
  it("hands the picked suggestion up unresolved, once, from the keyboard alone", async () => {
    const onPick = vi.fn();
    await mount({ onPick });

    type("chi");
    await expect.element(firstOption()).toBeVisible();

    key("ArrowDown");
    key("Enter");

    expect(onPick).toHaveBeenCalledTimes(1);
    const [firstPick] = onPick.mock.calls;
    if (!firstPick) throw new Error("the picker never reported a selection");
    expect(firstPick[0].id).toBe("chi");
    // Resolution belongs to the state machine that owns the write. A picker
    // that canonicalized here would spend the billing session on a selection
    // its caller may still discard.
    expect(canonicalize).not.toHaveBeenCalled();
  });

  it("tracks the active option in aria-activedescendant", async () => {
    await mount();

    type("chi");
    await expect.element(firstOption()).toBeVisible();
    expect(input().getAttribute("aria-expanded")).toBe("true");
    expect(input().getAttribute("aria-activedescendant")).toBeNull();

    // The attribute is derived, so it lands on the next flush rather than
    // inside the keydown handler.
    key("ArrowDown");
    let first = "";
    await vi.waitFor(() => {
      first = input().getAttribute("aria-activedescendant") ?? "";
      expect(first).toBeTruthy();
    });
    expect(document.getElementById(first)?.getAttribute("role")).toBe("option");

    key("ArrowDown");
    await vi.waitFor(() =>
      expect(input().getAttribute("aria-activedescendant")).not.toBe(first),
    );
  });

  it("shows the Google Maps mark with the predictions, not behind them", async () => {
    await mount();

    type("chi");
    await expect.element(firstOption()).toBeVisible();

    // Scoped to the results panel on purpose: the picker's own footer carries
    // the same mark for the closed-list case, and the panel is drawn over that
    // row, so finding it there would prove nothing about the open state.
    const panel = document
      .querySelector('[role="listbox"]')
      ?.closest(".search-results");
    expect(panel, "the results panel is not rendered").toBeTruthy();

    const mark = panel!.querySelector('[translate="no"]');
    expect(mark, "the results panel carries no attribution").toBeTruthy();
    expect(mark!.textContent?.trim()).toBe("Google Maps");

    // Rendered is not the same as seen. The mark has to occupy real space
    // inside the panel's own box, not sit under it at zero size.
    const markBox = mark!.getBoundingClientRect();
    const panelBox = panel!.getBoundingClientRect();
    expect(markBox.width).toBeGreaterThan(0);
    expect(markBox.height).toBeGreaterThan(0);
    expect(markBox.top).toBeGreaterThanOrEqual(panelBox.top - 1);
    expect(markBox.bottom).toBeLessThanOrEqual(panelBox.bottom + 1);
  });

  it("issues no request for half-composed IME text", async () => {
    await mount();

    const element = input();
    element.focus();
    element.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true }),
    );
    element.value = "ｋｙ";
    element.dispatchEvent(
      new InputEvent("input", { bubbles: true, isComposing: true }),
    );

    await wait(PAST_DEBOUNCE);
    expect(search).not.toHaveBeenCalled();

    element.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "京都" }),
    );
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(1));
  });

  it("cancels on Escape once the list is closed, and never picks", async () => {
    const onCancel = vi.fn();
    const onPick = vi.fn();
    await mount({ onCancel, onPick });

    type("chi");
    await expect.element(firstOption()).toBeVisible();

    // The first Escape belongs to the list; the picker must not close under it.
    key("Escape");
    await vi.waitFor(() =>
      expect(input().getAttribute("aria-expanded")).toBe("false"),
    );
    expect(onCancel).not.toHaveBeenCalled();

    key("Escape");
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onPick).not.toHaveBeenCalled();
  });

  it("stops accepting input while a write is in flight", async () => {
    await mount({ busy: true });

    expect(input().disabled).toBe(true);
  });

  it("ends the billing session when it unmounts", async () => {
    const screen = await mount();

    type("chi");
    await expect.element(firstOption()).toBeVisible();

    await screen.unmount();
    expect(reset).toHaveBeenCalled();
  });

  it("has no AAA a11y violations with predictions open", async () => {
    await mount();

    type("chi");
    await expect.element(firstOption()).toBeVisible();

    await expectNoA11yViolations();
  });
});
