/**
 * Slimeopolis — Shared App Utilities
 * Handles: auth state, API calls, cart badge, toast notifications
 */

const API_BASE = "/api";

// ─── Auth State ───────────────────────────────────────────────────────────────

const Auth = {
  getToken: () => localStorage.getItem("slime_token"),
  getUser: () => {
    try { return JSON.parse(localStorage.getItem("slime_user") || "null"); }
    catch { return null; }
  },
  setSession: (token, user) => {
    localStorage.setItem("slime_token", token);
    localStorage.setItem("slime_user", JSON.stringify(user));
  },
  clearSession: () => {
    localStorage.removeItem("slime_token");
    localStorage.removeItem("slime_user");
  },
  isLoggedIn: () => !!localStorage.getItem("slime_token"),
};

// ─── API Client ───────────────────────────────────────────────────────────────
// Every call goes through here so Authorization headers are always included.
// This is also the session identifier that API Shield uses for per-session
// Volumetric Abuse Detection and Sequence Analytics.

const api = {
  async request(method, path, body) {
    const headers = { "Content-Type": "application/json" };
    const token = Auth.getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json();
    return { status: res.status, data };
  },

  get: (path) => api.request("GET", path),
  post: (path, body) => api.request("POST", path, body),
  put: (path, body) => api.request("PUT", path, body),
  delete: (path) => api.request("DELETE", path),
};

// ─── Toast Notifications ──────────────────────────────────────────────────────

function ensureToastContainer() {
  let el = document.getElementById("toast-container");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast-container";
    document.body.appendChild(el);
  }
  return el;
}

function showToast(message, type = "info", duration = 3500) {
  const container = ensureToastContainer();
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = "toastIn 0.3s ease reverse";
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ─── Cart Badge ───────────────────────────────────────────────────────────────

async function updateCartBadge() {
  const badge = document.getElementById("cart-badge");
  if (!badge || !Auth.isLoggedIn()) return;

  try {
    const { data } = await api.get("/cart");
    if (data.success && data.data.item_count > 0) {
      badge.textContent = data.data.item_count > 9 ? "9+" : data.data.item_count;
      badge.classList.remove("hidden");
      badge.classList.add("flex");
    } else {
      badge.classList.add("hidden");
      badge.classList.remove("flex");
    }
  } catch { /* silent */ }
}

// ─── Auth Nav Update ──────────────────────────────────────────────────────────

function updateAuthNav() {
  const navEl = document.getElementById("auth-nav");
  if (!navEl) return;

  if (Auth.isLoggedIn()) {
    const user = Auth.getUser();
    navEl.innerHTML = `
      <div class="flex items-center gap-3">
        <span class="text-sm text-gray-600 hidden sm:block">Hi, ${escapeHtml(user?.name?.split(" ")[0] ?? "there")}</span>
        <button onclick="handleLogout()" class="text-sm font-medium px-4 py-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors">
          Sign out
        </button>
      </div>
    `;
  } else {
    navEl.innerHTML = `
      <a href="/login.html" class="text-sm font-medium px-4 py-2 rounded-full border border-gray-200 hover:border-gray-400 transition-colors">
        Sign in
      </a>
    `;
  }
}

async function handleLogout() {
  try {
    await api.post("/auth/logout");
  } catch { /* silent */ }
  Auth.clearSession();
  showToast("Signed out successfully", "success");
  setTimeout(() => window.location.href = "/", 800);
}

// ─── Format Helpers ───────────────────────────────────────────────────────────

function formatPrice(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str ?? "";
  return d.innerHTML;
}

function categoryEmoji(category) {
  const map = {
    butter: "🧈", cloud: "☁️", clear: "💎", floam: "🫧",
    crunchy: "🍿", glossy: "✨", metallic: "🔮", glitter: "🌟",
    glow: "💫", clay: "🏺"
  };
  return map[category] ?? "🫧";
}

function countryFlag(code) {
  const flags = { JP:"🇯🇵", BR:"🇧🇷", FR:"🇫🇷", KR:"🇰🇷", IN:"🇮🇳", AU:"🇦🇺", MX:"🇲🇽", IT:"🇮🇹" };
  return flags[code] ?? "🌍";
}

// ─── Product Card Builder ─────────────────────────────────────────────────────

function buildProductCard(product) {
  const inStock = product.stock_quantity > 0;
  const swatchBg = product.color_hex || "#86efac";

  return `
    <a href="/product.html?id=${escapeHtml(product.id)}"
       class="product-card bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm flex flex-col group">
      <!-- Color swatch area -->
      <div class="relative h-48 flex items-center justify-center"
           style="background: linear-gradient(135deg, ${swatchBg}22, ${swatchBg}55)">
        <div class="w-24 h-24 rounded-full shadow-lg"
             style="background: radial-gradient(circle at 35% 35%, white 0%, ${swatchBg} 100%)"></div>
        <div class="absolute top-3 left-3 flex gap-1">
          <span class="bg-white/80 backdrop-blur rounded-full px-2 py-0.5 text-xs font-medium">
            ${countryFlag(product.country_code)} ${escapeHtml(product.country_name)}
          </span>
        </div>
        ${product.is_featured ? '<span class="absolute top-3 right-3 bg-amber-400 text-white text-xs font-bold px-2 py-0.5 rounded-full">⭐ Featured</span>' : ""}
        ${!inStock ? '<div class="absolute inset-0 bg-white/60 flex items-center justify-center"><span class="text-sm font-semibold text-gray-500">Out of Stock</span></div>' : ""}
      </div>
      <!-- Info -->
      <div class="p-5 flex flex-col gap-2 flex-1">
        <div class="flex items-start justify-between gap-2">
          <h3 class="font-semibold text-gray-900 text-sm leading-snug group-hover:text-slime-600 transition-colors">
            ${escapeHtml(product.name)}
          </h3>
          <span class="text-sm font-bold text-gray-900 whitespace-nowrap">${formatPrice(product.price_cents)}</span>
        </div>
        <div class="flex items-center gap-2 text-xs text-gray-500">
          <span>${categoryEmoji(product.category)} ${escapeHtml(product.category)}</span>
          ${product.scent ? `<span>·</span><span>🌸 ${escapeHtml(product.scent)}</span>` : ""}
        </div>
        <div class="mt-auto pt-3">
          <button
            onclick="event.preventDefault(); addToCart('${product.id}', this)"
            class="w-full py-2 rounded-xl text-xs font-semibold transition-colors
                   ${inStock
                     ? "bg-gray-900 text-white hover:bg-slime-600"
                     : "bg-gray-100 text-gray-400 cursor-not-allowed"}"
            ${!inStock ? "disabled" : ""}>
            ${inStock ? "Add to Cart" : "Out of Stock"}
          </button>
        </div>
      </div>
    </a>
  `;
}

// ─── Add to Cart ──────────────────────────────────────────────────────────────

async function addToCart(productId, btn) {
  if (!Auth.isLoggedIn()) {
    showToast("Sign in to add items to your cart", "info");
    setTimeout(() => window.location.href = "/login.html", 1000);
    return;
  }

  const orig = btn.textContent;
  btn.textContent = "Adding...";
  btn.disabled = true;

  const { status, data } = await api.post("/cart/items", { product_id: productId, quantity: 1 });

  if (status === 200 || status === 201) {
    showToast("Added to cart! 🫧", "success");
    await updateCartBadge();
    btn.textContent = "✓ Added";
    setTimeout(() => {
      btn.textContent = orig;
      btn.disabled = false;
    }, 1500);
  } else {
    showToast(data.error?.message ?? "Failed to add to cart", "error");
    btn.textContent = orig;
    btn.disabled = false;
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  updateAuthNav();
  updateCartBadge();
});
