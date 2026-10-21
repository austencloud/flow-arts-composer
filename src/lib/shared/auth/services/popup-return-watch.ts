//
// End a provider popup that will never report back.
//
// Firebase's popup promise settles only when the handler delivers a result or
// the popup window reads as closed. A phone opens the popup as a tab; if the
// visitor switches back to this tab without closing it, and the result never
// arrives, the promise stays pending and the button reads "Signing in..."
// forever, with nothing logged. That is how every iPhone Google attempt from
// 2026-09-04 ended (see google-redirect-sign-in.ts, which now keeps iPhones off
// the popup). This watch is the backstop for any touch device that still opens
// one.
//
// Desktop is left alone: its popup is a separate window, so this page usually
// stays visible, and Firebase already notices when that window is closed.

export const POPUP_NO_RESULT = "auth/popup-no-result";

// Long enough for a real result to land after the popup closes itself: the
// handler's postback plus Firebase's signInWithIdp and lookup round trips.
const RETURN_GRACE_MS = 10_000;

function opensPopupsAsTabs(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(pointer: coarse)").matches
  );
}

/**
 * Pass the popup sign-in through unchanged, except that once this page has been
 * hidden and then visible again for RETURN_GRACE_MS with no result, it rejects
 * with POPUP_NO_RESULT. A result that arrives later still signs the visitor in;
 * only this wait ends.
 */
export function settleOnAbandonedPopup<T>(operation: Promise<T>): Promise<T> {
  if (typeof document === "undefined" || !opensPopupsAsTabs()) return operation;

  return new Promise<T>((resolve, reject) => {
    let wentHidden = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const stopTimer = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const finish = () => {
      stopTimer();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
    function onVisibilityChange() {
      if (document.visibilityState === "hidden") {
        wentHidden = true;
        stopTimer();
        return;
      }
      if (!wentHidden || timer) return;
      timer = setTimeout(() => {
        finish();
        reject(
          Object.assign(new Error("The sign-in popup did not report back"), {
            code: POPUP_NO_RESULT,
          })
        );
      }, RETURN_GRACE_MS);
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    operation.then(
      (value) => {
        finish();
        resolve(value);
      },
      (error: unknown) => {
        finish();
        reject(error);
      }
    );
  });
}
