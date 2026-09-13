/**
 * Turn whatever a scanned QR contains into something the short-code resolver
 * understands. Printed TKA cards encode HTTPS://TKA.RUN/{CODE} (optionally
 * with ?bp/rp/vm prop params); legacy offline QRs carried a self-contained
 * "s~..." payload. Anything else — someone pointed the scanner at a random
 * QR — returns null and the scan loop just keeps looking.
 */

import {
	decodeOnce,
	resolveInlineQrPayload,
} from "$lib/shared/navigation/services/inline-qr-envelope";

const TKA_HOSTS = new Set(["tka.run", "www.tka.run"]);

/** Short codes are 4–6 char base36 (see short-code-manager MIN_CODE_LENGTH). */
function isValidCode(candidate: string): boolean {
	return /^[0-9a-zA-Z]{4,6}$/.test(candidate);
}

export function extractScanCode(rawValue: string): string | null {
	const raw = rawValue.trim();
	if (!raw) return null;

	// Self-contained payload, bare. Case matters inside — never uppercase it.
	if (raw.toLowerCase().startsWith("s~")) return raw;

	let url: URL | null = null;
	try {
		url = new URL(raw);
	} catch {
		url = null;
	}

	if (url) {
		if (!TKA_HOSTS.has(url.hostname.toLowerCase())) return null;
		const segments = url.pathname.split("/").filter(Boolean);
		// Both TKA.RUN/{code} and tka.run/q/{code} appear in the wild.
		const segment =
			segments[0]?.toLowerCase() === "q" ? (segments[1] ?? "") : (segments[0] ?? "");

		// `URL.pathname` keeps its percent escapes, and a legacy `s~` payload is
		// base45 (RFC 9285) whose alphabet contains `%` — so an escape here may be
		// the payload's own. The envelope owner decides, and it unescapes only when
		// that is what makes the `q1:`/`r1:`/`raw:` delimiter readable again: a
		// double-encoded link (`s~q1%3A…`) is restored, while `%4A` sitting behind
		// an intact `q1:` is left alone instead of being rewritten to `J`.
		//
		// A payload that reached us through a URL normalizer with its envelope
		// still intact keeps whatever the normalizer escaped (a literal space
		// becomes `%20`). That case stays ambiguous — `%20` is also three valid
		// base45 characters — so it is left for the decoder to fail on loudly
		// rather than guessed at here.
		if (segment.toLowerCase().startsWith("s~")) return resolveInlineQrPayload(segment);

		// A short code can never contain a `%`, so unescaping one is always safe.
		const candidate = decodeOnce(segment);
		return isValidCode(candidate) ? candidate.toUpperCase() : null;
	}

	return isValidCode(raw) ? raw.toUpperCase() : null;
}
