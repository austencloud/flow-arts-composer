/**
 * The id of an FCM token's document at users/{uid}/fcmTokens/{id}: the first 32
 * hex digits of the token's SHA-256. Shared so the browser that saves a token
 * and the server that checks one agree. Imports nothing, so the server can use
 * it without loading Firebase.
 */
export async function fcmTokenDocId(token: string): Promise<string> {
  const data = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}
