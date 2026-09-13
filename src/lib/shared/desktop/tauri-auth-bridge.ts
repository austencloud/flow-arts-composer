import {
	GoogleAuthProvider,
	signInWithCredential,
	type OAuthCredential,
} from "firebase/auth";
import { auth } from "$lib/shared/auth/firebase";
import { GOOGLE_CLIENT_ID } from "$lib/shared/auth/config/google-oauth";

/** How long the loopback redirect may take before the attempt is abandoned. */
const OAUTH_TIMEOUT_MS = 120_000;

/**
 * Obtain a Google credential via the desktop OAuth bridge: a loopback server
 * (oauth_server.rs) catches the redirect from the system browser, so the
 * WebView never has to host Google's sign-in (which it blocks). Mirrors
 * nativeGoogleCredential() on Capacitor — callers link, sign in, or
 * reauthenticate with the credential themselves.
 */
export async function desktopGoogleCredential(): Promise<OAuthCredential> {
	const { invoke } = await import("@tauri-apps/api/core");
	const { open } = await import("@tauri-apps/plugin-shell");
	const { listen } = await import("@tauri-apps/api/event");

	const port: number = await invoke("start_oauth_server");

	const redirectUri = `http://127.0.0.1:${port}`;
	const nonce = crypto.randomUUID();

	const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
	authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
	authUrl.searchParams.set("redirect_uri", redirectUri);
	authUrl.searchParams.set("response_type", "id_token");
	authUrl.searchParams.set("scope", "openid email profile");
	authUrl.searchParams.set("nonce", nonce);
	authUrl.searchParams.set("prompt", "select_account");

	let resolveToken: (token: string) => void;
	let rejectToken: (err: Error) => void;
	const tokenPromise = new Promise<string>((resolve, reject) => {
		resolveToken = resolve;
		rejectToken = reject;
	});
	// The caller stops awaiting tokenPromise as soon as any step below throws,
	// so keep a handler attached: without one, a rejection arriving after that
	// point surfaces in the WebView as an unhandled rejection.
	tokenPromise.catch(() => undefined);

	const unlisten = await listen<{ id_token: string }>(
		"oauth-callback",
		(event) => {
			resolveToken!(event.payload.id_token);
		}
	);

	// Registered only once the subscription exists, so a failed listen() has
	// nothing to clean up.
	const timeout = setTimeout(() => {
		rejectToken!(new Error("OAuth timed out after 2 minutes"));
	}, OAUTH_TIMEOUT_MS);

	// `open()` belongs inside the try: "oauth-callback" is a GLOBAL Tauri
	// event, so a shell that cannot launch a browser used to leave the
	// subscription behind, where it would consume a LATER attempt's callback,
	// plus a two-minute timer that then rejected into nothing.
	try {
		await open(authUrl.toString());
		const idToken = await tokenPromise;
		return GoogleAuthProvider.credential(idToken);
	} finally {
		clearTimeout(timeout);
		unlisten();
	}
}

export async function signInWithDesktopOAuth(): Promise<void> {
	try {
		const credential = await desktopGoogleCredential();
		await signInWithCredential(auth, credential);
	} catch (err) {
		console.error("[DesktopOAuth] Sign-in failed:", err);
		throw err;
	}
}
