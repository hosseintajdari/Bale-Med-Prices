// Patient-facing text for the «قیمت نسخه» (prescription price) module.
// Written for a patient with no pharmacy knowledge: plain words, few lines,
// every number explained by its label. Prices are shown in Rial first with
// Toman in parentheses, Persian digits — the same presentation rule as the
// single-medicine bot answers.

export function formatFaNumber(value) {
  return Math.round(Number(value) || 0).toLocaleString("fa-IR");
}

export function formatPriceLine(amountRial) {
  const rial = formatFaNumber(amountRial);
  const toman = formatFaNumber(amountRial / 10);
  return `${rial} ریال (${toman} تومان)`;
}

export const SERVICE_FEE_LABELS = {
  prescription: "تعرفه‌ی خدمات درمانی (نسخه)",
  free: "تعرفه‌ی خدمات درمانی (خرید آزاد)"
};

function kindWords(kind) {
  return kind === "free"
    ? { basketTitle: "خرید شما", totalLabel: "جمع کل خرید" }
    : { basketTitle: "نسخه‌ی شما", totalLabel: "جمع کل نسخه" };
}

function isValidPrice(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function validServiceFee(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function itemLine(item, index) {
  const price = isValidPrice(item.unitPrice)
    ? formatPriceLine(item.unitPrice)
    : "قیمتش پیدا نشد";
  return `${formatFaNumber(index + 1)}. ${item.title} — ${price}`;
}

export function basketTotals(items, serviceFeeAmount = null) {
  const pricedItems = items.filter((item) => isValidPrice(item.unitPrice));
  const itemsTotal = pricedItems.reduce((sum, item) => sum + item.unitPrice, 0);
  const fee = validServiceFee(serviceFeeAmount);

  return {
    itemsTotal,
    serviceFee: fee,
    grandTotal: itemsTotal + (fee ?? 0),
    pricedCount: pricedItems.length,
    unpricedCount: items.length - pricedItems.length,
    allPriced: items.length > 0 && pricedItems.length === items.length,
    feeKnown: fee != null
  };
}

// Insurer / patient shares, following the Qanun software's own logic
// reconciled with the IHIO (بیمه سلامت) published formula — see
// files/QANUN-INSURANCE-LOGIC-EXTRACT-FA.md:
//   org share = round(committed base × org percent / 100)
//   patient share = base − org share
// applied separately to the drug total and to the services tariff
// (Qanun rounds the insurer's part of each, the patient takes the rest).
// The currency subsidy (یارانه ارزی) stays OUTSIDE the percent
// multiplication in Qanun's accounting: the committed base excludes it
// and the whole subsidy lands on the insurer side — the patient never
// pays it. Prototype assumption: sell price = committed price (diff = 0).
export function insuranceShares({ itemsTotal, serviceFee = null, percent, subsidyTotal = 0 }) {
  const safeItemsTotal =
    typeof itemsTotal === "number" && Number.isFinite(itemsTotal) && itemsTotal > 0
      ? itemsTotal
      : 0;
  const safePercent = Number.isFinite(percent)
    ? Math.min(100, Math.max(0, percent))
    : 0;
  const safeServiceFee = validServiceFee(serviceFee);
  const subsidy = Math.max(0, Math.min(subsidyTotal || 0, safeItemsTotal));
  const base = safeItemsTotal - subsidy;
  const orgDrugs = Math.round((base * safePercent) / 100);
  const orgFee =
    safeServiceFee == null ? null : Math.round((safeServiceFee * safePercent) / 100);

  return {
    percent: safePercent,
    subsidy,
    orgDrugs,
    patientDrugs: base - orgDrugs,
    orgFee,
    patientFee: safeServiceFee == null ? null : safeServiceFee - orgFee,
    orgTotal: orgDrugs + (orgFee ?? 0) + subsidy,
    patientTotal:
      base - orgDrugs + (safeServiceFee == null ? 0 : safeServiceFee - orgFee)
  };
}

// Qanun's per-row subsidy rule: the unit subsidy comes from the
// insurer's commitment config for the item and is capped at the unit
// sell price; the row subsidy is covered-count × unit subsidy.
export function rowSubsidy({ unitSubsidy, unitPrice, coveredCount = 1 }) {
  if (
    !Number.isFinite(unitSubsidy) ||
    !Number.isFinite(unitPrice) ||
    !Number.isFinite(coveredCount)
  ) {
    return 0;
  }
  const unit = Math.max(0, Math.min(unitSubsidy, unitPrice));
  return unit * Math.max(0, coveredCount);
}

export const prescriptionPresenter = {
  basket(items, { final = false, kind = "prescription", serviceFeeAmount = null, shares = null } = {}) {
    const words = kindWords(kind);

    if (!items.length) {
      return {
        text:
          `🧾 ${words.basketTitle} خالی است.\n` +
          "اسم اولین دارو را بنویسید و بفرستید." +
          // A3: the photo-of-prescription hint belongs to prescriptions
          // only — a free purchase has no prescription to photograph.
          (kind === "free" ? "" : "\nاگر اسمش را نمی‌دانید، عکس نسخه را بفرستید."),
        copyReady: true
      };
    }

    const totals = basketTotals(items, serviceFeeAmount);
    const lines = [
      final ? `🧾 قیمت ${words.basketTitle}` : `🧾 ${words.basketTitle} تا اینجا`,
      ...items.map((item, index) => itemLine(item, index)),
      "— — —",
      totals.allPriced
        ? `جمع داروها: ${formatPriceLine(totals.itemsTotal)}`
        : `جمع داروهایی که قیمت دارند: ${formatPriceLine(totals.itemsTotal)}`,
      totals.feeKnown
        ? `${SERVICE_FEE_LABELS[kind]}: ${formatPriceLine(totals.serviceFee)}`
        : `${SERVICE_FEE_LABELS[kind]}: پیدا نشد`
    ];

    if (totals.feeKnown) {
      lines.push(`${words.totalLabel}: ${formatPriceLine(totals.grandTotal)}`);
    } else {
      lines.push(
        `${words.totalLabel} (بدون تعرفه‌ی خدمات): ${formatPriceLine(totals.grandTotal)}`,
        "تعرفه‌ی خدمات در داده‌ی فعلی نیست و در این جمع حساب نشده است."
      );
    }

    if (totals.unpricedCount > 0) {
      lines.push("داروهایی که قیمتشان پیدا نشد، در جمع حساب نشده‌اند.");
    }

    if (shares) {
      if (shares.subsidy > 0) {
        lines.push(`یارانه ارزی: ${formatPriceLine(shares.subsidy)} (این بخش را بیمه می‌دهد)`);
      }
      lines.push(
        `سهم بیمه: ${formatPriceLine(shares.orgTotal)}`,
        `سهم شما: ${formatPriceLine(shares.patientTotal)}`
      );
    }

    if (final) {
      lines.push("قیمت‌ها خوانش زنده از منبع رسمی هستند.");
    } else {
      lines.push("برای داروی بعدی، اسمش را بنویسید. اگر تمام شد، دکمه‌ی «تمام» را بزنید.");
    }

    return { text: lines.join("\n"), copyReady: true };
  },

  notFound(query) {
    return {
      text:
        `دارویی با اسم «${query}» را پیدا نکردم.\n` +
        "اسم کاملش را بنویسید و بفرستید؛ اگر مطمئن نیستید، عکس نسخه را بفرستید.",
      copyReady: true
    };
  }
};
