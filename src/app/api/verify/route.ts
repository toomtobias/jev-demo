import { DecisionError } from "@/lib/decisions";
import { tooFewLetters } from "@/lib/query";
import { verify } from "@/lib/verify";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_QUERY = 2000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Ogiltig JSON." }, { status: 400 });
  }

  const query = isRecord(body) && typeof body.query === "string" ? body.query.trim() : "";
  const slug = isRecord(body) && typeof body.slug === "string" ? body.slug.trim() : "";

  if (!query) {
    return NextResponse.json({ error: "Ange en artikelbeskrivning." }, { status: 400 });
  }
  if (tooFewLetters(query)) {
    return NextResponse.json({ error: "Skriv minst två bokstäver." }, { status: 400 });
  }
  if (query.length > MAX_QUERY) {
    return NextResponse.json({ error: "Artikelbeskrivningen är för lång." }, { status: 400 });
  }
  if (!slug) {
    return NextResponse.json({ error: "Välj en produktgrupp." }, { status: 400 });
  }

  try {
    const result = await verify(query, slug);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DecisionError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return NextResponse.json({ error: "Granskningen misslyckades." }, { status: 500 });
  }
}
