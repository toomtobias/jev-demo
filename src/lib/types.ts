export type Usage = {
  input_tokens: number | null;
  output_tokens: number | null;
  cost: number | null;
};

export type CategoryHit = {
  slug: string;
  name: string;
  description: string;
  probability: number;
};

export type Verdict = "approve" | "reject" | "review";

export type VerifyResult = {
  query: string;
  slug: string;
  name: string;
  probability: number;
  verdict: Verdict;
  model: string;
  latencyMs: number;
  usage: Usage;
};

export type ClassifyResult = {
  query: string;
  model: string;
  confidence: number | null;
  latencyMs: number;
  usage: Usage;
  winnerSlug: string | null;
  results: CategoryHit[];
};
