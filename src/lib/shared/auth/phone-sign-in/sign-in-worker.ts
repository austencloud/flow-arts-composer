/**
 * The service worker's half of a sign-in notification: shows the request, and
 * carries out a tap. static/firebase-messaging-handler.js hands these over, so
 * a sign-in always shows even with a tab open, where other pushes go to the tab.
 */

import {
  answerTap,
  answeringNotification,
  couldNotAnswer,
  isStaleRequest,
  showRequest,
  signInFromPush,
  tapAnswers,
  type NotificationContent,
  type ShownNotification,
  type SignInNotificationData,
  type TapAnswers,
} from "./sign-in-notification";
import { reviewPath } from "./values";

/** Long enough for a slow connection, short enough that "Signing in..." never just sits there. */
const ANSWER_TIMEOUT_MS = 20_000;

export interface SignInWorkerScope {
  registration: {
    showNotification: (
      title: string,
      options?: NotificationOptions
    ) => Promise<void>;
    getNotifications: () => Promise<(ShownNotification & { close(): void })[]>;
  };
  clients: { openWindow: (url: string) => Promise<unknown> };
}

function timedOut(): { promise: Promise<never>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout>;
  const promise = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error("The answer took too long")),
      ANSWER_TIMEOUT_MS
    );
  });
  return { promise, cancel: () => clearTimeout(timer) };
}

export function createSignInWorker(
  scope: SignInWorkerScope,
  answers: TapAnswers,
  now: () => number = Date.now
) {
  const show = ({ title, options }: NotificationContent) =>
    scope.registration.showNotification(title, options);

  async function open(url: string): Promise<void> {
    try {
      await scope.clients.openWindow(url);
    } catch (cause) {
      // Android may refuse this long after the tap. The notification left
      // behind opens the same page.
      console.warn("[phone-sign-in] could not open a page", cause);
    }
  }

  return {
    /** Shows a sign-in push. False when the message is not a valid one, so the caller shows it plainly. */
    async showPush(payload: unknown): Promise<boolean> {
      const signIn = signInFromPush(payload);
      if (!signIn) return false;
      const { title, body } = (payload as { data: Record<string, unknown> })
        .data;
      const time = now();
      const shown = await scope.registration.getNotifications();
      for (const notification of shown) {
        if (isStaleRequest(notification, time)) notification.close();
      }
      await Promise.all(
        showRequest(
          signIn,
          typeof title === "string" ? title : `Sign in ${signIn.label}?`,
          typeof body === "string" ? body : "",
          shown,
          time
        ).map(show)
      );
      return true;
    },

    /** True for a notification this worker put up. */
    ownsClick(notification: { data?: unknown }): boolean {
      const data = notification.data as Partial<SignInNotificationData> | null;
      return !!data?.signIn && typeof data.url === "string";
    },

    /** Carries out a tap. Any failure ends on the review page, never on something that looks like success. */
    async answerClick(
      action: string,
      data: SignInNotificationData
    ): Promise<void> {
      const time = now();
      const deadline = timedOut();
      try {
        const answer = tapAnswers(action, data, time);
        if (answer) await show(answeringNotification(answer, data.signIn));
        const result = await Promise.race([
          answerTap(action, data, answers, time),
          deadline.promise,
        ]);
        if (result.notification) await show(result.notification);
        if (result.open) await open(result.open);
      } catch (cause) {
        console.warn("[phone-sign-in] the tap did not finish", cause);
        await show(couldNotAnswer(data.signIn)).catch(() => {});
        await open(reviewPath(data.signIn.id));
      } finally {
        deadline.cancel();
      }
    },
  };
}
