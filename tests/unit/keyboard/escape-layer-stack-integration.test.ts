import { afterEach, describe, expect, it, vi } from "vitest";
import {
  registerDrawer,
  unregisterDrawer,
} from "#lib/shared/foundation/ui/drawer/drawer-stack.js";
import {
  registerModal,
  unregisterModal,
} from "#lib/shared/foundation/ui/modal/modal-stack.js";
import { getEscapeLayerManager } from "#lib/shared/keyboard/get-escape-layer-manager.js";

const MODAL_ID = "escape-routing-modal";
const DRAWER_ID = "escape-routing-drawer";

afterEach(() => {
  unregisterDrawer(DRAWER_ID);
  unregisterModal(MODAL_ID);
});

describe("modal and drawer Escape routing", () => {
  it("dismisses layers by open order across both stacks", () => {
    const dismissModal = vi.fn();
    const dismissDrawer = vi.fn();
    registerModal(MODAL_ID, dismissModal);
    registerDrawer(DRAWER_ID, dismissDrawer);

    expect(getEscapeLayerManager().dismissTopLayer()).toBe("dismissed");
    expect(dismissDrawer).toHaveBeenCalledOnce();
    expect(dismissModal).not.toHaveBeenCalled();

    unregisterDrawer(DRAWER_ID);

    expect(getEscapeLayerManager().dismissTopLayer()).toBe("dismissed");
    expect(dismissModal).toHaveBeenCalledOnce();
  });

  it("does not fall through a non-dismissible top layer", () => {
    const dismissModal = vi.fn();
    const dismissDrawer = vi.fn();
    registerModal(MODAL_ID, dismissModal);
    registerDrawer(DRAWER_ID, dismissDrawer, () => false);

    expect(getEscapeLayerManager().dismissTopLayer()).toBe("blocked");
    expect(dismissDrawer).not.toHaveBeenCalled();
    expect(dismissModal).not.toHaveBeenCalled();
  });
});
