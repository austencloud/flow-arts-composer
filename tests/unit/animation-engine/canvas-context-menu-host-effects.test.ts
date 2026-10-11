/**
 * The Create preview hands its player an effects state as a prop and sets no
 * effects context. The right-click menu read only the context, so its Effects
 * submenu showed nothing checked and changed nothing. The host must read and
 * set the state it is given.
 */
import { flushSync, mount, unmount } from "svelte";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CanvasContextMenuHost from "#lib/shared/animation-engine/components/canvas-context-menu/CanvasContextMenuHost.svelte";
import { AnimationVisibilityStateManager } from "#lib/shared/animation-engine/state/animation-visibility-state.svelte.js";
import { createEffectsConfigState } from "#lib/shared/effects/state/effects-config-state.svelte.js";
import {
  isMenuItem,
  type ContextMenuItem,
} from "#lib/shared/components/context-menu/context-menu-types.js";
import { menuProps } from "./RecordingContextMenu.svelte";

vi.mock("#lib/shared/components/context-menu/ContextMenu.svelte", async () => ({
  default: (await import("./RecordingContextMenu.svelte")).default,
}));

// vitest-setup.ts swaps document.createElement for stubs that are not DOM
// nodes. Mounting a component needs jsdom's own, from document's prototype.
const realCreateElement = Object.getPrototypeOf(document)
  .createElement as typeof document.createElement;

let host: HTMLElement;
let stubbedCreateElement: typeof document.createElement;
let component: ReturnType<typeof mount> | null = null;

beforeEach(() => {
  localStorage.clear();
  stubbedCreateElement = document.createElement;
  document.createElement = realCreateElement.bind(document);
  host = document.createElement("div");
  document.body.append(host);
  menuProps.items = null;
});

afterEach(() => {
  if (component) unmount(component);
  component = null;
  host.remove();
  document.createElement = stubbedCreateElement;
});

function effectsSubmenu(): ContextMenuItem {
  const entry = (menuProps.items ?? []).find(
    (e): e is ContextMenuItem => isMenuItem(e) && e.id === "effects-submenu"
  );
  if (!entry) throw new Error("no Effects submenu");
  return entry;
}

function child(id: string): ContextMenuItem {
  const entry = effectsSubmenu().children?.find(
    (e): e is ContextMenuItem => isMenuItem(e) && e.id === id
  );
  if (!entry) throw new Error(`no ${id} entry`);
  return entry;
}

describe("canvas context menu host effects", () => {
  it("checks and sets the effects state passed as a prop", () => {
    const effectsConfigState = createEffectsConfigState(undefined, {
      persist: false,
    });
    effectsConfigState.setActiveEffect("trails");
    component = mount(CanvasContextMenuHost, {
      target: host,
      props: {
        visibilityManager: new AnimationVisibilityStateManager({
          ephemeral: true,
        }),
        effectsConfigState,
      },
    });
    flushSync();

    expect(child("effect-trails").checked).toBe(true);
    expect(child("effect-none").checked).toBe(false);

    child("effect-fire").action?.();
    flushSync();

    expect(effectsConfigState.activeEffect).toBe("fire");
    expect(child("effect-fire").checked).toBe(true);
    expect(child("effect-trails").checked).toBe(false);
  });
});
