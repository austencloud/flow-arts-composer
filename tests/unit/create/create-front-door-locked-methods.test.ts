// @vitest-environment jsdom

import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Section } from "$lib/shared/navigation/domain/types";
import { CREATE_TABS } from "$lib/shared/navigation/config/tab-definitions";

vi.mock("$lib/features/create/shared/services/create-entry-analytics", () => ({
  logCreateFrontDoorViewed: vi.fn(),
  logCreateMethodSelected: vi.fn(),
}));
vi.mock("$lib/shared/application/get-haptic-feedback", () => ({
  getHapticFeedback: () => ({ trigger: vi.fn() }),
}));

const { default: CreateFrontDoor } =
  await import("$lib/features/create/shared/components/CreateFrontDoor.svelte");

// vitest-setup.ts swaps document.createElement for canvas stubs that are not
// DOM nodes. Mounting a component needs jsdom's own, from document's prototype.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;

function methodsFor(ids: string[]): Section[] {
  return ids.map((id) => {
    const tab = CREATE_TABS.find((candidate) => candidate.id === id);
    if (!tab) throw new Error(`Unknown Create tab ${id}`);
    return tab;
  });
}

function card(host: HTMLElement, methodId: string): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>(
    `[data-method-id="${methodId}"]`
  );
  if (!button) throw new Error(`No card for ${methodId}`);
  return button;
}

describe("Create front door, account-only methods for guests", () => {
  let host: HTMLElement;
  let component: ReturnType<typeof mount> | null = null;
  let stubbedCreateElement: typeof document.createElement;
  const onSelect = vi.fn();
  const onLockedSelect = vi.fn();

  beforeEach(() => {
    stubbedCreateElement = document.createElement;
    document.createElement = realCreateElement.bind(document);
    host = document.createElement("div");
    document.body.append(host);
    onSelect.mockReset();
    onLockedSelect.mockReset();
    component = mount(CreateFrontDoor, {
      target: host,
      props: {
        methods: methodsFor([
          "construct",
          "generate",
          "shape-engine",
          "fuse",
          "tunnel",
        ]),
        lockedMethodIds: new Set(["fuse", "tunnel"]),
        active: true,
        source: "direct",
        lastUsedMode: "fuse",
        onSelect,
        onLockedSelect,
      },
    });
    flushSync();
  });

  afterEach(() => {
    if (component) unmount(component);
    component = null;
    host.remove();
    document.createElement = stubbedCreateElement;
  });

  it("asks for an account instead of opening a locked method", () => {
    card(host, "fuse").click();

    expect(onLockedSelect).toHaveBeenCalledWith("fuse");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("still opens a method the guest can use", () => {
    card(host, "shape-engine").click();

    expect(onSelect).toHaveBeenCalledWith("shape-engine");
    expect(onLockedSelect).not.toHaveBeenCalled();
  });

  it("names the account requirement in the locked card's accessible name", () => {
    const name = card(host, "tunnel").getAttribute("aria-label") ?? "";

    expect(name).toContain("Tunnel");
    expect(name.toLowerCase()).toContain("free account");
    expect(card(host, "construct").getAttribute("aria-label")).toBeNull();
  });

  it("labels a locked method as needing an account, never as last used", () => {
    const fuse = card(host, "fuse");

    expect(fuse.textContent).not.toContain("Last used");
    expect(fuse.getAttribute("aria-label")?.toLowerCase()).not.toContain(
      "last used"
    );
  });
});
