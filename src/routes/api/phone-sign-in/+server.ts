import type { RequestHandler } from "./$types";
import { phoneSignIn, routeContext } from "#lib/server/auth/phone-sign-in.js";

// Starts a request: the computer gets its QR, code and collect secret.
export const POST: RequestHandler = (event) =>
  phoneSignIn.create(event.request, routeContext(event));
