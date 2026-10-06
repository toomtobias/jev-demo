export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { loadCategories } = await import("./lib/categories");
    const categories = loadCategories();
    console.log(`Produktgrupper i minnet: ${categories.length}`);
  }
}
