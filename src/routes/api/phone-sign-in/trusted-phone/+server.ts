import type { RequestHandler } from "./$types";
import { phoneSignIn, routeContext } from "#lib/server/auth/phone-sign-in.js";

// The phone starts or stops approving by itself.
export const POST: RequestHandler = (event) =>
  phoneSignIn.trust(event.request, routeContext(event));

export const DELETE: RequestHandler = (event) =>
  phoneSignIn.stopTrusting(event.request, routeContext(event));
