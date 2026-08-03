import { canonicalJsonHash } from "@hk-mahjong/core/public";
import { z } from "zod";

import {
  CONCEPT_IDS,
  NARRATOR_PROMPT_VERSION,
  type CoachFeedback,
  type CoachNarrationInput,
  type CoachNarrationResult,
  type CoachNarrator,
  type AnalysisFact,
  type ConceptId,
  type NarratorStatus,
} from "./types.js";

const narrationSchema = z
  .object({
    recommendedActionId: z.string().min(1).max(512).optional(),
    confidence: z.number().min(0).max(1),
    headline: z.string().trim().min(1).max(1_000),
    explanation: z.string().trim().min(1).max(5_000),
    alternatives: z
      .array(
        z
          .object({
            actionId: z.string().min(1).max(512),
            tradeoff: z.string().trim().min(1).max(2_000),
            factIds: z.array(z.string().min(1).max(512)).max(3),
          })
          .strict(),
      )
      .max(3),
    question: z.string().trim().min(1).max(1_000).optional(),
    conceptIds: z.array(z.enum(CONCEPT_IDS)).max(4),
    factIds: z.array(z.string().min(1).max(512)).max(12),
    uncertainty: z.string().trim().min(1).max(1_000).optional(),
  })
  .strict();

const factConcept: Readonly<Record<string, ConceptId>> = {
  distance: "tile_efficiency",
  improving_tiles: "waits_improving_tiles",
  visible_copies: "visible_tile_counting",
  faan_path: "minimum_faan_planning",
  relative_risk: "relative_safety",
  legal_rule: "turn_order_claim_priority",
  score_gap: "tile_efficiency",
  learner_pattern: "tile_efficiency",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const availableFactsFor = (input: CoachNarrationInput) => {
  const byId = new Map<string, (typeof input.analysis.facts)[number]>();
  for (const fact of input.analysis.facts) {
    byId.set(fact.id, fact);
  }
  for (const candidate of input.analysis.candidates) {
    for (const fact of candidate.facts) {
      byId.set(fact.id, fact);
    }
  }
  return byId;
};

const availableConceptsFor = (input: CoachNarrationInput): readonly ConceptId[] => {
  const concepts = new Set<ConceptId>();
  for (const fact of availableFactsFor(input).values()) {
    const concept = factConcept[fact.kind];
    if (concept !== undefined) {
      concepts.add(concept);
    }
  }
  return [...concepts].sort();
};

const FAAN_WORD_VALUES: Readonly<Record<string, number>> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
};

const citedFaanValues = (
  citedFactIds: readonly string[],
  facts: ReadonlyMap<string, AnalysisFact>,
): ReadonlySet<number> => {
  const values = new Set<number>();
  const pending: { key: string; value: unknown }[] = citedFactIds.flatMap((factId) => {
    const fact = facts.get(factId);
    return fact === undefined ? [] : [{ key: "", value: fact.data }];
  });
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) {
      break;
    }
    if (
      typeof current.value === "number" &&
      Number.isFinite(current.value) &&
      /faan/iu.test(current.key)
    ) {
      values.add(current.value);
    } else if (Array.isArray(current.value)) {
      for (const item of current.value) {
        pending.push({ key: current.key, value: item });
      }
    } else if (isRecord(current.value)) {
      for (const [key, value] of Object.entries(current.value)) {
        pending.push({ key, value });
      }
    }
  }
  return values;
};

const validateGroundedProse = (
  prose: string,
  citedFactIds: readonly string[],
  facts: ReadonlyMap<string, AnalysisFact>,
): void => {
  if (/\byou\s+(?:always|never)\b/iu.test(prose)) {
    throw new CoachNarratorFailure(
      "invalid_output",
      "Narrator used an absolute learner-history claim",
    );
  }
  const citedFacts = citedFactIds.flatMap((factId) => {
    const fact = facts.get(factId);
    return fact === undefined ? [] : [fact];
  });
  if (
    /\byou\s+(?:often|usually|repeatedly|tend(?:ed)?\s+to)\b|\byour\s+last\b/iu.test(prose) &&
    !citedFacts.some(({ kind }) => kind === "learner_pattern")
  ) {
    throw new CoachNarratorFailure(
      "invalid_output",
      "Narrator made an unsupported learner-history claim",
    );
  }
  if (!/\bfaan\b/iu.test(prose)) {
    return;
  }
  const supportedValues = citedFaanValues(citedFactIds, facts);
  const hasScoringFact = citedFacts.some(
    ({ kind }) => kind === "faan_path" || kind === "legal_rule",
  );
  if (!hasScoringFact && supportedValues.size === 0) {
    throw new CoachNarratorFailure("invalid_output", "Narrator made an unsupported scoring claim");
  }
  const claimPattern =
    /\b(\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen)\s+faan\b/giu;
  for (const match of prose.matchAll(claimPattern)) {
    const token = match[1]?.toLowerCase();
    const claimed = token === undefined ? undefined : (FAAN_WORD_VALUES[token] ?? Number(token));
    if (claimed === undefined || !Number.isFinite(claimed) || !supportedValues.has(claimed)) {
      throw new CoachNarratorFailure("invalid_output", "Narrator cited an unsupported faan value");
    }
  }
};

const calibrationFor = (input: CoachNarrationInput): string => {
  const top = input.analysis.candidates[0];
  const next = input.analysis.candidates[1];
  if (top === undefined || next === undefined) {
    return "This is a practical preference, not a forced move.";
  }
  const gap = Math.max(0, top.totalScore - next.totalScore);
  const scale = Math.max(1, Math.abs(top.totalScore));
  if (top.confidence >= 0.8 && gap >= scale * 0.12) {
    return "This is the clear choice because the deterministic comparison has a meaningful gap.";
  }
  if (gap <= scale * 0.03) {
    return "These choices are close; I slightly prefer the top-ranked action.";
  }
  return "This is usually better according to the visible-information comparison.";
};

const questionFor = (input: CoachNarrationInput): string | undefined => {
  if (input.learner.mode !== "socratic") {
    return undefined;
  }
  return "Which action keeps the most visible ways to improve your hand?";
};

/** Always-available deterministic narrator. It renders only supplied, structured analysis facts. */
export class TemplateCoachNarrator implements CoachNarrator {
  public explain(input: CoachNarrationInput): Promise<CoachNarrationResult> {
    const candidates = input.analysis.candidates;
    const top = candidates[0];
    const firstFact = top?.facts[0] ?? input.analysis.facts[0];
    const conceptIds =
      firstFact === undefined ? [] : [factConcept[firstFact.kind] ?? "tile_efficiency"];
    const question = questionFor(input);
    const base: CoachNarrationResult = {
      confidence: top?.confidence ?? 0,
      headline:
        input.hintLevel === "nudge"
          ? "Look for the choice that preserves more useful improvements."
          : "Use the visible-information comparison to choose your next action.",
      explanation:
        input.hintLevel === "nudge"
          ? "Focus on tile efficiency before committing to a direction."
          : `${firstFact?.summary ?? "No strategic ranking is available for this legal-action set."} ${calibrationFor(input)}`,
      alternatives: [] as CoachNarrationResult["alternatives"],
      conceptIds,
      factIds: firstFact === undefined ? [] : [firstFact.id],
      ...(question === undefined ? {} : { question }),
      uncertainty: calibrationFor(input),
    };
    if (input.hintLevel === "nudge") {
      return Promise.resolve(base);
    }
    const alternatives = candidates
      .filter((candidate) => candidate.actionId !== top?.actionId)
      .slice(0, input.hintLevel === "compare" ? 2 : 3)
      .map((candidate) => ({
        actionId: candidate.actionId,
        tradeoff:
          candidate.facts[0]?.summary ??
          "This legal action has a different speed, value, or visible-availability tradeoff.",
        factIds: candidate.facts.slice(0, 2).map(({ id }) => id),
      }));
    return Promise.resolve({
      ...base,
      ...(top === undefined ? {} : { recommendedActionId: top.actionId }),
      alternatives,
    });
  }
}

export class CoachNarratorFailure extends Error {
  public constructor(
    public readonly reason: "timeout" | "provider_error" | "invalid_output" | "cancelled",
    message: string,
  ) {
    super(message);
    this.name = "CoachNarratorFailure";
  }
}

export interface OpenAICoachNarratorOptions {
  /** Constructor-injected official Responses API client; no environment variables are read. */
  readonly client: {
    readonly responses: {
      create(
        request: Readonly<Record<string, unknown>>,
        options?: Readonly<{ signal?: AbortSignal }>,
      ): Promise<unknown>;
    };
  };
  readonly model: string;
  readonly timeoutMs?: number;
  readonly narratorVersion?: string;
}

const outputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["confidence", "headline", "explanation", "alternatives", "conceptIds", "factIds"],
  properties: {
    recommendedActionId: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    headline: { type: "string" },
    explanation: { type: "string" },
    alternatives: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["actionId", "tradeoff", "factIds"],
        properties: {
          actionId: { type: "string" },
          tradeoff: { type: "string" },
          factIds: { type: "array", items: { type: "string" } },
        },
      },
    },
    question: { type: "string" },
    conceptIds: { type: "array", items: { type: "string", enum: CONCEPT_IDS } },
    factIds: { type: "array", items: { type: "string" } },
    uncertainty: { type: "string" },
  },
} as const;

const promptFor = (input: CoachNarrationInput): readonly Record<string, unknown>[] => [
  {
    role: "developer",
    content:
      "You are a Hong Kong mahjong teaching narrator. Use only the supplied redacted observation, legal actions, structured analysis facts, and learner context. Do not invent scoring, hidden tiles, prior behavior, or an action outside the legal list. Keep the explanation beginner-friendly.",
  },
  {
    role: "user",
    content: JSON.stringify({
      promptVersion: NARRATOR_PROMPT_VERSION,
      hintLevel: input.hintLevel,
      ruleset: input.observation.ruleset,
      observation: input.observation,
      legalActions: input.observation.legalActions,
      analysis: input.analysis,
      learner: input.learner,
      allowStylisticAlternative: input.allowStylisticAlternative ?? false,
    }),
  },
];

const textFromResponse = (response: unknown): string => {
  if (!isRecord(response)) {
    throw new CoachNarratorFailure("invalid_output", "Narrator response was not an object");
  }
  const outputText = response.output_text;
  if (typeof outputText === "string" && outputText.trim().length > 0) {
    return outputText;
  }
  throw new CoachNarratorFailure(
    "invalid_output",
    "Narrator response did not contain structured text",
  );
};

/** Validates all citations and action claims before LLM prose can reach a client. */
export const validateCoachNarration = (
  raw: unknown,
  input: CoachNarrationInput,
): CoachNarrationResult => {
  const parsed = narrationSchema.safeParse(raw);
  if (!parsed.success) {
    throw new CoachNarratorFailure(
      "invalid_output",
      "Narrator output did not match the coaching schema",
    );
  }
  const result = parsed.data;
  const legalActionIds = new Set(input.observation.legalActions.map(({ id }) => id));
  const facts = availableFactsFor(input);
  const validateAction = (actionId: string): void => {
    if (!legalActionIds.has(actionId)) {
      throw new CoachNarratorFailure(
        "invalid_output",
        "Narrator referenced an action that is not legal",
      );
    }
  };
  const validateFact = (factId: string): void => {
    if (!facts.has(factId)) {
      throw new CoachNarratorFailure(
        "invalid_output",
        "Narrator referenced an unavailable analysis fact",
      );
    }
  };
  if (result.recommendedActionId !== undefined) {
    validateAction(result.recommendedActionId);
    if (
      !input.allowStylisticAlternative &&
      result.recommendedActionId !== input.analysis.recommendedActionId
    ) {
      throw new CoachNarratorFailure(
        "invalid_output",
        "Narrator recommendation contradicts deterministic analysis",
      );
    }
  }
  for (const alternative of result.alternatives) {
    validateAction(alternative.actionId);
    for (const factId of alternative.factIds) {
      validateFact(factId);
    }
  }
  for (const factId of result.factIds) {
    validateFact(factId);
  }
  validateGroundedProse(
    [result.headline, result.explanation, result.question ?? "", result.uncertainty ?? ""].join(
      " ",
    ),
    result.factIds,
    facts,
  );
  for (const alternative of result.alternatives) {
    validateGroundedProse(alternative.tradeoff, alternative.factIds, facts);
  }
  return {
    confidence: result.confidence,
    headline: result.headline,
    explanation: result.explanation,
    alternatives: result.alternatives,
    conceptIds: result.conceptIds,
    factIds: result.factIds,
    ...(result.recommendedActionId === undefined
      ? {}
      : { recommendedActionId: result.recommendedActionId }),
    ...(result.question === undefined ? {} : { question: result.question }),
    ...(result.uncertainty === undefined ? {} : { uncertainty: result.uncertainty }),
  };
};

/**
 * Server-only adapter for the official Responses API. It is disabled unless a server composes it
 * with an injected client and configuration; no key, model, or environment convention is invented.
 */
export class OpenAICoachNarrator implements CoachNarrator {
  readonly #client: OpenAICoachNarratorOptions["client"];
  readonly #model: string;
  readonly #timeoutMs: number;
  readonly #narratorVersion: string;
  readonly #cache = new Map<string, CoachNarrationResult>();

  public constructor(options: OpenAICoachNarratorOptions) {
    if (options.model.trim().length === 0) {
      throw new RangeError("Narrator model must be non-empty");
    }
    this.#client = options.client;
    this.#model = options.model;
    this.#timeoutMs = options.timeoutMs ?? 2_000;
    if (!Number.isSafeInteger(this.#timeoutMs) || this.#timeoutMs < 1) {
      throw new RangeError("Narrator timeout must be a positive safe integer");
    }
    this.#narratorVersion = options.narratorVersion ?? "openai-responses-v1";
  }

  public async explain(input: CoachNarrationInput): Promise<CoachNarrationResult> {
    const cacheKey = canonicalJsonHash({
      ruleset: input.observation.ruleset,
      observation: input.observation,
      analysis: input.analysis,
      learner: input.learner,
      hintLevel: input.hintLevel,
      allowStylisticAlternative: input.allowStylisticAlternative ?? false,
      promptVersion: NARRATOR_PROMPT_VERSION,
      narratorVersion: this.#narratorVersion,
    });
    const cached = this.#cache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    try {
      const response = await this.#client.responses.create(
        {
          model: this.#model,
          input: promptFor(input),
          text: {
            format: {
              type: "json_schema",
              name: "coach_narration",
              strict: true,
              schema: outputSchema,
            },
          },
        },
        { signal: controller.signal },
      );
      const text = textFromResponse(response);
      let raw: unknown;
      try {
        raw = JSON.parse(text) as unknown;
      } catch {
        throw new CoachNarratorFailure("invalid_output", "Narrator output was not JSON");
      }
      const validated = validateCoachNarration(raw, input);
      this.#cache.set(cacheKey, validated);
      return validated;
    } catch (caught) {
      if (caught instanceof CoachNarratorFailure) {
        throw caught;
      }
      if (controller.signal.aborted) {
        throw new CoachNarratorFailure("timeout", "Narrator request timed out");
      }
      throw new CoachNarratorFailure("provider_error", "Narrator provider was unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }
}

const noLiveCoaching = (mode: CoachNarrationInput["learner"]["mode"]): boolean =>
  mode === "competitive" || mode === "exam";

/**
 * Composes an optional provider behind deterministic templates. Provider failures never prevent a
 * player from receiving a legal, grounded response or from continuing the game.
 */
export class CoachNarrationService {
  readonly #templates: CoachNarrator;
  readonly #provider: CoachNarrator | null;

  public constructor(options: { templates?: CoachNarrator; provider?: CoachNarrator | null } = {}) {
    this.#templates = options.templates ?? new TemplateCoachNarrator();
    this.#provider = options.provider ?? null;
  }

  public providerStatus(): NarratorStatus {
    return this.#provider === null ? "unavailable" : "provider";
  }

  public async explain(input: CoachNarrationInput): Promise<CoachFeedback> {
    if (noLiveCoaching(input.learner.mode)) {
      return {
        status: "unavailable",
        level: input.hintLevel,
        narration: {
          confidence: 0,
          headline: "Live coaching is disabled for this mode.",
          explanation: "Review deterministic feedback after the hand instead.",
          alternatives: [],
          conceptIds: [],
          factIds: [],
        },
        fallbackReason: null,
      };
    }
    if (this.#provider === null) {
      return {
        status: "template",
        level: input.hintLevel,
        narration: await this.#templates.explain(input),
        fallbackReason: null,
      };
    }
    try {
      return {
        status: "provider",
        level: input.hintLevel,
        narration: validateCoachNarration(await this.#provider.explain(input), input),
        fallbackReason: null,
      };
    } catch (caught) {
      const reason = caught instanceof CoachNarratorFailure ? caught.reason : "provider_error";
      return {
        status: "fallback",
        level: input.hintLevel,
        narration: await this.#templates.explain(input),
        fallbackReason: reason,
      };
    }
  }
}

export const allowedNarratorConcepts = (input: CoachNarrationInput): readonly ConceptId[] =>
  availableConceptsFor(input);
