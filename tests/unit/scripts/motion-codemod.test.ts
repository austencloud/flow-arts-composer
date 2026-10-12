import { describe, expect, it } from "vitest";

import { rewriteCss } from "../../../scripts/motion-codemod.mjs";

describe("motion codemod", () => {
  it("rewrites only supported motion values in eligible declarations", () => {
    const css = `
.instant-100 { transition-duration: 100ms; }
.instant-point-one { transition-duration: 0.1s; }
.instant-120 { transition-duration: 120ms; }
.instant-point-twelve { transition-duration: 0.12s; }
.fast-140 { transition-duration: 140ms; }
.fast-150 { transition-duration: 150ms; }
.fast-point-fifteen { transition-duration: 0.15s; }
.fast-160 { transition-duration: 160ms; }
.fast-point-sixteen { transition-duration: 0.16s; }
.fast-180 { transition-duration: 180ms; }
.fast-point-eighteen { transition-duration: 0.18s; }
.normal-200 { transition-duration: 200ms; }
.normal-point-two { transition-duration: 0.2s; }
.normal-250 { transition-duration: 250ms; }
.normal-point-twenty-five { transition-duration: 0.25s; }
.emphasis-280 { transition-duration: 280ms; }
.emphasis-300 { transition-duration: 300ms; }
.emphasis-point-three { transition-duration: 0.3s; }
.emphasis-320 { transition-duration: 320ms; }
.emphasis-point-thirty-two { transition-duration: 0.32s; }
.dramatic-350 { transition-duration: 350ms; }
.dramatic-point-thirty-five { transition-duration: 0.35s; }
.dramatic-400 { transition-duration: 400ms; }
.dramatic-point-four { transition-duration: 0.4s; }
.dramatic-420 { transition-duration: 420ms; }
.dramatic-point-forty-two { transition-duration: 0.42s; }
.dramatic-500 { transition-duration: 500ms; }
.dramatic-point-five { transition-duration: 0.5s; }
.standard-bezier { transition: opacity cubic-bezier(0.4,0, 0.2,   1); }
.out-bezier { transition: opacity cubic-bezier( 0.16, 1, 0.3, 1 ); }
.spring-bezier { transition: opacity cubic-bezier(0.34, 1.56, 0.64, 1); }
.smooth-bezier { transition: opacity cubic-bezier(0.25, 0.1, 0.25, 1); }
.ease { transition: opacity ease; }
.ease-out { transition: opacity ease-out; }
.ease-in { transition: opacity ease-in; }
.ease-in-out { transition: opacity ease-in-out; }
.fallback { transition-duration: var(--duration-custom, 0.2s); }
.all { transition: all 0.3s ease; }
.ambient-long { animation: spin 2s linear infinite; }
.ambient-tokenizable { animation: pulse 0.2s ease infinite; }
.zero-delay { transition: opacity 0s linear 0.3s; }
.odd { transition: transform 220ms ease; }
.custom { --transition-x: 0.2s; }
.long-decimal { transition: width 10.2s ease; }
/* transition: opacity 0.2s ease; */
.multiline {
	transition:
		opacity 100ms ease,
		transform 0.2s ease-out,
		color 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}
@keyframes fade {
	0% { opacity: 0; }
	100% { opacity: 1; }
}
`;

    const result = rewriteCss(css);

    const durationClasses = {
      "instant-100": "instant",
      "instant-point-one": "instant",
      "instant-120": "instant",
      "instant-point-twelve": "instant",
      "fast-140": "fast",
      "fast-150": "fast",
      "fast-point-fifteen": "fast",
      "fast-160": "fast",
      "fast-point-sixteen": "fast",
      "fast-180": "fast",
      "fast-point-eighteen": "fast",
      "normal-200": "normal",
      "normal-point-two": "normal",
      "normal-250": "normal",
      "normal-point-twenty-five": "normal",
      "emphasis-280": "emphasis",
      "emphasis-300": "emphasis",
      "emphasis-point-three": "emphasis",
      "emphasis-320": "emphasis",
      "emphasis-point-thirty-two": "emphasis",
      "dramatic-350": "dramatic",
      "dramatic-point-thirty-five": "dramatic",
      "dramatic-400": "dramatic",
      "dramatic-point-four": "dramatic",
      "dramatic-420": "dramatic",
      "dramatic-point-forty-two": "dramatic",
      "dramatic-500": "dramatic",
      "dramatic-point-five": "dramatic",
    };
    for (const [className, tokenName] of Object.entries(durationClasses)) {
      expect(result.text).toContain(
        `.${className} { transition-duration: var(--duration-${tokenName}); }`
      );
    }

    const easingClasses = {
      "standard-bezier": "standard",
      "out-bezier": "out",
      "spring-bezier": "spring",
      "smooth-bezier": "smooth",
      ease: "standard",
      "ease-out": "standard-out",
      "ease-in": "standard-in",
      "ease-in-out": "standard",
    };
    for (const [className, tokenName] of Object.entries(easingClasses)) {
      expect(result.text).toContain(
        `.${className} { transition: opacity var(--ease-${tokenName}); }`
      );
    }

    expect(result.text).toContain(
      "transition-duration: var(--duration-custom);"
    );
    expect(result.text).toContain("transition: all 0.3s ease;");
    expect(result.text).toContain("animation: spin 2s linear infinite;");
    expect(result.text).toContain("animation: pulse 0.2s ease infinite;");
    expect(result.text).toContain(
      "transition: opacity 0s linear var(--duration-emphasis);"
    );
    expect(result.text).toContain(
      "transition: transform 220ms var(--ease-standard);"
    );
    expect(result.text).toContain("--transition-x: 0.2s;");
    expect(result.text).toContain(
      "transition: width 10.2s var(--ease-standard);"
    );
    expect(result.text).toContain("/* transition: opacity 0.2s ease; */");
    expect(result.text).toContain(
      `transition:
		opacity var(--duration-instant) var(--ease-standard),
		transform var(--duration-normal) var(--ease-standard-out),
		color var(--duration-emphasis) var(--ease-standard);`
    );
    expect(result.text).toContain(`@keyframes fade {
	0% { opacity: 0; }
	100% { opacity: 1; }
}`);
    expect(result.humanLines).toEqual([
      ".all { transition: all 0.3s ease; }",
      ".odd { transition: transform 220ms ease; }",
      ".long-decimal { transition: width 10.2s ease; }",
    ]);
    expect(result.replacements).toBe(46);
  });
});
