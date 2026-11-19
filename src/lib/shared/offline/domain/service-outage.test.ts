import { describe, expect, it } from "vitest";
import {
  classifyServiceFailure,
  isSuspendedProbeResponse,
  outageProbeUrl,
} from "./service-outage";

// Shapes captured on the dev server on 2026-11-18 while Google had the
// Firebase project suspended, plus the ordinary failures they must not match.
function firebaseError(code: string, message: string) {
  return Object.assign(new Error(message), { name: "FirebaseError", code });
}

const suspendedAuth = firebaseError(
  "auth/permission-denied:-consumer-'projects/664225703033'-has-been-suspended.",
  "Firebase: Error (auth/permission-denied:-consumer-'projects/664225703033'-has-been-suspended.)."
);
const firestoreOffline = firebaseError(
  "unavailable",
  "Failed to get document because the client is offline."
);
const rulesDenied = firebaseError(
  "permission-denied",
  "Missing or insufficient permissions."
);
const authDenied = firebaseError(
  "auth/admin-restricted-operation",
  "Firebase: Error (auth/admin-restricted-operation)."
);

const suspendedProbeBody = JSON.stringify({
  error: {
    code: 403,
    message:
      "Permission denied: Consumer 'projects/664225703033' has been suspended.",
    status: "PERMISSION_DENIED",
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.ErrorInfo",
        reason: "CONSUMER_SUSPENDED",
        domain: "googleapis.com",
      },
    ],
  },
});
const rulesDeniedProbeBody = JSON.stringify({
  error: {
    code: 403,
    message: "Missing or insufficient permissions.",
    status: "PERMISSION_DENIED",
  },
});

describe("classifyServiceFailure", () => {
  it("a suspended project named in an Auth error shows the notice at once", () => {
    expect(classifyServiceFailure(suspendedAuth, true)).toBe("suspended");
    // Even with the device reporting offline: the error came from Google.
    expect(classifyServiceFailure(suspendedAuth, false)).toBe("suspended");
  });

  it("Firestore 'client is offline' on an online device asks Google to confirm", () => {
    expect(classifyServiceFailure(firestoreOffline, true)).toBe("unreachable");
  });

  it("a device that is really offline is just the network", () => {
    expect(classifyServiceFailure(firestoreOffline, false)).toBe("none");
  });

  it("an ordinary rules denial is not an outage", () => {
    expect(classifyServiceFailure(rulesDenied, true)).toBe("none");
    expect(classifyServiceFailure(authDenied, true)).toBe("none");
  });

  it("a cache-only Browse catalog read counts as unreachable", () => {
    const cacheOnly = Object.assign(
      new Error("Public catalog read did not reach Firestore"),
      { code: "unavailable" }
    );
    expect(classifyServiceFailure(cacheOnly, true)).toBe("unreachable");
  });

  it("non-errors and success values are ignored", () => {
    expect(classifyServiceFailure(undefined, true)).toBe("none");
    expect(classifyServiceFailure(null, true)).toBe("none");
    expect(classifyServiceFailure("boom", true)).toBe("none");
    expect(classifyServiceFailure({ ok: true }, true)).toBe("none");
  });
});

describe("isSuspendedProbeResponse", () => {
  it("only a 403 that names the suspension confirms it", () => {
    expect(isSuspendedProbeResponse(403, suspendedProbeBody)).toBe(true);
    expect(isSuspendedProbeResponse(403, rulesDeniedProbeBody)).toBe(false);
    // A healthy project answers the missing probe document with 404.
    expect(
      isSuspendedProbeResponse(404, '{"error":{"code":404,"status":"NOT_FOUND"}}')
    ).toBe(false);
    expect(isSuspendedProbeResponse(503, suspendedProbeBody)).toBe(false);
  });

  it("reads one named document, not a collection", () => {
    expect(outageProbeUrl("the-kinetic-alphabet")).toBe(
      "https://firestore.googleapis.com/v1/projects/the-kinetic-alphabet/databases/(default)/documents/publicSequences/outage-probe"
    );
  });
});
