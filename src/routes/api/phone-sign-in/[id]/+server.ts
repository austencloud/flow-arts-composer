import type { RequestHandler } from "./$types";
import { phoneSignIn, routeContext } from "#lib/server/auth/phone-sign-in.js";

// The phone reads a request before deciding it.
export const GET: RequestHandler = (event) =>
  phoneSignIn.lookup(event.request, routeContext(event));
