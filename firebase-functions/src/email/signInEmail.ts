import {
  buttonRow,
  codeBlock,
  escapeHtml,
  footerSignature,
  footerText,
  headline,
  paragraph,
  renderEmail,
} from "./emailLayout";

/** The sign-in code email. The code leads; the browser link is the fallback. */
export function createSignInCodeHtml(code: string, magicLink: string): string {
  return renderEmail({
    title: "Your Flow Arts Composer sign-in code",
    preheader: `${code} is your sign-in code. It expires in 30 minutes.`,
    body: [
      headline("Your sign-in code"),
      paragraph("Enter this code in Flow Arts Composer to finish signing in."),
      codeBlock(code),
      paragraph("It expires in 30 minutes."),
      paragraph("On another device or browser? Sign in with the link instead."),
      buttonRow([
        {
          label: "Sign in with the link",
          href: magicLink,
          variant: "secondary",
        },
      ]),
    ].join("\n"),
    footer: [
      footerText(escapeHtml("Didn't request this? You can ignore it.")),
      footerSignature(),
    ].join("\n"),
  });
}
