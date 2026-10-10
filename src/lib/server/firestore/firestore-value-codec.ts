// Compatibility boundary for server-only callers. The pure codec lives in
// shared code because the Capacitor QR resolver also reads the public
// Firestore REST document when the browser SDK is offline or stalled.
export * from "#lib/shared/firestore/firestore-value-codec.js";
