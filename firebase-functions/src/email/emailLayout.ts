// The one visual owner for every email Flow Arts Composer sends: palette,
// wordmark header, content panel, buttons and footer. Each email composes
// these blocks; none writes its own <html> shell.
//
// Mail clients are not browsers. Layout is tables with inline styles; the
// <style> block only adds progressive extras (the Fraunces wordmark, narrow
// padding, link color resets) that Gmail and Apple Mail honor and Outlook
// ignores. The design is dark by authorship, matching the app, and declares
// color-scheme so clients that respect it leave it alone.

const APP_ORIGIN = "https://tkaflowarts.com";

export const emailPalette = {
  page: "#0b0b14",
  panel: "#15151f",
  panelStroke: "#272738",
  inset: "#1c1c29",
  insetStroke: "#2f2f44",
  divider: "#262636",
  textStrong: "#f5f4fc",
  text: "#c8c7d9",
  muted: "#8e8da6",
  faint: "#6c6b84",
  buttonFrom: "#5865f2",
  buttonTo: "#7b4fe0",
  buttonFallback: "#6a5ae9",
  buttonText: "#ffffff",
  secondaryFill: "#1f1f2e",
  secondaryStroke: "#3a3a54",
  linkText: "#cfc8ff",
  linkFill: "#24213f",
  linkStroke: "#3b3566",
  added: "#6fe0ae",
  improved: "#8fb2ff",
  fixed: "#ffbf73",
} as const;

const SANS =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Fraunces,Georgia,'Times New Roman',serif";
const MONO =
  "ui-monospace,SFMono-Regular,Menlo,Consolas,'Courier New',monospace";

export type EmailTone = "added" | "improved" | "fixed" | "accent";

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[character] || character
  );
}

export interface EmailDocument {
  /** Plain text for <title>. */
  title: string;
  /** Plain text the inbox shows beside the subject. */
  preheader: string;
  /** Panel content built from the block helpers below. */
  body: string;
  /** Footer content built from footerText(). */
  footer: string;
}

export function renderEmail(doc: EmailDocument): string {
  // Zero-width padding after the preheader keeps clients from pulling body
  // text into the inbox preview.
  const previewPad = "&#8199;&#847;".repeat(60);

  return `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${escapeHtml(doc.title)}</title>
<style>
@font-face{font-family:'Fraunces';font-style:italic;font-weight:700;src:url(${APP_ORIGIN}/fonts/fraunces/fraunces-700-italic-latin.woff2) format('woff2')}
:root{color-scheme:dark;supported-color-schemes:dark}
body{margin:0;padding:0;background-color:${emailPalette.page}}
a{text-decoration:none}
@media (max-width:600px){
  .fac-gutter{padding-left:12px!important;padding-right:12px!important}
  .fac-panel{padding:28px 22px!important}
  .fac-headline{font-size:27px!important;line-height:33px!important}
  .fac-code{font-size:32px!important;letter-spacing:8px!important;padding-left:8px!important}
  .fac-button-cell{display:block!important;padding:0 0 10px!important}
}
</style>
</head>
<body style="margin:0;padding:0;background-color:${emailPalette.page}">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${emailPalette.page}">${escapeHtml(doc.preheader)}${previewPad}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="${emailPalette.page}" style="background-color:${emailPalette.page}">
<tr><td align="center" class="fac-gutter" style="padding:36px 20px 40px">
<!--[if mso]><table role="presentation" width="600" align="center" cellspacing="0" cellpadding="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px">
<tr><td style="padding:0 6px 18px;font-family:${SERIF};font-style:italic;font-weight:700;font-size:20px;line-height:26px;letter-spacing:-0.2px;color:${emailPalette.textStrong}"><a href="${APP_ORIGIN}" target="_blank" style="color:${emailPalette.textStrong};text-decoration:none">Flow Arts Composer</a></td></tr>
<tr><td class="fac-panel" bgcolor="${emailPalette.panel}" style="background-color:${emailPalette.panel};border:1px solid ${emailPalette.panelStroke};border-radius:18px;padding:36px 40px">
${doc.body}
</td></tr>
<tr><td style="padding:24px 8px 0">
${doc.footer}
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
}

/** Small sentence-case context line above a headline. Plain text in. */
export function metaLine(text: string): string {
  return `<p style="margin:0 0 10px;font-family:${SANS};font-size:14px;line-height:20px;color:${emailPalette.muted}">${escapeHtml(text)}</p>`;
}

/**
 * The panel's one headline. Plain text in. Only an editorial announcement
 * (a release) speaks in the brand serif; a message, a status or a code is
 * ordinary product text (visual-design-canon.md, Typography).
 */
export function headline(
  text: string,
  options: { editorial?: boolean } = {}
): string {
  const voice = options.editorial
    ? `font-family:${SERIF};font-style:italic;font-weight:700;font-size:32px;line-height:38px;letter-spacing:-0.4px`
    : `font-family:${SANS};font-weight:700;font-size:24px;line-height:31px;letter-spacing:-0.2px`;
  const mobileClass = options.editorial ? ` class="fac-headline"` : "";
  return `<h1${mobileClass} style="margin:0 0 12px;${voice};color:${emailPalette.textStrong}">${escapeHtml(text)}</h1>`;
}

/** Body paragraph. HTML in: callers escape or use richTextToHtml(). */
export function paragraph(
  html: string,
  options: { last?: boolean } = {}
): string {
  return `<p style="margin:0 0 ${options.last ? 0 : 22}px;font-family:${SANS};font-size:16px;line-height:26px;color:${emailPalette.text}">${html}</p>`;
}

export interface EmailButton {
  label: string;
  href: string;
  variant?: "primary" | "secondary";
}

/** One row of buttons. Table cells keep their fill and padding in Outlook. */
export function buttonRow(
  buttons: EmailButton[],
  options: { spaceAbove?: number; spaceBelow?: number } = {}
): string {
  const cells = buttons
    .map((button, index) => {
      const primary = (button.variant ?? "primary") === "primary";
      const fill = primary
        ? `background-color:${emailPalette.buttonFallback};background-image:linear-gradient(135deg,${emailPalette.buttonFrom},${emailPalette.buttonTo})`
        : `background-color:${emailPalette.secondaryFill};border:1px solid ${emailPalette.secondaryStroke}`;
      const bgcolor = primary
        ? emailPalette.buttonFallback
        : emailPalette.secondaryFill;
      const gap =
        index < buttons.length - 1
          ? "padding:0 10px 10px 0"
          : "padding:0 0 10px";
      return `<td class="fac-button-cell" style="${gap}"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td bgcolor="${bgcolor}" style="${fill};border-radius:12px"><a href="${escapeHtml(button.href)}" target="_blank" style="display:inline-block;padding:14px 22px;font-family:${SANS};font-size:16px;line-height:20px;font-weight:650;color:${emailPalette.buttonText};text-decoration:none;border-radius:12px;white-space:nowrap">${escapeHtml(button.label)}</a></td></tr></table></td>`;
    })
    .join("");
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:${options.spaceAbove ?? 4}px 0 ${Math.max((options.spaceBelow ?? 0) - 10, 0)}px"><tr>${cells}</tr></table>`;
}

export function divider(): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:30px 0 28px"><tr><td style="height:1px;line-height:1px;font-size:1px;background-color:${emailPalette.divider}">&nbsp;</td></tr></table>`;
}

/** A titled list of changes. The heading carries the category. Items are HTML. */
export function changeSection(input: {
  heading: string;
  items: string[];
}): string {
  const rows = input.items
    .map(
      (item) =>
        `<tr><td valign="top" style="width:18px;padding:0 0 10px;font-family:${SANS};font-size:15px;line-height:24px;color:${emailPalette.faint}">&ndash;</td><td valign="top" style="padding:0 0 10px;font-family:${SANS};font-size:15px;line-height:24px;color:${emailPalette.text}">${item}</td></tr>`
    )
    .join("");
  return `<p style="margin:0 0 10px;font-family:${SANS};font-size:15px;line-height:20px;font-weight:700;color:${emailPalette.textStrong}">${escapeHtml(input.heading)}</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 14px">${rows}</table>`;
}

/** A standalone link, sized like a small button. Plain text in. */
export function linkPill(label: string, href: string): string {
  return `<a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:7px 14px;font-family:${SANS};font-size:14px;line-height:20px;font-weight:600;color:${emailPalette.linkText};background-color:${emailPalette.linkFill};border-radius:999px;text-decoration:none">${escapeHtml(label)} &rarr;</a>`;
}

/** A tinted pill naming a state, e.g. "Resolved". Plain text in. */
export function statusChip(label: string, tone: EmailTone): string {
  const color = toneColor(tone);
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px"><tr><td style="border:1px solid ${color};border-radius:999px;padding:4px 12px 4px 10px;font-family:${SANS};font-size:13px;line-height:18px;font-weight:650;color:${color}"><span style="font-size:10px;vertical-align:1px">&#9679;</span>&nbsp; ${escapeHtml(label)}</td></tr></table>`;
}

/** A quoted surface for words someone else wrote. HTML in. */
export function insetBlock(html: string): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:6px 0 26px"><tr><td bgcolor="${emailPalette.inset}" style="background-color:${emailPalette.inset};border:1px solid ${emailPalette.insetStroke};border-radius:14px;padding:18px 20px;font-family:${SANS};font-size:16px;line-height:26px;color:${emailPalette.text}">${html}</td></tr></table>`;
}

/** A one-time code, large and spaced for reading off one screen into another. */
export function codeBlock(code: string): string {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 22px"><tr><td align="center" bgcolor="${emailPalette.inset}" style="background-color:${emailPalette.inset};border:1px solid ${emailPalette.insetStroke};border-radius:14px;padding:22px 12px"><span class="fac-code" style="font-family:${MONO};font-size:38px;line-height:44px;font-weight:700;letter-spacing:12px;padding-left:12px;color:${emailPalette.textStrong}">${escapeHtml(code)}</span></td></tr></table>`;
}

/**
 * The person's profile photo in a circle. Their initial shows on the same
 * circle when there is no photo or the client blocks images.
 */
export function avatar(name: string, photoUrl?: string): string {
  const initial = Array.from(name.trim())[0]?.toUpperCase() || "?";
  const photo = photoUrl && /^https:\/\//i.test(photoUrl) ? photoUrl : "";
  const face = photo
    ? `<img src="${escapeHtml(photo)}" width="52" height="52" alt="${escapeHtml(initial)}" style="display:block;width:52px;height:52px;border:0;border-radius:26px;font-family:${SANS};font-size:22px;line-height:52px;font-weight:700;color:${emailPalette.textStrong};text-align:center">`
    : escapeHtml(initial);
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 18px"><tr><td align="center" valign="middle" width="52" height="52" bgcolor="${emailPalette.linkFill}" style="width:52px;height:52px;border-radius:26px;background-color:${emailPalette.linkFill};font-family:${SANS};font-weight:700;font-size:22px;line-height:52px;color:${emailPalette.linkText}">${face}</td></tr></table>`;
}

/** Footer line. HTML in; may hold footerLink(). */
export function footerText(html: string): string {
  return `<p style="margin:0 0 10px;font-family:${SANS};font-size:13px;line-height:20px;color:${emailPalette.muted}">${html}</p>`;
}

export function footerLink(label: string, href: string): string {
  return `<a href="${escapeHtml(href)}" target="_blank" style="color:${emailPalette.text};background-color:${emailPalette.secondaryFill};border:1px solid ${emailPalette.secondaryStroke};border-radius:999px;padding:2px 10px;text-decoration:none;font-weight:600;white-space:nowrap">${escapeHtml(label)}</a>`;
}

/** The address line every email ends with. */
export function footerSignature(): string {
  return `<p style="margin:14px 0 0;font-family:${SANS};font-size:12px;line-height:18px;color:${emailPalette.faint}">Flow Arts Composer &middot; <a href="${APP_ORIGIN}" target="_blank" style="color:${emailPalette.faint};text-decoration:none">tkaflowarts.com</a></p>`;
}

function toneColor(tone: EmailTone): string {
  return tone === "accent" ? emailPalette.linkText : emailPalette[tone];
}
