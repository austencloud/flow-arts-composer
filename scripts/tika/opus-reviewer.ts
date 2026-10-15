/**
 * Opus Reviewer Script
 *
 * Claude Opus 5.5 reviews TIKA's answers. It gets the same kind of lookup
 * tools TIKA has, answered locally from the repository's own data, so it can
 * check a claim against the source before calling it wrong.
 *
 * Runs on the root's `ai` + `@ai-sdk/anthropic` packages (the same ones the
 * TIKA route uses), so it loads from the repository root without mcp-server/'s
 * dependencies. Needs ANTHROPIC_API_KEY for a review; --dry-run needs nothing.
 *
 * Usage:
 *   npx tsx scripts/tika/opus-reviewer.ts --dry-run   # no model call
 *   npx tsx scripts/tika/opus-reviewer.ts --demo      # one paid review
 */

import { anthropic } from "@ai-sdk/anthropic";
import { generateText, stepCountIs, tool, type LanguageModel } from "ai";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { z } from "zod";

// Current Opus (2026-10). Its default effort is medium, which a grading pass
// needs no more than; thinking is always on, so none is configured here.
export const REVIEW_MODEL_ID = "claude-opus-5-5";
// Anthropic list prices for REVIEW_MODEL_ID, US dollars per million tokens.
export const REVIEW_PRICE_PER_MTOK = { input: 4, output: 20 };
// One answer, then up to this many verification rounds before it must grade.
const MAX_REVIEW_STEPS = 8;
const MAX_OUTPUT_TOKENS = 16000;

// ═══════════════════════════════════════════════════════════════════════════
// Types (inline to keep script self-contained)
// ═══════════════════════════════════════════════════════════════════════════

interface TikaScenario {
  id: string;
  name: { en: string };
  category: string;
  userLevel: 1 | 2 | 3 | 4;
  question: { en: string };
  criteria: {
    mustInclude: string[];
    mustNotInclude: string[];
    expectedTools: string[];
    keyFacts: Array<{ en: string }>;
    commonMistakes?: Array<{ en: string }>;
  };
  difficulty: string;
}

interface HaikuResponse {
  explanation: string;
  toolsCalled: Array<{
    name: string;
    input: Record<string, unknown>;
    result: unknown;
  }>;
  latencyMs: number;
}

interface GradeBreakdown {
  domainAccuracy: number;
  levelAppropriateness: number;
  toolUsage: number;
  conciseness: number;
  helpfulness: number;
}

type ReviewRecommendation =
  | "exemplary"
  | "good"
  | "needs-improvement"
  | "incorrect"
  | "flag-for-human";

interface EvaluationResult {
  scenarioId: string;
  language: string;
  evaluatedAt: Date;
  haikuResponse: HaikuResponse;
  grades: GradeBreakdown;
  overallScore: number;
  opusNotes: string;
  recommendation: ReviewRecommendation;
  suggestedRewrite?: string;
  errorAnalysis?: {
    error: string;
    violatedNode?: string;
    verificationTools: string[];
    confidence: number;
  };
  uncertaintyReason?: string;
}

interface OpusToolCall {
  tool: string;
  input: Record<string, unknown>;
  result: unknown;
  reason: string;
}

interface OpusReview {
  result: EvaluationResult;
  verificationToolCalls: OpusToolCall[];
  requiredVerification: boolean;
  reviewDurationMs: number;
  usage: ReviewUsage;
  costUsd: number;
}

interface ReviewUsage {
  inputTokens: number;
  outputTokens: number;
  steps: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// Tool Execution
// ═══════════════════════════════════════════════════════════════════════════

// Load knowledge base data. Glossary and letter types are generated from
// @tka/domain into mcp-server-pkg/data by scripts/sync-mcp-data.mjs.
// Paths resolve from the repository root, wherever the script is run from.
const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);

function loadJsonFile(relativePath: string): unknown {
  const fullPath = path.join(PROJECT_ROOT, relativePath);
  if (fs.existsSync(fullPath)) {
    return JSON.parse(fs.readFileSync(fullPath, "utf-8"));
  }
  // Without this the verification tools quietly answer "not loaded".
  console.warn(`[opus-reviewer] Missing data file: ${relativePath}`);
  return null;
}

const glossary = loadJsonFile(
  "mcp-server-pkg/data/tka-glossary.json"
) as Record<string, unknown> | null;
const letterTypes = loadJsonFile(
  "mcp-server-pkg/data/letter-types.json"
) as Record<string, unknown> | null;

// Load pictograph dataframe
function loadPictographs(): Array<Record<string, string>> {
  const csvPath = path.join(
    PROJECT_ROOT,
    "static/data/pictographs/DiamondPictographDataframe.csv"
  );
  if (!fs.existsSync(csvPath)) return [];

  const content = fs.readFileSync(csvPath, "utf-8");
  const lines = content.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => (row[h] = values[idx] || ""));
    rows.push(row);
  }

  return rows;
}

const pictographs = loadPictographs();

function executeTool(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "get_letter_explanation": {
      const letter = input.letter as string;
      const variations = pictographs.filter((p) => p.letter === letter);
      if (variations.length === 0) return `Letter "${letter}" not found.`;

      // Find type
      let typeNum = "?";
      let typeName = "Unknown";
      if (letterTypes) {
        for (const [t, info] of Object.entries(letterTypes)) {
          const typeInfo = info as { letters: string[]; name: string };
          if (typeInfo.letters?.includes(letter)) {
            typeNum = t;
            typeName = typeInfo.name;
            break;
          }
        }
      }

      const v = variations[0];
      return `Letter ${letter}: Type ${typeNum} (${typeName})
Left motion: ${v.leftMotionType} (${v.leftStartLocation} → ${v.leftEndLocation})
Right motion: ${v.rightMotionType} (${v.rightStartLocation} → ${v.rightEndLocation})
Start position: ${v.startPlacement}, End position: ${v.endPlacement}
Total variations: ${variations.length}`;
    }

    case "get_term_definition": {
      const term = (input.term as string).toLowerCase();
      if (!glossary) return "Glossary not loaded.";
      const entry = glossary[term] as { definition?: string } | undefined;
      if (!entry) return `Term "${term}" not found in glossary.`;
      return `${term}: ${entry.definition || "No definition available"}`;
    }

    case "list_letters_by_type": {
      const type = input.type as number;
      if (!letterTypes) return "Letter types data not loaded.";
      const typeInfo = letterTypes[type.toString()] as {
        name: string;
        letters: string[];
        description: string;
      };
      if (!typeInfo) return `Type ${type} not found.`;
      return `Type ${type} (${typeInfo.name}): ${typeInfo.letters.join(", ")}
Description: ${typeInfo.description}`;
    }

    case "get_position_info": {
      const pos = (input.position as string).toLowerCase();
      const positions: Record<string, string> = {
        alpha: "Hands at opposite grid points (180° apart)",
        beta: "Hands at the same grid point",
        gamma: "Hands form a right angle (90°, adjacent points)",
        zeta: "Hands form an obtuse angle (Level 5, skewed)",
        eta: "Hands form an acute angle (Level 5, skewed)",
      };
      return positions[pos] || `Position "${pos}" not recognized.`;
    }

    case "compare_letters": {
      const l1 = input.letter1 as string;
      const l2 = input.letter2 as string;

      const result1 = executeTool("get_letter_explanation", { letter: l1 });
      const result2 = executeTool("get_letter_explanation", { letter: l2 });

      return `=== ${l1} ===\n${result1}\n\n=== ${l2} ===\n${result2}`;
    }

    case "read_codebase_file": {
      const filepath = input.filepath as string;
      const fullPath = path.resolve(PROJECT_ROOT, filepath);
      // Whatever this returns is sent to the API: stay in the repository and
      // never read the secrets files.
      const relative = path.relative(PROJECT_ROOT, fullPath);
      if (
        relative.startsWith("..") ||
        path.isAbsolute(relative) ||
        path.basename(fullPath).startsWith(".env")
      ) {
        return `Not readable: ${filepath}`;
      }
      if (!fs.existsSync(fullPath)) return `File not found: ${filepath}`;
      return fs.readFileSync(fullPath, "utf-8").slice(0, 5000); // Limit size
    }

    case "flag_for_human_review": {
      // This is a signal tool - just acknowledge it
      return `Flagged for human review. Reason: ${input.reason}`;
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Opus Review System Prompt
// ═══════════════════════════════════════════════════════════════════════════

const OPUS_REVIEW_SYSTEM_PROMPT = `You are an expert reviewer evaluating AI-generated responses about The Kinetic Alphabet (TKA).

Your job is to grade Haiku's response to a user question and determine if it should be:
- EXEMPLARY: Perfect response, should be added to few-shot examples
- GOOD: Acceptable response, no action needed
- NEEDS-IMPROVEMENT: Mostly correct but could be better, generate a rewrite
- INCORRECT: Contains domain errors, analyze what went wrong
- FLAG-FOR-HUMAN: You're uncertain and need human verification

## Critical TKA Domain Rules (verify against these):

1. **Motion Type Precision**: NEVER say "both hands move" as the distinguishing feature of Type 1.
   - Type 1: Both hands SHIFT (not just "move")
   - Type 3: Both hands move (one shifts, one dashes)
   - Type 5: Both hands DASH

2. **The "-" Suffix Convention**: "Sigma dash" means the letter Σ- (Type 3), NOT Sigma with dash motion.

3. **Types are Numbered 1-6, Not Lettered**: "Type A" is wrong, "Type 1" is correct.

4. **Position Language**:
   - Say "opposite points" not "180 degrees" for alpha
   - Say "right angle" not "perpendicular" for gamma

5. **Level Constraints**: Users should NOT see concepts beyond their level:
   - Level 1: No turns, quarter turns, or skews
   - Level 2: Can mention turns, but NOT quarter turns or skews
   - Level 3: Can mention quarter turns, but NOT skews
   - Level 4: Can mention everything

## Your Tools

You have access to the same authoritative data sources as Haiku:
- get_letter_explanation: Look up a letter's type and motions
- get_term_definition: Look up a term's official definition
- list_letters_by_type: Get all letters in a type
- get_position_info: Get position definitions
- compare_letters: Compare two letters
- read_codebase_file: Read source code for verification
- flag_for_human_review: When you're uncertain

## When to Use Tools

1. **ALWAYS verify** if you're not 100% sure Haiku is correct
2. **Call tools** to get ground truth before claiming something is wrong
3. **Flag for human** if tools don't give you a clear answer
4. **Read code** when checking implementation-specific details

## Response Format

After your analysis, output a JSON object with this structure:

\`\`\`json
{
  "grades": {
    "domainAccuracy": <1-10>,
    "levelAppropriateness": <1-10>,
    "toolUsage": <1-10>,
    "conciseness": <1-10>,
    "helpfulness": <1-10>
  },
  "overallScore": <1-10>,
  "recommendation": "<exemplary|good|needs-improvement|incorrect|flag-for-human>",
  "notes": "<detailed explanation of your grading>",
  "suggestedRewrite": "<if needs-improvement, your better version>",
  "errorAnalysis": {
    "error": "<if incorrect, what was wrong>",
    "violatedNode": "<which knowledge concept was violated>",
    "confidence": <0.0-1.0>
  },
  "uncertaintyReason": "<if flag-for-human, why you're uncertain>"
}
\`\`\`
`;

// ═══════════════════════════════════════════════════════════════════════════
// Tool Definitions (same lookups as the TIKA API, answered by executeTool)
// ═══════════════════════════════════════════════════════════════════════════

function localTool<INPUT extends Record<string, unknown>>(
  name: string,
  description: string,
  inputSchema: z.ZodType<INPUT>
) {
  return tool({
    description,
    inputSchema,
    execute: async (input: INPUT) => executeTool(name, input),
  });
}

const OPUS_TOOLS = {
  get_letter_explanation: localTool(
    "get_letter_explanation",
    "Get authoritative explanation of a TKA letter. Use this to verify if Haiku correctly described a letter.",
    z.object({
      letter: z.string().describe("The letter to look up (A-Z or Greek)"),
      variation: z
        .number()
        .optional()
        .describe("Variation index (0-based, optional)"),
    })
  ),
  get_term_definition: localTool(
    "get_term_definition",
    "Get authoritative definition of a TKA term. Use this to verify if Haiku correctly defined a term.",
    z.object({ term: z.string().describe("The term to look up") })
  ),
  compare_letters: localTool(
    "compare_letters",
    "Get authoritative comparison between two letters. Use this to verify comparison accuracy.",
    z.object({
      letter1: z.string().describe("First letter"),
      letter2: z.string().describe("Second letter"),
    })
  ),
  list_letters_by_type: localTool(
    "list_letters_by_type",
    "Get authoritative list of letters in a type. Use this to verify type claims.",
    z.object({ type: z.number().describe("Letter type 1-6") })
  ),
  get_position_info: localTool(
    "get_position_info",
    "Get authoritative information about a position. Use to verify position claims.",
    z.object({
      position: z.string().describe("Position name (alpha, beta, gamma, etc.)"),
    })
  ),
  read_codebase_file: localTool(
    "read_codebase_file",
    "Read a file from the Flow Arts Composer codebase to verify domain rules or implementation details.",
    z.object({
      filepath: z
        .string()
        .describe(
          'Path relative to project root (e.g., "mcp-server-pkg/data/letter-types.json")'
        ),
    })
  ),
  flag_for_human_review: localTool(
    "flag_for_human_review",
    "Flag this evaluation for human review when you cannot confidently determine correctness.",
    z.object({
      reason: z.string().describe("Why human review is needed"),
      best_guess: z
        .string()
        .optional()
        .describe("Your best guess if you have one"),
    })
  ),
};

// ═══════════════════════════════════════════════════════════════════════════
// Review Function
// ═══════════════════════════════════════════════════════════════════════════

export function reviewCostUsd(usage: ReviewUsage): number {
  return (
    (usage.inputTokens * REVIEW_PRICE_PER_MTOK.input +
      usage.outputTokens * REVIEW_PRICE_PER_MTOK.output) /
    1_000_000
  );
}

export function buildReviewPrompt(
  scenario: TikaScenario,
  haikuResponse: HaikuResponse
): string {
  return `
## Scenario
ID: ${scenario.id}
Category: ${scenario.category}
User Level: ${scenario.userLevel}
Difficulty: ${scenario.difficulty}

## User's Question
"${scenario.question.en}"

## Haiku's Response
"${haikuResponse.explanation}"

## Tools Haiku Called
${haikuResponse.toolsCalled.map((t) => `- ${t.name}(${JSON.stringify(t.input)})`).join("\n") || "None"}

## Grading Criteria
Must Include: ${scenario.criteria.mustInclude.join(", ") || "None specified"}
Must NOT Include: ${scenario.criteria.mustNotInclude.join(", ") || "None specified"}
Expected Tools: ${scenario.criteria.expectedTools.join(", ") || "None specified"}

Key Facts:
${scenario.criteria.keyFacts.map((f) => `- ${f.en}`).join("\n")}

${scenario.criteria.commonMistakes ? `Common Mistakes to Watch For:\n${scenario.criteria.commonMistakes.map((m) => `- ${m.en}`).join("\n")}` : ""}

---

Please analyze Haiku's response. If you're unsure about any domain facts, USE YOUR TOOLS to verify before grading.
Output your evaluation as JSON at the end.
`;
}

const NEUTRAL_GRADES: GradeBreakdown = {
  domainAccuracy: 5,
  levelAppropriateness: 5,
  toolUsage: 5,
  conciseness: 5,
  helpfulness: 5,
};

function parseReviewJson(fullText: string): Partial<EvaluationResult> {
  const jsonMatch = fullText.match(/```json\s*([\s\S]*?)\s*```/);
  if (!jsonMatch) {
    return {
      grades: NEUTRAL_GRADES,
      overallScore: 5,
      recommendation: "flag-for-human",
      opusNotes: fullText,
      uncertaintyReason: "No structured JSON in response",
    };
  }

  try {
    const parsed = JSON.parse(jsonMatch[1]);
    return {
      grades: parsed.grades,
      overallScore: parsed.overallScore,
      recommendation: parsed.recommendation,
      opusNotes: parsed.notes,
      suggestedRewrite: parsed.suggestedRewrite,
      errorAnalysis: parsed.errorAnalysis,
      uncertaintyReason: parsed.uncertaintyReason,
    };
  } catch (e) {
    console.error("Failed to parse Opus JSON response:", e);
    return {
      grades: NEUTRAL_GRADES,
      overallScore: 5,
      recommendation: "flag-for-human",
      opusNotes: fullText,
      uncertaintyReason: "Failed to parse structured response",
    };
  }
}

async function reviewWithOpus(
  scenario: TikaScenario,
  haikuResponse: HaikuResponse,
  options: { model?: LanguageModel } = {}
): Promise<OpusReview> {
  const startTime = Date.now();

  // The SDK runs the tool loop: each step's tool calls go to executeTool and
  // the results go back to the model until it answers in text or hits the cap.
  const response = await generateText({
    model: options.model ?? anthropic(REVIEW_MODEL_ID),
    system: OPUS_REVIEW_SYSTEM_PROMPT,
    prompt: buildReviewPrompt(scenario, haikuResponse),
    tools: OPUS_TOOLS,
    stopWhen: stepCountIs(MAX_REVIEW_STEPS),
    maxOutputTokens: MAX_OUTPUT_TOKENS,
  });

  const toolCalls: OpusToolCall[] = response.steps.flatMap((step) =>
    step.toolResults.map((toolResult) => ({
      tool: toolResult.toolName,
      input: toolResult.input as Record<string, unknown>,
      result: toolResult.output,
      reason: "Verification during review",
    }))
  );

  const evaluation = parseReviewJson(response.text);
  const usage: ReviewUsage = {
    inputTokens: response.totalUsage.inputTokens ?? 0,
    outputTokens: response.totalUsage.outputTokens ?? 0,
    steps: response.steps.length,
  };

  const result: EvaluationResult = {
    scenarioId: scenario.id,
    language: "en",
    evaluatedAt: new Date(),
    haikuResponse,
    grades: evaluation.grades || NEUTRAL_GRADES,
    overallScore: evaluation.overallScore || 5,
    opusNotes: evaluation.opusNotes || "",
    recommendation: evaluation.recommendation || "flag-for-human",
    suggestedRewrite: evaluation.suggestedRewrite,
    errorAnalysis: evaluation.errorAnalysis,
    uncertaintyReason: evaluation.uncertaintyReason,
  };

  return {
    result,
    verificationToolCalls: toolCalls,
    requiredVerification: toolCalls.length > 0,
    reviewDurationMs: Date.now() - startTime,
    usage,
    costUsd: reviewCostUsd(usage),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI Interface
// ═══════════════════════════════════════════════════════════════════════════

const demoScenario: TikaScenario = {
  id: "demo-misconception",
  name: { en: "Demo: Type 1 Misconception" },
  category: "misconception-correction",
  userLevel: 1,
  question: { en: "Type 1 is when both hands move, right?" },
  criteria: {
    mustInclude: ["shift", "Type 3", "Type 5"],
    mustNotInclude: ["turn", "skew"],
    expectedTools: ["list_letters_by_type"],
    keyFacts: [
      { en: "MUST correct this misconception" },
      { en: "Type 1 is when both hands SHIFT" },
      { en: "Types 3 and 5 also have both hands moving" },
    ],
    commonMistakes: [{ en: "Agreeing that Type 1 = both hands move" }],
  },
  difficulty: "hard",
};

// A deliberately wrong answer, so the demo has something to catch.
const badHaikuResponse: HaikuResponse = {
  explanation:
    "Yes, that's correct! Type 1 letters are characterized by both hands moving. This creates the dynamic, flowing movements that make Type 1 the most common letter type in TKA.",
  toolsCalled: [],
  latencyMs: 450,
};

/** What a review would send and whether its data loads. No model call. */
export function describeReviewSetup() {
  return {
    model: REVIEW_MODEL_ID,
    pricePerMTok: REVIEW_PRICE_PER_MTOK,
    maxSteps: MAX_REVIEW_STEPS,
    apiKeySet: Boolean(process.env.ANTHROPIC_API_KEY?.trim()),
    tools: Object.keys(OPUS_TOOLS),
    data: {
      glossaryTerms: glossary ? Object.keys(glossary).length : 0,
      letterTypes: letterTypes ? Object.keys(letterTypes).length : 0,
      pictographRows: pictographs.length,
    },
  };
}

function printDryRun() {
  const setup = describeReviewSetup();
  const promptChars =
    OPUS_REVIEW_SYSTEM_PROMPT.length +
    buildReviewPrompt(demoScenario, badHaikuResponse).length;

  console.log("DRY RUN - no model call\n");
  console.log(
    `Model: ${setup.model} ($${setup.pricePerMTok.input}/$${setup.pricePerMTok.output} per M input/output tokens)`
  );
  console.log(
    `ANTHROPIC_API_KEY: ${setup.apiKeySet ? "set" : "NOT SET (a review would fail)"}`
  );
  console.log(`Tools: ${setup.tools.join(", ")}`);
  console.log(
    `Data: ${setup.data.glossaryTerms} glossary terms, ${setup.data.letterTypes} letter types, ${setup.data.pictographRows} pictograph rows`
  );
  console.log(
    `Demo prompt: ~${Math.round(promptChars / 4)} tokens before tool definitions\n`
  );

  console.log("Local tool answers:");
  const samples: Array<[string, Record<string, unknown>]> = [
    ["get_letter_explanation", { letter: "A" }],
    ["get_term_definition", { term: "shift" }],
    ["list_letters_by_type", { type: 1 }],
    ["get_position_info", { position: "alpha" }],
  ];
  for (const [name, input] of samples) {
    const answer = executeTool(name, input).split("\n")[0];
    console.log(`  ${name}(${JSON.stringify(input)}) -> ${answer}`);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.length === 0) {
    console.log(`
Opus Reviewer - Evaluate TIKA responses with tool-backed verification

Usage:
  npx tsx scripts/tika/opus-reviewer.ts --dry-run
  npx tsx scripts/tika/opus-reviewer.ts --demo

Options:
  --dry-run   Show the model, tools, and loaded data; makes no model call
  --demo      Review one sample answer (paid ${REVIEW_MODEL_ID} call, about $0.10)

run-evaluation.mjs --opus imports reviewWithOpus for answers scoring under 70.
`);
    return;
  }

  if (args.includes("--dry-run")) {
    printDryRun();
    return;
  }

  if (args.includes("--demo")) {
    console.log("Running demo review...\n");
    console.log("Scenario:", demoScenario.question.en);
    console.log("Haiku said:", badHaikuResponse.explanation);
    console.log(`\nAsking ${REVIEW_MODEL_ID} to review...\n`);

    try {
      const review = await reviewWithOpus(demoScenario, badHaikuResponse);

      console.log("=== OPUS REVIEW ===");
      console.log(`Recommendation: ${review.result.recommendation}`);
      console.log(`Overall Score: ${review.result.overallScore}/10`);
      console.log(`\nGrades:`);
      console.log(
        `  Domain Accuracy: ${review.result.grades.domainAccuracy}/10`
      );
      console.log(
        `  Level Appropriateness: ${review.result.grades.levelAppropriateness}/10`
      );
      console.log(`  Tool Usage: ${review.result.grades.toolUsage}/10`);
      console.log(`  Conciseness: ${review.result.grades.conciseness}/10`);
      console.log(`  Helpfulness: ${review.result.grades.helpfulness}/10`);
      console.log(`\nNotes:\n${review.result.opusNotes}`);

      if (review.verificationToolCalls.length > 0) {
        console.log(`\nVerification Tools Used:`);
        review.verificationToolCalls.forEach((tc) => {
          console.log(`  - ${tc.tool}(${JSON.stringify(tc.input)})`);
        });
      }

      if (review.result.suggestedRewrite) {
        console.log(`\nSuggested Rewrite:\n${review.result.suggestedRewrite}`);
      }

      if (review.result.errorAnalysis) {
        console.log(`\nError Analysis:`);
        console.log(`  Error: ${review.result.errorAnalysis.error}`);
        console.log(`  Confidence: ${review.result.errorAnalysis.confidence}`);
      }

      console.log(
        `\nUsage: ${review.usage.inputTokens} input + ${review.usage.outputTokens} output tokens over ${review.usage.steps} steps = $${review.costUsd.toFixed(4)}`
      );
    } catch (error) {
      console.error("Error during review:", error);
      process.exitCode = 1;
    }
  }
}

// run-evaluation.mjs imports this module; only the command line runs main().
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { reviewWithOpus, OPUS_TOOLS };
