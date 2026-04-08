/**
 * Products page — handles filtering, search, pagination
 * API Shield targets hit here:
 *   GET /api/products           → Schema Validation (query params)
 *   GET /api/products/search    → Volumetric Abuse Detection
 */

let currentPage = 1;
let currentFilters = { country: "", category: "", featured: "", q: "" };

const grid = document.getElementById("products-grid");
const resultCount = document.getElementById("result-count");
const pagination = document.getElementById("pagination");
const prevBtn = document.getElementById("prev-btn");
const nextBtn = document.getElementById("next-btn");
const pageInfo = document.getElementById("page-info");

async function loadProducts() {
  grid.innerHTML = Array(6).fill('<div class="rounded-2xl bg-white border border-gray-100 h-72 skeleton"></div>').join("");
  resultCount.textContent = "Loading...";

  try {
    let url, data;

    if (currentFilters.q) {
      // Search endpoint — primary Volumetric Abuse Detection target
      url = `/products/search?q=${encodeURIComponent(currentFilters.q)}&page=${currentPage}&per_page=12`;
      const res = await api.get(url);
      data = res.data;
    } else {
      // Browse endpoint — Sequence Analytics step 1
      const params = new URLSearchParams({ page: currentPage, per_page: 12 });
      if (currentFilters.country) params.set("country", currentFilters.country);
      if (currentFilters.category) params.set("category", currentFilters.category);
      if (currentFilters.featured) params.set("featured", currentFilters.featured);
      const res = await api.get(`/products?${params}`);
      data = res.data;
    }

    if (!data.success) throw new Error(data.error?.message ?? "Failed to load");

    const products = data.data;
    const meta = data.meta;

    resultCount.textContent = `${meta.total} product${meta.total !== 1 ? "s" : ""} found`;

    if (!products.length) {
      grid.innerHTML = `
        <div class="col-span-full text-center py-16">
          <div class="text-5xl mb-4">🔍</div>
          <p class="text-gray-500">No slimes found. Try different filters.</p>
        </div>`;
      pagination.classList.add("hidden");
      return;
    }

    grid.innerHTML = products.map(buildProductCard).join("");

    // Pagination
    if (meta.total_pages > 1) {
      pagination.classList.remove("hidden");
      pageInfo.textContent = `Page ${meta.page} of ${meta.total_pages}`;
      prevBtn.disabled = meta.page <= 1;
      nextBtn.disabled = meta.page >= meta.total_pages;
    } else {
      pagination.classList.add("hidden");
    }

  } catch (err) {
    console.error(err);
    grid.innerHTML = `<div class="col-span-full text-center py-16 text-gray-400">Failed to load products.</div>`;
  }
}

// ─── Filters ──────────────────────────────────────────────────────────────────

document.querySelectorAll('input[name="country"]').forEach((el) => {
  el.addEventListener("change", () => {
    currentFilters.country = el.value;
    currentPage = 1;
    loadProducts();
  });
});

document.querySelectorAll('input[name="category"]').forEach((el) => {
  el.addEventListener("change", () => {
    currentFilters.category = el.value;
    currentPage = 1;
    loadProducts();
  });
});

// ─── Search ───────────────────────────────────────────────────────────────────

let searchTimeout;
document.getElementById("search-input").addEventListener("input", (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    currentFilters.q = e.target.value.trim();
    currentPage = 1;
    loadProducts();
  }, 400); // debounce 400ms to reduce request volume
});

document.getElementById("search-btn").addEventListener("click", () => {
  currentFilters.q = document.getElementById("search-input").value.trim();
  currentPage = 1;
  loadProducts();
});

document.getElementById("search-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    currentFilters.q = e.target.value.trim();
    currentPage = 1;
    loadProducts();
  }
});

// ─── Pagination ───────────────────────────────────────────────────────────────

prevBtn.addEventListener("click", () => { if (currentPage > 1) { currentPage--; loadProducts(); } });
nextBtn.addEventListener("click", () => { currentPage++; loadProducts(); });

// ─── URL Params (deep linking) ────────────────────────────────────────────────

const params = new URLSearchParams(window.location.search);
if (params.get("country")) {
  currentFilters.country = params.get("country");
  const radio = document.querySelector(`input[name="country"][value="${params.get("country")}"]`);
  if (radio) radio.checked = true;
}
if (params.get("category")) {
  currentFilters.category = params.get("category");
  const radio = document.querySelector(`input[name="category"][value="${params.get("category")}"]`);
  if (radio) radio.checked = true;
}
if (params.get("featured") === "true") {
  currentFilters.featured = "true";
}

document.addEventListener("DOMContentLoaded", loadProducts);
