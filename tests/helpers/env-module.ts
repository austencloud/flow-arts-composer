/**
 * A stand-in for `$app/env/public` or `$app/env/private`, for `vi.mock`.
 *
 * The app reads those modules as `env.NAME`. Vitest throws when code reads a
 * name the mock factory did not return, so a plain object would have to list
 * every variable the code under test touches. This one answers `undefined` for
 * any unlisted variable, as an unset variable would, and reads `values` live,
 * so a test can change a variable between cases.
 *
 *     const mocks = vi.hoisted(() => ({ env: {} as Record<string, string> }));
 *     vi.mock("$app/env/private", async () => {
 *       const { envModule } = await import("#test-helpers/env-module.js");
 *       return envModule(mocks.env);
 *     });
 */
export function envModule(
  values: Record<string, string | undefined> = {}
): Record<string, string | undefined> {
  return new Proxy(values, {
    has: (target, name) =>
      (typeof name === "string" && ENV_NAME.test(name)) || name in target,
  });
}

const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;
