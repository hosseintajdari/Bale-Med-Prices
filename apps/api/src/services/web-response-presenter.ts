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

function buildPatientPricing(pricing) {
  return {
    goodId: pricing.goodId,
    title: pricing.title,
    persianTitle: pricing.persianTitle,
    englishTitle: pricing.englishTitle,
    unitLabel: pricing.unitLabel,
    packLabel: pricing.packLabel,
    quantity: pricing.quantity,
    consumerUnitPrice: pricing.consumerUnitPrice,
    consumerTotalPrice: pricing.consumerTotalPrice,
    finalConsumerPrice: pricing.finalConsumerPrice,
    sourceHints: pricing.sourceHints,
    warnings: pricing.warnings,
    unitPriceLabel: `قیمت هر ${patientUnitLabel(pricing.unitLabel)}`
  };
}

function adaptSelection(response) {
  const choices = response.selection?.choices ?? [];

  return {
    type: response.type,
    query: response.query,
    total: response.total,
    sessionId: response.sessionId,
    prompt: response.selection?.prompt ?? response.prompt,
    choices: choices.map((choice) => ({
      id: choice.id,
      label: choice.label,
      description: choice.description
    }))
  };
}

function adaptResolved(response) {
  return {
    type: response.type,
    query: response.query,
    goodId: response.goodId,
    pricing: response.pricing,
    sourceHints: response.sourceHints,
    warnings: response.warnings,
    moreInfo: response.moreInfo
  };
}

export const webResponsePresenter = {
  patientUnitLabel,
  buildPatientPricing,

  adapt(response) {
    if (response.type === "resolved") {
      return adaptResolved(response);
    }

    if (
      response.type === "needs_form_selection" ||
      response.type === "needs_strength_selection" ||
      response.type === "needs_identity_selection"
    ) {
      return adaptSelection(response);
    }

    if (response.type === "not_found") {
      return {
        type: response.type,
        query: response.query,
        message: `دارویی با این نام پیدا نشد: ${response.query}`
      };
    }

    if (response.type === "refine_search") {
      return {
        type: response.type,
        query: response.query,
        message: response.text ?? "نام کامل‌تر دارو یا دوز را بفرستید."
      };
    }

    if (response.type === "expired_selection" || response.type === "invalid_selection") {
      return {
        type: response.type,
        message: response.text
      };
    }

    return response;
  }
};
