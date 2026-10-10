// @vitest-environment jsdom

/** The Create previews' wait for app.html's boot screen to start leaving. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { runAfterBootScreen } from "#lib/features/create/shared/components/method-previews/after-boot-screen.js";

// vitest-setup.ts stubs document.createElement; the screen must be a real node.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;

let screen: HTMLElement | null = null;

/** The boot screen as app.html ships it, covering the page. */
function addBootScreen(): HTMLElement {
  const element = realCreateElement.call(document, "div") as HTMLElement;
  element.id = "app-loading";
  document.body.append(element);
  screen = element;
  return element;
}

/** MutationObserver callbacks run as a microtask. */
async function settle(): Promise<void> {
  await Promise.resolve();
}

afterEach(() => {
  screen?.remove();
  screen = null;
});

describe("runAfterBootScreen", () => {
  it("runs at once when the page has no boot screen", () => {
    const go = vi.fn();
    runAfterBootScreen(go);
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("runs at once when the boot screen is already hidden with display none", () => {
    addBootScreen().style.display = "none";
    const go = vi.fn();
    runAfterBootScreen(go);
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("runs at once when the boot screen has already started to leave", () => {
    addBootScreen().classList.add("loaded");
    const go = vi.fn();
    runAfterBootScreen(go);
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("waits while the boot screen covers the page, then runs once it starts to leave", async () => {
    const element = addBootScreen();
    const go = vi.fn();
    runAfterBootScreen(go);
    await settle();
    expect(go).not.toHaveBeenCalled();

    element.classList.add("loaded");
    await settle();
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("runs once the boot screen is hidden with display none", async () => {
    const element = addBootScreen();
    const go = vi.fn();
    runAfterBootScreen(go);

    element.style.display = "none";
    await settle();
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("runs once the boot screen is removed", async () => {
    const element = addBootScreen();
    const go = vi.fn();
    runAfterBootScreen(go);
    await settle();
    expect(go).not.toHaveBeenCalled();

    element.remove();
    await settle();
    expect(go).toHaveBeenCalledTimes(1);
  });

  it("never runs when cancelled before the boot screen leaves", async () => {
    const element = addBootScreen();
    const go = vi.fn();
    const cancel = runAfterBootScreen(go);

    cancel();
    element.classList.add("loaded");
    await settle();
    element.remove();
    await settle();
    expect(go).not.toHaveBeenCalled();
  });

  it("does not run again on a later change after it has run", async () => {
    const element = addBootScreen();
    const go = vi.fn();
    runAfterBootScreen(go);

    element.classList.add("loaded");
    await settle();
    expect(go).toHaveBeenCalledTimes(1);

    element.classList.remove("loaded");
    element.classList.add("loaded");
    element.style.display = "none";
    await settle();
    element.remove();
    await settle();
    expect(go).toHaveBeenCalledTimes(1);
  });
});
