import { goodsService } from "./goods-service.ts";
import { selectionHistoryStore } from "./selection-history-store.ts";
import { selectionSessionStore } from "./selection-session-store.ts";

const FORM_ALIASES = new Map([
  ["tablet", ["tablet", "tab", "قرص"]],
  ["capsule", ["capsule", "cap", "کپسول"]],
  ["softgel", ["softgel", "سافت‌ژل", "سافت ژل"]],
  ["syrup", ["syrup", "شربت"]],
  ["drop", ["drop", "drops", "قطره"]],
  ["ointment", ["ointment", "پماد"]],
  ["cream", ["cream", "کرم"]],
  ["suppository", ["suppository", "supp", "شیاف"]],
  ["injection", ["injection", "ampule", "ampoule", "آمپول", "تزریقی"]]
]);

const QUALIFIER_ALIASES = new Map([
  ["ophthalmic", ["ophthalmic", "eye", "چشمی"]],
  ["otic", ["otic", "ear", "گوشی"]],
  ["nasal", ["nasal", "nose", "بینی"]],
  ["oral", ["oral", "خوراکی"]],
  ["rectal", ["rectal", "رکتال", "مقعدی"]],
  ["topical", ["topical", "پوستی", "موضعی"]],
  ["sublingual", ["sublingual", "زیرزبانی", "زیر زبانی"]]
]);

const UNKNOWN_CHOICE = {
  id: "unknown",
  label: "مطمئن نیستم",
  description: "با مشخصات ساده‌تر ادامه بده",
  value: {
    unknownUnit: true
  }
};

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function includesAny(query, values) {
  const normalizedQuery = normalize(query);
  return values.some((value) => normalizedQuery.includes(normalize(value)));
}

function findExplicitKeys(query, aliases) {
  return [...aliases.entries()]
    .filter(([, values]) => includesAny(query, values))
    .map(([key]) => key);
}

function formKeyFor(item) {
  return item.dosageForm ?? item.unitLabel ?? "unknown";
}

function qualifierKeyFor(item) {
  return item.routeQualifier ?? "";
}

function patientFormLabelFor(item) {
  return item.patientFormLabel ?? item.unitLabel ?? item.dosageForm ?? "دارو";
}

function patientFormKeyFor(item) {
  return [formKeyFor(item), qualifierKeyFor(item)].filter(Boolean).join(":");
}

function strengthKeyFor(item) {
  return item.strengthLabel ?? "";
}

function optionLabelFor(item) {
  return [
    item.persianTitle || item.title,
    patientFormLabelFor(item),
    item.strengthLabel,
    item.packageDescription
  ]
    .filter(Boolean)
    .join(" | ");
}

function uniqueBy(items, keySelector) {
  const seen = new Set();
  const uniqueItems = [];

  for (const item of items) {
    const key = keySelector(item);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    uniqueItems.push(item);
  }

  return uniqueItems;
}

function scoreItem(query, item, explicitFormKeys, explicitQualifierKeys) {
  let score = 0;

  if (explicitFormKeys.includes(formKeyFor(item))) {
    score += 100;
  }

  if (explicitQualifierKeys.includes(qualifierKeyFor(item))) {
    score += 80;
  }

  if (item.activeStatus === "active") {
    score += 20;
  }

  score += selectionHistoryStore.getSelectionCount(query, item.id) * 10;

  if (item.strengthLabel) {
    score += 2;
  }

  if (item.packageDescription || item.packLabel) {
    score += 1;
  }

  return score;
}

function rankItems(query, items) {
  const explicitFormKeys = findExplicitKeys(query, FORM_ALIASES);
  const explicitQualifierKeys = findExplicitKeys(query, QUALIFIER_ALIASES);

  return items
    .slice()
    .sort(
      (left, right) =>
        scoreItem(query, right, explicitFormKeys, explicitQualifierKeys) -
        scoreItem(query, left, explicitFormKeys, explicitQualifierKeys)
    );
}

function compactChoices(choices) {
  const primaryChoices = choices.slice(0, 5);

  if (choices.length > 5) {
    primaryChoices.push({
      id: "refine",
      label: "جستجوی دقیق‌تر",
      description: "نام کامل‌تر یا دوز را بفرستید",
      value: {
        refineSearch: true
      }
    });
  }

  return primaryChoices;
}

function createFormSelection(query, items) {
  const sessionId = selectionSessionStore.create({ query, items });
  const formChoices = uniqueBy(items, patientFormKeyFor).map((item) => ({
    id: `form:${patientFormKeyFor(item)}`,
    label: patientFormLabelFor(item),
    description: "انتخاب شکل دارو",
    value: {
      sessionId,
      formKey: patientFormKeyFor(item),
      dosageForm: formKeyFor(item),
      routeQualifier: qualifierKeyFor(item) || null
    }
  }));

  return {
    type: "needs_form_selection",
    query,
    sessionId,
    prompt: "شکل دارو را انتخاب کنید",
    choices: [...compactChoices(formChoices), UNKNOWN_CHOICE],
    items
  };
}

function createStrengthSelection(query, items) {
  const sessionId = selectionSessionStore.create({ query, items });
  const strengthChoices = uniqueBy(items, strengthKeyFor).map((item) => ({
    id: `strength:${strengthKeyFor(item)}`,
    label: item.strengthLabel,
    description: "انتخاب دوز دارو",
    value: {
      sessionId,
      strengthLabel: item.strengthLabel
    }
  }));

  return {
    type: "needs_strength_selection",
    query,
    sessionId,
    prompt: "دوز دارو را انتخاب کنید",
    choices: compactChoices(strengthChoices),
    items
  };
}

function createIdentitySelection(query, items) {
  const sessionId = selectionSessionStore.create({ query, items });
  const identityChoices = items.map((item) => ({
    id: `good:${item.id}`,
    label: optionLabelFor(item),
    description: item.packageDescription ?? item.packLabel ?? "انتخاب دارو",
    value: {
      sessionId,
      goodId: item.id
    }
  }));

  return {
    type: "needs_identity_selection",
    query,
    sessionId,
    prompt: "داروی مورد نظر را انتخاب کنید",
    choices: compactChoices(identityChoices),
    items
  };
}

function resolveNextStep(query, items) {
  if (items.length === 0) {
    return {
      type: "not_found",
      query
    };
  }

  if (items.length === 1) {
    return {
      type: "resolved",
      query,
      goodId: items[0].id,
      item: items[0]
    };
  }

  const explicitFormKeys = findExplicitKeys(query, FORM_ALIASES);
  const explicitQualifierKeys = findExplicitKeys(query, QUALIFIER_ALIASES);
  let candidateItems = items;

  if (explicitFormKeys.length > 0) {
    candidateItems = candidateItems.filter((item) => explicitFormKeys.includes(formKeyFor(item)));
  }

  if (explicitQualifierKeys.length > 0) {
    candidateItems = candidateItems.filter((item) =>
      explicitQualifierKeys.includes(qualifierKeyFor(item))
    );
  }

  if (candidateItems.length === 1) {
    return {
      type: "resolved",
      query,
      goodId: candidateItems[0].id,
      item: candidateItems[0]
    };
  }

  const formCount = new Set(candidateItems.map(patientFormKeyFor)).size;
  if (formCount > 1) {
    return createFormSelection(query, candidateItems);
  }

  const strengths = candidateItems.map(strengthKeyFor).filter(Boolean);
  if (new Set(strengths).size > 1) {
    return createStrengthSelection(query, candidateItems);
  }

  return createIdentitySelection(query, candidateItems);
}

function finalizeSelectionIfResolved(result, sessionId) {
  if (result.type !== "resolved") {
    return result;
  }

  selectionSessionStore.close(sessionId);
  return result;
}

export const medicineSelectionService = {
  start(input) {
    const query = (input.query ?? "").trim();
    const searchResult = goodsService.search({ query });
    const rankedItems = rankItems(query, searchResult.items);

    return {
      query,
      total: searchResult.total,
      ...resolveNextStep(query, rankedItems)
    };
  },

  continue(input) {
    const session = selectionSessionStore.get(input.sessionId);

    if (!session) {
      return {
        type: "expired_selection",
        text: "این جستجو قدیمی شده. لطفاً نام دارو را دوباره بفرستید."
      };
    }

    const { query, items } = session.data;
    const choiceId = input.choiceId;

    if (choiceId === "unknown") {
      return createIdentitySelection(query, items);
    }

    if (choiceId === "refine") {
      return {
        type: "refine_search",
        query,
        text: "نام کامل‌تر دارو یا دوز را بفرستید."
      };
    }

    if (choiceId.startsWith("form:")) {
      const formKey = choiceId.slice("form:".length);
      return finalizeSelectionIfResolved(
        resolveNextStep(
          query,
          items.filter((item) => patientFormKeyFor(item) === formKey)
        ),
        input.sessionId
      );
    }

    if (choiceId.startsWith("strength:")) {
      const strength = choiceId.slice("strength:".length);
      return finalizeSelectionIfResolved(
        resolveNextStep(
          query,
          items.filter((item) => strengthKeyFor(item) === strength)
        ),
        input.sessionId
      );
    }

    if (choiceId.startsWith("good:")) {
      const goodId = choiceId.slice("good:".length);
      const item = items.find((candidate) => candidate.id === goodId);

      if (!item) {
        return {
          type: "not_found",
          query
        };
      }

      selectionSessionStore.close(input.sessionId);

      return {
        type: "resolved",
        query,
        goodId,
        item
      };
    }

    return {
      type: "invalid_selection",
      text: "انتخاب نامعتبر است. لطفاً نام دارو را دوباره بفرستید."
    };
  }
};
