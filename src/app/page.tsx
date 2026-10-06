import { Classifier } from "@/components/Classifier";
import { loadCategories } from "@/lib/categories";

export const dynamic = "force-dynamic";

export default function Page() {
  const categories = loadCategories()
    .map(({ slug, name }) => ({ slug, name }))
    .sort((a, b) => a.name.localeCompare(b.name, "sv"));
  return <Classifier categories={categories} />;
}
