const searchInput = document.querySelector("#search-input");
const searchStatus = document.querySelector("#search-status");
const searchResults = document.querySelector("#search-results");
const pricingForm = document.querySelector("#pricing-form");
const calculateButton = document.querySelector("#calculate-button");
const resetButton = document.querySelector("#reset-button");
const selectedGood = document.querySelector("#selected-good");
const pricingStatus = document.querySelector("#pricing-status");
const pricingResult = document.querySelector("#pricing-result");
const formHints = document.querySelector("#form-hints");

const formElements = {
  goodId: document.querySelector("#good-id"),
  documentDate: document.querySelector("#document-date"),
  quantity: document.querySelector("#quantity"),
  warehouseId: document.querySelector("#warehouse-id"),
  includeTechnicalFee: document.querySelector("#include-technical-fee")
};

const state = {
  query: "",
  selectedGoodId: "",
  results: [],
  lastCalculatedGoodId: "",
  autoSelectedFromSearch: false,
  highlightedIndex: -1,
  restoredFromUrl: false
};

function buildUrlFromState() {
  const params = new URLSearchParams();
  const query = searchInput.value.trim();
  const goodId = formElements.goodId.value.trim();
  const documentDate = formElements.documentDate.value.trim();
  const quantity = formElements.quantity.value.trim();
  const warehouseId = formElements.warehouseId.value.trim();

  if (query) {
    params.set("q", query);
  }

  if (goodId) {
    params.set("goodId", goodId);
  }

  if (documentDate) {
    params.set("documentDate", documentDate);
  }

  if (quantity) {
    params.set("quantity", quantity);
  }

  if (warehouseId) {
    params.set("warehouseId", warehouseId);
  }

  if (formElements.includeTechnicalFee.checked) {
    params.set("includeTechnicalFee", "on");
  }

  return params.toString();
}

function syncUrl() {
  const nextHash = buildUrlFromState();
  const currentHash = window.location.hash.replace(/^#/, "");

  if (nextHash === currentHash) {
    return;
  }

  window.location.hash = nextHash;
}

function applyUrlState() {
  const hashValue = window.location.hash.replace(/^#/, "");
  const params = new URLSearchParams(hashValue);
  const searchQuery = params.get("q") ?? "";
  const goodId = params.get("goodId") ?? "";
  const documentDate = params.get("documentDate") ?? "2026-06-24";
  const quantity = params.get("quantity") ?? "1";
  const warehouseId = params.get("warehouseId") ?? "main";
  const includeTechnicalFee = params.get("includeTechnicalFee") !== "off";

  searchInput.value = searchQuery;
  formElements.goodId.value = goodId;
  formElements.documentDate.value = documentDate;
  formElements.quantity.value = quantity;
  formElements.warehouseId.value = warehouseId;
  formElements.includeTechnicalFee.checked = includeTechnicalFee;

  state.query = searchQuery;
  state.selectedGoodId = goodId;
  state.restoredFromUrl = true;
}

function formatCurrency(value) {
  if (value == null) {
    return "Unavailable";
  }

  return new Intl.NumberFormat("en-US").format(value);
}

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

function clearValidationState() {
  for (const element of Object.values(formElements)) {
    if ("classList" in element) {
      element.classList.remove("is-invalid");
    }
  }
}

function resetFormState() {
  state.selectedGoodId = "";
  state.lastCalculatedGoodId = "";
  state.autoSelectedFromSearch = false;
  state.highlightedIndex = -1;
  formElements.goodId.value = "";
  formElements.documentDate.value = "2026-06-24";
  formElements.quantity.value = "1";
  formElements.warehouseId.value = "main";
  formElements.includeTechnicalFee.checked = true;
  searchInput.value = "";
  state.query = "";
  pricingResult.innerHTML = "";
  setStatus(pricingStatus, "");
  renderHints([]);
  updateSelectedGoodCard(null);
  clearValidationState();
  renderSearchResults(state.results);
  syncUrl();
}

function renderHints(messages) {
  formHints.innerHTML = messages
    .map((message) => `<div class="hint-chip">${message}</div>`)
    .join("");
}

function updateSelectedGoodCard(good) {
  if (!good) {
    selectedGood.classList.add("is-hidden");
    selectedGood.innerHTML = "";
    return;
  }

  selectedGood.innerHTML = `
    <strong>${good.title}</strong>
    <div class="selected-line">${good.persianTitle}</div>
    <div class="selected-line">${good.brand} · unit price ${formatCurrency(good.consumerUnitPrice)}</div>
    <div class="selected-line">${good.unitLabel} · ${good.nonPharma ? "Non-pharma item" : "Pharma item"}</div>
  `;
  selectedGood.classList.remove("is-hidden");
}

function selectGood(good, options = {}) {
  state.selectedGoodId = good.id;
  state.autoSelectedFromSearch = Boolean(options.autoSelected);
  state.highlightedIndex = state.results.findIndex((item) => item.id === good.id);
  formElements.goodId.value = good.id;
  updateSelectedGoodCard(good);
  pricingResult.innerHTML = "";
  pricingStatus.textContent = "";
  renderSearchResults(state.results);

  const hints = [
    `${good.title} is selected and ready for consumer price lookup.`,
    state.autoSelectedFromSearch
      ? "The closest search result was selected automatically."
      : "You can still adjust quantity, date, or warehouse before calculation."
  ];

  renderHints(hints);
  syncUrl();
}

function findGoodById(id) {
  return state.results.find((good) => good.id === id) ?? null;
}

function moveHighlight(direction) {
  if (state.results.length === 0) {
    return;
  }

  if (state.highlightedIndex === -1) {
    state.highlightedIndex = direction > 0 ? 0 : state.results.length - 1;
  } else {
    state.highlightedIndex =
      (state.highlightedIndex + direction + state.results.length) % state.results.length;
  }

  const highlightedGood = state.results[state.highlightedIndex];
  renderSearchResults(state.results);
  renderHints([
    `${highlightedGood.title} is highlighted.`,
    "Press Enter to select this result."
  ]);
}

function validateForm() {
  clearValidationState();

  const hints = [];
  const errors = [];
  const goodId = formElements.goodId.value.trim();
  const date = formElements.documentDate.value.trim();
  const quantity = Number(formElements.quantity.value);
  const warehouseId = formElements.warehouseId.value.trim();

  if (!goodId) {
    errors.push("Pick a good from the search results or enter a good id.");
    formElements.goodId.classList.add("is-invalid");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.push("Document date should use the YYYY-MM-DD format.");
    formElements.documentDate.classList.add("is-invalid");
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    errors.push("Quantity must be a positive number.");
    formElements.quantity.classList.add("is-invalid");
  }

  if (!warehouseId) {
    errors.push("Warehouse is required.");
    formElements.warehouseId.classList.add("is-invalid");
  }

  const selectedGood = findGoodById(goodId);
  if (selectedGood) {
    hints.push(
      selectedGood.nonPharma
        ? "Technical fee may stay zero for non-pharma goods."
        : "Technical fee can apply for pharma goods when the rule matches."
    );
  }

  return {
    errors,
    hints
  };
}

async function readJson(response) {
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed");
  }

  return payload;
}

function renderSearchResults(items) {
  searchResults.innerHTML = "";

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "status-text";
    empty.textContent = state.query.trim() ? "No goods matched this search." : "Type to narrow the list.";
    searchResults.append(empty);
    return;
  }

  for (const good of items) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-card";

    if (state.selectedGoodId === good.id || state.highlightedIndex === state.results.indexOf(good)) {
      button.classList.add("is-active");
    }

    button.innerHTML = `
      <strong>${good.title}</strong>
      <span class="meta">${good.persianTitle}</span>
      <span class="altmeta">${good.brand} · ${good.unitLabel} · unit price ${formatCurrency(good.consumerUnitPrice)}</span>
      <span class="submeta">${good.englishTitle} · ${good.barcode}</span>
    `;

    button.addEventListener("click", () => {
      selectGood(good);
    });

    searchResults.append(button);
  }
}

async function searchGoods(query) {
  state.query = query;
  setStatus(searchStatus, "Searching...");

  try {
    const response = await fetch(`/goods/search?q=${encodeURIComponent(query.trim())}`);
    const payload = await readJson(response);
    state.results = payload.items;
    renderSearchResults(payload.items);
    setStatus(searchStatus, payload.total > 0 ? `${payload.total} goods found.` : "");

    const currentSelectionStillVisible = payload.items.some(
      (good) => good.id === state.selectedGoodId
    );

    if (!currentSelectionStillVisible && payload.items.length === 1) {
      selectGood(payload.items[0], { autoSelected: true });
    } else if (!currentSelectionStillVisible && payload.items.length === 0) {
      state.selectedGoodId = "";
      state.autoSelectedFromSearch = false;
      updateSelectedGoodCard(null);
      renderHints([]);
    } else if (currentSelectionStillVisible) {
      const currentGood = payload.items.find((good) => good.id === state.selectedGoodId);
      updateSelectedGoodCard(currentGood);
      if (currentGood) {
        renderHints([
          `${currentGood.title} is selected and ready for consumer price lookup.`,
          "You can still adjust quantity, date, or warehouse before calculation."
        ]);
      }
    }

    if (state.restoredFromUrl && state.selectedGoodId) {
      const restoredGood = payload.items.find((good) => good.id === state.selectedGoodId);
      if (restoredGood) {
        updateSelectedGoodCard(restoredGood);
        renderHints([
          `${restoredGood.title} was restored from the page link.`,
          "You can refresh this page without losing the selected context."
        ]);
      }
    }
  } catch (error) {
    state.results = [];
    renderSearchResults([]);
    setStatus(searchStatus, error.message ?? "Search failed", true);
  }
}

function renderPricingResult(result) {
  const metrics = [
    ["Consumer unit price", formatCurrency(result.consumerUnitPrice)],
    ["Consumer total price", formatCurrency(result.consumerTotalPrice)],
    ["Final consumer price", formatCurrency(result.finalConsumerPrice ?? result.finalPrice)],
    ["Unit type", result.unitLabel ?? "Unavailable"],
    ["Requested quantity", String(result.quantity ?? 1)],
    ["Technical fee", formatCurrency(result.technicalFee)],
    ["Tax amount", formatCurrency(result.taxAmount)],
    ["Toll amount", formatCurrency(result.tollAmount)]
  ];

  pricingResult.innerHTML = metrics
    .map(
      ([label, value], index) => `
        <div class="metric-card ${index === 0 || index === 2 ? "featured" : ""}">
          <span>${label}</span>
          <strong>${value}</strong>
        </div>
      `
    )
    .join("");

  const warnings = result.warnings.length
    ? `<div class="warning-list">${result.warnings
        .map((warning) => `<div class="warning-chip">${warning}</div>`)
        .join("")}</div>`
    : "";

  pricingResult.innerHTML += `
    <div class="rules-card">
      <strong>${result.title}</strong>
      <div><span>Persian title</span>${result.persianTitle ?? "Unavailable"}</div>
      <div><span>English title</span>${result.englishTitle ?? result.title}</div>
      <div><span>Pack description</span>${result.packLabel ?? "Unavailable"}</div>
      <div><span>Tax date</span>${result.appliedTaxDate ?? "Unavailable"}</div>
      <div><span>Technical fee date</span>${result.appliedTechnicalFeeDate ?? "Unavailable"}</div>
      <div class="source-list">
        ${(result.sourceHints ?? [])
          .map((source) => `<div class="source-chip">${source.label} · ${source.role}</div>`)
          .join("")}
      </div>
      ${warnings}
    </div>
  `;
}

let searchTimer = null;
searchInput.addEventListener("input", (event) => {
  state.highlightedIndex = -1;
  state.query = event.target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    syncUrl();
    searchGoods(event.target.value);
  }, 180);
});

searchInput.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    moveHighlight(1);
    return;
  }

  if (event.key === "ArrowUp") {
    event.preventDefault();
    moveHighlight(-1);
    return;
  }

  if (event.key === "Enter") {
    if (state.highlightedIndex >= 0 && state.results[state.highlightedIndex]) {
      event.preventDefault();
      selectGood(state.results[state.highlightedIndex]);
    }
  }
});

pricingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const validation = validateForm();

  if (validation.errors.length > 0) {
    pricingResult.innerHTML = "";
    setStatus(pricingStatus, validation.errors[0], true);
    renderHints(validation.errors.slice(1).concat(validation.hints));
    return;
  }

  calculateButton.disabled = true;
  calculateButton.textContent = "Finding price...";
  pricingResult.innerHTML = "";
  setStatus(pricingStatus, "");
  renderHints(validation.hints);

  try {
    const response = await fetch("/pricing/calculate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        goodId: formElements.goodId.value,
        documentDate: formElements.documentDate.value,
        quantity: Number(formElements.quantity.value),
        warehouseId: formElements.warehouseId.value,
        includeTechnicalFee: formElements.includeTechnicalFee.checked
      })
    });

    const payload = await readJson(response);
    state.lastCalculatedGoodId = payload.goodId;
    renderPricingResult(payload);
    setStatus(pricingStatus, "Consumer price is ready.");
    syncUrl();

    const calculatedGood = findGoodById(payload.goodId);
    const freshHints = [];

    if (calculatedGood && calculatedGood.tempPrice && !calculatedGood.sellPrice) {
      freshHints.push("This item is using temp price because sell price is unavailable.");
    }

    if (payload.warnings.length === 0) {
      freshHints.push("No pricing warnings were returned for this consumer price.");
    }

    renderHints(validation.hints.concat(freshHints));
  } catch (error) {
    setStatus(pricingStatus, error.message ?? "Calculation failed", true);
  } finally {
    calculateButton.disabled = false;
    calculateButton.textContent = "Find consumer price";
  }
});

resetButton.addEventListener("click", () => {
  resetFormState();
  setStatus(pricingStatus, "Form was reset.");
});

for (const input of [
  formElements.goodId,
  formElements.documentDate,
  formElements.quantity,
  formElements.warehouseId
]) {
  input.addEventListener("input", () => {
    input.classList.remove("is-invalid");
    syncUrl();
  });
}

formElements.includeTechnicalFee.addEventListener("change", () => {
  syncUrl();
});

applyUrlState();
searchGoods(searchInput.value);
