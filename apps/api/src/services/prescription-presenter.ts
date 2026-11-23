// Patient-facing text for the «قیمت نسخه» (prescription price) module.
// Prices are shown in Rial first with Toman in parentheses, Persian digits —
// the same presentation rule as the single-medicine bot answers.

export function formatFaNumber(value) {
  return Math.round(Number(value) || 0).toLocaleString("fa-IR");
}

export function formatPriceLine(amountRial) {
  const rial = formatFaNumber(amountRial);
  const toman = formatFaNumber(amountRial / 10);
  return `${rial} ریال (${toman} تومان)`;
}

function itemLine(item, index) {
  const price =
    item.unitPrice == null
      ? "قیمت رسمی در دسترس نیست"
      : formatPriceLine(item.unitPrice);
  return `${formatFaNumber(index + 1)}. ${item.title} — ${price}`;
}

export function basketTotals(items) {
  const pricedItems = items.filter((item) => item.unitPrice != null);
  const total = pricedItems.reduce((sum, item) => sum + item.unitPrice, 0);

  return {
    total,
    pricedCount: pricedItems.length,
    unpricedCount: items.length - pricedItems.length,
    allPriced: items.length > 0 && pricedItems.length === items.length
  };
}

export const prescriptionPresenter = {
  basket(items, { final = false } = {}) {
    if (!items.length) {
      return {
        text: "🧾 سبد نسخه خالی است.\nنام اولین داروی نسخه را بفرستید.",
        copyReady: true
      };
    }

    const totals = basketTotals(items);
    const lines = [
      final ? "🧾 قیمت نسخه‌ی شما" : "🧾 نسخه‌ی شما تا اینجا",
      ...items.map((item, index) => itemLine(item, index)),
      "— — —"
    ];

    if (totals.allPriced) {
      lines.push(`جمع کل نسخه: ${formatPriceLine(totals.total)}`);
    } else {
      lines.push(
        `جمع اقلام قیمت‌دار: ${formatPriceLine(totals.total)}`,
        "برای بعضی اقلام قیمت رسمی در دسترس نیست؛ آن‌ها در جمع حساب نشده‌اند."
      );
    }

    if (final) {
      lines.push("قیمت‌ها خوانش زنده از منبع رسمی هستند.");
    }

    return { text: lines.join("\n"), copyReady: true };
  },

  notFound(query) {
    return {
      text:
        `دارویی با نام «${query}» پیدا نشد.\n` +
        "نام کامل‌تر یا دوز دارو را بفرستید؛ اگر مطمئن نیستید، می‌توانید عکس نسخه را بفرستید.",
      copyReady: true
    };
  }
};
