import type { RequestHandler } from "./$types";
import { phoneSignIn, routeContext } from "#lib/server/auth/phone-sign-in.js";

// The phone approves or denies.
export const POST: RequestHandler = (event) =>
  phoneSignIn.decision(event.request, routeContext(event));
