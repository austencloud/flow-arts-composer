/**
 * Whether this request may ring the owner's phone. Starting a sign-in is
 * public, and one tap on the notification approves from any network, so a
 * notification goes out only for a request started on a local copy of the app
 * by someone at that machine. The live site never sends one, and neither does
 * the dev.tkaflowarts.com tunnel, which forwards to the local dev server and is
 * reachable by anyone.
 *
 * This decides from the incoming request alone. The `site` in a request record
 * is client-described and proves nothing. `offersPhoneSignIn` in where.ts is a
 * different question: it decides whether the button shows, this decides whether
 * a phone rings.
 */

const PROXY_HEADERS = [
  "cf-connecting-ip",
  "cf-ray",
  "cdn-loop",
  "x-forwarded-for",
  "x-forwarded-host",
  "forwarded",
] as const;

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** 127.0.0.0/8, 10.0.0.0/8, 172.16.0.0/12 or 192.168.0.0/16. */
function isPrivateIpv4(host: string): boolean {
  const match = IPV4.exec(host);
  if (!match) return false;
  const [a, b, c, d] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
  ];
  if ([a, b, c, d].some((octet) => octet > 255)) return false;
  return (
    a === 127 ||
    a === 10 ||
    (a === 192 && b === 168) ||
    (a === 172 && b >= 16 && b <= 31)
  );
}

function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    host === "localhost" ||
    host === "[::1]" ||
    host.endsWith(".localhost") ||
    isPrivateIpv4(host)
  );
}

export function mayRingPhone(incoming: {
  dev: boolean;
  url: URL;
  headers: Headers;
}): boolean {
  if (!incoming.dev) return false;
  if (!isLocalHost(incoming.url.hostname)) return false;
  // A tunnel can rewrite the host to localhost, but its headers still show.
  return PROXY_HEADERS.every((name) => !incoming.headers.has(name));
}
