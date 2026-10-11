import type { IVisualSequenceSaveCoordinator } from "#lib/shared/library/services/contracts/IVisualSequenceSaveCoordinator.js";

type VisualSequenceSaveCoordinatorFactory = () => Promise<IVisualSequenceSaveCoordinator>;

let factory: VisualSequenceSaveCoordinatorFactory | null = null;
let instance: Promise<IVisualSequenceSaveCoordinator> | null = null;

export function registerVisualSequenceSaveCoordinatorFactory(
  nextFactory: VisualSequenceSaveCoordinatorFactory
): void {
  factory = nextFactory;
  instance = null;
}

// A public page (the embed routes, the Shape Engine, and any future one like
// them) never runs the app's boot sequence, so nothing has called
// registerLibraryRepository() by the time a visitor right-clicks the canvas
// and picks "Save sequence to Library." Without this, the person saw nothing
// happen: the menu's action rejected and the shared context menu has no catch
// to turn that into a message. Same shape as withSettingsService in
// app-state.svelte.ts - the first real use wires up the missing piece, then
// continues. Dynamic import keeps the library/Firestore code out of the
// boot bundle (tests/unit/boot-import-boundary.test.ts).
let lazyRegistration: Promise<void> | null = null;

function ensureRegistered(): Promise<void> {
  if (factory) return Promise.resolve();
  lazyRegistration ??= Promise.all([
    import("#lib/shared/composition-root/register-library-repository.js").then(
      ({ registerLibraryRepository }) => registerLibraryRepository()
    ),
    learnWhoIsSignedIn(),
  ])
    .then(() => undefined)
    .finally(() => {
      lazyRegistration = null;
    });
  return lazyRegistration;
}

// Those pages never start listening for sign-in either, and the save decides
// whose sequence it is from that. Without this a signed-in person was treated
// as a stranger: the sequence stayed on this device, filed under nobody, and
// never reached their library. Start the same listener the app and the site
// header start, and wait until it knows who is here. If it cannot start, the
// save still goes ahead as a guest save on this device.
async function learnWhoIsSignedIn(): Promise<void> {
  try {
    const { initializeAuthListener, awaitAuthSettled } = await import(
      "#lib/shared/auth/state/auth-state.svelte.js"
    );
    await initializeAuthListener();
    await awaitAuthSettled();
  } catch (error) {
    console.warn(
      "[library] Could not check who is signed in before saving:",
      error
    );
  }
}

export async function getVisualSequenceSaveCoordinator(): Promise<IVisualSequenceSaveCoordinator> {
  if (!factory) {
    await ensureRegistered();
  }

  if (!factory) {
    throw new Error("Visual sequence saving has not been registered");
  }

  return (instance ??= factory());
}
