/**
 * Push handling in the service worker (static/firebase-messaging-handler.js).
 *
 * The handler replaced Google's Firebase messaging SDK in the worker, so it has
 * to read FCM pushes exactly the way that SDK did. Every failure here is
 * silent: a subscriber whose push goes unshown, a badge that never updates,
 * or a first-time visitor downloading Firebase again all look fine from a
 * desktop tab with the console open.
 *
 * Like sw-harness.ts, the real classic script is evaluated inside a
 * controlled scope with a fake `self` (registration, clients, navigator).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createSwHarness } from "../../helpers/sw-harness";

const ORIGIN = "https://tkaflowarts.com";
const HANDLER_SOURCE = readFileSync(
  resolve(import.meta.dirname, "../../../static/firebase-messaging-handler.js"),
  "utf8"
);

type Visibility = "visible" | "hidden";

function windowClient(path: string, visibilityState: Visibility) {
  return {
    url: new URL(path, ORIGIN).href,
    visibilityState,
    postMessage: vi.fn(),
    focus: vi.fn(async () => undefined),
    navigate: vi.fn(async () => undefined),
  };
}

function shadeNotification(type: string) {
  return { data: { type }, close: vi.fn() };
}

/** What a data-only FCM web push decrypts to in the worker. */
function fcmPush(data: Record<string, string>): string {
  return JSON.stringify({
    from: "664225703033",
    fcmMessageId: "fcm-msg-1",
    data,
  });
}

function loadHandler(
  options: {
    clients?: ReturnType<typeof windowClient>[];
    delivered?: ReturnType<typeof shadeNotification>[];
    signInWorker?: {
      showPush: (payload: unknown) => Promise<boolean>;
      ownsClick: (notification: unknown) => boolean;
      answerClick: (action: string, data: unknown) => Promise<void>;
    };
  } = {}
) {
  const listeners = new Map<string, (event: unknown) => void>();
  const self = {
    phoneSignInWorker: options.signInWorker,
    location: new URL("/sw.js", ORIGIN),
    addEventListener(type: string, fn: (event: unknown) => void) {
      listeners.set(type, fn);
    },
    registration: {
      showNotification: vi.fn(
        async (_title: string, _options?: NotificationOptions): Promise<void> =>
          undefined
      ),
      getNotifications: vi.fn(async () => options.delivered ?? []),
    },
    clients: {
      matchAll: vi.fn(async () => options.clients ?? []),
      openWindow: vi.fn(async () => null),
    },
    navigator: {
      setAppBadge: vi.fn(async (_count?: number): Promise<void> => undefined),
      clearAppBadge: vi.fn(async (): Promise<void> => undefined),
    } as { setAppBadge?: unknown; clearAppBadge?: unknown },
  };
  const importScripts = vi.fn();
  (
    new Function("self", "importScripts", HANDLER_SOURCE) as (
      ...args: unknown[]
    ) => void
  )(self, importScripts);

  /** Fires a listener and returns the promise it handed to waitUntil. */
  function fire(type: string, event: object): Promise<unknown> {
    const listener = listeners.get(type);
    if (!listener) throw new Error(`handler registered no ${type} listener`);
    let waited: Promise<unknown> = Promise.resolve();
    listener({
      ...event,
      waitUntil(promise: Promise<unknown>) {
        waited = promise;
      },
    });
    return waited;
  }

  return {
    self,
    importScripts,
    /** body null = a push with no payload; otherwise the decrypted text. */
    push(body: string | null) {
      return fire("push", {
        data: body === null ? null : { json: () => JSON.parse(body) },
      });
    },
    clickNotification(data: object, action: string) {
      const notification = { data, close: vi.fn() };
      return {
        notification,
        done: fire("notificationclick", { notification, action }),
      };
    },
    click(url?: string) {
      const notification = { data: url ? { url } : {}, close: vi.fn() };
      return {
        notification,
        done: fire("notificationclick", { notification, action: "" }),
      };
    },
  };
}

describe("phone sign-in pushes", () => {
  const SIGN_IN = {
    type: "phone-sign-in",
    id: "AbCdEfGhIjKlMnOpQr12",
    title: "Sign in Chrome on Windows?",
    body: "Tap to sign it in. Code 123 456",
    tag: "phone-sign-in-AbCdEfGhIjKlMnOpQr12",
    url: "/sign-in/AbCdEfGhIjKlMnOpQr12?review=1",
  };

  function signInWorker(showPush: () => Promise<boolean>) {
    return {
      showPush: vi.fn(showPush),
      ownsClick: vi.fn((n: unknown) => !!(n as { data: { signIn?: unknown } }).data.signIn),
      answerClick: vi.fn(async () => undefined),
    };
  }

  // A visible tab normally takes the push, and the page would never answer it.
  it("goes to the sign-in worker even with a tab visible, never to the tab", async () => {
    const tab = windowClient("/app", "visible");
    const worker = signInWorker(async () => true);
    const h = loadHandler({ clients: [tab], signInWorker: worker });

    await h.push(fcmPush(SIGN_IN));

    expect(worker.showPush).toHaveBeenCalledOnce();
    expect(tab.postMessage).not.toHaveBeenCalled();
    expect(h.self.registration.showNotification).not.toHaveBeenCalled();
  });

  it.each([
    ["the script failed to load", undefined],
    [
      "the worker throws",
      {
        showPush: async () => {
          throw new Error("broken");
        },
        ownsClick: () => false,
        answerClick: async () => undefined,
      },
    ],
    [
      "the worker turns the message down",
      {
        showPush: async () => false,
        ownsClick: () => false,
        answerClick: async () => undefined,
      },
    ],
  ])("still shows plainly, and its tap opens the review page, when %s", async (_label, worker) => {
    const h = loadHandler({
      clients: [windowClient("/app", "visible")],
      signInWorker: worker,
    });

    await h.push(fcmPush(SIGN_IN));

    const [title, options] = h.self.registration.showNotification.mock.calls[0]!;
    expect(title).toBe(SIGN_IN.title);
    expect(options?.tag).toBe(SIGN_IN.tag);
    expect(options?.data).toMatchObject({ url: SIGN_IN.url });
  });

  it("hands a click on its own notification to the sign-in worker, and opens nothing itself", async () => {
    const worker = signInWorker(async () => true);
    const h = loadHandler({ signInWorker: worker });
    const data = { url: SIGN_IN.url, signIn: { id: SIGN_IN.id } };

    const clicked = h.clickNotification(data, "deny");
    await clicked.done;

    expect(clicked.notification.close).toHaveBeenCalled();
    expect(worker.answerClick).toHaveBeenCalledWith("deny", data);
    expect(h.self.clients.openWindow).not.toHaveBeenCalled();
  });

  it("leaves other clicks to the usual routing", async () => {
    const worker = signInWorker(async () => true);
    const h = loadHandler({ signInWorker: worker });

    await h.click("/app/inbox").done;

    expect(worker.answerClick).not.toHaveBeenCalled();
    expect(h.self.clients.openWindow).toHaveBeenCalledWith("/app/inbox");
  });

  it("survives the inbox being cleared on another device", async () => {
    const waiting = { data: { signIn: { id: SIGN_IN.id } }, close: vi.fn() };
    const generic = shadeNotification("generic");
    const h = loadHandler({
      delivered: [waiting as never, generic],
    });

    await h.push(fcmPush({ action: "dismiss-notifications", unreadCount: "0" }));

    expect(waiting.close).not.toHaveBeenCalled();
    expect(generic.close).toHaveBeenCalled();
  });
});

describe("worker script loading", () => {
  // The reason this handler exists: first-time visitors must not download the
  // Firebase SDK from gstatic when /sw.js installs.
  it("loads no third-party code: /sw.js imports only our own two scripts, and the handler imports nothing", () => {
    expect(createSwHarness().importScripts.mock.calls).toEqual([
      ["/phone-sign-in-worker.js"],
      ["/firebase-messaging-handler.js"],
    ]);
    expect(loadHandler().importScripts).not.toHaveBeenCalled();
  });
});

describe("push with no visible tab", () => {
  it("shows the notification from a data-only FCM message and sets the badge", async () => {
    const hiddenTab = windowClient("/app/library", "hidden");
    const h = loadHandler({ clients: [hiddenTab] });

    await h.push(
      fcmPush({
        title: "New message",
        body: "Hi there",
        url: "/app/messages?conversation=c1",
        tag: "conversation-c1",
        type: "message-received",
        unreadCount: "3",
        conversationId: "c1",
      })
    );

    expect(h.self.registration.showNotification).toHaveBeenCalledTimes(1);
    expect(h.self.registration.showNotification).toHaveBeenCalledWith(
      "New message",
      {
        body: "Hi there",
        icon: "/pwa/icons/icon-192x192.png",
        badge: "/pwa/icons/icon-96x96.png",
        tag: "conversation-c1",
        renotify: true,
        data: {
          url: "/app/messages?conversation=c1",
          conversationId: "c1",
          notificationId: null,
          type: "message-received",
        },
        vibrate: [100, 200, 100],
      }
    );
    expect(h.self.navigator.setAppBadge).toHaveBeenCalledWith(3);
    expect(hiddenTab.postMessage).not.toHaveBeenCalled();
  });

  it("falls back to the app name, /app and a shared tag, and leaves a zero badge alone", async () => {
    const h = loadHandler();

    await h.push(fcmPush({ unreadCount: "0" }));

    expect(h.self.registration.showNotification).toHaveBeenCalledWith(
      "Flow Arts Composer",
      expect.objectContaining({
        body: "",
        tag: "tka-notification",
        data: {
          url: "/app",
          conversationId: null,
          notificationId: null,
          type: "generic",
        },
      })
    );
    expect(h.self.navigator.setAppBadge).not.toHaveBeenCalled();
  });

  // Chrome decides whether to add its generic "site updated in the
  // background" notice when the push event's promise settles.
  it("keeps the push event open until the notification is shown", async () => {
    const h = loadHandler();
    let finishShowing!: () => void;
    h.self.registration.showNotification.mockImplementation(
      () => new Promise<void>((resolve) => (finishShowing = resolve))
    );

    let settled = false;
    const done = h
      .push(fcmPush({ title: "Scan" }))
      .then(() => (settled = true));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(h.self.registration.showNotification).toHaveBeenCalled();
    expect(settled).toBe(false);
    finishShowing();
    await done;
    expect(settled).toBe(true);
  });

  it("still shows the notification when the badge API is missing or rejects", async () => {
    const rejecting = loadHandler();
    rejecting.self.navigator.setAppBadge = vi.fn(async () => {
      throw new DOMException("not allowed", "NotAllowedError");
    });
    await expect(
      rejecting.push(fcmPush({ title: "A", unreadCount: "2" }))
    ).resolves.toBeUndefined();
    expect(rejecting.self.registration.showNotification).toHaveBeenCalledTimes(
      1
    );

    const missing = loadHandler();
    missing.self.navigator = {};
    await expect(
      missing.push(fcmPush({ title: "B", unreadCount: "2" }))
    ).resolves.toBeUndefined();
    expect(missing.self.registration.showNotification).toHaveBeenCalledTimes(1);
  });
});

describe("push with a visible tab", () => {
  // The page SDK's onMessage (foreground-message-handler.ts) ignores any
  // message without these two markers, so a wrong shape silently drops toasts.
  it("forwards the payload with the page SDK's markers to every tab and shows nothing", async () => {
    const visible = windowClient("/app/library", "visible");
    const background = windowClient("/about", "hidden");
    const h = loadHandler({ clients: [visible, background] });
    const body = fcmPush({
      title: "New message",
      body: "Hi",
      unreadCount: "1",
    });

    await h.push(body);

    const expected = {
      ...JSON.parse(body),
      isFirebaseMessaging: true,
      messageType: "push-received",
    };
    expect(visible.postMessage).toHaveBeenCalledWith(expected);
    expect(background.postMessage).toHaveBeenCalledWith(expected);
    expect(h.self.clients.matchAll).toHaveBeenCalledWith({
      type: "window",
      includeUncontrolled: true,
    });
    expect(h.self.registration.showNotification).not.toHaveBeenCalled();
    expect(h.self.navigator.setAppBadge).not.toHaveBeenCalled();
  });
});

describe("dismiss-notifications state sync", () => {
  it("closes shade notifications except DMs, syncs the badge, and never displays", async () => {
    const generic = shadeNotification("generic");
    const dm = shadeNotification("message-received");
    const h = loadHandler({ delivered: [generic, dm] });

    await h.push(
      fcmPush({ action: "dismiss-notifications", unreadCount: "4" })
    );

    expect(generic.close).toHaveBeenCalled();
    expect(dm.close).not.toHaveBeenCalled();
    expect(h.self.navigator.setAppBadge).toHaveBeenCalledWith(4);
    expect(h.self.registration.showNotification).not.toHaveBeenCalled();
  });

  it("clears the badge when the synced count is zero", async () => {
    const h = loadHandler();

    await h.push(
      fcmPush({ action: "dismiss-notifications", unreadCount: "0" })
    );

    expect(h.self.navigator.clearAppBadge).toHaveBeenCalled();
    expect(h.self.navigator.setAppBadge).not.toHaveBeenCalled();
  });
});

describe("pushes that are not FCM messages", () => {
  it.each([
    ["no payload", null],
    ["text that isn't JSON", "hello"],
    ["JSON that isn't an object", "42"],
  ])("ignores %s without failing the event", async (_label, body) => {
    const h = loadHandler({ clients: [windowClient("/app", "visible")] });

    await expect(h.push(body)).resolves.toBeUndefined();

    expect(h.self.clients.matchAll).not.toHaveBeenCalled();
    expect(h.self.registration.showNotification).not.toHaveBeenCalled();
  });
});

describe("notification clicks", () => {
  it("routes an open /app tab to the notification's link and focuses it", async () => {
    const tab = windowClient("/app/library", "hidden");
    const h = loadHandler({ clients: [tab] });

    const { notification, done } = h.click("/app/messages?conversation=c1");
    await done;

    expect(notification.close).toHaveBeenCalled();
    expect(tab.navigate).toHaveBeenCalledWith("/app/messages?conversation=c1");
    expect(tab.focus).toHaveBeenCalled();
    expect(h.self.clients.openWindow).not.toHaveBeenCalled();
  });

  it("opens a new window when no /app tab exists", async () => {
    const h = loadHandler({ clients: [windowClient("/about", "visible")] });

    await h.click("/app/messages?conversation=c1").done;

    expect(h.self.clients.openWindow).toHaveBeenCalledWith(
      "/app/messages?conversation=c1"
    );
  });
});
