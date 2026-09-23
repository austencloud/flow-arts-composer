import { dev } from "$app/environment";
import type { Handle, HandleServerError } from "@sveltejs/kit";
import {
  isFirebaseAuthHandlerPath,
  proxyFirebaseAuthHandler,
} from "$lib/server/auth/firebase-auth-handler-proxy";
import {
  isMetaOAuthProxyPath,
  proxyMetaOAuthRequest,
} from "$lib/server/auth/meta-oauth-proxy";
import {
  createLandingPageTransformer,
  shouldPreloadRouteAsset,
} from "$lib/server/performance/landing-preload-policy";

/**
 * Check if a request is for a font file that needs CORS headers.
 * PostHog session replay needs to load these files from their replay domain.
 */
function isFontRequest(pathname: string): boolean {
  return (
    pathname.endsWith(".woff2") ||
    pathname.endsWith(".woff") ||
    pathname.endsWith(".ttf") ||
    pathname.endsWith(".otf") ||
    pathname.endsWith(".eot")
  );
}

/**
 * Check if a request is for a CSS file that needs CORS headers.
 * PostHog needs to read CSS rules for accurate replay.
 */
function isCssRequest(pathname: string): boolean {
  return pathname.endsWith(".css");
}

export const handle: Handle = async ({ event, resolve }) => {
  // Firebase OAuth handler reverse proxy. MUST run before resolve(): it serves
  // /__/auth/* first-party on the app host so the Google/Facebook popup completes
  // (see firebase-auth-handler-proxy.ts). Returning here also skips SvelteKit's
  // CSRF origin check, which would 403 the cross-origin POSTs Firebase's handler
  // receives. The functions/__/auth/ Pages Function never ran under
  // adapter-cloudflare's _worker.js — this is the live path.
  if (isFirebaseAuthHandlerPath(event.url.pathname)) {
    return proxyFirebaseAuthHandler(event.request);
  }

  // Meta must redirect to an exact public URL, while the app secret and token
  // exchange stay in Firebase. Serve the branded URL through the same worker
  // layer as the existing Firebase auth handler proxy.
  if (isMetaOAuthProxyPath(event.url.pathname)) {
    return proxyMetaOAuthRequest(event.request);
  }

  // Handle console forwarding endpoint
  if (dev && event.url.pathname === "/api/console-forward") {
    if (event.request.method === "POST") {
      try {
        const body = await event.request.text();
        const data = JSON.parse(body) as { level?: string; message?: string };

        // Write directly to stdout (terminal)
        const timestamp = new Date().toLocaleTimeString();
        const logLine = `[${timestamp}] BROWSER ${data.level ?? "LOG"}: ${data.message ?? ""}`;
        process.stdout.write(logLine + "\n");

        return new Response("OK", { status: 200 });
      } catch {
        return new Response("Error", { status: 500 });
      }
    }
  }

  // Resolve the request with security headers
  const routePath = event.route?.id === "/" ? "/" : event.url.pathname;
  const response = await resolve(event, {
    preload: (asset) => shouldPreloadRouteAsset(routePath, asset),
    transformPageChunk: createLandingPageTransformer(routePath),
  });

  // =========================================================================
  // CORS HEADERS FOR SESSION REPLAY (PostHog)
  // PostHog's replay loads fonts/CSS from their domain to reconstruct the page.
  // Without these headers, fonts don't render and CSS rules can't be read.
  // =========================================================================

  const pathname = event.url.pathname;
  if (isFontRequest(pathname) || isCssRequest(pathname)) {
    // Allow PostHog replay domains to load these resources
    response.headers.set("Access-Control-Allow-Origin", "*");
    response.headers.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  }

  // Set security headers for OAuth authentication flows
  // These headers allow OAuth popups (Google, Facebook, etc.) to properly communicate
  // with the parent window during authentication while maintaining security
  response.headers.set(
    "Cross-Origin-Opener-Policy",
    "same-origin-allow-popups"
  );

  // COEP header - allows cross-origin resources needed for OAuth
  response.headers.set("Cross-Origin-Embedder-Policy", "unsafe-none");

  // `/embed/*` is the embeddable sequence player: other sites frame it in an
  // <iframe>, which is the entire point of the feature, so it is the one
  // family of routes exempt from same-origin framing. XFO has no per-path
  // syntax (SAMEORIGIN or nothing), so it is set for every other route and
  // simply skipped here; CSP's frame-ancestors below carries the actual
  // embed policy and takes precedence over XFO in every browser that reads
  // both.
  const isEmbedRoute = pathname.startsWith("/embed/");
  if (!isEmbedRoute) {
    response.headers.set("X-Frame-Options", "SAMEORIGIN");
  }

  response.headers.set("X-Content-Type-Options", "nosniff");

  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Content Security Policy
  // unsafe-eval required: Three.js TSL uses new Function() for ScriptableNode shader compilation
  const devEmulatorScriptSrc = dev
    ? " http://127.0.0.1:* http://localhost:*"
    : "";
  const scriptSrc = `script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' https://accounts.google.com https://apis.google.com https://rune.tkaflowarts.com https://us-assets.i.posthog.com https://*.posthog.com https://*.firebaseio.com https://cdn.jsdelivr.net https://maps.googleapis.com https://static.cloudflareinsights.com${devEmulatorScriptSrc}`;
  const devEmulatorConnectSrc = dev
    ? " http://127.0.0.1:* http://localhost:* ws://127.0.0.1:*"
    : "";
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      scriptSrc,
      "worker-src 'self' blob:",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://accounts.google.com",
      `connect-src 'self' blob: data: https://*.firebaseio.com https://*.googleapis.com https://*.google.com https://*.cloudfunctions.net https://firestore.googleapis.com https://firebasestorage.googleapis.com https://rune.tkaflowarts.com https://us.i.posthog.com https://*.posthog.com https://assets.tkaflowarts.com https://pub-f5505ed75927471cb198c54336317370.r2.dev https://*.r2.cloudflarestorage.com https://cdn.jsdelivr.net https://cloudflareinsights.com wss://*.firebaseio.com wss://*.peerjs.com ws://localhost:*${devEmulatorConnectSrc}`,
      "img-src 'self' data: blob: https: http:",
      "media-src 'self' blob: https://firebasestorage.googleapis.com https://storage.googleapis.com https://assets.tkaflowarts.com https://pub-f5505ed75927471cb198c54336317370.r2.dev https://*.r2.cloudflarestorage.com",
      "font-src 'self' https://fonts.gstatic.com",
      // firebaseio.com: RTDB falls back to an iframe transport when its websocket fails
      "frame-src 'self' blob: https://accounts.google.com https://*.firebaseapp.com https://*.firebaseio.com https://*.posthog.com",
      // Any site may frame an embed page; every other route stays
      // same-origin-only (matches the X-Frame-Options set above it).
      isEmbedRoute ? "frame-ancestors *" : "frame-ancestors 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; ")
  );

  // Permissions Policy - keep sensor access first-party. Camera supports pose
  // training and recording; geolocation is only requested after someone enters
  // Flow Fest field mode. Neither capability is available to embedded pages.
  response.headers.set(
    "Permissions-Policy",
    "camera=(self), microphone=(self), geolocation=(self), payment=()"
  );

  return response;
};

export const handleError: HandleServerError = async ({
  error,
  event,
  status,
  message,
}) => {
  const err = error instanceof Error ? error : new Error(String(error));

  console.error(
    JSON.stringify({
      level: "error",
      type: "server_error",
      status,
      message: err.message,
      stack: err.stack,
      url: (() => {
        try {
          return event.url.pathname + event.url.search;
        } catch {
          return event.url.pathname;
        }
      })(),
      method: event.request.method,
      userAgent: event.request.headers.get("user-agent") ?? "unknown",
      timestamp: new Date().toISOString(),
    })
  );

  return {
    message: dev ? err.message : message,
    code: status,
  };
};
