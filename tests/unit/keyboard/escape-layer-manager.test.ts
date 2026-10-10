import { describe, expect, it, vi } from "vitest";
import { EscapeLayerManager } from "#lib/shared/keyboard/services/implementations/EscapeLayerManager.js";

describe("EscapeLayerManager", () => {
  it("dismisses only the most recently opened layer", () => {
    const manager = new EscapeLayerManager();
    const dismissDrawer = vi.fn();
    const dismissModal = vi.fn();
    manager.register({
      id: "drawer",
      dismiss: dismissDrawer,
      canDismiss: () => true,
    });
    manager.register({
      id: "modal",
      dismiss: dismissModal,
      canDismiss: () => true,
    });

    expect(manager.dismissTopLayer()).toBe("dismissed");
    expect(dismissModal).toHaveBeenCalledOnce();
    expect(dismissDrawer).not.toHaveBeenCalled();
  });

  it("blocks the page behind a non-dismissible layer", () => {
    const manager = new EscapeLayerManager();
    const dismiss = vi.fn();
    manager.register({
      id: "pending-confirmation",
      dismiss,
      canDismiss: () => false,
    });

    expect(manager.dismissTopLayer()).toBe("blocked");
    expect(dismiss).not.toHaveBeenCalled();
  });

  it("does not dispatch the same layer twice while it is closing", () => {
    const manager = new EscapeLayerManager();
    const dismiss = vi.fn();
    manager.register({
      id: "modal",
      dismiss,
      canDismiss: () => true,
    });

    expect(manager.dismissTopLayer()).toBe("dismissed");
    expect(manager.dismissTopLayer()).toBe("blocked");
    expect(dismiss).toHaveBeenCalledOnce();
  });

  it("reveals the previous layer after the top layer unregisters", () => {
    const manager = new EscapeLayerManager();
    const dismissDrawer = vi.fn();
    const dismissModal = vi.fn();
    manager.register({
      id: "drawer",
      dismiss: dismissDrawer,
      canDismiss: () => true,
    });
    const unregisterModal = manager.register({
      id: "modal",
      dismiss: dismissModal,
      canDismiss: () => true,
    });

    unregisterModal();

    expect(manager.dismissTopLayer()).toBe("dismissed");
    expect(dismissDrawer).toHaveBeenCalledOnce();
    expect(dismissModal).not.toHaveBeenCalled();
  });
});
