/* Get references to DOM elements */
const categoryFilter = document.getElementById("categoryFilter");
const productSearch = document.getElementById("productSearch");
const productsContainer = document.getElementById("productsContainer");
const selectedProductsList = document.getElementById("selectedProductsList");
const clearSelectionsBtn = document.getElementById("clearSelections");
const descriptionModal = document.getElementById("descriptionModal");
const descriptionModalBrand = document.getElementById("descriptionModalBrand");
const descriptionModalTitle = document.getElementById("descriptionModalTitle");
const descriptionModalCategory = document.getElementById(
  "descriptionModalCategory",
);
const descriptionModalText = document.getElementById("descriptionModalText");
const chatForm = document.getElementById("chatForm");
const userInput = document.getElementById("userInput");
const chatWindow = document.getElementById("chatWindow");
const genRoutineBtn = document.getElementById("generateRoutine");

/* App state */
const STORAGE_KEY = "lorealSelectedProductIds";
const DIRECTION_KEY = "lorealDirectionMode";
let allProducts = [];
let selectedProductIds = new Set();
let activeCategory = "";
let searchQuery = "";
let conversationHistory = [];
let hasGeneratedRoutine = false;
let languageObserver = null;
let lastFocusedElement = null;

/* Show initial placeholder until user selects a category */
productsContainer.innerHTML = `
  <div class="placeholder-message">
    Select a category to view products
  </div>
`;

/* Load product data from JSON file */
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

/* Safely render text in HTML template strings */
function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/* Convert plain URLs and markdown-style links into clickable anchors */
function linkifyText(message) {
  const linkPattern =
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>"]+)/gi;
  let lastIndex = 0;
  let html = "";
  let match;

  while ((match = linkPattern.exec(message)) !== null) {
    html += escapeHtml(message.slice(lastIndex, match.index));

    if (match[2]) {
      html += `<a href="${escapeHtml(match[2])}" target="_blank" rel="noopener noreferrer">${escapeHtml(match[1])}</a>`;
    } else {
      html += `<a href="${escapeHtml(match[3])}" target="_blank" rel="noopener noreferrer">${escapeHtml(match[3])}</a>`;
    }

    lastIndex = match.index + match[0].length;
  }

  html += escapeHtml(message.slice(lastIndex));
  return html;
}

/* Apply saved direction mode and update button label */
function applyDirection(mode) {
  const direction = mode === "rtl" ? "rtl" : "ltr";
  document.documentElement.setAttribute("dir", direction);
}

/* Detect whether a language should read right-to-left */
function isRtlLanguage(languageCode) {
  if (!languageCode) {
    return false;
  }

  const normalizedCode = languageCode.toLowerCase();
  const rtlLanguages = [
    "ar",
    "he",
    "fa",
    "ur",
    "ps",
    "dv",
    "ku",
    "ug",
    "yi",
    "sd",
    "ckb",
    "syr",
  ];

  return rtlLanguages.some(
    (rtlLanguage) =>
      normalizedCode === rtlLanguage ||
      normalizedCode.startsWith(`${rtlLanguage}-`),
  );
}

/* Keep RTL in sync with the current page language, including Google Translate */
function syncDirectionWithLanguage() {
  const currentLanguage = document.documentElement.lang || "en";
  const hasRtlTranslateClass = [
    document.documentElement.classList,
    document.body?.classList,
  ].some(
    (classList) =>
      classList &&
      (classList.contains("translated-rtl") ||
        classList.contains("gt-rtl") ||
        classList.contains("rtl")),
  );
  const nextDirection =
    hasRtlTranslateClass || isRtlLanguage(currentLanguage) ? "rtl" : "ltr";
  const currentDirection =
    document.documentElement.getAttribute("dir") || "ltr";

  if (currentDirection !== nextDirection) {
    document.documentElement.setAttribute("dir", nextDirection);
    localStorage.setItem(DIRECTION_KEY, nextDirection);
  }
}

/* Filter products by current category and search query */
function getFilteredProducts() {
  const normalizedSearch = searchQuery.trim().toLowerCase();

  if (!activeCategory && !normalizedSearch) {
    return [];
  }

  return allProducts.filter((product) => {
    const categoryMatch =
      !activeCategory || product.category === activeCategory;

    if (!normalizedSearch) {
      return categoryMatch;
    }

    const searchableText =
      `${product.name} ${product.brand} ${product.category} ${product.description}`.toLowerCase();
    const searchMatch = searchableText.includes(normalizedSearch);

    return categoryMatch && searchMatch;
  });
}

/* Save selected product IDs for page reload persistence */
function saveSelections() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(Array.from(selectedProductIds)),
  );
}

/* Restore selected product IDs from localStorage */
function loadSelections() {
  const savedIds = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
  const normalizedIds = savedIds
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id));
  selectedProductIds = new Set(normalizedIds);
}

/* Create HTML for displaying product cards */
function displayProducts(products) {
  if (products.length === 0) {
    productsContainer.innerHTML = `
      <div class="placeholder-message">
        Choose a category or search term to view matching products.
      </div>
    `;
    return;
  }

  productsContainer.innerHTML = products
    .map((product) => {
      const isSelected = selectedProductIds.has(product.id);
      return `
        <article
          class="product-card ${isSelected ? "selected" : ""}"
          data-product-id="${product.id}"
          role="button"
          tabindex="0"
          aria-pressed="${isSelected}"
          aria-label="${isSelected ? "Unselect" : "Select"} ${escapeHtml(product.name)}"
        >
          <img src="${product.image}" alt="${escapeHtml(product.name)}">
          <div class="product-info">
            <h3>${escapeHtml(product.name)}</h3>
            <p>${escapeHtml(product.brand)}</p>
            <button
              type="button"
              class="product-description-btn"
              data-description-id="${product.id}"
              aria-label="View description for ${escapeHtml(product.name)}"
            >
              View Description
            </button>
          </div>
        </article>
      `;
    })
    .join("");
}

/* Show the selected product description in a modal */
function openDescriptionModal(productId) {
  const product = allProducts.find((item) => item.id === productId);

  if (!product || !descriptionModal) {
    return;
  }

  lastFocusedElement = document.activeElement;
  descriptionModalBrand.innerText = product.brand;
  descriptionModalTitle.innerText = product.name;
  descriptionModalCategory.innerText = product.category;
  descriptionModalText.innerText = product.description;
  descriptionModal.setAttribute("aria-hidden", "false");
  descriptionModal.classList.add("is-open");

  const closeButton = descriptionModal.querySelector(
    ".description-modal__close",
  );
  closeButton?.focus();
}

/* Close the description modal */
function closeDescriptionModal() {
  if (!descriptionModal) {
    return;
  }

  descriptionModal.setAttribute("aria-hidden", "true");
  descriptionModal.classList.remove("is-open");

  if (lastFocusedElement instanceof HTMLElement) {
    lastFocusedElement.focus();
  }
}

/* Keep selected products section in sync with selected IDs */
function renderSelectedProducts() {
  const selectedProducts = allProducts.filter((product) =>
    selectedProductIds.has(product.id),
  );

  if (selectedProducts.length === 0) {
    selectedProductsList.innerHTML = `
      <p class="empty-selected-message">No products selected yet.</p>
    `;
    clearSelectionsBtn.disabled = true;
    return;
  }

  selectedProductsList.innerHTML = selectedProducts
    .map(
      (product) => `
        <div class="selected-product-item">
          <div>
            <h4>${escapeHtml(product.name)}</h4>
            <p>${escapeHtml(product.brand)} • ${escapeHtml(product.category)}</p>
          </div>
          <button
            type="button"
            class="remove-selected-btn"
            data-remove-id="${product.id}"
            aria-label="Remove ${escapeHtml(product.name)}"
          >
            Remove
          </button>
        </div>
      `,
    )
    .join("");

  clearSelectionsBtn.disabled = false;
}

/* Re-render cards for the current category and the selected products list */
function refreshUi() {
  const filteredProducts = getFilteredProducts();
  displayProducts(filteredProducts);
  renderSelectedProducts();
}

/* Select or unselect a product */
function toggleProductSelection(productId) {
  if (selectedProductIds.has(productId)) {
    selectedProductIds.delete(productId);
  } else {
    selectedProductIds.add(productId);
  }
  saveSelections();
  refreshUi();
}

/* Add a user/assistant message to the chat area */
function appendMessage(role, message) {
  const messageDiv = document.createElement("div");
  messageDiv.className = `chat-message ${role}`;

  if (role === "assistant") {
    messageDiv.innerHTML = linkifyText(message);
  } else {
    messageDiv.innerText = message;
  }

  chatWindow.appendChild(messageDiv);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

/* Send chat messages to the OpenAI API */
async function sendChatRequest(messages) {
  const response = await fetch(workerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      messages,
    }),
  });

  if (!response.ok) {
    throw new Error("Unable to contact the API right now.");
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

/* App startup: load products and restore selected IDs from storage */
async function initializeApp() {
  try {
    allProducts = await loadProducts();
    loadSelections();
    activeCategory = categoryFilter.value;
    applyDirection(localStorage.getItem(DIRECTION_KEY) || "ltr");
    syncDirectionWithLanguage();

    if (languageObserver) {
      languageObserver.disconnect();
    }

    languageObserver = new MutationObserver((mutations) => {
      const shouldResync = mutations.some(
        (mutation) =>
          mutation.attributeName === "lang" ||
          mutation.attributeName === "class" ||
          mutation.attributeName === "dir",
      );

      if (shouldResync) {
        syncDirectionWithLanguage();
      }
    });

    languageObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["lang", "class", "dir"],
    });

    if (document.body) {
      languageObserver.observe(document.body, {
        attributes: true,
        attributeFilter: ["class", "dir"],
      });
    }

    refreshUi();
    renderSelectedProducts();
  } catch (error) {
    selectedProductsList.innerHTML =
      "<p>Unable to load products right now.</p>";
  }
}

/* Filter and display products when category changes */
categoryFilter.addEventListener("change", (e) => {
  activeCategory = e.target.value;
  refreshUi();
});

/* Filter products in real time as the user types */
productSearch.addEventListener("input", (e) => {
  searchQuery = e.target.value;
  refreshUi();
});

/* Let user select/unselect products by clicking the card */
productsContainer.addEventListener("click", (event) => {
  const descriptionButton = event.target.closest(".product-description-btn");
  if (descriptionButton) {
    const productId = Number(descriptionButton.dataset.descriptionId);
    openDescriptionModal(productId);
    return;
  }

  const card = event.target.closest(".product-card");
  if (!card) {
    return;
  }

  const productId = Number(card.dataset.productId);
  toggleProductSelection(productId);
});

/* Keyboard support for card selection */
productsContainer.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  const descriptionButton = event.target.closest(".product-description-btn");
  if (descriptionButton) {
    event.preventDefault();
    const productId = Number(descriptionButton.dataset.descriptionId);
    openDescriptionModal(productId);
    return;
  }

  const card = event.target.closest(".product-card");
  if (!card) {
    return;
  }

  event.preventDefault();
  const productId = Number(card.dataset.productId);
  toggleProductSelection(productId);
});

/* Allow closing the description modal from the backdrop or close button */
descriptionModal?.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-modal]")) {
    closeDescriptionModal();
  }
});

/* Close the modal with Escape */
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    descriptionModal?.classList.contains("is-open")
  ) {
    closeDescriptionModal();
  }
});

/* Remove one item directly from the selected products list */
selectedProductsList.addEventListener("click", (event) => {
  const removeButton = event.target.closest(".remove-selected-btn");
  if (!removeButton) {
    return;
  }

  const productId = Number(removeButton.dataset.removeId);
  selectedProductIds.delete(productId);
  saveSelections();
  refreshUi();
});

/* Clear all selected products at once */
clearSelectionsBtn.addEventListener("click", () => {
  selectedProductIds.clear();
  saveSelections();
  refreshUi();
});

/* Generate routine from selected product data */
genRoutineBtn.addEventListener("click", async () => {
  const selectedProducts = allProducts
    .filter((product) => selectedProductIds.has(product.id))
    .map((product) => ({
      name: product.name,
      brand: product.brand,
      category: product.category,
      description: product.description,
    }));

  if (selectedProducts.length === 0) {
    chatWindow.innerHTML = "";
    appendMessage("assistant", "Select at least one product first.");
    return;
  }

  chatWindow.innerHTML = "";
  appendMessage("assistant", "Generating your personalized routine...");

  try {
    const systemMessage = {
      role: "system",
      content:
        "You are a beauty advisor. Build personalized routines using only the user's selected products. If a user asks follow-up questions, answer only about the generated routine or related beauty topics like skincare, haircare, makeup, fragrance, and product usage. Keep answers practical and beginner friendly.",
    };

    const userMessage = {
      role: "user",
      content: `Create a personalized routine using ONLY these selected products:\n${JSON.stringify(
        selectedProducts,
        null,
        2,
      )}\n\nInclude clear sections (Morning, Evening, and optional Weekly tips).`,
    };

    const aiResponse = await sendChatRequest([systemMessage, userMessage]);

    chatWindow.innerHTML = "";
    appendMessage("assistant", aiResponse);

    hasGeneratedRoutine = true;
    conversationHistory = [
      systemMessage,
      userMessage,
      { role: "assistant", content: aiResponse },
    ];
  } catch (error) {
    chatWindow.innerHTML = "";
    appendMessage(
      "assistant",
      "Something went wrong while generating your routine.",
    );
  }
});

/* Follow-up chat handler using full conversation history */
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const message = userInput.value.trim();
  if (!message) {
    return;
  }

  if (!hasGeneratedRoutine) {
    chatWindow.innerHTML = "";
    appendMessage(
      "assistant",
      "Generate a routine first, then ask follow-up questions about it.",
    );
    userInput.value = "";
    return;
  }

  appendMessage("user", message);
  userInput.value = "";

  try {
    conversationHistory.push({ role: "user", content: message });
    const aiResponse = await sendChatRequest(conversationHistory);
    conversationHistory.push({ role: "assistant", content: aiResponse });
    appendMessage("assistant", aiResponse);
  } catch (error) {
    appendMessage(
      "assistant",
      "I could not get a follow-up response right now.",
    );
  }
});

initializeApp();
