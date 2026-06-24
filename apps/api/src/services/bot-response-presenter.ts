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
  const lines = [
    `💊 ${result.title}`,
    result.persianTitle,
    `قیمت هر ${patientUnitLabel(result.unitLabel)}: ${formatCurrency(result.consumerUnitPrice)} ریال`,
    `قیمت نهایی: ${formatCurrency(result.finalConsumerPrice)} ریال`,
    `تعداد: ${formatCurrency(result.quantity)}`,
    `بسته‌بندی: ${result.packLabel}`,
    `منبع قیمت: ${result.sourceHints.map((source) => source.label).join("، ")}`
  ];

  if (result.warnings.length > 0) {
    lines.push(`هشدار: ${result.warnings.join(" | ")}`);
  }

  return lines.join("\n");
}

function buildChoiceLine(choice) {
  return `- ${choice.label}${choice.description ? ` | ${choice.description}` : ""}`;
}

function buildSelectionText(query, selection) {
  const lines = [
    `Search: ${query}`,
    `I found ${selection.items?.length ?? selection.choices.length} matching medicines.`,
    selection.prompt ?? "Reply with one id from the list below:",
    ...selection.choices.map(buildChoiceLine)
  ];

  if (selection.items?.length > 5) {
    lines.push("More matches exist. Narrow the search query.");
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
      copyReady: true,
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
