# TIKA Testing - Programmatic Interaction

**Repository status (2026-10-14):** `package.json` declares `tika:evaluate` and `tika:opus`, and `scripts/tika/test-run.mjs` exists. However, `scripts/tika/evaluate.ts` imports an absent `src/lib/features/learn/tika/evaluation/scenarios/baseline-scenarios` module; `test-run.mjs` also probes that legacy path. Their existence does not establish that those entrypoints run successfully. Existing JSON scenarios are loaded by `scripts/tika/run-evaluation.mjs`. HTTP examples below do not establish current endpoint authentication.

## Quick Health Check (No Options Needed)

```bash
node scripts/tika/test-run.mjs
```

Sends a single test question, shows latency + tools called + response preview.

## Full Validator (Structural)

```bash
node --import tsx scripts/tika-validator.ts [options]
```

- `--category <name>` - Run specific category
- `--limit <n>` - First N scenarios
- `--stop-on <n>` - Stop after N consecutive failures
- `--dry-run` - Preview without running
- **Requires dev server on localhost:5173**

## Full Evaluator (With Opus Review)

```bash
npx tsx scripts/tika/evaluate.ts [options]
```

- `--category <letter|position|type|motion>` - Filter
- `--level <1-4>` - Difficulty filter
- `--with-opus` - Opus review of responses
- `--dry-run` - Show scenarios only
- Output: `scripts/tika/reports/`

## Manual API Call

```bash
curl -X POST http://localhost:5173/api/tika/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"What is alpha?","userId":"test-user","language":"en"}'
```

Returns SSE stream. Parse `data: ` lines, JSON each.

## Key Files

- API route: `src/routes/api/tika/ask/+server.ts`
- System prompt: `src/lib/features/tika/ai/system-prompts.ts`
- Tools: `src/lib/features/tika/services/tika-tool-executor.ts`
- Scenarios: `scripts/tika/scenarios.json`, loaded by `scripts/tika/run-evaluation.mjs`
- Components: `src/lib/features/tika/components/TikaConversation.svelte`

## SSE Response Format

```
data: {"type":"text-delta","textDelta":"Some text"}
data: {"type":"tool-input-available","toolName":"get_letter_explanation","input":{"letter":"A"}}
data: {"type":"tool-output-available","output":{"inlinePictograph":{"letter":"A",...}}}
data: [DONE]
```
