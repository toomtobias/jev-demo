import { criterionText, loadCategories, type Category } from "@/lib/categories";
import { DecisionError, JEV_MODEL, postDecision, requireApiKey } from "@/lib/decisions";
import type { Usage, Verdict, VerifyResult } from "@/lib/types";

export const APPROVE_AT = 0.85;
export const REJECT_AT = 0.25;

const INSTRUCTIONS =
  "Utifrån artikelbeskrivningen i `product`, hör artikeln hemma i produktgruppen i `group`? Artikeln är en dagligvara som sålts i butik.";

export function verdictFor(probability: number): Verdict {
  if (probability >= APPROVE_AT) return "approve";
  if (probability <= REJECT_AT) return "reject";
  return "review";
}

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

function readNoul(value: unknown): number | null {
  const direct = numberOrNull(value);
  if (direct !== null) return direct;
  if (!isRecord(value)) return null;
  return numberOrNull(value.noul ?? value.probability ?? value.p ?? value.value);
}

function findNoul(body: unknown): number | null {
  const root = isRecord(body) ? body : {};
  const container = isRecord(root.answers)
    ? root.answers
    : isRecord(root.output)
      ? root.output
      : isRecord(root.result)
        ? root.result
        : root;

  const named = container.fits;
  const fromNamed = readNoul(named);
  if (fromNamed !== null) return fromNamed;

  for (const value of Object.values(container)) {
    if (!isRecord(value)) continue;
    if (value.type === "noul" || "noul" in value) {
      const noul = readNoul(value);
      if (noul !== null) return noul;
    }
  }

  return null;
}

function readUsage(body: unknown): Usage {
  const root = isRecord(body) ? body : {};
  const usageRecord = isRecord(root.usage)
    ? root.usage
    : isRecord(root.meta) && isRecord(root.meta.usage)
      ? root.meta.usage
      : {};

  return {
    input_tokens: numberOrNull(
      usageRecord.input_tokens ?? usageRecord.prompt_tokens ?? usageRecord.inputTokens,
    ),
    output_tokens: numberOrNull(
      usageRecord.output_tokens ?? usageRecord.completion_tokens ?? usageRecord.outputTokens,
    ),
    cost: numberOrNull(usageRecord.cost ?? usageRecord.total_cost ?? usageRecord.totalCost),
  };
}

function readModel(body: unknown): string {
  const root = isRecord(body) ? body : {};
  return (
    (typeof root.model === "string" && root.model) ||
    (typeof root.model_id === "string" && root.model_id) ||
    (typeof root.modelId === "string" && root.modelId) ||
    JEV_MODEL
  );
}

function buildRequest(query: string, category: Category) {
  return {
    model: JEV_MODEL,
    state: {
      product: query,
      group: criterionText(category),
    },
    questions: {
      fits: {
        type: "noul",
        instructions: INSTRUCTIONS,
        criteria: {
          true: "Artikeln är en typisk medlem i gruppen.",
          false:
            "Artikeln hör hemma i en annan produktgrupp, eller gruppen är för smal eller för bred.",
        },
      },
    },
  };
}

function present(
  query: string,
  category: Category,
  probability: number,
  model: string,
  usage: Usage,
  started: number,
): VerifyResult {
  const clamped = Math.min(1, Math.max(0, probability));
  return {
    query,
    slug: category.slug,
    name: category.name,
    probability: Math.round(clamped * 1e6) / 1e6,
    verdict: verdictFor(clamped),
    model,
    latencyMs: Math.max(0, Math.round(performance.now() - started)),
    usage,
  };
}

export async function verify(query: string, slug: string): Promise<VerifyResult> {
  const category = loadCategories().find((item) => item.slug === slug);
  if (!category) {
    throw new DecisionError("Den produktgruppen finns inte.", 400);
  }

  const started = performance.now();
  const json = await postDecision(buildRequest(query, category), requireApiKey());
  const noul = findNoul(json);
  if (noul === null || noul < 0 || noul > 1) {
    throw new DecisionError("Jev svarade utan en sannolikhet.");
  }

  return present(query, category, noul, readModel(json), readUsage(json), started);
}
