# Verification Contract

A completion claim includes evidence matched to the changed risk.

- Documentation and instructions: formatting, reference resolution, and focused
  contract checks.
- Pure logic or data behavior: focused unit tests with meaningful assertions.
- Integration or runtime behavior: the narrowest runtime query or integration
  check that exercises the changed path.
- Build configuration or dependency wiring: the affected build/type/lint gate.
- Appearance or interaction geometry: direct observation under
  `visual-verification-mandatory.md`; tests alone are insufficient.

A code change runs `npm run test:changed` before `wt:finish`; `wt:finish` then
runs `check`, `check:tsc`, the spec checks and those related tests itself.

Run broader checks only when the change crosses broad boundaries, a focused
check fails for a task-related reason, or the final integration gate requires
them. Once appropriate evidence passes, stop repeating or widening checks
without a concrete new risk.

If a required check cannot run, report its exact failure, attempted alternatives,
and remaining uncertainty. Do not replace evidence with “should work” or hand a
routine verification command to Austen.
