/**
 * Turn whatever a scanned QR contains into something the short-code resolver
 * understands. Printed TKA cards encode HTTPS://TKA.RUN/{CODE} (optionally
 * with ?bp/rp/vm prop params); legacy offline QRs carried a self-contained
 * "s~..." payload. Anything else — someone pointed the scanner at a random
 * QR — returns null and the scan loop just keeps looking.
 */

const TKA_HOSTS = new Set(["tka.run", "www.tka.run"]);

/** Short codes are 4–6 char base36 (see short-code-manager MIN_CODE_LENGTH). */
function isValidCode(candidate: string): boolean {
	return /^[0-9a-zA-Z]{4,6}$/.test(candidate);
}

/**
 * `URL.pathname` keeps its percent escapes. A short code never has any, but a
 * legacy `s~` payload is base45 (RFC 9285) and its alphabet includes space,
 * `%`, `+` and `/` — so any link that has been through a URL normalizer arrives
 * as `s~q1:A%20B…`, and handing that to the QR decoder fails on the first
 * character that is not in the alphabet. Malformed escapes keep the raw text
 * rather than throwing: a scan loop must be able to reject junk, not crash on it.
 */
function decodeSegment(segment: string): string {
	if (!segment.includes("%")) return segment;
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
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
		const candidate = decodeSegment(
			segments[0]?.toLowerCase() === "q" ? (segments[1] ?? "") : (segments[0] ?? "")
		);
		if (candidate.toLowerCase().startsWith("s~")) return candidate;
		return isValidCode(candidate) ? candidate.toUpperCase() : null;
	}

	return isValidCode(raw) ? raw.toUpperCase() : null;
}
