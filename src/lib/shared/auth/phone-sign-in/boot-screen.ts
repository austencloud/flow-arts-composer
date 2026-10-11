/**
 * Lets the app.html boot screen go. The app shell normally reports that boot
 * finished, and the phone sign-in pages never mount it, so without this the
 * screen covers them until its 15 s safety net.
 */
export function finishBootScreen(): void {
  (
    window as unknown as {
      __tkaLoadProgress?: (percent: number, message: string) => void;
    }
  ).__tkaLoadProgress?.(100, "Ready");
}
