// The phone's side of phone sign-in, opened by scanning the computer's QR
// code. It needs the phone's sign-in and its stored key, so it renders in the
// browser only. Unlisted; hooks.server.ts marks it noindex.
export const ssr = false;
export const prerender = false;
