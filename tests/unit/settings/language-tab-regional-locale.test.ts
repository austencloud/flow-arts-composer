// @vitest-environment jsdom

import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLocale, setLocale } from "$lib/shared/i18n/i18n.svelte.js";

vi.mock("$lib/shared/application/get-haptic-feedback", () => ({
  getHapticFeedback: () => ({ trigger: vi.fn() }),
}));

const { default: LanguageTab } =
  await import("$lib/shared/settings/components/tabs/LanguageTab.svelte");

// vitest-setup.ts swaps document.createElement for canvas stubs that are not
// DOM nodes. Mounting a component needs jsdom's own, from document's prototype.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;

function languageCards(host: HTMLElement): HTMLButtonElement[] {
  return [...host.querySelectorAll<HTMLButtonElement>(".language-card")];
}

function cardNamed(host: HTMLElement, nativeName: string): HTMLButtonElement {
  const card = languageCards(host).find(
    (candidate) =>
      candidate.querySelector(".native-name")?.textContent?.trim() ===
      nativeName
  );
  if (!card) throw new Error(`No language card for ${nativeName}`);
  return card;
}

// The list offers plain languages only. Someone who saved Mexican Spanish must
// still see Español marked as theirs, and tapping it must not quietly swap
// their regional formats (12-hour clock) for plain Spanish ones.
describe("Language tab with Mexican Spanish in use", () => {
  let host: HTMLElement;
  let component: ReturnType<typeof mount> | null = null;
  let stubbedCreateElement: typeof document.createElement;

  beforeEach(async () => {
    stubbedCreateElement = document.createElement;
    document.createElement = realCreateElement.bind(document);
    host = document.createElement("div");
    document.body.append(host);
    await setLocale("es-MX");
    component = mount(LanguageTab, { target: host });
    flushSync();
  });

  afterEach(async () => {
    if (component) unmount(component);
    component = null;
    host.remove();
    document.createElement = stubbedCreateElement;
    await setLocale("en");
    document.cookie = "PARAGLIDE_LOCALE=; path=/; max-age=0";
  });

  it("marks Español as the language in use", () => {
    const pressed = languageCards(host).filter(
      (card) => card.getAttribute("aria-pressed") === "true"
    );
    expect(pressed).toEqual([cardNamed(host, "Español")]);
  });

  it("keeps Mexican Spanish when Español is tapped again", async () => {
    cardNamed(host, "Español").click();
    await new Promise((resolve) => setTimeout(resolve));
    expect(getLocale()).toBe("es-MX");
  });
});
