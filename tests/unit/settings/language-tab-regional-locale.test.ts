// @vitest-environment jsdom

import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getLocale, setLocale } from "$lib/shared/i18n/i18n.svelte.js";

vi.mock("$lib/shared/application/get-haptic-feedback", () => ({
  getHapticFeedback: () => ({ trigger: vi.fn() }),
}));

const { default: LanguagePreference } =
  await import("$lib/shared/settings/components/tabs/preferences/LanguagePreference.svelte");

// vitest-setup.ts swaps document.createElement for canvas stubs that are not
// DOM nodes. Mounting a component needs jsdom's own, from document's prototype.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;

function languageOptions(host: HTMLElement): HTMLButtonElement[] {
  return [
    ...host.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'),
  ];
}

function optionNamed(host: HTMLElement, nativeName: string): HTMLButtonElement {
  const option = languageOptions(host).find(
    (candidate) =>
      candidate.querySelector(".overflow-item-label")?.textContent?.trim() ===
      nativeName
  );
  if (!option) throw new Error(`No language option for ${nativeName}`);
  return option;
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
    component = mount(LanguagePreference, { target: host });
    flushSync();
    host.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!.click();
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
    const selected = languageOptions(host).filter(
      (option) => option.getAttribute("aria-checked") === "true"
    );
    expect(selected).toEqual([optionNamed(host, "Español")]);
  });

  it("keeps Mexican Spanish when Español is tapped again", async () => {
    optionNamed(host, "Español").click();
    await new Promise((resolve) => setTimeout(resolve));
    expect(getLocale()).toBe("es-MX");
  });
});
