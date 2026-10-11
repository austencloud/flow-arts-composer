import type { RequestHandler } from "./$types";
import { phoneSignIn, routeContext } from "#lib/server/auth/phone-sign-in.js";

// A trusted phone approves by itself.
export const POST: RequestHandler = (event) =>
  phoneSignIn.auto(event.request, routeContext(event));
