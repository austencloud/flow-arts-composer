export function runInRuneRoot(check: () => void): void {
  let cleanup: (() => void) | undefined;
  try {
    cleanup = $effect.root(check);
  } finally {
    cleanup?.();
  }
}
