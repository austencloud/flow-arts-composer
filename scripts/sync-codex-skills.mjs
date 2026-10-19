#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repositoryRoot = resolve(dirname(scriptPath), "..");
const generatedMarker =
  "<!-- generated from .claude by scripts/sync-codex-skills.mjs; do not edit directly -->";
const manifestRelativePath = ".codex/claude-skill-sync-manifest.json";
const managedRoots = [".agents/skills", ".codex/agents"];

const screenshotsBody = `# Browser Screenshots

Inspect responsive layouts with the repo-approved browser surface. Never run the
standalone Playwright screenshot pipeline.

## Permission gate

- Treat an explicit request to capture or test a page as permission for the
  read-only inspection needed by that request.
- Before navigating, clicking, typing, or filling, confirm that the user gave
  explicit permission in the current conversation. If they did not, ask once
  and stop before the interactive action.
- Never inspect cookies, local storage, passwords, or browser profiles.

## Workflow

1. Load and follow the available browser-control skill before browser work.
2. Reuse the server at \`https://localhost:5173\`. If it is down or stuck,
   restart it with \`pm2 restart tka-dev\`; never start a second one on 5173.
3. Read the selected browser's complete runtime documentation before invoking
   its viewport, navigation, inspection, or screenshot APIs.
4. Capture only the requested routes and viewport families. Prefer the smallest
   useful set: one narrow phone, one wide phone, one tablet, and one desktop.
5. Check visible layout, console errors, overflow, touch targets, and text size.
6. Report the exact route and viewport for every finding. A screenshot proves
   appearance only; use DOM or runtime evidence for behavior claims.

## Invocation examples

- \`$screenshots compose/arrange\`: inspect Arrange at representative widths.
- \`$screenshots --public landing\`: inspect the public landing route.
- \`$screenshots browse\`: inspect the Browse module routes requested by the user.

If the required browser surface is unavailable, stop and report that blocker.
Do not fall back to standalone Playwright or a shell-driven browser.`;

const tkaDomainExpertBody = `You are the TKA domain specialist for Flow Arts Composer.

## Ground truth

Every claim about letters, variations, positions, motion types, VTG patterns,
or pictograph structure MUST come from a \`flow-arts\` MCP call made in the
current turn. Never answer a domain question from remembered facts or from this
agent file.

Use the narrowest matching MCP tool, including \`get_letter_explanation\`,
\`get_term_definition\`, \`get_pictograph_data\`, \`get_position_info\`, the
VTG tool family, and the available list/compare tools. Base the response on the
returned data and distinguish any inference from the tool result.

## Rendering

Render pictographs and sequences only through the \`generate_pictograph\` and
\`generate_sequence\` tools on \`flow-arts\`. Never render them through shell
scripts, inline code, or base64. If the MCP server or required rendering tool is
unavailable, stop and tell the user to restart Codex.

## Response

Explain terms for the user's demonstrated level, lead with the direct answer,
and use precise names from the MCP result. Do not add unverified domain detail.`;

function normalizeNewlines(value) {
  return value.replace(/\r\n?/g, "\n");
}

function stripYamlQuotes(value) {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export function parseClaudeDocument(source, fallbackName) {
  const normalized = normalizeNewlines(source);
  const openingMatch = normalized.match(/(^|\n)---\n/);
  if (!openingMatch) {
    throw new Error(`Missing YAML frontmatter for ${fallbackName}`);
  }

  const openingIndex = openingMatch.index + openingMatch[1].length;
  const frontmatterStart = openingIndex + 4;
  const closingIndex = normalized.indexOf("\n---", frontmatterStart);
  if (closingIndex === -1) {
    throw new Error(`Unclosed YAML frontmatter for ${fallbackName}`);
  }

  const fields = {};
  const frontmatter = normalized.slice(frontmatterStart, closingIndex);
  for (const line of frontmatter.split("\n")) {
    const match = line.match(/^([a-zA-Z][a-zA-Z0-9-]*):\s*(.*)$/);
    if (match) fields[match[1]] = stripYamlQuotes(match[2]);
  }

  const name = fields.name || fallbackName;
  const description = fields.description;
  if (!/^[a-z0-9-]{1,64}$/.test(name)) {
    throw new Error(`Invalid skill or agent name: ${name}`);
  }
  if (!description) {
    throw new Error(`Missing description for ${name}`);
  }

  return {
    name,
    description,
    argumentHint: fields["argument-hint"] || "",
    model: fields.model || "",
    tools: fields.tools || fields["allowed-tools"] || "",
    body: normalized.slice(closingIndex + 4).trim(),
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceSkillSlashInvocations(content, skillNames) {
  const alternatives = [...skillNames]
    .sort((left, right) => right.length - left.length)
    .map(escapeRegex)
    .join("|");
  const invocation = new RegExp(
    `(^|[^a-zA-Z0-9_$])\\/(${alternatives})(?=$|[^a-zA-Z0-9-])`,
    "gm"
  );
  return content.replace(
    invocation,
    (_match, prefix, name) => `${prefix}$${name}`
  );
}

function replaceReleaseShellWrites(content) {
  return content
    .replace(
      /```bash\ncat > \.release-changelog\.json << 'EOF'\n([\s\S]*?)\nEOF\n\nnode scripts\/release\.js ([^\n]+)\n```/,
      `Create \`.release-changelog.json\` with \`apply_patch\` using this shape:\n\n\`\`\`json\n$1\n\`\`\`\n\nThen run:\n\n\`\`\`powershell\nnode scripts/release.js $2\n\`\`\``
    )
    .replace(
      /```bash\ngit push origin main && git push origin vX\.Y\.Z\n```/,
      "```powershell\ngit push origin main\ngit push origin vX.Y.Z\n```"
    )
    .replace(
      /```bash\ngh release create vX\.Y\.Z --title "vX\.Y\.Z" -F - <<EOF\n([\s\S]*?)\nEOF\n```/,
      `Create \`.release-notes.md\` with \`apply_patch\`:\n\n\`\`\`markdown\n$1\n\`\`\`\n\nThen run:\n\n\`\`\`powershell\ngh release create vX.Y.Z --title "vX.Y.Z" -F .release-notes.md\n\`\`\``
    )
    .replace(
      /```bash\nnode scripts\/archive-feedback\.js X\.Y\.Z\ngit checkout develop && git merge main && git push\n```/,
      "```powershell\nnode scripts/archive-feedback.js X.Y.Z\ngit push origin main\n```"
    );
}

function replaceFeedbackDelegation(content) {
  return content
    .replace(
      /## Auto-Select Workflow[\s\S]*?(?=## Claim Health)/,
      `## Fetch and triage

The top-level \`$fb\` workflow performs exactly one initial fetch command. Do
not run \`whoami\`, \`mine\`, \`list\`, or per-item detail calls before it.

| Input | Single initial command |
|---|---|
| No argument | \`node scripts/fetch-feedback.js\` |
| Feedback ID | \`node scripts/fetch-feedback.js claim <id>\` |
| \`list\` | \`node scripts/fetch-feedback.js list\` |

Use that command's complete output for the display and complexity triage. If it
reports an active claim owned by another session, do not bypass the protection.
Only the user can authorize a claim request or emergency takeover.

---

`
    )
    .replace(
      /## Delegating to Subagents[\s\S]*?(?=\n---\n\n## Status State Machine)/,
      `## Delegating to subagents

For an independent TRIVIAL or MEDIUM implementation, delegate to a Codex
worker only when the user or applicable project instructions request subagent
work. Give the worker:

- feedback ID;
- task and expected behavior;
- exact file scope;
- required verification;
- the command that moves the item to \`in-review\` after verified completion.

Do not route by Anthropic model names. Let the selected Codex agent configuration
or current session choose the model and reasoning effort.
`
    )
    .replace(
      "2. Summarize what changed\n3. Give clear testing steps\n4. Describe expected behavior",
      "2. Summarize what changed\n3. Include the verification evidence you gathered\n4. Describe observed behavior; if visual verification still needs user action, name one specific check"
    );
}

function replaceMuseumDelegation(content) {
  return content
    .replace(
      "Launch 7 parallel Task agents (one per department), collect their briefings, then synthesize.",
      "Dispatch one Codex subagent per department, in batches that respect the current concurrency limit. Collect their briefings, then synthesize."
    )
    .replace(
      'Launch 7 agents simultaneously using the Agent tool with `subagent_type: "general-purpose"`. Each agent gets this prompt template (fill in the department name and tag):',
      "Dispatch the seven department prompts through Codex subagents, using only the available concurrency slots. Each agent gets this prompt template (fill in the department name and tag):"
    );
}

function replaceMuseumProvenance(content) {
  return content
    .replaceAll("future Claude sessions", "future agent sessions")
    .replaceAll("When Claude generates", "When the agent generates")
    .replaceAll("Claude generates", "The agent generates")
    .replaceAll("Claude-generated", "agent-generated")
    .replaceAll("a agent-generated", "an agent-generated")
    .replaceAll("Claude's ideas", "Agent-generated ideas")
    .replaceAll("Claude ends up", "The agent ends up")
    .replaceAll("Claude must", "The agent must")
    .replaceAll("Claude should", "The agent should")
    .replaceAll("# Capture Claude's idea", "# Capture the agent's idea");
}

function replaceCommitSyntax(content) {
  return content
    .replace(
      "!`git status`\n!`git diff`\n!`git diff --cached`",
      "```powershell\ngit status --short\ngit diff\ngit diff --cached\n```"
    )
    .replace(
      "3. Commit with the planned message",
      '3. Commit only those paths: `git commit -m "<message>" -- <explicit paths>`'
    )
    .replace(
      "4. Verify with `git status`",
      "4. Verify with `git status --short` and inspect the scoped commit"
    );
}

function replaceTikaQuestions(content) {
  return content
    .replace(
      "**Every review MUST end with an AskUserQuestion call.**",
      "**Every review MUST end with one concise question and concrete choices.**"
    )
    .replace(
      "After presenting your grade and analysis, always use AskUserQuestion to let the user respond with arrow keys instead of typing.",
      "After presenting the grade and analysis, ask the user to choose one of the options below."
    )
    .replace(
      '**Never end a review by just asking "Ready to proceed?" in text.** Always use the AskUserQuestion tool so the user can respond with two arrow key presses.',
      '**Never end a review with only "Ready to proceed?"** Offer the relevant concrete choices so the next action is unambiguous.'
    );
}

function replaceVerificationBrowser(content) {
  return content
    .replace(
      "Query runtime state via Playwright `browser_evaluate`",
      "Query runtime state through the repo-approved browser inspection surface"
    )
    .replace(
      "[Tests / Typecheck / Playwright Query / Console Output]",
      "[Tests / Typecheck / Browser Query / Console Output]"
    );
}

function replaceWindowsShellExamples(relativePath, content) {
  let adapted = content;

  if (relativePath === "changelog/SKILL.md") {
    adapted = adapted.replace(
      /```bash\ngit tag -l "v\*" --sort=-version:refname \| head -1\ngit log \$\(git tag -l "v\*" --sort=-version:refname \| head -1\)\.\.HEAD --oneline --no-merges\n```/,
      `\`\`\`powershell
$latestTag = git tag --list "v*" --sort=-version:refname | Select-Object -First 1
if ($latestTag) {
  git log "$latestTag..HEAD" --oneline --no-merges
} else {
  git log --oneline --no-merges
}
\`\`\``
    );
  }
  if (relativePath === "license/SKILL.md") {
    adapted = adapted.replace(
      'cd E:/tka-platform && npx license-checker --production --summary 2>/dev/null || echo "license-checker not installed"',
      "pnpm exec license-checker --production --summary"
    );
  }
  if (relativePath === "deadcode/SKILL.md") {
    adapted = adapted.replace(
      'rm "src/lib/path/to/file.ts"',
      'Remove-Item -LiteralPath "src/lib/path/to/file.ts"'
    );
  }
  if (relativePath === "devfix/SKILL.md") {
    adapted = adapted
      .replaceAll("`curl -k`", "`curl.exe -k`")
      .replaceAll("curl -k -s -o /dev/null", "curl.exe -k -s -o NUL")
      .replaceAll("curl -s -o /dev/null", "curl.exe -s -o NUL")
      .replace("`! powershell -NoProfile", "`powershell -NoProfile");
  }
  if (relativePath === "add-to-library/format-reference.md") {
    adapted = adapted.replace(
      /```bash\nnode scripts\/import-sequence\.cjs <file\.json> \\\n([\s\S]*?)\n```/,
      `\`\`\`text
node scripts/import-sequence.cjs <file.json> [--stdin] [--circular] [--loop-type <type>] [--notes "tagline"] [--visibility private|unlisted] [--dry-run]
\`\`\`

- --stdin: read JSON from stdin instead of a file.
- --circular: force isCircular=true.
- --loop-type <type>: force the LOOP type.
- --notes "tagline": attach notes or a tagline.
- --visibility private|unlisted: set visibility; defaults to private. Publish through the app so the owner record, public projection, and content-hash claim commit together.
- --dry-run: preview without writing to Firestore.`
    );
  }

  return adapted.replaceAll("```bash", "```powershell");
}

function replaceCurrentRepoPolicies(relativePath, content) {
  let adapted = content;

  if (relativePath === "commit/SKILL.md")
    adapted = replaceCommitSyntax(adapted);
  if (relativePath === "release/SKILL.md")
    adapted = replaceReleaseShellWrites(adapted);
  if (relativePath === "fb/workflow-reference.md") {
    adapted = replaceFeedbackDelegation(adapted);
  }
  if (relativePath === "museum/commands-reference.md") {
    adapted = replaceMuseumProvenance(replaceMuseumDelegation(adapted));
  }
  if (
    relativePath === "museum/SKILL.md" ||
    relativePath === "museum-lore/SKILL.md"
  ) {
    adapted = replaceMuseumProvenance(adapted);
  }
  if (relativePath === "tika/grading-reference.md") {
    adapted = replaceTikaQuestions(adapted);
  }
  if (relativePath === "handoff/SKILL.md") {
    adapted = adapted.replace(
      "tell\n  Austen exactly where it lives with a `file://` link.",
      "tell\n  Austen exactly where it lives with an absolute Markdown file link."
    );
  }
  if (relativePath === "sync/SKILL.md") {
    adapted = adapted.replace(
      "`git checkout origin/main -- <paths>`",
      "`git restore --source origin/main -- <paths>`"
    );
  }
  if (relativePath === "check/SKILL.md") {
    adapted = adapted
      .replace(
        "| 30-50 moderate | 4-8 parallel subagents |",
        "| 30-50 moderate | Parallel subagents up to the available concurrency limit |"
      )
      .replace(
        "| >50 or complex | Multiple sessions |",
        "| >50 or complex | Root-cause batches with focused verification after each batch |"
      );
  }
  if (relativePath === "skill-audit/SKILL.md") {
    adapted = adapted
      .replaceAll("`superpowers:writing-skills`", "`$skill-creator`")
      .replace(
        "Run `wc -w` on it.",
        "Count its words before grading token efficiency."
      );
  }

  return adapted;
}

function replaceLegacyMcpNames(content) {
  return content
    .replace(
      /`mcp__tka-domain__([a-zA-Z0-9_]+)`/g,
      "`$1` on the `flow-arts` MCP server"
    )
    .replace(/\bmcp__tka-domain__([a-zA-Z0-9_]+)\(/g, "$1(")
    .replaceAll("mcp__tka-domain__", "");
}

function replacePlatformTerms(content) {
  return content
    .replaceAll(".claude/skills/", ".agents/skills/")
    .replaceAll(".claude/agents/", ".codex/agents/")
    .replaceAll("CLAUDE.md", "AGENTS.md")
    .replaceAll("Claude Code's changelog", "Codex's changelog")
    .replaceAll("Claude launcher", "Codex launcher")
    .replaceAll("Claude install", "Codex install")
    .replaceAll("launchers/start-claude.bat", "launchers/start-codex.bat")
    .replaceAll(
      "launchers/install-claude-context-menu.ps1",
      "launchers/install-codex-context-menu.ps1"
    )
    .replaceAll("ONE BASH CALL", "ONE SHELL CALL")
    .replaceAll("ONE Bash call", "ONE shell call")
    .replaceAll("another Bash call", "another shell call")
    .replaceAll("read each with Read tool", "read each from disk")
    .replaceAll("Use the Read tool on", "Read")
    .replaceAll("use the Read tool", "read it from disk")
    .replaceAll(
      "Use Glob + Grep + Read.",
      "Use file listing, repository search, and targeted reads."
    )
    .replaceAll("Grep for", "Search for")
    .replaceAll(
      "Use AskUserQuestion with options:",
      "Ask the user to choose one of these options:"
    )
    .replaceAll("Use AskUserQuestion if", "Ask the user directly if")
    .replaceAll("use Write tool to create", "use `apply_patch` to create")
    .replaceAll(
      "(PowerShell: Remove-Item, Bash: rm)",
      "(use PowerShell `Remove-Item` with the exact temporary path)"
    )
    .replaceAll(
      '(`subagent_type: "audit-evaluator"`)',
      "(the project custom agent)"
    )
    .replaceAll(
      '(`subagent_type: "audit-fixer"`)',
      "(the project custom agent)"
    )
    .replaceAll("recommends model routing", "recommends reasoning effort")
    .replaceAll("model routing", "recommended reasoning effort")
    .replaceAll(
      "recommended recommended reasoning effort",
      "recommended reasoning effort"
    )
    .replaceAll("(Haiku)", "(low effort)")
    .replaceAll("(Sonnet)", "(medium effort)")
    .replaceAll("(Opus)", "(high effort)")
    .replaceAll("→ Haiku:", "→ low effort:")
    .replaceAll("→ Sonnet:", "→ medium effort:")
    .replaceAll("→ Opus:", "→ high effort:")
    .replaceAll(
      "**Use MCP tools to verify facts. Don't guess.**",
      "**Use the `flow-arts` MCP tools to verify facts. Don't guess.**"
    );
}

function insertInvocationNote(body, skillName, argumentHint) {
  if (!body.includes("$ARGUMENTS")) return body;

  const hint = argumentHint ? ` Expected shape: \`${argumentHint}\`.` : "";
  const note = `When explicitly invoked, treat the text after \`$${skillName}\` as \`<arguments>\`.${hint}`;
  const withoutVariable = body.replaceAll("$ARGUMENTS", "<arguments>");
  const heading = withoutVariable.match(/^# .+$/m);
  if (!heading) return `${note}\n\n${withoutVariable}`;
  const insertionPoint = heading.index + heading[0].length;
  return `${withoutVariable.slice(0, insertionPoint)}\n\n${note}${withoutVariable.slice(insertionPoint)}`;
}

export function adaptCodexMarkdown(
  source,
  { relativePath, skillName, skillNames, argumentHint = "" }
) {
  let content = normalizeNewlines(source);
  content = replaceLegacyMcpNames(content);
  content = replacePlatformTerms(content);
  content = replaceSkillSlashInvocations(content, skillNames);
  content = replaceCurrentRepoPolicies(relativePath, content);
  content = replaceWindowsShellExamples(relativePath, content);
  content = replaceTikaQuestions(content);
  content = replaceVerificationBrowser(content);
  content = insertInvocationNote(content, skillName, argumentHint);
  return content.trim();
}

function adaptDescription(description, skillNames) {
  let adapted = replaceSkillSlashInvocations(
    replacePlatformTerms(description),
    skillNames
  );
  if (!adapted.startsWith("Use when")) {
    const useWhenIndex = adapted.indexOf("Use when");
    if (useWhenIndex >= 0) adapted = adapted.slice(useWhenIndex);
  }
  return adapted.replace(/^Use when user\b/, "Use when the user");
}

function yamlString(value) {
  return JSON.stringify(value);
}

function titleFromBody(body, fallbackName) {
  const match = body.match(/^#\s+(.+)$/m);
  if (match) return match[1].replace(/\s+Command$/i, "").trim();
  return fallbackName
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function shortDescription(description, displayName) {
  let short = description
    .replace(/^Use when (?:the user )?/i, "")
    .replace(/^user /i, "")
    .replace(/\s+/g, " ")
    .split(" — ")[0]
    .replace(/[.]$/, "")
    .trim();
  short = short.charAt(0).toUpperCase() + short.slice(1);
  if (short.length > 64) {
    const candidates = [
      short.split(" — ")[0],
      short.split(/, or | or /i)[0],
      short.split(/, and | and /i)[0],
      short.split(",")[0],
      short.split(".")[0],
    ];
    short =
      candidates.find(
        (candidate) => candidate.length >= 25 && candidate.length <= 64
      ) ||
      `Run the ${displayName.replace(/\s+(Command|Workflow)$/i, "")} workflow`;
  }
  if (short.length < 25) short = `${short} in this project`;
  if (short.length > 64) short = short.slice(0, 64).trimEnd();
  return short;
}

export function renderOpenAiYaml({ name, description, body }) {
  const displayName = titleFromBody(body, name);
  const promptTitle = displayName.replace(/\s+workflow$/i, "");
  return `interface:
  display_name: ${yamlString(displayName)}
  short_description: ${yamlString(shortDescription(description, displayName))}
  default_prompt: ${yamlString(`Use $${name} to apply the ${promptTitle} workflow to this task.`)}
`;
}

export function renderCodexSkill(source, fallbackName, skillNames) {
  const parsed = parseClaudeDocument(source, fallbackName);
  const description = adaptDescription(parsed.description, skillNames);
  const relativePath = `${parsed.name}/SKILL.md`;
  const sourceBody =
    parsed.name === "screenshots"
      ? screenshotsBody
      : adaptCodexMarkdown(parsed.body, {
          relativePath,
          skillName: parsed.name,
          skillNames,
          argumentHint: parsed.argumentHint,
        });
  const body = replaceSkillSlashInvocations(sourceBody, skillNames);
  const content = `---
name: ${parsed.name}
description: ${description}
---

${generatedMarker}

${body}
`;
  return { ...parsed, description, body, content };
}

function parseToolNames(value) {
  return value
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .split(",")
    .map((tool) => tool.trim())
    .filter(Boolean);
}

function reasoningEffort(model) {
  if (model === "haiku") return "low";
  if (model === "opus") return "xhigh";
  if (model) return "high";
  return "medium";
}

export function renderCodexAgent(source, fallbackName, skillNames) {
  const parsed = parseClaudeDocument(source, fallbackName);
  const description = adaptDescription(parsed.description, skillNames);
  let body =
    parsed.name === "tka-domain-expert"
      ? tkaDomainExpertBody
      : adaptCodexMarkdown(parsed.body, {
          relativePath: `agents/${parsed.name}.md`,
          skillName: parsed.name,
          skillNames,
        });
  body = replaceVerificationBrowser(body);
  if (body.includes("'''")) {
    throw new Error(
      `Agent ${parsed.name} contains unsupported triple apostrophes`
    );
  }

  const tools = parseToolNames(parsed.tools);
  const readOnly =
    parsed.name !== "feedback-triager" &&
    tools.length > 0 &&
    !tools.some((tool) => ["Edit", "Write"].includes(tool));
  const sandbox = readOnly ? 'sandbox_mode = "read-only"\n' : "";
  const content = `name = ${JSON.stringify(parsed.name)}
description = ${JSON.stringify(description)}
model_reasoning_effort = ${JSON.stringify(reasoningEffort(parsed.model))}
${sandbox}developer_instructions = '''
${generatedMarker}

${body}
'''
`;
  return { ...parsed, description, body, content };
}

function walkFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    if (statSync(fullPath).isDirectory()) files.push(...walkFiles(fullPath));
    else files.push(fullPath);
  }
  return files;
}

function findCaseInsensitiveFile(directory, expectedName) {
  return readdirSync(directory).find(
    (entry) => entry.toLowerCase() === expectedName.toLowerCase()
  );
}

function discoverSkillNames(claudeSkillsRoot) {
  return readdirSync(claudeSkillsRoot)
    .filter((entry) => statSync(join(claudeSkillsRoot, entry)).isDirectory())
    .filter((entry) =>
      findCaseInsensitiveFile(join(claudeSkillsRoot, entry), "SKILL.md")
    )
    .sort();
}

function addExpected(expected, path, content) {
  const key = resolve(path);
  if (expected.has(key)) throw new Error(`Duplicate generated output: ${key}`);
  expected.set(key, content);
}

function portableRelative(root, path) {
  return relative(root, path).split(sep).join("/");
}

function renderManifest(paths) {
  const formattedPaths = JSON.stringify(paths, null, 2).replaceAll(
    "\n",
    "\n  "
  );
  return `{
  "version": 1,
  "source": [".claude/skills", ".claude/agents"],
  "paths": ${formattedPaths}
}\n`;
}

export function collectExpectedOutputs(root = repositoryRoot) {
  const claudeSkillsRoot = resolve(root, ".claude", "skills");
  const codexSkillsRoot = resolve(root, ".agents", "skills");
  const claudeAgentsRoot = resolve(root, ".claude", "agents");
  const codexAgentsRoot = resolve(root, ".codex", "agents");
  const skillNames = discoverSkillNames(claudeSkillsRoot);
  const expected = new Map();

  for (const skillName of skillNames) {
    const sourceDirectory = join(claudeSkillsRoot, skillName);
    const targetDirectory = join(codexSkillsRoot, skillName);
    const entryName = findCaseInsensitiveFile(sourceDirectory, "SKILL.md");
    const entryPath = join(sourceDirectory, entryName);
    const rendered = renderCodexSkill(
      readFileSync(entryPath, "utf8"),
      skillName,
      skillNames
    );

    addExpected(expected, join(targetDirectory, "SKILL.md"), rendered.content);
    addExpected(
      expected,
      join(targetDirectory, "agents", "openai.yaml"),
      renderOpenAiYaml(rendered)
    );

    for (const sourcePath of walkFiles(sourceDirectory)) {
      if (resolve(sourcePath) === resolve(entryPath)) continue;
      const childPath = relative(sourceDirectory, sourcePath);
      const targetPath = join(targetDirectory, childPath);
      if (sourcePath.toLowerCase().endsWith(".md")) {
        const transformed = adaptCodexMarkdown(
          readFileSync(sourcePath, "utf8"),
          {
            relativePath: `${skillName}/${childPath.split(sep).join("/")}`,
            skillName,
            skillNames,
            argumentHint: rendered.argumentHint,
          }
        );
        addExpected(expected, targetPath, `${transformed}\n`);
      } else {
        addExpected(expected, targetPath, readFileSync(sourcePath));
      }
    }
  }

  const agentSources = [];
  for (const entry of readdirSync(claudeAgentsRoot)) {
    const fullPath = join(claudeAgentsRoot, entry);
    if (statSync(fullPath).isDirectory()) {
      const agentName = findCaseInsensitiveFile(fullPath, "AGENT.md");
      if (agentName) agentSources.push([entry, join(fullPath, agentName)]);
    } else if (entry.toLowerCase().endsWith(".md")) {
      agentSources.push([entry.slice(0, -3), fullPath]);
    }
  }

  for (const [agentName, sourcePath] of agentSources.sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    const rendered = renderCodexAgent(
      readFileSync(sourcePath, "utf8"),
      agentName,
      skillNames
    );
    addExpected(
      expected,
      join(codexAgentsRoot, `${rendered.name}.toml`),
      rendered.content
    );
  }

  const managedPaths = [...expected.keys()]
    .map((path) => portableRelative(root, path))
    .sort();
  addExpected(
    expected,
    resolve(root, manifestRelativePath),
    renderManifest(managedPaths)
  );

  return {
    expected,
    managedPaths,
    skillNames,
    agentCount: agentSources.length,
  };
}

function ensureSkillEntryCase(path) {
  const directory = dirname(path);
  if (!existsSync(directory)) return;
  const matchingNames = readdirSync(directory).filter(
    (entry) => entry.toLowerCase() === "skill.md"
  );
  if (matchingNames.length > 1) {
    throw new Error(`Multiple case variants of SKILL.md exist in ${directory}`);
  }
  const [currentName] = matchingNames;
  if (!currentName || currentName === "SKILL.md") return;
  const currentPath = join(directory, currentName);
  const temporaryPath = join(directory, `.codex-skill-case-${process.pid}.tmp`);
  renameSync(currentPath, temporaryPath);
  renameSync(temporaryPath, join(directory, "SKILL.md"));
}

function skillEntryCaseMatches(path) {
  if (!path.endsWith(`${sep}SKILL.md`)) return true;
  const directory = dirname(path);
  if (!existsSync(directory)) return false;
  const matchingNames = readdirSync(directory).filter(
    (entry) => entry.toLowerCase() === "skill.md"
  );
  return matchingNames.length === 1 && matchingNames[0] === "SKILL.md";
}

function contentsMatch(path, expected) {
  if (!existsSync(path)) return false;
  const actual = readFileSync(path);
  const wanted = Buffer.isBuffer(expected)
    ? expected
    : Buffer.from(expected, "utf8");
  return actual.equals(wanted);
}

function readPreviousManagedPaths(root) {
  const manifestPath = resolve(root, manifestRelativePath);
  if (!existsSync(manifestPath)) return [];
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.version !== 1 || !Array.isArray(manifest.paths)) {
    throw new Error(`Unsupported Codex skill sync manifest: ${manifestPath}`);
  }
  return manifest.paths;
}

function resolveManagedPath(root, portablePath) {
  if (typeof portablePath !== "string" || portablePath.length === 0) {
    throw new Error("Codex skill sync manifest contains an invalid path");
  }
  const path = resolve(root, portablePath);
  const insideManagedRoot = managedRoots.some((managedRoot) => {
    const rootPath = resolve(root, managedRoot);
    const childPath = relative(rootPath, path);
    return (
      childPath.length > 0 &&
      childPath !== ".." &&
      !childPath.startsWith(`..${sep}`) &&
      !isAbsolute(childPath)
    );
  });
  if (!insideManagedRoot) {
    throw new Error(
      `Refusing to manage a path outside Codex skill roots: ${portablePath}`
    );
  }
  return path;
}

export function synchronizeCodexSkills({
  root = repositoryRoot,
  check = false,
} = {}) {
  const { expected, managedPaths, skillNames, agentCount } =
    collectExpectedOutputs(root);
  const changed = new Set();
  const removed = new Set();
  const currentManagedPaths = new Set(managedPaths);

  for (const portablePath of readPreviousManagedPaths(root)) {
    if (currentManagedPaths.has(portablePath)) continue;
    const path = resolveManagedPath(root, portablePath);
    if (!existsSync(path)) continue;
    changed.add(portablePath);
    removed.add(portablePath);
    if (!check) unlinkSync(path);
  }

  for (const [path, content] of expected) {
    if (contentsMatch(path, content) && skillEntryCaseMatches(path)) continue;
    changed.add(portableRelative(root, path));
    if (check) continue;
    mkdirSync(dirname(path), { recursive: true });
    if (path.endsWith(`${sep}SKILL.md`)) ensureSkillEntryCase(path);
    writeFileSync(path, content);
  }

  return {
    changed: [...changed],
    removed: [...removed],
    skillCount: skillNames.length,
    agentCount,
  };
}

function main() {
  const check = process.argv.includes("--check");
  const result = synchronizeCodexSkills({ check });
  if (check && result.changed.length > 0) {
    console.error("Codex skill mirror is out of date:");
    for (const path of result.changed) console.error(`  ${path}`);
    console.error("Run: pnpm skills:sync");
    process.exitCode = 1;
    return;
  }

  if (!check) {
    const removed = new Set(result.removed);
    for (const path of result.changed) {
      console.log(`  ${removed.has(path) ? "removed" : "synced"} ${path}`);
    }
  }
  console.log(
    `${check ? "Verified" : "Synchronized"} ${result.skillCount} skills and ${result.agentCount} agents${result.changed.length === 0 ? " (no changes)" : ""}.`
  );
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(scriptPath)) main();
