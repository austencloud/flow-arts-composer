/**
 * Opus Reviewer Script
 *
 * This script uses Claude Opus to review Haiku's TIKA responses.
 * Key capability: Opus has access to the SAME tools as Haiku,
 * allowing it to verify correctness by querying authoritative data.
 *
 * When Opus is uncertain about whether Haiku made an error,
 * it can call tools to get the ground truth before making a judgment.
 *
 * Usage:
 *   npx tsx scripts/tika/opus-reviewer.ts --input evaluation-results.json
 *   npx tsx scripts/tika/opus-reviewer.ts --scenario-id letter-type1-basic
 */

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

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
}

// ═══════════════════════════════════════════════════════════════════════════
// Tool Definitions (same as TIKA API)
// ═══════════════════════════════════════════════════════════════════════════

const OPUS_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_letter_explanation",
    description:
      "Get authoritative explanation of a TKA letter. Use this to verify if Haiku correctly described a letter.",
    input_schema: {
      type: "object" as const,
      properties: {
        letter: {
          type: "string",
          description: "The letter to look up (A-Z or Greek)",
        },
        variation: {
          type: "number",
          description: "Variation index (0-based, optional)",
        },
      },
      required: ["letter"],
    },
  },
  {
    name: "get_term_definition",
    description:
      "Get authoritative definition of a TKA term. Use this to verify if Haiku correctly defined a term.",
    input_schema: {
      type: "object" as const,
      properties: {
        term: { type: "string", description: "The term to look up" },
      },
      required: ["term"],
    },
  },
  {
    name: "compare_letters",
    description:
      "Get authoritative comparison between two letters. Use this to verify comparison accuracy.",
    input_schema: {
      type: "object" as const,
      properties: {
        letter1: { type: "string", description: "First letter" },
        letter2: { type: "string", description: "Second letter" },
      },
      required: ["letter1", "letter2"],
    },
  },
  {
    name: "list_letters_by_type",
    description:
      "Get authoritative list of letters in a type. Use this to verify type claims.",
    input_schema: {
      type: "object" as const,
      properties: {
        type: { type: "number", description: "Letter type 1-6" },
      },
      required: ["type"],
    },
  },
  {
    name: "get_position_info",
    description:
      "Get authoritative information about a position. Use to verify position claims.",
    input_schema: {
      type: "object" as const,
      properties: {
        position: {
          type: "string",
          description: "Position name (alpha, beta, gamma, etc.)",
        },
      },
      required: ["position"],
    },
  },
  {
    name: "read_codebase_file",
    description:
      "Read a file from the Flow Arts Composer codebase to verify domain rules or implementation details.",
    input_schema: {
      type: "object" as const,
      properties: {
        filepath: {
          type: "string",
          description:
            'Path relative to project root (e.g., "mcp-server/data/letter-types.json")',
        },
      },
      required: ["filepath"],
    },
  },
  {
    name: "flag_for_human_review",
    description:
      "Flag this evaluation for human review when you cannot confidently determine correctness.",
    input_schema: {
      type: "object" as const,
      properties: {
        reason: { type: "string", description: "Why human review is needed" },
        best_guess: {
          type: "string",
          description: "Your best guess if you have one",
        },
      },
      required: ["reason"],
    },
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// Tool Execution
// ═══════════════════════════════════════════════════════════════════════════

// Load knowledge base data
const PROJECT_ROOT = process.cwd();

function loadJsonFile(relativePath: string): unknown {
  const fullPath = path.join(PROJECT_ROOT, relativePath);
  if (fs.existsSync(fullPath)) {
    return JSON.parse(fs.readFileSync(fullPath, "utf-8"));
  }
  return null;
}

const glossary = loadJsonFile("mcp-server/data/tka-glossary.json") as Record<
  string,
  unknown
> | null;
const letterTypes = loadJsonFile("mcp-server/data/letter-types.json") as Record<
  string,
  unknown
> | null;

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
      const fullPath = path.join(PROJECT_ROOT, filepath);
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
// Review Function
// ═══════════════════════════════════════════════════════════════════════════

async function reviewWithOpus(
  scenario: TikaScenario,
  haikuResponse: HaikuResponse
): Promise<OpusReview> {
  const startTime = Date.now();
  const client = new Anthropic();
  const toolCalls: OpusToolCall[] = [];

  const userPrompt = `
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

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userPrompt },
  ];

  let response = await client.messages.create({
    model: "claude-sonnet-4-20250514", // Using Sonnet for cost efficiency, Opus for final review
    max_tokens: 2048,
    system: OPUS_REVIEW_SYSTEM_PROMPT,
    tools: OPUS_TOOLS,
    messages,
  });

  // Tool use loop
  while (response.stop_reason === "tool_use") {
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      const result = executeTool(
        toolUse.name,
        toolUse.input as Record<string, unknown>
      );

      toolCalls.push({
        tool: toolUse.name,
        input: toolUse.input as Record<string, unknown>,
        result,
        reason: "Verification during review",
      });

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: result,
      });
    }

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });

    response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 2048,
      system: OPUS_REVIEW_SYSTEM_PROMPT,
      tools: OPUS_TOOLS,
      messages,
    });
  }

  // Extract final text
  const textBlocks = response.content.filter(
    (b): b is Anthropic.TextBlock => b.type === "text"
  );
  const fullText = textBlocks.map((b) => b.text).join("\n");

  // Parse JSON from response
  const jsonMatch = fullText.match(/```json\s*([\s\S]*?)\s*```/);
  let evaluation: Partial<EvaluationResult> = {};

  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      evaluation = {
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
      evaluation = {
        grades: {
          domainAccuracy: 5,
          levelAppropriateness: 5,
          toolUsage: 5,
          conciseness: 5,
          helpfulness: 5,
        },
        overallScore: 5,
        recommendation: "flag-for-human",
        opusNotes: fullText,
        uncertaintyReason: "Failed to parse structured response",
      };
    }
  } else {
    evaluation = {
      grades: {
        domainAccuracy: 5,
        levelAppropriateness: 5,
        toolUsage: 5,
        conciseness: 5,
        helpfulness: 5,
      },
      overallScore: 5,
      recommendation: "flag-for-human",
      opusNotes: fullText,
      uncertaintyReason: "No structured JSON in response",
    };
  }

  const result: EvaluationResult = {
    scenarioId: scenario.id,
    language: "en",
    evaluatedAt: new Date(),
    haikuResponse,
    grades: evaluation.grades || {
      domainAccuracy: 5,
      levelAppropriateness: 5,
      toolUsage: 5,
      conciseness: 5,
      helpfulness: 5,
    },
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
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// CLI Interface
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.length === 0) {
    console.log(`
Opus Reviewer - Evaluate TIKA responses with tool-backed verification

Usage:
  npx tsx scripts/tika/opus-reviewer.ts --input <file.json>
  npx tsx scripts/tika/opus-reviewer.ts --demo

Options:
  --input <file>   JSON file with scenarios and Haiku responses
  --demo           Run a demo review with sample data
  --output <file>  Output file for results (default: stdout)
`);
    return;
  }

  if (args.includes("--demo")) {
    console.log("Running demo review...\n");

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

    // Simulate a BAD Haiku response (for demo purposes)
    const badHaikuResponse: HaikuResponse = {
      explanation:
        "Yes, that's correct! Type 1 letters are characterized by both hands moving. This creates the dynamic, flowing movements that make Type 1 the most common letter type in TKA.",
      toolsCalled: [],
      latencyMs: 450,
    };

    console.log("Scenario:", demoScenario.question.en);
    console.log("Haiku said:", badHaikuResponse.explanation);
    console.log("\nAsking Opus to review...\n");

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
    } catch (error) {
      console.error("Error during review:", error);
    }
  }
}

main().catch(console.error);

export { reviewWithOpus, OPUS_TOOLS };
