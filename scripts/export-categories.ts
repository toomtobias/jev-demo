import fs from "node:fs";
import path from "node:path";
import { readXlsx } from "../src/lib/categories";

const root = process.cwd();
const source = path.join(root, "epg_categories.xlsx");
const target = path.join(root, "data", "categories.json");

if (!fs.existsSync(source)) {
  console.error("Saknar epg_categories.xlsx i projektroten.");
  process.exit(1);
}

const categories = readXlsx(source);
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `${JSON.stringify(categories, null, 2)}\n`);

const withDescription = categories.filter((category) => category.description).length;
console.log(
  `Skrev ${categories.length} kategorier till data/categories.json (${withDescription} med beskrivning).`,
);
