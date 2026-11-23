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

function itemLine(item, index) {
  const price =
    item.unitPrice == null ? "قیمتش پیدا نشد" : formatPriceLine(item.unitPrice);
  return `${formatFaNumber(index + 1)}. ${item.title} — ${price}`;
}

export function basketTotals(items, serviceFeeAmount = null) {
  const pricedItems = items.filter((item) => item.unitPrice != null);
  const itemsTotal = pricedItems.reduce((sum, item) => sum + item.unitPrice, 0);
  const fee = serviceFeeAmount ?? null;

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

export const prescriptionPresenter = {
  basket(items, { final = false, kind = "prescription", serviceFeeAmount = null } = {}) {
    const words = kindWords(kind);

    if (!items.length) {
      return {
        text:
          `🧾 ${words.basketTitle} خالی است.\n` +
          "اسم اولین دارو را بنویسید و بفرستید.\n" +
          "اگر اسمش را نمی‌دانید، عکس نسخه را بفرستید.",
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
