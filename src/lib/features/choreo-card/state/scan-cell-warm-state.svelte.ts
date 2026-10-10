import {
  startScanCellWarm,
  type CellWarmDeps,
  type CellWarmHandle,
  type CellWarmProgress,
} from "#lib/features/library/services/warm-all-scan-cells.js";

export type ScanCellWarmScope =
  | { kind: "all" }
  | { kind: "code"; code: string }
  | { kind: "failed"; count: number };

export interface ScanCellWarmState {
  readonly progress: CellWarmProgress | null;
  readonly running: boolean;
  readonly cancellationRequested: boolean;
  readonly error: string | null;
  readonly scope: ScanCellWarmScope | null;
  startAll(): void;
  startCode(code: string): void;
  retryFailed(): void;
  cancel(): void;
}

type WarmStarter = (
  onProgress: (progress: CellWarmProgress) => void,
  deps?: CellWarmDeps
) => CellWarmHandle;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createScanCellWarmState(
  startWarm: WarmStarter = startScanCellWarm
): ScanCellWarmState {
  let progress = $state<CellWarmProgress | null>(null);
  let running = $state(false);
  let cancellationRequested = $state(false);
  let error = $state<string | null>(null);
  let scope = $state<ScanCellWarmScope | null>(null);
  let handle: CellWarmHandle | null = null;

  function launch(
    nextScope: ScanCellWarmScope,
    codes?: readonly string[]
  ): void {
    if (running) return;

    error = null;
    progress = null;
    scope = nextScope;
    running = true;
    cancellationRequested = false;

    const deps: CellWarmDeps | undefined = codes
      ? {
          listCodes: async () => codes,
          concurrency: Math.min(4, Math.max(codes.length, 1)),
        }
      : undefined;

    try {
      handle = startWarm((next) => {
        progress = next;
      }, deps);
    } catch (cause) {
      error = errorMessage(cause);
      running = false;
      handle = null;
      return;
    }

    void handle.promise.then(
      (finalProgress) => {
        progress = finalProgress;
        running = false;
        cancellationRequested = false;
        handle = null;
      },
      (cause) => {
        error = errorMessage(cause);
        running = false;
        cancellationRequested = false;
        handle = null;
      }
    );
  }

  return {
    get progress() {
      return progress;
    },
    get running() {
      return running;
    },
    get cancellationRequested() {
      return cancellationRequested;
    },
    get error() {
      return error;
    },
    get scope() {
      return scope;
    },
    startAll() {
      launch({ kind: "all" });
    },
    startCode(code: string) {
      const normalized = code.trim();
      if (!normalized) return;
      launch({ kind: "code", code: normalized }, [normalized]);
    },
    retryFailed() {
      const failedCodes = progress?.failedCodes ?? [];
      if (failedCodes.length === 0) return;
      launch({ kind: "failed", count: failedCodes.length }, [...failedCodes]);
    },
    cancel() {
      if (!running || !handle || cancellationRequested) return;
      cancellationRequested = true;
      handle.cancel();
    },
  };
}
