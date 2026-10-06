import { criterionText, loadCategories, type Category } from "@/lib/categories";
import { JEV_MODEL, postDecision, requireApiKey } from "@/lib/decisions";
import type { ClassifyResult, Usage } from "@/lib/types";

export { JEV_MODEL };

const INSTRUCTIONS =
  "Utifrån artikelbeskrivningen i `product`, välj den produktgrupp som passar bäst. Artikeln är en dagligvara som sålts i butik. Välj exakt en.";

type Decision = {
  choice: string | null;
  probabilities: Record<string, number>;
  confidence: number | null;
  model: string;
  usage: Usage;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberOrNull(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function readChoice(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (!isRecord(value)) return null;
  const key = value.slug ?? value.option ?? value.id ?? value.value ?? value.choice;
  return typeof key === "string" && key.trim() ? key.trim() : null;
}

function readProbabilities(value: unknown): Record<string, number> {
  const probabilities: Record<string, number> = {};

  if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      const direct = numberOrNull(entry);
      if (direct !== null && direct >= 0) {
        probabilities[key] = direct;
        continue;
      }
      if (isRecord(entry)) {
        const nested = numberOrNull(entry.probability ?? entry.p ?? entry.prob);
        if (nested !== null && nested >= 0) probabilities[key] = nested;
      }
    }
    return probabilities;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      if (!isRecord(item)) continue;
      const key = item.slug ?? item.option ?? item.choice ?? item.key ?? item.id;
      const probability = numberOrNull(
        item.probability ?? item.p ?? item.prob ?? item.value,
      );
      if (typeof key === "string" && probability !== null && probability >= 0) {
        probabilities[key] = probability;
      }
    }
  }

  return probabilities;
}

function findChoiceAnswer(root: Record<string, unknown>): Record<string, unknown> | null {
  const container =
    isRecord(root.answers) ? root.answers
    : isRecord(root.output) ? root.output
    : isRecord(root.result) ? root.result
    : isRecord(root.data) ? root.data
    : null;

  if (!container) {
    if ("choice" in root || "probabilities" in root) return root;
    return null;
  }

  const named = isRecord(container.category) ? container.category
    : isRecord(container.Category) ? container.Category
    : null;
  if (named) return named;

  for (const value of Object.values(container)) {
    if (!isRecord(value)) continue;
    if (
      value.choice !== undefined ||
      value.probabilities !== undefined ||
      value.type === "choice"
    ) {
      return value;
    }
  }

  if (container.choice !== undefined || container.probabilities !== undefined) {
    return container;
  }

  return null;
}

export function parseDecision(body: unknown, fallbackModel = JEV_MODEL): Decision {
  const root = isRecord(body) ? body : {};
  const answer = findChoiceAnswer(root);
  const usageRecord =
    isRecord(root.usage) ? root.usage
    : isRecord(root.meta) && isRecord(root.meta.usage) ? root.meta.usage
    : {};

  const model =
    (typeof root.model === "string" && root.model) ||
    (typeof root.model_id === "string" && root.model_id) ||
    (typeof root.modelId === "string" && root.modelId) ||
    fallbackModel;

  return {
    choice: answer ? readChoice(answer.choice ?? answer.selected ?? answer.answer) : null,
    probabilities: answer
      ? readProbabilities(answer.probabilities ?? answer.probs ?? answer.distribution)
      : {},
    confidence: answer
      ? numberOrNull(answer.confidence ?? answer.confidence_score ?? answer.confidenceScore)
      : null,
    model,
    usage: {
      input_tokens: numberOrNull(
        usageRecord.input_tokens ?? usageRecord.prompt_tokens ?? usageRecord.inputTokens,
      ),
      output_tokens: numberOrNull(
        usageRecord.output_tokens ??
          usageRecord.completion_tokens ??
          usageRecord.outputTokens,
      ),
      cost: numberOrNull(usageRecord.cost ?? usageRecord.total_cost ?? usageRecord.totalCost),
    },
  };
}

function buildRequest(query: string, categories: Category[]) {
  const criteria: Record<string, string> = {};
  for (const category of categories) {
    criteria[category.slug] = criterionText(category);
  }

  return {
    model: JEV_MODEL,
    state: { product: query },
    questions: {
      category: {
        type: "choice",
        instructions: INSTRUCTIONS,
        criteria,
      },
    },
  };
}

async function decideWithJev(
  query: string,
  categories: Category[],
  apiKey: string,
): Promise<Decision> {
  const json = await postDecision(buildRequest(query, categories), apiKey);
  return parseDecision(json);
}

function present(
  query: string,
  categories: Category[],
  decision: Decision,
  started: number,
): ClassifyResult {
  const bySlug = new Map(categories.map((category) => [category.slug, category]));
  const winner = decision.choice ? bySlug.get(decision.choice) : undefined;

  const rows = Object.entries(decision.probabilities)
    .map(([slug, probability]) => {
      const category = bySlug.get(slug);
      if (!category || !(probability > 0)) return null;
      return {
        slug,
        name: category.name,
        description: category.description,
        probability,
      };
    })
    .filter((row): row is ClassifyResult["results"][number] => row !== null)
    .sort((a, b) => b.probability - a.probability || a.name.localeCompare(b.name, "sv"));

  const knownWinner = Boolean(winner);
  const top = rows.slice(0, 10);
  if (winner && !top.some((row) => row.slug === winner.slug)) {
    if (top.length >= 10) top.pop();
    top.unshift({
      slug: winner.slug,
      name: winner.name,
      description: winner.description,
      probability: decision.probabilities[winner.slug] ?? 0,
    });
    top.sort((a, b) => b.probability - a.probability || a.name.localeCompare(b.name, "sv"));
  }

  const noMatch = !knownWinner || top.length === 0;

  return {
    query,
    model: decision.model,
    confidence: decision.confidence,
    latencyMs: Math.max(0, Math.round(performance.now() - started)),
    usage: decision.usage,
    winnerSlug: noMatch || !winner ? null : winner.slug,
    results: noMatch ? [] : top.slice(0, 10),
  };
}

export async function classify(query: string): Promise<ClassifyResult> {
  const categories = loadCategories();
  const started = performance.now();
  const decision = await decideWithJev(query, categories, requireApiKey());
  return present(query, categories, decision, started);
}
