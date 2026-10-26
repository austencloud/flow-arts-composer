# Fast Iteration Contract

Use the cheapest check that can expose the current failure.

| Need                         | Preferred check                                                    |
| ---------------------------- | ------------------------------------------------------------------ |
| One unit or contract         | Run that test file with the project Vitest config                  |
| Tests touched by my change   | `npm run test:changed`                                             |
| Live Svelte/type feedback    | Reuse an existing `npm run check:watch` process                    |
| One-shot lighter type pass   | `npm run check:fast`                                               |
| Runtime or visual behavior   | Existing server plus focused browser inspection                    |
| Cross-cutting build behavior | `npm run build:fast` during iteration; full build only at its gate |

Do not run a full `npm run check` or build after every edit. Check
`resource-budget.md` before any heavy process. Run the broad gate once when the
changed code crosses project-wide type/build boundaries or `wt:finish` requires
it. Documentation-only changes use documentation checks instead.

Capture expensive output once and inspect that result; do not repeat an
unchanged command to obtain the same evidence.
