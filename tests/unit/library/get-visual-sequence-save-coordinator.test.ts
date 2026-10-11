import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * getVisualSequenceSaveCoordinator() only has a factory to call once
 * registerLibraryRepository() has run, and only the app's own boot sequence
 * called that - never a public/landing page like /embed/spinner or
 * /shape-engine, which never run the app's boot sequence at all. Before the
 * lazy fallback this file guards, a visitor on one of those pages who picked
 * "Save sequence to Library" saw the dialog close and nothing else: the
 * getter threw, and the shared ContextMenu component awaits its action with
 * no catch, so the rejection vanished. These checks lock in the fallback -
 * first real use wires up the missing registration, then continues - the
 * same shape as withSettingsService in app-state.svelte.ts. The same pages
 * never learn who is signed in either, so the fallback also waits for that
 * before the save decides whose sequence it is.
 */

const { registerLibraryRepository, initializeAuthListener, awaitAuthSettled } =
  vi.hoisted(() => ({
    registerLibraryRepository: vi.fn(),
    initializeAuthListener: vi.fn(),
    awaitAuthSettled: vi.fn(),
  }));

vi.mock("#lib/shared/composition-root/register-library-repository.js", () => ({
  registerLibraryRepository,
}));

vi.mock("#lib/shared/auth/state/auth-state.svelte.js", () => ({
  initializeAuthListener,
  awaitAuthSettled,
}));

beforeEach(() => {
  vi.resetModules();
  registerLibraryRepository.mockReset();
  initializeAuthListener.mockReset().mockResolvedValue(undefined);
  awaitAuthSettled.mockReset().mockResolvedValue(undefined);
});

describe("getVisualSequenceSaveCoordinator lazy registration", () => {
  it("registers itself on first use when nothing has booted the app", async () => {
    const mod = await import(
      "#lib/shared/library/get-visual-sequence-save-coordinator.js"
    );
    const fakeCoordinator = { save: vi.fn() };
    registerLibraryRepository.mockImplementation(() => {
      mod.registerVisualSequenceSaveCoordinatorFactory(async () => fakeCoordinator as never);
    });

    const coordinator = await mod.getVisualSequenceSaveCoordinator();

    expect(registerLibraryRepository).toHaveBeenCalledTimes(1);
    expect(coordinator).toBe(fakeCoordinator);
  });

  it("skips registration once a factory is already registered", async () => {
    const mod = await import(
      "#lib/shared/library/get-visual-sequence-save-coordinator.js"
    );
    const fakeCoordinator = { save: vi.fn() };
    mod.registerVisualSequenceSaveCoordinatorFactory(async () => fakeCoordinator as never);

    const coordinator = await mod.getVisualSequenceSaveCoordinator();

    expect(registerLibraryRepository).not.toHaveBeenCalled();
    expect(initializeAuthListener).not.toHaveBeenCalled();
    expect(coordinator).toBe(fakeCoordinator);
  });

  it("waits until it knows who is signed in before handing back the coordinator", async () => {
    const mod = await import(
      "#lib/shared/library/get-visual-sequence-save-coordinator.js"
    );
    const fakeCoordinator = { save: vi.fn() };
    registerLibraryRepository.mockImplementation(() => {
      mod.registerVisualSequenceSaveCoordinatorFactory(async () => fakeCoordinator as never);
    });
    let settle!: () => void;
    awaitAuthSettled.mockReturnValue(
      new Promise<void>((resolve) => {
        settle = resolve;
      })
    );

    let handedBack = false;
    const pending = mod.getVisualSequenceSaveCoordinator().then((c) => {
      handedBack = true;
      return c;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(initializeAuthListener).toHaveBeenCalledTimes(1);
    expect(handedBack).toBe(false);

    settle();
    expect(await pending).toBe(fakeCoordinator);
  });

  it("still saves as a guest when sign-in cannot start", async () => {
    const mod = await import(
      "#lib/shared/library/get-visual-sequence-save-coordinator.js"
    );
    const fakeCoordinator = { save: vi.fn() };
    registerLibraryRepository.mockImplementation(() => {
      mod.registerVisualSequenceSaveCoordinatorFactory(async () => fakeCoordinator as never);
    });
    initializeAuthListener.mockRejectedValue(new Error("Firebase failed to load"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const coordinator = await mod.getVisualSequenceSaveCoordinator();

    expect(coordinator).toBe(fakeCoordinator);
    expect(awaitAuthSettled).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("shares one registration import across concurrent callers", async () => {
    const mod = await import(
      "#lib/shared/library/get-visual-sequence-save-coordinator.js"
    );
    const fakeCoordinator = { save: vi.fn() };
    let resolveImport!: () => void;
    const importGate = new Promise<void>((resolve) => {
      resolveImport = resolve;
    });
    registerLibraryRepository.mockImplementation(async () => {
      await importGate;
      mod.registerVisualSequenceSaveCoordinatorFactory(async () => fakeCoordinator as never);
    });

    const first = mod.getVisualSequenceSaveCoordinator();
    const second = mod.getVisualSequenceSaveCoordinator();
    resolveImport();
    const [a, b] = await Promise.all([first, second]);

    expect(registerLibraryRepository).toHaveBeenCalledTimes(1);
    expect(a).toBe(fakeCoordinator);
    expect(b).toBe(fakeCoordinator);
  });

  it("still reports the original error if registration leaves no factory behind", async () => {
    const mod = await import(
      "#lib/shared/library/get-visual-sequence-save-coordinator.js"
    );
    // A real-world stand-in for a registration module that loaded but, for
    // whatever reason, did not wire up this particular factory.
    registerLibraryRepository.mockImplementation(() => {});

    await expect(mod.getVisualSequenceSaveCoordinator()).rejects.toThrow(
      "Visual sequence saving has not been registered"
    );
  });
});
