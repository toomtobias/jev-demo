// Tilde-aliaset följer senaste Jev. Svarets modell-id visar vilken version som svarade.
export const JEV_MODEL = "~typesafe/jev-latest";

const DECISIONS_URL = "https://openrouter.ai/api/alpha/decisions";

export class DecisionError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "DecisionError";
    this.status = status;
  }
}

export function requireApiKey(): string {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim() ?? "";
  if (!apiKey) throw new DecisionError("OPENROUTER_API_KEY saknas.", 500);
  return apiKey;
}

export async function postDecision(body: unknown, apiKey: string): Promise<unknown> {
  try {
    const response = await fetch(DECISIONS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });

    const text = await response.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }

    if (!response.ok) {
      console.error("OpenRouter-fel", response.status, text.slice(0, 500));
      if (response.status === 401 || response.status === 403) {
        throw new DecisionError("OpenRouter avvisade API-nyckeln.");
      }
      if (response.status === 429) {
        throw new DecisionError("OpenRouter är tillfälligt upptagen. Försök igen.");
      }
      throw new DecisionError("OpenRouter svarade med ett fel.");
    }

    if (!json) throw new DecisionError("OpenRouter svarade utan JSON.");
    return json;
  } catch (error) {
    if (error instanceof DecisionError) throw error;
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new DecisionError("OpenRouter svarade inte i tid.");
    }
    console.error(error);
    throw new DecisionError("Kunde inte nå OpenRouter.");
  }
}
