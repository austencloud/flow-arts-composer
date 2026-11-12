/**
 * Link-preview tags for the client-only app shell (`/[...appPath]`).
 *
 * With ssr=false the server never renders a page's `<svelte:head>` and never
 * runs its server load (see `rejectUnknownAppPath` in `hooks.server.ts`), so
 * `/create` reached a chat app or a crawler with no title, description or
 * image. `handle` injects these tags into the shell's `</head>` instead.
 *
 * These are for link previews only. The shells stay `X-Robots-Tag: noindex`
 * (`robotsTagForRoute`): their content is signed-in, client-rendered state.
 *
 * Every value comes from the table below, never from the request, except the
 * fallback `og:url`, which is the request pathname with `&` escaped. A parsed
 * URL's pathname already percent-encodes `"`, `<` and `>`.
 */
import { LANDING_DOMAIN } from "../../../config/domains";

/** The site-wide share image, the same one `Seo.svelte` defaults to. */
export const APP_SHELL_OG_IMAGE = `${LANDING_DOMAIN}/branding/og-image.png`;

interface AppShellHead {
  title: string;
  description: string;
}

const APP_SHELL_HEADS: Readonly<Record<string, AppShellHead>> = {
  "/create": {
    title: "Create a Sequence | Flow Arts Composer",
    description:
      "Build a flow arts sequence step by step in The Kinetic Alphabet notation, then watch it play.",
  },
  "/create/generate": {
    title: "Generate a Sequence | Flow Arts Composer",
    description:
      "Pick a length and a level, and Flow Arts Composer writes a flow arts sequence you can play and edit.",
  },
  "/browse/explore/sequences": {
    title: "Explore Sequences | Flow Arts Composer",
    description:
      "Browse flow arts sequences shared by spinners, with animated notation for each one.",
  },
};

const FALLBACK_HEAD: AppShellHead = {
  title: "Flow Arts Composer",
  description:
    "Write, play and share flow arts choreography in The Kinetic Alphabet notation.",
};

function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed.toLowerCase();
}

/** The head tags for one app-shell path, as an HTML string. */
export function appShellHeadTags(pathname: string): string {
  const path = normalizePath(pathname);
  const head = APP_SHELL_HEADS[path] ?? FALLBACK_HEAD;
  const url = `${LANDING_DOMAIN}${path}`.replace(/&/g, "&amp;");

  return [
    `<title>${head.title}</title>`,
    `<meta name="description" content="${head.description}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Flow Arts Composer">`,
    `<meta property="og:title" content="${head.title}">`,
    `<meta property="og:description" content="${head.description}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${APP_SHELL_OG_IMAGE}">`,
    `<meta property="og:image:width" content="1200">`,
    `<meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${head.title}">`,
    `<meta name="twitter:description" content="${head.description}">`,
    `<meta name="twitter:image" content="${APP_SHELL_OG_IMAGE}">`,
  ].join("\n    ");
}

/**
 * Adds the shell's tags before `</head>`. A chunk without `</head>` passes
 * through, and so does a page that already carries a `<title>`.
 */
export function injectAppShellHead(html: string, pathname: string): string {
  const headEnd = html.indexOf("</head>");
  if (headEnd === -1) return html;
  if (/<title[\s>]/i.test(html.slice(0, headEnd))) return html;
  return `${html.slice(0, headEnd)}    ${appShellHeadTags(pathname)}\n  ${html.slice(headEnd)}`;
}
