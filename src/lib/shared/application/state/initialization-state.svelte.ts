import {
  areServicesInitialized,
  initializeAppServices,
} from "./services.svelte";

// Preserve initialization flags across HMR so the app doesn't re-run the
// full init cascade (auth → Firestore → settings → theme) on every edit.
const hmrInitData = import.meta.hot?.data as
  | { initializationState?: { isInitialized: boolean; isInitializing: boolean; initializationError: string | null; initializationProgress: number } }
  | undefined;

// A fresh load always starts un-booted. The root layout starts the settings
// service on every app route, often before this module has loaded, so
// "settings are ready" says nothing about whether MainApplication finished its
// boot. Starting from it would make MainApplication skip restoring the
// workspace, the saved settings and the theme.
const initializationState = $state(
  hmrInitData?.initializationState ?? {
    isInitialized: false,
    isInitializing: false,
    initializationError: null as string | null,
    initializationProgress: 0,
  }
);

if (import.meta.hot) {
  import.meta.hot.dispose((data) => {
    data.initializationState = { ...initializationState };
  });
}

export async function initializeAppState(): Promise<void> {
  if (initializationState.isInitialized) return;

  try {
    setInitializationState(
      false,
      true,
      null,
      initializationState.initializationProgress
    );
    await initializeAppServices();
    // Services ready — leave isInitialized false for MainApplication to set
    // after full lifecycle (module persistence, settings, theme) completes.
    // Setting it here caused a race: MainInterface saw "initialized + null module"
    // before restoreApplicationState() had run.
    setInitializationState(false, false, null, 100);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to initialize app state";
    setInitializationState(false, false, message, 0);
    throw error;
  }
}

export function getIsInitialized() {
  return initializationState.isInitialized;
}

export function getIsInitializing() {
  return initializationState.isInitializing;
}

export function getInitializationError() {
  return initializationState.initializationError;
}

export function getInitializationProgress() {
  return initializationState.initializationProgress;
}

export function getInitializationComplete() {
  return (
    initializationState.isInitialized && !initializationState.isInitializing
  );
}

export function setInitializationState(
  initialized: boolean,
  initializing: boolean,
  error: string | null = null,
  progress: number = 0
): void {
  initializationState.isInitialized = initialized;
  initializationState.isInitializing = initializing;
  initializationState.initializationError = error;
  initializationState.initializationProgress = progress;
}

export function setInitializationError(error: string): void {
  initializationState.initializationError = error;
}

export function setInitializationProgress(progress: number): void {
  initializationState.initializationProgress = progress;
}

export function resetInitializationState(): void {
  initializationState.isInitialized = areServicesInitialized();
  initializationState.isInitializing = false;
  initializationState.initializationError = null;
  initializationState.initializationProgress = areServicesInitialized()
    ? 100
    : 0;
}
