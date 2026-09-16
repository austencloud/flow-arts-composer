/**
 * TIKA Ask API Endpoint (AI SDK Streaming)
 *
 * Server-side endpoint for the TIKA AI assistant using Vercel AI SDK.
 * Streams responses word-by-word for modern chat UX.
 *
 * Uses extracted services for:
 * - Data loading (TikaPictographLoader)
 * - Sequence validation (TikaSequenceValidator)
 * - Sequence generation (TikaSequenceGenerator)
 * - Quiz generation (TikaQuizGenerator)
 * - Tool execution (TikaToolExecutor)
 * - Model selection (TikaModelProvider)
 */

import type { RequestHandler } from "@sveltejs/kit";
import { streamText, tool, convertToModelMessages, type UIMessage, jsonSchema, stepCountIs } from "ai";
import { env } from "$env/dynamic/private";
import { requireFirebaseUser } from "$lib/server/auth/requireFirebaseUser";
import { RATE_LIMITS } from "$lib/server/security/rate-limiter";
import { withRateLimit } from "$lib/server/security/withRateLimit";
import { buildSystemPrompt } from "$lib/features/tika/ai/system-prompts";
import {
  DEFAULT_TIKA_MODEL,
  getTikaModelDefinition,
} from "$lib/features/tika/domain/tika-model-catalog";
import type { MasteryContext } from "$lib/features/learn/domain/quiz-history-types";
import {
  deriveUserOverlay,
  getTypeComparison,
  getPlacementComparison,
  getMotionTypeComparison,
  getRotationExplanation,
  getGridModeExplanation,
  getVTGMapping,
  getAlphabetOverview,
  getCommonAnswer,
  getTypeNamingOrigin,
  findDomainTopic,
  listDomainTopics,
} from "@tka/domain";
import {
  searchVTG,
  getVTGCategory,
  getTransitionBetween,
  vtgToTKA,
  tkaToVTG,
  listVTGCategories,
} from "@vtg/domain";
import {
  toDisplayOutput,
  filterLetterExplanation,
  filterTypeList,
  filterComparison,
  filterQuiz,
} from "$lib/features/tika/validation/output-filter";
import { getTikaServerContainer } from "$lib/features/tika/services/server/tika-server-container";
import { findCapabilities } from "$lib/features/tika/services/tika-capability-lookup";
import {
  validateResponse,
  formatValidationReport,
} from "$lib/features/tika/validation/tika-response-validator";

// ═══════════════════════════════════════════════════════════════════════════
// Container & Services
// ═══════════════════════════════════════════════════════════════════════════

function getContainer() {
  return getTikaServerContainer({
    anthropicApiKey: env.ANTHROPIC_API_KEY || "",
    deepseekApiKey: env.DEEPSEEK_API_KEY || "",
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// AI SDK Tools Definition
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Resolve quiz difficulty based on user mastery data.
 * If the LLM didn't specify a difficulty (defaults to "medium"),
 * override based on whether the topic appears in mastered or struggling concepts.
 */
function resolveQuizDifficulty(
  topic: string,
  masteryCtx: MasteryContext | undefined,
  requestedDifficulty: "easy" | "medium" | "hard"
): "easy" | "medium" | "hard" {
  // If the LLM explicitly chose non-default, respect it
  if (requestedDifficulty !== "medium") return requestedDifficulty;

  // No mastery data available - keep default
  if (!masteryCtx) return "medium";

  const normalizedTopic = topic.toLowerCase();

  const matchesList = (concepts: string[]) =>
    concepts.some((c) => normalizedTopic.includes(c.toLowerCase()) || c.toLowerCase().includes(normalizedTopic));

  if (matchesList(masteryCtx.masteredConcepts)) return "hard";
  if (matchesList(masteryCtx.strugglingConcepts)) return "easy";

  return "medium";
}

export function _createTikaTools(userId: string, completedConcepts: string[], masteryCtx?: MasteryContext) {
  const container = getContainer();
  const { toolExecutor, sequenceValidator, sequenceGenerator, quizGenerator, progressWriter } = container; // eslint-disable-line @typescript-eslint/no-unused-vars

  return {
    get_letter_explanation: tool({
      description:
        "MANDATORY for ANY question about a specific letter (A-Z, Greek letters). Returns pictograph data and detailed explanation. ALWAYS use this for \"What is X?\", \"Tell me about X\", \"Explain X\" where X is a letter. Use gridMode='box' when the user asks to see something in box mode.",
      inputSchema: jsonSchema<{ letter: string; variation?: number; gridMode?: string }>({
        type: "object",
        properties: {
          letter: { type: "string", description: "The letter to explain (A-Z or Greek)" },
          variation: { type: "number", description: "Variation index (0-based)", default: 0 },
          gridMode: { type: "string", enum: ["diamond", "box"], description: "Grid mode - diamond (default) or box", default: "diamond" },
        },
        required: ["letter"],
      }),
      execute: async ({ letter, variation = 0, gridMode = "diamond" }) =>
        filterLetterExplanation(toolExecutor.getLetterExplanation(letter, variation, gridMode as "diamond" | "box")),
    }),

    get_term_definition: tool({
      description:
        "Get the definition of a specific TKA glossary term like alpha, pro, shift, static, beta, gamma, dash, anti, etc. Use ONLY for specific technical terms, NOT for system-level concepts (use answer_common_question for 'what is a word/sequence/loop/pictograph/TKA').",
      inputSchema: jsonSchema<{ term: string }>({
        type: "object",
        properties: {
          term: { type: "string", description: "The term to define" },
        },
        required: ["term"],
      }),
      execute: async ({ term }) => toDisplayOutput(toolExecutor.getTermDefinition(term)),
    }),

    compare_letters: tool({
      description:
        "Compare two TKA letters side by side, explaining their differences. Use this when asked to compare or contrast letters.",
      inputSchema: jsonSchema<{ letter1: string; letter2: string }>({
        type: "object",
        properties: {
          letter1: { type: "string", description: "First letter to compare" },
          letter2: { type: "string", description: "Second letter to compare" },
        },
        required: ["letter1", "letter2"],
      }),
      execute: async ({ letter1, letter2 }) =>
        filterComparison(toolExecutor.compareLetters(letter1, letter2)),
    }),

    list_letters_by_type: tool({
      description:
        'MANDATORY for questions about letter types ("Type X letters", "Tell me about Type X", "What are Type X letters"). Returns visual gallery of example letters. ALWAYS use this instead of describing types in text.',
      inputSchema: jsonSchema<{ type: number }>({
        type: "object",
        properties: {
          type: {
            type: "number",
            minimum: 1,
            maximum: 6,
            description:
              "Letter type 1-6: 1=Dual-Shift, 2=Shift, 3=Cross-Shift, 4=Dash, 5=Dual-Dash, 6=Static",
          },
        },
        required: ["type"],
      }),
      execute: async ({ type }) => filterTypeList(toolExecutor.listLettersByType(type)),
    }),

    compare_positions: tool({
      description:
        "Compare two TKA positions (alpha, beta, gamma, etc). Use when asked about differences between positions.",
      inputSchema: jsonSchema<{ position1: string; position2: string }>({
        type: "object",
        properties: {
          position1: { type: "string", description: "First position name" },
          position2: { type: "string", description: "Second position name" },
        },
        required: ["position1", "position2"],
      }),
      execute: async ({ position1, position2 }) => getPlacementComparison(position1, position2),
    }),

    compare_types: tool({
      description:
        'MANDATORY for comparing letter types ("Type X vs Type Y", "How do Type X and Type Y differ", "Difference between Type X and Type Y"). ALWAYS use this instead of explaining differences in text.',
      inputSchema: jsonSchema<{ type1: number; type2: number }>({
        type: "object",
        properties: {
          type1: { type: "number", minimum: 1, maximum: 6, description: "First type number (1-6)" },
          type2: { type: "number", minimum: 1, maximum: 6, description: "Second type number (1-6)" },
        },
        required: ["type1", "type2"],
      }),
      execute: async ({ type1, type2 }) => getTypeComparison(type1, type2),
    }),

    compare_motion_types: tool({
      description:
        "Compare two motion types (static, shift, dash). Use when asked about differences between motion types.",
      inputSchema: jsonSchema<{ motion1: string; motion2: string }>({
        type: "object",
        properties: {
          motion1: { type: "string", description: "First motion type" },
          motion2: { type: "string", description: "Second motion type" },
        },
        required: ["motion1", "motion2"],
      }),
      execute: async ({ motion1, motion2 }) => getMotionTypeComparison(motion1, motion2),
    }),

    get_rotation_info: tool({
      description:
        "Get canonical definition of a rotation direction (pro, anti, prospin, antispin, cw, ccw). ALWAYS use this for rotation questions.",
      inputSchema: jsonSchema<{ rotation: string }>({
        type: "object",
        properties: {
          rotation: {
            type: "string",
            description: "Rotation type (pro, anti, prospin, antispin, cw, ccw)",
          },
        },
        required: ["rotation"],
      }),
      execute: async ({ rotation }) => getRotationExplanation(rotation),
    }),

    get_grid_mode: tool({
      description:
        "Get canonical definition of a grid mode (diamond, box, skewed). ALWAYS use this for grid mode questions.",
      inputSchema: jsonSchema<{ mode: string }>({
        type: "object",
        properties: {
          mode: { type: "string", description: "Grid mode (diamond, box, skewed)" },
        },
        required: ["mode"],
      }),
      execute: async ({ mode }) => getGridModeExplanation(mode),
    }),

    get_vtg_mapping: tool({
      description:
        "Get the TKA letters that correspond to a VTG (Vulcan Tech Gospel) term. Use for VTG-to-TKA translation.",
      inputSchema: jsonSchema<{ vtg_term: string }>({
        type: "object",
        properties: {
          vtg_term: {
            type: "string",
            description:
              "VTG term (split-same, tog-same, split-opp, tog-opp, quarter-same, quarter-opp)",
          },
        },
        required: ["vtg_term"],
      }),
      execute: async ({ vtg_term }) => getVTGMapping(vtg_term),
    }),

    get_alphabet_overview: tool({
      description:
        'Get a complete overview of the TKA alphabet - all 6 types, letter counts, and organization. ALWAYS use this when asked "what is TKA" or for alphabet overviews.',
      inputSchema: jsonSchema<Record<string, never>>({
        type: "object",
        properties: {},
      }),
      execute: async () => getAlphabetOverview(),
    }),

    answer_common_question: tool({
      description:
        'MANDATORY for conceptual questions about TKA itself. Handles: "what is TKA", "what is a word", "what is a sequence", "what is a pictograph", "what is a loop", "what is VTG", "what is float", "what is hash", "why cross-shift", "what are compound letters", "what are interradials". Use this INSTEAD of get_term_definition when the question is about a system-level concept (word, sequence, loop, pictograph, TKA), not a specific glossary term (alpha, shift, dash, pro, anti).',
      inputSchema: jsonSchema<{ question: string }>({
        type: "object",
        properties: {
          question: {
            type: "string",
            description:
              "The question topic (tka, vtg, pictograph, sequence, loop, why cross-shift)",
          },
        },
        required: ["question"],
      }),
      execute: async ({ question }) => {
        const answer = getCommonAnswer(question);
        return answer || `No canonical answer found for "${question}". Use other tools to construct a response.`;
      },
    }),

    get_type_naming_origin: tool({
      description:
        'Explain why a letter type has its name (e.g., why "Cross-Shift" not "Dash-Shift"). ALWAYS use this for "why is it called X" questions about type names.',
      inputSchema: jsonSchema<{ type: number }>({
        type: "object",
        properties: {
          type: { type: "number", minimum: 1, maximum: 6, description: "The type number (1-6)" },
        },
        required: ["type"],
      }),
      execute: async ({ type }) => getTypeNamingOrigin(type),
    }),

    show_position_examples: tool({
      description:
        'MANDATORY for position questions ("What is alpha?", "Tell me about gamma", "Show me beta"). Returns visual pictograph examples using hand props to teach positions. Shows BOTH diamond mode (common) and box mode variations. NEVER explain positions in text alone - always show examples. Uses beginner-friendly language without jargon.',
      inputSchema: jsonSchema<{ position: string }>({
        type: "object",
        properties: {
          position: {
            type: "string",
            description: "Position name (alpha, beta, gamma, zeta, eta)",
          },
        },
        required: ["position"],
      }),
      execute: async ({ position }) => toolExecutor.showPositionExamples(position),
    }),

    show_motion_examples: tool({
      description:
        'MANDATORY for motion type questions ("What is shift?", "Tell me about dash", "Show me static motion"). Returns visual pictograph examples. NEVER explain motion types in text alone - always show examples.',
      inputSchema: jsonSchema<{ motionType: string; hand?: "left" | "right" | "both" | "blue" | "red" }>({
        type: "object",
        properties: {
          motionType: { type: "string", description: "Motion type (shift, dash, static)" },
          hand: {
            type: "string",
            enum: ["left", "right", "both", "blue", "red"],
            default: "both",
            description: "Performer hand. Prefer left/right; blue/red are legacy aliases.",
          },
        },
        required: ["motionType"],
      }),
      execute: async ({ motionType, hand = "both" }) =>
        toolExecutor.showMotionExamples(motionType, hand),
    }),

    explain_sequence: tool({
      description:
        'MANDATORY for questions about sequences or "words" (multiple letters together). Generates and visualizes a valid TKA sequence. Use for "Show me sequence ABC", "What is the word XYZ", "Animate ABC".',
      inputSchema: jsonSchema<{ word: string }>({
        type: "object",
        properties: {
          word: { type: "string", description: 'The sequence word, e.g., "ABC" or "DEFGH"' },
        },
        required: ["word"],
      }),
      execute: async ({ word }) => toolExecutor.explainSequence(word),
    }),

    validate_sequence: tool({
      description:
        "MANDATORY: Call this BEFORE attempting to generate or display any sequence. Algorithmically validates if letters can chain together based on position groups. Returns detailed explanation of any breaks and suggests bridge letters to fix invalid sequences. Never guess about sequence validity - always call this tool.",
      inputSchema: jsonSchema<{ word: string }>({
        type: "object",
        properties: {
          word: {
            type: "string",
            description: 'The sequence word to validate, e.g., "ABC" or "DEF"',
          },
        },
        required: ["word"],
      }),
      execute: async ({ word }) => {
        try {
          const letters = sequenceValidator.parseWordToLetters(word.toUpperCase());

          if (letters.length === 0) {
            return { isValid: false, explanation: `No valid letters in "${word}"` };
          }

          for (const letter of letters) {
            if (!sequenceValidator.isValidLetter(letter)) {
              return {
                isValid: false,
                explanation: `Invalid letter "${letter}" in sequence. Use valid TKA letters.`,
              };
            }
          }

          if (letters.length === 1) {
            return {
              isValid: true,
              word: letters[0],
              explanation: `Single letter "${letters[0]}" is always valid.`,
            };
          }

          const result = sequenceValidator.validateChaining(letters);

          return {
            isValid: result.isValid,
            word: result.word,
            explanation: result.explanation,
            invalidTransitions:
              result.invalidTransitions.length > 0 ? result.invalidTransitions : undefined,
            interpolatedSequence: result.interpolatedSequence,
            canBeInterpolated: !!result.interpolatedSequence,
          };
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          return { isValid: false, explanation: `Validation error: ${errorMessage}` };
        }
      },
    }),

    show_sequence_steps: tool({
      description:
        "Shows a sequence broken down into individual pictographs with step labels. IMPORTANT: Call validate_sequence first to check if the word is valid. If invalid, explain the validation result to the user instead of calling this tool.",
      inputSchema: jsonSchema<{ word: string; useInterpolation?: boolean }>({
        type: "object",
        properties: {
          word: { type: "string", description: 'The sequence word, e.g., "ABC" or "DEFGH"' },
          useInterpolation: {
            type: "boolean",
            description: "If true and sequence is invalid, use bridge letters to make it valid",
          },
        },
        required: ["word"],
      }),
      execute: async ({ word }) => toolExecutor.showSequenceSteps(word),
    }),

    generate_quiz: tool({
      description:
        "Generate an interactive quiz to test knowledge. Use when the user asks to be quizzed, wants to test their understanding, or after explaining a concept to reinforce learning. Can quiz on letters, types, positions, motion types, or comparisons.",
      inputSchema: jsonSchema<{
        topic: string;
        quizType?: "multiple-choice" | "identify-letter" | "true-false";
        difficulty?: "easy" | "medium" | "hard";
      }>({
        type: "object",
        properties: {
          topic: {
            type: "string",
            description:
              'Topic to quiz on: letter (e.g., "A"), type (e.g., "type1"), position (e.g., "alpha"), motion (e.g., "shift"), or general TKA concepts',
          },
          quizType: {
            type: "string",
            enum: ["multiple-choice", "identify-letter", "true-false"],
            description: "Type of quiz question",
          },
          difficulty: {
            type: "string",
            enum: ["easy", "medium", "hard"],
            description: "Difficulty level",
          },
        },
        required: ["topic"],
      }),
      execute: async ({ topic, quizType = "multiple-choice", difficulty = "medium" }) => {
        // Map the incoming quiz type to the expected QuizType
        const mappedQuizType: "pick-letter" | "pick-type" | "odd-one-out" | "match-motion" | "true-false" =
          quizType === "multiple-choice" ? "pick-letter" :
          quizType === "identify-letter" ? "pick-letter" :
          quizType === "true-false" ? "true-false" :
          "pick-letter"; // default fallback

        const adaptedDifficulty = resolveQuizDifficulty(topic, masteryCtx, difficulty);
        const result = quizGenerator.generateQuiz(topic, mappedQuizType, adaptedDifficulty);
        return filterQuiz(result);
      },
    }),

    get_domain_topic: tool({
      description:
        'MANDATORY for deep theoretical questions about TKA specifically (not VTG - use get_vtg_info for VTG questions). Topics include: STUV anomaly, base rotation, orientation algebra, combinatorial space, hand path modifiers, level system, position symmetry, LOOPs and compositional theory, CAPs vs LOOPs, compound letters, center-relative orientation, skewed letters, motion types. Use for "why" questions about TKA design. For VTG timing/direction, transition theory, or minimal beat shapes, use get_vtg_info instead.',
      inputSchema: jsonSchema<{ query: string }>({
        type: "object",
        properties: {
          query: {
            type: "string",
            description:
              'Topic to look up. Examples: "stuv-anomaly", "base-rotation", "loops", "orientation-algebra", "level-system", "position-symmetry", "combinatorial-space", "caps-vs-loops", "elemental-model". Natural language queries also work.',
          },
        },
        required: ["query"],
      }),
      execute: async ({ query }) => {
        const result = findDomainTopic(query);
        if (result) {
          return { found: true, key: result.key, title: result.title, content: result.content };
        }
        const available = listDomainTopics().map((t) => `${t.key}: ${t.title}`);
        return {
          found: false,
          message: `No topic found for "${query}". Available topics: ${available.join(", ")}`,
        };
      },
    }),

    find_app_feature: tool({
      description:
        'Find how to do something in Flow Arts Composer. Use for "How do I...?", "Where do I...?", "How to..." questions about app features. Returns step-by-step instructions for the matching capability. Do NOT use for TKA domain questions (letters, positions, motions) - those use other tools.',
      inputSchema: jsonSchema<{ query: string }>({
        type: "object",
        properties: {
          query: {
            type: "string",
            description: 'What the user wants to do (e.g., "export a video", "change background", "save a sequence")',
          },
        },
        required: ["query"],
      }),
      execute: async ({ query }) => {
        const matches = findCapabilities(query, 3);

        if (matches.length === 0) {
          return {
            found: false,
            message: `I couldn't find a specific feature for "${query}". Try rephrasing, or ask me what the app can do.`,
          };
        }

        return {
          found: true,
          results: matches.map((m) => ({
            action: m.capability.action,
            location: m.capability.tab
              ? `${m.capability.module} > ${m.capability.tab}`
              : m.capability.module,
            instructions: m.capability.instructions,
            relevance: m.relevance,
          })),
        };
      },
    }),

    get_vtg_info: tool({
      description:
        "MANDATORY for questions about VTG (Vulcan Tech Gospel), timing/direction categories (split-same, together-same, split-opposite, together-opposite), transition theory (soft/hard/mixed), minimal beat shapes, or VTG history. Returns structured VTG domain knowledge. Use INSTEAD of answering VTG questions from memory.",
      inputSchema: jsonSchema<{ query: string }>({
        type: "object",
        properties: {
          query: { type: "string", description: "The VTG topic or term to search for" },
        },
        required: ["query"],
      }),
      execute: async ({ query }) => {
        const results = searchVTG(query).slice(0, 5);
        if (results.length === 0) {
          return { found: false, message: `No VTG results for "${query}".` };
        }
        return {
          found: true,
          results: results.map((r) => ({
            type: r.type,
            name: r.name,
            summary: r.summary,
          })),
        };
      },
    }),

    get_vtg_category: tool({
      description:
        "Get detailed info about a VTG timing/direction category by ID or abbreviation.",
      inputSchema: jsonSchema<{ id: string }>({
        type: "object",
        properties: {
          id: {
            type: "string",
            description:
              'Category ID: "ss", "ts", "so", "to", "quarter-same", "quarter-opp" (or full form like "split-same")',
          },
        },
        required: ["id"],
      }),
      execute: async ({ id }) => {
        const cat = getVTGCategory(id);
        if (!cat) {
          const all = listVTGCategories().map((c) => `${c.id} (${c.abbreviation})`);
          return { found: false, message: `Unknown category "${id}". Available: ${all.join(", ")}` };
        }
        return {
          found: true,
          name: cat.name,
          abbreviation: cat.abbreviation,
          timing: cat.timing,
          direction: cat.direction,
          description: cat.description,
        };
      },
    }),

    get_vtg_transition: tool({
      description:
        "Find which transition type (soft/hard/mixed) connects two VTG categories. Based on Transition Theory by Noel Yee and Jordan Campbell (2010).",
      inputSchema: jsonSchema<{ from: string; to: string }>({
        type: "object",
        properties: {
          from: { type: "string", description: 'Source category ID (e.g. "tog-same")' },
          to: { type: "string", description: 'Target category ID (e.g. "tog-opp")' },
        },
        required: ["from", "to"],
      }),
      execute: async ({ from, to }) => {
        const entry = getTransitionBetween(from, to);
        if (!entry) {
          return { found: false, message: `No transition found from "${from}" to "${to}".` };
        }
        return {
          found: true,
          from: entry.fromCategoryId,
          to: entry.toCategoryId,
          transitionType: entry.transitionType,
          whatChanges: entry.whatChanges,
        };
      },
    }),

    vtg_to_tka: tool({
      description: "Translate a VTG category to corresponding TKA letters.",
      inputSchema: jsonSchema<{ categoryId: string }>({
        type: "object",
        properties: {
          categoryId: { type: "string", description: 'VTG category ID (e.g. "split-same", "tog-opp")' },
        },
        required: ["categoryId"],
      }),
      execute: async ({ categoryId }) => {
        const mapping = vtgToTKA(categoryId);
        if (!mapping) {
          return { found: false, message: `Unknown VTG category "${categoryId}".` };
        }
        return {
          found: true,
          categoryName: mapping.vtgCategory.name,
          abbreviation: mapping.vtgCategory.abbreviation,
          tkaLetters: mapping.tkaLetterTypes,
        };
      },
    }),

    tka_to_vtg: tool({
      description: "Translate a TKA letter to its VTG classification.",
      inputSchema: jsonSchema<{ letter: string }>({
        type: "object",
        properties: {
          letter: { type: "string", description: 'TKA letter (e.g. "A", "D", "S")' },
        },
        required: ["letter"],
      }),
      execute: async ({ letter }) => {
        const categories = tkaToVTG(letter);
        const cat = categories[0];
        if (!cat) {
          return { found: false, message: `No VTG category found for TKA letter "${letter}".` };
        }
        return {
          found: true,
          name: cat.name,
          abbreviation: cat.abbreviation,
        };
      },
    }),

    complete_verified_concepts: tool({
      description:
        "Mark TKA concepts as completed after rigorous conversational verification. " +
        "ONLY call this after you have challenged the user with conceptual questions (2-3 per concept) " +
        "and they have demonstrated genuine understanding - not just naming things. " +
        "Never call this just because the user claims expertise. " +
        "Never call this if the user got questions wrong or could only recall names without explaining.",
      inputSchema: jsonSchema<{ conceptIds: string[]; verificationSummary: string }>({
        type: "object",
        properties: {
          conceptIds: {
            type: "array",
            items: { type: "string" },
            description:
              'Knowledge graph concept IDs to mark completed (e.g., ["1.1", "1.2", "1.3"]). Max 8 per call.',
          },
          verificationSummary: {
            type: "string",
            description:
              "Brief summary of how the user demonstrated knowledge (what questions were asked, how the user answered).",
          },
        },
        required: ["conceptIds", "verificationSummary"],
      }),
      execute: async ({ conceptIds, verificationSummary }) => {
        try {
          const result = await progressWriter.writeCompletions(
            userId,
            conceptIds,
            completedConcepts,
            verificationSummary
          );
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            success: false,
            completedConcepts: [],
            rejectedConcepts: [],
            errors: [`Verification write failed: ${message}`],
          };
        }
      },
    }),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract the last user message text from a UIMessage array.
 * UIMessage uses `.parts` (TextUIPart[]) not `.content`.
 */
function extractLastUserMessage(body: TIKARequest): string {
  if (body.question) return body.question;

  if (body.messages && Array.isArray(body.messages)) {
    for (let i = body.messages.length - 1; i >= 0; i--) {
      const msg = body.messages[i];
      if (msg?.role !== "user") continue;

      for (const part of msg.parts) {
        if (part.type === "text") {
          return part.text;
        }
      }
    }
  }

  return "";
}

// ═══════════════════════════════════════════════════════════════════════════
// Request Handler
// ═══════════════════════════════════════════════════════════════════════════

interface TIKARequest {
  messages?: UIMessage[];
  question?: string;
  userId?: string;
  completedConcepts?: string[];
  masteryContext?: MasteryContext;
  conversationMemory?: string;
  language?: string;
  model?: string;
}

export const POST: RequestHandler = async (event) => {
  try {
    // Require authenticated user - prevents unauthorized AI API usage
    const caller = await requireFirebaseUser(event);

    const blocked = await withRateLimit(event, RATE_LIMITS.AI_CHAT, "user", caller.uid);
    if (blocked) return blocked;

    const body: TIKARequest = await event.request.json();
    const container = getContainer();
    const { modelProvider } = container;

    const selectedModel = body.model ?? DEFAULT_TIKA_MODEL;
    const modelDefinition = getTikaModelDefinition(selectedModel);
    if (!modelDefinition) {
      return Response.json(
        { error: "Choose an available TIKA model." },
        { status: 400 }
      );
    }
    if (!modelProvider.isProviderConfigured(modelDefinition.provider)) {
      return Response.json(
        { error: "The selected TIKA provider is not configured." },
        { status: 503 }
      );
    }

    // Build system prompt based on user progress and mastery data
    const completedConcepts = body.completedConcepts || [];
    const language = body.language || "en";
    const userOverlay = deriveUserOverlay(completedConcepts);
    const systemPrompt = buildSystemPrompt(
      userOverlay,
      language,
      body.masteryContext,
      body.conversationMemory
    );

    // Handle both new streaming format (messages array) and legacy format (question string)
    let messages: UIMessage[];

    // Convert to model messages format
    let modelMessages;

    if (body.messages && Array.isArray(body.messages)) {
      messages = body.messages;
      // Stopping a streamed answer can leave a tool call without its result.
      // Sending that unfinished call back makes the next provider request fail.
      modelMessages = await convertToModelMessages(messages, {
        ignoreIncompleteToolCalls: true,
      });
    } else if (body.question) {
      // Legacy format - convert question string directly to model message
      modelMessages = [{ role: "user" as const, content: body.question }];
    } else {
      return new Response(JSON.stringify({ error: "Missing messages or question" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Stream the response using the selected model
    // stopWhen controls multi-step tool use. Default is stepCountIs(1) which stops
    // after a single tool call - the model never gets to generate text from tool results.
    // Setting to 4 allows: tool call → result → optional 2nd tool → text response.
    const result = streamText({
      model: modelProvider.getModel(selectedModel),
      system: systemPrompt,
      messages: modelMessages,
      tools: _createTikaTools(caller.uid, completedConcepts, body.masteryContext),
      stopWhen: stepCountIs(6),
      maxOutputTokens: 4096,
      abortSignal: event.request.signal,
      experimental_telemetry: {
        isEnabled: false,
      },
    });

    // Fire-and-forget validation (non-blocking, doesn't delay response)
    const userQuestion = extractLastUserMessage(body);
    Promise.resolve(result.text)
      .then((fullText: string) => {
        const report = validateResponse(fullText, userQuestion);
        if (!report.passed || report.warningCount > 0) {
          console.warn(formatValidationReport(report));
        }
      })
      .catch((err: unknown) => console.error("[TIKA Validation] Error:", err));

    return result.toUIMessageStreamResponse();
  } catch (error) {
    console.error("[TIKA API] Error:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
};
