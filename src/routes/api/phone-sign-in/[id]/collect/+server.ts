import type { RequestHandler } from "./$types";
import { phoneSignIn, routeContext } from "#lib/server/auth/phone-sign-in.js";

// The computer asks for its sign-in pass.
export const POST: RequestHandler = (event) =>
  phoneSignIn.collect(event.request, routeContext(event));
