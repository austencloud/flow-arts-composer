# Flow Arts Composer

Write down a movement you want to remember. See it animated. Share it with another
flow artist.

Flow Arts Composer is a browser app for building and exploring flow arts sequences
using **The Kinetic Alphabet (TKA)**. It connects written notation with animation
so you can work out what to practice, keep a record, and pass it on.

**[Open Flow Arts Composer](https://tkaflowarts.com)** ·
[Read the notation guide](https://tkaflowarts.com/guide/level-1) ·
[Contribute](CONTRIBUTING.md)

## What you can do

- **Build a sequence step by step**, choosing movements in the editor.
- **Generate sequences** from constraints when you want something new to try.
- **Watch the movement** in an animated preview and compare it with the notation.
- **Browse the library** to find sequences and explore other artists' work.
- **Save and share sequences**, or export pictographs for reference and practice.

Create and Browse are the main public workspaces. The repository also contains
tools for lessons, longer choreography, printable cards, and 3D experiences.
Access to those areas depends on feature settings and account permissions.
Their presence in the source does not mean they are available to every user.

## The notation behind it

TKA describes how two hands and their props move. A **pictograph** is a diagram
with two props and arrows showing motion. Put pictographs in order and you have a
sequence you can read and perform.

The system was designed around a pair of staves held at their centers. Other
directly gripped props, including fans, clubs, and buugeng, can use the notation
when their orientations remain readable. Momentum-driven props such as poi need
additional interpretation.

**Flow Arts Composer** is the application. **The Kinetic Alphabet** is the
notation system it uses. The notation reference and shared domain packages live
in this repository alongside the app.

## Run locally

Use **Node.js 24** to match CI and **pnpm 10.28.0**, the version pinned in
[`package.json`](package.json). This is a pnpm workspace with local packages and
dependency patches. Install from the repository root.

```sh
git clone https://github.com/austencloud/flow-arts-composer.git
cd flow-arts-composer
```

Copy [`.env.example`](.env.example) to `.env` **before installing dependencies**.
The install step generates SvelteKit's environment declarations.

```sh
# macOS / Linux
cp .env.example .env
```

```powershell
# PowerShell
Copy-Item .env.example .env
```

```sh
pnpm install --frozen-lockfile
pnpm run build:packages
pnpm run dev
```

Open the URL printed by Vite. The default port is `5173`. Fresh clones use HTTP;
local certificates in `.cert/` enable HTTPS. If another checkout already has a
server running, use that server or choose a free port for yours, for example
`pnpm run dev --port 5174`.

The environment template documents optional integrations. Features that use AI
providers or server-side administration need their own credentials. Keep `.env`
and service-account files out of Git.

The browser's Firebase configuration is included in the source. A local frontend
uses the configured hosted backend unless emulator mode is enabled. For isolated
data testing, see the [Firebase emulator configuration](src/lib/shared/auth/firebase-emulator-config.ts)
and [test documentation](tests/README.md).

## Development commands

| Command                       | Purpose                                       |
| ----------------------------- | --------------------------------------------- |
| `pnpm run dev`                | Start the local app                           |
| `pnpm run build:packages`     | Compile the shared domain and engine packages |
| `pnpm run check`              | Check Svelte and TypeScript diagnostics       |
| `pnpm run check:tsc`          | Run the separate TypeScript compiler gate     |
| `pnpm run test:ci`            | Run the app unit tests once                   |
| `pnpm run test:packages`      | Run workspace package tests                   |
| `pnpm run test:components:ci` | Run browser component tests                   |
| `pnpm run build`              | Build the production app                      |
| `pnpm run lint`               | Check formatting and ESLint rules             |

Browser component tests need Playwright Chromium:
`pnpm exec playwright install chromium`. Firebase-backed test suites have
additional emulator requirements. See [tests/README.md](tests/README.md) and the
[CI workflow](.github/workflows/web-ci.yml) for the current checks.

## Inside the repository

The app uses **SvelteKit, Svelte 5, and TypeScript**, with Firebase for backend
services. Pictographs use a Canvas rendering pipeline. Three.js and Threlte power
3D views. Capacitor and Tauri provide native application projects.

| Location                                     | Contents                                                            |
| -------------------------------------------- | ------------------------------------------------------------------- |
| [`src/lib/features/`](src/lib/features/)     | App features, including Create and Browse                           |
| [`src/lib/shared/`](src/lib/shared/)         | Shared UI, animation, authentication, and services                  |
| [`src/routes/`](src/routes/)                 | SvelteKit pages and server endpoints                                |
| [`packages/`](packages/)                     | Notation models, sequence generation, rendering, and shared tooling |
| [`mcp-server/`](mcp-server/)                 | Flow Arts Knowledge MCP server for AI tool integrations             |
| [`firebase-functions/`](firebase-functions/) | Firebase Cloud Functions                                            |
| [`messages/`](messages/)                     | Translation files                                                   |
| [`tests/`](tests/)                           | Tests and test configuration                                        |

Start with [`@tka/domain`](packages/domain/) for notation definitions,
[`@tka/sequence-engine`](packages/sequence-engine/) for generation, or
[`@tka/render-core`](packages/render-core/) for rendering calculations. The
[MCP server README](mcp-server/README.md) covers its setup and tools.

## Contributing

Bug reports, documentation improvements, translations, and code contributions
are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the workflow and
contribution terms. For a substantial feature, open an
[issue](https://github.com/austencloud/flow-arts-composer/issues) to discuss the
approach before starting implementation.

## Licensing

This repository uses several licenses:

- **MIT** for the foundation packages and selected engines, including
  `@tka/domain`, `@tka/sequence-engine`, and `@tka/render-core`.
- **Elastic License 2.0** for the Composer application, MCP servers, and the
  rendering packages identified in the license overview.
- **CC BY-SA 4.0** for the open sequence datasets and notation documentation.

Other data has separate terms. See [LICENSE](LICENSE) for the component-by-component
breakdown, exceptions, and full license references.
