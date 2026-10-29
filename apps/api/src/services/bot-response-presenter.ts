import {
  formatPriceFa,
  formatUpdateLine,
  toPersianDigits
} from "../../../../packages/domain/src/format-price.ts";

function formatCurrency(value) {
  if (value == null) {
    return "نامشخص";
  }

  return new Intl.NumberFormat("fa-IR").format(value);
}

function patientUnitLabel(unitLabel) {
  const labels = {
    bottle: "شربت",
    capsule: "کپسول",
    softgel: "سافت‌ژل",
    suppository: "شیاف",
    tablet: "قرص",
    tube: "تیوب"
  };

  return labels[unitLabel] ?? unitLabel ?? "واحد";
}

function buildPricingText(result) {
  // Doctor-grade contract, same as the bot price blocks (review C2):
  // one name, one primary price (rial + toman parens), the UPDATE DATE
  // instead of the intermediary's name (prices are updated in TTAC).
  // The unexplained second «قیمت نهایی», «تعداد: ۱» and pack noise of the
  // internal workbench do not belong in a patient/bot answer; a total is
  // shown only when a quantity > 1 was actually requested.
  const lines = [
    result.persianTitle || result.title,
    `قیمت هر ${patientUnitLabel(result.unitLabel)}: ${formatPriceFa(result.consumerUnitPrice)}`
  ];

  const quantity = Number(result.quantity ?? 1);
  if (Number.isFinite(quantity) && quantity > 1) {
    lines.push(`تعداد: ${toPersianDigits(quantity)} — جمع: ${formatPriceFa(result.finalConsumerPrice)}`);
  }

  lines.push(formatUpdateLine(result.documentDate));

  if (result.warnings.length > 0) {
    lines.push(`هشدار: ${result.warnings.join(" | ")}`);
  }

  return lines.join("\n");
}

function buildChoiceLine(choice) {
  return `- ${choice.label}${choice.description ? ` | ${choice.description}` : ""}`;
}

function buildSelectionText(query, selection) {
  // Persian, like every other user-facing text (review C3) — the API must
  // not speak English to this product's users, and nobody replies "with
  // an id": they tap a button or type a name.
  const count = selection.items?.length ?? selection.choices.length;
  const lines = [
    `🔍 ${query}`,
    `${toPersianDigits(count)} دارو پیدا شد.`,
    selection.prompt ?? "یکی را انتخاب کنید:",
    ...selection.choices.map(buildChoiceLine)
  ];

  if (selection.items?.length > 5) {
    lines.push("نتیجه‌های بیشتری هم هست؛ جستجو را دقیق‌تر کنید.");
  }

  return lines.join("\n");
}

function buildSelectionChoice(choice, sessionId) {
  return {
    id: choice.id,
    label: choice.label,
    description: choice.description,
    value: choice.value ?? {},
    sessionId
  };
}

function buildTelegramButton(choice, sessionId) {
  return {
    text: choice.label,
    callback_data: `ms:${sessionId}:${choice.id}`
  };
}

function toPricingPresentation(result) {
  return {
    text: buildPricingText(result),
    parseMode: "plain_text",
    copyReady: true
  };
}

export const botResponsePresenter = {
  pricing(result) {
    return toPricingPresentation(result);
  },

  compactPricing(result) {
    const pricing = toPricingPresentation(result);

    return {
      goodId: result.goodId,
      text: pricing.text,
      parseMode: pricing.parseMode,
      copyReady: pricing.copyReady,
      sourceHints: result.sourceHints,
      warnings: result.warnings
    };
  },

  selection(selection) {
    const choices = selection.choices ?? [];

    return {
      type: selection.type,
      query: selection.query,
      total: selection.total ?? selection.items?.length ?? choices.length,
      sessionId: selection.sessionId,
      text: buildSelectionText(selection.query, selection),
      copyReady: false,
      items: (selection.items ?? []).slice(0, 5).map((item) => ({
        id: item.id,
        title: item.title,
        persianTitle: item.persianTitle,
        unitLabel: item.unitLabel,
        dosageForm: item.dosageForm,
        routeQualifier: item.routeQualifier,
        strengthLabel: item.strengthLabel,
        patientFormLabel: item.patientFormLabel,
        packageDescription: item.packageDescription
      })),
      selection: {
        kind: "single_choice",
        prompt: selection.prompt,
        sessionId: selection.sessionId,
        choices: choices.map((choice) => buildSelectionChoice(choice, selection.sessionId))
      },
      telegram: {
        replyMarkup: {
          inline_keyboard: choices.map((choice) => [buildTelegramButton(choice, selection.sessionId)])
        }
      }
    };
  }
};
