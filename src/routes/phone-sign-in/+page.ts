// The computer's side of phone sign-in: a QR code that the signed-in phone
// approves. It reads the browser's sign-in state and polls, so it renders in
// the browser only. Unlisted; hooks.server.ts marks it noindex.
export const ssr = false;
export const prerender = false;
