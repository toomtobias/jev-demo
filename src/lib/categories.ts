import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

export type Category = {
  slug: string;
  name: string;
  description: string;
};

const NAME_HEADERS = new Set([
  "produktgrupp",
  "epgnamn",
  "namn",
  "name",
  "produktgruppsnamn",
]);

const DESCRIPTION_HEADERS = new Set([
  "beskrivning",
  "beskrivning av produktgruppen",
  "description",
  "desc",
]);

let categoryCache: Category[] | null = null;

/** ASCII-slug. å/ä blir a och ö blir o, så nyckeln är stabil i JSON. */
export function slugify(value: string): string {
  const folded = value
    .trim()
    .toLowerCase()
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const slug = folded
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "kategori";
}

function uniqueSlug(name: string, used: Set<string>): string {
  const base = slugify(name);
  if (!used.has(base)) return base;

  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function headerKind(header: string): "name" | "description" | null {
  const key = header.trim().toLowerCase().replace(/\s+/g, " ");
  if (DESCRIPTION_HEADERS.has(key)) return "description";
  if (NAME_HEADERS.has(key)) return "name";
  return null;
}

export function criterionText(category: Category): string {
  const beskrivning = category.description.trim();
  return beskrivning ? `${category.name}: ${beskrivning}` : category.name;
}

function assertValid(categories: Category[]): Category[] {
  if (categories.length === 0) {
    throw new Error("Inga kategorier i filen.");
  }
  if (categories.length > 255) {
    throw new Error(
      `För många kategorier (${categories.length}). Jev Choice tar högst 255.`,
    );
  }

  const slugs = new Set<string>();
  for (const category of categories) {
    if (!category.slug || !category.name) {
      throw new Error("Kategori utan namn eller slug.");
    }
    if (slugs.has(category.slug)) {
      throw new Error(`Slugkrock: ${category.slug}`);
    }
    slugs.add(category.slug);
  }

  return categories;
}

export function categoriesFromRows(rows: Record<string, unknown>[]): Category[] {
  if (rows.length === 0) {
    throw new Error("Kalkylbladet är tomt.");
  }

  const headers = Object.keys(rows[0] ?? {});
  const columns: { name?: string; description?: string } = {};

  for (const header of headers) {
    const kind = headerKind(header);
    if (kind && !columns[kind]) columns[kind] = header;
  }

  if (!columns.name) {
    throw new Error(
      `Hittade ingen kolumn för produktgrupp. Rubriker: ${headers.join(", ")}`,
    );
  }

  const used = new Set<string>();
  const categories: Category[] = [];

  for (const row of rows) {
    const name = cell(row[columns.name]);
    if (!name) continue;

    const description = columns.description ? cell(row[columns.description]) : "";
    const slug = uniqueSlug(name, used);
    used.add(slug);
    categories.push({ slug, name, description });
  }

  return assertValid(categories);
}

export function readXlsx(filePath: string): Category[] {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Excel-filen har inget blad.");

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
    workbook.Sheets[sheetName],
    { defval: "", raw: false },
  );

  return categoriesFromRows(rows);
}

function readJson(filePath: string): Category[] {
  const parsed: unknown = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error("data/categories.json måste vara en lista.");
  }

  const used = new Set<string>();
  const categories = parsed.map((row, index) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`Ogiltig kategori på rad ${index + 1} i categories.json.`);
    }
    const record = row as Record<string, unknown>;
    const name = cell(record.name);
    const description = cell(record.description);
    const slug = cell(record.slug) || uniqueSlug(name, used);
    if (!name || !slug) {
      throw new Error(`Ogiltig kategori på rad ${index + 1} i categories.json.`);
    }
    used.add(slug);
    return { slug, name, description };
  });

  return assertValid(categories);
}

export function loadCategories(): Category[] {
  if (categoryCache) return categoryCache;

  const root = process.cwd();
  const xlsxPath = path.join(root, "epg_categories.xlsx");
  const jsonPath = path.join(root, "data", "categories.json");

  if (fs.existsSync(xlsxPath)) {
    categoryCache = readXlsx(xlsxPath);
  } else if (fs.existsSync(jsonPath)) {
    categoryCache = readJson(jsonPath);
  } else {
    throw new Error("Hittade varken epg_categories.xlsx eller data/categories.json.");
  }

  return categoryCache;
}
