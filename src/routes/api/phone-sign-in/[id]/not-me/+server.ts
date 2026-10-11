import type { RequestHandler } from "./$types";
import { phoneSignIn, routeContext } from "#lib/server/auth/phone-sign-in.js";

// "That wasn't me": signs the account out everywhere and stops automatic approval.
export const POST: RequestHandler = (event) =>
  phoneSignIn.notMe(event.request, routeContext(event));
