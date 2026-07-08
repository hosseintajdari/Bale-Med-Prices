const searchInput = document.querySelector("#search-input");
const searchStatus = document.querySelector("#search-status");
const searchResults = document.querySelector("#search-results");
const pricingForm = document.querySelector("#pricing-form");
const recalculateButton = document.querySelector("#recalculate-button");
const resetButton = document.querySelector("#reset-button");
const selectedGood = document.querySelector("#selected-good");
const pricingStatus = document.querySelector("#pricing-status");
const pricingResult = document.querySelector("#pricing-result");
const formHints = document.querySelector("#form-hints");

const formElements = {
  goodId: document.querySelector("#good-id"),
  documentDate: document.querySelector("#document-date"),
  quantity: document.querySelector("#quantity")
};

const UNIT_LABELS = {
  bottle: "شربت",
  capsule: "کپسول",
  softgel: "سافت‌ژل",
  suppository: "شیاف",
  tablet: "قرص",
  tube: "تیوب"
};

const state = {
  query: "",
  sessionId: "",
  resolvedGoodId: "",
  pricing: null,
  lookupInFlight: false,
  restoredFromUrl: false
};

function patientUnitLabel(unitLabel) {
  return UNIT_LABELS[unitLabel] ?? unitLabel ?? "واحد";
}

function formatCurrency(value) {
  if (value == null) {
    return "نامشخص";
  }

  return new Intl.NumberFormat("fa-IR").format(value);
}

function lookupParams() {
  const params = new URLSearchParams({
    format: "web",
    q: searchInput.value.trim(),
    documentDate: formElements.documentDate.value.trim(),
    quantity: formElements.quantity.value.trim() || "1",
    warehouseId: "main",
    includeTechnicalFee: "on"
  });

  return params;
}

function selectParams(sessionId, choiceId) {
  const params = lookupParams();
  params.set("sessionId", sessionId);
  params.set("choiceId", choiceId);
  return params;
}

function buildUrlFromState() {
  const params = new URLSearchParams();
  const query = searchInput.value.trim();
  const goodId = formElements.goodId.value.trim();
  const documentDate = formElements.documentDate.value.trim();
  const quantity = formElements.quantity.value.trim();

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

  searchInput.value = searchQuery;
  formElements.goodId.value = goodId;
  formElements.documentDate.value = documentDate;
  formElements.quantity.value = quantity;

  state.query = searchQuery;
  state.resolvedGoodId = goodId;
  state.restoredFromUrl = true;
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

function renderHints(messages) {
  formHints.innerHTML = messages
    .map((message) => `<div class="hint-chip">${message}</div>`)
    .join("");
}

function updateSelectedGoodCard(pricing) {
  if (!pricing) {
    selectedGood.classList.add("is-hidden");
    selectedGood.innerHTML = "";
    return;
  }

  selectedGood.innerHTML = `
    <strong>${pricing.persianTitle || pricing.title}</strong>
    <div class="selected-line">${pricing.title}</div>
    <div class="selected-line">${pricing.packLabel ?? ""}</div>
  `;
  selectedGood.classList.remove("is-hidden");
}

function resetFormState() {
  state.sessionId = "";
  state.resolvedGoodId = "";
  state.pricing = null;
  state.query = "";
  formElements.goodId.value = "";
  formElements.documentDate.value = "2026-06-24";
  formElements.quantity.value = "1";
  searchInput.value = "";
  pricingResult.innerHTML = "";
  searchResults.innerHTML = "";
  setStatus(searchStatus, "");
  setStatus(pricingStatus, "");
  renderHints([]);
  updateSelectedGoodCard(null);
  clearValidationState();
  recalculateButton.disabled = true;
  syncUrl();
}

async function readJson(response) {
  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error ?? "درخواست ناموفق بود");
  }

  return payload;
}

function renderSelectionStep(payload) {
  searchResults.innerHTML = "";

  const prompt = document.createElement("p");
  prompt.className = "selection-prompt";
  prompt.textContent = payload.prompt ?? "یک گزینه را انتخاب کنید";
  searchResults.append(prompt);

  for (const choice of payload.choices ?? []) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "search-card selection-choice";
    button.innerHTML = `
      <strong>${choice.label}</strong>
      ${choice.description ? `<span class="meta">${choice.description}</span>` : ""}
    `;

    button.addEventListener("click", () => {
      continueSelection(payload.sessionId, choice.id);
    });

    searchResults.append(button);
  }

  state.sessionId = payload.sessionId ?? "";
}

function renderMessagePanel(message, isError = false) {
  searchResults.innerHTML = "";
  const panel = document.createElement("p");
  panel.className = `status-text${isError ? " is-error" : ""}`;
  panel.textContent = message;
  searchResults.append(panel);
}

function renderPricingResult(pricing) {
  const unitPriceLabel = pricing.unitPriceLabel ?? `قیمت هر ${patientUnitLabel(pricing.unitLabel)}`;
  const metrics = [
    [unitPriceLabel, `${formatCurrency(pricing.consumerUnitPrice)} ریال`],
    ["قیمت نهایی", `${formatCurrency(pricing.finalConsumerPrice)} ریال`]
  ];

  if (Number(pricing.quantity) > 1) {
    metrics.push(["جمع برای تعداد درخواستی", `${formatCurrency(pricing.consumerTotalPrice)} ریال`]);
  }

  pricingResult.innerHTML = metrics
    .map(
      ([label, value], index) => `
        <div class="metric-card ${index === 0 ? "featured" : ""}">
          <span>${label}</span>
          <strong>${value}</strong>
        </div>
      `
    )
    .join("");

  const warnings = pricing.warnings?.length
    ? `<div class="warning-list">${pricing.warnings
        .map((warning) => `<div class="warning-chip">${warning}</div>`)
        .join("")}</div>`
    : "";

  pricingResult.innerHTML += `
    <div class="rules-card">
      <strong>${pricing.persianTitle || pricing.title}</strong>
      <div><span>نام انگلیسی</span>${pricing.englishTitle ?? pricing.title}</div>
      <div><span>بسته‌بندی</span>${pricing.packLabel ?? "نامشخص"}</div>
      <div><span>تعداد</span>${formatCurrency(pricing.quantity)}</div>
      <div class="source-list">
        ${(pricing.sourceHints ?? [])
          .map((source) => `<div class="source-chip">${source.label}</div>`)
          .join("")}
      </div>
      ${warnings}
    </div>
  `;
}

function applyResolvedResult(payload) {
  const pricing = payload.pricing;

  if (!pricing) {
    setStatus(pricingStatus, "قیمت در دسترس نیست.", true);
    return;
  }

  state.resolvedGoodId = payload.goodId;
  state.pricing = pricing;
  state.sessionId = "";
  formElements.goodId.value = payload.goodId;
  updateSelectedGoodCard(pricing);
  renderPricingResult(pricing);
  searchResults.innerHTML = "";
  setStatus(searchStatus, "دارو مشخص شد.");
  setStatus(pricingStatus, "قیمت آماده است.");
  renderHints(["در صورت نیاز تعداد یا تاریخ را تغییر دهید و قیمت را بروزرسانی کنید."]);
  recalculateButton.disabled = false;
  syncUrl();
}

function handleLookupResponse(payload) {
  if (payload.type === "resolved") {
    applyResolvedResult(payload);
    return;
  }

  if (
    payload.type === "needs_form_selection" ||
    payload.type === "needs_strength_selection" ||
    payload.type === "needs_identity_selection"
  ) {
    renderSelectionStep(payload);
    pricingResult.innerHTML = "";
    updateSelectedGoodCard(null);
    recalculateButton.disabled = true;
    setStatus(searchStatus, "برای ادامه یک گزینه را انتخاب کنید.");
    setStatus(pricingStatus, "");
    renderHints(["قیمت پس از مشخص شدن شکل و دوز دارو نمایش داده می‌شود."]);
    return;
  }

  if (payload.type === "not_found") {
    renderMessagePanel(payload.message, true);
    setStatus(searchStatus, payload.message, true);
    pricingResult.innerHTML = "";
    updateSelectedGoodCard(null);
    recalculateButton.disabled = true;
    return;
  }

  if (payload.type === "refine_search") {
    renderMessagePanel(payload.message);
    setStatus(searchStatus, payload.message);
    pricingResult.innerHTML = "";
    recalculateButton.disabled = true;
    return;
  }

  if (payload.type === "expired_selection" || payload.type === "invalid_selection") {
    renderMessagePanel(payload.message, true);
    setStatus(searchStatus, payload.message, true);
    state.sessionId = "";
    recalculateButton.disabled = true;
    return;
  }
}

async function lookupMedicine(query) {
  const trimmedQuery = query.trim();
  state.query = trimmedQuery;

  if (!trimmedQuery) {
    searchResults.innerHTML = "";
    setStatus(searchStatus, "نام دارو را وارد کنید.");
    return;
  }

  state.lookupInFlight = true;
  setStatus(searchStatus, "در حال جستجو...");

  try {
    const response = await fetch(`/bot/lookup?${lookupParams().toString()}`);
    const payload = await readJson(response);
    handleLookupResponse(payload);
  } catch (error) {
    renderMessagePanel(error.message ?? "جستجو ناموفق بود", true);
    setStatus(searchStatus, error.message ?? "جستجو ناموفق بود", true);
  } finally {
    state.lookupInFlight = false;
  }
}

async function continueSelection(sessionId, choiceId) {
  setStatus(searchStatus, "در حال پردازش انتخاب...");

  try {
    const response = await fetch(`/bot/select?${selectParams(sessionId, choiceId).toString()}`);
    const payload = await readJson(response);
    handleLookupResponse(payload);
  } catch (error) {
    setStatus(searchStatus, error.message ?? "انتخاب ناموفق بود", true);
  }
}

function validateRecalculateForm() {
  clearValidationState();

  const errors = [];
  const goodId = formElements.goodId.value.trim();
  const date = formElements.documentDate.value.trim();
  const quantity = Number(formElements.quantity.value);

  if (!goodId) {
    errors.push("ابتدا دارو را از طریق جستجو انتخاب کنید.");
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    errors.push("تاریخ باید به شکل YYYY-MM-DD باشد.");
    formElements.documentDate.classList.add("is-invalid");
  }

  if (!Number.isFinite(quantity) || quantity <= 0) {
    errors.push("تعداد باید عدد مثبت باشد.");
    formElements.quantity.classList.add("is-invalid");
  }

  return errors;
}

async function recalculatePrice() {
  const errors = validateRecalculateForm();

  if (errors.length > 0) {
    setStatus(pricingStatus, errors[0], true);
    renderHints(errors.slice(1));
    return;
  }

  recalculateButton.disabled = true;
  recalculateButton.textContent = "در حال محاسبه...";
  setStatus(pricingStatus, "");

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
        warehouseId: "main",
        includeTechnicalFee: true
      })
    });

    const payload = await readJson(response);
    const pricing = {
      goodId: payload.goodId,
      title: payload.title,
      persianTitle: payload.persianTitle,
      englishTitle: payload.englishTitle,
      unitLabel: payload.unitLabel,
      packLabel: payload.packLabel,
      quantity: payload.quantity,
      consumerUnitPrice: payload.consumerUnitPrice,
      consumerTotalPrice: payload.consumerTotalPrice,
      finalConsumerPrice: payload.finalConsumerPrice,
      sourceHints: payload.sourceHints,
      warnings: payload.warnings,
      unitPriceLabel: `قیمت هر ${patientUnitLabel(payload.unitLabel)}`
    };

    state.pricing = pricing;
    renderPricingResult(pricing);
    updateSelectedGoodCard(pricing);
    setStatus(pricingStatus, "قیمت بروزرسانی شد.");
    syncUrl();
  } catch (error) {
    setStatus(pricingStatus, error.message ?? "محاسبه قیمت ناموفق بود", true);
  } finally {
    recalculateButton.disabled = false;
    recalculateButton.textContent = "بروزرسانی قیمت";
  }
}

let searchTimer = null;

searchInput.addEventListener("input", (event) => {
  state.query = event.target.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    syncUrl();
    lookupMedicine(event.target.value);
  }, 220);
});

pricingForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  await recalculatePrice();
});

resetButton.addEventListener("click", () => {
  resetFormState();
  setStatus(pricingStatus, "فرم پاک شد.");
});

for (const input of [formElements.documentDate, formElements.quantity]) {
  input.addEventListener("input", () => {
    input.classList.remove("is-invalid");
    syncUrl();
  });
}

applyUrlState();

if (searchInput.value.trim()) {
  lookupMedicine(searchInput.value);
}
