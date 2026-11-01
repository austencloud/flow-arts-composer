const collection = jest.fn();
const doc = jest.fn();
const runTransaction = jest.fn();

jest.mock("firebase-admin", () => ({
  firestore: Object.assign(
    jest.fn(() => ({ collection, doc, runTransaction })),
    {
      FieldValue: { serverTimestamp: jest.fn() },
    }
  ),
}));

import {
  notifyAdmins,
  notifyAdminsScanDigest,
  notifyAdminsVisitDigest,
} from "./notifyAdmins";

describe("Site visit digest", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("links the first visitor's push to the visitor replay screen", async () => {
    const adminsSnap = { docs: [{ id: "admin-1", data: () => ({}) }] };
    const noAdmins = { docs: [] };
    collection.mockImplementation(() => ({
      where: (field: string) => ({
        get: async () => (field === "role" ? adminsSnap : noAdmins),
      }),
      doc: () => ({
        collection: () => ({ doc: (id: string) => ({ id }) }),
      }),
    }));
    doc.mockReturnValue({ get: async () => ({ data: () => undefined }) });
    const set = jest.fn();
    runTransaction.mockImplementation(async (work) =>
      work({ get: async () => ({ exists: false }), set, update: jest.fn() })
    );

    await notifyAdminsVisitDigest({
      visit: {
        place: "Lyon, France",
        source: "Google",
        device: "iPhone",
        landingPath: "/learn",
        visitNumber: 1,
        postHogSessionId: "019a-session",
      },
      windowMs: 600_000,
      windowMinutes: 10,
      now: 1_200_000,
    });

    expect(set).toHaveBeenCalledWith(
      { id: "site-visit-digest-2" },
      expect.objectContaining({
        actionUrl: "/admin/visitors?notification=site-visit-digest-2",
        postHogSessionId: "019a-session",
      })
    );
  });
});

describe("Pulse agent activity suppression", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("does not write admin notifications for agent activity", async () => {
    await expect(
      notifyAdmins({
        type: "admin-content-created",
        message: 'Codex + Claude saved "TEST"',
        fromUserId: "agent-codex-claude",
        fromUserName: "Codex + Claude",
      })
    ).resolves.toBe(0);

    expect(collection).not.toHaveBeenCalled();
    expect(doc).not.toHaveBeenCalled();
  });

  it("does not create scan digests for agent scans", async () => {
    await notifyAdminsScanDigest({
      code: "TEST",
      label: "TEST",
      scannerName: "Codex + Claude",
      fromUserId: "agent-codex-claude",
      city: "Chicago",
      country: "US",
      lat: 41.8781,
      lng: -87.6298,
      windowMs: 600_000,
      windowMinutes: 10,
      now: 0,
    });

    expect(collection).not.toHaveBeenCalled();
    expect(doc).not.toHaveBeenCalled();
    expect(runTransaction).not.toHaveBeenCalled();
  });
});
