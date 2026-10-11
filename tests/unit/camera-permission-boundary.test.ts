import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const errorHandler = vi.hoisted(() => ({
  showUserError: vi.fn(),
}));

vi.mock("#lib/shared/application/get-error-handler.js", () => ({
  getErrorHandler: () => errorHandler,
}));

vi.mock("#lib/server/auth/firebase-auth-handler-proxy.js", () => ({
  isFirebaseAuthHandlerPath: () => false,
  proxyFirebaseAuthHandler: vi.fn(),
}));

vi.mock("#lib/server/auth/meta-oauth-proxy.js", () => ({
  isMetaOAuthProxyPath: () => false,
  proxyMetaOAuthRequest: vi.fn(),
}));

import { handle } from "../../src/hooks.server";
import { CameraManager } from "#lib/shared/train/services/camera-manager.js";

const originalMediaDevices = Object.getOwnPropertyDescriptor(
  navigator,
  "mediaDevices"
);

function rejectCameraAccess(error: Error) {
  const getUserMedia = vi.fn().mockRejectedValue(error);
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia },
  });
  return getUserMedia;
}

describe("camera permission boundary", () => {
  beforeEach(() => {
    errorHandler.showUserError.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(() => {
    if (originalMediaDevices) {
      Object.defineProperty(navigator, "mediaDevices", originalMediaDevices);
    } else {
      Reflect.deleteProperty(navigator, "mediaDevices");
    }
  });

  it("allows same-origin pages to request camera access", async () => {
    const request = new Request(
      "https://localhost:5173/create/generate?v=DDN8"
    );
    const response = await handle({
      event: {
        url: new URL(request.url),
        request,
      },
      resolve: async () => new Response("ok"),
    } as Parameters<typeof handle>[0]);

    expect(response.headers.get("Permissions-Policy")).toBe(
      "camera=(self), microphone=(self), geolocation=(self), payment=()"
    );
  });

  it("keeps a denied camera prompt inline instead of opening the bug reporter", async () => {
    const denial = new Error("Permission denied");
    denial.name = "NotAllowedError";
    const getUserMedia = rejectCameraAccess(denial);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const camera = new CameraManager();

    await expect(camera.start()).rejects.toMatchObject({
      message: "Camera access was denied. Check your browser permissions.",
      cause: denial,
    });
    expect(getUserMedia).toHaveBeenCalledOnce();
    expect(errorHandler.showUserError).not.toHaveBeenCalled();
  });
});
