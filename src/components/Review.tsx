"use client";

import { useState } from "react";
import { tooFewLetters } from "@/lib/query";
import type { Verdict, VerifyResult } from "@/lib/types";

export type CategoryOption = {
  slug: string;
  name: string;
};

const MAX_QUERY = 2000;

const numberFormat = new Intl.NumberFormat("sv-SE", { maximumFractionDigits: 0 });
const percentFormat = new Intl.NumberFormat("sv-SE", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const costFormat = new Intl.NumberFormat("sv-SE", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 8,
});

const VERDICT_LABEL: Record<Verdict, string> = {
  approve: "Godkänn",
  reject: "Godkänn inte",
  review: "Manuell granskning",
};

function formatCount(value: number | null): string {
  if (value === null) return "–";
  return numberFormat.format(value);
}

function formatCost(value: number | null): string {
  if (value === null) return "kostnad –";
  return `kostnad ${costFormat.format(value)} USD`;
}

function isVerifyResult(value: unknown): value is VerifyResult {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<VerifyResult>;
  return (
    typeof row.probability === "number" &&
    (row.verdict === "approve" || row.verdict === "reject" || row.verdict === "review") &&
    typeof row.name === "string" &&
    typeof row.query === "string"
  );
}

export function Review({ categories }: { categories: CategoryOption[] }) {
  const [query, setQuery] = useState("");
  const [slug, setSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);

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
    if (trimmed.length > MAX_QUERY) {
      setError("Artikelbeskrivningen är för lång.");
      setResult(null);
      return;
    }
    if (!slug) {
      setError("Välj en produktgrupp.");
      setResult(null);
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, slug }),
      });
      const data: unknown = await response.json();
      if (!response.ok || !isVerifyResult(data)) {
        const message =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof data.error === "string"
            ? data.error
            : "Granskningen misslyckades.";
        setError(message);
        setResult(null);
        return;
      }
      setResult(data);
    } catch {
      setError("Nätverksfel. Försök igen.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form className="review" onSubmit={onSubmit} aria-busy={loading}>
        <div className="field">
          <label htmlFor="article">Artikelbeskrivning</label>
          <textarea
            id="article"
            name="article"
            value={query}
            placeholder="ica blåbär frysta (250g)"
            rows={3}
            maxLength={MAX_QUERY}
            autoComplete="off"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="group">Produktgrupp</label>
          <select
            id="group"
            name="group"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
          >
            <option value="">Välj produktgrupp</option>
            {categories.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" disabled={loading}>
          {loading ? "Granskar…" : "Granska"}
        </button>
      </form>

      <p className="sr-only" aria-live="polite">
        {loading
          ? "Granskar."
          : result
            ? `${VERDICT_LABEL[result.verdict]}. ${percentFormat.format(result.probability)}.`
            : error
              ? error
              : ""}
      </p>

      {error ? (
        <p className="alert" role="alert">
          {error}
        </p>
      ) : null}

      {result ? (
        <section className={`verdict verdict-${result.verdict}`} aria-live="polite">
          <p className="verdict-label">{VERDICT_LABEL[result.verdict]}</p>
          <p className="verdict-score">{percentFormat.format(result.probability)}</p>
          <p className="verdict-detail">
            Sannolikhet att «{result.query}» hör hemma i {result.name}.
          </p>
          <p className="meta">
            <span>{numberFormat.format(result.latencyMs)} ms</span>
            <span>{formatCount(result.usage.input_tokens)} input_tokens</span>
            <span>{formatCount(result.usage.output_tokens)} output_tokens</span>
            <span>{formatCost(result.usage.cost)}</span>
            <span>{result.model}</span>
          </p>
          <p className="footnote">
            85 % eller mer godkänns. 25 % eller mindre avslås. Där emellan granskas
            paret manuellt.
          </p>
        </section>
      ) : null}
    </>
  );
}
