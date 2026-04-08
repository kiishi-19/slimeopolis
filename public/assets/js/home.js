/**
 * Home page — loads featured products from the API
 * This is step 1 of the Sequence Analytics flow: GET /api/products?featured=true
 */
document.addEventListener("DOMContentLoaded", async () => {
  const grid = document.getElementById("featured-grid");
  if (!grid) return;

  try {
    const { data } = await api.get("/products?featured=true&per_page=8");

    if (!data.success || !data.data?.length) {
      grid.innerHTML = '<p class="col-span-4 text-center text-gray-400 py-12">No featured products available.</p>';
      return;
    }

    grid.innerHTML = data.data.map(buildProductCard).join("");
  } catch (err) {
    console.error("Failed to load featured products:", err);
    grid.innerHTML = '<p class="col-span-4 text-center text-gray-400 py-12">Failed to load products. Please refresh.</p>';
  }
});
