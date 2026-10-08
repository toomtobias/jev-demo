"use client";

import { useState } from "react";
import { Review, type CategoryOption } from "@/components/Review";
import { tooFewLetters } from "@/lib/query";
import type { ClassifyResult } from "@/lib/types";

type Props = {
  categories: CategoryOption[];
};

type Mode = "classify" | "review";

const numberFormat = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });
const percentFormat = new Intl.NumberFormat("sv-SE", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const confidenceFormat = new Intl.NumberFormat("sv-SE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const costFormat = new Intl.NumberFormat("sv-SE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 8,
});

function formatCount(value: number | null): string {
  if (value === null) return "–";
  return numberFormat.format(value);
}

function formatCost(value: number | null): string {
  if (value === null) return "kostnad –";
  return `kostnad ${costFormat.format(value)} USD`;
}

function formatConfidence(value: number | null): string {
  if (value === null) return "confidence –";
  return `confidence ${confidenceFormat.format(value)}`;
}

export function Classifier({ categories }: Props) {
  const [mode, setMode] = useState<Mode>("classify");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ClassifyResult | null>(null);
  const categoryCount = categories.length;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) {
      setError("Ange en artikelbeskrivning.");
      setResult(null);
      return;
    }
    if (tooFewLetters(trimmed)) {
      setError("Skriv minst två bokstäver.");
      setResult(null);
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      const data: unknown = await response.json();
      if (
        !response.ok ||
        !data ||
        typeof data !== "object" ||
        !("results" in data)
      ) {
        const message =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof data.error === "string"
            ? data.error
            : "Klassificeringen misslyckades.";
        setError(message);
        setResult(null);
        return;
      }
      setResult(data as ClassifyResult);
    } catch {
      setError("Nätverksfel. Försök igen.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  const maxProbability = result
    ? Math.max(...result.results.map((row) => row.probability), 0)
    : 0;

  return (
    <main className="wrap">
      <p className="kicker">Jev Demo</p>
      <div className="title-row">
        <h1>Kategorisering av dagligvaror</h1>
      </div>
      <div className="tabs" role="tablist" aria-label="Läge">
        <button
          type="button"
          role="tab"
          id="tab-classify"
          aria-selected={mode === "classify"}
          aria-controls="panel-classify"
          onClick={() => setMode("classify")}
        >
          Klassificera
        </button>
        <button
          type="button"
          role="tab"
          id="tab-review"
          aria-selected={mode === "review"}
          aria-controls="panel-review"
          onClick={() => setMode("review")}
        >
          Granska
        </button>
      </div>
      <p className="lede">
        {mode === "classify"
          ? `Ange en artikelbeskrivning, så väljer modellen Jev den bäst matchande produktgruppen av ${numberFormat.format(categoryCount)} möjliga.`
          : "Ange en artikelbeskrivning och välj en produktgrupp, så beräknar modellen Jev sannolikheten för att artikeln passar i den valda gruppen."}
      </p>

      <div
        id="panel-classify"
        role="tabpanel"
        aria-labelledby="tab-classify"
        hidden={mode !== "classify"}
      >
      <form className="search" onSubmit={onSubmit} aria-busy={loading}>
        <label className="sr-only" htmlFor="query">
          Varunamn
        </label>
        <input
          id="query"
          name="query"
          value={query}
          placeholder="ica blåbär frysta (250g)"
          autoFocus
          autoComplete="off"
          maxLength={300}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit" disabled={loading}>
          {loading ? "Klassificerar…" : "Klassificera"}
        </button>
      </form>

      <p className="sr-only" aria-live="polite">
        {loading ? "Klassificerar." : result ? "Resultat klart." : error ? error : ""}
      </p>

      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}

      {result && result.results.length === 0 ? (
        <div className="notice">
          <p className="notice-title">Ingen träff</p>
          <p>Ingen produktgrupp valdes för «{result.query}».</p>
          <Meta result={result} />
        </div>
      ) : null}

      {result && result.results.length > 0 ? (
        <section className="results" aria-live="polite">
          <div className="result-head">
            <h2>Fördelning</h2>
            <p>{result.query}</p>
          </div>
          <ol className="list">
            {result.results.map((row, index) => {
              const winner = row.slug === result.winnerSlug;
              const width =
                maxProbability > 0 ? (row.probability / maxProbability) * 100 : 0;
              return (
                <li key={row.slug} className={winner ? "row winner" : "row"}>
                  <div className="row-main">
                    <span className="rank">{index + 1}</span>
                    <div className="row-text">
                      <div className="row-title">
                        <p className="name">{row.name}</p>
                        {winner ? <span className="chip">Vald</span> : null}
                      </div>
                      {row.description ? (
                        <p className="sub">
                          <span>{row.description}</span>
                        </p>
                      ) : null}
                    </div>
                    <span className="pct">{percentFormat.format(row.probability)}</span>
                  </div>
                  <div className="track" aria-hidden="true">
                    <div className="bar" style={{ width: `${width}%` }} />
                  </div>
                </li>
              );
            })}
          </ol>
          <Meta result={result} />
        </section>
      ) : null}
      </div>
      <div
        id="panel-review"
        role="tabpanel"
        aria-labelledby="tab-review"
        hidden={mode !== "review"}
      >
        <Review categories={categories} />
      </div>
    </main>
  );
}

function Meta({ result }: { result: ClassifyResult }) {
  return (
    <p className="meta">
      <span>{numberFormat.format(result.latencyMs)} ms</span>
      <span>{formatCount(result.usage.input_tokens)} input_tokens</span>
      <span>{formatCount(result.usage.output_tokens)} output_tokens</span>
      <span>{formatCost(result.usage.cost)}</span>
      <span>{result.model}</span>
      <span>{formatConfidence(result.confidence)}</span>
    </p>
  );
}
