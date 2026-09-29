import { describe, it, expect, vi } from "vitest";
import {
  applyWaitingSwUpdateBeforeStart,
  consumeSwUpdateReloadMarker,
  createSwUpdateManager,
  markSwUpdateReload,
  prepareSwBeforeStart,
  SW_UPDATE_RELOAD_MARKER_KEY,
} from "./sw-update-manager";

class FakeWorker extends EventTarget {
  state: string = "installing";
  postMessage = vi.fn();
  setState(s: string) {
    this.state = s;
    this.dispatchEvent(new Event("statechange"));
  }
}

class FakeRegistration extends EventTarget {
  installing: FakeWorker | null = null;
  waiting: FakeWorker | null = null;
  update = vi.fn().mockResolvedValue(undefined);
  triggerUpdateFound(worker: FakeWorker) {
    this.installing = worker;
    this.dispatchEvent(new Event("updatefound"));
  }
}

class FakeContainer extends EventTarget {
  controller: unknown = null;
  registration: FakeRegistration | undefined = undefined;
  getRegistration = vi.fn(async () => this.registration);
  triggerControllerChange() {
    this.dispatchEvent(new Event("controllerchange"));
  }
}

const asAny = (x: unknown) => x as any;

describe("createSwUpdateManager", () => {
  it("watches an update that began installing before the manager was attached", () => {
    const container = new FakeContainer();
    container.controller = {};
    const registration = new FakeRegistration();
    const worker = new FakeWorker();
    registration.installing = worker;
    const onUpdateReady = vi.fn();

    createSwUpdateManager({
      registration: asAny(registration),
      serviceWorker: asAny(container),
      onUpdateReady,
      reload: vi.fn(),
    });

    worker.setState("installed");

    expect(onUpdateReady).toHaveBeenCalledTimes(1);
  });

  it("reloads if a startup activation finishes after the pre-start timeout", () => {
    const container = new FakeContainer();
    container.controller = {};
    const registration = new FakeRegistration();
    const reload = vi.fn();

    createSwUpdateManager({
      registration: asAny(registration),
      serviceWorker: asAny(container),
      onUpdateReady: vi.fn(),
      reload,
      activationAlreadyRequested: true,
    });

    container.triggerControllerChange();

    expect(reload).toHaveBeenCalledOnce();
  });

  it("fires onUpdateReady when a worker installs over an existing controller", () => {
    const container = new FakeContainer();
    container.controller = {}; // a SW already controls the page → this is an update
    const registration = new FakeRegistration();
    const onUpdateReady = vi.fn();

    createSwUpdateManager({
      registration: asAny(registration),
      serviceWorker: asAny(container),
      onUpdateReady,
      reload: vi.fn(),
    });

    const worker = new FakeWorker();
    registration.triggerUpdateFound(worker);
    worker.setState("installed");

    expect(onUpdateReady).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire onUpdateReady on first install (no controller)", () => {
    const container = new FakeContainer(); // controller stays null
    const registration = new FakeRegistration();
    const onUpdateReady = vi.fn();

    createSwUpdateManager({
      registration: asAny(registration),
      serviceWorker: asAny(container),
      onUpdateReady,
      reload: vi.fn(),
    });

    const worker = new FakeWorker();
    registration.triggerUpdateFound(worker);
    worker.setState("installed");

    expect(onUpdateReady).not.toHaveBeenCalled();
  });

  it("fires immediately when a worker is already waiting at construction", () => {
    const container = new FakeContainer();
    container.controller = {};
    const registration = new FakeRegistration();
    registration.waiting = new FakeWorker();
    const onUpdateReady = vi.fn();

    createSwUpdateManager({
      registration: asAny(registration),
      serviceWorker: asAny(container),
      onUpdateReady,
      reload: vi.fn(),
    });

    expect(onUpdateReady).toHaveBeenCalledTimes(1);
  });

  it("apply() posts SKIP_WAITING to the waiting worker", () => {
    const container = new FakeContainer();
    container.controller = {};
    const registration = new FakeRegistration();
    const waiting = new FakeWorker();
    registration.waiting = waiting;
    let applyFn: (() => void) | null = null;

    createSwUpdateManager({
      registration: asAny(registration),
      serviceWorker: asAny(container),
      onUpdateReady: (apply) => {
        applyFn = apply;
      },
      reload: vi.fn(),
    });

    applyFn!();
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
  });

  it("does not reload when the first install claims the open page", () => {
    const container = new FakeContainer();
    const registration = new FakeRegistration();
    const reload = vi.fn();

    createSwUpdateManager({
      registration: asAny(registration),
      serviceWorker: asAny(container),
      onUpdateReady: vi.fn(),
      reload,
    });

    const worker = new FakeWorker();
    registration.triggerUpdateFound(worker);
    worker.setState("installed");
    container.triggerControllerChange();

    expect(reload).not.toHaveBeenCalled();
  });

  it("does not reload an already-controlled page before the update is accepted", () => {
    const container = new FakeContainer();
    container.controller = {};
    const registration = new FakeRegistration();
    const reload = vi.fn();

    createSwUpdateManager({
      registration: asAny(registration),
      serviceWorker: asAny(container),
      onUpdateReady: vi.fn(),
      reload,
    });

    container.triggerControllerChange();

    expect(reload).not.toHaveBeenCalled();
  });

  it("reloads exactly once after an accepted update takes control", () => {
    const container = new FakeContainer();
    container.controller = {};
    const registration = new FakeRegistration();
    const waiting = new FakeWorker();
    registration.waiting = waiting;
    const reload = vi.fn();
    const markReload = vi.fn();
    let applyFn: (() => void) | null = null;

    createSwUpdateManager({
      registration: asAny(registration),
      serviceWorker: asAny(container),
      onUpdateReady: (apply) => {
        applyFn = apply;
      },
      reload,
      markReload,
    });

    applyFn!();
    container.triggerControllerChange();
    container.triggerControllerChange();

    expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(markReload).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("notifies only once when the browser reports the same update repeatedly", () => {
    const container = new FakeContainer();
    container.controller = {};
    const registration = new FakeRegistration();
    const onUpdateReady = vi.fn();

    createSwUpdateManager({
      registration: asAny(registration),
      serviceWorker: asAny(container),
      onUpdateReady,
      reload: vi.fn(),
    });

    const first = new FakeWorker();
    registration.triggerUpdateFound(first);
    first.setState("installed");
    const second = new FakeWorker();
    registration.triggerUpdateFound(second);
    second.setState("installed");

    expect(onUpdateReady).toHaveBeenCalledTimes(1);
  });

  it("does not arm a reload when apply runs without a waiting worker", () => {
    const container = new FakeContainer();
    container.controller = {};
    const registration = new FakeRegistration();
    const reload = vi.fn();
    let applyFn: (() => void) | null = null;

    const waiting = new FakeWorker();
    registration.waiting = waiting;
    createSwUpdateManager({
      registration: asAny(registration),
      serviceWorker: asAny(container),
      onUpdateReady: (apply) => {
        applyFn = apply;
      },
      reload,
    });

    registration.waiting = null;
    applyFn!();
    container.triggerControllerChange();

    expect(waiting.postMessage).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it("checks for an update when a long-lived tab becomes visible", async () => {
    const container = new FakeContainer();
    const registration = new FakeRegistration();
    const original = Object.getOwnPropertyDescriptor(
      document,
      "visibilityState"
    );

    const dispose = createSwUpdateManager({
      registration: asAny(registration),
      serviceWorker: asAny(container),
      onUpdateReady: vi.fn(),
      reload: vi.fn(),
    });

    try {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "hidden",
      });
      document.dispatchEvent(new Event("visibilitychange"));
      expect(registration.update).not.toHaveBeenCalled();

      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        value: "visible",
      });
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
      expect(registration.update).toHaveBeenCalledTimes(1);
    } finally {
      dispose();
      if (original)
        Object.defineProperty(document, "visibilityState", original);
    }
  });

  it("removes every lifecycle listener when disposed", () => {
    const container = new FakeContainer();
    container.controller = {};
    const registration = new FakeRegistration();
    const onUpdateReady = vi.fn();
    const reload = vi.fn();

    const dispose = createSwUpdateManager({
      registration: asAny(registration),
      serviceWorker: asAny(container),
      onUpdateReady,
      reload,
    });
    dispose();

    const worker = new FakeWorker();
    registration.triggerUpdateFound(worker);
    worker.setState("installed");
    container.triggerControllerChange();
    document.dispatchEvent(new Event("visibilitychange"));

    expect(onUpdateReady).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
    expect(registration.update).not.toHaveBeenCalled();
  });
});

describe("applyWaitingSwUpdateBeforeStart", () => {
  it("does nothing when no update is waiting", async () => {
    const container = new FakeContainer();
    container.controller = {};
    const registration = new FakeRegistration();

    await expect(
      applyWaitingSwUpdateBeforeStart({
        registration: asAny(registration),
        serviceWorker: asAny(container),
        reload: vi.fn(),
      })
    ).resolves.toBe("none");
  });

  it("activates and reloads an update that was waiting before startup", async () => {
    const container = new FakeContainer();
    container.controller = {};
    const registration = new FakeRegistration();
    const waiting = new FakeWorker();
    registration.waiting = waiting;
    const reload = vi.fn();
    const markReload = vi.fn();

    const result = applyWaitingSwUpdateBeforeStart({
      registration: asAny(registration),
      serviceWorker: asAny(container),
      reload,
      markReload,
      timeoutMs: 100,
    });

    expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    container.triggerControllerChange();

    await expect(result).resolves.toBe("reloading");
    expect(markReload).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("defers to the visible update notice if activation does not finish", async () => {
    vi.useFakeTimers();
    try {
      const container = new FakeContainer();
      container.controller = {};
      const registration = new FakeRegistration();
      registration.waiting = new FakeWorker();

      const result = applyWaitingSwUpdateBeforeStart({
        registration: asAny(registration),
        serviceWorker: asAny(container),
        reload: vi.fn(),
        timeoutMs: 100,
      });

      await vi.advanceTimersByTimeAsync(100);
      await expect(result).resolves.toBe("deferred");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("prepareSwBeforeStart", () => {
  const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  const neverSettles = () => new Promise<never>(() => {});

  // Stands in for the window load event, so each test decides when the page
  // has finished loading.
  function pageLoadGate() {
    const tasks: Array<() => void> = [];
    return {
      afterPageLoad: (task: () => void) => {
        tasks.push(task);
      },
      finishLoading: () => {
        for (const task of tasks.splice(0)) task();
      },
    };
  }

  it("starts a first visit without waiting for the worker to install", async () => {
    const container = new FakeContainer();
    const register = vi.fn(neverSettles);
    const pageLoad = pageLoadGate();

    await expect(
      prepareSwBeforeStart({
        serviceWorker: asAny(container),
        register,
        onUpdateReady: vi.fn(),
        afterPageLoad: pageLoad.afterPageLoad,
      })
    ).resolves.toBe("start");

    // The install downloads hundreds of files; it waits for the page itself.
    expect(register).not.toHaveBeenCalled();
    pageLoad.finishLoading();
    expect(register).toHaveBeenCalledOnce();
  });

  it("watches the registration a first visit creates for later updates", async () => {
    const container = new FakeContainer();
    const registration = new FakeRegistration();
    const onUpdateReady = vi.fn();
    const pageLoad = pageLoadGate();

    await prepareSwBeforeStart({
      serviceWorker: asAny(container),
      register: vi.fn().mockResolvedValue(registration),
      onUpdateReady,
      afterPageLoad: pageLoad.afterPageLoad,
    });
    pageLoad.finishLoading();
    await flush();

    // The first worker has claimed the page, so the next deploy is an update.
    container.controller = {};
    const update = new FakeWorker();
    registration.triggerUpdateFound(update);
    update.setState("installed");

    expect(onUpdateReady).toHaveBeenCalledOnce();
  });

  it("holds startup until an update that was already waiting takes over", async () => {
    const container = new FakeContainer();
    container.controller = {};
    const registration = new FakeRegistration();
    const waiting = new FakeWorker();
    registration.waiting = waiting;
    container.registration = registration;
    const reload = vi.fn();

    let settled = false;
    const startup = prepareSwBeforeStart({
      serviceWorker: asAny(container),
      register: vi.fn(neverSettles),
      onUpdateReady: vi.fn(),
      afterPageLoad: vi.fn(),
      reload,
      markReload: vi.fn(),
      timeoutMs: 100,
    }).finally(() => {
      settled = true;
    });
    await flush();

    expect(waiting.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
    expect(settled).toBe(false);

    container.triggerControllerChange();
    await expect(startup).resolves.toBe("reloading");
    expect(reload).toHaveBeenCalledOnce();
  });

  it("watches a returning visit's registration without waiting for register()", async () => {
    const container = new FakeContainer();
    container.controller = {};
    const registration = new FakeRegistration();
    container.registration = registration;
    const register = vi.fn(neverSettles);
    const onUpdateReady = vi.fn();
    const pageLoad = pageLoadGate();

    await expect(
      prepareSwBeforeStart({
        serviceWorker: asAny(container),
        register,
        onUpdateReady,
        afterPageLoad: pageLoad.afterPageLoad,
      })
    ).resolves.toBe("start");

    const update = new FakeWorker();
    registration.triggerUpdateFound(update);
    update.setState("installed");
    expect(onUpdateReady).toHaveBeenCalledOnce();

    // Registering again after load keeps the registration on the current
    // worker script.
    pageLoad.finishLoading();
    expect(register).toHaveBeenCalledOnce();
  });

  it("reloads when a waiting update takes over after startup gave up on it", async () => {
    vi.useFakeTimers();
    try {
      const container = new FakeContainer();
      container.controller = {};
      const registration = new FakeRegistration();
      registration.waiting = new FakeWorker();
      container.registration = registration;
      const reload = vi.fn();

      const startup = prepareSwBeforeStart({
        serviceWorker: asAny(container),
        register: vi.fn(neverSettles),
        onUpdateReady: vi.fn(),
        afterPageLoad: vi.fn(),
        reload,
        markReload: vi.fn(),
        timeoutMs: 100,
      });
      await vi.advanceTimersByTimeAsync(100);
      await expect(startup).resolves.toBe("start");

      container.triggerControllerChange();
      expect(reload).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("service-worker reload marker", () => {
  it("survives the reload boundary and is consumed exactly once", () => {
    const storage = new Map<string, string>();
    const fakeStorage = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    } as unknown as Storage;

    vi.spyOn(Date, "now").mockReturnValue(1_000);
    markSwUpdateReload(fakeStorage);
    expect(storage.get(SW_UPDATE_RELOAD_MARKER_KEY)).toBe("1000");

    expect(consumeSwUpdateReloadMarker(fakeStorage, 1_125)).toEqual({
      occurred: true,
      ageMs: 125,
    });
    expect(consumeSwUpdateReloadMarker(fakeStorage, 1_200)).toEqual({
      occurred: false,
      ageMs: null,
    });

    vi.restoreAllMocks();
  });
});
