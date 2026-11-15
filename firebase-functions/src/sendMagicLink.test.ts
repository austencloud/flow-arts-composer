import * as functions from "firebase-functions";
import type { UserRecord } from "firebase-admin/auth";
import {
  handleRedeemMagicLinkCode,
  handleResolveMagicLinkEmail,
  handleSendMagicLink,
  type MagicLinkRuntime,
  type RedeemMagicLinkCodeRuntime,
  type ResolveMagicLinkEmailRuntime,
} from "./sendMagicLink";

const REQUEST_ID = "144599f0-7a73-4f38-8f3d-a654dc6c47c6";
const RECIPIENT = "person@example.com";
const MAGIC_LINK_STATE = "a".repeat(43);
const MAGIC_LINK_EXPIRES_AT = 1_800_000;
const MAGIC_LINK =
  "https://the-kinetic-alphabet.firebaseapp.com/__/auth/action?oobCode=secret";

type RuntimeOverrides = Partial<Omit<MagicLinkRuntime, "logger">> & {
  logger?: Partial<MagicLinkRuntime["logger"]>;
};

function providerResponse(
  body: Record<string, unknown>,
  status = 201
): Pick<Response, "ok" | "status" | "json"> {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function createRuntime(overrides: RuntimeOverrides = {}) {
  let now = 1_000;
  const info = jest.fn();
  const error = jest.fn();

  const runtime: MagicLinkRuntime = {
    brevoApiKey: "brevo-test-key",
    senderEmail: "noreply@tkaflowarts.com",
    senderName: "Flow Arts Composer",
    appCheckStatus: "missing",
    authStatus: "anonymous",
    initiatingUid: null,
    now: () => {
      now += 25;
      return now;
    },
    createRequestId: () => REQUEST_ID,
    createSignInState: jest.fn().mockResolvedValue({
      state: MAGIC_LINK_STATE,
      expiresAtMs: MAGIC_LINK_EXPIRES_AT,
      oneTimeCode: "123456",
    }),
    generateLink: jest.fn().mockResolvedValue(MAGIC_LINK),
    fetch: jest
      .fn()
      .mockResolvedValue(providerResponse({ messageId: "brevo-message-1" })),
    ...overrides,
    logger: {
      info,
      error,
      ...overrides.logger,
    },
  };

  return { runtime, info, error };
}

async function expectHttpsError(
  promise: Promise<unknown>,
  code: functions.https.FunctionsErrorCode
) {
  await expect(promise).rejects.toMatchObject({ code });
}

describe("handleSendMagicLink", () => {
  it.each(["", "not-an-email", "person@example"])(
    "rejects invalid recipient input without calling Firebase or Brevo: %p",
    async (email) => {
      const { runtime } = createRuntime();

      await expectHttpsError(
        handleSendMagicLink({ email }, runtime),
        "invalid-argument"
      );

      expect(runtime.generateLink).not.toHaveBeenCalled();
      expect(runtime.fetch).not.toHaveBeenCalled();
    }
  );

  it("reports missing provider configuration without exposing the recipient", async () => {
    const { runtime, error } = createRuntime({ brevoApiKey: undefined });

    await expectHttpsError(
      handleSendMagicLink({ email: RECIPIENT }, runtime),
      "failed-precondition"
    );

    expect(runtime.generateLink).not.toHaveBeenCalled();
    expect(runtime.createSignInState).not.toHaveBeenCalled();
    expect(runtime.fetch).not.toHaveBeenCalled();
    expect(JSON.stringify(error.mock.calls)).not.toContain(RECIPIENT);
  });

  it("maps Firebase's invalid-email error to a callable validation error", async () => {
    const authError = Object.assign(new Error("invalid email"), {
      code: "auth/invalid-email",
    });
    const { runtime } = createRuntime({
      generateLink: jest.fn().mockRejectedValue(authError),
    });

    await expectHttpsError(
      handleSendMagicLink({ email: RECIPIENT }, runtime),
      "invalid-argument"
    );
    expect(runtime.fetch).not.toHaveBeenCalled();
  });

  it("maps a rejected Brevo request to an internal callable error", async () => {
    const { runtime, error } = createRuntime({
      fetch: jest.fn().mockResolvedValue(providerResponse({}, 429)),
    });

    await expectHttpsError(
      handleSendMagicLink({ email: RECIPIENT }, runtime),
      "internal"
    );

    expect(error).toHaveBeenCalledWith(
      "Magic link request failed",
      expect.objectContaining({
        requestId: REQUEST_ID,
        stage: "provider_request",
        providerStatus: 429,
      })
    );
  });

  it("names Brevo's authorised-IP block as a configuration fault", async () => {
    const { runtime, error } = createRuntime({
      fetch: jest.fn().mockResolvedValue(
        providerResponse(
          {
            code: "unauthorized",
            message:
              "We have detected you are using an unrecognised IP address 2001:db8::1.",
          },
          401
        )
      ),
    });

    await expect(
      handleSendMagicLink({ email: RECIPIENT }, runtime)
    ).rejects.toMatchObject({
      code: "failed-precondition",
      details: { reason: "provider/ip-not-authorised" },
    });

    expect(error).toHaveBeenCalledWith(
      "Magic link request failed",
      expect.objectContaining({
        stage: "provider_request",
        providerStatus: 401,
        providerCode: "unauthorized",
        providerReason: "provider/ip-not-authorised",
      })
    );
    // Brevo's message carries our server address; only the reason is logged.
    expect(JSON.stringify(error.mock.calls)).not.toContain("2001:db8");
  });

  it("names a rejected Brevo key as a configuration fault", async () => {
    const { runtime } = createRuntime({
      fetch: jest
        .fn()
        .mockResolvedValue(
          providerResponse({ code: "unauthorized", message: "Key not found" }, 401)
        ),
    });

    await expect(
      handleSendMagicLink({ email: RECIPIENT }, runtime)
    ).rejects.toMatchObject({
      code: "failed-precondition",
      details: { reason: "provider/unauthorized" },
    });
  });

  it("returns provider details and correlates the accepted request", async () => {
    const fetch = jest
      .fn()
      .mockResolvedValue(providerResponse({ messageId: "brevo-message-2" }));
    const { runtime, info } = createRuntime({ fetch });

    await expect(
      handleSendMagicLink(
        {
          email: RECIPIENT,
          continueUrl: "https://tkaflowarts.com/create",
          requestId: REQUEST_ID,
        },
        runtime
      )
    ).resolves.toEqual({
      success: true,
      message: "Email code sent. Check your email.",
      requestId: REQUEST_ID,
      subject: "Your Flow Arts Composer sign-in code",
      senderEmail: "noreply@tkaflowarts.com",
    });

    expect(runtime.generateLink).toHaveBeenCalledWith(RECIPIENT, {
      url: `https://tkaflowarts.com/create?magicLinkState=${MAGIC_LINK_STATE}`,
      handleCodeInApp: true,
    });
    expect(runtime.createSignInState).toHaveBeenCalledWith(
      RECIPIENT,
      REQUEST_ID,
      null
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://api.brevo.com/v3/smtp/email",
      expect.objectContaining({ method: "POST" })
    );
    const request = fetch.mock.calls[0]?.[1] as RequestInit;
    const payload = JSON.parse(String(request.body)) as {
      htmlContent: string;
      textContent: string;
    };
    expect(payload).toEqual(
      expect.objectContaining({
        to: [{ email: RECIPIENT }],
        subject: "Your Flow Arts Composer sign-in code",
        tags: ["authentication", "magic-link"],
        headers: { "X-Mailin-custom": `request_id:${REQUEST_ID}` },
      })
    );
    expect(payload.htmlContent).toMatch(/expires in\s+30 minutes/);
    expect(payload.htmlContent).toContain("123456");
    expect(payload.textContent).toContain("123456");
    expect(payload.htmlContent.indexOf("123456")).toBeLessThan(
      payload.htmlContent.indexOf(MAGIC_LINK)
    );
    expect(payload.textContent.indexOf("123456")).toBeLessThan(
      payload.textContent.indexOf(MAGIC_LINK)
    );
    expect(String(request.body)).not.toContain("expires in 1 hour");
    expect(info).toHaveBeenCalledWith(
      "Magic link provider accepted",
      expect.objectContaining({
        requestId: REQUEST_ID,
        providerMessageId: "brevo-message-2",
        providerStatus: 201,
      })
    );
  });

  it("uses the canonical Create route when no continuation is provided", async () => {
    const { runtime } = createRuntime();

    await handleSendMagicLink({ email: RECIPIENT }, runtime);

    expect(runtime.generateLink).toHaveBeenCalledWith(RECIPIENT, {
      url: `https://tkaflowarts.com/create?magicLinkState=${MAGIC_LINK_STATE}`,
      handleCodeInApp: true,
    });
  });

  it("maps a provider timeout to a retryable callable error", async () => {
    const { runtime, error } = createRuntime({
      fetch: jest
        .fn()
        .mockRejectedValue(new DOMException("timed out", "TimeoutError")),
    });

    await expectHttpsError(
      handleSendMagicLink({ email: RECIPIENT }, runtime),
      "unavailable"
    );
    expect(error).toHaveBeenCalledWith(
      "Magic link request failed",
      expect.objectContaining({ errorCode: "provider/timeout" })
    );
  });

  it("never writes a recipient or sign-in link to structured logs", async () => {
    const { runtime, info, error } = createRuntime();

    await handleSendMagicLink({ email: RECIPIENT }, runtime);

    const serializedLogs = JSON.stringify({
      info: info.mock.calls,
      error: error.mock.calls,
    });
    expect(serializedLogs).not.toContain(RECIPIENT);
    expect(serializedLogs).not.toContain(MAGIC_LINK);
    expect(serializedLogs).toContain(REQUEST_ID);
  });
});

describe("handleRedeemMagicLinkCode", () => {
  function user(
    uid: string,
    email: string | undefined,
    providerEmails: string[] = [],
    disabled = false
  ) {
    return {
      uid,
      email,
      disabled,
      providerData: providerEmails.map((providerEmail) => ({
        providerId: "google.com",
        email: providerEmail,
      })),
    } as UserRecord;
  }

  function createRedeemRuntime(
    overrides: Partial<RedeemMagicLinkCodeRuntime> = {}
  ): RedeemMagicLinkCodeRuntime {
    return {
      redeemCode: jest.fn().mockResolvedValue({
        email: RECIPIENT,
        initiatingUid: null,
      }),
      getUser: jest.fn(),
      getUserByEmail: jest
        .fn()
        .mockResolvedValue(user("existing-1", RECIPIENT)),
      createUser: jest.fn(),
      updateUser: jest.fn(),
      createCustomToken: jest.fn().mockResolvedValue("custom-token"),
      ...overrides,
    };
  }

  it("returns a custom token for the account resolved by the verified code", async () => {
    const runtime = createRedeemRuntime();

    await expect(
      handleRedeemMagicLinkCode(
        { action: "redeem-code", requestId: REQUEST_ID, code: "123456" },
        runtime
      )
    ).resolves.toEqual({ success: true, customToken: "custom-token" });
    expect(runtime.createCustomToken).toHaveBeenCalledWith("existing-1");
    expect(runtime.createUser).not.toHaveBeenCalled();
  });

  it("creates an email-verified account when the code belongs to a new email", async () => {
    const runtime = createRedeemRuntime({
      getUserByEmail: jest
        .fn()
        .mockRejectedValue({ code: "auth/user-not-found" }),
      createUser: jest.fn().mockResolvedValue(user("new-1", RECIPIENT)),
    });

    await handleRedeemMagicLinkCode(
      { action: "redeem-code", requestId: REQUEST_ID, code: "123456" },
      runtime
    );

    expect(runtime.createUser).toHaveBeenCalledWith({
      email: RECIPIENT,
      emailVerified: true,
    });
    expect(runtime.createCustomToken).toHaveBeenCalledWith("new-1");
  });

  it("keeps the initiating uid and associates the newly verified email", async () => {
    const canonical = user("canonical-1", "primary@example.com", [
      "primary@example.com",
    ]);
    const updated = user("canonical-1", RECIPIENT, ["primary@example.com"]);
    const runtime = createRedeemRuntime({
      redeemCode: jest.fn().mockResolvedValue({
        email: RECIPIENT,
        initiatingUid: "canonical-1",
      }),
      getUser: jest.fn().mockResolvedValue(canonical),
      getUserByEmail: jest
        .fn()
        .mockRejectedValue({ code: "auth/user-not-found" }),
      updateUser: jest.fn().mockResolvedValue(updated),
    });

    await handleRedeemMagicLinkCode(
      { action: "redeem-code", requestId: REQUEST_ID, code: "123456" },
      runtime
    );

    expect(runtime.updateUser).toHaveBeenCalledWith("canonical-1", {
      email: RECIPIENT,
      emailVerified: true,
    });
    expect(runtime.createCustomToken).toHaveBeenCalledWith("canonical-1");
  });

  it("rejects invalid or consumed codes without looking up an account", async () => {
    const runtime = createRedeemRuntime({
      redeemCode: jest.fn().mockResolvedValue(null),
    });

    await expectHttpsError(
      handleRedeemMagicLinkCode(
        { action: "redeem-code", requestId: REQUEST_ID, code: "000000" },
        runtime
      ),
      "failed-precondition"
    );
    expect(runtime.getUserByEmail).not.toHaveBeenCalled();
    expect(runtime.createCustomToken).not.toHaveBeenCalled();
  });
});

describe("handleResolveMagicLinkEmail", () => {
  function createResolveRuntime(
    result: Awaited<
      ReturnType<ResolveMagicLinkEmailRuntime["resolveSignInState"]>
    >
  ): ResolveMagicLinkEmailRuntime {
    return {
      resolveSignInState: jest.fn().mockResolvedValue(result),
    };
  }

  it("returns the email bound to a valid opaque state", async () => {
    const runtime = createResolveRuntime({
      email: RECIPIENT,
      expiresAtMs: MAGIC_LINK_EXPIRES_AT,
    });

    await expect(
      handleResolveMagicLinkEmail(
        { action: "resolve-email", state: MAGIC_LINK_STATE },
        runtime
      )
    ).resolves.toEqual({
      success: true,
      email: RECIPIENT,
    });
    expect(runtime.resolveSignInState).toHaveBeenCalledWith(MAGIC_LINK_STATE);
  });

  it("rejects missing, malformed, or expired state without returning an email", async () => {
    const runtime = createResolveRuntime(null);

    await expectHttpsError(
      handleResolveMagicLinkEmail(
        { action: "resolve-email", state: "expired" },
        runtime
      ),
      "failed-precondition"
    );
  });
});
