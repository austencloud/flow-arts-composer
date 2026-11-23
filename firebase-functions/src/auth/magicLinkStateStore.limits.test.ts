import type * as admin from "firebase-admin";
import {
  createMagicLinkSignInState,
  magicLinkEmailKey,
  MAGIC_LINK_CODE_FAILURE_LIMIT,
  MAGIC_LINK_CODE_LOCK_MS,
  MAGIC_LINK_SEND_LIMITS,
  redeemMagicLinkCode,
  resolveMagicLinkSignInState,
  type MagicLinkSignInState,
  type MagicLinkStoreDeps,
} from "./magicLinkStateStore";

/**
 * A small in-memory Firestore: enough of doc get/set/update, a single-field
 * equality query and runTransaction for the store. Transactions apply their
 * writes at the end, and a throwing `failReads` stands in for an outage.
 */
function createFakeDb() {
  const docs = new Map<string, Record<string, unknown>>();
  const control = { failReads: false };

  function deepMerge(
    base: Record<string, unknown>,
    patch: Record<string, unknown>
  ): Record<string, unknown> {
    const out = { ...base };
    for (const [key, value] of Object.entries(patch)) {
      const current = out[key];
      out[key] =
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        !("toMillis" in value) &&
        current &&
        typeof current === "object"
          ? deepMerge(
              current as Record<string, unknown>,
              value as Record<string, unknown>
            )
          : value;
    }
    return out;
  }

  function snapshot(path: string, id: string) {
    if (control.failReads) throw new Error("firestore unavailable");
    const data = docs.get(path);
    return {
      id,
      exists: data !== undefined,
      data: () => (data ? { ...data } : undefined),
      ref: docRef(path),
    };
  }

  function write(
    path: string,
    data: Record<string, unknown>,
    options?: { merge?: boolean }
  ) {
    docs.set(
      path,
      options?.merge ? deepMerge(docs.get(path) ?? {}, data) : { ...data }
    );
  }

  function docRef(path: string): any {
    const id = path.split("/").pop() as string;
    return {
      id,
      path,
      get: async () => snapshot(path, id),
      set: async (data: Record<string, unknown>, options?: { merge?: boolean }) =>
        write(path, data, options),
    };
  }

  const db = {
    collection: (name: string) => ({
      doc: (id: string) => docRef(`${name}/${id}`),
      where: (field: string, _op: string, value: unknown) => ({
        limit: (n: number) => ({
          get: async () => {
            if (control.failReads) throw new Error("firestore unavailable");
            const matches = [...docs.entries()]
              .filter(
                ([path, data]) =>
                  path.startsWith(`${name}/`) &&
                  path.split("/").length === 2 &&
                  data[field] === value
              )
              .slice(0, n)
              .map(([path]) => snapshot(path, path.split("/")[1] as string));
            return { docs: matches };
          },
        }),
      }),
    }),
    runTransaction: async <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
      const pending: Array<() => void> = [];
      const tx = {
        get: async (ref: any) => ref.get(),
        set: (ref: any, data: any, options?: { merge?: boolean }) => {
          pending.push(() => write(ref.path, data, options));
        },
        update: (ref: any, data: any) => {
          pending.push(() => write(ref.path, data, { merge: true }));
        },
      };
      const result = await fn(tx);
      pending.forEach((apply) => apply());
      return result;
    },
  };

  return { db: db as unknown as admin.firestore.Firestore, docs, control };
}

const EMAIL = "Person@Example.com";
const HOUR = 60 * 60 * 1000;

function requestId(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

function wrongCode(state: MagicLinkSignInState): string {
  return state.oneTimeCode === "000000" ? "000001" : "000000";
}

describe("magic-link send limits and code lock (store)", () => {
  let fake: ReturnType<typeof createFakeDb>;
  let clock: number;
  let deps: MagicLinkStoreDeps;
  let sent: number;

  beforeEach(() => {
    fake = createFakeDb();
    clock = 1_000_000_000_000;
    deps = { db: fake.db, now: () => clock };
    sent = 0;
  });

  async function send(email = EMAIL, caller = "203.0.113.7") {
    sent += 1;
    const id = requestId(sent);
    const result = await createMagicLinkSignInState(
      email,
      id,
      null,
      caller,
      deps
    );
    return { id, result };
  }

  async function sendOk(email = EMAIL, caller = "203.0.113.7") {
    const { id, result } = await send(email, caller);
    if (result.status !== "created") throw new Error("expected a send");
    return { id, state: result };
  }

  it("allows 5 sends an hour per email, counting every capitalisation", async () => {
    for (let i = 0; i < MAGIC_LINK_SEND_LIMITS.emailPerHour; i += 1) {
      const email = i % 2 ? EMAIL : EMAIL.toLowerCase();
      expect((await send(email, `198.51.100.${i}`)).result.status).toBe(
        "created"
      );
    }
    expect((await send(EMAIL, "198.51.100.99")).result.status).toBe(
      "rate-limited"
    );

    clock += HOUR;
    expect((await send(EMAIL, "198.51.100.99")).result.status).toBe("created");
  });

  it("allows 20 sends a day per email", async () => {
    let created = 0;
    for (let hour = 0; hour < 5; hour += 1) {
      for (let i = 0; i < MAGIC_LINK_SEND_LIMITS.emailPerHour; i += 1) {
        const { result } = await send(EMAIL, `198.51.${hour}.${i}`);
        if (result.status === "created") created += 1;
      }
      clock += HOUR;
    }
    expect(created).toBe(MAGIC_LINK_SEND_LIMITS.emailPerDay);

    clock += 20 * HOUR;
    expect((await send(EMAIL, "192.0.2.1")).result.status).toBe("created");
  });

  it("allows 20 sends an hour per caller address across emails", async () => {
    for (let i = 0; i < MAGIC_LINK_SEND_LIMITS.callerPerHour; i += 1) {
      expect(
        (await send(`person${i}@example.com`, "203.0.113.7")).result.status
      ).toBe("created");
    }
    expect(
      (await send("another@example.com", "203.0.113.7")).result.status
    ).toBe("rate-limited");
    expect(
      (await send("another@example.com", "203.0.113.8")).result.status
    ).toBe("created");
  });

  it("refuses the send when the limits cannot be read", async () => {
    fake.control.failReads = true;
    await expect(send()).rejects.toThrow("firestore unavailable");
    fake.control.failReads = false;
    const stateDocs = [...fake.docs.keys()].filter((path) =>
      path.startsWith("magicLinkSignInStates/")
    );
    expect(stateDocs).toEqual([]);
  });

  it("stores only hashes of the email and the caller address as guard ids", async () => {
    await sendOk(EMAIL, "203.0.113.7");
    const guardPaths = [...fake.docs.keys()].filter((path) =>
      path.includes("Guards/")
    );
    expect(guardPaths).toHaveLength(2);
    expect(guardPaths.join(" ")).not.toMatch(/example\.com|203\.0\.113/i);
    expect(guardPaths).toContain(
      `magicLinkEmailGuards/${magicLinkEmailKey(EMAIL)}`
    );
  });

  it("makes every earlier state for the email unusable when a new one is created", async () => {
    const first = await sendOk();
    const second = await sendOk();

    expect(
      await redeemMagicLinkCode(first.id, first.state.oneTimeCode, deps)
    ).toEqual({ status: "invalid" });
    expect(
      await resolveMagicLinkSignInState(first.state.state, deps)
    ).toBeNull();

    expect(
      await redeemMagicLinkCode(second.id, second.state.oneTimeCode, deps)
    ).toEqual({ status: "redeemed", email: EMAIL, initiatingUid: null });
  });

  it("locks typed codes after 10 wrong tries in an hour across all states", async () => {
    // Five wrong codes exhaust one state, so the attacker needs fresh states;
    // the per-email counter still adds them all up.
    let failures = 0;
    let latest = await sendOk(EMAIL, "198.51.100.1");
    while (failures < MAGIC_LINK_CODE_FAILURE_LIMIT) {
      for (let i = 0; i < 5 && failures < MAGIC_LINK_CODE_FAILURE_LIMIT; i += 1) {
        expect(
          await redeemMagicLinkCode(latest.id, wrongCode(latest.state), deps)
        ).toEqual({ status: "invalid" });
        failures += 1;
      }
      if (failures < MAGIC_LINK_CODE_FAILURE_LIMIT) {
        latest = await sendOk(EMAIL, "198.51.100.2");
      }
    }

    // A fresh state with the right code is still refused while locked.
    const fresh = await sendOk(EMAIL, "198.51.100.3");
    expect(
      await redeemMagicLinkCode(fresh.id, fresh.state.oneTimeCode, deps)
    ).toEqual({ status: "locked" });

    // The emailed link keeps working during the lock.
    expect(
      await resolveMagicLinkSignInState(fresh.state.state, deps)
    ).toMatchObject({ email: EMAIL });

    // After the lock lapses typed codes work again (on a new, unexpired state).
    clock += MAGIC_LINK_CODE_LOCK_MS;
    const later = await sendOk(EMAIL, "198.51.100.4");
    expect(
      await redeemMagicLinkCode(later.id, later.state.oneTimeCode, deps)
    ).toEqual({ status: "redeemed", email: EMAIL, initiatingUid: null });
  });

  it("does not lock another email", async () => {
    const victim = await sendOk(EMAIL);
    for (let i = 0; i < 5; i += 1) {
      await redeemMagicLinkCode(victim.id, wrongCode(victim.state), deps);
    }
    const other = await sendOk("other@example.com", "192.0.2.9");
    expect(
      await redeemMagicLinkCode(other.id, other.state.oneTimeCode, deps)
    ).toEqual({
      status: "redeemed",
      email: "other@example.com",
      initiatingUid: null,
    });
  });

  it("still caps a single state at five wrong tries", async () => {
    const { id, state } = await sendOk();
    for (let i = 0; i < 5; i += 1) {
      await redeemMagicLinkCode(id, wrongCode(state), deps);
    }
    expect(await redeemMagicLinkCode(id, state.oneTimeCode, deps)).toEqual({
      status: "invalid",
    });
  });
});
